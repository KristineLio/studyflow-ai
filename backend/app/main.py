from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)

from . import ai
from .database import STAGES, connection, initialize, utcnow
from .documents import extract_text


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize()
    yield


app = FastAPI(title="StudyFlow Python API", version="0.1.0", lifespan=lifespan)
origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


class CourseIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    code: str = Field(default="", max_length=25)
    description: str = Field(default="", max_length=500)


class LectureIn(BaseModel):
    course_id: int
    title: str = Field(min_length=2, max_length=180)
    description: str = Field(default="", max_length=500)


class AttemptIn(BaseModel):
    answer: str = Field(min_length=1, max_length=12000)
    hints_used: int = Field(default=0, ge=0, le=10)


class HintIn(BaseModel):
    draft_answer: str = Field(default="", max_length=10000)
    hint_number: int = Field(default=1, ge=1, le=10)


class SelfGradeIn(BaseModel):
    score: float = Field(ge=0, le=1)


def record_as_dict(row):
    return dict(row)


def q_public(row):
    q = dict(row)
    q["choices"] = json.loads(q.pop("choices_json"))
    q.pop("answer", None)
    q.pop("explanation", None)
    return q


def latest_attempts(db, lecture_id):
    return {
        int(row["question_id"]): dict(row)
        for row in db.execute("""
           SELECT a.* FROM attempts a JOIN questions q ON q.id=a.question_id
           WHERE q.lecture_id=? AND a.id=(SELECT MAX(a2.id) FROM attempts a2 WHERE a2.question_id=a.question_id)
        """, (lecture_id,))
    }


def lecture_progress(db, lecture_id: int):
    rows = db.execute("SELECT id, stage FROM questions WHERE lecture_id=?", (lecture_id,)).fetchall()
    attempts = latest_attempts(db, lecture_id)
    stage_info = {}
    for stage in STAGES:
        relevant = [r for r in rows if r["stage"] == stage]
        submitted = [attempts[r["id"]] for r in relevant if r["id"] in attempts]
        graded = [a for a in submitted if a["score"] is not None]
        complete = bool(relevant) and len(graded) == len(relevant)
        unaided = all(a["hints_used"] == 0 for a in submitted)
        stage_info[stage] = {
            "total": len(relevant), "submitted": len(submitted), "graded": len(graded),
            "complete": complete, "unaided": unaided,
            "score": round(10 * sum(a["score"] for a in graded) / len(graded), 1) if complete else None,
        }
    final_ready = all(s["complete"] for s in stage_info.values()) and stage_info["revision"]["unaided"]
    overall = round(sum(s["score"] for s in stage_info.values()) / len(STAGES), 1) if final_ready else None
    return {"stages": stage_info, "overall": overall,
            "overall_note": "Final score unlocks only when all five stages are graded and revision is completed unaided."}


def check_lecture(db, lecture_id):
    if not db.execute("SELECT 1 FROM lectures WHERE id=?", (lecture_id,)).fetchone():
        raise HTTPException(404, "Lecture not found")


@app.get("/api/health")
def health():
    return {"status": "ok", "ai_configured": ai.configured(), "mode": "ai" if ai.configured() else "transparent-demo", "export_enabled": os.getenv("ALLOW_DEV_EXPORT") == "1"}


@app.get("/api/courses")
def courses():
    with connection() as db:
        out = []
        for c in db.execute("SELECT * FROM courses ORDER BY id").fetchall():
            entry = dict(c)
            entry["lectures"] = [
                {**dict(l), "progress": lecture_progress(db, l["id"])}
                for l in db.execute("SELECT * FROM lectures WHERE course_id=? ORDER BY id", (c["id"],)).fetchall()
            ]
            out.append(entry)
    return out


@app.post("/api/courses", status_code=201)
def add_course(payload: CourseIn):
    with connection() as db:
        pk = db.execute("INSERT INTO courses(name,code,description,created_at) VALUES(?,?,?,?)",
                        (payload.name, payload.code, payload.description, utcnow())).lastrowid
        return dict(db.execute("SELECT * FROM courses WHERE id=?", (pk,)).fetchone())


@app.post("/api/lectures", status_code=201)
def add_lecture(payload: LectureIn):
    with connection() as db:
        if not db.execute("SELECT 1 FROM courses WHERE id=?", (payload.course_id,)).fetchone():
            raise HTTPException(404, "Course not found")
        pk = db.execute("INSERT INTO lectures(course_id,title,description,created_at) VALUES(?,?,?,?)",
                        (payload.course_id, payload.title, payload.description, utcnow())).lastrowid
        return dict(db.execute("SELECT * FROM lectures WHERE id=?", (pk,)).fetchone())


