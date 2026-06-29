from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import psycopg

from app.core.config import settings
from app.db.connection import is_database_configured
from app.db.documents import DatabaseNotConfiguredError


@dataclass(frozen=True)
class UserProfile:
    user_id: str
    organization_id: str
    auth_user_id: str | None
    email: str
    name: str | None
    avatar_url: str | None
    job_title: str | None
    role: str
    language_preference: str = "en"


@dataclass(frozen=True)
class AuthProfileCreate:
    auth_user_id: str
    email: str
    organization_id: str | None = None
    name: str | None = None
    avatar_url: str | None = None
    job_title: str | None = None
    role: str = "owner"
    organization_name: str | None = None


@dataclass(frozen=True)
class AccountProfile:
    user_id: str
    organization_id: str
    organization_name: str | None
    auth_user_id: str | None
    email: str
    name: str | None
    avatar_url: str | None
    job_title: str | None
    role: str
    language_preference: str = "en"


@dataclass(frozen=True)
class AccountProfileUpdate:
    user_id: str
    organization_id: str
    name: str | None
    job_title: str | None
    language_preference: str | None = None


@dataclass(frozen=True)
class TeamMember:
    user_id: str
    email: str
    name: str | None
    job_title: str | None
    role: str


@dataclass(frozen=True)
class Team:
    organization_id: str
    organization_name: str
    members: list[TeamMember]


@dataclass(frozen=True)
class OrganizationInvitation:
    invitation_id: str
    organization_id: str
    organization_name: str
    invited_email: str
    invited_by_user_id: str
    status: str
    expires_at: str
    created_at: str
    accepted_at: str | None = None
    accepted_by_user_id: str | None = None


class TeamAuthorizationError(RuntimeError):
    pass


def _ensure_organization(
    cursor,
    organization_id: str,
    name: str = "Development Organization"
) -> None:
    cursor.execute(
        """
        insert into organizations (id, name)
        values (%s::uuid, %s)
        on conflict (id) do nothing
        """,
        (
            organization_id,
            name
        )
    )


def _workspace_name_for_profile(profile: AuthProfileCreate) -> str:
    if profile.organization_name and profile.organization_name.strip():
        return profile.organization_name.strip()

    if profile.name and profile.name.strip():
        return f"{profile.name.strip()}'s Workspace"

    email_name = profile.email.split("@", maxsplit=1)[0].strip()
    return f"{email_name or 'Averion'}'s Workspace"


def _row_to_user_profile(row) -> UserProfile:
    return UserProfile(
        user_id=row[0],
        organization_id=row[1],
        auth_user_id=row[2],
        email=row[3],
        name=row[4],
        avatar_url=row[5],
        job_title=row[6],
        role=row[7],
        language_preference=row[8] if len(row) > 8 else "en"
    )


def _row_to_account_profile(row) -> AccountProfile:
    return AccountProfile(
        user_id=row[0],
        organization_id=row[1],
        organization_name=row[2],
        auth_user_id=row[3],
        email=row[4],
        name=row[5],
        avatar_url=row[6],
        job_title=row[7],
        role=row[8],
        language_preference=row[9] if len(row) > 9 else "en"
    )


def _row_to_team_member(row) -> TeamMember:
    return TeamMember(
        user_id=row[0],
        email=row[1],
        name=row[2],
        job_title=row[3],
        role=row[4]
    )


def _row_to_invitation(row) -> OrganizationInvitation:
    return OrganizationInvitation(
        invitation_id=row[0],
        organization_id=row[1],
        organization_name=row[2],
        invited_email=row[3],
        invited_by_user_id=row[4],
        status=row[5],
        expires_at=row[6],
        created_at=row[7],
        accepted_at=row[8],
        accepted_by_user_id=row[9]
    )


def _private_workspace_name_for_member(email: str, name: str | None) -> str:
    if name and name.strip():
        return f"{name.strip()}'s Workspace"

    email_name = email.split("@", maxsplit=1)[0].strip()
    return f"{email_name or 'Averion'}'s Workspace"


def _merge_duplicate_user_profiles(
    cursor,
    primary_user_id: str,
    duplicate_user_ids: list[str]
) -> None:
    if not duplicate_user_ids:
        return

    cursor.execute(
        """
        update documents
        set uploaded_by_user_id = %s::uuid
        where uploaded_by_user_id = any(%s::uuid[])
        """,
        (
            primary_user_id,
            duplicate_user_ids
        )
    )
    cursor.execute(
        """
        update conversations
        set user_id = %s::uuid
        where user_id = any(%s::uuid[])
        """,
        (
            primary_user_id,
            duplicate_user_ids
        )
    )
    cursor.execute(
        """
        update feedback
        set user_id = %s::uuid
        where user_id = any(%s::uuid[])
        """,
        (
            primary_user_id,
            duplicate_user_ids
        )
    )
    cursor.execute(
        """
        update organization_invitations
        set invited_by_user_id = %s::uuid
        where invited_by_user_id = any(%s::uuid[])
        """,
        (
            primary_user_id,
            duplicate_user_ids
        )
    )
    cursor.execute(
        """
        update organization_invitations
        set accepted_by_user_id = %s::uuid
        where accepted_by_user_id = any(%s::uuid[])
        """,
        (
            primary_user_id,
            duplicate_user_ids
        )
    )
    cursor.execute(
        """
        delete from users
        where id = any(%s::uuid[])
        """,
        (duplicate_user_ids,)
    )


