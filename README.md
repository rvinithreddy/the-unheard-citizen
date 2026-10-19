# THE UNHEARD CITIZEN
> **IBM Z Datathon 2026 — AI-Assisted Civic Complaint Reporting Platform**
> *"Report Today. Solve Tomorrow. Your Voice. A Better Tomorrow."*

The Unheard Citizen connects community members directly with civic administrators to report local infrastructure breakdowns, street hazards, and sanitation gaps. The platform combines accessible citizen reporting with transparent tracking and responsible, human-in-the-loop AI screening.

---

## 🏛️ System Architecture & Tech Stack

| Layer | Technology | Key Capabilities |
| :--- | :--- | :--- |
| **Frontend** | Vanilla HTML5, CSS3, ES6+ JavaScript | Responsive layout, dependency-free, zero-build setup, accessible semantic UI, live statistics |
| **Backend** | Python (FastAPI, Starlette) | RESTful API, SQLite database with safe auto-migrations, CORS configuration |
| **Civic AI Engine** | Scikit-learn, Sentence-Transformers (`all-MiniLM-L6-v2`) | Category classification, hazard severity rating (1–5), safety signal keyword detection, extractive summarization, and duplicate complaint discovery |

---

## 🚀 How to Run Locally

### Prerequisites
- Python 3.10+ (tested on Python 3.14)
- Any modern web browser (Google Chrome, Microsoft Edge, Firefox, Brave)

---

### Step 1: Install Backend Dependencies
Open your terminal (PowerShell or Bash) and navigate to the project root:

```bash
cd the-unheard-citizen
pip install -r backend/requirements.txt
```
*(On Windows systems where Python is registered as `py`, you can use `py -m pip install -r backend/requirements.txt`)*

---

### Step 2: Start the FastAPI Backend
Start the local server on port 8000:

```bash
uvicorn backend.main:app --reload --port 8000
```
*(Or `py -m uvicorn backend.main:app --reload --port 8000`)*

The backend will start at:
- **API Base:** `http://127.0.0.1:8000`
- **Interactive API Docs (Swagger):** `http://127.0.0.1:8000/docs`

---

### Step 3: Launch the Frontend
You can launch the frontend using either method below:

- **Method A (Easiest — Direct Open):**
  Double-click `frontend/index.html` or open it in your browser. The frontend automatically detects local execution and routes requests to `http://127.0.0.1:8000`.

- **Method B (Local HTTP Server):**
  In a separate terminal window:
  ```bash
  py -m http.server 5500 -d frontend
  ```
  Then open [http://localhost:5500](http://localhost:5500) in your browser.

---

## 🧭 Step-by-Step Demonstration Walkthrough for Evaluators

Follow these 5 steps to verify all features:

### 1. Explore the Live Homepage
- Navigate to the **Home** view.
- Notice the live statistics strip (*Total Submissions, Resolved, In Progress, Under Review, High Attention*). All numbers reflect real records from the local SQLite database.
- Click any category card (e.g., **Roads & Infrastructure**) — it routes you directly to the reporting form with the category pre-selected.

### 2. Submit a Complaint with Real-Time Civic AI Screening
- Open **Report Issue**.
- Type in a Title: `Broken electrical cable across pedestrian path`
- Enter a Location: `Main Street near City Park`
- In the Description, type: `A live wire is exposed on the sidewalk near water accumulation, creating a serious hazard for commuters and children.`
- **Observe the AI Assistant Card:**
  - Debounced analysis runs without freezing the page.
  - Suggests category (e.g., *Street Lighting / Roads*).
  - Flags hazard severity gauge at **Level 5 (Critical)**.
  - Highlights detected safety signal chips: `live wire`, `hazard`.
  - Shows duplicate detection matches from existing database tickets.
- Click **Apply Suggestion ✓** to apply the recommended category.
- Click **Submit Report →**. A success confirmation with a reference ticket ID will appear.

### 3. Community Tracking & Inspection
- Click **Track Complaints** in the navigation bar.
- Use the instant search box to search by keyword, location, or ticket ID.
- Use the **Status** and **Category** dropdown filters to narrow reports.
- Click **Details ↗** on any complaint row to open the full ticket modal, viewing the complete description and AI screening results.

### 4. Review the Impact Dashboard
- Click **Dashboard**.
- Review the impact cards and the **Report Status Overview** distribution chart.
- Note the **Live Database** badge confirming statistics are dynamically computed from real SQLite records.

### 5. Admin Command Centre (Triage & Status Updates)
- Click the **Admin View** button in the top right.
- When prompted for the demo gate, enter PIN: `2026` (or click *"Use Demo PIN"*).
- Notice the Staff Workspace header and the explicit **Demo Access disclaimer**.
- Test the Admin Queue:
  - Search or filter complaints by **Severity** (*Critical, High, Medium, Low*), **Status**, or **Category**.
  - In the **Update Status** column, select a new status (e.g., change a ticket to `In Progress` or `Resolved`).
  - An instant toast notification confirms the change, and the update is saved to the SQLite database via `PATCH /api/complaints/{id}/status`.
  - Switch back to **Home** or **Dashboard** to see the counters update.
  - Click **🔒 Lock Session** to re-secure the staff workspace.

### 6. Citizen Identity & Community Upvoting
- Click the **Citizen Profile** button in the topbar (`👤 Priya Sharma (Ward 12)`).
- Select from demo citizen personas (*Priya Sharma — Ward 12*, *Aarav Patel — Central Ward*) or enter custom name and ward.
- In **Track Complaints**, click **▲ Upvote** on any community report. The vote counter increments live, duplicate votes from the same user are prevented, and votes sync with the backend.
- Click **👤 My Reports** to instantly filter reports submitted by your active citizen profile.

---

## 🛡️ Responsible Governance & Security Notices

- **Demo Admin PIN & Citizen Login:** The PIN gate (`2026`) and citizen profile switcher are prototype simulations designed for evaluation during the IBM Z Datathon. They are not cryptographic authentication. In production, these would be replaced with role-based JWT tokens, TLS encryption, and server-side RBAC.
- **Human-in-the-Loop AI:** The AI models provide assistive screening (severity signals, category suggestion, and duplicate discovery). All final triage and resolution actions require human civic administrator review.

