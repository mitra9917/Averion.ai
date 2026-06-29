import pytest
from fastapi.testclient import TestClient

from app.core.auth import RequestContext, get_request_context
from app.core.config import settings
from app.db.documents import DatabaseNotConfiguredError
from app.db.users import (
    AccountProfile,
    AuthProfileCreate,
    OrganizationInvitation,
    Team,
    TeamMember,
    UserProfile,
    accept_organization_invitation,
    create_organization_invitation,
    get_or_create_user_profile,
    get_user_profile_by_auth_id,
    remove_team_member_from_organization,
    TeamAuthorizationError,
    update_team_member_role
)
from app.main import app


client = TestClient(app)


class FakeCursor:
    def __init__(self, rows):
        self.rows = list(rows)
        self.statements = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, params=None):
        self.statements.append((query, params))

    def fetchone(self):
        return self.rows.pop(0)

    def fetchall(self):
        return self.rows.pop(0)


class FakeConnection:
    def __init__(self, cursor):
        self._cursor = cursor

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self):
        return self._cursor


def test_auth_profile_create_defaults_to_member_role() -> None:
    profile = AuthProfileCreate(
        auth_user_id="00000000-0000-0000-0000-000000000401",
        email="teammate@example.com"
    )

    assert profile.organization_id is None
    assert profile.role == "owner"
    assert profile.name is None
    assert profile.avatar_url is None
    assert profile.job_title is None


def test_user_profile_carries_auth_mapping_fields() -> None:
    profile = UserProfile(
        user_id="00000000-0000-0000-0000-000000000501",
        organization_id=settings.default_organization_id,
        auth_user_id="00000000-0000-0000-0000-000000000401",
        email="teammate@example.com",
        name="Averion Teammate",
        avatar_url="https://example.com/avatar.png",
        job_title="Knowledge Manager",
        role="member"
    )

    assert profile.auth_user_id == "00000000-0000-0000-0000-000000000401"
    assert profile.email == "teammate@example.com"
    assert profile.name == "Averion Teammate"
    assert profile.avatar_url == "https://example.com/avatar.png"
    assert profile.job_title == "Knowledge Manager"


def test_allowed_email_domain_list_normalizes_config() -> None:
    original_domains = settings.allowed_email_domains
    settings.allowed_email_domains = " Gmail.com, googlemail.com ,, Example.com "

    try:
        assert settings.allowed_email_domain_list == [
            "gmail.com",
            "googlemail.com",
            "example.com"
        ]
    finally:
        settings.allowed_email_domains = original_domains


def test_get_user_profile_requires_database(monkeypatch) -> None:
    monkeypatch.setattr("app.db.users.is_database_configured", lambda: False)

    with pytest.raises(DatabaseNotConfiguredError, match="DATABASE_URL is not configured"):
        get_user_profile_by_auth_id("00000000-0000-0000-0000-000000000401")


def test_get_or_create_user_profile_creates_private_owner_workspace(monkeypatch) -> None:
    private_organization_id = "00000000-0000-0000-0000-000000000601"
    created_user_id = "00000000-0000-0000-0000-000000000602"
    cursor = FakeCursor(
        rows=[
            [],
            (private_organization_id,),
            (
                created_user_id,
                private_organization_id,
                "00000000-0000-0000-0000-000000000401",
                "teammate@example.com",
                "Averion Teammate",
                "https://example.com/avatar.png",
                None,
                "owner"
            )
        ]
    )

    monkeypatch.setattr("app.db.users.is_database_configured", lambda: True)
    monkeypatch.setattr(
        "app.db.users.psycopg.connect",
        lambda *_args, **_kwargs: FakeConnection(cursor)
    )

    profile = get_or_create_user_profile(
        AuthProfileCreate(
            auth_user_id="00000000-0000-0000-0000-000000000401",
            email="teammate@example.com",
            name="Averion Teammate",
            avatar_url="https://example.com/avatar.png"
        )
    )

    assert profile.organization_id == private_organization_id
    assert profile.role == "owner"
    assert cursor.statements[1][1] == ("Averion Teammate's Workspace",)
    assert cursor.statements[2][1] == (
        private_organization_id,
        "00000000-0000-0000-0000-000000000401",
        "teammate@example.com",
        "Averion Teammate",
        "https://example.com/avatar.png",
        None,
        "owner"
    )


