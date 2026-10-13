# Deploy the EXISTING StudyFlow React app on Skycastle

The previous Skycastle link `/12724/#/limits` only displayed a static import report. It was **not the StudyFlow frontend**. This deployment uses the exact React study interface, 14-lecture catalog, and 30 curated questions already in this repo.

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
5. Verify actual interaction: go to Lecture 1, answer a test question, self-grade a written answer, refresh, confirm progress stays saved, unlock revision after the first four stages, and finish the sealed revision.
6. Verify no `/api` network calls are needed in showcase mode; there is no Python backend on Skycastle hosting.

## What is genuine in the browser-only showcase

- The same 14 lecture titles and 30 original practice questions found in `backend/app/course_catalog.json`.
- Same stage sequence, objective MCQ scoring, explicit written self-assessment, revision lock, hidden final answers until complete, and weighted five-stage score.
- All progress is saved to the visitor's **own browser** via `localStorage`; it is not shared with the backend.
- No AI model is connected; hints are general deterministic guidance, and Python code is **not executed**.

## Not part of this showcase

- Authentication, a real SQLite database, generated questions, PDF/DOCX uploads, and AI grading. Those remain in the full FastAPI app only.
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