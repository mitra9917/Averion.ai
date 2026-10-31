from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import RequestContext, get_request_context
from app.db.chat import (
    ConversationNotFoundError,
    delete_conversation,
    get_conversation_by_id,
    get_conversations,
    update_conversation_title,
)
from app.db.documents import DatabaseNotConfiguredError
from app.schemas.chat import (
    ConversationDetail as ConversationDetailSchema,
    ConversationDetailResponse,
    ConversationListResponse,
    ConversationSummary as ConversationSummarySchema,
    Message as MessageSchema,
    UpdateTitleRequest,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=ConversationListResponse)
def list_conversations(
    context: RequestContext = Depends(get_request_context)
) -> ConversationListResponse:
    """
    List all conversations for the current user's organization.
    Returns conversations ordered by most recently updated first.
    
    Security:
    - Organization isolation enforced
    - Only returns conversations for the authenticated user's organization
    
    Args:
        context: Request context with user and organization info
        
    Returns:
        ConversationListResponse with list of conversation summaries
        
    Raises:
        HTTPException: If there's an error retrieving conversations
    """
    try:
        conversations = get_conversations(
            organization_id=context.organization_id,
            user_id=context.user_id
        )
        
        # Convert dataclass to Pydantic models
        conversations_list = [
            ConversationSummarySchema(
                id=conv.id,
                title=conv.title,
                created_at=conv.created_at,
                updated_at=conv.updated_at,
                message_count=conv.message_count
            )
            for conv in conversations
        ]
        
        return ConversationListResponse(conversations=conversations_list)
        
    except DatabaseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        print(f"Error listing conversations: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve conversations. Please try again."
        )


@router.get("/{conversation_id}", response_model=ConversationDetailResponse)
def get_conversation(
    conversation_id: UUID,
    context: RequestContext = Depends(get_request_context)
) -> ConversationDetailResponse:
    """
    Get a specific conversation with all its messages.
    
    Security:
    - Organization isolation enforced
    - Only returns conversation if it belongs to the user's organization
    
    Args:
        conversation_id: UUID of the conversation
        context: Request context with user and organization info
        
    Returns:
        ConversationDetailResponse with conversation details and messages
        
    Raises:
        HTTPException: If conversation not found or access denied
    """
    try:
        conversation = get_conversation_by_id(
            conversation_id=str(conversation_id),
            organization_id=context.organization_id
        )
        
        # Convert dataclass to Pydantic models
        messages_list = [
            MessageSchema(
                id=msg.id,
                role=msg.role,
                content=msg.content,
                citations=msg.citations,
                created_at=msg.created_at
            )
            for msg in conversation.messages
        ]
        
        conversation_detail = ConversationDetailSchema(
            id=conversation.id,
            title=conversation.title,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
            messages=messages_list
        )
        
        return ConversationDetailResponse(conversation=conversation_detail)
        
    except ConversationNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except DatabaseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        print(f"Error retrieving conversation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve conversation. Please try again."
        )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_conversation(
    conversation_id: UUID,
    context: RequestContext = Depends(get_request_context)
) -> None:
    """
    Delete a conversation and all its messages.
    
    Security:
    - Organization isolation enforced
    - Only deletes if conversation belongs to the user's organization
    
    Args:
        conversation_id: UUID of the conversation to delete
        context: Request context with user and organization info
        
    Raises:
        HTTPException: If conversation not found or access denied
    """
    try:
        delete_conversation(
            conversation_id=str(conversation_id),
            organization_id=context.organization_id
        )
        
    except ConversationNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except DatabaseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        print(f"Error deleting conversation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to delete conversation. Please try again."
        )


@router.patch("/{conversation_id}/title", status_code=status.HTTP_204_NO_CONTENT)
def update_title(
    conversation_id: UUID,
    request: UpdateTitleRequest,
    context: RequestContext = Depends(get_request_context)
) -> None:
    """
    Update the title of a conversation.
    
    Security:
    - Organization isolation enforced
    - Only updates if conversation belongs to the user's organization
    
    Args:
        conversation_id: UUID of the conversation
        request: Request body with new title
        context: Request context with user and organization info
        
    Raises:
        HTTPException: If conversation not found or access denied
    """
    try:
        if not request.title or not request.title.strip():
            raise HTTPException(
                status_code=400,
                detail="Title cannot be empty"
            )
        
        update_conversation_title(
            conversation_id=str(conversation_id),
            organization_id=context.organization_id,
            title=request.title.strip()
        )
        
    except ConversationNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except DatabaseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating conversation title: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to update conversation title. Please try again."
        )


# Made with Bob