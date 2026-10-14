# Deploy the EXISTING StudyFlow React app on Skycastle

The previous Skycastle link `/12724/#/limits` only displayed a static import report. It was **not the StudyFlow frontend**. This deployment uses the real React interface with an upload-first, browser-only PDF study room. The original 14-lecture catalog and 30 curated Python questions remain available as a sample.

## Build on Skycastle VibeFlow

1. Import the repo `https://github.com/KristineLio/studyflow-ai` and **do not replace it with a landing page**.
2. Build the existing React app in `frontend/`:

   ```bash
   cd frontend
   npm install --no-audit --no-fund
   VITE_SHOWCASE_MODE=true npm run build
   ```

3. Publish **`frontend/dist/`** as the Skycastle static site. The deployed `index.html` must come from Vite's build output, not a new handcrafted page.
4. Vite uses `base: './'` so CSS/JS resolve under Skycastle's nested `/12724/` path and portal snapshot URLs.
5. Verify the landing page opens **Study my PDFs**. Upload a text-based PDF, create a course plan, answer a Theory prompt, self-assess, refresh, confirm progress persists, complete four practice stages, and finish sealed revision. Also check that the Python sample remains available.
6. Verify no `/api` network calls are needed in showcase mode; there is no Python backend on Skycastle hosting.

## Bring your own PDF, without a backend

- Visitors select up to five PDF files, maximum 12 MB and 100 pages per file.
- The browser extracts PDF text using PDF.js. No PDF bytes are uploaded to Skycastle or any API.
- StudyFlow skips cover/contents pages, identifies topics from teaching passages, and derives ten source-linked, rule-based prompts. Where the source includes Python code, the practice stage shows the original extracted example. Page numbers refer to the uploaded PDFs. Uploaded PDFs must be reprocessed to replace older generic prompts.
- The learner writes and self-assesses answers against short source passages. Revision stays locked until the first four stages are completed, and the final score appears only after all five are assessed.
- The application saves **selected excerpts and answers** in browser localStorage. The original PDF bytes are not stored.
- This is **not live AI** or automatic correctness evaluation; scanned/image-only PDFs require OCR.

## What is genuine in the browser-only showcase

- The same 14 lecture titles and 30 original practice questions found in `backend/app/course_catalog.json`.
- Same stage sequence, objective MCQ scoring, explicit written self-assessment, revision lock, hidden final answers until complete, and weighted five-stage score.
- All progress is saved to the visitor's **own browser** via `localStorage`; it is not shared with the backend.
- No AI model is connected; hints are general deterministic guidance, and Python code is **not executed**.

## Not part of this showcase

- Authentication, SQLite, DOCX uploads, AI-generated subject-specific questions, and AI grading. Browser PDF extraction and deterministic study prompts are supported; the full FastAPI application still handles its own document uploads and optional AI integration.
- Private lecturer PDFs or extracted text. Only original questions and PDF/page citations are published. Do not add the PDFs to the public repo.

## How to test locally without the API

```bash
cd frontend
npm install
VITE_SHOWCASE_MODE=true npm run dev
```

Or in the browser open `http://localhost:5173/?demo=1` while running the frontend development server.

## Reset

Use **Reset demo** in the top banner. It deletes only this app's localStorage progress on that device.

> GitHub remains the source of truth; ask Skycastle to re-clone the latest commit and rebuild `frontend/dist/` after every update. Do not push generated code back to GitHub.