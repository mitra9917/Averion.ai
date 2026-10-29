from dataclasses import dataclass

import psycopg

from app.core.config import settings


@dataclass(frozen=True)
class DatabaseConnectionCheck:
    connected: bool
    error: str | None = None


def is_database_configured() -> bool:
    return bool(settings.database_url and settings.database_url.strip())


def open_connection():
    return psycopg.connect(
        settings.database_url,
        connect_timeout=settings.database_connect_timeout
    )


def check_database_connection() -> DatabaseConnectionCheck:
    if not is_database_configured():
        return DatabaseConnectionCheck(
            connected=False,
            error="DATABASE_URL is not configured."
        )

    try:
        with open_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("select 1")
                cursor.fetchone()
    except psycopg.Error as exc:
        return DatabaseConnectionCheck(connected=False, error=str(exc))

    return DatabaseConnectionCheck(connected=True)
