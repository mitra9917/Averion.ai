"""Provider-agnostic interface for generating chat answers."""

from app.core.config import settings
from app.ai.provider_utils import (
    ProviderConfigurationError,
    ProviderRequestError,
    provider_failure_message,
    run_with_retries,
)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_DEFAULT_CHAT_MODEL = "llama-3.1-8b-instant"
GROQ_FALLBACK_CHAT_MODELS = (
    "llama-3.3-70b-versatile",
    "meta-llama/llama-4-scout-17b-16e-instruct",
)
OPENAI_DEFAULT_CHAT_MODEL = "gpt-4o-mini"


def _get_openai_client_class():
    from openai import OpenAI

    return OpenAI


def generate_answer(prompt: str, chunks: list[dict] | None = None) -> str:
    """
    Generate an answer using the configured LLM provider.
    
    Args:
        prompt: The complete prompt string (already built using RAG prompt builder)
        chunks: Retrieved chunks for context (used by mock provider)
        
    Returns:
        Final answer string from the LLM
        
    Raises:
        AIProviderError: If the configured provider cannot generate an answer
        
    Security:
        - ONLY passes the generated prompt to the LLM
        - Does NOT pass database_url, raw database records, or internal config
    """
    # Validate input
    if not prompt or not prompt.strip():
        return "I cannot provide an answer without a valid question."
    
    # Route to appropriate provider
    provider = settings.llm_provider.lower()
    
    if provider in {"openai", "groq"}:
        return _call_openai_compatible_chat(prompt, provider)
    if provider == "mock":
        return _call_mock(prompt, chunks or [])
    raise ProviderConfigurationError(
        "Unsupported chat provider configured.",
        provider=provider
    )


def _call_openai_compatible_chat(prompt: str, provider: str) -> str:
    """Call an OpenAI-compatible chat provider."""
    if not settings.llm_provider_api_key:
        raise ProviderConfigurationError(
            "Chat provider is not configured.",
            provider=provider
        )

    try:
        OpenAI = _get_openai_client_class()
    except ImportError as exc:
        raise ProviderConfigurationError(
            "OpenAI-compatible client is not installed.",
            provider=provider
        ) from exc

    base_url = settings.llm_provider_base_url
    if provider == "groq" and not base_url:
        base_url = GROQ_BASE_URL

    client_kwargs = {
        "api_key": settings.llm_provider_api_key,
        "timeout": settings.llm_provider_timeout_seconds,
        "max_retries": 0
    }
    if base_url:
        client_kwargs["base_url"] = base_url

    client = OpenAI(**client_kwargs)

    candidate_models = get_chat_model_candidates(provider)

    for model_index, model_name in enumerate(candidate_models):
        def operation() -> str:
            response = client.chat.completions.create(
                model=model_name,
                messages=[{"role": "user", "content": prompt}],
                temperature=settings.llm_temperature,
                max_tokens=settings.llm_max_tokens
            )
            answer = response.choices[0].message.content
            if not answer:
                raise ProviderRequestError(
                    provider_failure_message("AI provider"),
                    provider=provider
                )
            return answer.strip()

        try:
            return run_with_retries(
                operation,
                provider=provider,
                attempts=settings.llm_provider_max_retries + 1,
                public_message=provider_failure_message("AI provider")
            )
        except ProviderRequestError:
            if model_index == len(candidate_models) - 1:
                raise

    raise ProviderRequestError(
        provider_failure_message("AI provider"),
        provider=provider
    )


def get_chat_model_candidates(provider: str | None = None) -> list[str]:
    model_name = get_chat_model_name(provider)
    normalized_provider = (provider or settings.llm_provider).lower()

    if normalized_provider != "groq":
        return [model_name]

    candidates = [model_name]
    for fallback_model in GROQ_FALLBACK_CHAT_MODELS:
        if fallback_model not in candidates:
            candidates.append(fallback_model)
    return candidates


def get_chat_model_name(provider: str | None = None) -> str:
    """Return a provider-compatible chat model.

    This keeps production resilient when Groq is selected but an OpenAI model
    name is missing or accidentally left in the environment.
    """
    normalized_provider = (provider or settings.llm_provider).lower()
    configured_model = (settings.llm_model_name or "").strip()

    if normalized_provider == "groq" and (
        not configured_model or configured_model == OPENAI_DEFAULT_CHAT_MODEL
    ):
        return GROQ_DEFAULT_CHAT_MODEL

    if not configured_model:
        return OPENAI_DEFAULT_CHAT_MODEL

    return configured_model


