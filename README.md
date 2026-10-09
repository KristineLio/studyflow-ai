# StudyFlow — Python Programming

**Learn it. Prove it.** A five-stage, lecture-grounded revision workspace built with **React + TypeScript** and **FastAPI + SQLite**. Designed as a single-student MVP for real university study, then to be showcased via Skycastle VibeFlow.

## What works in V1

- Course and lecture creation, with the **Python Programming** pilot course.
- A **14-entry Python Programming lecture catalog** mapped to the actual titles and filenames in Professor Filip Andonov's supplied PDFs. The filenames do not always match the slide numbers; StudyFlow preserves the cover titles.
- **30 original lecture-grounded practice questions** across the first three lectures (10 per lecture), with exact PDF filename and page references. The other 11 entries are available for later uploads and question generation.
- **Theory → Tests → Code → Problems → Revision** study flow.
- Objective multiple-choice grading; **transparent self-assessment** for written answers when no AI model is connected.
- Optional OpenAI-compatible API for **question generation, AI hints, and rubric-based answer review**. API credentials stay in the backend, not the frontend.
- Real **PDF / DOCX / TXT text extraction** and source preview, stored in SQLite. Generated questions require an AI connection and must cite a literal excerpt of uploaded content.
- Progress (/10 per stage), most recent attempt tracking and an **SM-2-inspired review scheduler**.
- **No final overall score** until every stage is graded and the final revision is completed unaided. Revision is locked until the first four stages are complete; revision questions hide feedback, answers, and excerpts until the final question is submitted.
- Responsive dashboard and study workspace.

### Honesty about what V1 does *not* do

- There is **no Python code execution sandbox** yet. AI may *review* code, but does not run it. In demo mode, use manual self-assessment after viewing the grading rubric.
- The app **does not include an AI subscription or API key**. Without credentials, AI generation and AI grading are disabled; manual practice works.
- PDF text extraction is best-effort. Image-only/scanned PDFs need OCR before uploading; review extracted Python code, diagrams and tables against the PDF.
- The SQLite backend has **no authentication or user isolation**. Run it locally; **do not publish the API publicly** or upload private course materials to an unauthenticated instance.
- For auto-generated questions (as opposed to the 30 manually curated ones), source excerpts are validated against the extracted text, but AI-generated questions may still be incorrect. Review them before exam use.

## Start locally

Requires **Python 3.11+** and **Node 20+**.

Open two terminals.

**Terminal 1 — API**

```bash
cd backend
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env     # Windows PowerShell: Copy-Item .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 — frontend**

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173/**. The frontend proxies `/api` to `127.0.0.1:8000` while developing.

> `npm install` needs internet access to download React/Vite dependencies on the first run.

## Optional AI configuration

Edit `backend/.env` after copying the example:

```ini
AI_API_KEY=YOUR_KEY_HERE
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=YOUR_SUPPORTED_MODEL
```

Restart the API. The API uses the OpenAI-compatible `/chat/completions` endpoint and expects valid JSON in model responses. Use a model/provider that supports this endpoint. No key is included in the repo.

**Never commit `.env` to GitHub, paste a secret into VibeFlow prompts, or expose it in browser-side JavaScript.**

## Student workflow

1. Create/open a course and lecture.
2. Go to **Course materials** → upload lecture PDF, DOCX or TXT.
3. Check **Preview** to confirm extraction. With an AI key configured, click **Generate practice** to build grounded questions for all five stages.
4. Complete the first four stages. The app provides guided questions and logs hints used.
5. Take the final **Revision** without hints or intermediate answer reveals.
6. Review your overall score (only then), reattempt weak topics, and check scheduled revision due dates via `/api/revision-due`.

To test the app before uploading anything, open **Lecture 1 — Introduction to Python**, **Lecture 2 — Lists and Tuples**, or **Lecture 3 — Strings**. These include original practice questions grounded in the supplied PDFs; the PDFs themselves are intentionally not checked into GitHub.

## Import the original lecture PDFs locally (optional)

The public GitHub repository contains **references and an original practice bank**, not the copyrighted professor PDFs.

Place your copies of the PDFs in a private folder. Keep the original filenames (such as `lecture2-english-2020.pdf`), then run from the backend directory:

```bash
python -m scripts.import_lecture_pdfs --directory /path/to/private_materials
```

On Windows PowerShell, an example is:

```powershell
python -m scripts.import_lecture_pdfs --directory "C:\Users\YourUser\Downloads\python-lectures"
```

The importer matches all 14 PDF filenames to their corresponding lecture entries, extracts readable text, stores it in the local SQLite database, and does not import duplicates on subsequent runs. Missing files are reported without inventing content. You may also use the web UI's per-lecture upload instead.

**Important:** Some older slides contain Python 2 examples, while the application and assignment starter are designed for Python 3. Confirm version-specific syntax against your current course requirements. Copying the PDF files into your public GitHub repository is not required or recommended.

## Source-backed content map

- **Ready for five-stage practice:** Lecture 1 (Introduction), Lecture 2 (Lists and Tuples), Lecture 3 (Strings).
- **Cataloged for next integration:** Dictionaries; Abstraction; Object-oriented programming; Magic methods; Exceptions and tests; wxPython GUI; Files; Databases; Internet; Graphics; Flask.
- Source cover titles are authoritative: `lecture6-english.pdf` says **Lecture 7**; `lecture7-english-2019.pdf` says **Lecture 9**; `lecture9-english.pdf` also says **Lecture 9**. We deliberately preserve these labels rather than inventing missing lecture numbers.

## API quick reference

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Backend and AI status |
| `GET /api/courses` | Courses/lectures with stage progress |
| `POST /api/courses` | Create course |
| `POST /api/lectures` | Create lecture |
| `GET /api/lectures/{id}` | Questions and progress, with revision feedback sealed |
| `POST /api/lectures/{id}/sources` | Upload/extract material |
| `GET /api/sources/{id}` | Extracted source preview |
| `POST /api/sources/{id}/generate` | AI-generate grounded questions |
| `POST /api/questions/{id}/hint` | Socratic hint (not available in revision) |
| `POST /api/questions/{id}/attempts` | Evaluate an answer |
| `POST /api/attempts/{id}/self-grade` | Explicit self-assessment when AI unavailable |
| `GET /api/revision-due` | Due practice questions |
| `GET /api/export` | Developer JSON backup; off by default |

**Local-only JSON backup:** In `backend/.env`, set `ALLOW_DEV_EXPORT=1` and restart. Never enable that option on an unauthenticated public deployment.

## Testing

```bash
cd backend
python -m pytest -q
```

For frontend type checking and production bundle (after npm install):

```bash
cd frontend
npm run build
```

## Skycastle VibeFlow showcase

The normal source repo is authoritative. When ready, deploy the frontend and a **secured** API to appropriate services, then use Skycastle VibeFlow to showcase the app and link to the live demo. **Do not assume GitHub import, API hosting, or database connections are natively supported by VibeFlow** — verify them in your current Skycastle project. See [`SKYCASTLE_SHOWCASE.md`](./SKYCASTLE_SHOWCASE.md).

## Planned V2

- Authenticated multi-user backend and Postgres persistence
- Secure, isolated Python code-runner with automated unit tests
- Per-topic mastery and better spaced repetition
- Conversational tutoring across multiple questions, including source citations
- NETB208 Data Structures as a second course, reusing the same engine