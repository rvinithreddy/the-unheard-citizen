import json
import os
import re
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


# Resolve database and artifact paths reliably regardless of execution working directory.
BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent
ENV_DB = os.getenv("DATABASE_PATH")
if ENV_DB:
    DATABASE = Path(ENV_DB).resolve()
elif (REPO_ROOT / "the_unheard_citizen.db").exists():
    DATABASE = (REPO_ROOT / "the_unheard_citizen.db").resolve()
elif (BASE_DIR / "the_unheard_citizen.db").exists():
    DATABASE = (BASE_DIR / "the_unheard_citizen.db").resolve()
else:
    DATABASE = (REPO_ROOT / "the_unheard_citizen.db").resolve()

AI_ARTIFACTS_DIR = BASE_DIR / "ai_artifacts"
MODEL_PATH = AI_ARTIFACTS_DIR / "complaint_ai_model.joblib"
CSV_PATH = AI_ARTIFACTS_DIR / "civic_complaints.csv"
CONFIG_PATH = AI_ARTIFACTS_DIR / "ai_config.json"

ai_model: Any = None
ai_config: dict = {}
training_data: pd.DataFrame | None = None
ai_load_error: str | None = None


def load_ai_artifacts() -> None:
    """Load the saved model and optional reference data without blocking API startup."""
    global ai_model, ai_config, training_data, ai_load_error

    try:
        if CONFIG_PATH.exists():
            with CONFIG_PATH.open("r", encoding="utf-8") as file:
                ai_config = json.load(file)

        if MODEL_PATH.exists():
            ai_model = joblib.load(MODEL_PATH)
        else:
            ai_load_error = f"AI model not found: {MODEL_PATH}"

        if CSV_PATH.exists():
            training_data = pd.read_csv(CSV_PATH)

        if ai_model is not None:
            ai_load_error = None
    except Exception as exc:
        ai_load_error = f"{type(exc).__name__}: {exc}"
        ai_model = None


ALLOWED_STATUSES = {
    "Reported",
    "Received",
    "Under Review",
    "In Progress",
    "Resolved",
    "Overdue",
}
STATUS_CANONICAL_MAP = {s.lower(): s for s in ALLOWED_STATUSES}


def get_db():
    connection = sqlite3.connect(str(DATABASE), check_same_thread=False)
    connection.row_factory = sqlite3.Row
    return connection