def test_get_or_create_user_profile_keeps_existing_workspace(monkeypatch) -> None:
    existing_organization_id = "00000000-0000-0000-0000-000000000701"
    existing_user_id = "00000000-0000-0000-0000-000000000702"
    existing_row = (
        existing_user_id,
        existing_organization_id,
        "00000000-0000-0000-0000-000000000401",
        "teammate@example.com",
        "Existing Name",
        None,
        None,
        "member",
        2,
        True
    )
    updated_row = (
        existing_user_id,
        existing_organization_id,
        "00000000-0000-0000-0000-000000000401",
        "teammate@example.com",
        "Existing Name",
        "https://example.com/avatar.png",
        None,
        "member"
    )
    cursor = FakeCursor(rows=[[existing_row], updated_row])

    monkeypatch.setattr("app.db.users.is_database_configured", lambda: True)
    monkeypatch.setattr(
        "app.db.users.psycopg.connect",
        lambda *_args, **_kwargs: FakeConnection(cursor)
    )

    profile = get_or_create_user_profile(
        AuthProfileCreate(
            auth_user_id="00000000-0000-0000-0000-000000000401",
            email="teammate@example.com",
            name="New Name From OAuth",
            avatar_url="https://example.com/avatar.png"
        )
    )

    assert profile.organization_id == existing_organization_id
    assert profile.name == "Existing Name"
    assert profile.role == "member"
    assert len(cursor.statements) == 2


def test_get_or_create_user_profile_merges_duplicate_email_profiles(
    monkeypatch
) -> None:
    shared_organization_id = "00000000-0000-0000-0000-000000000801"
    private_organization_id = "00000000-0000-0000-0000-000000000802"
    shared_user_id = "00000000-0000-0000-0000-000000000803"
    duplicate_user_id = "00000000-0000-0000-0000-000000000804"
    new_auth_user_id = "00000000-0000-0000-0000-000000000805"
    shared_row = (
        shared_user_id,
        shared_organization_id,
        "00000000-0000-0000-0000-000000000701",
        "teammate@example.com",
        "Existing Teammate",
        None,
        None,
        "member",
        3,
        False
    )
    duplicate_row = (
        duplicate_user_id,
        private_organization_id,
        new_auth_user_id,
        "teammate@example.com",
        "Duplicate Teammate",
        None,
        None,
        "owner",
        1,
        True
    )
    updated_row = (
        shared_user_id,
        shared_organization_id,
        new_auth_user_id,
        "teammate@example.com",
        "Existing Teammate",
        "https://example.com/avatar.png",
        None,
        "member"
    )
    cursor = FakeCursor(rows=[[shared_row, duplicate_row], updated_row])

    monkeypatch.setattr("app.db.users.is_database_configured", lambda: True)
    monkeypatch.setattr(
        "app.db.users.psycopg.connect",
        lambda *_args, **_kwargs: FakeConnection(cursor)
    )

    profile = get_or_create_user_profile(
        AuthProfileCreate(
            auth_user_id=new_auth_user_id,
            email="teammate@example.com",
            name="New OAuth Name",
            avatar_url="https://example.com/avatar.png"
        )
    )

    assert profile.user_id == shared_user_id
    assert profile.organization_id == shared_organization_id
    assert profile.role == "member"
    assert any("delete from users" in query for query, _params in cursor.statements)
    assert cursor.statements[-1][1] == (
        new_auth_user_id,
        "teammate@example.com",
        "New OAuth Name",
        "https://example.com/avatar.png",
        None,
        shared_user_id
    )


