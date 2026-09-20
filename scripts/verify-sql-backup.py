#!/usr/bin/env python3
"""Export or restore a D1-compatible SQLite backup and verify its contents.

The report contains schema and row hashes plus table counts, never row values.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path


def database_snapshot(connection: sqlite3.Connection) -> dict[str, object]:
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    table_names = [
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]
    schema_entries = [
        tuple(row)
        for row in connection.execute(
            "SELECT type, name, tbl_name, COALESCE(sql, '') FROM sqlite_master "
            "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
        )
    ]
    schema_sha256 = hashlib.sha256(
        json.dumps(schema_entries, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    tables: dict[str, object] = {}
    for table_name in table_names:
        quoted = '"' + table_name.replace('"', '""') + '"'
        rows = connection.execute(f"SELECT * FROM {quoted}").fetchall()
        canonical_rows = sorted(repr(tuple(row)) for row in rows)
        digest = hashlib.sha256("\n".join(canonical_rows).encode("utf-8")).hexdigest()
        tables[table_name] = {"rows": len(rows), "sha256": digest}
    return {"integrity": integrity, "schema_sha256": schema_sha256, "tables": tables}


def restore_sql(sql_path: Path, restored_path: Path) -> dict[str, object]:
    if restored_path.exists():
        restored_path.unlink()
    restored_path.parent.mkdir(parents=True, exist_ok=True)
    dump = sql_path.read_text(encoding="utf-8")
    connection = sqlite3.connect(restored_path)
    try:
        connection.executescript(dump)
        connection.commit()
        return database_snapshot(connection)
    finally:
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument("--source", type=Path)
    source_group.add_argument("--sql", type=Path)
    parser.add_argument("--backup-dir", required=True, type=Path)
    parser.add_argument("--expected-report", type=Path)
    args = parser.parse_args()

    backup_dir = args.backup_dir.resolve()
    backup_dir.mkdir(parents=True, exist_ok=True)
    restored_path = backup_dir / "restore-state" / "restored.sqlite"
    if args.source:
        source = args.source.resolve(strict=True)
        sql_path = backup_dir / "d1-baseline.sql"
        source_connection = sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True)
        try:
            source_snapshot = database_snapshot(source_connection)
            dump = "\n".join(source_connection.iterdump()) + "\n"
        finally:
            source_connection.close()
        sql_path.write_text(dump, encoding="utf-8", newline="\n")
        restored_snapshot = restore_sql(sql_path, restored_path)
        expected_snapshot = source_snapshot
        mode = "export"
    else:
        source = None
        sql_path = args.sql.resolve(strict=True)
        restored_snapshot = restore_sql(sql_path, restored_path)
        expected_snapshot = restored_snapshot
        mode = "restore"

    if args.expected_report:
        expected = json.loads(args.expected_report.resolve(strict=True).read_text(encoding="utf-8"))
        expected_snapshot = expected.get("snapshot") or expected.get("source_snapshot")
        if not expected_snapshot:
            raise ValueError("Expected report does not contain a snapshot")

    report = {
        "mode": mode,
        "source": str(source) if source else None,
        "sql_backup": str(sql_path.resolve()),
        "restored_database": str(restored_path),
        "snapshot": restored_snapshot,
        "matches": expected_snapshot == restored_snapshot,
        "sql_sha256": hashlib.sha256(sql_path.read_bytes()).hexdigest(),
    }
    report_path = backup_dir / "restore-verification.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if not report["matches"]:
        raise RuntimeError(f"Restore verification failed; inspect {report_path}")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
