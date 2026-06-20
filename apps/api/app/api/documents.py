import logging

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status
)

from app.core.auth import RequestContext, get_request_context
from app.core.organization import get_current_organization_id
from app.db.documents import (
    DatabaseNotConfiguredError,
    delete_document,
    get_document_for_organization,
    list_documents
)
from app.db.ingestion_jobs import claim_next_ingestion_job, retry_failed_ingestion_job
from app.schemas.documents import (
    DocumentDeleteResponse,
    DocumentListItem,
    DocumentRetryResponse,
    DocumentUploadResponse
)
from app.services.document_ingestion import process_ingestion_job
from app.services.document_service import (
    DocumentMetadataStorageError,
    DocumentValidationError,
    save_uploaded_document
)
from app.services.document_storage import (
    DocumentStorageError,
    get_document_storage
)

router = APIRouter(prefix="/documents", tags=["documents"])
logger = logging.getLogger(__name__)


def process_one_queued_document() -> None:
    try:
        job = claim_next_ingestion_job("api-upload-kick")
        if job is not None:
            process_ingestion_job(job)
    except Exception:
        logger.exception("Upload-triggered document ingestion failed")


@router.get("", response_model=list[DocumentListItem])
def get_documents(
    organization_id: str = Depends(get_current_organization_id)
) -> list[DocumentListItem]:
    try:
        records = list_documents(organization_id)
    except DatabaseNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc)
        ) from exc

    return [
        DocumentListItem(
            document_id=record.document_id,
            filename=record.filename,
            file_type=record.file_type,
            status=record.status,
            storage_path=record.storage_path,
            chunks_count=record.chunks_count,
            error_message=record.error_message,
            created_at=record.created_at,
            updated_at=record.updated_at
        )
        for record in records
    ]


@router.post(
    "/upload",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_201_CREATED
)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    context: RequestContext = Depends(get_request_context)
) -> DocumentUploadResponse:
    try:
        response = await save_uploaded_document(
            file=file,
            organization_id=context.organization_id,
            uploaded_by_user_id=context.user_id
        )
        if response.metadata_stored:
            background_tasks.add_task(process_one_queued_document)
        return response
    except DocumentValidationError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=str(exc)
        ) from exc
    except DocumentStorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc)
        ) from exc
    except DocumentMetadataStorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc)
        ) from exc


@router.delete("/{document_id}", response_model=DocumentDeleteResponse)
def delete_uploaded_document(
    document_id: str,
    context: RequestContext = Depends(get_request_context)
) -> DocumentDeleteResponse:
    if context.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization owners can delete documents."
        )

    try:
        stored_document = get_document_for_organization(
            document_id=document_id,
            organization_id=context.organization_id
        )
    except DatabaseNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc)
        ) from exc

    if stored_document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document was not found in your organization."
        )

    try:
        get_document_storage().delete(stored_document.storage_path)
    except DocumentStorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The document object could not be deleted."
        ) from exc

    deleted_document = delete_document(
        document_id=document_id,
        organization_id=context.organization_id
    )

    if deleted_document is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The document changed while it was being deleted. Please retry."
        )

    return DocumentDeleteResponse(
        document_id=deleted_document.document_id,
        filename=deleted_document.filename,
        deleted=True,
        detail="Document, chunks, and embeddings were deleted."
    )


@router.post(
    "/{document_id}/retry",
    response_model=DocumentRetryResponse
)
def retry_document_ingestion(
    document_id: str,
    context: RequestContext = Depends(get_request_context)
) -> DocumentRetryResponse:
    if context.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization owners can retry failed documents."
        )

    try:
        retried = retry_failed_ingestion_job(
            document_id=document_id,
            organization_id=context.organization_id
        )
    except DatabaseNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc)
        ) from exc

    if not retried:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only failed documents in your organization can be retried."
        )

    return DocumentRetryResponse(
        document_id=document_id,
        status="uploaded",
        detail="Document ingestion was queued for retry."
    )
