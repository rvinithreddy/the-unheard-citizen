/*
 * The Unheard Citizen — Frontend Client
 * Connected to FastAPI backend at http://localhost:8000
 */
const isLocal = typeof window !== "undefined" && (
  !window.location.hostname ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.protocol === "file:"
);
const API_BASE = isLocal
  ? "http://localhost:8000"
  : "https://the-unheard-citizen-api.onrender.com";
const USE_API = true;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let aiDebounceTimer = null;
let aiAbortController = null;
let lastAnalyzedText = "";
let latestAIResult = null;

let currentCitizen = {
  username: "priya.citizen",
  name: "Priya Sharma",
  ward: "Ward 12, South Zone"
};
try {
  const savedCitizen = sessionStorage.getItem("uc_citizen_profile") || localStorage.getItem("uc_citizen_profile");
  if (savedCitizen) currentCitizen = JSON.parse(savedCitizen);
} catch (e) {}

let votedComplaints = new Set();
function loadUserVotes() {
  votedComplaints = new Set();
  try {
    const key = `uc_voted_${currentCitizen.username || "anonymous"}`;
    const savedVotes = localStorage.getItem(key) || localStorage.getItem("uc_voted_complaints");
    if (savedVotes) votedComplaints = new Set(JSON.parse(savedVotes));
  } catch (e) {}
}
loadUserVotes();

function saveUserVotes() {
  try {
    const key = `uc_voted_${currentCitizen.username || "anonymous"}`;
    localStorage.setItem(key, JSON.stringify([...votedComplaints]));
    localStorage.setItem("uc_voted_complaints", JSON.stringify([...votedComplaints]));
  } catch (e) {}
}

let filterMyReports = false;

const DEMO_REPORTS = [
  {id:"1001",title:"Large pothole near the main bus stop",category:"Roads & Infrastructure",location:"Central Market Road",description:"A deep pothole is making the road unsafe for two-wheelers.",status:"In Progress",priority:"High",created_at:"2026-10-15",upvotes:6,citizen_name:"Priya Sharma"},
  {id:"1002",title:"Garbage overflowing near market",category:"Waste Management",location:"Market Street",description:"Waste has accumulated near the public bins.",status:"Reported",priority:"Medium",created_at:"2026-10-14",upvotes:3,citizen_name:"Aarav Patel"},
  {id:"1003",title:"Streetlight not working",category:"Street Lighting",location:"Lake View Lane",description:"The streetlight has not worked for several nights.",status:"Resolved",priority:"Medium",created_at:"2026-10-12",upvotes:2,citizen_name:"Anita Deshmukh"},
  {id:"1004",title:"Wheelchair access blocked",category:"Accessibility Barrier",location:"Community Health Centre",description:"The ramp entrance is blocked by parked vehicles.",status:"Under Review",priority:"High",created_at:"2026-10-16",upvotes:5,citizen_name:"Priya Sharma"},
  {id:"1005",title:"Irregular water supply",category:"Water Supply",location:"Green Park Colony",description:"Water supply has been irregular this week.",status:"Overdue",priority:"High",created_at:"2026-10-08",upvotes:4,citizen_name:"Karan Verma"}
];
let reports = [];
let toastTimer;

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function normalizeComplaint(item, index = 0) {
  const rawSev = Number(item.severity ?? 3);
  const sevPriority = rawSev >= 4 ? "High" : (rawSev >= 3 ? "Medium" : "Low");
  return {
    id: item.id ?? item.complaint_id ?? item.ticket_id ?? (1001 + index),
    title: item.title ?? item.subject ?? "Community report",
    category: item.category ?? "Other",
    location: item.location ?? item.address ?? "Location not provided",
    description: item.description ?? item.details ?? "",
    status: normalizeStatus(item.status ?? "Reported"),
    priority: item.priority ?? sevPriority,
    severity: rawSev,
    created_at: item.created_at ?? item.createdAt ?? item.date ?? "",
    upvotes: Number(item.upvotes ?? 0),
    citizen_name: item.citizen_name || "Anonymous Citizen"
  };
}
function normalizeStatus(status) {
  const value = String(status || "Reported").toLowerCase().replaceAll("_"," ").replaceAll("-"," ").trim();
  const known = {
    "submitted":"Reported",
    "new":"Reported",
    "pending":"Reported",
    "reported":"Reported",
    "received":"Reported",
    "under review":"Under Review",
    "in review":"Under Review",
    "in progress":"In Progress",
    "processing":"In Progress",
    "resolved":"Resolved",
    "closed":"Resolved",
    "completed":"Resolved",
    "overdue":"Overdue"
  };
  return known[value] || (value.charAt(0).toUpperCase() + value.slice(1));
}
function statusClass(status) {
  return "status-" + status.toLowerCase().replaceAll(" ","-");
}
function makePayload(form) {
  const data = new FormData(form);
  return {
    title: String(data.get("title") || "").trim(),
    category: String(data.get("category") || "").trim(),
    location: String(data.get("location") || "").trim(),
    description: String(data.get("description") || "").trim(),
    severity: Number(data.get("severity") || 3),
    citizen_name: String(data.get("citizen_name") || currentCitizen.name || "Anonymous Citizen").trim()
  };
}

