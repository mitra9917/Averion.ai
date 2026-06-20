from datetime import datetime

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    conversation_id: str | None = None
    question: str = Field(..., min_length=1)
    language: str = "en"


class ChatCitation(BaseModel):
    document_id: str
    chunk_index: int
    chunk_id: str
    filename: str
    page_number: int | None = None
    snippet: str
    score: float | None = None


class ChatResponse(BaseModel):
    conversation_id: str
    message_id: str
    answer: str
    citations: list[ChatCitation]
    sources: list[dict] = []


class ConversationSummary(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int


class ConversationListResponse(BaseModel):
    conversations: list[ConversationSummary]


class Message(BaseModel):
    id: str
    role: str
    content: str
    citations: list[dict]
    created_at: datetime


class ConversationDetail(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[Message]


class ConversationDetailResponse(BaseModel):
    conversation: ConversationDetail


class UpdateTitleRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
