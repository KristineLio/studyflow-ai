"""Import locally held professor PDFs into StudyFlow; do not commit PDFs.

Usage, from the backend directory:
  python -m scripts.import_lecture_pdfs --directory /path/to/private_materials
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.database import connection, initialize, utcnow
from app.documents import extract_text

CATALOG_PATH = Path(__file__).resolve().parents[1] / "app" / "course_catalog.json"


def import_directory(folder: Path) -> dict:
    """Return imported, already_present and missing filenames (idempotent)."""
    if not folder.is_dir():
        raise NotADirectoryError(f"Material directory not found: {folder}")
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    initialize()
    imported, present, missing = [], [], []
    with connection() as db:
        course = db.execute("SELECT id FROM courses WHERE code=? ORDER BY id LIMIT 1", (catalog["course"]["code"],)).fetchone()
        if course is None:
            raise RuntimeError("Python course not found; check your StudyFlow database")
        for entry in catalog["lectures"]:
            filename = entry["source_file"]
            file = folder / filename
            if not file.is_file():
                missing.append(filename)
                continue
            lecture = db.execute("SELECT id FROM lectures WHERE course_id=? AND title=? ORDER BY id LIMIT 1", (course["id"], entry["title"])).fetchone()
            if lecture is None:
                raise RuntimeError(f"Missing lecture: {entry['title']}")
            existing = db.execute("SELECT id FROM sources WHERE lecture_id=? AND filename=?", (lecture["id"], filename)).fetchone()
            if existing:
                present.append(filename)
                continue
            content = extract_text(filename, file.read_bytes())
            source_id = db.execute("INSERT INTO sources(lecture_id,filename,content,created_at) VALUES(?,?,?,?)", (lecture["id"], filename, content, utcnow())).lastrowid
            db.execute("UPDATE questions SET source_id=? WHERE lecture_id=? AND source_id IS NULL", (source_id, lecture["id"]))
            imported.append(filename)
    return {"imported": imported, "already_present": present, "missing": missing}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True, type=Path, help="Folder containing the original PDFs; NOT checked into GitHub")
    args = parser.parse_args()
    result = import_directory(args.directory)
    for key, names in result.items():
        print(f"{key}: {len(names)}")
        for name in names:
            print(f"  - {name}")


if __name__ == "__main__":
    main()