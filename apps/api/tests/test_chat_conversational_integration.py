"""
Integration tests for conversational responses in the chat endpoint.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.auth import RequestContext


# Mock authentication
def mock_get_request_context():
    return RequestContext(
        organization_id="test-org-456",
        user_id="test-user-123",
        auth_user_id="auth-user-123",
        email="test@example.com",
        role="user",
        is_authenticated=True
    )


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture(autouse=True)
def mock_auth(monkeypatch):
    """Mock authentication and database for all tests."""
    from app.api import chat
    from app.ai.vector_store import reset_collection
    from app.db.chat import StoredChatMessages
    
    monkeypatch.setattr(chat, "get_request_context", lambda: mock_get_request_context())
    monkeypatch.setattr("app.ai.vector_store.is_database_configured", lambda: False)
    monkeypatch.setattr(chat, "retrieve_chunks", lambda *args, **kwargs: [])
    reset_collection()
    
    # Mock store_chat_exchange to avoid database calls
    def mock_store_chat_exchange(**kwargs):
        return StoredChatMessages(
            conversation_id="00000000-0000-0000-0000-000000000123",
            user_message_id="test-msg-user-123",
            assistant_message_id="test-msg-assistant-123"
        )
    
    monkeypatch.setattr(chat, "store_chat_exchange", mock_store_chat_exchange)
    yield
    reset_collection()


class TestChatConversationalIntegration:
    """Test conversational responses through the chat endpoint."""
    
    def test_greeting_returns_conversational_response(self, client):
        """Test that greetings return friendly conversational responses."""
        response = client.post(
            "/chat",
            json={"question": "Hello"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check response structure
        assert "answer" in data
        assert "citations" in data
        assert "conversation_id" in data
        assert "message_id" in data
        
        # Conversational responses should have no citations
        assert len(data["citations"]) == 0
        assert len(data.get("sources", [])) == 0
        
        # Check answer is friendly and helpful
        answer = data["answer"].lower()
        assert len(data["answer"]) > 20
        assert any(word in answer for word in ["help", "assist", "document"])
    
    def test_how_are_you_returns_conversational_response(self, client):
        """Test wellbeing questions return natural responses."""
        response = client.post(
            "/chat",
            json={"question": "How are you?"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["citations"]) == 0
        answer = data["answer"].lower()
        assert any(word in answer for word in ["ready", "help", "well"])
    
    def test_what_can_you_do_returns_capability_info(self, client):
        """Test capability questions return informative responses."""
        response = client.post(
            "/chat",
            json={"question": "What can you do?"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["citations"]) == 0
        answer = data["answer"].lower()
        assert "document" in answer
        assert any(word in answer for word in ["question", "answer", "search", "find"])
    
    def test_thank_you_returns_polite_response(self, client):
        """Test gratitude expressions return polite responses."""
        response = client.post(
            "/chat",
            json={"question": "Thank you"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["citations"]) == 0
        answer = data["answer"].lower()
        assert any(word in answer for word in ["welcome", "pleasure", "happy"])
    
    def test_nice_to_meet_you_returns_friendly_response(self, client):
        """Test introduction messages return friendly responses."""
        response = client.post(
            "/chat",
            json={"question": "Nice to meet you"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["citations"]) == 0
        answer = data["answer"].lower()
        assert any(word in answer for word in ["meet", "help", "assist"])
    
    def test_who_are_you_returns_identity_info(self, client):
        """Test identity questions return informative responses."""
        response = client.post(
            "/chat",
            json={"question": "Who are you?"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["citations"]) == 0
        answer = data["answer"].lower()
        assert any(word in answer for word in ["assistant", "ai", "help"])
        assert "document" in answer
    
    def test_conversational_response_stored_in_history(self, client):
        """Test that conversational responses are stored in chat history."""
        response = client.post(
            "/chat",
            json={"question": "Hello!"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should have conversation_id and message_id
        assert data["conversation_id"]
        assert data["message_id"]
        assert data["conversation_id"] != "new"
    
    def test_multiple_conversational_queries_in_same_conversation(self, client):
        """Test multiple conversational queries maintain conversation context."""
        # First query
        response1 = client.post(
            "/chat",
            json={"question": "Hi"}
        )
        assert response1.status_code == 200
        data1 = response1.json()
        conversation_id = data1["conversation_id"]
        
        # Second query in same conversation
        response2 = client.post(
            "/chat",
            json={
                "question": "How are you?",
                "conversation_id": conversation_id
            }
        )
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Should be in same conversation
        assert data2["conversation_id"] == conversation_id
        assert len(data2["citations"]) == 0
    
    def test_case_insensitive_conversational_detection(self, client):
        """Test that conversational detection is case-insensitive."""
        queries = ["HELLO", "HoW aRe YoU?", "THANK YOU"]
        
        for query in queries:
            response = client.post(
                "/chat",
                json={"question": query}
            )
            assert response.status_code == 200
            data = response.json()
            assert len(data["citations"]) == 0
    
    def test_conversational_with_punctuation(self, client):
        """Test conversational queries with various punctuation."""
        queries = ["Hello!", "Hi there!", "How are you???", "Thank you!!!"]
        
        for query in queries:
            response = client.post(
                "/chat",
                json={"question": query}
            )
            assert response.status_code == 200
            data = response.json()
            assert len(data["citations"]) == 0


class TestDocumentQueriesStillUseRAG:
    """Test that document queries still use RAG and are not treated as conversational."""
    
    def test_document_question_not_conversational(self, client):
        """Test that document questions are not treated as conversational."""
        # These should attempt RAG retrieval (will fail without documents, but that's expected)
        document_queries = [
            "What is the main topic?",
            "Summarize the abstract",
            "What are the key findings?",
        ]
        
        for query in document_queries:
            response = client.post(
                "/chat",
                json={"question": query}
            )
            
            assert response.status_code == 200
            data = response.json()
            
            # Document queries without documents should return the "no information" message
            # NOT a conversational response
            answer = data["answer"].lower()
            assert "don't have enough information" in answer or "no" in answer
            # Should still have empty citations (no documents available)
            assert len(data["citations"]) == 0
    
    def test_empty_question_rejected(self, client):
        """Test that empty questions are rejected."""
        response = client.post(
            "/chat",
            json={"question": ""}
        )
        
        # Pydantic validation returns 422 for min_length constraint
        assert response.status_code == 422
    
    def test_whitespace_only_question_rejected(self, client):
        """Test that whitespace-only questions are rejected."""
        response = client.post(
            "/chat",
            json={"question": "   "}
        )
        
        assert response.status_code == 400


# Made with Bob
