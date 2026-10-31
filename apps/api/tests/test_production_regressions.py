import asyncio
import io
import time
from threading import Event
from unittest.mock import MagicMock

import httpx
import pytest
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient

from app.ai import aws_embeddings
from app.ai.security import log_security_event
from app.core.auth import RequestContext, get_request_context
from app.core.config import settings
from app.core.rate_limit import _requests, limit_transcription
from app.db.chat import StoredChatMessages
from app.main import app

client = TestClient(app)
CONVERSATION = "00000000-0000-0000-0000-000000000123"
MESSAGE = "00000000-0000-0000-0000-000000000124"


@pytest.mark.parametrize("route", ["/feedback", "/transcribe"])
def test_sensitive_routes_require_authentication(monkeypatch, route):
    monkeypatch.setattr(settings, "auth_required", True)
    response = (client.get(route) if route == "/feedback" else
                client.post(route, files={"file": ("audio.wav", b"audio", "audio/wav")}))
    assert response.status_code == 401


def test_feedback_query_scopes_database_records(monkeypatch):
    from app.db.feedback import list_feedback
    cursor = MagicMock()
    cursor.__enter__.return_value = cursor
    cursor.fetchall.return_value = []
    connection = MagicMock()
    connection.__enter__.return_value = connection
    connection.cursor.return_value = cursor
    monkeypatch.setattr("app.db.feedback.is_database_configured", lambda: True)
    monkeypatch.setattr("app.db.feedback.psycopg.connect", lambda *a, **k: connection)
    assert list_feedback(organization_id=CONVERSATION, limit=2) == []
    query, params = cursor.execute.call_args.args
    assert "where conversations.organization_id = %s::uuid" in query
    assert params == (CONVERSATION, 2)


def test_no_context_exchange_is_saved_and_followup_uses_real_id(monkeypatch):
    exchanges = []
    def store(**kwargs):
        exchanges.append(kwargs)
        return StoredChatMessages(CONVERSATION, MESSAGE, MESSAGE)
    monkeypatch.setattr("app.api.chat.retrieve_chunks", lambda **k: [])
    monkeypatch.setattr("app.api.chat.store_chat_exchange", store)
    first = client.post("/chat", json={"question": "What is the document retention policy?"})
    assert first.status_code == 200
    assert first.json()["conversation_id"] == CONVERSATION
    assert first.json()["message_id"] == MESSAGE
    second = client.post("/chat", json={"question": "hello", "conversation_id": CONVERSATION})
    assert second.status_code == 200
    assert exchanges[0]["conversation_id"] is None
    assert exchanges[1]["conversation_id"] == CONVERSATION
    assert exchanges[0]["citations"] == []


@pytest.mark.parametrize("method,path,body", [
    ("GET", "/conversations/not-a-uuid", None),
    ("DELETE", "/conversations/not-a-uuid", None),
    ("PATCH", "/conversations/not-a-uuid/title", {"title": "Title"}),
    ("POST", "/chat", {"question": "hello", "conversation_id": "invalid"}),
])
def test_invalid_ids_are_client_errors(method, path, body):
    assert client.request(method, path, json=body).status_code == 422


def test_old_placeholder_recovers_into_new_saved_conversation(monkeypatch):
    def store(**kwargs):
        assert kwargs["conversation_id"] is None
        return StoredChatMessages(CONVERSATION, MESSAGE, MESSAGE)
    monkeypatch.setattr("app.api.chat.store_chat_exchange", store)
    response = client.post("/chat", json={"question": "hello", "conversation_id": "new"})
    assert response.status_code == 200
    assert response.json()["conversation_id"] == CONVERSATION


def test_slow_chat_keeps_health_responsive(monkeypatch):
    started, release = Event(), Event()
    def retrieve(**kwargs):
        started.set()
        release.wait(timeout=2)
        raise HTTPException(503, "Controlled test outage")
    monkeypatch.setattr("app.api.chat.retrieve_chunks", retrieve)
    async def scenario():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            start = time.monotonic()
            task = asyncio.create_task(c.post("/chat", json={"question": "What is our document policy?"}))
            try:
                assert await asyncio.to_thread(started.wait, 1)
                response = await c.get("/health")
                assert response.status_code == 200
                assert time.monotonic() - start < 1
            finally:
                release.set()
                await task
    asyncio.run(scenario())


