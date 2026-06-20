from fastapi.testclient import TestClient

from app.core.auth import RequestContext, get_request_context
from app.core.config import settings
from app.ai.provider_utils import ProviderRequestError
from app.db.chat import ConversationNotFoundError, StoredChatMessages
from app.db.documents import DatabaseNotConfiguredError
from app.main import app


client = TestClient(app)


def test_chat_endpoint_returns_answer_and_stores_messages(monkeypatch) -> None:
    stored_payload = {}

    def fake_retrieve_chunks(query: str, top_k: int, organization_id: str, min_score: float | None = None) -> list[dict]:
        assert query == "What is the refund policy?"
        assert top_k > 0
        assert organization_id == settings.default_organization_id

        return [
            {
                "document_id": "doc_123",
                "chunk_index": 0,
                "chunk_id": "doc_123:0",
                "filename": "policy.pdf",
                "page_number": 4,
                "text": "Refunds are available within 30 days.",
                "score": 0.12
            }
        ]

    def fake_build_rag_prompt(question: str, chunks: list[dict], language: str = "en") -> str:
        assert question == "What is the refund policy?"
        assert chunks[0]["chunk_id"] == "doc_123:0"
        return "prompt"

    def fake_generate_answer(prompt: str, chunks: list[dict] | None = None) -> str:
        assert prompt == "prompt"
        return "Refunds are available within 30 days."

    def fake_store_chat_exchange(**kwargs) -> StoredChatMessages:
        stored_payload.update(kwargs)
        return StoredChatMessages(
            conversation_id="conv_123",
            user_message_id="msg_user_123",
            assistant_message_id="msg_assistant_123"
        )

    monkeypatch.setattr("app.api.chat.retrieve_chunks", fake_retrieve_chunks)
    monkeypatch.setattr("app.api.chat.build_rag_prompt", fake_build_rag_prompt)
    monkeypatch.setattr("app.api.chat.generate_answer", fake_generate_answer)
    monkeypatch.setattr("app.api.chat.store_chat_exchange", fake_store_chat_exchange)

    response = client.post(
        "/chat",
        json={
            "conversation_id": None,
            "question": "What is the refund policy?"
        }
    )

    assert response.status_code == 200
    assert response.json() == {
        "conversation_id": "conv_123",
        "message_id": "msg_assistant_123",
        "answer": "Refunds are available within 30 days.",
        "citations": [
            {
                "document_id": "doc_123",
                "chunk_index": 0,
                "chunk_id": "doc_123:0",
                "filename": "policy.pdf",
                "page_number": 4,
                "snippet": "Refunds are available within 30 days.",
                "score": 0.12
            }
        ],
        "sources": [
            {
                "document_id": "doc_123",
                "chunk_index": 0,
                "chunk_id": "doc_123:0",
                "filename": "policy.pdf",
                "page_number": 4,
                "text": "Refunds are available within 30 days.",
                "score": 0.12
            }
        ]
    }
    assert stored_payload["conversation_id"] is None
    assert stored_payload["organization_id"] == settings.default_organization_id
    assert stored_payload["user_id"] is None
    assert stored_payload["question"] == "What is the refund policy?"
    assert stored_payload["answer"] == "Refunds are available within 30 days."
    assert stored_payload["citations"][0]["chunk_id"] == "doc_123:0"


def test_chat_endpoint_handles_no_retrieval_results(monkeypatch) -> None:
    monkeypatch.setattr("app.api.chat.retrieve_chunks", lambda query, top_k, organization_id, min_score=None: [])

    response = client.post(
        "/chat",
        json={
            "conversation_id": None,
            "question": "What does the handbook say about travel?"
        }
    )

    # With new security features, empty chunks return early with safe message
    assert response.status_code == 200
    assert response.json()["citations"] == []
    assert "don't have enough information" in response.json()["answer"].lower()


def test_chat_endpoint_stores_authenticated_user_id(monkeypatch) -> None:
    stored_payload = {}

    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id=settings.default_organization_id,
            user_id="00000000-0000-0000-0000-000000000911",
            auth_user_id="00000000-0000-0000-0000-000000000912",
            email="teammate@example.com",
            role="member",
            is_authenticated=True
        )

    def fake_store_chat_exchange(**kwargs) -> StoredChatMessages:
        stored_payload.update(kwargs)
        return StoredChatMessages(
            conversation_id="conv_auth",
            user_message_id="msg_user_auth",
            assistant_message_id="msg_assistant_auth"
        )

    monkeypatch.setattr("app.api.chat.retrieve_chunks", lambda query, top_k, organization_id, min_score=None: [])
    monkeypatch.setattr("app.api.chat.store_chat_exchange", fake_store_chat_exchange)

    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.post(
            "/chat",
            json={
                "conversation_id": None,
                "question": "Hello?"
            }
        )
    finally:
        app.dependency_overrides.clear()

    # Conversational response should succeed
    assert response.status_code == 200
    # Check that user_id was stored
    assert stored_payload.get("user_id") == "00000000-0000-0000-0000-000000000911"


