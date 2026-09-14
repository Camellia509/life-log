#!/usr/bin/env python3
"""Export the local D1 SQLite file to SQL and verify a clean restore.

This helper reads the source database without modifying it. It writes only to
the explicitly supplied backup directory and reports table counts and hashes,
never row contents.
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
    tables: dict[str, object] = {}
    for table_name in table_names:
        quoted = '"' + table_name.replace('"', '""') + '"'
        rows = connection.execute(f"SELECT * FROM {quoted}").fetchall()
        canonical_rows = sorted(repr(tuple(row)) for row in rows)
        digest = hashlib.sha256("\n".join(canonical_rows).encode("utf-8")).hexdigest()
        tables[table_name] = {"rows": len(rows), "sha256": digest}
    return {"integrity": integrity, "tables": tables}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--backup-dir", required=True, type=Path)
    args = parser.parse_args()

    source = args.source.resolve(strict=True)
    backup_dir = args.backup_dir.resolve()
    backup_dir.mkdir(parents=True, exist_ok=True)
    sql_path = backup_dir / "d1-baseline.sql"
    restored_path = backup_dir / "restore-state" / "restored.sqlite"
    restored_path.parent.mkdir(parents=True, exist_ok=True)
    if restored_path.exists():
        raise FileExistsError(f"Restore target already exists: {restored_path}")

    source_connection = sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True)
    source_snapshot = database_snapshot(source_connection)
    dump = "\n".join(source_connection.iterdump()) + "\n"
    source_connection.close()
    sql_path.write_text(dump, encoding="utf-8", newline="\n")

    restored_connection = sqlite3.connect(restored_path)
    restored_connection.executescript(dump)
    restored_connection.commit()
    restored_snapshot = database_snapshot(restored_connection)
    restored_connection.close()

    report = {
        "source": str(source),
        "sql_backup": str(sql_path),
        "restored_database": str(restored_path),
        "source_snapshot": source_snapshot,
        "restored_snapshot": restored_snapshot,
        "matches": source_snapshot == restored_snapshot,
        "sql_sha256": hashlib.sha256(sql_path.read_bytes()).hexdigest(),
    }
    report_path = backup_dir / "restore-verification.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if not report["matches"]:
        raise RuntimeError(f"Restore verification failed; inspect {report_path}")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
