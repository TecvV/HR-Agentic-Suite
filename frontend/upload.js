"use strict";

const uploadForm = document.getElementById("uploadForm");
const uploadStatusEl = document.getElementById("uploadStatus");
const filesListEl = document.getElementById("filesList");
const logoutBtn = document.getElementById("logoutBtn");
const continueBtn = document.getElementById("continueBtn");
const yearSelectEl = document.getElementById("yearSelect");
const yearProgressBadgeEl = document.getElementById("yearProgressBadge");

let currentUser = null;
let currentUpload = null;

async function readJsonFile(file) {
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch (_err) {
    throw new Error(`Invalid JSON in file: ${file.name}`);
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function refreshFileList() {
  const data = await requestJson("/api/reports/list");
  const files = Array.isArray(data.files) ? data.files : [];
  const year = yearSelectEl.value || "2025";

  filesListEl.innerHTML = "";
  if (!files.length) {
    filesListEl.innerHTML = `<pre>No quarterly files stored yet for ${year}.</pre>`;
    return;
  }

  const section = document.createElement("div");
  section.className = "panel";
  section.style.marginBottom = "10px";
  section.innerHTML = `<p><strong>Year: ${year}</strong></p>`;
  filesListEl.appendChild(section);

  files.forEach((file) => {
    const wrapper = document.createElement("div");
    wrapper.className = "panel";
    wrapper.style.marginBottom = "10px";
    wrapper.innerHTML =
      `<p><strong>${year} - ${file.quarter}</strong> - ${file.fileName}</p>` +
      `<p style="color:#9bb0bf;">Source: ${file.source || "-"} | Uploaded: ${file.uploadedAt || "-"}</p>`;

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-ghost";
    deleteBtn.textContent = `Delete ${file.quarter}`;
    deleteBtn.addEventListener("click", async () => {
      const ok = window.confirm(`Delete ${year} ${file.quarter} file from storage?`);
      if (!ok) return;
      try {
        await requestJson(`/api/reports/${encodeURIComponent(file.quarter)}`, { method: "DELETE" });
        uploadStatusEl.textContent = `Deleted ${year} ${file.quarter}.`;
        await loadStatus();
      } catch (err) {
        uploadStatusEl.textContent = `Delete failed: ${err.message}`;
      }
    });

    wrapper.appendChild(deleteBtn);
    filesListEl.appendChild(wrapper);
  });
}

async function loadStatus() {
  const meData = await requestJson("/api/auth/me");
  if (!meData.authenticated) {
    window.location.href = "/frontend/auth.html";
    return;
  }
  currentUser = meData.user;
  currentUpload = meData.upload;
  const quarters = new Set((currentUpload?.quarters || []).map((q) => String(q).toUpperCase()));
  const marks = ["Q1", "Q2", "Q3", "Q4"]
    .map((q) => `${q}${quarters.has(q) ? "✓" : "✗"}`)
    .join(" ");
  yearProgressBadgeEl.textContent = `${yearSelectEl.value || "2025"} Progress: ${marks}`;

  uploadStatusEl.textContent =
    `Authenticated as: ${meData.user?.name || meData.user?.email}\n` +
    `Mode: ${meData.user?.type === "guest" ? "Guest (not persisted to MongoDB)" : "Registered User"}\n` +
    `Selected Year: ${yearSelectEl.value || "2025"}\n` +
    `Uploaded Quarters: ${(currentUpload?.quarters || []).join(", ") || "None"}\n` +
    `Missing: ${(currentUpload?.missing || []).join(", ") || "None"}\n` +
    `Complete (required for registered users): ${currentUpload?.complete ? "Yes" : "No"}`;

  const yearReady = (yearSelectEl.value || "") === "2025";
  continueBtn.disabled = !(yearReady && (currentUser?.type === "guest" || currentUpload?.complete));
  await refreshFileList();
}

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    uploadStatusEl.textContent = "Validating and uploading selected JSON files...";
    const files = [
      { quarter: "Q1", file: document.getElementById("q1File").files[0] },
      { quarter: "Q2", file: document.getElementById("q2File").files[0] },
      { quarter: "Q3", file: document.getElementById("q3File").files[0] },
      { quarter: "Q4", file: document.getElementById("q4File").files[0] },
    ].filter((x) => Boolean(x.file));

    if (!files.length) throw new Error("Select at least one file.");

    const payloadFiles = [];
    const selectedYear = yearSelectEl.value || "2025";
    for (const item of files) {
      const content = await readJsonFile(item.file);
      payloadFiles.push({
        quarter: item.quarter,
        fileName: `${selectedYear}_${item.file.name}`,
        content,
      });
    }

    const result = await requestJson("/api/reports/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: payloadFiles }),
    });

    uploadStatusEl.textContent =
      `Upload successful for year ${selectedYear}.\n` +
      `Uploaded Quarters: ${(result.upload?.quarters || []).join(", ") || "None"}\n` +
      `Missing: ${(result.upload?.missing || []).join(", ") || "None"}\n` +
      `Talent Guardian Alerts: ${result.talentGuardian?.count ?? 0}\n` +
      `${currentUser?.type === "guest" ? "Guest uploads are session-only and not saved to MongoDB." : "Saved to MongoDB."}`;

    ["q1File", "q2File", "q3File", "q4File"].forEach((id) => {
      const input = document.getElementById(id);
      input.value = "";
    });

    await loadStatus();
  } catch (err) {
    uploadStatusEl.textContent = `Upload failed: ${err.message}`;
  }
});

continueBtn.addEventListener("click", () => {
  if ((yearSelectEl.value || "") !== "2025") {
    uploadStatusEl.textContent = "Select year 2025 to continue.";
    return;
  }
  if (currentUser?.type === "guest" || currentUpload?.complete) {
    window.location.href = "/frontend/index.html";
  } else {
    uploadStatusEl.textContent = "Upload all 4 quarterly files for 2025 before continuing.";
  }
});

yearSelectEl.addEventListener("change", async () => {
  await loadStatus();
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/frontend/auth.html";
});

loadStatus().catch((err) => {
  uploadStatusEl.textContent = `Failed to load status: ${err.message}`;
});
