
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


DATABASE = "the_unheard_citizen.db"


def get_db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


@asynccontextmanager
async def lifespan(app: FastAPI):
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS complaints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                description TEXT NOT NULL,
                severity INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'Received',
                created_at TEXT NOT NULL
            )
        """)
    yield


app = FastAPI(
    title="The Unheard Citizen API",
    description="Backend for citizen complaint reporting",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ComplaintCreate(BaseModel):
    title: str = Field(min_length=5, max_length=150)
    category: str = Field(min_length=1, max_length=50)
    description: str = Field(min_length=10, max_length=2000)
    severity: int = Field(ge=1, le=5)


@app.get("/")
def home():
    return {"message": "The Unheard Citizen API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/complaints", status_code=201)
def create_complaint(complaint: ComplaintCreate):
    with get_db() as db:
        cursor = db.execute(
            """
            INSERT INTO complaints
            (title, category, description, severity, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                complaint.title,
                complaint.category,
                complaint.description,
                complaint.severity,
                datetime.now(timezone.utc).isoformat(),
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
def update_status(complaint_id: int, status: str):
    allowed = {
        "Received", "Under Review", "In Progress", "Resolved"
    }

    if status not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Invalid complaint status",
        )

    with get_db() as db:
        cursor = db.execute(
            "UPDATE complaints SET status = ? WHERE id = ?",
            (status, complaint_id),
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
