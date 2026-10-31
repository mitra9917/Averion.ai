from types import SimpleNamespace

import pytest

from app.ai import llm_service, transcription_service
from app.ai.provider_utils import (
    ProviderConfigurationError,
    ProviderRequestError,
    sanitize_provider_error,
)
from app.core.config import settings


class FakeChatCompletions:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content="  provider answer  ")
                )
            ]
        )


class FakeAudioTranscriptions:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return " transcript "


class FakeOpenAI:
    instances: list["FakeOpenAI"] = []

    def __init__(self, **kwargs) -> None:
        self.kwargs = kwargs
        self.chat_completions = FakeChatCompletions()
        self.audio_transcriptions = FakeAudioTranscriptions()
        self.chat = SimpleNamespace(completions=self.chat_completions)
        self.audio = SimpleNamespace(transcriptions=self.audio_transcriptions)
        self.instances.append(self)


@pytest.fixture(autouse=True)
def reset_fake_openai() -> None:
    FakeOpenAI.instances.clear()


def test_groq_chat_uses_configured_model_timeout_and_retries(monkeypatch) -> None:
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "llm_provider_api_key", "gsk_test_secret")
    monkeypatch.setattr(settings, "llm_provider_base_url", None)
    monkeypatch.setattr(settings, "llm_provider_timeout_seconds", 12.0)
    monkeypatch.setattr(settings, "llm_provider_max_retries", 0)
    monkeypatch.setattr(settings, "llm_model_name", "llama-custom-prod")
    monkeypatch.setattr(settings, "llm_temperature", 0.1)
    monkeypatch.setattr(settings, "llm_max_tokens", 321)
    monkeypatch.setattr(llm_service, "_get_openai_client_class", lambda: FakeOpenAI)

    answer = llm_service.generate_answer("prompt")

    assert answer == "provider answer"
    client = FakeOpenAI.instances[0]
    assert client.kwargs["api_key"] == "gsk_test_secret"
    assert client.kwargs["base_url"] == "https://api.groq.com/openai/v1"
    assert client.kwargs["timeout"] == 12.0
    assert client.kwargs["max_retries"] == 0
    assert client.chat_completions.calls[0]["model"] == "llama-custom-prod"
    assert client.chat_completions.calls[0]["temperature"] == 0.1
    assert client.chat_completions.calls[0]["max_tokens"] == 321


def test_groq_chat_does_not_default_to_openai_model(monkeypatch) -> None:
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "llm_provider_api_key", "gsk_test_secret")
    monkeypatch.setattr(settings, "llm_provider_base_url", None)
    monkeypatch.setattr(settings, "llm_provider_timeout_seconds", 12.0)
    monkeypatch.setattr(settings, "llm_provider_max_retries", 0)
    monkeypatch.setattr(settings, "llm_model_name", "gpt-4o-mini")
    monkeypatch.setattr(llm_service, "_get_openai_client_class", lambda: FakeOpenAI)

    answer = llm_service.generate_answer("prompt")

    assert answer == "provider answer"
    assert FakeOpenAI.instances[0].chat_completions.calls[0]["model"] == "openai/gpt-oss-20b"


def test_groq_chat_uses_one_supported_model(monkeypatch) -> None:
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "llm_provider_api_key", "gsk_test_secret")
    monkeypatch.setattr(settings, "llm_provider_base_url", None)
    monkeypatch.setattr(settings, "llm_provider_max_retries", 0)
    monkeypatch.setattr(settings, "llm_model_name", "gpt-4o-mini")
    monkeypatch.setattr(llm_service, "_get_openai_client_class", lambda: FakeOpenAI)

    answer = llm_service.generate_answer("prompt")

    calls = FakeOpenAI.instances[0].chat_completions.calls
    assert answer == "provider answer"
    assert [call["model"] for call in calls] == ["openai/gpt-oss-20b"]


