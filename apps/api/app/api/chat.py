import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from app.ai.citation_mapper import build_citations
from app.ai.conversational import (
    generate_conversational_response,
    is_conversational_query,
)
from app.ai.llm_service import generate_answer
from app.ai.prompt_builder import build_rag_prompt
from app.ai.provider_utils import AIProviderError
from app.ai.retrieval import retrieve_chunks
from app.ai.security import (
    contains_sensitive_data,
    is_prompt_injection,
    log_security_event,
    sanitize_output,
)
from app.core.auth import RequestContext, get_request_context
from app.core.config import settings
from app.db.chat import ConversationNotFoundError, store_chat_exchange
from app.db.documents import DatabaseNotConfiguredError
from app.schemas.chat import ChatCitation, ChatRequest, ChatResponse

router = APIRouter(prefix="/chat", tags=["chat"])




@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    context: RequestContext = Depends(get_request_context)
) -> ChatResponse:
    """
    Process a chat question and return an AI-generated answer with citations.
    
    Security Features:
    - Prompt injection detection
    - Similarity threshold filtering
    - Citation enforcement
    - Output sanitization
    - Security audit logging
    - Organization isolation
    
    Flow:
    1. Validate and check for prompt injection
    2. Retrieve relevant document chunks using vector search
    3. Enforce citation requirements
    4. Build RAG prompt with retrieved context
    5. Generate answer using configured LLM provider
    6. Sanitize output for sensitive data
    7. Return answer with source citations
    
    Args:
        request: ChatRequest containing the user's question
        context: Request context with user and organization info
        
    Returns:
        ChatResponse with answer and citations
        
    Raises:
        HTTPException: If there's an error processing the request
    """
    try:
        # Validate question
        if not request.question or not request.question.strip():
            raise HTTPException(status_code=400, detail="Question cannot be empty")
        
        # PHASE 0: Conversational Query Detection
        # Check if this is a casual conversation rather than a document question
        is_conversational, intent_type = is_conversational_query(request.question)
        
        if is_conversational:
            # Generate friendly conversational response
            conversational_answer = generate_conversational_response(intent_type, request.question)
            
            # Log conversational interaction
            log_security_event(
                event_type="conversational_response",
                question=request.question,
                details={"intent_type": intent_type},
                organization_id=context.organization_id,
                user_id=context.user_id
            )
            
            # Store the exchange in chat history
            stored_messages = store_chat_exchange(
                organization_id=context.organization_id,
                user_id=context.user_id,
                conversation_id=request.conversation_id,
                question=request.question.strip(),
                answer=conversational_answer,
                citations=[]
            )
            
            # Return conversational response without citations
            return ChatResponse(
                conversation_id=stored_messages.conversation_id,
                message_id=stored_messages.assistant_message_id,
                answer=conversational_answer,
                citations=[],
                sources=[]
            )
        
        # PHASE 1: Prompt Injection Protection
        is_injection, pattern = is_prompt_injection(request.question)
        if is_injection:
            log_security_event(
                event_type="prompt_injection_blocked",
                question=request.question,
                details={"pattern": pattern},
                organization_id=context.organization_id,
                user_id=context.user_id
            )
            raise HTTPException(
                status_code=400,
                detail="Your question contains suspicious patterns. Please rephrase and try again."
            )
        
        # PHASE 2 & 3: Retrieve relevant chunks with score filtering and organization isolation
        chunks = retrieve_chunks(
            query=request.question,
            top_k=settings.retrieval_top_k,
            organization_id=context.organization_id,
            min_score=settings.retrieval_min_score
        )
        
        # Log retrieval for security audit
        log_security_event(
            event_type="retrieval",
            question=request.question,
            details={
                "chunks_retrieved": len(chunks),
                "top_k": settings.retrieval_top_k,
                "min_score": settings.retrieval_min_score
            },
            organization_id=context.organization_id,
            user_id=context.user_id
        )
        
        # PHASE 1: Citation Enforcement
        # If no chunks pass the threshold, return safe message
        if not chunks:
            safe_answer = "I don't have enough information to answer this question. Please try rephrasing or upload relevant documents."
            
            log_security_event(
                event_type="no_context_available",
                question=request.question,
                details={"reason": "no_chunks_above_threshold"},
                organization_id=context.organization_id,
                user_id=context.user_id
            )
            
            return ChatResponse(
                conversation_id=request.conversation_id or "new",
                message_id=str(uuid.uuid4()),
                answer=safe_answer,
                citations=[],
                sources=[]
            )
        
        # Build RAG prompt with security instructions and language preference
        prompt = build_rag_prompt(
            question=request.question,
            chunks=chunks,
            language=request.language
        )
        
        # Generate answer using LLM
        # SECURITY: Only the prompt is passed to the LLM
        # No database_url, raw records, or internal config is exposed
        answer = generate_answer(prompt, chunks)
        
        # PHASE 4: Output Filtering - Check for sensitive data leakage
        has_sensitive, sensitive_pattern = contains_sensitive_data(answer)
        if has_sensitive:
            log_security_event(
                event_type="sensitive_data_detected",
                question=request.question,
                details={"pattern": sensitive_pattern},
                organization_id=context.organization_id,
                user_id=context.user_id
            )
            # Sanitize the output
            answer = sanitize_output(answer)
        
        # Build citations from retrieved chunks with enriched metadata
        citation_dicts = build_citations(chunks)
        citations = [ChatCitation(**citation) for citation in citation_dicts]
        
        # PHASE 1: Final citation enforcement check
        if not citations:
            safe_answer = "I don't have enough information to answer this question."
            log_security_event(
                event_type="no_citations_available",
                question=request.question,
                organization_id=context.organization_id,
                user_id=context.user_id
            )
            return ChatResponse(
                conversation_id=request.conversation_id or "new",
                message_id=str(uuid.uuid4()),
                answer=safe_answer,
                citations=[],
                sources=[]
            )
        
        # Log successful answer generation
        log_security_event(
            event_type="answer_generated",
            question=request.question,
            details={
                "citations_count": len(citations),
                "answer_length": len(answer)
            },
            organization_id=context.organization_id,
            user_id=context.user_id
        )

        stored_messages = store_chat_exchange(
            organization_id=context.organization_id,
            user_id=context.user_id,
            conversation_id=request.conversation_id,
            question=request.question.strip(),
            answer=answer,
            citations=[citation.model_dump() for citation in citations]
        )
        
        return ChatResponse(
            conversation_id=stored_messages.conversation_id,
            message_id=stored_messages.assistant_message_id,
            answer=answer,
            citations=citations,
            sources=chunks
        )
        
    except HTTPException:
        # Re-raise HTTPException (includes prompt injection blocks, validation errors, etc.)
        raise
    except AIProviderError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=e.public_message
        ) from e
    except DatabaseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ConversationNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        # Log error in production with UTF-8 support
        try:
            print(f"Chat error: {str(e)}", flush=True)
        except UnicodeEncodeError:
            import sys
            error_msg = f"Chat error: {str(e)}"
            sys.stdout.buffer.write(error_msg.encode('utf-8', errors='ignore') + b'\n')
            sys.stdout.buffer.flush()
        raise HTTPException(
            status_code=500,
            detail="Failed to process chat request. Please try again."
        )


# Made with Bob
