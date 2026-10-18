/*
 * The Unheard Citizen — frontend prototype.
 * Demo mode works without packages or internet.
 * Backend API known from the project: GET/POST /api/complaints and
 * PATCH /api/complaints/{complaint_id}/status.
 *
 * To try the API, start the FastAPI backend at http://127.0.0.1:8000
 * and set USE_API to true below. If your backend field names differ,
 * adjust makePayload() and normalizeComplaint() to match its schema.
 */
const API_BASE = "https://the-unheard-citizen-api.onrender.com";
const USE_API = true;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const DEMO_REPORTS = [
  {id:"UC-1001",title:"Large pothole near the main bus stop",category:"Roads & Infrastructure",location:"Central Market Road",description:"A deep pothole is making the road unsafe for two-wheelers.",status:"In Progress",priority:"High",created_at:"2026-10-15"},
  {id:"UC-1002",title:"Garbage overflowing near market",category:"Waste Management",location:"Market Street",description:"Waste has accumulated near the public bins.",status:"Reported",priority:"Medium",created_at:"2026-10-14"},
  {id:"UC-1003",title:"Streetlight not working",category:"Street Lighting",location:"Lake View Lane",description:"The streetlight has not worked for several nights.",status:"Resolved",priority:"Medium",created_at:"2026-10-12"},
  {id:"UC-1004",title:"Wheelchair access blocked",category:"Accessibility Barrier",location:"Community Health Centre",description:"The ramp entrance is blocked by parked vehicles.",status:"Under Review",priority:"High",created_at:"2026-10-16"},
  {id:"UC-1005",title:"Irregular water supply",category:"Water Supply",location:"Green Park Colony",description:"Water supply has been irregular this week.",status:"Overdue",priority:"High",created_at:"2026-10-08"}
];
let reports = [];
let toastTimer;

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function normalizeComplaint(item, index = 0) {
  return {
    id: item.id ?? item.complaint_id ?? item.ticket_id ?? `UC-${1001 + index}`,
    title: item.title ?? item.subject ?? "Community report",
    category: item.category ?? "Other",
    location: item.location ?? item.address ?? "Location not provided",
    description: item.description ?? item.details ?? "",
    status: normalizeStatus(item.status ?? "Reported"),
    priority: item.priority ?? item.severity ?? "Needs review",
    created_at: item.created_at ?? item.createdAt ?? item.date ?? ""
  };
}
function normalizeStatus(status) {
  const value = String(status || "Reported").toLowerCase().replaceAll("_"," ").replaceAll("-"," ").trim();
  const known = {"submitted":"Reported","new":"Reported","pending":"Reported","reported":"Reported","under review":"Under Review","in review":"Under Review","in progress":"In Progress","processing":"In Progress","resolved":"Resolved","closed":"Resolved","completed":"Resolved","overdue":"Overdue"};
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
     severity: Number(data.get("severity") || 3)
  };
}
async function loadReports() {
  if (!USE_API) return;
  try {
    const response = await fetch(`${API_BASE}/api/complaints`);
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const body = await response.json();
    const rows = Array.isArray(body) ? body : (body.complaints ?? body.items ?? body.data ?? []);
    reports = rows.map(normalizeComplaint);
$("#complaintSourceNote").textContent = "Connected to the backend API.";
} catch (error) {
  reports = [];
  $("#complaintSourceNote").textContent =
    "Could not reach the backend. No complaint data is available.";
  console.warn("Complaint API unavailable:", error);
}
}
function getCounts() {
  return {
    total: reports.length,
    resolved: reports.filter(r => r.status === "Resolved").length,
    progress: reports.filter(r => r.status === "In Progress").length,
    overdue: reports.filter(r => r.status === "Overdue").length,
    pending: reports.filter(r => ["Reported","Under Review"].includes(r.status)).length,
    high: reports.filter(r => String(r.priority).toLowerCase().includes("high")).length
  };
}function renderStats() {
  const c = getCounts();
  const values = {
    total: c.total.toLocaleString("en-IN"),
    resolved: c.resolved.toLocaleString("en-IN"),
    progress: c.progress.toLocaleString("en-IN"),
    overdue: c.overdue.toLocaleString("en-IN")
  };

  [
    ["#totalStat", values.total],
    ["#resolvedStat", values.resolved],
    ["#progressStat", values.progress],
    ["#overdueStat", values.overdue],
    ["#dashTotal", values.total],
    ["#dashResolved", values.resolved],
    ["#dashProgress", values.progress],
    ["#dashOverdue", values.overdue],
    ["#adminTotal", values.total],
    ["#adminResolved", values.resolved],
    ["#adminPending", c.pending],
    ["#adminHigh", c.high]
  ].forEach(([sel, val]) => {
    const el = $(sel);
    if (el) el.textContent = val;
  });

  const chart = $("#statusChart");

  if (chart) {
    const chartItems = [
     ["Received", reports.filter(r => r.status === "Received").length],
     ["Reported", reports.filter(r => r.status === "Reported").length],
     ["Under Review", reports.filter(r => r.status === "Under Review").length],
     ["In Progress", reports.filter(r => r.status === "In Progress").length],
     ["Resolved", reports.filter(r => r.status === "Resolved").length],
     ["Overdue", reports.filter(r => r.status === "Overdue").length]
];

    const max = Math.max(...chartItems.map(x => x[1]), 1);

    chart.innerHTML = chartItems.map(([label, value]) =>
      `<div class="bar-row">
        <span>${escapeHtml(label)}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${value === 0 ? 0 : Math.max(5, value / max * 100)}%"></div>
        </div>
        <span class="bar-value">${value}</span>
      </div>`
    ).join("");
  }
}
function renderComplaints() {
  const search = ($("#complaintSearch")?.value || "").trim().toLowerCase();
  const status = $("#statusFilter")?.value || "";
  const category = $("#categoryFilter")?.value || "";
  const filtered = reports.filter(r => (!status || r.status===status) && (!category || r.category===category) &&
    [r.id,r.title,r.location,r.category,r.description].some(v=>String(v).toLowerCase().includes(search)));
  const list = $("#complaintList");
  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">No reports match those filters. Try a different search.</div>';
    return;
  }
  list.innerHTML = filtered.map(r=>`<article class="complaint-row"><div><h3>${escapeHtml(r.title)}</h3><div class="complaint-meta"><span class="complaint-id">${escapeHtml(r.id)}</span><span>${escapeHtml(r.category)}</span><span>⌖ ${escapeHtml(r.location)}</span><span>${escapeHtml(r.created_at || "Date unavailable")}</span></div><p class="complaint-description">${escapeHtml(r.description)}</p></div><span class="status ${statusClass(r.status)}">${escapeHtml(r.status)}</span></article>`).join("");
}
function renderAdminTable() {
  const search = ($("#adminSearch")?.value || "").trim().toLowerCase();
  const filtered = reports.filter(r=>[r.id,r.title,r.category,r.location].some(v=>String(v).toLowerCase().includes(search)));
  const tbody = $("#adminTableBody");
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6">No matching reports.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(r=>`<tr><td><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(r.id)} · ${escapeHtml(r.created_at || "Date unavailable")}</small></td><td>${escapeHtml(r.category)}</td><td>${escapeHtml(r.location)}</td><td><span class="ai-suggestion">${escapeHtml(r.priority || "Needs review")}</span></td><td><span class="status ${statusClass(r.status)}">${escapeHtml(r.status)}</span></td><td><select class="status-select" data-report-id="${escapeHtml(r.id)}" aria-label="Update status for ${escapeHtml(r.id)}">
${["Received","Reported","Under Review","In Progress","Resolved","Overdue"].map(s=>`<option ${s===r.status?"selected":""}>${s}</option>`).join("")}</select></td></tr>`).join("");

}
function setView(name) {
  $$(".view").forEach(v=>v.classList.remove("active"));
  const target = $(`#${name}View`);
  if(target) target.classList.add("active");
  $$(".nav-link").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  $("#mainNav").classList.remove("open");
  window.scrollTo({top:0,behavior:"smooth"});
  if(name==="complaints")renderComplaints();
  if(name==="dashboard")renderStats();
  if(name==="admin"){renderAdminTable();renderStats();}
}
function openReport(category="") {
  if(category) $("#issueCategory").value=category;
  setView("report");
}
$$("[data-view]").forEach(button=>button.addEventListener("click",()=>setView(button.dataset.view)));
$$(".category-card").forEach(button=>button.addEventListener("click",()=>openReport(button.dataset.category)));

