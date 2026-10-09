"""Small SQLite persistence layer for local single-user MVP."""
from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

STAGES = ("theory", "tests", "code", "problems", "revision")


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db_path() -> Path:
    return Path(os.environ.get("STUDYFLOW_DB", "./studyflow.sqlite3")).expanduser()


@contextmanager
def connection():
    path = get_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(path), timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        yield db
        db.commit()
    finally:
        db.close()


def initialize():
    with connection() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS courses (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              code TEXT NOT NULL DEFAULT '',
              description TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS lectures (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
              title TEXT NOT NULL,
              description TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sources (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              lecture_id INTEGER NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
              filename TEXT NOT NULL,
              content TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS questions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              lecture_id INTEGER NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
              stage TEXT NOT NULL,
              prompt TEXT NOT NULL,
              answer TEXT NOT NULL,
              explanation TEXT NOT NULL DEFAULT '',
              choices_json TEXT NOT NULL DEFAULT '[]',
              source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
              source_excerpt TEXT NOT NULL DEFAULT '',
              difficulty INTEGER NOT NULL DEFAULT 2,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS attempts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
              user_answer TEXT NOT NULL,
              score REAL,
              hints_used INTEGER NOT NULL DEFAULT 0,
              feedback TEXT NOT NULL DEFAULT '',
              evaluated_by TEXT NOT NULL DEFAULT 'pending',
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_attempts_question ON attempts(question_id, id);
            CREATE TABLE IF NOT EXISTS reviews (
              question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
              repetitions INTEGER NOT NULL DEFAULT 0,
              interval_days INTEGER NOT NULL DEFAULT 0,
              ease REAL NOT NULL DEFAULT 2.5,
              due_at TEXT NOT NULL
            );
        """)
        count = db.execute("SELECT COUNT(*) FROM courses").fetchone()[0]
        if not count:
            seed_course_catalog(db)


def seed_course_catalog(db: sqlite3.Connection) -> None:
    """Seed original questions grounded in the source PDF *references*.

    The professor's PDF files are deliberately NOT stored in this public
    repository. Users may upload their own copies into local StudyFlow.
    """
    path = Path(__file__).with_name("course_catalog.json")
    catalog = json.loads(path.read_text(encoding="utf-8"))
    now = utcnow()
    course = catalog["course"]
    course_id = db.execute(
        "INSERT INTO courses(name,code,description,created_at) VALUES(?,?,?,?)",
        (course["name"], course["code"], course["description"], now),
    ).lastrowid
    for lecture in catalog["lectures"]:
        summary = ", ".join(lecture["topics"])
        description = f"Source: {lecture['source_file']} | Topics: {summary}"
        if lecture.get("subtitle"):
            description += f" | Note: {lecture['subtitle']}"
        lecture_id = db.execute(
            "INSERT INTO lectures(course_id,title,description,created_at) VALUES(?,?,?,?)",
            (course_id, lecture["title"], description[:500], now),
        ).lastrowid
        for q in lecture["questions"]:
            db.execute("""INSERT INTO questions(
                lecture_id, stage, prompt, answer, explanation,
                choices_json, source_excerpt, difficulty, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?)""", (
                lecture_id, q["stage"], q["prompt"], q["answer"], q["explanation"],
                json.dumps(q["choices"], ensure_ascii=False), q["source_reference"],
                q.get("difficulty", 2), now,
            ))