def get_user_profile_by_auth_id(auth_user_id: str) -> UserProfile | None:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                    id::text,
                    organization_id::text,
                    auth_user_id::text,
                    email,
                    name,
                    avatar_url,
                    job_title,
                    role,
                    language_preference
                from users
                where auth_user_id = %s::uuid
                """,
                (auth_user_id,)
            )

            row = cursor.fetchone()
            return _row_to_user_profile(row) if row else None


def get_account_profile(
    *,
    user_id: str,
    organization_id: str
) -> AccountProfile | None:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                    users.id::text,
                    users.organization_id::text,
                    organizations.name,
                    users.auth_user_id::text,
                    users.email,
                    users.name,
                    users.avatar_url,
                    users.job_title,
                    users.role,
                    users.language_preference
                from users
                join organizations
                    on organizations.id = users.organization_id
                where users.id = %s::uuid
                    and users.organization_id = %s::uuid
                """,
                (
                    user_id,
                    organization_id
                )
            )

            row = cursor.fetchone()
            return _row_to_account_profile(row) if row else None


def get_team(organization_id: str) -> Team | None:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select id::text, name
                from organizations
                where id = %s::uuid
                """,
                (organization_id,)
            )
            organization_row = cursor.fetchone()

            if organization_row is None:
                return None

            cursor.execute(
                """
                select
                    id::text,
                    email,
                    name,
                    job_title,
                    role
                from users
                where organization_id = %s::uuid
                order by
                    case when role = 'owner' then 0 else 1 end,
                    email
                """,
                (organization_id,)
            )

            return Team(
                organization_id=organization_row[0],
                organization_name=organization_row[1],
                members=[
                    _row_to_team_member(row)
                    for row in cursor.fetchall()
                ]
            )


def update_organization_name(
    *,
    organization_id: str,
    actor_user_id: str,
    name: str
) -> Team | None:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update organizations
                set name = %s,
                    updated_at = now()
                where id = %s::uuid
                    and exists (
                        select 1
                        from users
                        where users.id = %s::uuid
                            and users.organization_id = organizations.id
                            and users.role = 'owner'
                    )
                returning id::text
                """,
                (
                    name,
                    organization_id,
                    actor_user_id
                )
            )

            if cursor.fetchone() is None:
                raise TeamAuthorizationError("Only organization owners can manage workspace settings.")

    return get_team(organization_id)


def update_team_member_role(
    *,
    organization_id: str,
    actor_user_id: str,
    user_id: str,
    role: str
) -> TeamMember | None:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update users
                set role = %s,
                    updated_at = now()
                where id = %s::uuid
                    and organization_id = %s::uuid
                    and id <> %s::uuid
                    and exists (
                        select 1
                        from users as actor
                        where actor.id = %s::uuid
                            and actor.organization_id = users.organization_id
                            and actor.role = 'owner'
                    )
                returning
                    id::text,
                    email,
                    name,
                    job_title,
                    role
                """,
                (
                    role,
                    user_id,
                    organization_id,
                    actor_user_id,
                    actor_user_id
                )
            )

            row = cursor.fetchone()
            return _row_to_team_member(row) if row else None


def create_organization_invitation(
    *,
    organization_id: str,
    invited_by_user_id: str,
    invited_email: str
) -> OrganizationInvitation:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    normalized_email = invited_email.strip().lower()
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into organization_invitations (
                    organization_id,
                    invited_email,
                    invited_by_user_id,
                    expires_at
                )
                select %s::uuid, %s, %s::uuid, %s
                from users as inviter
                where inviter.id = %s::uuid
                    and inviter.organization_id = %s::uuid
                    and inviter.role = 'owner'
                    and not exists (
                        select 1
                        from users as existing_user
                        where existing_user.organization_id = %s::uuid
                            and lower(existing_user.email) = %s
                    )
                on conflict (organization_id, invited_email)
                    where status = 'pending'
                do update set
                    invited_by_user_id = excluded.invited_by_user_id,
                    expires_at = excluded.expires_at,
                    updated_at = now()
                returning
                    organization_invitations.id::text,
                    organization_invitations.organization_id::text,
                    (
                        select organizations.name
                        from organizations
                        where organizations.id = organization_invitations.organization_id
                    ),
                    organization_invitations.invited_email,
                    organization_invitations.invited_by_user_id::text,
                    organization_invitations.status,
                    organization_invitations.expires_at::text,
                    organization_invitations.created_at::text,
                    organization_invitations.accepted_at::text,
                    organization_invitations.accepted_by_user_id::text
                """,
                (
                    organization_id,
                    normalized_email,
                    invited_by_user_id,
                    expires_at,
                    invited_by_user_id,
                    organization_id,
                    organization_id,
                    normalized_email
                )
            )

            row = cursor.fetchone()
            if row is None:
                raise TeamAuthorizationError("Invitation could not be created for this organization.")

            return _row_to_invitation(row)