$$(".image-hotspot[data-category]").forEach(button => button.addEventListener("click", () => openReport(button.dataset.category)));
const referenceAdminButton = $("#referenceAdminButton");
if (referenceAdminButton) referenceAdminButton.addEventListener("click", () => {
  setView("admin");
  showToast("Demo admin view opened. Production access must be authenticated by the backend.");
});

$("#menuToggle").addEventListener("click",()=>$("#mainNav").classList.toggle("open"));
$("#adminModeBtn").addEventListener("click",()=>{
  setView("admin");
  showToast("Demo admin view opened. Production access must be authenticated by the backend.");
});
["#complaintSearch","#statusFilter","#categoryFilter"].forEach(sel=>$(sel).addEventListener("input",renderComplaints));
$("#adminSearch").addEventListener("input",renderAdminTable);

$("#reportForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  if(!form.reportValidity())return;
  const payload=makePayload(form);
  const message=$("#reportMessage");
  const submit=form.querySelector('button[type="submit"]');
  submit.disabled=true;submit.textContent="Submitting…";
  try{
    let created;
    if(USE_API){
      const response=await fetch(`${API_BASE}/api/complaints`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      if(!response.ok)throw new Error(`Submission failed (${response.status}). Check backend request fields.`);
      created=normalizeComplaint(await response.json(),reports.length);
    }else{
      created={...payload,id:`UC-${String(Date.now()).slice(-6)}`,status:"Reported",priority:"Needs review",created_at:new Date().toISOString().slice(0,10)};
    }
    reports.unshift(created);
    message.hidden=false;message.className="message success";
    message.textContent=`Report submitted in ${USE_API?"connected API":"demo mode"}. Reference ID: ${created.id}. Keep this ID to track progress.`;
    form.reset();renderComplaints();renderAdminTable();renderStats();
    showToast(`Report reference: ${created.id}`);
  }catch(error){
    message.hidden=false;message.className="message error";
    message.textContent=`We couldn't submit the report. ${error.message}`;
  }finally{
    submit.disabled=false;submit.innerHTML='Submit Report <span>→</span>';
  }
});
$("#adminTableBody").addEventListener("change",async event=>{
  const select=event.target.closest("select[data-report-id]");
  if(!select)return;
  const id=select.dataset.reportId, nextStatus=select.value, row=reports.find(r=>String(r.id)===String(id));
  if(!row)return;
  const oldStatus=row.status;
  if(USE_API){
    try{
const response = await fetch(
  `${API_BASE}/api/complaints/${encodeURIComponent(id)}/status?status=${encodeURIComponent(nextStatus)}`,
  {
    method: "PATCH",
    headers: { "Content-Type": "application/json" }
  }
);

      if(!response.ok)throw new Error(`API returned ${response.status}`);
    }catch(error){
      select.value=oldStatus;
      showToast("Status update failed. Check the backend API schema and permissions.");
      console.error(error);return;
    }
  }
  row.status=nextStatus;renderAdminTable();renderComplaints();renderStats();
  showToast(`Status updated to "${nextStatus}".`);
});
(async function init(){
  await loadReports();
  renderComplaints();renderAdminTable();renderStats();
  if(!USE_API) $("#complaintSourceNote").textContent="Demo mode: sample records and locally-created reports are shown in this browser only. They are not saved to the backend.";
})();