def test_update_team_member_role_enforces_actor_owner_in_same_organization(monkeypatch) -> None:
    cursor = FakeCursor(
        rows=[
            (
                "00000000-0000-0000-0000-000000000502",
                "member@example.com",
                "Member User",
                None,
                "owner"
            )
        ]
    )

    monkeypatch.setattr("app.db.users.is_database_configured", lambda: True)
    monkeypatch.setattr(
        "app.db.users.psycopg.connect",
        lambda *_args, **_kwargs: FakeConnection(cursor)
    )

    member = update_team_member_role(
        organization_id=settings.default_organization_id,
        actor_user_id="00000000-0000-0000-0000-000000000501",
        user_id="00000000-0000-0000-0000-000000000502",
        role="owner"
    )

    query, params = cursor.statements[0]
    assert member.role == "owner"
    assert "actor.organization_id = users.organization_id" in query
    assert "actor.role = 'owner'" in query
    assert "and id <> %s::uuid" in query
    assert params == (
        "owner",
        "00000000-0000-0000-0000-000000000502",
        settings.default_organization_id,
        "00000000-0000-0000-0000-000000000501",
        "00000000-0000-0000-0000-000000000501"
    )


def test_create_invitation_requires_owner_and_rejects_existing_member_email(monkeypatch) -> None:
    cursor = FakeCursor(
        rows=[
            (
                "00000000-0000-0000-0000-000000000601",
                settings.default_organization_id,
                "Averion.ai",
                "friend@example.com",
                "00000000-0000-0000-0000-000000000501",
                "pending",
                "2026-06-08T00:00:00+00:00",
                "2026-06-01T00:00:00+00:00",
                None,
                None
            )
        ]
    )

    monkeypatch.setattr("app.db.users.is_database_configured", lambda: True)
    monkeypatch.setattr(
        "app.db.users.psycopg.connect",
        lambda *_args, **_kwargs: FakeConnection(cursor)
    )

    invitation = create_organization_invitation(
        organization_id=settings.default_organization_id,
        invited_by_user_id="00000000-0000-0000-0000-000000000501",
        invited_email="Friend@Example.com"
    )

    query, params = cursor.statements[0]
    assert invitation.invited_email == "friend@example.com"
    assert "inviter.role = 'owner'" in query
    assert "inviter.organization_id = %s::uuid" in query
    assert "not exists" in query
    assert "lower(existing_user.email) = %s" in query
    assert params[4:] == (
        "00000000-0000-0000-0000-000000000501",
        settings.default_organization_id,
        settings.default_organization_id,
        "friend@example.com"
    )


def test_create_invitation_raises_when_inviter_is_not_authorized(monkeypatch) -> None:
    cursor = FakeCursor(rows=[None])

    monkeypatch.setattr("app.db.users.is_database_configured", lambda: True)
    monkeypatch.setattr(
        "app.db.users.psycopg.connect",
        lambda *_args, **_kwargs: FakeConnection(cursor)
    )

    with pytest.raises(TeamAuthorizationError):
        create_organization_invitation(
            organization_id=settings.default_organization_id,
            invited_by_user_id="00000000-0000-0000-0000-000000000502",
            invited_email="friend@example.com"
        )


def test_accept_invitation_locks_and_updates_only_matching_pending_email(monkeypatch) -> None:
    target_organization_id = "00000000-0000-0000-0000-000000000777"
    user_id = "00000000-0000-0000-0000-000000000502"
    cursor = FakeCursor(
        rows=[
            (target_organization_id,),
            (
                user_id,
                target_organization_id,
                "00000000-0000-0000-0000-000000000402",
                "friend@example.com",
                "Friend User",
                None,
                None,
                "member",
                "en"
            ),
            ("00000000-0000-0000-0000-000000000601",)
        ]
    )

    monkeypatch.setattr("app.db.users.is_database_configured", lambda: True)
    monkeypatch.setattr(
        "app.db.users.psycopg.connect",
        lambda *_args, **_kwargs: FakeConnection(cursor)
    )

    profile = accept_organization_invitation(
        invitation_id="00000000-0000-0000-0000-000000000601",
        user_id=user_id,
        email="Friend@Example.com"
    )

    invitation_lookup_query, _lookup_params = cursor.statements[0]
    documents_detach_query, documents_detach_params = cursor.statements[1]
    conversations_detach_query, conversations_detach_params = cursor.statements[2]
    sent_invites_revoke_query, sent_invites_revoke_params = cursor.statements[3]
    invitation_update_query, invitation_update_params = cursor.statements[5]
    assert profile.organization_id == target_organization_id
    assert "for update" in invitation_lookup_query
    assert "set uploaded_by_user_id = null" in documents_detach_query
    assert documents_detach_params == (user_id, target_organization_id)
    assert "set user_id = null" in conversations_detach_query
    assert conversations_detach_params == (user_id, target_organization_id)
    assert "status = 'revoked'" in sent_invites_revoke_query
    assert sent_invites_revoke_params == (user_id, target_organization_id)
    assert "and invited_email = %s" in invitation_update_query
    assert "and status = 'pending'" in invitation_update_query
    assert "and expires_at > now()" in invitation_update_query
    assert "returning id::text" in invitation_update_query
    assert invitation_update_params == (
        user_id,
        "00000000-0000-0000-0000-000000000601",
        "friend@example.com"
    )