def list_pending_invitations_for_email(email: str) -> list[OrganizationInvitation]:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    normalized_email = email.strip().lower()

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                    organization_invitations.id::text,
                    organization_invitations.organization_id::text,
                    organizations.name,
                    organization_invitations.invited_email,
                    organization_invitations.invited_by_user_id::text,
                    organization_invitations.status,
                    organization_invitations.expires_at::text,
                    organization_invitations.created_at::text,
                    organization_invitations.accepted_at::text,
                    organization_invitations.accepted_by_user_id::text
                from organization_invitations
                join organizations
                    on organizations.id = organization_invitations.organization_id
                where organization_invitations.invited_email = %s
                    and organization_invitations.status = 'pending'
                    and organization_invitations.expires_at > now()
                order by organization_invitations.created_at desc
                """,
                (normalized_email,)
            )

            return [
                _row_to_invitation(row)
                for row in cursor.fetchall()
            ]


def accept_organization_invitation(
    *,
    invitation_id: str,
    user_id: str,
    email: str
) -> UserProfile | None:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    normalized_email = email.strip().lower()

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select organization_id::text
                from organization_invitations
                where id = %s::uuid
                    and invited_email = %s
                    and status = 'pending'
                    and expires_at > now()
                for update
                """,
                (
                    invitation_id,
                    normalized_email
                )
            )
            invitation_row = cursor.fetchone()

            if invitation_row is None:
                return None

            target_organization_id = invitation_row[0]

            cursor.execute(
                """
                update documents
                set uploaded_by_user_id = null
                where uploaded_by_user_id = %s::uuid
                    and organization_id <> %s::uuid
                """,
                (
                    user_id,
                    target_organization_id
                )
            )
            cursor.execute(
                """
                update conversations
                set user_id = null
                where user_id = %s::uuid
                    and organization_id <> %s::uuid
                """,
                (
                    user_id,
                    target_organization_id
                )
            )
            cursor.execute(
                """
                update organization_invitations
                set
                    status = 'revoked',
                    updated_at = now()
                where invited_by_user_id = %s::uuid
                    and organization_id <> %s::uuid
                    and status = 'pending'
                """,
                (
                    user_id,
                    target_organization_id
                )
            )

            cursor.execute(
                """
                update users
                set
                    organization_id = %s::uuid,
                    role = 'member',
                    updated_at = now()
                where id = %s::uuid
                    and email = %s
                returning
                    id::text,
                    organization_id::text,
                    auth_user_id::text,
                    email,
                    name,
                    avatar_url,
                    job_title,
                    role,
                    language_preference
                """,
                (
                    target_organization_id,
                    user_id,
                    normalized_email
                )
            )
            user_row = cursor.fetchone()

            if user_row is None:
                return None

            cursor.execute(
                """
                update organization_invitations
                set
                    status = 'accepted',
                    accepted_at = now(),
                    accepted_by_user_id = %s::uuid,
                    updated_at = now()
                where id = %s::uuid
                    and invited_email = %s
                    and status = 'pending'
                    and expires_at > now()
                returning id::text
                """,
                (
                    user_id,
                    invitation_id,
                    normalized_email
                )
            )
            if cursor.fetchone() is None:
                return None

            return _row_to_user_profile(user_row)


