"""
Transcription API Endpoint

Provides speech-to-text transcription using Groq Whisper API.
"""

import asyncio

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.ai.provider_utils import AIProviderError
from app.ai.transcription_service import transcribe_audio
from app.core.auth import RequestContext, get_request_context
from app.core.rate_limit import limit_transcription

router = APIRouter(prefix="/transcribe", tags=["transcription"])


class TranscriptionResponse(BaseModel):
    """Response model for transcription endpoint."""
    transcript: str


@router.post("", response_model=TranscriptionResponse)
async def transcribe_audio_file(
    file: UploadFile = File(...),
    language: str = "en",
    context: RequestContext = Depends(get_request_context),
) -> TranscriptionResponse:
    """
    Transcribe audio file to text using Groq Whisper with language support.
    
    Accepts audio files in formats: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm
    Maximum file size: 25MB
    
    Args:
        file: Audio file to transcribe
        language: ISO 639-1 language code (en, hi, es, fr, de, ja). Default: en
        
    Returns:
        TranscriptionResponse with transcript text
        
    Raises:
        400: Invalid audio file or format
        503: Transcription service unavailable
    """
    limit_transcription(context.user_id or context.organization_id)
    # Validate file
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file provided"
        )
    
    # Check file extension
    supported_formats = {".flac", ".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".ogg", ".wav", ".webm"}
    file_ext = file.filename.lower().split(".")[-1] if "." in file.filename else ""
    
    if f".{file_ext}" not in supported_formats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio format: {file_ext}. Supported formats: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm"
        )
    
    try:
        # Read audio data
        max_size = 25 * 1024 * 1024
        audio_data = await file.read(max_size + 1)
        if len(audio_data) > max_size:
            raise HTTPException(413, "Audio file exceeds the 25 MiB limit.")
        
        if not audio_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Audio file is empty"
            )
        
        # Transcribe using Groq Whisper with language support
        transcript = await asyncio.to_thread(transcribe_audio, audio_data, file.filename, language)
        
        return TranscriptionResponse(transcript=transcript)
        
    except ValueError as exc:
        # Client errors (invalid input, missing API key, etc.)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc)
        ) from exc
    except AIProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.public_message
        ) from exc


# Made with Bob