def test_groq_reasoning_model_has_budget_for_reasoning_and_final_answer(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "llm_provider_api_key", "gsk_test_secret")
    monkeypatch.setattr(settings, "llm_model_name", "openai/gpt-oss-20b")
    monkeypatch.setattr(settings, "llm_max_tokens", 600)
    monkeypatch.setattr(settings, "llm_reasoning_max_tokens", 2400)
    monkeypatch.setattr(llm_service, "_get_openai_client_class", lambda: FakeOpenAI)
    assert llm_service.generate_answer("prompt") == "provider answer"
    call = FakeOpenAI.instances[0].chat_completions.calls[0]
    assert call["max_completion_tokens"] == 2400
    assert "max_tokens" not in call
    assert call["reasoning_effort"] == "medium"
    assert call["extra_body"] == {"include_reasoning": False}


@pytest.mark.parametrize("first_content", [None, "An unfinished recommendation"])
def test_reasoning_exhaustion_retries_with_larger_budget(monkeypatch, caplog, first_content):
    class ExhaustedCompletions(FakeChatCompletions):
        def create(self, **kwargs):
            self.calls.append(kwargs)
            if len(self.calls) == 1:
                return SimpleNamespace(
                    choices=[SimpleNamespace(finish_reason="length", message=SimpleNamespace(
                        content=first_content, reasoning="private reasoning must not be exposed"))],
                    usage=SimpleNamespace(completion_tokens=2400,
                        completion_tokens_details=SimpleNamespace(reasoning_tokens=2400)),
                )
            return SimpleNamespace(choices=[SimpleNamespace(finish_reason="stop",
                message=SimpleNamespace(content="A complete grounded recommendation [1]."))])
    class ExhaustedOpenAI(FakeOpenAI):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            self.chat_completions = ExhaustedCompletions()
            self.chat = SimpleNamespace(completions=self.chat_completions)
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "llm_provider_api_key", "gsk_test_secret")
    monkeypatch.setattr(settings, "llm_model_name", "openai/gpt-oss-20b")
    monkeypatch.setattr(settings, "llm_max_tokens", 600)
    monkeypatch.setattr(settings, "llm_reasoning_max_tokens", 2400)
    monkeypatch.setattr(settings, "llm_provider_max_retries", 1)
    monkeypatch.setattr(llm_service, "_get_openai_client_class", lambda: ExhaustedOpenAI)
    answer = llm_service.generate_answer("private document prompt")
    assert answer == "A complete grounded recommendation [1]."
    calls = FakeOpenAI.instances[0].chat_completions.calls
    assert [c["max_completion_tokens"] for c in calls] == [2400, 4800]
    assert "private reasoning" not in caplog.text
    assert "private document prompt" not in caplog.text
    assert "finish_reason=length" in caplog.text


@pytest.mark.parametrize("choices", [[], [SimpleNamespace(finish_reason="stop", message=SimpleNamespace(content="  "))]])
def test_empty_chat_responses_are_retried_boundedly(monkeypatch, choices):
    class EmptyCompletions(FakeChatCompletions):
        def create(self, **kwargs):
            self.calls.append(kwargs)
            return SimpleNamespace(choices=choices)
    class EmptyOpenAI(FakeOpenAI):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            self.chat_completions = EmptyCompletions()
            self.chat = SimpleNamespace(completions=self.chat_completions)
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "llm_provider_api_key", "gsk_test_secret")
    monkeypatch.setattr(settings, "llm_provider_max_retries", 1)
    monkeypatch.setattr(llm_service, "_get_openai_client_class", lambda: EmptyOpenAI)
    with pytest.raises(ProviderRequestError):
        llm_service.generate_answer("prompt")
    assert len(FakeOpenAI.instances[0].chat_completions.calls) == 2