def _call_mock(prompt: str, chunks: list[dict]) -> str:
    """
    Mock provider for testing without API calls.
    
    NOTE: This is a VERY LIMITED mock. For production use, set LLM_PROVIDER=openai
    Mock cannot truly understand context, summarize, or reason about content.
    
    Args:
        prompt: The complete prompt string
        chunks: Retrieved chunks for context
        
    Returns:
        Mock answer based on the prompt and context
    """
    # Extract question from prompt
    lines = prompt.split("\n")
    question = ""
    
    for i, line in enumerate(lines):
        if line.strip() == "Question:":
            if i + 1 < len(lines):
                question = lines[i + 1].strip()
                break
    
    if not chunks:
        return f"I don't have enough information to answer '{question}'. Please upload relevant documents first."
    
    # Get ALL text from ALL chunks
    all_text = " ".join([chunk.get("text", "").strip() for chunk in chunks])
    
    # Split into sentences
    sentences = [s.strip() for s in all_text.split(".") if s.strip()]
    
    question_lower = question.lower()
    
    # Extract key terms from question (ignore common words)
    ignore_words = {"what", "is", "are", "the", "of", "in", "a", "an", "how", "why",
                    "when", "where", "who", "which", "with", "for", "to", "from", "about",
                    "context", "content", "file", "document", "resume"}
    
    key_terms = []
    for word in question_lower.split():
        clean = word.strip("?.,!;:()")
        if clean and clean not in ignore_words and len(clean) > 2:
            key_terms.append(clean)
    
    # Score sentences by keyword relevance
    scored_sentences = []
    for sentence in sentences:
        sentence_lower = sentence.lower()
        score = sum(1 for term in key_terms if term in sentence_lower)
        if score > 0:
            scored_sentences.append((score, sentence))
    
    # Sort by score (most relevant first)
    scored_sentences.sort(reverse=True, key=lambda x: x[0])
    
    # Get top relevant sentences
    if scored_sentences:
        relevant = [s[1] for s in scored_sentences[:8]]  # Top 8 sentences
    else:
        relevant = sentences[:8]  # Fallback to first 8
    
    # Special handling for specific question types
    if "abstract" in question_lower:
        # Look for abstract section
        abstract_sentences = []
        for i, sentence in enumerate(sentences):
            if "abstract" in sentence.lower() or i < 5:  # First 5 or contains "abstract"
                abstract_sentences.append(sentence)
                if len(abstract_sentences) >= 6:
                    break
        if abstract_sentences:
            return f"Abstract: {'. '.join(abstract_sentences)}."
        return f"Based on the document: {'. '.join(relevant[:6])}."
    
    elif "conclusion" in question_lower:
        # Look for conclusion section
        conclusion_sentences = []
        for sentence in sentences:
            if any(word in sentence.lower() for word in ["conclusion", "conclude", "summary", "finally", "result"]):
                conclusion_sentences.append(sentence)
        if conclusion_sentences:
            return f"Conclusion: {'. '.join(conclusion_sentences[:6])}."
        # If no conclusion found, use last sentences
        return f"Based on the document: {'. '.join(sentences[-6:])}."
    
    elif "resume" in question_lower or "cv" in question_lower:
        # For resume questions, provide comprehensive overview
        return f"This appears to be a resume/CV. Key information: {'. '.join(relevant[:10])}. [Note: For better understanding, please use OpenAI provider by setting LLM_PROVIDER=openai in .env]"
    
    elif "who" in question_lower:
        # Person-related question
        return f"Based on the document: {'. '.join(relevant[:6])}."
    
    elif "what" in question_lower:
        return f"According to the document: {'. '.join(relevant[:6])}."
    
    elif "how" in question_lower:
        return f"The document explains: {'. '.join(relevant[:6])}."
    
    else:
        # Generic response with most relevant content
        return f"Based on the retrieved context: {'. '.join(relevant[:8])}. [Note: Mock LLM has limited understanding. For accurate answers, use OpenAI by setting LLM_PROVIDER=openai in .env]"


# Made with Bob
