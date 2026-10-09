"""Small SQLite persistence layer for local single-user MVP."""
from __future__ import annotations

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
            seed_demo(db)


def seed_demo(db: sqlite3.Connection) -> None:
    """Seed explicitly labeled samples based on exercises supplied by the user.

    Samples are NOT claimed to have been extracted from their professor's PDFs.
    """
    now = utcnow()
    course_id = db.execute(
        "INSERT INTO courses(name,code,description,created_at) VALUES(?,?,?,?)",
        ("Python Programming", "PYTHON", "Sample lesson until lecture PDFs are uploaded", now),
    ).lastrowid
    lecture_id = db.execute(
        "INSERT INTO lectures(course_id,title,description,created_at) VALUES(?,?,?,?)",
        (course_id, "L01 · Strings & command-line arguments", "Demo content based on two supplied homework exercises", now),
    ).lastrowid
    questions = [
      ("theory", "Why is sys.argv used instead of input() when the assignment requires command-line arguments?", "sys.argv retrieves command-line arguments supplied when the script starts, while input() reads interactively from standard input.", "Mention where each input comes from. In Python, argv items are strings.", []),
      ("theory", "Which module exposes command-line arguments to a Python program?", "B", "sys.argv is the argument list; argv[0] is the script name.", ["A. pathlib", "B. sys", "C. random", "D. math"]),
      ("tests", "For the command `python check.py 1 2 2`, what is sys.argv[1:]?", "C", "All values from the command line arrive as strings.", ["A. [1, 2, 2]", "B. ['check.py', '1', '2', '2']", "C. ['1', '2', '2']", "D. (1, 2, 2)"]),
      ("tests", "Which approach correctly checks whether two case-normalized strings are anagrams after removing spaces?", "A", "Sorting the normalized characters makes anagram comparison straightforward.", ["A. sorted(a) == sorted(b)", "B. a in b", "C. len(a) == len(b)", "D. a == b"]),
      ("code", "Write a Python script that receives values from sys.argv and prints exactly `sorted` or `unsorted` depending on whether the sequence is non-decreasing. Do not use input().", "Use sys.argv[1:] and compare each adjacent pair; for numeric input convert values before comparison. Equal neighbors must be accepted. Print exactly one required output string.", "This is a code-review prompt, not an executable grading environment. The AI can review code if configured, or you can self-assess.", []),
      ("code", "Write a Python function that determines whether two phrases are anagrams, ignoring spaces and letter case.", "Normalize the phrases with lower()/casefold() and remove whitespace, then compare sorted characters or Counter objects.", "Test `rocket boys` and `october sky`. Additional punctuation rules should follow the actual assignment.", []),
      ("problems", "The CLI sorted-list task receives '2' and '10'. Why might comparing the raw command-line strings give the wrong numerical order?", "Strings are compared lexicographically: '10' sorts before '2'. Convert to numeric values when the specification implies numeric ordering.", "An exact implementation should clarify whether the professor expects numeric, lexical, or mixed-type input.", []),
      ("problems", "Which statement about a non-decreasing sequence is correct?", "D", "Repeated values are allowed in ascending non-decreasing order.", ["A. Every value must be strictly larger", "B. Empty lists must be unsorted", "C. [1,2,2] is unsorted", "D. Equal adjacent values are allowed"]),
      ("revision", "Given [1, 2, 2], what should a non-decreasing-order checker output?", "A", "Equal consecutive values do not break non-decreasing order.", ["A. sorted", "B. unsorted", "C. error", "D. 0"]),
      ("revision", "When using Python's sys.argv, how are individual command-line arguments represented initially?", "B", "sys.argv items are strings even if they contain digits.", ["A. As integers", "B. As strings", "C. As bytes", "D. As booleans"]),
    ]
    for stage, prompt, answer, explanation, choices in questions:
        import json
        db.execute("""INSERT INTO questions(lecture_id,stage,prompt,answer,explanation,choices_json,created_at)
                      VALUES(?,?,?,?,?,?,?)""", (lecture_id, stage, prompt, answer, explanation, json.dumps(choices), now))