def test_groq_chat_retries_one_transient_failure(monkeypatch) -> None:
    class TransientError(RuntimeError):
        status_code = 503

    class FlakyCompletions(FakeChatCompletions):
        def create(self, **kwargs):
            self.calls.append(kwargs)
            if len(self.calls) == 1:
                raise TransientError("service unavailable")
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content="recovered"))]
            )

    class FlakyOpenAI(FakeOpenAI):
        def __init__(self, **kwargs) -> None:
            super().__init__(**kwargs)
            self.chat_completions = FlakyCompletions()
            self.chat = SimpleNamespace(completions=self.chat_completions)

    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "llm_provider_api_key", "gsk_test_secret")
    monkeypatch.setattr(settings, "llm_provider_max_retries", 1)
    monkeypatch.setattr(settings, "llm_model_name", "openai/gpt-oss-20b")
    monkeypatch.setattr(llm_service, "_get_openai_client_class", lambda: FlakyOpenAI)

    assert llm_service.generate_answer("prompt") == "recovered"
    assert len(FlakyOpenAI.instances[0].chat_completions.calls) == 2


def test_chat_provider_errors_are_sanitized_and_bounded(monkeypatch) -> None:
    class FailingCompletions:
        attempts = 0

        def create(self, **kwargs):
            self.attempts += 1
            raise RuntimeError("bad key sk-secret-value api_key=gsk_hidden")

    class FailingOpenAI(FakeOpenAI):
        def __init__(self, **kwargs) -> None:
            super().__init__(**kwargs)
            self.chat = SimpleNamespace(completions=FailingCompletions())

    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "llm_provider_api_key", "sk-real-secret")
    monkeypatch.setattr(settings, "llm_provider_base_url", None)
    monkeypatch.setattr(settings, "llm_provider_max_retries", 1)
    monkeypatch.setattr(llm_service, "_get_openai_client_class", lambda: FailingOpenAI)

    with pytest.raises(ProviderRequestError) as exc_info:
        llm_service.generate_answer("prompt")

    assert str(exc_info.value) == "AI provider is temporarily unavailable. Please try again."
    assert "secret" not in sanitize_provider_error("bad key sk-secret-value api_key=gsk_hidden")


def test_chat_requires_api_key_for_external_provider(monkeypatch) -> None:
    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "llm_provider_api_key", "")

    with pytest.raises(ProviderConfigurationError, match="Chat provider is not configured"):
        llm_service.generate_answer("prompt")


def test_transcription_uses_independent_provider_configuration(monkeypatch) -> None:
    monkeypatch.setattr(settings, "transcription_provider", "groq")
    monkeypatch.setattr(settings, "transcription_provider_api_key", "gsk_transcription_secret")
    monkeypatch.setattr(settings, "transcription_provider_base_url", None)
    monkeypatch.setattr(settings, "transcription_model_name", "whisper-prod")
    monkeypatch.setattr(settings, "transcription_timeout_seconds", 44.0)
    monkeypatch.setattr(settings, "transcription_max_retries", 0)
    monkeypatch.setattr(settings, "llm_provider_api_key", "different_chat_secret")
    monkeypatch.setattr(transcription_service, "_get_openai_client_class", lambda: FakeOpenAI)

    transcript = transcription_service.transcribe_audio(b"audio-bytes", "clip.webm", "hi")

    assert transcript == "transcript"
    client = FakeOpenAI.instances[0]
    assert client.kwargs["api_key"] == "gsk_transcription_secret"
    assert client.kwargs["api_key"] != settings.llm_provider_api_key
    assert client.kwargs["base_url"] == "https://api.groq.com/openai/v1"
    assert client.kwargs["timeout"] == 44.0
    call = client.audio_transcriptions.calls[0]
    assert call["model"] == "whisper-prod"
    assert call["language"] == "hi"


def test_disabled_transcription_provider_fails_safely(monkeypatch) -> None:
    monkeypatch.setattr(settings, "transcription_provider", "disabled")

    with pytest.raises(ProviderConfigurationError, match="Transcription provider is not configured"):
        transcription_service.transcribe_audio(b"audio-bytes", "clip.webm")
