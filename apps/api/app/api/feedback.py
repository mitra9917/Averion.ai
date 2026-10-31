from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import RequestContext, get_request_context
from app.db.documents import DatabaseNotConfiguredError
from app.db.feedback import (
    FeedbackCreate,
    FeedbackMessageNotFoundError,
    list_feedback,
    store_feedback
)
from app.schemas.feedback import FeedbackRequest, FeedbackResponse

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post(
    "",
    response_model=FeedbackResponse,
    status_code=status.HTTP_201_CREATED
)
def create_feedback(
    request: FeedbackRequest,
    context: RequestContext = Depends(get_request_context)
) -> FeedbackResponse:
    try:
        record = store_feedback(
            FeedbackCreate(
                message_id=str(request.message_id),
                rating=request.rating,
                organization_id=context.organization_id,
                user_id=context.user_id,
                correction_text=request.correction_text
            )
        )
    except FeedbackMessageNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc)
        ) from exc
    except DatabaseNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc)
        ) from exc

    return FeedbackResponse(
        feedback_id=record.feedback_id,
        message_id=record.message_id,
        user_id=record.user_id,
        rating=record.rating,
        correction_text=record.correction_text,
        created_at=record.created_at
    )


@router.get("", response_model=list[FeedbackResponse])
def get_feedback(
    limit: int = Query(default=50, ge=1, le=200),
    context: RequestContext = Depends(get_request_context),
) -> list[FeedbackResponse]:
    try:
        records = list_feedback(organization_id=context.organization_id, limit=limit)
    except DatabaseNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc)
        ) from exc

    return [
        FeedbackResponse(
            feedback_id=record.feedback_id,
            message_id=record.message_id,
            user_id=record.user_id,
            rating=record.rating,
            correction_text=record.correction_text,
            created_at=record.created_at
        )
        for record in records
    ]