def test_remove_member_requires_actor_owner_and_same_organization(monkeypatch) -> None:
    user_id = "00000000-0000-0000-0000-000000000502"
    actor_user_id = "00000000-0000-0000-0000-000000000501"
    private_organization_id = "00000000-0000-0000-0000-000000000888"
    cursor = FakeCursor(
        rows=[
            (
                user_id,
                "member@example.com",
                "Member User",
                None,
                "member"
            ),
            (private_organization_id,)
        ]
    )

    monkeypatch.setattr("app.db.users.is_database_configured", lambda: True)
    monkeypatch.setattr(
        "app.db.users.psycopg.connect",
        lambda *_args, **_kwargs: FakeConnection(cursor)
    )

    member = remove_team_member_from_organization(
        organization_id=settings.default_organization_id,
        actor_user_id=actor_user_id,
        user_id=user_id
    )

    query, params = cursor.statements[0]
    assert member.user_id == user_id
    assert "actor.organization_id = users.organization_id" in query
    assert "actor.role = 'owner'" in query
    assert "and id <> %s::uuid" in query
    assert params == (
        user_id,
        settings.default_organization_id,
        actor_user_id,
        actor_user_id
    )


def test_get_current_user_profile_returns_database_profile(monkeypatch) -> None:
    captured_scope = {}

    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id=settings.default_organization_id,
            user_id="00000000-0000-0000-0000-000000000501",
            auth_user_id="00000000-0000-0000-0000-000000000401",
            email="teammate@example.com",
            role="member",
            is_authenticated=True
        )

    def fake_get_account_profile(*, user_id: str, organization_id: str):
        captured_scope["user_id"] = user_id
        captured_scope["organization_id"] = organization_id

        return AccountProfile(
            user_id=user_id,
            organization_id=organization_id,
            organization_name="Development Organization",
            auth_user_id="00000000-0000-0000-0000-000000000401",
            email="teammate@example.com",
            name="Averion Teammate",
            avatar_url="https://example.com/avatar.png",
            job_title="Knowledge Manager",
            role="member"
        )

    monkeypatch.setattr("app.api.users.get_account_profile", fake_get_account_profile)
    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.get("/users/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert captured_scope == {
        "user_id": "00000000-0000-0000-0000-000000000501",
        "organization_id": settings.default_organization_id
    }
    assert response.json()["email"] == "teammate@example.com"
    assert response.json()["name"] == "Averion Teammate"
    assert response.json()["job_title"] == "Knowledge Manager"
    assert response.json()["organization_name"] == "Development Organization"


