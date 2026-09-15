#!/usr/bin/env python3
"""Exercise the stage 1 schema migration against disposable SQLite databases."""

from __future__ import annotations

import json
import sqlite3
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def migration_sql(name: str) -> str:
    return (ROOT / "drizzle" / name).read_text(encoding="utf-8").replace(
        "--> statement-breakpoint", ""
    )


def legacy_database(path: Path, users: int = 1) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    connection.executescript(migration_sql("0000_simple_mentor.sql"))
    connection.executescript(migration_sql("0001_large_shotgun.sql"))
    for index in range(users):
        user_id = f"user-{index}"
        connection.execute(
            "INSERT INTO users(id,email,name,password,salt,role,settings) "
            "VALUES(?,?,?,?,?,?,?)",
            (
                user_id,
                f"person-{index}@example.invalid",
                f"Person {index}",
                "digest",
                "salt",
                "owner" if index == 0 else "member",
                json.dumps(
                    {
                        "hidden": ["meal"],
                        "sleepGoal": 8,
                        "studyGoal": 120,
                        "bedtime": "23:30",
                        "focus": "",
                        "focusByMonth": {"2026-09": "保留月度重点"},
                    },
                    ensure_ascii=False,
                ),
            ),
        )
    if users == 1:
        connection.execute(
            "INSERT INTO records(id,owner,kind,date,payload,updated) "
            "VALUES(?,?,?,?,?,?)",
            (
                "record-1",
                "user-0",
                "study",
                "2026-09-14",
                json.dumps({"project": "迁移演练", "actual": 45}, ensure_ascii=False),
                "2026-09-14T12:00:00.000Z",
            ),
        )
        connection.execute(
            "INSERT INTO habits(id,owner,payload) VALUES(?,?,?)",
            (
                "habit-1",
                "user-0",
                json.dumps(
                    {
                        "id": "habit-1",
                        "name": "散步",
                        "category": "运动",
                        "frequency": "daily",
                        "days": [],
                        "monthDay": 1,
                        "minutes": 20,
                        "target": 0,
                        "active": True,
                        "revision": 1,
                    },
                    ensure_ascii=False,
                ),
            ),
        )
        connection.execute(
            "INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)",
            ("session-digest", "user-0", 4102444800000),
        )
        connection.execute(
            "INSERT INTO files(id,record_id,owner,name,mime,size) VALUES(?,?,?,?,?,?)",
            ("file-1", "record-1", "user-0", "legacy.png", "image/png", 10),
        )
        connection.execute(
            "INSERT INTO invites(token,email,expires,used) VALUES(?,?,?,?)",
            ("invite-digest", "friend@example.invalid", 4102444800000, 0),
        )
        connection.execute(
            "INSERT INTO shares(id,record_id,viewer) VALUES(?,?,?)",
            ("share-1", "record-1", "user-0"),
        )
    connection.commit()
    return connection


def columns(connection: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in connection.execute(f'PRAGMA table_info("{table}")')}


with tempfile.TemporaryDirectory(prefix="mint-stage1-migration-") as temp:
    temp_path = Path(temp)
    single = legacy_database(temp_path / "single.sqlite")
    single.executescript(migration_sql("0002_single_user_no_files.sql"))
    single.commit()

    tables = {
        row[0]
        for row in single.execute(
            "SELECT name FROM sqlite_schema "
            "WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }
    expected_tables = {"attempts", "habits", "records", "sessions", "users"}
    assert tables == expected_tables
    assert "role" not in columns(single, "users")
    assert "owner" not in columns(single, "records")
    assert "owner" not in columns(single, "habits")
    assert single.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    assert single.execute("SELECT COUNT(*) FROM records").fetchone()[0] == 1
    assert single.execute("SELECT COUNT(*) FROM habits").fetchone()[0] == 1
    assert single.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 1
    settings = json.loads(single.execute("SELECT settings FROM users").fetchone()[0])
    assert settings["focusByMonth"]["2026-09"] == "保留月度重点"
    assert single.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    index_sql = {
        row[0]: row[1]
        for row in single.execute(
            "SELECT name,sql FROM sqlite_schema WHERE type='index' AND sql IS NOT NULL"
        )
    }
    assert "records_date" in index_sql
    assert "owner" not in index_sql["one_daily_record"]

    single.executescript(migration_sql("0003_device_sessions.sql"))
    single.commit()
    session_columns = columns(single, "sessions")
    assert {
        "token",
        "user_id",
        "expires",
        "id",
        "device_id_hash",
        "device_label",
        "user_agent_hash",
        "created_at",
        "last_used_at",
        "revoked_at",
    } == session_columns
    migrated_session = single.execute(
        "SELECT token,user_id,expires,id,device_label,created_at,last_used_at "
        "FROM sessions WHERE token='session-digest'"
    ).fetchone()
    assert migrated_session is not None
    assert migrated_session[0:3] == ("session-digest", "user-0", 4102444800000)
    assert len(migrated_session[3]) == 32
    assert migrated_session[4] == "旧设备"
    assert migrated_session[5] == migrated_session[6] == 4101840000000
    single.execute(
        "INSERT INTO sessions(token,user_id,expires,id,device_id_hash,device_label,"
        "user_agent_hash,created_at,last_used_at) VALUES(?,?,?,?,?,?,?,?,?)",
        (
            "new-token-digest",
            "user-0",
            4102444800000,
            "public-session-id",
            "device-digest",
            "Windows · Chrome",
            "ua-digest",
            100,
            100,
        ),
    )
    single.commit()
    assert single.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    # Stage 1 code can still read and delete sessions by the original columns.
    assert single.execute(
        "SELECT user_id FROM sessions WHERE token=? AND expires>?",
        ("new-token-digest", 0),
    ).fetchone()[0] == "user-0"
    single.close()

    multiple = legacy_database(temp_path / "multiple.sqlite", users=2)
    try:
        multiple.executescript(migration_sql("0002_single_user_no_files.sql"))
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Migration must reject a legacy database with multiple users")
    assert (
        multiple.execute(
            "SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name='files'"
        ).fetchone()[0]
        == 1
    )
    multiple.close()

report = {
    "passed": 20,
    "checks": [
        "single-user migration completes",
        "only final five tables remain",
        "users.role removed",
        "records.owner removed",
        "habits.owner removed",
        "sole account retained",
        "records retained",
        "habits retained",
        "sessions retained",
        "monthly focus and settings retained",
        "database integrity is ok",
        "single-user indexes created",
        "multi-user legacy database rejected before destructive changes",
        "device session migration is additive",
        "legacy session token retained",
        "legacy session public id backfilled",
        "legacy session timestamps backfilled",
        "new device session metadata persists",
        "stage 1 session queries remain compatible",
        "post-migration database integrity is ok",
    ],
}
print(json.dumps(report, ensure_ascii=False, indent=2))