@asynccontextmanager
async def lifespan(app: FastAPI):
    with get_db() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS complaints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                location TEXT NOT NULL DEFAULT 'Location not provided',
                description TEXT NOT NULL,
                severity INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'Reported',
                created_at TEXT NOT NULL,
                upvotes INTEGER NOT NULL DEFAULT 0,
                citizen_name TEXT NOT NULL DEFAULT 'Anonymous Citizen'
            )
            """
        )
        # Safe migrations for existing SQLite databases
        columns = [row["name"] for row in db.execute("PRAGMA table_info(complaints)").fetchall()]
        if "location" not in columns:
            db.execute("ALTER TABLE complaints ADD COLUMN location TEXT NOT NULL DEFAULT 'Location not provided'")
        if "upvotes" not in columns:
            db.execute("ALTER TABLE complaints ADD COLUMN upvotes INTEGER NOT NULL DEFAULT 0")
        if "citizen_name" not in columns:
            db.execute("ALTER TABLE complaints ADD COLUMN citizen_name TEXT NOT NULL DEFAULT 'Anonymous Citizen'")

        # Create users table for citizen and admin roles
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'citizen',
                ward TEXT DEFAULT 'Central Ward',
                pin TEXT DEFAULT '2026',
                created_at TEXT NOT NULL
            )
            """
        )

        # Create upvotes_log table to track user votes and prevent duplicate votes
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS upvotes_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complaint_id INTEGER NOT NULL,
                user_identifier TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(complaint_id, user_identifier)
            )
            """
        )

        # Seed default prototype accounts if table is empty
        user_count = db.execute("SELECT COUNT(*) as count FROM users").fetchone()["count"]
        if user_count == 0:
            now_str = datetime.now(timezone.utc).isoformat()
            db.execute(
                """
                INSERT INTO users (username, name, role, ward, pin, created_at)
                VALUES
                    ('priya.citizen', 'Priya Sharma', 'citizen', 'Ward 12, South Zone', '2026', ?),
                    ('aarav.citizen', 'Aarav Patel', 'citizen', 'Central Ward', '2026', ?),
                    ('admin', 'Municipal Staff Administrator', 'admin', 'City Operations Centre', '2026', ?)
                """,
                (now_str, now_str, now_str),
            )
        db.commit()

    load_ai_artifacts()
    yield


app = FastAPI(
    title="The Unheard Citizen API",
    description="Backend for citizen complaint reporting with AI-assisted analysis",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "https://the-unheard-citizen-frontend.vercel.app",
        "null",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ComplaintCreate(BaseModel):
    title: str = Field(min_length=5, max_length=150)
    category: str = Field(min_length=1, max_length=50)
    location: str | None = Field(default="Location not provided", max_length=180)
    description: str = Field(min_length=10, max_length=2000)
    severity: int = Field(default=3, ge=1, le=5)
    citizen_name: str | None = Field(default="Anonymous Citizen", max_length=100)


class ComplaintStatusUpdate(BaseModel):
    status: str = Field(min_length=1, max_length=50)


class UpvoteRequest(BaseModel):
    user_identifier: str | None = Field(default="anonymous", max_length=100)


class AuthLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=60)
    role: str = Field(default="citizen", max_length=20)
    pin: str | None = Field(default=None, max_length=20)


class AuthRegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=60)
    name: str = Field(min_length=2, max_length=100)
    ward: str | None = Field(default="Central Ward", max_length=100)


class AIAnalysisRequest(BaseModel):
    title: str = Field(min_length=5, max_length=150)
    description: str = Field(min_length=10, max_length=2000)


def _text_for_model(title: str, description: str) -> str:
    return f"{title.strip()}. {description.strip()}"


def _predict_category(text: str) -> dict:
    """Use the saved classifier when available; do not invent a prediction if it fails."""
    if ai_model is None:
        return {
            "suggested_category": None,
            "category_confidence": None,
            "model_available": False,
        }

    try:
        prediction_input = [text]
        predicted = ai_model.predict(prediction_input)[0]
        confidence = None

        if hasattr(ai_model, "predict_proba"):
            probabilities = ai_model.predict_proba(prediction_input)[0]
            confidence = round(float(max(probabilities)), 4)

        return {
            "suggested_category": str(predicted),
            "category_confidence": confidence,
            "model_available": True,
        }
    except Exception as exc:
        return {
            "suggested_category": None,
            "category_confidence": None,
            "model_available": False,
            "model_note": f"Model prediction failed: {type(exc).__name__}",
        }


def _summarize(text: str, max_chars: int = 240) -> str:
    """Simple extractive summary; this is not a generative language model."""
    cleaned = re.sub(r"\s+", " ", text).strip()
    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    summary = sentences[0] if sentences else cleaned
    if len(summary) > max_chars:
        summary = summary[: max_chars - 3].rsplit(" ", 1)[0] + "..."
    return summary


def _assess_severity(text: str) -> dict:
    """Rule-based suggestion only. It must be reviewed by a person."""
    lower = text.lower()
    levels = {
        5: [
            "fire", "gas leak", "electrocution", "live wire", "electric wire",
            "collapsed", "building collapse", "major accident", "life threatening",
            "severe flooding", "open manhole", "exposed wire",
        ],
        4: [
            "water leak", "burst pipe", "sewage overflow", "deep pothole",
            "streetlight not working", "dark road", "blocked emergency access",
            "dangerous", "injury", "accident", "overflowing drain",
        ],
        3: [
    "garbage", "waste", "drainage", "pothole", "broken road",
    "damaged road", "road damage", "road damaged",
    "damaged section of road", "road surface",
    "no water", "water supply", "sewer", "stray", "mosquito",
],
        2: ["noise", "damaged sign", "broken bench", "minor", "litter"],
    }

    score = 1
    matched_signals = []
    for level in (5, 4, 3, 2):
        hits = [keyword for keyword in levels[level] if keyword in lower]
        if hits:
            score = level
            matched_signals = hits[:3]
            break

    return {
        "suggested_severity": score,
        "severity_note": "AI-assisted estimate only; a human should verify severity.",
        "severity_signals": matched_signals,
    }


def _find_similar(text: str, limit: int = 3) -> list[dict]:
    """Find semantically similar saved complaints using a pretrained AI model."""

    try:
        from sentence_transformers import SentenceTransformer
        from sklearn.metrics.pairwise import cosine_similarity

        # Load the model once and reuse it for future requests.
        if not hasattr(_find_similar, "_semantic_model"):
            _find_similar._semantic_model = SentenceTransformer(
                "sentence-transformers/all-MiniLM-L6-v2"
            )

        model = _find_similar._semantic_model

    except Exception as exc:
        print(f"Semantic AI unavailable: {type(exc).__name__}: {exc}")
        return []

    # Compare only against real complaints saved in the database.
    try:
        with get_db() as db:
            rows = db.execute(
                """
                SELECT id, title, category, location, description, status
                FROM complaints
                ORDER BY id DESC
                LIMIT 300
                """
            ).fetchall()
    except sqlite3.Error:
        return []

    candidates = []

    for row in rows:
        candidate_text = f"{row['title']}. {row['description']}".strip()

        if candidate_text:
            candidates.append({
                "complaint_id": row["id"],
                "title": row["title"],
                "category": row["category"],
                "location": row["location"] if "location" in row.keys() else "Location not provided",
                "description": row["description"],
                "status": row["status"],
                "text": candidate_text,
                "source": "database",
            })

    if not candidates:
        return []

    try:
        embeddings = model.encode(
            [text] + [item["text"] for item in candidates],
            normalize_embeddings=True,
            convert_to_numpy=True,
        )

        # Normalized embeddings allow cosine similarity via dot product.
        scores = embeddings[1:] @ embeddings[0]

    except Exception as exc:
        print(f"Semantic comparison failed: {type(exc).__name__}: {exc}")
        return []

    # This is a starting threshold; we'll validate it with real examples.
    threshold = float(ai_config.get("semantic_similarity_threshold", 0.55))

    results = []

    for index in scores.argsort()[::-1][:limit]:
        score = float(scores[index])

        if score < threshold:
            continue

        item = candidates[int(index)]

        results.append({
            "complaint_id": item["complaint_id"],
            "title": item["title"][:150],
            "category": item["category"],
            "location": item.get("location", "Location not provided"),
            "status": item["status"],
            "similarity": round(score, 4),
            "source": "database",
            "possible_duplicate": True,
            "note": (
                "Semantic similarity is a lead for human review, "
                "not proof that two complaints describe the same incident."
            ),
        })

    return results


def analyze_text(title: str, description: str) -> dict:
    if ai_model is None:
        load_ai_artifacts()
    combined = _text_for_model(title, description)
    category_result = _predict_category(combined)
    severity_result = _assess_severity(combined)
    similar = _find_similar(combined)

    return {
        **category_result,
        "summary": _summarize(description),
        **severity_result,
        "possible_duplicates": similar,
        "human_review_required": True,
        "limitations": [
            "The category model was trained on synthetic examples and may be inaccurate.",
            "Severity is a keyword-based suggestion, not a verified risk assessment.",
            "The summary is extractive and is not generated by a large language model.",
            "Possible duplicate matches must be checked by a person.",
        ],
    }


@app.get("/")
def home():
    return {"message": "The Unheard Citizen API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/ai/status")
def ai_status():
    return {
        "model_loaded": ai_model is not None,
        "reference_csv_loaded": training_data is not None,
        "config_loaded": bool(ai_config),
        "model_path": str(MODEL_PATH),
        "note": ai_load_error,
    }


@app.post("/api/ai/analyze")
def analyze_complaint(request: AIAnalysisRequest):
    """Return AI suggestions before the user submits a complaint."""
    return analyze_text(request.title, request.description)


@app.post("/api/complaints", status_code=201)
def create_complaint(complaint: ComplaintCreate):
    cleaned_location = (
        complaint.location.strip()
        if complaint.location and complaint.location.strip()
        else "Location not provided"
    )
    cleaned_citizen = (
        complaint.citizen_name.strip()
        if complaint.citizen_name and complaint.citizen_name.strip()
        else "Anonymous Citizen"
    )
    with get_db() as db:
        cursor = db.execute(
            """
            INSERT INTO complaints
            (title, category, location, description, severity, status, created_at, upvotes, citizen_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
            """,
            (
                complaint.title.strip(),
                complaint.category.strip(),
                cleaned_location,
                complaint.description.strip(),
                complaint.severity,
                "Reported",
                datetime.now(timezone.utc).isoformat(),
                cleaned_citizen,
            ),
        )
        complaint_id = cursor.lastrowid
        row = db.execute(
            "SELECT * FROM complaints WHERE id = ?",
            (complaint_id,),
        ).fetchone()

    return dict(row)



@app.get("/api/complaints")
def list_complaints(
    category: str | None = None,
    status: str | None = None,
):
    query = "SELECT * FROM complaints WHERE 1=1"
    params = []

    if category:
        query += " AND category = ?"
        params.append(category)

    if status:
        query += " AND status = ?"
        params.append(status)

    query += " ORDER BY id DESC"

    with get_db() as db:
        rows = db.execute(query, params).fetchall()
    return [dict(row) for row in rows]


@app.patch("/api/complaints/{complaint_id}/status")
def update_status(
    complaint_id: int,
    payload: ComplaintStatusUpdate | None = None,
    status: str | None = None,
):
    incoming_status = None
    if payload and payload.status:
        incoming_status = payload.status
    elif status:
        incoming_status = status

    if not incoming_status or not incoming_status.strip():
        raise HTTPException(
            status_code=400,
            detail="Status value is required in the request body or as a query parameter",
        )

    normalized_status = STATUS_CANONICAL_MAP.get(incoming_status.strip().lower())
    if not normalized_status:
        valid_options = ", ".join(sorted(ALLOWED_STATUSES))
        raise HTTPException(
            status_code=400,
            detail=f"Invalid complaint status '{incoming_status}'. Allowed statuses: {valid_options}",
        )

    with get_db() as db:
        cursor = db.execute(
            "UPDATE complaints SET status = ? WHERE id = ?",
            (normalized_status, complaint_id),
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Complaint not found",
            )

        row = db.execute(
            "SELECT * FROM complaints WHERE id = ?",
            (complaint_id,),
        ).fetchone()

    return dict(row)


@app.post("/api/complaints/{complaint_id}/upvote")
def upvote_complaint(complaint_id: int, payload: UpvoteRequest | None = None):
    user_id = (
        payload.user_identifier.strip()
        if payload and payload.user_identifier and payload.user_identifier.strip()
        else "anonymous"
    )
    with get_db() as db:
        complaint = db.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
        if not complaint:
            raise HTTPException(status_code=404, detail="Complaint not found")

        # Check if user already upvoted this complaint
        existing = db.execute(
            "SELECT * FROM upvotes_log WHERE complaint_id = ? AND user_identifier = ?",
            (complaint_id, user_id),
        ).fetchone()

        if existing and user_id != "anonymous":
            return {
                "already_upvoted": True,
                "upvotes": complaint["upvotes"],
                "complaint": dict(complaint),
                "message": "You have already upvoted this complaint.",
            }

        now_iso = datetime.now(timezone.utc).isoformat()
        if user_id != "anonymous":
            db.execute(
                "INSERT OR IGNORE INTO upvotes_log (complaint_id, user_identifier, created_at) VALUES (?, ?, ?)",
                (complaint_id, user_id, now_iso),
            )
        db.execute(
            "UPDATE complaints SET upvotes = upvotes + 1 WHERE id = ?",
            (complaint_id,),
        )
        db.commit()
        updated = db.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()

    return {
        "already_upvoted": False,
        "upvotes": updated["upvotes"],
        "complaint": dict(updated),
        "message": "Upvote registered successfully.",
    }


@app.post("/api/auth/login")
def auth_login(req: AuthLoginRequest):
    username = req.username.strip().lower()
    role = req.role.strip().lower()
    with get_db() as db:
        user = db.execute("SELECT * FROM users WHERE LOWER(username) = ?", (username,)).fetchone()
        if role == "admin":
            if req.pin != "2026":
                raise HTTPException(status_code=401, detail="Invalid admin PIN. Use 2026 for demo access.")
            if not user or user["role"] != "admin":
                user = db.execute("SELECT * FROM users WHERE role = 'admin'").fetchone()
        else:
            if not user:
                now_iso = datetime.now(timezone.utc).isoformat()
                cursor = db.execute(
                    "INSERT INTO users (username, name, role, ward, pin, created_at) VALUES (?, ?, 'citizen', 'Central Ward', '2026', ?)",
                    (username, username.replace('.', ' ').title(), now_iso),
                )
                db.commit()
                user = db.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()

    return {
        "authenticated": True,
        "role": user["role"],
        "user": {
            "id": user["id"],
            "username": user["username"],
            "name": user["name"],
            "role": user["role"],
            "ward": user["ward"],
        },
        "demo_notice": "Demo simulation authentication for IBM Z Datathon 2026.",
    }


@app.post("/api/auth/register", status_code=201)
def auth_register(req: AuthRegisterRequest):
    username = req.username.strip().lower()
    with get_db() as db:
        existing = db.execute("SELECT * FROM users WHERE LOWER(username) = ?", (username,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists. Please log in.")
        now_iso = datetime.now(timezone.utc).isoformat()
        cursor = db.execute(
            "INSERT INTO users (username, name, role, ward, pin, created_at) VALUES (?, ?, 'citizen', ?, '2026', ?)",
            (username, req.name.strip(), (req.ward or "Central Ward").strip(), now_iso),
        )
        db.commit()
        user = db.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()

    return {
        "authenticated": True,
        "role": "citizen",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "name": user["name"],
            "role": user["role"],
            "ward": user["ward"],
        },
        "demo_notice": "Demo citizen registration for IBM Z Datathon 2026.",
    }


@app.get("/api/auth/users")
def list_demo_users():
    with get_db() as db:
        rows = db.execute("SELECT id, username, name, role, ward, created_at FROM users").fetchall()
    return [dict(r) for r in rows]