def test_update_current_user_profile_updates_editable_fields(monkeypatch) -> None:
    captured_update = {}

    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id=settings.default_organization_id,
            user_id="00000000-0000-0000-0000-000000000501",
            auth_user_id="00000000-0000-0000-0000-000000000401",
            email="teammate@example.com",
            role="member",
            is_authenticated=True
        )

    def fake_update_account_profile(profile):
        captured_update["user_id"] = profile.user_id
        captured_update["organization_id"] = profile.organization_id
        captured_update["name"] = profile.name
        captured_update["job_title"] = profile.job_title

        return AccountProfile(
            user_id=profile.user_id,
            organization_id=profile.organization_id,
            organization_name="Development Organization",
            auth_user_id="00000000-0000-0000-0000-000000000401",
            email="teammate@example.com",
            name=profile.name,
            avatar_url=None,
            job_title=profile.job_title,
            role="member"
        )

    monkeypatch.setattr("app.api.users.update_account_profile", fake_update_account_profile)
    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.patch(
            "/users/me",
            json={
                "name": "  Shubham Mitra  ",
                "job_title": "  Founder  "
            }
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert captured_update == {
        "user_id": "00000000-0000-0000-0000-000000000501",
        "organization_id": settings.default_organization_id,
        "name": "Shubham Mitra",
        "job_title": "Founder"
    }
    assert response.json()["name"] == "Shubham Mitra"
    assert response.json()["job_title"] == "Founder"


def test_update_current_user_profile_requires_profile() -> None:
    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id=settings.default_organization_id,
            user_id=None,
            auth_user_id=None,
            email=None,
            role=None,
            is_authenticated=False
        )

    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.patch(
            "/users/me",
            json={
                "name": "Averion Teammate",
                "job_title": "Knowledge Manager"
            }
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401


def test_get_current_user_team_returns_organization_members(monkeypatch) -> None:
    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id=settings.default_organization_id,
            user_id="00000000-0000-0000-0000-000000000501",
            auth_user_id="00000000-0000-0000-0000-000000000401",
            email="owner@example.com",
            role="owner",
            is_authenticated=True
        )

    def fake_get_team(organization_id: str):
        assert organization_id == settings.default_organization_id

        return Team(
            organization_id=organization_id,
            organization_name="Averion.ai",
            members=[
                TeamMember(
                    user_id="00000000-0000-0000-0000-000000000501",
                    email="owner@example.com",
                    name="Owner User",
                    job_title="Founder",
                    role="owner"
                ),
                TeamMember(
                    user_id="00000000-0000-0000-0000-000000000502",
                    email="member@example.com",
                    name="Member User",
                    job_title=None,
                    role="member"
                )
            ]
        )

    monkeypatch.setattr("app.api.users.get_team", fake_get_team)
    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.get("/users/team")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["organization_name"] == "Averion.ai"
    assert [member["role"] for member in response.json()["members"]] == [
        "owner",
        "member"
    ]


def test_member_cannot_update_organization_name() -> None:
    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id=settings.default_organization_id,
            user_id="00000000-0000-0000-0000-000000000502",
            auth_user_id="00000000-0000-0000-0000-000000000402",
            email="member@example.com",
            role="member",
            is_authenticated=True
        )

    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.patch(
            "/users/organization",
            json={"name": "Averion.ai"}
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Only organization owners can manage workspace settings."
    }