def remove_team_member_from_organization(
    *,
    organization_id: str,
    actor_user_id: str,
    user_id: str
) -> TeamMember | None:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                    id::text,
                    email,
                    name,
                    job_title,
                    role
                from users
                where id = %s::uuid
                    and organization_id = %s::uuid
                    and id <> %s::uuid
                    and exists (
                        select 1
                        from users as actor
                        where actor.id = %s::uuid
                            and actor.organization_id = users.organization_id
                            and actor.role = 'owner'
                    )
                """,
                (
                    user_id,
                    organization_id,
                    actor_user_id,
                    actor_user_id
                )
            )
            member_row = cursor.fetchone()

            if member_row is None:
                return None

            removed_member = _row_to_team_member(member_row)

            cursor.execute(
                """
                insert into organizations (name)
                values (%s)
                returning id::text
                """,
                (
                    _private_workspace_name_for_member(
                        removed_member.email,
                        removed_member.name
                    ),
                )
            )
            private_organization_id = cursor.fetchone()[0]

            cursor.execute(
                """
                update users
                set
                    organization_id = %s::uuid,
                    role = 'owner',
                    updated_at = now()
                where id = %s::uuid
                """,
                (
                    private_organization_id,
                    user_id
                )
            )

            return removed_member


def update_account_profile(profile: AccountProfileUpdate) -> AccountProfile | None:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update users
                set
                    name = %s,
                    job_title = %s,
                    language_preference = coalesce(%s, language_preference),
                    updated_at = now()
                where id = %s::uuid
                    and organization_id = %s::uuid
                returning
                    id::text,
                    organization_id::text,
                    (
                        select organizations.name
                        from organizations
                        where organizations.id = users.organization_id
                    ),
                    auth_user_id::text,
                    email,
                    name,
                    avatar_url,
                    job_title,
                    role,
                    language_preference
                """,
                (
                    profile.name,
                    profile.job_title,
                    profile.language_preference,
                    profile.user_id,
                    profile.organization_id
                )
            )

            row = cursor.fetchone()
            return _row_to_account_profile(row) if row else None


def get_or_create_user_profile(profile: AuthProfileCreate) -> UserProfile:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                    users.id::text,
                    users.organization_id::text,
                    users.auth_user_id::text,
                    users.email,
                    users.name,
                    users.avatar_url,
                    users.job_title,
                    users.role,
                    users.language_preference,
                    count(organization_users.id) as organization_member_count,
                    users.auth_user_id = %s::uuid as is_current_auth_user
                from users
                left join users as organization_users
                    on organization_users.organization_id = users.organization_id
                where users.auth_user_id = %s::uuid
                    or lower(users.email) = lower(%s)
                group by users.id
                order by
                    count(organization_users.id) desc,
                    is_current_auth_user desc,
                    users.updated_at desc
                """,
                (
                    profile.auth_user_id,
                    profile.auth_user_id,
                    profile.email
                )
            )
            identity_rows = cursor.fetchall()

            if identity_rows:
                primary_row = identity_rows[0]
                duplicate_user_ids = [row[0] for row in identity_rows[1:]]
                _merge_duplicate_user_profiles(
                    cursor,
                    primary_user_id=primary_row[0],
                    duplicate_user_ids=duplicate_user_ids
                )
                cursor.execute(
                    """
                    update users
                    set
                        auth_user_id = %s::uuid,
                        email = %s,
                        name = coalesce(%s, name),
                        avatar_url = coalesce(%s, avatar_url),
                        job_title = coalesce(%s, job_title),
                        updated_at = now()
                    where id = %s::uuid
                    returning
                        id::text,
                        organization_id::text,
                        auth_user_id::text,
                        email,
                        name,
                        avatar_url,
                        job_title,
                        role,
                        language_preference
                    """,
                    (
                        profile.auth_user_id,
                        profile.email,
                        profile.name,
                        profile.avatar_url,
                        profile.job_title,
                        primary_row[0]
                    )
                )

                return _row_to_user_profile(cursor.fetchone())

            if profile.organization_id:
                organization_id = profile.organization_id
                _ensure_organization(
                    cursor,
                    organization_id,
                    _workspace_name_for_profile(profile)
                )
            else:
                cursor.execute(
                    """
                    insert into organizations (name)
                    values (%s)
                    returning id::text
                    """,
                    (_workspace_name_for_profile(profile),)
                )
                organization_id = cursor.fetchone()[0]

            cursor.execute(
                """
                insert into users (
                    organization_id,
                    auth_user_id,
                    email,
                    name,
                    avatar_url,
                    job_title,
                    role
                )
                values (%s::uuid, %s::uuid, %s, %s, %s, %s, %s)
                on conflict (auth_user_id) do update set
                    email = excluded.email,
                    name = coalesce(excluded.name, users.name),
                    avatar_url = coalesce(excluded.avatar_url, users.avatar_url),
                    job_title = coalesce(excluded.job_title, users.job_title),
                    updated_at = now()
                returning
                    id::text,
                    organization_id::text,
                    auth_user_id::text,
                    email,
                    name,
                    avatar_url,
                    job_title,
                    role,
                    language_preference
                """,
                (
                    organization_id,
                    profile.auth_user_id,
                    profile.email,
                    profile.name,
                    profile.avatar_url,
                    profile.job_title,
                    profile.role
                )
            )

            return _row_to_user_profile(cursor.fetchone())
