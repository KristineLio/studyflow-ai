# Lecture 1 — manual end-to-end QA

Purpose: verify the *real* user experience for **Lecture 1 — Introduction to Python**, grounded in the professor's provided slides. The lesson source is not public; copy/upload your authorized personal course PDF to the local app only.

## Environment

- Run backend and frontend using `README.md`.
- Default mode without `AI_API_KEY` is **Manual assessment**, not a conversational AI tutor. No code is executed. Written answers require user self-assessment against the visible rubric.
- Open **Python Programming → Lecture 1 — Introduction to Python**.
- Optionally upload `lecture1-english-2020.pdf` in **Course materials**, then preview it. If you are using the local private course database, it may already be imported.

## Test the five stages

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Open Theory and answer a question | Written answer is saved; rubric is displayed; an explicit self-grade is required |
| 2 | Refresh **before** giving the self-grade | The pending rubric and self-grade controls can be resumed, without resubmitting the answer |
| 3 | Finish Theory | Stage progress updates; opening Theory again selects incomplete question first or shows completed questions if none remain |
| 4 | Answer both Tests questions | MCQs are scored objectively; your answer and the correct option are distinguishable |
| 5 | Work through Code and Problems | Written/code answers are **not executed**; user self-assesses using the rubric; movement to next question waits for scoring |
| 6 | Attempt Revision prematurely | Revision is locked until all four other stages have been graded |
| 7 | Start Revision, submit its first question | Result is sealed, no correct option/rubric is visible; returning/reloading keeps it sealed |
| 8 | Try submitting the same Revision question again | API returns HTTP 409; no second chance after first submission |
| 9 | Submit final Revision answer | All revision feedback unlocks and the five-stage overall score appears |
| 10 | Refresh and reopen Revision | All original answers, grading rubrics, and feedback remain available to review; revisions cannot be resubmitted |

To repeat the assessment from scratch without affecting your genuine progress, use a **fresh test database**, not your personal one. On macOS/Linux:

```bash
cd backend
STUDYFLOW_DB=/tmp/studyflow-qa.sqlite3 uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

On Windows PowerShell:

```powershell
cd backend
$env:STUDYFLOW_DB="$env:TEMP\studyflow-qa.sqlite3"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Automated checks

```bash
cd backend
python -m pytest -q
```

The automated suite covers source import, answer secrecy, self-assessment resume, revision locking, revision answer immutability, final result release and score consistency. Frontend checks run with `npm run build` once dependencies are available. CI runs both in GitHub Actions.

## Important limitations

- The 5-stage overall score is **not an independently validated exam-readiness score** when written answers are self-assessed.
- We haven't yet integrated a hosted conversational tutor or sandboxed Python code execution.
- Do not publish the unauthenticated FastAPI backend or the professor's source PDFs.