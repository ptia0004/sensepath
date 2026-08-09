"""Persistent community-report storage for local and production environments."""

from __future__ import annotations

import re
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


CATEGORIES = {
    "crowds": {"display_name": "Crowds", "ttl_seconds": 2 * 60 * 60},
    "loud": {"display_name": "Loud event", "ttl_seconds": 2 * 60 * 60},
    "roadworks": {"display_name": "Roadworks", "ttl_seconds": 8 * 60 * 60},
    "heavy": {"display_name": "Heavy crowds", "ttl_seconds": 60 * 60},
    "other": {"display_name": "Other sensory issue", "ttl_seconds": 2 * 60 * 60},
}
HTML_PATTERN = re.compile(r"<[^>]*>|javascript\s*:", re.IGNORECASE)


class ReportValidationError(ValueError):
    """Invalid community-report input."""


class ReportNotFoundError(LookupError):
    """Requested report does not exist."""


def _text(value: Any, field: str, maximum: int, required: bool = False) -> str | None:
    if value is None:
        if required:
            raise ReportValidationError(f"'{field}' is required.")
        return None
    if not isinstance(value, str):
        raise ReportValidationError(f"'{field}' must be text.")
    cleaned = " ".join(value.strip().split())
    if required and not cleaned:
        raise ReportValidationError(f"'{field}' is required.")
    if not cleaned:
        return None
    if len(cleaned) > maximum:
        raise ReportValidationError(f"'{field}' must be at most {maximum} characters.")
    if HTML_PATTERN.search(cleaned):
        raise ReportValidationError(f"'{field}' contains unsafe HTML or script content.")
    return cleaned


def _coordinate(value: Any, field: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool):
        raise ReportValidationError(f"'{field}' must be a number.")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ReportValidationError(f"'{field}' must be a number.") from exc
    if not minimum <= number <= maximum:
        raise ReportValidationError(f"'{field}' must be between {minimum} and {maximum}.")
    return number