@app.get("/api/lectures/{lecture_id}")
def lecture_detail(lecture_id: int):
    with connection() as db:
        row = db.execute("SELECT * FROM lectures WHERE id=?", (lecture_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Lecture not found")
        attempts = latest_attempts(db, lecture_id)
        progress = lecture_progress(db, lecture_id)
        revision_released = progress["stages"]["revision"]["complete"] and progress["stages"]["revision"]["unaided"] and all(progress["stages"][s]["complete"] for s in STAGES[:-1])
        questions = [q_public(q) for q in db.execute("SELECT * FROM questions WHERE lecture_id=? ORDER BY id", (lecture_id,))]
        if not revision_released:
            for q in questions:
                if q["stage"] == "revision":
                    q["source_excerpt"] = ""
        return {
            "lecture": dict(row), "questions": questions, "progress": progress,
            "latest_attempts": {qid: {"id": a["id"], "score": a["score"] if revision_released or db.execute("SELECT stage FROM questions WHERE id=?", (qid,)).fetchone()["stage"] != "revision" else None, "hints_used": a["hints_used"],
                                      "feedback": a["feedback"] if revision_released or db.execute("SELECT stage FROM questions WHERE id=?", (qid,)).fetchone()["stage"] != "revision" else "Answer saved; results sealed until revision complete.", "evaluated_by": a["evaluated_by"]}
                                for qid, a in attempts.items()},
            "sources": [{"id": r["id"], "filename": r["filename"], "length": len(r["content"])}
                        for r in db.execute("SELECT * FROM sources WHERE lecture_id=?", (lecture_id,))],
        }


@app.post("/api/lectures/{lecture_id}/sources", status_code=201)
async def upload_source(lecture_id: int, file: UploadFile = File(...)):
    with connection() as db:
        check_lecture(db, lecture_id)
    data = await file.read(12 * 1024 * 1024 + 1)
    filename = Path(file.filename or "").name[:200]
    content = extract_text(filename, data)
    with connection() as db:
        pk = db.execute("INSERT INTO sources(lecture_id,filename,content,created_at) VALUES(?,?,?,?)",
                        (lecture_id, filename, content, utcnow())).lastrowid
        return {"id": pk, "filename": filename, "characters": len(content),
                "note": "Text extracted. Check formulas, diagrams, and tables against the original document."}


@app.get("/api/sources/{source_id}")
def source_preview(source_id: int):
    with connection() as db:
        row = db.execute("SELECT id,filename,content FROM sources WHERE id=?", (source_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Source not found")
        return {**dict(row), "content": row["content"][:25000], "truncated": len(row["content"]) > 25000}


@app.post("/api/sources/{source_id}/generate")
async def generate(source_id: int):
    with connection() as db:
        row = db.execute("SELECT * FROM sources WHERE id=?", (source_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Source not found")
        source = dict(row)
    questions = await ai.generate_questions(source["filename"], source["content"])
    with connection() as db:
        count = 0
        for q in questions:
            if db.execute("SELECT 1 FROM questions WHERE source_id=? AND stage=? AND prompt=?",
                          (source_id, q["stage"], q["prompt"])).fetchone():
                continue
            db.execute("""INSERT INTO questions(lecture_id,stage,prompt,answer,explanation,
                          choices_json,source_id,source_excerpt,created_at) VALUES (?,?,?,?,?,?,?,?,?)""",
                       (source["lecture_id"], q["stage"], q["prompt"], q["answer"], q["explanation"],
                        json.dumps(q["choices"]), source_id, q["source_excerpt"], utcnow()))
            count += 1
    return {"added": count, "note": "Generated from verified source excerpts. Review before relying on them for exams."}


def letter(answer: str):
    normalized = answer.strip().upper()
    return normalized[0] if normalized and normalized[0] in "ABCD" and (len(normalized) == 1 or normalized[1] in ".) ") else normalized


def update_review(db, question_id, score):
    """Small SM-2-inspired scheduler, based on the student's scored attempt."""
    current = db.execute("SELECT * FROM reviews WHERE question_id=?", (question_id,)).fetchone()
    reps, days, ease = (current["repetitions"], current["interval_days"], current["ease"]) if current else (0, 0, 2.5)
    quality = max(0, min(5, round(score * 5)))
    if quality < 3:
        reps, days = 0, 1
    else:
        days = 1 if reps == 0 else 6 if reps == 1 else max(1, round(days * ease))
        reps += 1
    ease = max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
    due = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    db.execute("""INSERT INTO reviews(question_id,repetitions,interval_days,ease,due_at)
                  VALUES(?,?,?,?,?) ON CONFLICT(question_id) DO UPDATE SET
                  repetitions=excluded.repetitions,interval_days=excluded.interval_days,
                  ease=excluded.ease,due_at=excluded.due_at""", (question_id, reps, days, ease, due))


@app.post("/api/questions/{question_id}/hint")
async def hint_question(question_id: int, payload: HintIn):
    with connection() as db:
        row = db.execute("SELECT * FROM questions WHERE id=?", (question_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Question not found")
        question = dict(row)
    if question["stage"] == "revision":
        raise HTTPException(409, "Hints are unavailable during unaided revision")
    if ai.configured():
        return {"hint": await ai.hint_answer(question, payload.draft_answer, payload.hint_number), "mode": "ai"}
    if payload.hint_number == 1:
        hint = "What information is given, what output is required, and which Python concept connects them? Try one small example by hand."
    else:
        hint = "Break the task into steps. Test an edge case such as empty input, repeated values, or unexpected data types. Explain your reasoning first."
    return {"hint": hint, "mode": "general_hint_no_ai"}


@app.post("/api/questions/{question_id}/attempts", status_code=201)
async def attempt_question(question_id: int, payload: AttemptIn):
    with connection() as db:
        row = db.execute("SELECT * FROM questions WHERE id=?", (question_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Question not found")
        question = dict(row)
    if question["stage"] == "revision":
        if payload.hints_used:
            raise HTTPException(422, "Revision is unaided. Restart or submit an answer without hints.")
        with connection() as db:
            progress_before = lecture_progress(db, question["lecture_id"])
            if not all(progress_before["stages"][s]["complete"] for s in STAGES[:-1]):
                raise HTTPException(409, "Finish Theory, Tests, Code and Problems before the unaided revision.")

    is_mcq = bool(json.loads(question["choices_json"]))
    if is_mcq:
        correct = letter(payload.answer) == question["answer"].strip().upper()
        score, feedback, method = float(correct), question["explanation"], "objective"
    elif ai.configured():
        result = await ai.grade_answer(question, payload.answer)
        score, feedback, method = result["score"], result["feedback"], "ai_review_not_execution"
    else:
        # There is no pretend AI assessment. User explicitly grades against model answer.
        score, feedback, method = None, "Self-assessment needed; no AI model is configured.", "pending_self_grade"

    with connection() as db:
        pk = db.execute("""INSERT INTO attempts(question_id,user_answer,score,hints_used,feedback,evaluated_by,created_at)
                  VALUES(?,?,?,?,?,?,?)""", (question_id, payload.answer, score, payload.hints_used,
                                               feedback, method, utcnow())).lastrowid
        if score is not None:
            update_review(db, question_id, score)
        progress = lecture_progress(db, question["lecture_id"])
        sealed = question["stage"] == "revision" and not progress["stages"]["revision"]["complete"]
        return {"attempt_id": pk, "score": None if sealed else score,
                "feedback": "Answer recorded. Results unlock once you complete all revision questions." if sealed else feedback,
                "evaluated_by": "sealed_revision" if sealed else method,
                "model_answer": "" if sealed else question["answer"], "explanation": "" if sealed else question["explanation"],
                "progress": progress}


@app.post("/api/attempts/{attempt_id}/self-grade")
def self_grade(attempt_id: int, payload: SelfGradeIn):
    with connection() as db:
        row = db.execute("""SELECT a.*,q.lecture_id FROM attempts a JOIN questions q ON q.id=a.question_id
                             WHERE a.id=?""", (attempt_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Attempt not found")
        if row["evaluated_by"] != "pending_self_grade":
            raise HTTPException(409, "This attempt cannot be self-graded")
        db.execute("UPDATE attempts SET score=?, evaluated_by='self_assessed' WHERE id=?", (payload.score, attempt_id))
        update_review(db, row["question_id"], payload.score)
        return {"progress": lecture_progress(db, row["lecture_id"]), "score": payload.score}


@app.get("/api/revision-due")
def revision_due():
    now = utcnow()
    with connection() as db:
        items = db.execute("""SELECT q.id,q.prompt,q.stage,l.title AS lecture_title,c.name AS course_name,r.due_at
                   FROM reviews r JOIN questions q ON q.id=r.question_id
                   JOIN lectures l ON l.id=q.lecture_id JOIN courses c ON c.id=l.course_id
                   WHERE r.due_at<=? ORDER BY r.due_at LIMIT 50""", (now,)).fetchall()
        return [dict(r) for r in items]


@app.get("/api/export")
def export_data():
    # Single-user development backup. Disabled by default. Do not expose publicly.
    if os.getenv("ALLOW_DEV_EXPORT") != "1":
        raise HTTPException(403, "Development export is disabled. Set ALLOW_DEV_EXPORT=1 on a local-only server.")
    with connection() as db:
        payload = {table: [dict(r) for r in db.execute(f"SELECT * FROM {table}")]
                   for table in ("courses", "lectures", "sources", "questions", "attempts", "reviews")}
    stream = iter([json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")])
    return StreamingResponse(stream, media_type="application/json",
                             headers={"Content-Disposition": 'attachment; filename="studyflow-backup.json"'})