def test_owner_can_update_organization_name(monkeypatch) -> None:
    captured_update = {}

    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id=settings.default_organization_id,
            user_id="00000000-0000-0000-0000-000000000501",
            auth_user_id="00000000-0000-0000-0000-000000000401",
            email="owner@example.com",
            role="owner",
            is_authenticated=True
        )

    def fake_update_organization_name(*, organization_id: str, actor_user_id: str, name: str):
        captured_update["organization_id"] = organization_id
        captured_update["actor_user_id"] = actor_user_id
        captured_update["name"] = name

        return Team(
            organization_id=organization_id,
            organization_name=name,
            members=[]
        )

    monkeypatch.setattr(
        "app.api.users.update_organization_name",
        fake_update_organization_name
    )
    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.patch(
            "/users/organization",
            json={"name": "  Averion.ai  "}
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert captured_update == {
        "organization_id": settings.default_organization_id,
        "actor_user_id": "00000000-0000-0000-0000-000000000501",
        "name": "Averion.ai"
    }
    assert response.json()["organization_name"] == "Averion.ai"


def test_owner_can_update_team_member_role(monkeypatch) -> None:
    captured_update = {}

    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id=settings.default_organization_id,
            user_id="00000000-0000-0000-0000-000000000501",
            auth_user_id="00000000-0000-0000-0000-000000000401",
            email="owner@example.com",
            role="owner",
            is_authenticated=True
        )

    def fake_update_team_member_role(*, organization_id: str, actor_user_id: str, user_id: str, role: str):
        captured_update["organization_id"] = organization_id
        captured_update["actor_user_id"] = actor_user_id
        captured_update["user_id"] = user_id
        captured_update["role"] = role

        return TeamMember(
            user_id=user_id,
            email="member@example.com",
            name="Member User",
            job_title=None,
            role=role
        )

    monkeypatch.setattr(
        "app.api.users.update_team_member_role",
        fake_update_team_member_role
    )
    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.patch(
            "/users/team/00000000-0000-0000-0000-000000000502/role",
            json={"role": "owner"}
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert captured_update == {
        "organization_id": settings.default_organization_id,
        "actor_user_id": "00000000-0000-0000-0000-000000000501",
        "user_id": "00000000-0000-0000-0000-000000000502",
        "role": "owner"
    }
    assert response.json()["role"] == "owner"


def test_owner_can_demote_another_owner(monkeypatch) -> None:
    captured_update = {}

    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id=settings.default_organization_id,
            user_id="00000000-0000-0000-0000-000000000501",
            auth_user_id="00000000-0000-0000-0000-000000000401",
            email="owner@example.com",
            role="owner",
            is_authenticated=True
        )

    def fake_update_team_member_role(*, organization_id: str, actor_user_id: str, user_id: str, role: str):
        captured_update["organization_id"] = organization_id
        captured_update["actor_user_id"] = actor_user_id
        captured_update["user_id"] = user_id
        captured_update["role"] = role

        return TeamMember(
            user_id=user_id,
            email="co-owner@example.com",
            name="Co Owner",
            job_title=None,
            role=role
        )

    monkeypatch.setattr(
        "app.api.users.update_team_member_role",
        fake_update_team_member_role
    )
    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.patch(
            "/users/team/00000000-0000-0000-0000-000000000503/role",
            json={"role": "member"}
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert captured_update == {
        "organization_id": settings.default_organization_id,
        "actor_user_id": "00000000-0000-0000-0000-000000000501",
        "user_id": "00000000-0000-0000-0000-000000000503",
        "role": "member"
    }
    assert response.json()["role"] == "member"


def test_member_cannot_update_team_member_role() -> None:
    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id=settings.default_organization_id,
            user_id="00000000-0000-0000-0000-000000000502",
            auth_user_id="00000000-0000-0000-0000-000000000402",
            email="member@example.com",
            role="member",
            is_authenticated=True
        )

    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.patch(
            "/users/team/00000000-0000-0000-0000-000000000501/role",
            json={"role": "member"}
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Only organization owners can manage workspace settings."
    }