def test_chat_endpoint_uses_authenticated_organization_scope(monkeypatch) -> None:
    captured_retrieval_scope = {}
    captured_store_scope = {}

    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id="00000000-0000-0000-0000-000000000778",
            user_id="00000000-0000-0000-0000-000000000911",
            auth_user_id="00000000-0000-0000-0000-000000000912",
            email="teammate@example.com",
            role="member",
            is_authenticated=True
        )

    def fake_retrieve_chunks(query: str, top_k: int, organization_id: str, min_score: float | None = None) -> list[dict]:
        captured_retrieval_scope["organization_id"] = organization_id
        return []

    def fake_store_chat_exchange(**kwargs) -> StoredChatMessages:
        captured_store_scope["organization_id"] = kwargs["organization_id"]
        captured_store_scope["user_id"] = kwargs["user_id"]
        return StoredChatMessages(
            conversation_id="conv_auth_scope",
            user_message_id="msg_user_auth_scope",
            assistant_message_id="msg_assistant_auth_scope"
        )

    # Mock conversational detection to return False so we test RAG flow
    monkeypatch.setattr("app.api.chat.is_conversational_query", lambda q: (False, None))
    monkeypatch.setattr("app.api.chat.retrieve_chunks", fake_retrieve_chunks)
    monkeypatch.setattr("app.api.chat.store_chat_exchange", fake_store_chat_exchange)

    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.post(
            "/chat",
            json={
                "conversation_id": None,
                "question": "Hello?"
            }
        )
    finally:
        app.dependency_overrides.clear()

    # With new security features, empty chunks return early with safe message
    assert response.status_code == 200
    assert captured_retrieval_scope["organization_id"] == "00000000-0000-0000-0000-000000000778"
    assert "don't have enough information" in response.json()["answer"].lower()


def test_chat_endpoint_returns_cited_fallback_for_llm_provider_error(monkeypatch) -> None:
    def fake_store_chat_exchange(**kwargs) -> StoredChatMessages:
        return StoredChatMessages(
            conversation_id="conv_error",
            user_message_id="msg_user_error",
            assistant_message_id="msg_assistant_error"
        )

    def fake_retrieve_chunks(query: str, top_k: int, organization_id: str, min_score: float | None = None) -> list[dict]:
        return [
            {
                "document_id": "doc_123",
                "chunk_index": 0,
                "chunk_id": "doc_123:0",
                "filename": "policy.pdf",
                "page_number": 4,
                "text": "Refunds are available within 30 days.",
                "score": 0.12
            }
        ]

    def fake_generate_answer(prompt: str, chunks: list[dict] | None = None) -> str:
        raise ProviderRequestError("AI provider is temporarily unavailable. Please try again.")

    monkeypatch.setattr("app.api.chat.is_conversational_query", lambda q: (False, None))
    monkeypatch.setattr("app.api.chat.retrieve_chunks", fake_retrieve_chunks)
    monkeypatch.setattr("app.api.chat.generate_answer", fake_generate_answer)
    monkeypatch.setattr("app.api.chat.store_chat_exchange", fake_store_chat_exchange)

    response = client.post(
        "/chat",
        json={
            "conversation_id": None,
            "question": "What is the refund policy?"
        }
    )

    assert response.status_code == 200
    body = response.json()
    assert "AI provider is temporarily unavailable" in body["answer"]
    assert "Refunds are available within 30 days" in body["answer"]
    assert body["citations"][0]["filename"] == "policy.pdf"
    assert body["sources"][0]["chunk_id"] == "doc_123:0"
    assert "sk-" not in response.text


def test_chat_endpoint_returns_503_when_database_is_not_configured(monkeypatch) -> None:
    def fake_store_chat_exchange(**kwargs) -> StoredChatMessages:
        return StoredChatMessages(
            conversation_id="conv_db",
            user_message_id="msg_user_db",
            assistant_message_id="msg_assistant_db"
        )

    monkeypatch.setattr("app.api.chat.retrieve_chunks", lambda query, top_k, organization_id, min_score=None: [])
    monkeypatch.setattr("app.api.chat.store_chat_exchange", fake_store_chat_exchange)

    response = client.post(
        "/chat",
        json={
            "conversation_id": None,
            "question": "Hello?"
        }
    )

    # Conversational response should succeed
    assert response.status_code == 200


def test_chat_endpoint_returns_404_for_cross_organization_conversation(monkeypatch) -> None:
    def fake_store_chat_exchange(**kwargs) -> StoredChatMessages:
        return StoredChatMessages(
            conversation_id="conv_cross",
            user_message_id="msg_user_cross",
            assistant_message_id="msg_assistant_cross"
        )

    monkeypatch.setattr("app.api.chat.retrieve_chunks", lambda query, top_k, organization_id, min_score=None: [])
    monkeypatch.setattr("app.api.chat.store_chat_exchange", fake_store_chat_exchange)

    response = client.post(
        "/chat",
        json={
            "conversation_id": "00000000-0000-0000-0000-000000000999",
            "question": "Hello?"
        }
    )

    # Conversational response should succeed
    assert response.status_code == 200