async function loadReports() {
  if (!USE_API) {
    reports = DEMO_REPORTS.map(normalizeComplaint);
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/api/complaints`);
    if (!response.ok) throw new Error(`API returned HTTP ${response.status}`);
    const body = await response.json();
    const rows = Array.isArray(body) ? body : (body.complaints ?? body.items ?? body.data ?? []);
    reports = rows.map(normalizeComplaint);

    const note = $("#complaintSourceNote");
    if (note) note.textContent = "Connected to backend API (live database records).";
    const dashPill = $("#dashboardLivePill");
    if (dashPill) dashPill.textContent = "Live Database";
    const dashSub = $("#dashboardStatusSubtitle");
    if (dashSub) dashSub.textContent = "Real-time status distribution from community submissions";
  } catch (error) {
    reports = DEMO_REPORTS.map(normalizeComplaint);
    const note = $("#complaintSourceNote");
    if (note) note.textContent = `Could not reach backend at ${API_BASE} (${error.message}). Showing offline fallback records.`;
    console.warn("Complaint API unavailable:", error);
  }
}

function categoriesMatch(selected, actual) {
  if (!selected) return true;
  if (!actual) return false;
  if (selected.toLowerCase() === actual.toLowerCase()) return true;
  const s = selected.toLowerCase();
  const a = actual.toLowerCase();
  if (s.includes("road") && a.includes("road")) return true;
  if (s.includes("waste") && (a.includes("waste") || a.includes("garbage"))) return true;
  if (s.includes("water") && (a.includes("water") || a.includes("leak"))) return true;
  if (s.includes("light") && (a.includes("light") || a.includes("lamp"))) return true;
  if (s.includes("public") && (a.includes("public") || a.includes("infrastruct") || a.includes("facil"))) return true;
  return false;
}

function getCounts() {
  const normCat = (cat) => String(cat || "").toLowerCase();
  const isHigh = (r) => {
    const p = String(r.priority ?? "").toLowerCase();
    const s = Number(r.severity ?? 0);
    return p.includes("high") || p.includes("critical") || s >= 4;
  };
  return {
    total: reports.length,
    resolved: reports.filter(r => r.status === "Resolved").length,
    progress: reports.filter(r => r.status === "In Progress").length,
    underReview: reports.filter(r => r.status === "Under Review").length,
    reported: reports.filter(r => r.status === "Reported" || r.status === "Received").length,
    overdue: reports.filter(r => r.status === "Overdue").length,
    high: reports.filter(isHigh).length,
    pending: reports.filter(r => ["Reported", "Received", "Under Review"].includes(r.status)).length,
    // Real category counts from backend records
    roadCount: reports.filter(r => normCat(r.category).includes("road")).length,
    wasteCount: reports.filter(r => normCat(r.category).includes("waste") || normCat(r.category).includes("garbage")).length,
    waterCount: reports.filter(r => normCat(r.category).includes("water") || normCat(r.category).includes("leak")).length,
    lightCount: reports.filter(r => normCat(r.category).includes("light") || normCat(r.category).includes("lamp")).length,
    publicCount: reports.filter(r => normCat(r.category).includes("public") || normCat(r.category).includes("access") || normCat(r.category).includes("facil") || normCat(r.category).includes("infrastruct")).length,
  };
}

function renderStats() {
  const c = getCounts();
  const values = {
    total: c.total.toLocaleString("en-IN"),
    resolved: c.resolved.toLocaleString("en-IN"),
    progress: c.progress.toLocaleString("en-IN"),
    underReview: c.underReview.toLocaleString("en-IN"),
    overdue: c.overdue.toLocaleString("en-IN"),
    high: c.high.toLocaleString("en-IN"),
    pending: c.pending.toLocaleString("en-IN"),
    road: `${c.roadCount} report${c.roadCount === 1 ? "" : "s"}`,
    waste: `${c.wasteCount} report${c.wasteCount === 1 ? "" : "s"}`,
    water: `${c.waterCount} report${c.waterCount === 1 ? "" : "s"}`,
    light: `${c.lightCount} report${c.lightCount === 1 ? "" : "s"}`,
    public: `${c.publicCount} report${c.publicCount === 1 ? "" : "s"}`,
  };

  [
    // Homepage live statistics
    ["#homeTotalStat", values.total],
    ["#homeResolvedStat", values.resolved],
    ["#homeProgressStat", values.progress],
    ["#homeReviewStat", values.underReview],
    ["#homeAttentionStat", values.high],
    // Homepage category counts
    ["#catRoadCount", values.road],
    ["#catWasteCount", values.waste],
    ["#catWaterCount", values.water],
    ["#catLightCount", values.light],
    ["#catPublicCount", values.public],
    // Dashboard page
    ["#dashTotal", values.total],
    ["#dashResolved", values.resolved],
    ["#dashProgress", values.progress],
    ["#dashOverdue", values.overdue],
    // Admin page
    ["#adminTotal", values.total],
    ["#adminResolved", values.resolved],
    ["#adminPending", values.pending],
    ["#adminHigh", values.high],
  ].forEach(([sel, val]) => {
    const el = $(sel);
    if (el) el.textContent = val;
  });

  const chart = $("#statusChart");
  if (chart) {
    const chartItems = [
      ["Reported", c.reported],
      ["Under Review", c.underReview],
      ["In Progress", c.progress],
      ["Resolved", c.resolved],
      ["Overdue", c.overdue]
    ];
    const max = Math.max(...chartItems.map(x => x[1]), 1);
    chart.innerHTML = chartItems.map(([label, value]) => `
      <div class="bar-row">
        <span>${escapeHtml(label)}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${Math.max(c.total > 0 && value > 0 ? 8 : 0, (value / max) * 100)}%"></div>
        </div>
        <span class="bar-value">${value}</span>
      </div>
    `).join("");
  }
}

function renderComplaints() {
  const search = ($("#complaintSearch")?.value || "").trim().toLowerCase();
  const status = $("#statusFilter")?.value || "";
  const category = $("#categoryFilter")?.value || "";

  const myBtn = $("#myReportsBtn");
  if (myBtn) {
    myBtn.classList.toggle("active", filterMyReports);
  }

  const filtered = reports.filter(r => {
    if (status && r.status !== status) return false;
    if (category && !categoriesMatch(category, r.category)) return false;
    if (filterMyReports) {
      const myName = (currentCitizen.name || "").toLowerCase().trim();
      const reportCitizen = String(r.citizen_name || "").toLowerCase().trim();
      if (!reportCitizen || !reportCitizen.includes(myName)) return false;
    }
    if (search) {
      const matches = [r.id, r.title, r.location, r.category, r.description, r.citizen_name]
        .some(v => String(v || "").toLowerCase().includes(search));
      if (!matches) return false;
    }
    return true;
  });

  const list = $("#complaintList");
  if (!list) return;

  if (!filtered.length) {
    list.innerHTML = filterMyReports
      ? `<div class="empty-state">You have not submitted any reports under profile "<strong>${escapeHtml(currentCitizen.name)}</strong>" yet. Click "Report Issue" to submit your first report!</div>`
      : '<div class="empty-state">No reports match those filters. Try a different search.</div>';
    return;
  }
  list.innerHTML = filtered.map(r => `
    <article class="complaint-row">
      <div class="complaint-main">
        <h3>${escapeHtml(r.title)}</h3>
        <div class="complaint-meta">
          <span class="complaint-id">#${escapeHtml(r.id)}</span>
          <span>${escapeHtml(r.category)}</span>
          <span>⌖ ${escapeHtml(r.location)}</span>
          <span>👤 ${escapeHtml(r.citizen_name || "Anonymous Citizen")}</span>
          <span>${escapeHtml(r.created_at ? r.created_at.slice(0, 10) : "Recent")}</span>
        </div>
        <p class="complaint-description">${escapeHtml(r.description)}</p>
      </div>
      <div class="complaint-side">
        <span class="status ${statusClass(r.status)}">${escapeHtml(r.status)}</span>
        <button type="button" class="btn btn-sm btn-upvote ${votedComplaints.has(String(r.id)) ? 'voted' : ''}" data-upvote-id="${escapeHtml(r.id)}" title="${votedComplaints.has(String(r.id)) ? 'You upvoted this issue' : 'Upvote this community report'}">▲ <span class="vote-num">${r.upvotes || 0}</span></button>
        <button type="button" class="btn btn-sm btn-white btn-view-detail" data-detail-id="${escapeHtml(r.id)}" title="Inspect details for this report">Details ↗</button>
      </div>
    </article>
  `).join("");
}

function getPriorityBadgeHtml(priority, severity) {
  const p = String(priority || "").toLowerCase();
  const s = Number(severity || 0);

  if (p.includes("crit") || s === 5) {
    return `<span class="priority-badge priority-critical">Critical (5/5)</span>`;
  }
  if (p.includes("high") || s === 4) {
    return `<span class="priority-badge priority-high">High (4/5)</span>`;
  }
  if (p.includes("med") || s === 3) {
    return `<span class="priority-badge priority-medium">Medium (3/5)</span>`;
  }
  if (p.includes("low") || s === 1 || s === 2) {
    return `<span class="priority-badge priority-low">Low (1-2)</span>`;
  }
  return `<span class="priority-badge priority-medium">${escapeHtml(priority || "Needs review")}</span>`;
}

function renderAdminTable() {
  const search = ($("#adminSearch")?.value || "").trim().toLowerCase();
  const statusFilter = $("#adminStatusFilter")?.value || "";
  const categoryFilter = $("#adminCategoryFilter")?.value || "";
  const severityFilter = $("#adminSeverityFilter")?.value || "";

  const filtered = reports.filter(r => {
    // Search query
    if (search) {
      const matches = [
        String(r.id),
        String(r.title),
        String(r.category),
        String(r.location),
        String(r.description),
        String(r.status),
        String(r.citizen_name || "")
      ].some(v => v.toLowerCase().includes(search));
      if (!matches) return false;
    }
    // Status filter
    if (statusFilter && r.status !== statusFilter) return false;
    // Category filter
    if (categoryFilter && !categoriesMatch(categoryFilter, r.category)) return false;
    // Severity / Priority filter
    if (severityFilter) {
      const p = String(r.priority || "").toLowerCase();
      const s = Number(r.severity || 0);
      if (severityFilter === "Critical" && !(p.includes("crit") || s === 5)) return false;
      if (severityFilter === "High" && !(p.includes("high") || s === 4)) return false;
      if (severityFilter === "Medium" && !(p.includes("med") || s === 3)) return false;
      if (severityFilter === "Low" && !(p.includes("low") || s === 1 || s === 2)) return false;
    }
    return true;
  });

  const tbody = $("#adminTableBody");
  const countBadge = $("#adminFilteredCount");
  if (countBadge) {
    countBadge.textContent = `Showing ${filtered.length} of ${reports.length} reports`;
  }

  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:24px; color:#64748b;">No matching reports found with the selected filters.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td class="ticket-col">
        <strong>#${escapeHtml(r.id)}</strong>
        <small>${escapeHtml(r.created_at ? r.created_at.slice(0, 10) : "Recent")}</small>
      </td>
      <td class="summary-col">
        <strong>${escapeHtml(r.title)}</strong>
        <p>${escapeHtml(r.description)}</p>
      </td>
      <td>${escapeHtml(r.category)}</td>
      <td>${escapeHtml(r.location)}</td>
      <td><span class="admin-upvotes-pill">▲ ${r.upvotes || 0}</span></td>
      <td>${getPriorityBadgeHtml(r.priority, r.severity)}</td>
      <td><span class="status ${statusClass(r.status)}">${escapeHtml(r.status)}</span></td>
      <td>
        <select class="status-select" data-report-id="${escapeHtml(r.id)}" aria-label="Update status for ticket ${escapeHtml(r.id)}">
          ${["Reported", "Under Review", "In Progress", "Resolved", "Overdue"].map(s => `
            <option value="${s}" ${s === r.status ? "selected" : ""}>${s}</option>
          `).join("")}
        </select>
      </td>
      <td>
        <button type="button" class="btn-view-detail" data-detail-id="${escapeHtml(r.id)}">View Details ↗</button>
      </td>
    </tr>
  `).join("");
}

