from fastapi.testclient import TestClient

from app.core.auth import RequestContext, get_request_context
from app.core.config import settings
from app.db.documents import DatabaseNotConfiguredError
from app.db.feedback import FeedbackMessageNotFoundError, FeedbackRecord
from app.db.schema import FeedbackRating
from app.main import app


client = TestClient(app)


def test_create_feedback_stores_assistant_message_feedback(monkeypatch) -> None:
    stored_payload = {}

    def fake_store_feedback(feedback) -> FeedbackRecord:
        stored_payload["message_id"] = feedback.message_id
        stored_payload["organization_id"] = feedback.organization_id
        stored_payload["rating"] = feedback.rating
        stored_payload["user_id"] = feedback.user_id
        stored_payload["correction_text"] = feedback.correction_text

        return FeedbackRecord(
            feedback_id="00000000-0000-0000-0000-000000000201",
            message_id=feedback.message_id,
            user_id=feedback.user_id,
            rating=feedback.rating,
            correction_text=feedback.correction_text,
            created_at="2026-05-20 10:00:00+00"
        )

    monkeypatch.setattr("app.api.feedback.store_feedback", fake_store_feedback)

    response = client.post(
        "/feedback",
        json={
            "message_id": "00000000-0000-0000-0000-000000000101",
            "rating": "down",
            "correction_text": "Use the source quote from page 2."
        }
    )

    assert response.status_code == 201
    assert response.json() == {
        "feedback_id": "00000000-0000-0000-0000-000000000201",
        "message_id": "00000000-0000-0000-0000-000000000101",
        "user_id": None,
        "rating": "down",
        "correction_text": "Use the source quote from page 2.",
        "created_at": "2026-05-20 10:00:00+00"
    }
    assert stored_payload == {
        "message_id": "00000000-0000-0000-0000-000000000101",
        "organization_id": settings.default_organization_id,
        "rating": FeedbackRating.DOWN,
        "user_id": None,
        "correction_text": "Use the source quote from page 2."
    }


def test_create_feedback_uses_authenticated_user_id(monkeypatch) -> None:
    stored_payload = {}

    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id=settings.default_organization_id,
            user_id="00000000-0000-0000-0000-000000000921",
            auth_user_id="00000000-0000-0000-0000-000000000922",
            email="teammate@example.com",
            role="member",
            is_authenticated=True
        )

    def fake_store_feedback(feedback) -> FeedbackRecord:
        stored_payload["organization_id"] = feedback.organization_id
        stored_payload["user_id"] = feedback.user_id

        return FeedbackRecord(
            feedback_id="00000000-0000-0000-0000-000000000204",
            message_id=feedback.message_id,
            user_id=feedback.user_id,
            rating=feedback.rating,
            correction_text=feedback.correction_text,
            created_at="2026-05-20 10:04:00+00"
        )

    monkeypatch.setattr("app.api.feedback.store_feedback", fake_store_feedback)
    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.post(
            "/feedback",
            json={
                "message_id": "00000000-0000-0000-0000-000000000101",
                "rating": "up"
            }
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["user_id"] == "00000000-0000-0000-0000-000000000921"
    assert stored_payload == {
        "organization_id": settings.default_organization_id,
        "user_id": "00000000-0000-0000-0000-000000000921"
    }


def test_create_feedback_normalizes_empty_correction_text(monkeypatch) -> None:
    stored_payload = {}

    def fake_store_feedback(feedback) -> FeedbackRecord:
        stored_payload["correction_text"] = feedback.correction_text

        return FeedbackRecord(
            feedback_id="00000000-0000-0000-0000-000000000202",
            message_id=feedback.message_id,
            user_id=None,
            rating=feedback.rating,
            correction_text=feedback.correction_text,
            created_at="2026-05-20 10:01:00+00"
        )

    monkeypatch.setattr("app.api.feedback.store_feedback", fake_store_feedback)

    response = client.post(
        "/feedback",
        json={
            "message_id": "00000000-0000-0000-0000-000000000102",
            "rating": "up",
            "correction_text": "   "
        }
    )

    assert response.status_code == 201
    assert response.json()["correction_text"] is None
    assert stored_payload["correction_text"] is None


def test_create_feedback_returns_404_for_unknown_message(monkeypatch) -> None:
    def fake_store_feedback(feedback) -> FeedbackRecord:
        raise FeedbackMessageNotFoundError("Assistant message not found for feedback.")

    monkeypatch.setattr("app.api.feedback.store_feedback", fake_store_feedback)

    response = client.post(
        "/feedback",
        json={
            "message_id": "00000000-0000-0000-0000-000000000999",
            "rating": "up"
        }
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Assistant message not found for feedback."}


def test_create_feedback_returns_422_for_invalid_rating() -> None:
    response = client.post(
        "/feedback",
        json={
            "message_id": "00000000-0000-0000-0000-000000000101",
            "rating": "maybe"
        }
    )

    assert response.status_code == 422


def test_create_feedback_returns_503_when_database_is_not_configured(monkeypatch) -> None:
    def fake_store_feedback(feedback) -> FeedbackRecord:
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    monkeypatch.setattr("app.api.feedback.store_feedback", fake_store_feedback)

    response = client.post(
        "/feedback",
        json={
            "message_id": "00000000-0000-0000-0000-000000000101",
            "rating": "up"
        }
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "DATABASE_URL is not configured."}


def test_list_feedback_returns_queryable_records(monkeypatch) -> None:
    def fake_list_feedback(*, organization_id: str, limit: int) -> list[FeedbackRecord]:
        assert organization_id == settings.default_organization_id
        assert limit == 2

        return [
            FeedbackRecord(
                feedback_id="00000000-0000-0000-0000-000000000203",
                message_id="00000000-0000-0000-0000-000000000103",
                user_id=None,
                rating=FeedbackRating.DOWN,
                correction_text="Answer should mention onboarding.",
                created_at="2026-05-20 10:02:00+00"
            )
        ]

    monkeypatch.setattr("app.api.feedback.list_feedback", fake_list_feedback)

    response = client.get("/feedback?limit=2")

    assert response.status_code == 200
    assert response.json() == [
        {
            "feedback_id": "00000000-0000-0000-0000-000000000203",
            "message_id": "00000000-0000-0000-0000-000000000103",
            "user_id": None,
            "rating": "down",
            "correction_text": "Answer should mention onboarding.",
            "created_at": "2026-05-20 10:02:00+00"
        }
    ]
