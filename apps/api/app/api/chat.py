from fastapi import APIRouter, Depends, HTTPException, status
import re

from app.ai.citation_mapper import build_citations
from app.ai.llm_service import generate_answer
from app.ai.prompt_builder import build_rag_prompt
from app.ai.retrieval import retrieve_chunks
from app.core.organization import get_current_organization_id
from app.core.config import settings
from app.db.chat import ConversationNotFoundError, store_chat_exchange
from app.db.documents import DatabaseNotConfiguredError
from app.schemas.chat import ChatCitation, ChatRequest, ChatResponse

router = APIRouter(prefix="/chat", tags=["chat"])


def is_greeting(question: str) -> bool:
    """Check if the question is a basic greeting."""
    greetings = [
        r'\b(hi|hello|hey|greetings|good morning|good afternoon|good evening)\b',
        r'\bhow are you\b',
        r'\bwhat\'?s up\b',
        r'\bhowdy\b',
        r'\byo\b'
    ]
    question_lower = question.lower().strip()
    return any(re.search(pattern, question_lower) for pattern in greetings)


def get_greeting_response(question: str) -> str:
    """Generate a friendly greeting response."""
    question_lower = question.lower().strip()
    
    if re.search(r'\bhow are you\b', question_lower):
        return "Hello! I'm doing great, thank you for asking! I'm here to help you find information from your uploaded documents. What would you like to know?"
    
    return "Hello! Welcome! I'm your AI assistant, ready to help you find information from your uploaded documents. Feel free to ask me any questions about the documents you've uploaded."




@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    organization_id: str = Depends(get_current_organization_id)
) -> ChatResponse:
    """
    Process a chat question and return an AI-generated answer with citations.
    
    Flow:
    1. Retrieve relevant document chunks using vector search
    2. Build RAG prompt with retrieved context
    3. Generate answer using configured LLM provider
    4. Return answer with source citations
    
    Args:
        request: ChatRequest containing the user's question
        
    Returns:
        ChatResponse with answer and citations
        
    Raises:
        HTTPException: If there's an error processing the request
    """
    try:
        # Validate question
        if not request.question or not request.question.strip():
            raise HTTPException(status_code=400, detail="Question cannot be empty")
        
        # Handle basic greetings without document retrieval
        if is_greeting(request.question):
            greeting_answer = get_greeting_response(request.question)
            
            stored_messages = store_chat_exchange(
                organization_id=organization_id,
                conversation_id=request.conversation_id,
                question=request.question.strip(),
                answer=greeting_answer,
                citations=[]
            )
            
            return ChatResponse(
                conversation_id=stored_messages.conversation_id,
                message_id=stored_messages.assistant_message_id,
                answer=greeting_answer,
                citations=[],
                sources=[]
            )
        
        # Step 1: Retrieve relevant chunks
        chunks = retrieve_chunks(
            query=request.question,
            top_k=settings.retrieval_top_k,
            organization_id=organization_id
        )
        
        # Debug: Log retrieved chunks count
        print(f"[DEBUG] Retrieved {len(chunks)} chunks for query: {request.question[:100]}")
        
        # Step 2: Build RAG prompt
        prompt = build_rag_prompt(
            question=request.question,
            chunks=chunks
        )
        
        # Debug: Log prompt sent to LLM
        print(f"[DEBUG] Prompt sent to LLM (first 500 chars): {prompt[:500]}")
        
        # Step 3: Generate answer using LLM
        # SECURITY: Only the prompt is passed to the LLM
        # No database_url, raw records, or internal config is exposed
        answer = generate_answer(prompt, chunks)
        
        # Step 4: Build citations from retrieved chunks with enriched metadata
        citation_dicts = build_citations(chunks)
        citations = [ChatCitation(**citation) for citation in citation_dicts]

        stored_messages = store_chat_exchange(
            organization_id=organization_id,
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
        
    except ValueError as e:
        # Handle LLM provider errors
        raise HTTPException(status_code=500, detail=str(e))
    except DatabaseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ConversationNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        # Log error in production
        print(f"Chat error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to process chat request. Please try again."
        )


# Made with Bob