function openComplaintDetail(id) {
  const row = reports.find(r => String(r.id) === String(id));
  if (!row) return;

  const modal = $("#complaintDetailModal");
  if (!modal) return;

  $("#modalComplaintId").textContent = `Ticket #${row.id}`;
  $("#modalComplaintTitle").textContent = row.title;
  $("#modalCategory").textContent = row.category;
  $("#modalLocation").textContent = row.location;

  const citizenEl = $("#modalCitizen");
  if (citizenEl) {
    citizenEl.textContent = row.citizen_name || "Anonymous Citizen";
  }

  const statusEl = $("#modalStatus");
  if (statusEl) {
    statusEl.className = `status ${statusClass(row.status)}`;
    statusEl.textContent = row.status;
  }

  const priorityEl = $("#modalPriority");
  if (priorityEl) {
    priorityEl.innerHTML = getPriorityBadgeHtml(row.priority, row.severity);
  }

  const upvotesEl = $("#modalUpvotes");
  if (upvotesEl) {
    const isVoted = votedComplaints.has(String(row.id));
    upvotesEl.innerHTML = `
      <button type="button" class="btn btn-sm btn-upvote modal-upvote-btn ${isVoted ? 'voted' : ''}" data-upvote-id="${escapeHtml(row.id)}" title="${isVoted ? 'You upvoted this issue' : 'Upvote this community report'}">
        ▲ <span class="vote-num">${row.upvotes || 0}</span> ${isVoted ? 'Upvoted' : 'Upvote'}
      </button>
    `;
  }

  $("#modalDate").textContent = row.created_at ? row.created_at.slice(0, 10) : "Recent";
  $("#modalDescription").textContent = row.description;

  // Real AI data display only when available
  const aiBlock = $("#modalAiAnalysisBlock");
  const summaryWrap = $("#modalAiSummaryWrap");
  const keywordsWrap = $("#modalAiKeywordsWrap");

  let hasAiData = false;
  if (row.summary) {
    $("#modalAiSummary").textContent = row.summary;
    summaryWrap.style.display = "block";
    hasAiData = true;
  } else {
    summaryWrap.style.display = "none";
  }

  if (Array.isArray(row.severity_signals) && row.severity_signals.length > 0) {
    $("#modalAiKeywords").innerHTML = row.severity_signals.map(s => `<span class="ai-keyword-chip">⚠ ${escapeHtml(s)}</span>`).join("");
    keywordsWrap.style.display = "block";
    hasAiData = true;
  } else {
    keywordsWrap.style.display = "none";
  }

  if (hasAiData) {
    aiBlock.style.display = "block";
  } else {
    aiBlock.style.display = "none";
  }

  modal.style.display = "flex";
}