def test_lambda_transport_failure_is_sanitized_503(monkeypatch):
    fake = MagicMock()
    fake.invoke.side_effect = TimeoutError("private credential should never be returned")
    monkeypatch.setattr(aws_embeddings, "lambda_client", lambda: fake)
    monkeypatch.setattr(settings, "embedding_aws_function_name", "function")
    monkeypatch.setattr("app.api.chat.retrieve_chunks", lambda **k: aws_embeddings.encode_remote(["query"]))
    response = client.post("/chat", json={"question": "What is the document policy?"})
    assert response.status_code == 503
    assert "temporarily unavailable" in response.json()["detail"]
    assert "private credential" not in response.text


def test_security_logs_exclude_question_and_unapproved_detail_values(capsys):
    log_security_event("retrieval", "Secret customer question", {"token": "private", "arbitrary": "private", "chunks_retrieved": 2})
    output = capsys.readouterr().out
    assert "Secret customer question" not in output
    assert "private" not in output
    assert "question_length" in output
    assert "chunks_retrieved" in output


def test_transcription_bounds_read_before_provider(monkeypatch):
    from app.api.transcription import transcribe_audio_file
    upload = MagicMock(spec=UploadFile)
    upload.filename = "audio.wav"
    calls = []
    async def read(size):
        calls.append(size)
        return b"x" * size
    upload.read = read
    _requests.clear()
    context = RequestContext("org-test", "user-test", None, None, "owner", True)
    with pytest.raises(HTTPException) as error:
        asyncio.run(transcribe_audio_file(upload, "en", context))
    assert error.value.status_code == 413
    assert calls == [25 * 1024 * 1024 + 1]


def test_transcription_limits_requests_and_declared_body_size():
    _requests.clear()
    for _ in range(5):
        limit_transcription("rate-test")
    with pytest.raises(HTTPException) as error:
        limit_transcription("rate-test")
    assert error.value.status_code == 429
    response = client.post("/transcribe", headers={"content-length": str(27 * 1024 * 1024)})
    assert response.status_code == 413
    _requests.clear()


def test_ingestion_respects_processing_capacity(monkeypatch):
    from app.db.ingestion_jobs import claim_next_ingestion_job
    cursor = MagicMock()
    cursor.__enter__.return_value = cursor
    cursor.fetchone.side_effect = [(True,), (4,)]
    connection = MagicMock()
    connection.__enter__.return_value = connection
    connection.cursor.return_value = cursor
    monkeypatch.setattr(settings, "document_worker_max_concurrency", 4)
    monkeypatch.setattr("app.db.ingestion_jobs.is_database_configured", lambda: True)
    monkeypatch.setattr("app.db.ingestion_jobs.open_connection", lambda: connection)
    assert claim_next_ingestion_job("test") is None
    assert cursor.execute.call_count == 2


def test_saturated_chat_returns_busy_without_blocking(monkeypatch):
    capacity = MagicMock()
    capacity.acquire.return_value = False
    monkeypatch.setattr("app.api.chat._chat_capacity", capacity)
    response = client.post("/chat", json={"question": "hello"})
    assert response.status_code == 503
    assert response.headers["retry-after"] == "5"


def test_pdf_extraction_preserves_page_text_after_parser_upgrade(tmp_path):
    from pypdf import PdfWriter
    from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
    from app.ai.extraction import extract_text_from_pdf
    writer = PdfWriter()
    page = writer.add_blank_page(width=300, height=300)
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"),
                             NameObject("/Subtype"): NameObject("/Type1"),
                             NameObject("/BaseFont"): NameObject("/Helvetica")})
    page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
    stream = DecodedStreamObject()
    stream.set_data(b"BT /F1 12 Tf 10 100 Td (Retention period is 37 days.) Tj ET")
    page[NameObject("/Contents")] = stream
    target = tmp_path / "policy.pdf"
    writer.write(target)
    text = extract_text_from_pdf(str(target))
    assert "Page 1" in text
    assert "Retention period is 37 days." in text