def validate_report(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ReportValidationError("Request body must be a JSON object.")
    category = _text(payload.get("category"), "category", 40, required=True)
    if category not in CATEGORIES:
        raise ReportValidationError(
            "Unknown 'category'. Allowed values: " + ", ".join(CATEGORIES)
        )
    submission_key = payload.get("submission_key") or str(uuid.uuid4())
    try:
        submission_key = str(uuid.UUID(str(submission_key)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ReportValidationError("'submission_key' must be a valid UUID.") from exc
    return {
        "category": category,
        "latitude": _coordinate(payload.get("latitude"), "latitude", -90, 90),
        "longitude": _coordinate(payload.get("longitude"), "longitude", -180, 180),
        "location_label": _text(
            payload.get("location_label"), "location_label", 200
        ),
        "comment": _text(payload.get("comment"), "comment", 300),
        "submission_key": submission_key,
    }


class SQLiteReportStore:
    """SQLite development store with the same public contract as PostgreSQL."""

    backend_name = "sqlite"

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialise()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialise(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS community_report (
                    report_id TEXT PRIMARY KEY,
                    category TEXT NOT NULL,
                    latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
                    longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
                    location_label TEXT,
                    comment TEXT,
                    submission_key TEXT NOT NULL UNIQUE,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS community_report_active_idx
                    ON community_report(status, expires_at, created_at);
                CREATE TABLE IF NOT EXISTS report_review (
                    review_id TEXT PRIMARY KEY,
                    report_id TEXT NOT NULL REFERENCES community_report(report_id),
                    action TEXT NOT NULL,
                    reason TEXT,
                    reviewed_at TEXT NOT NULL
                );
                """
            )

    @staticmethod
    def _serialise(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["report_id"],
            "category": row["category"],
            "category_name": CATEGORIES[row["category"]]["display_name"],
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "location_label": row["location_label"],
            "comment": row["comment"],
            "created_at": row["created_at"],
            "expires_at": row["expires_at"],
        }

    def create(self, payload: Any) -> tuple[dict[str, Any], bool]:
        values = validate_report(payload)
        now = datetime.now(timezone.utc)
        expiry = now + timedelta(seconds=CATEGORIES[values["category"]]["ttl_seconds"])
        report_id = str(uuid.uuid4())
        with self._connect() as connection:
            existing = connection.execute(
                "SELECT * FROM community_report WHERE submission_key = ?",
                (values["submission_key"],),
            ).fetchone()
            if existing:
                return self._serialise(existing), False
            connection.execute(
                """
                INSERT INTO community_report (
                    report_id, category, latitude, longitude, location_label,
                    comment, submission_key, status, created_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
                """,
                (
                    report_id,
                    values["category"],
                    values["latitude"],
                    values["longitude"],
                    values["location_label"],
                    values["comment"],
                    values["submission_key"],
                    now.isoformat(),
                    expiry.isoformat(),
                ),
            )
            row = connection.execute(
                "SELECT * FROM community_report WHERE report_id = ?", (report_id,)
            ).fetchone()
        return self._serialise(row), True

    def list_active(self, category: str | None = None, limit: int = 100) -> list[dict]:
        if category is not None and category not in CATEGORIES:
            raise ReportValidationError("Unknown report category filter.")
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as connection:
            connection.execute(
                "UPDATE community_report SET status = 'expired' "
                "WHERE status = 'active' AND expires_at <= ?",
                (now,),
            )
            parameters: list[Any] = [now]
            category_sql = ""
            if category:
                category_sql = " AND category = ?"
                parameters.append(category)
            parameters.append(limit)
            rows = connection.execute(
                "SELECT * FROM community_report "
                "WHERE status = 'active' AND expires_at > ?"
                + category_sql
                + " ORDER BY created_at DESC LIMIT ?",
                parameters,
            ).fetchall()
        return [self._serialise(row) for row in rows]

    def moderate(self, report_id: str, action: Any, reason: Any) -> dict[str, Any]:
        action = _text(action, "action", 30, required=True)
        status_by_action = {"hide": "hidden", "resolve": "resolved", "restore": "active"}
        if action not in status_by_action:
            raise ReportValidationError("'action' must be hide, resolve, or restore.")
        reason = _text(reason, "reason", 500)
        try:
            report_id = str(uuid.UUID(report_id))
        except ValueError as exc:
            raise ReportValidationError("Invalid report id.") from exc
        reviewed_at = datetime.now(timezone.utc).isoformat()
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM community_report WHERE report_id = ?", (report_id,)
            ).fetchone()
            if not row:
                raise ReportNotFoundError("Report not found.")
            connection.execute(
                "UPDATE community_report SET status = ? WHERE report_id = ?",
                (status_by_action[action], report_id),
            )
            connection.execute(
                "INSERT INTO report_review VALUES (?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), report_id, action, reason, reviewed_at),
            )
        return {"report_id": report_id, "action": action, "status": status_by_action[action]}


class PostgresReportStore:
    """Production adapter for the existing PostgreSQL schema."""

    backend_name = "postgresql"

    def __init__(self, database_url: str) -> None:
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:
            raise RuntimeError(
                "PostgreSQL requires 'psycopg[binary]'. Install requirements.txt."
            ) from exc
        self.psycopg = psycopg
        self.dict_row = dict_row
        self.database_url = database_url

    def _connect(self):
        return self.psycopg.connect(self.database_url, row_factory=self.dict_row)

    @staticmethod
    def _serialise(row: dict) -> dict[str, Any]:
        return {
            "id": str(row["report_id"]),
            "category": row["category_code"],
            "category_name": row["category_name"],
            "latitude": row["approximate_latitude"],
            "longitude": row["approximate_longitude"],
            "location_label": row["approximate_location_label"],
            "comment": row["optional_comment"],
            "created_at": row["created_at"].isoformat(),
            "expires_at": row["expires_at"].isoformat(),
        }

    def create(self, payload: Any) -> tuple[dict[str, Any], bool]:
        values = validate_report(payload)
        query = """
            INSERT INTO community_report (
                category_id, source_id, approximate_latitude,
                approximate_longitude, approximate_location_label,
                optional_comment, submission_key, expires_at
            )
            SELECT c.category_id, s.source_id, %s, %s, %s, %s, %s, NULL
            FROM report_category c CROSS JOIN data_source s
            WHERE c.category_code = %s AND s.source_code = 'community'
            ON CONFLICT (submission_key) DO NOTHING
            RETURNING report_id
        """
        with self._connect() as connection:
            created = connection.execute(
                query,
                (
                    values["latitude"],
                    values["longitude"],
                    values["location_label"],
                    values["comment"],
                    values["submission_key"],
                    values["category"],
                ),
            ).fetchone()
            row = connection.execute(
                """
                SELECT r.*, c.category_code, c.display_name AS category_name
                FROM community_report r JOIN report_category c USING (category_id)
                WHERE r.submission_key = %s
                """,
                (values["submission_key"],),
            ).fetchone()
        return self._serialise(row), created is not None

    def list_active(self, category: str | None = None, limit: int = 100) -> list[dict]:
        if category is not None and category not in CATEGORIES:
            raise ReportValidationError("Unknown report category filter.")
        query = "SELECT * FROM active_community_reports"
        parameters: list[Any] = []
        if category:
            query += " WHERE category_code = %s"
            parameters.append(category)
        query += " ORDER BY created_at DESC LIMIT %s"
        parameters.append(limit)
        with self._connect() as connection:
            connection.execute("SELECT expire_community_reports()")
            rows = connection.execute(query, parameters).fetchall()
        return [self._serialise(row) for row in rows]

    def moderate(self, report_id: str, action: Any, reason: Any) -> dict[str, Any]:
        action = _text(action, "action", 30, required=True)
        status_by_action = {"hide": "hidden", "resolve": "resolved", "restore": "active"}
        review_action = {"hide": "hide", "resolve": "resolve", "restore": "restore"}
        if action not in status_by_action:
            raise ReportValidationError("'action' must be hide, resolve, or restore.")
        reason = _text(reason, "reason", 500)
        try:
            report_id = str(uuid.UUID(report_id))
        except ValueError as exc:
            raise ReportValidationError("Invalid report id.") from exc
        with self._connect() as connection:
            updated = connection.execute(
                "UPDATE community_report SET status = %s WHERE report_id = %s RETURNING report_id",
                (status_by_action[action], report_id),
            ).fetchone()
            if not updated:
                raise ReportNotFoundError("Report not found.")
            connection.execute(
                """
                INSERT INTO report_review (
                    report_id, review_action, review_reason, actor_type, actor_reference
                ) VALUES (%s, %s, %s, 'moderator', 'api-token')
                """,
                (report_id, review_action[action], reason),
            )
        return {"report_id": report_id, "action": action, "status": status_by_action[action]}


def create_report_store(database_url: str | None, base_dir: Path):
    if database_url and urlparse(database_url).scheme in {"postgres", "postgresql"}:
        return PostgresReportStore(database_url)
    if database_url and database_url.startswith("sqlite:///"):
        return SQLiteReportStore(database_url[len("sqlite:///") :])
    return SQLiteReportStore(base_dir / "database" / "sensepath.sqlite3")