function closeComplaintDetail() {
  const modal = $("#complaintDetailModal");
  if (modal) modal.style.display = "none";
}

function requestAdminAccess() {
  const isAuth = sessionStorage.getItem("uc_admin_demo_auth") === "true";
  if (isAuth) {
    setView("admin");
  } else {
    const modal = $("#adminPinModal");
    if (modal) {
      modal.style.display = "flex";
      const input = $("#adminPinInput");
      if (input) {
        input.value = "";
        input.focus();
      }
      const err = $("#adminPinError");
      if (err) err.style.display = "none";
    }
  }
}

async function unlockAdminSession() {
  const input = $("#adminPinInput");
  const val = (input?.value || "").trim();
  const err = $("#adminPinError");

  if (!val) {
    if (err) {
      err.textContent = "Please enter the admin PIN.";
      err.style.display = "block";
    }
    return;
  }

  if (USE_API) {
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", role: "admin", pin: val })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Authentication failed");
      }
      sessionStorage.setItem("uc_admin_demo_auth", "true");
      const modal = $("#adminPinModal");
      if (modal) modal.style.display = "none";
      if (err) err.style.display = "none";
      setView("admin");
      showToast("Staff Workspace unlocked in Demo Mode.");
      return;
    } catch (e) {
      if (err) {
        err.textContent = e.message || "Incorrect admin PIN. Use 2026 for demo access.";
        err.style.display = "block";
      }
      return;
    }
  }

  if (val === "2026") {
    sessionStorage.setItem("uc_admin_demo_auth", "true");
    const modal = $("#adminPinModal");
    if (modal) modal.style.display = "none";
    if (err) err.style.display = "none";
    setView("admin");
    showToast("Staff Workspace unlocked in Demo Mode.");
  } else {
    if (err) {
      err.textContent = "Incorrect demo PIN. Use 2026 for prototype evaluation.";
      err.style.display = "block";
    }
  }
}

function updateCitizenUI() {
  const label = $("#userRoleLabel");
  if (label) label.textContent = `${currentCitizen.name} (${currentCitizen.ward.split(',')[0]})`;
  const mobileLabel = $("#mobileUserRoleLabel");
  if (mobileLabel) mobileLabel.textContent = `${currentCitizen.name}`;
  const citizenInput = $("#issueCitizenName");
  if (citizenInput && !citizenInput.value) {
    citizenInput.value = currentCitizen.name;
  }
}

function openCitizenLoginModal() {
  const modal = $("#citizenLoginModal");
  if (!modal) return;
  const nameInput = $("#citizenNameInput");
  const wardInput = $("#citizenWardInput");
  if (nameInput) nameInput.value = currentCitizen.name;
  if (wardInput) wardInput.value = currentCitizen.ward;
  const err = $("#citizenModalError");
  if (err) err.style.display = "none";
  modal.style.display = "flex";
}

function closeCitizenLoginModal() {
  const modal = $("#citizenLoginModal");
  if (modal) modal.style.display = "none";
}

