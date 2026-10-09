# Skycastle VibeFlow showcase plan (after your GitHub repo exists)

The goal is to preserve **the GitHub repository as the single source of truth**, not split implementation across two builders.

## Phase A — Showcase the real app

1. Push the complete `studyflow-python-starter` folder to your new repository.
2. Run and validate V1 locally with your uploaded professor PDFs and practice data.
3. Deploy the frontend and API, with an authenticated backend before sharing private information. Keep any AI key server-side.
4. In your Skycastle VibeFlow project, ask it to create a simple public **StudyFlow showcase** (hero, problem, five-part methodology, demo clip/gallery and `Launch live app` link).
5. Use a link to the real application. Don't claim the showcase itself runs the backend unless verified.
6. If Skycastle exposes a supported GitHub connection/import in your account, connect the repository only after you have verified how its sync works. Otherwise, use a link, iframe (if permitted), or demo video.

### Example VibeFlow prompt

```
Create a polished and responsive Skycastle showcase page for StudyFlow,
a real open-source university revision web app.

Positioning: "Learn it. Prove it." 
Show the learner journey in five stages:
Theory → Tests → Code → Problems → Unaided Revision.

Use a bright, professional education-product aesthetic with indigo
accents. Sections: concise hero, demo video/interactive preview,
three core value propositions, five-stage workflow, technical stack,
GitHub repository link, and a prominent button that opens my LIVE_APP_URL.

Important: this is a SHOWCASE for an externally hosted application.
Do not fake AI replies, simulated student results, backend features,
or actual API connections. Do not claim PDF processing, live tutoring
or code execution works on the showcase page unless I connect a real URL.
Use placeholders REPOSITORY_URL and LIVE_APP_URL until I supply them.
```

## Phase B — Later productization

- Migrate SQLite to Postgres before a public multi-user launch.
- Add authentication and private storage for students' lecture documents.
- Integrate a secure Python judge for code exercises.
- Add Data Structures and other courses by creating new course-specific material sets, **without duplicating** the learning engine.

## Current Skycastle caveat

As of the October 1, 2026 discussion in Skycastle #help, the team said Firebase/Supabase connections were not ready for VibeFlow's built-in Connections panel. Backend integrations must therefore be independently verified for your specific setup. Avoid embedding secret API keys in public client code or sharing personal academic data through an unauthenticated demo.