def test_owner_cannot_update_own_role() -> None:
    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id=settings.default_organization_id,
            user_id="00000000-0000-0000-0000-000000000501",
            auth_user_id="00000000-0000-0000-0000-000000000401",
            email="owner@example.com",
            role="owner",
            is_authenticated=True
        )

    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.patch(
            "/users/team/00000000-0000-0000-0000-000000000501/role",
            json={"role": "member"}
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json() == {"detail": "Owners cannot change their own role."}


def test_owner_can_create_organization_invitation(monkeypatch) -> None:
    captured_invitation = {}

    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id=settings.default_organization_id,
            user_id="00000000-0000-0000-0000-000000000501",
            auth_user_id="00000000-0000-0000-0000-000000000401",
            email="owner@example.com",
            role="owner",
            is_authenticated=True
        )

    def fake_create_organization_invitation(
        *,
        organization_id: str,
        invited_by_user_id: str,
        invited_email: str
    ):
        captured_invitation["organization_id"] = organization_id
        captured_invitation["invited_by_user_id"] = invited_by_user_id
        captured_invitation["invited_email"] = invited_email

        return OrganizationInvitation(
            invitation_id="00000000-0000-0000-0000-000000000601",
            organization_id=organization_id,
            organization_name="Averion.ai",
            invited_email=invited_email,
            invited_by_user_id=invited_by_user_id,
            status="pending",
            expires_at="2026-06-08T00:00:00+00:00",
            created_at="2026-06-01T00:00:00+00:00"
        )

    monkeypatch.setattr(
        "app.api.users.create_organization_invitation",
        fake_create_organization_invitation
    )
    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.post(
            "/users/invitations",
            json={"email": "  Friend@Example.com  "}
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert captured_invitation == {
        "organization_id": settings.default_organization_id,
        "invited_by_user_id": "00000000-0000-0000-0000-000000000501",
        "invited_email": "friend@example.com"
    }
    assert response.json()["status"] == "pending"


def test_member_cannot_create_organization_invitation() -> None:
    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id=settings.default_organization_id,
            user_id="00000000-0000-0000-0000-000000000502",
            auth_user_id="00000000-0000-0000-0000-000000000402",
            email="member@example.com",
            role="member",
            is_authenticated=True
        )

    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.post(
            "/users/invitations",
            json={"email": "friend@example.com"}
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


def test_user_can_accept_matching_invitation(monkeypatch) -> None:
    captured_accept = {}

    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id="00000000-0000-0000-0000-000000000777",
            user_id="00000000-0000-0000-0000-000000000502",
            auth_user_id="00000000-0000-0000-0000-000000000402",
            email="friend@example.com",
            role="owner",
            is_authenticated=True
        )

    def fake_accept_organization_invitation(
        *,
        invitation_id: str,
        user_id: str,
        email: str
    ):
        captured_accept["invitation_id"] = invitation_id
        captured_accept["user_id"] = user_id
        captured_accept["email"] = email

        return UserProfile(
            user_id=user_id,
            organization_id=settings.default_organization_id,
            auth_user_id="00000000-0000-0000-0000-000000000402",
            email=email,
            name="Friend User",
            avatar_url=None,
            job_title=None,
            role="member"
        )

    monkeypatch.setattr(
        "app.api.users.accept_organization_invitation",
        fake_accept_organization_invitation
    )
    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.post(
            "/users/invitations/00000000-0000-0000-0000-000000000601/accept"
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert captured_accept == {
        "invitation_id": "00000000-0000-0000-0000-000000000601",
        "user_id": "00000000-0000-0000-0000-000000000502",
        "email": "friend@example.com"
    }
    assert response.json()["organization_id"] == settings.default_organization_id
    assert response.json()["role"] == "member"


def test_owner_can_remove_team_member(monkeypatch) -> None:
    captured_remove = {}

    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id=settings.default_organization_id,
            user_id="00000000-0000-0000-0000-000000000501",
            auth_user_id="00000000-0000-0000-0000-000000000401",
            email="owner@example.com",
            role="owner",
            is_authenticated=True
        )

    def fake_remove_team_member_from_organization(
        *,
        organization_id: str,
        actor_user_id: str,
        user_id: str
    ):
        captured_remove["organization_id"] = organization_id
        captured_remove["actor_user_id"] = actor_user_id
        captured_remove["user_id"] = user_id

        return TeamMember(
            user_id=user_id,
            email="member@example.com",
            name="Member User",
            job_title=None,
            role="member"
        )

    monkeypatch.setattr(
        "app.api.users.remove_team_member_from_organization",
        fake_remove_team_member_from_organization
    )
    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.delete(
            "/users/team/00000000-0000-0000-0000-000000000502"
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert captured_remove == {
        "organization_id": settings.default_organization_id,
        "actor_user_id": "00000000-0000-0000-0000-000000000501",
        "user_id": "00000000-0000-0000-0000-000000000502"
    }
    assert response.json()["email"] == "member@example.com"


def test_owner_cannot_remove_self() -> None:
    def fake_context() -> RequestContext:
        return RequestContext(
            organization_id=settings.default_organization_id,
            user_id="00000000-0000-0000-0000-000000000501",
            auth_user_id="00000000-0000-0000-0000-000000000401",
            email="owner@example.com",
            role="owner",
            is_authenticated=True
        )

    app.dependency_overrides[get_request_context] = fake_context

    try:
        response = client.delete(
            "/users/team/00000000-0000-0000-0000-000000000501"
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json() == {"detail": "Owners cannot remove themselves."}