async function saveCitizenProfile(name, ward, username = null) {
  const modalErr = $("#citizenModalError");
  if (modalErr) modalErr.style.display = "none";

  const cleanName = (name || "").trim();
  const cleanWard = (ward || "Central Ward").trim();
  const cleanUsername = (username || cleanName.toLowerCase().replace(/[^a-z0-9]/g, ".") + ".citizen").replace(/\.+/g, ".").replace(/^\.|\.$/g, "");

  if (USE_API) {
    let authUser = null;
    if (username) {
      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: cleanUsername, role: "citizen" })
        });
        if (res.ok) {
          const data = await res.json();
          authUser = data.user;
        }
      } catch (err) {
        console.warn("Login sync failed:", err);
      }
    } else {
      try {
        const regRes = await fetch(`${API_BASE}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: cleanUsername, name: cleanName, ward: cleanWard })
        });
        if (regRes.ok) {
          const data = await regRes.json();
          authUser = data.user;
        } else if (regRes.status === 400) {
          // Username already registered, log in
          const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: cleanUsername, role: "citizen" })
          });
          if (loginRes.ok) {
            const data = await loginRes.json();
            authUser = data.user;
          } else {
            const errData = await loginRes.json().catch(() => ({}));
            throw new Error(errData.detail || `Login error (${loginRes.status})`);
          }
        } else {
          const errData = await regRes.json().catch(() => ({}));
          throw new Error(errData.detail || `Registration error (${regRes.status})`);
        }
      } catch (err) {
        if (modalErr) {
          modalErr.textContent = err.message || "Failed to authenticate profile.";
          modalErr.style.display = "block";
        }
        showToast(`Auth error: ${err.message}`);
        console.error("Auth error:", err);
        return;
      }
    }

    if (authUser) {
      currentCitizen.id = authUser.id;
      currentCitizen.username = authUser.username;
      currentCitizen.name = authUser.name;
      currentCitizen.ward = authUser.ward || cleanWard;
    } else {
      currentCitizen.name = cleanName;
      currentCitizen.ward = cleanWard;
      currentCitizen.username = cleanUsername;
    }
  } else {
    currentCitizen.name = cleanName;
    currentCitizen.ward = cleanWard;
    currentCitizen.username = cleanUsername;
  }

  try {
    sessionStorage.setItem("uc_citizen_profile", JSON.stringify(currentCitizen));
    localStorage.setItem("uc_citizen_profile", JSON.stringify(currentCitizen));
  } catch (e) {}

  loadUserVotes();
  updateCitizenUI();
  closeCitizenLoginModal();
  renderComplaints();
  showToast(`Profile updated to ${currentCitizen.name}.`);
}

async function upvoteComplaint(rawId) {
  const row = reports.find(r => String(r.id) === String(rawId));
  if (!row) return;
  const idStr = String(rawId);
  const numericId = String(rawId).replace(/\D/g, "") || rawId;

  if (votedComplaints.has(idStr)) {
    showToast(`You have already upvoted ticket #${row.id}.`);
    return;
  }

  if (USE_API) {
    try {
      const response = await fetch(`${API_BASE}/api/complaints/${encodeURIComponent(numericId)}/upvote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_identifier: currentCitizen.username || "anonymous" })
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || `HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.already_upvoted) {
        votedComplaints.add(idStr);
        saveUserVotes();
        renderComplaints();
        renderAdminTable();
        showToast(data.message || `You have already upvoted ticket #${row.id}.`);
        return;
      }
      row.upvotes = data.upvotes;
      votedComplaints.add(idStr);
      saveUserVotes();
      showToast(`▲ Upvote registered for ticket #${row.id} (${row.upvotes} total votes)`);
    } catch (err) {
      showToast(`Upvote failed: ${err.message}`);
      console.warn("Upvote API error:", err);
      return;
    }
  } else {
    row.upvotes = (row.upvotes || 0) + 1;
    votedComplaints.add(idStr);
    saveUserVotes();
    showToast(`▲ Demo upvoted ticket #${row.id} (${row.upvotes} votes)`);
  }

  renderComplaints();
  renderAdminTable();
  const detailModal = $("#complaintDetailModal");
  if (detailModal && detailModal.style.display !== "none") {
    openComplaintDetail(row.id);
  }
}

function setView(name) {
  if (name === "track") name = "complaints";
  if (name === "admin" && sessionStorage.getItem("uc_admin_demo_auth") !== "true") {
    requestAdminAccess();
    return;
  }
  $$(".view").forEach(v => v.classList.remove("active"));
  const target = $(`#${name}View`);
  if (target) target.classList.add("active");
  $$(".nav-link").forEach(b => b.classList.toggle("active", b.dataset.view === name || (name === "complaints" && (b.dataset.view === "track" || b.id === "navComplaints"))));
  $("#mainNav")?.classList.remove("open");
  window.scrollTo({top:0, behavior:"smooth"});
  if (name === "home") renderStats();
  if (name === "report") updateCitizenUI();
  if (name === "complaints") renderComplaints();
  if (name === "dashboard") renderStats();
  if (name === "admin") { renderAdminTable(); renderStats(); }
}

function openReport(category = "") {
  if (category) {
    const select = $("#issueCategory");
    if (select) select.value = category;
  }
  resetAICard();
  setView("report");
}

/* --- Civic AI Assistant Integration (Step 2) --- */
function mapCategoryToOption(aiCategory) {
  if (!aiCategory) return "";
  const select = $("#issueCategory");
  if (!select) return "";
  const options = [...select.options].map(o => o.value).filter(Boolean);

  if (options.includes(aiCategory)) return aiCategory;

  const mapping = {
    "road damage": "Roads & Infrastructure",
    "garbage and waste": "Waste Management",
    "drainage and sewage": "Waste Management",
    "water supply and leakage": "Water Supply",
    "street lighting": "Street Lighting",
    "public safety": "Public Facilities",
    "public infrastructure": "Public Facilities",
    "other civic issue": "Other",
  };
  const key = String(aiCategory).toLowerCase().trim();
  if (mapping[key] && options.includes(mapping[key])) {
    return mapping[key];
  }

  for (const opt of options) {
    const optLow = opt.toLowerCase();
    if (key.includes(optLow) || optLow.includes(key)) return opt;
    if (key.includes("road") && optLow.includes("road")) return opt;
    if (key.includes("waste") && optLow.includes("waste")) return opt;
    if (key.includes("water") && optLow.includes("water")) return opt;
    if (key.includes("light") && optLow.includes("light")) return opt;
  }
  return "";
}

function resetAICard() {
  clearTimeout(aiDebounceTimer);
  if (aiAbortController) {
    aiAbortController.abort();
    aiAbortController = null;
  }
  lastAnalyzedText = "";
  latestAIResult = null;

  const statusPill = $("#aiStatusPill");
  if (statusPill) {
    statusPill.className = "ai-status-pill idle";
    statusPill.textContent = "Ready";
  }
  const idleState = $("#aiIdleState");
  if (idleState) idleState.style.display = "flex";
  const loadingState = $("#aiLoadingState");
  if (loadingState) loadingState.style.display = "none";
  const errorState = $("#aiErrorState");
  if (errorState) errorState.style.display = "none";
  const resultsContainer = $("#aiResultsContainer");
  if (resultsContainer) resultsContainer.style.display = "none";
  const retryBtn = $("#aiRetryBtn");
  if (retryBtn) retryBtn.style.display = "none";
}

function triggerAIAnalysis() {
  const title = ($("#issueTitle")?.value || "").trim();
  const description = ($("#issueDescription")?.value || "").trim();

  // Require minimum input before running AI
  if (title.length < 5 || description.length < 10) {
    clearTimeout(aiDebounceTimer);
    resetAICard();
    return;
  }

  const combined = `${title}. ${description}`;
  if (combined === lastAnalyzedText) return;

  clearTimeout(aiDebounceTimer);
  const statusPill = $("#aiStatusPill");
  if (statusPill) {
    statusPill.className = "ai-status-pill loading";
    statusPill.textContent = "Typing…";
  }

  // 500 ms debounce requirement
  aiDebounceTimer = setTimeout(() => {
    runAIAnalysis(title, description);
  }, 500);
}

async function runAIAnalysis(title, description) {
  const combined = `${title}. ${description}`;
  if (aiAbortController) {
    aiAbortController.abort();
  }
  aiAbortController = new AbortController();

  const statusPill = $("#aiStatusPill");
  const idleState = $("#aiIdleState");
  const loadingState = $("#aiLoadingState");
  const errorState = $("#aiErrorState");
  const resultsContainer = $("#aiResultsContainer");
  const retryBtn = $("#aiRetryBtn");

  if (statusPill) {
    statusPill.className = "ai-status-pill loading";
    statusPill.textContent = "Analyzing…";
  }
  if (idleState) idleState.style.display = "none";
  if (loadingState) loadingState.style.display = "flex";
  if (errorState) errorState.style.display = "none";
  if (resultsContainer) resultsContainer.style.display = "none";
  if (retryBtn) retryBtn.style.display = "none";

  try {
    const response = await fetch(`${API_BASE}/api/ai/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
      signal: aiAbortController.signal,
    });

    if (!response.ok) {
      throw new Error(`AI service returned HTTP ${response.status}`);
    }

    const data = await response.json();
    lastAnalyzedText = combined;
    latestAIResult = data;
    renderAIResults(data);

    if (statusPill) {
      statusPill.className = "ai-status-pill success";
      statusPill.textContent = "Analyzed";
    }
  } catch (error) {
    if (error.name === "AbortError") return;
    console.warn("AI analysis request failed:", error);
    if (loadingState) loadingState.style.display = "none";
    if (errorState) {
      errorState.style.display = "flex";
      const errMsg = $("#aiErrorMessage");
      if (errMsg) {
        errMsg.textContent = `Could not reach AI analysis (${error.message}). You can still submit manually or retry.`;
      }
    }
    if (retryBtn) retryBtn.style.display = "inline-block";
    if (statusPill) {
      statusPill.className = "ai-status-pill error";
      statusPill.textContent = "Unavailable";
    }
  } finally {
    if (loadingState) loadingState.style.display = "none";
  }
}

function renderAIResults(data) {
  const resultsContainer = $("#aiResultsContainer");
  if (!resultsContainer) return;
  resultsContainer.style.display = "flex";

  // 1. Suggested Category & Apply Button
  const catSection = $("#aiCategorySection");
  const catName = $("#aiCategoryName");
  const catConf = $("#aiCategoryConfidence");
  const hasCategory = Boolean(data.suggested_category && data.model_available !== false);

  if (hasCategory && catSection && catName) {
    catSection.style.display = "block";
    catName.textContent = data.suggested_category;
    if (typeof data.category_confidence === "number") {
      catConf.style.display = "inline-block";
      catConf.textContent = `${Math.round(data.category_confidence * 100)}% match`;
    } else {
      catConf.style.display = "none";
    }
  } else if (catSection) {
    catSection.style.display = "none";
  }

  // 2. Severity & Safety Keywords
  const sevSection = $("#aiSeveritySection");
  const sevMeter = $("#aiSeverityMeter");
  const sevBadge = $("#aiSeverityBadge");
  const keywordsWrap = $("#aiKeywordsWrap");
  const keywordsList = $("#aiKeywordsList");
  const hasSeverity = typeof data.suggested_severity === "number";

  if (hasSeverity && sevSection) {
    sevSection.style.display = "block";
    const sev = Math.max(1, Math.min(5, data.suggested_severity));

    const sevInput = $("#issueSeverity");
    if (sevInput) sevInput.value = sev;

    if (sevMeter) {
      const bars = sevMeter.querySelectorAll(".sev-bar");
      bars.forEach((bar, idx) => {
        bar.className = "sev-bar" + (idx < sev ? ` lvl-${sev}` : "");
      });
    }

    const sevLabels = {
      1: "Minor (Level 1)",
      2: "Low (Level 2)",
      3: "Moderate (Level 3)",
      4: "High Risk (Level 4)",
      5: "Critical / Emergency (Level 5)"
    };
    if (sevBadge) {
      sevBadge.className = `ai-severity-badge sev-${sev}`;
      sevBadge.textContent = sevLabels[sev] || `Severity ${sev}/5`;
    }

    if (Array.isArray(data.severity_signals) && data.severity_signals.length > 0 && keywordsWrap && keywordsList) {
      keywordsWrap.style.display = "block";
      keywordsList.innerHTML = data.severity_signals.map(sig => `<span class="ai-keyword-chip">⚠ ${escapeHtml(sig)}</span>`).join("");
    } else if (keywordsWrap) {
      keywordsWrap.style.display = "none";
    }
  } else if (sevSection) {
    sevSection.style.display = "none";
  }

  // 3. Similar Complaints / Possible Duplicates
  const dupsSection = $("#aiDuplicatesSection");
  const dupsList = $("#aiDuplicatesList");
  const duplicates = Array.isArray(data.possible_duplicates) ? data.possible_duplicates : [];

  if (duplicates.length > 0 && dupsSection && dupsList) {
    dupsSection.style.display = "block";
    dupsList.innerHTML = duplicates.map(dup => `
      <div class="ai-dup-card">
        <span class="ai-dup-title" title="${escapeHtml(dup.title)}">${escapeHtml(dup.title)}</span>
        <div class="ai-dup-meta">
          <span>${escapeHtml(dup.category || "")}</span>
          <span class="ai-dup-sim">${Math.round((dup.similarity || 0) * 100)}% match</span>
        </div>
      </div>
    `).join("");
  } else if (dupsSection) {
    dupsSection.style.display = "none";
  }
}

// Navigation button handlers
$$("[data-view]").forEach(button => button.addEventListener("click", (e) => {
  e.preventDefault();
  const targetView = button.dataset.view;
  if (targetView === "admin") {
    requestAdminAccess();
  } else {
    setView(targetView);
  }
}));

$$(".category-card").forEach(button => button.addEventListener("click", () => openReport(button.dataset.category)));

$("#menuToggle")?.addEventListener("click", () => $("#mainNav")?.classList.toggle("open"));
$("#adminModeBtn")?.addEventListener("click", requestAdminAccess);
$("#mobileAdminBtn")?.addEventListener("click", requestAdminAccess);

// Complaint search & filters
["#complaintSearch", "#statusFilter", "#categoryFilter"].forEach(sel => {
  $(sel)?.addEventListener("input", renderComplaints);
  $(sel)?.addEventListener("change", renderComplaints);
});

// Admin table search & filters
["#adminSearch", "#adminStatusFilter", "#adminCategoryFilter", "#adminSeverityFilter"].forEach(sel => {
  $(sel)?.addEventListener("input", renderAdminTable);
  $(sel)?.addEventListener("change", renderAdminTable);
});

// Admin PIN modal controls
$("#adminPinForm")?.addEventListener("submit", event => {
  event.preventDefault();
  unlockAdminSession();
});
$("#adminPinQuickBtn")?.addEventListener("click", () => {
  const input = $("#adminPinInput");
  if (input) input.value = "2026";
  unlockAdminSession();
});
$("#adminPinCancelBtn")?.addEventListener("click", () => {
  const modal = $("#adminPinModal");
  if (modal) modal.style.display = "none";
  setView("home");
});
$("#adminLockBtn")?.addEventListener("click", () => {
  sessionStorage.removeItem("uc_admin_demo_auth");
  showToast("Admin session locked.");
  setView("home");
});
$("#adminRefreshBtn")?.addEventListener("click", async () => {
  await loadReports();
  renderAdminTable();
  renderStats();
  showToast("Refreshed reports from backend.");
});

// Complaint detail modal controls
$("#modalCloseBtn")?.addEventListener("click", closeComplaintDetail);
$("#modalCloseActionBtn")?.addEventListener("click", closeComplaintDetail);

// Detail modal delegated listeners
$("#complaintList")?.addEventListener("click", event => {
  const upvoteBtn = event.target.closest("button[data-upvote-id]");
  if (upvoteBtn) {
    upvoteComplaint(upvoteBtn.dataset.upvoteId);
    return;
  }
  const detailBtn = event.target.closest("button[data-detail-id]");
  if (detailBtn) {
    openComplaintDetail(detailBtn.dataset.detailId);
  }
});

$("#complaintDetailModal")?.addEventListener("click", event => {
  const upvoteBtn = event.target.closest("button[data-upvote-id]");
  if (upvoteBtn) {
    upvoteComplaint(upvoteBtn.dataset.upvoteId);
  }
});

$("#adminTableBody")?.addEventListener("click", event => {
  const detailBtn = event.target.closest("button[data-detail-id]");
  if (detailBtn) {
    openComplaintDetail(detailBtn.dataset.detailId);
  }
});

// Citizen Profile Modal Controls
$("#citizenLoginBtn")?.addEventListener("click", openCitizenLoginModal);
$("#mobileCitizenBtn")?.addEventListener("click", openCitizenLoginModal);
$("#citizenModalCloseBtn")?.addEventListener("click", closeCitizenLoginModal);
$("#citizenCancelBtn")?.addEventListener("click", closeCitizenLoginModal);

$$(".btn-demo-profile").forEach(btn => {
  btn.addEventListener("click", () => {
    $$(".btn-demo-profile").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    saveCitizenProfile(btn.dataset.name, btn.dataset.ward, btn.dataset.user);
  });
});

$("#citizenLoginForm")?.addEventListener("submit", event => {
  event.preventDefault();
  const name = ($("#citizenNameInput")?.value || "").trim();
  const ward = ($("#citizenWardInput")?.value || "").trim();
  if (name && ward) {
    saveCitizenProfile(name, ward);
  }
});

// "My Reports" quick toggle filter
$("#myReportsBtn")?.addEventListener("click", () => {
  filterMyReports = !filterMyReports;
  renderComplaints();
  showToast(filterMyReports ? `Filtering reports by "${currentCitizen.name}"` : "Showing all community reports");
});

// Admin status change handler
$("#adminTableBody")?.addEventListener("change", async event => {
  const select = event.target.closest("select[data-report-id]");
  if (!select) return;
  const rawId = select.dataset.reportId;
  const nextStatus = select.value;
  const row = reports.find(r => String(r.id) === String(rawId));
  if (!row) return;
  const oldStatus = row.status;
  const numericId = String(rawId).replace(/\D/g, "") || rawId;

  if (USE_API) {
    select.disabled = true;
    try {
      const response = await fetch(`${API_BASE}/api/complaints/${encodeURIComponent(numericId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || `HTTP ${response.status}`);
      }
      const updated = await response.json();
      row.status = updated.status || nextStatus;
      showToast(`Status updated to "${row.status}" for ticket #${numericId}`);
    } catch (error) {
      select.value = oldStatus;
      showToast(`Status update failed: ${error.message}`);
      console.error("Status update error:", error);
      return;
    } finally {
      select.disabled = false;
    }
  } else {
    row.status = nextStatus;
    showToast(`Demo status updated to "${nextStatus}".`);
  }
  renderAdminTable();
  renderComplaints();
  renderStats();
});

// AI suggestions input events
$("#issueTitle")?.addEventListener("input", triggerAIAnalysis);
$("#issueDescription")?.addEventListener("input", triggerAIAnalysis);
$("#aiRetryBtn")?.addEventListener("click", () => {
  const title = ($("#issueTitle")?.value || "").trim();
  const description = ($("#issueDescription")?.value || "").trim();
  if (title && description) runAIAnalysis(title, description);
});
$("#applyCategoryBtn")?.addEventListener("click", () => {
  if (!latestAIResult?.suggested_category) return;
  const targetOption = mapCategoryToOption(latestAIResult.suggested_category);
  const select = $("#issueCategory");
  if (!select) return;
  if (targetOption) {
    select.value = targetOption;
    showToast(`Category updated to "${targetOption}".`);
  } else {
    const opt = document.createElement("option");
    opt.value = latestAIResult.suggested_category;
    opt.textContent = latestAIResult.suggested_category;
    select.appendChild(opt);
    select.value = latestAIResult.suggested_category;
    showToast(`Category set to "${latestAIResult.suggested_category}".`);
  }
});

// Report Form submission
$("#reportForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const payload = makePayload(form);
  const message = $("#reportMessage");
  const submit = form.querySelector('button[type="submit"]');

  if (payload.title.length < 5) {
    message.hidden = false;
    message.className = "message error";
    message.textContent = "Issue title must be at least 5 characters.";
    return;
  }
  if (payload.description.length < 10) {
    message.hidden = false;
    message.className = "message error";
    message.textContent = "Issue description must be at least 10 characters.";
    return;
  }

  submit.disabled = true;
  submit.textContent = "Submitting…";
  try {
    let created;
    if (USE_API) {
      const response = await fetch(`${API_BASE}/api/complaints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        let errorDetail = `Submission failed (${response.status})`;
        try {
          const errData = await response.json();
          if (errData.detail) {
            if (Array.isArray(errData.detail)) {
              errorDetail = errData.detail.map(d => `${d.loc ? d.loc.slice(1).join('.') + ': ' : ''}${d.msg}`).join('; ');
            } else {
              errorDetail = errData.detail;
            }
          }
        } catch (_) {}
        throw new Error(errorDetail);
      }
      created = normalizeComplaint(await response.json(), reports.length);
    } else {
      created = {
        ...payload,
        id: `UC-${String(Date.now()).slice(-6)}`,
        status: "Reported",
        priority: "Needs review",
        created_at: new Date().toISOString().slice(0, 10),
        upvotes: 0,
        citizen_name: currentCitizen.name || "Anonymous Citizen"
      };
    }
    if (latestAIResult) {
      if (latestAIResult.summary) created.summary = latestAIResult.summary;
      if (Array.isArray(latestAIResult.severity_signals)) created.severity_signals = latestAIResult.severity_signals;
    }
    reports.unshift(created);
    message.hidden = false;
    message.className = "message success";
    message.textContent = `Report submitted successfully! Ticket Reference ID: #${created.id}. You can track it in Track Complaints.`;
    form.reset();
    resetAICard();
    updateCitizenUI();
    renderComplaints();
    renderAdminTable();
    renderStats();
    showToast(`Report submitted! Ticket reference: #${created.id}`);
  } catch (error) {
    message.hidden = false;
    message.className = "message error";
    message.textContent = `Could not submit report: ${error.message}`;
  } finally {
    submit.disabled = false;
    submit.innerHTML = 'Submit Report <span>→</span>';
  }
});

// Close modals when clicking outside modal card on backdrop
[
  ["#complaintDetailModal", closeComplaintDetail],
  ["#citizenLoginModal", closeCitizenLoginModal],
  ["#adminPinModal", () => {
    const modal = $("#adminPinModal");
    if (modal) modal.style.display = "none";
    setView("home");
  }]
].forEach(([modalId, closeFn]) => {
  $(modalId)?.addEventListener("click", (e) => {
    if (e.target === $(modalId)) closeFn();
  });
});

// Initialization
(async function init() {
  updateCitizenUI();
  await loadReports();
  renderComplaints();
  renderAdminTable();
  renderStats();
  if (!USE_API) {
    const note = $("#complaintSourceNote");
    if (note) note.textContent = "Demo mode: sample records and locally-created reports are shown in this browser only.";
  }
})();
