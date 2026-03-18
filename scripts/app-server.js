#!/usr/bin/env node
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { MongoClient, ObjectId } = require("mongodb");
const FIXED_EMPLOYEE_EMAIL = "btech10107.21@bitmesra.ac.in";
const FIXED_MANAGER_EMAIL = "aryan.mishra4489@gmail.com";

function parseArgs(argv) {
  const args = { port: 5602 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--port" && i + 1 < argv.length) {
      args.port = Number(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

function loadEnvFile(envPath = ".env") {
  const absolutePath = path.resolve(envPath);
  if (!fs.existsSync(absolutePath)) return;
  const content = fs.readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "");

  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) return;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  });
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  cells.push(current);
  return cells;
}

function csvEscape(value) {
  const str = String(value ?? "");
  return `"${str.replace(/"/g, "\"\"")}"`;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...extraHeaders });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const out = {};
  raw.split(";").forEach((part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("="));
  });
  return out;
}

function normalizeQuarter(value) {
  return String(value || "").trim().toUpperCase();
}

function toEmailLocal(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "") || "user";
}

function toUtcCalendarStamp(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

function buildStayInterviewSchedule(employeeName, managerName, employeeEmail, managerEmail, hrEmail, reportUrl) {
  const now = new Date();
  const lookAheadDays = 14;
  const chosen = new Date(now);
  let found = false;

  for (let i = 0; i < lookAheadDays; i += 1) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const day = d.getDay(); // Tue=2, Wed=3
    if (day !== 2 && day !== 3) continue;
    d.setHours(10, 30, 0, 0); // Mid-morning sweet spot
    if (d.getTime() <= now.getTime() + 60 * 60 * 1000) continue;
    chosen.setTime(d.getTime());
    found = true;
    break;
  }

  if (!found) {
    chosen.setDate(now.getDate() + 1);
    chosen.setHours(10, 30, 0, 0);
  }

  const start = chosen;
  const end = new Date(start.getTime() + 45 * 60 * 1000);
  const bufferStart = new Date(start.getTime() - 48 * 60 * 60 * 1000); // 48h gap
  const bufferEnd = new Date(bufferStart.getTime() + 30 * 60 * 1000);

  const ctz = process.env.ORG_TIMEZONE || "Asia/Kolkata";
  const meetBootstrap = "https://meet.google.com/new";
  const interviewTitle = `Stay Interview: ${employeeName} + ${managerName}`;
  const interviewDetails =
    "Confidential stay interview (45 minutes): 30 min conversation + 15 min co-created 1-month roadmap.\n" +
    "Scheduling logic: Tue/Wed mid-morning; participants are manager + employee only.\n" +
    (reportUrl ? `Detailed analytics PDF/report: ${reportUrl}\n` : "") +
    "Before sending, click 'Add Google Meet video conferencing' in Calendar OR open: " + meetBootstrap + "\n" +
    "Mark event visibility as Private.";

  const bufferTitle = `Buffer Meet: HR + ${managerName} (Before Stay Interview)`;
  const bufferDetails =
    "30-minute buffer meeting between HR and manager only, scheduled 48-72 hours before stay interview.\n" +
    "Review intervention package, align messaging, and confirm confidentiality plan.\n" +
    (reportUrl ? `Detailed analytics PDF/report: ${reportUrl}\n` : "") +
    "Avoid back-to-back stress context meetings where possible.";

  const interviewUrl =
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(interviewTitle)}` +
    `&dates=${encodeURIComponent(`${toUtcCalendarStamp(start)}/${toUtcCalendarStamp(end)}`)}` +
    `&details=${encodeURIComponent(interviewDetails)}` +
    `&location=${encodeURIComponent("Google Meet")}` +
    `&add=${encodeURIComponent(`${employeeEmail},${managerEmail}`)}` +
    `&ctz=${encodeURIComponent(ctz)}`;

  const bufferUrl =
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(bufferTitle)}` +
    `&dates=${encodeURIComponent(`${toUtcCalendarStamp(bufferStart)}/${toUtcCalendarStamp(bufferEnd)}`)}` +
    `&details=${encodeURIComponent(bufferDetails)}` +
    `&location=${encodeURIComponent("Private Manager-HR Discussion")}` +
    `&add=${encodeURIComponent(`${managerEmail},${hrEmail || ""}`)}` +
    `&ctz=${encodeURIComponent(ctz)}`;

  return {
    timezone: ctz,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    durationMinutes: 45,
    prepBufferMinutes: 30,
    interviewGoogleCalendarUrl: interviewUrl,
    bufferMeetCalendarUrl: bufferUrl,
    meetBootstrapUrl: meetBootstrap,
    notes:
      "Calendar links prefill event + attendees. Stay interview excludes HR; buffer meet includes HR + manager only.",
  };
}

function createSessionToken() {
  return crypto.randomBytes(24).toString("hex");
}

function createResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
}

function makePasswordDigest(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  return { salt, hash };
}

function verifyPassword(password, digest) {
  const hash = hashPassword(password, digest.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(digest.hash, "hex"));
}

function buildDatasetWithPayload(baseCsvPath, payload) {
  const raw = fs.readFileSync(baseCsvPath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = lines[0];
  const rows = lines.slice(1).map(parseCsvLine);

  const employeeName = payload.employeeName.trim();
  const rowValues = [
    employeeName,
    payload.role.trim(),
    payload.kpiScore.trim(),
    payload.peerFeedback.trim(),
    payload.managerNotes.trim(),
  ];

  let replaced = false;
  for (let i = 0; i < rows.length; i += 1) {
    if ((rows[i][0] || "").toLowerCase() === employeeName.toLowerCase()) {
      rows[i] = rowValues;
      replaced = true;
      break;
    }
  }
  if (!replaced) rows.push(rowValues);

  const renderedRows = rows.map((row) => row.map(csvEscape).join(","));
  return `${header}\n${renderedRows.join("\n")}\n`;
}

function runAgent({ tempCsvPath, employeeName, mode }) {
  const scriptPath = path.resolve("src/hr_review_agent.js");
  const args = [scriptPath, "--json", "--data", tempCsvPath, "--employee", employeeName, "--no-state"];
  if (mode === "local") args.push("--local-only");
  if (mode === "llm") args.push("--llm-only");

  return new Promise((resolve, reject) => {
    execFile("node", args, { maxBuffer: 12 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (_parseErr) {
        reject(new Error(`Agent returned invalid JSON: ${stdout.slice(0, 500)}`));
      }
    });
  });
}

function loadEmployees(csvPath) {
  const raw = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const idx = {
    employeeName: headers.indexOf("Employee Name"),
    role: headers.indexOf("Role"),
    kpiScore: headers.indexOf("KPI Score"),
    peerFeedback: headers.indexOf("Peer Feedback"),
    managerNotes: headers.indexOf("Manager Notes"),
  };

  return lines.slice(1).map((line) => {
    const row = parseCsvLine(line);
    return {
      employeeName: row[idx.employeeName],
      role: row[idx.role],
      kpiScore: row[idx.kpiScore],
      peerFeedback: row[idx.peerFeedback],
      managerNotes: row[idx.managerNotes],
    };
  });
}

function loadDefaultGuestReports(baseCsvPath) {
  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const reportDocs = [];

  // Priority 1: Use the exact project JSON files so Guest sees the same data as current local files.
  const projectQuarterFiles = {
    Q1: ["Q1.JSON", "Q1.json"],
    Q2: ["Q2.JSON", "Q2.json"],
    Q3: ["Q3.json", "Q3.JSON"],
    Q4: ["Q4.json", "Q4.JSON"],
  };
  let loadedFromProjectRoot = true;
  for (const q of quarters) {
    const found = projectQuarterFiles[q].find((f) => fs.existsSync(path.resolve(f)));
    if (!found) {
      loadedFromProjectRoot = false;
      break;
    }
  }
  if (loadedFromProjectRoot) {
    for (const q of quarters) {
      const found = projectQuarterFiles[q].find((f) => fs.existsSync(path.resolve(f)));
      const abs = path.resolve(found);
      const content = JSON.parse(fs.readFileSync(abs, "utf8"));
      reportDocs.push({
        quarter: q,
        fileName: path.basename(abs),
        content,
        uploadedAt: new Date(0),
        source: "default_project_json",
      });
    }
    return reportDocs;
  }

  const defaultsDir = path.resolve("data/default_reports");
  let loadedFromDisk = true;
  for (const quarter of quarters) {
    const candidate = path.join(defaultsDir, `${quarter}.json`);
    if (!fs.existsSync(candidate)) {
      loadedFromDisk = false;
      break;
    }
  }

  if (loadedFromDisk) {
    for (const quarter of quarters) {
      const filePath = path.join(defaultsDir, `${quarter}.json`);
      const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
      reportDocs.push({
        quarter,
        fileName: `${quarter}.json`,
        content,
        uploadedAt: new Date(0),
        source: "default",
      });
    }
    return reportDocs;
  }

  // Fallback default set if files are not provided yet.
  const employees = loadEmployees(baseCsvPath);
  const managerNames = ["Manager A", "Manager B", "Manager C", "Manager D", "Manager E"];
  const managerBuckets = managerNames.map((name) => ({ manager: name, employees: [] }));

  employees.forEach((emp, idx) => {
    managerBuckets[idx % managerBuckets.length].employees.push(emp.employeeName);
  });

  for (const quarter of quarters) {
    reportDocs.push({
      quarter,
      fileName: `${quarter}.json`,
      content: {
        quarter,
        managers: managerBuckets,
      },
      uploadedAt: new Date(0),
      source: "default",
    });
  }

  return reportDocs;
}

function extractHierarchyFromReports(reports) {
  const managerMap = new Map();
  const allEmployees = new Set();

  function addPair(managerName, employeeName) {
    const manager = String(managerName || "").trim();
    const employee = String(employeeName || "").trim();
    if (!manager || !employee) return;
    if (!managerMap.has(manager)) managerMap.set(manager, new Set());
    managerMap.get(manager).add(employee);
    allEmployees.add(employee);
  }

  function getString(obj, keys) {
    for (const key of keys) {
      if (typeof obj[key] === "string" && obj[key].trim()) return obj[key].trim();
    }
    return "";
  }

  function parseEmployeeName(item) {
    if (typeof item === "string") return item.trim();
    if (!item || typeof item !== "object") return "";
    return getString(item, ["employee", "employeeName", "employee_name", "name"]);
  }

  function walk(node, activeManager = "") {
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, activeManager));
      return;
    }

    if (!node || typeof node !== "object") return;

    const managerFromNode = getString(node, [
      "manager",
      "managerName",
      "manager_name",
      "reportingManager",
      "reporting_manager",
      "supervisor",
    ]);
    const manager = managerFromNode || activeManager;

    if (Array.isArray(node.employees) && manager) {
      node.employees.forEach((emp) => addPair(manager, parseEmployeeName(emp)));
    }
    if (Array.isArray(node.team) && manager) {
      node.team.forEach((emp) => addPair(manager, parseEmployeeName(emp)));
    }

    const employeeDirect = getString(node, ["employee", "employeeName", "employee_name", "name"]);
    if (manager && employeeDirect) addPair(manager, employeeDirect);

    Object.values(node).forEach((child) => walk(child, manager));
  }

  reports.forEach((report) => walk(report.content, ""));

  const managers = [...managerMap.entries()].map(([name, employees]) => ({
    name,
    employees: [...employees].sort((a, b) => a.localeCompare(b)),
  }));
  managers.sort((a, b) => a.name.localeCompare(b.name));

  return {
    managers,
    employees: [...allEmployees].sort((a, b) => a.localeCompare(b)),
  };
}

function loadPolicyText(policyPath = "policy.txt") {
  const abs = path.resolve(policyPath);
  if (!fs.existsSync(abs)) return "";
  return fs.readFileSync(abs, "utf8").replace(/^\uFEFF/, "").trim();
}

function extractJsonFromText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Empty LLM content");
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  const attempts = [candidate];
  const start = candidate.search(/[\[{]/);
  const endObj = candidate.lastIndexOf("}");
  const endArr = candidate.lastIndexOf("]");
  const end = Math.max(endObj, endArr);
  if (start >= 0 && end > start) attempts.push(candidate.slice(start, end + 1));

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch (_err) {
      const normalized = attempt.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
      try {
        return JSON.parse(normalized);
      } catch (_err2) {
        // keep trying
      }
    }
  }
  throw new Error("Could not parse JSON from LLM response");
}

async function callGroq(messages, opts = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL;
  const url = process.env.GROQ_API_URL || "https://api.groq.com/openai/v1/chat/completions";
  if (!apiKey || !model) throw new Error("GROQ_API_KEY and GROQ_MODEL are required for analysis.");

  const modelCandidates = model.includes("/") ? [model] : [model, `openai/${model}`];
  let lastError = null;
  for (const candidateModel of modelCandidates) {
    const payloads = [
      {
        model: candidateModel,
        messages,
        temperature: opts.temperature ?? 0.1,
        max_tokens: opts.maxTokens ?? 900,
        response_format: { type: "json_object" },
      },
      {
        model: candidateModel,
        messages,
        temperature: opts.temperature ?? 0.1,
        max_tokens: opts.maxTokens ?? 900,
      },
    ];

    for (const payload of payloads) {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...payload,
              max_tokens: Math.min(1800, Math.floor(payload.max_tokens * (1 + (attempt - 1) * 0.4))),
            }),
          });
          const text = await response.text();
          if (!response.ok) {
            lastError = new Error(`Groq API error ${response.status}: ${text.slice(0, 260)}`);
            continue;
          }
          const data = JSON.parse(text);
          const content = data?.choices?.[0]?.message?.content;
          if (typeof content === "string" && content.trim()) return content;
          lastError = new Error("Groq returned no content");
        } catch (err) {
          lastError = err;
        }
      }
    }
  }
  throw lastError || new Error("Groq call failed");
}

async function callGroqJson(messages, schemaHint, opts = {}) {
  const raw = await callGroq(messages, opts);
  try {
    return extractJsonFromText(raw);
  } catch (_err) {
    const repair = await callGroq(
      [
        { role: "system", content: "Convert user text into one strict JSON object only." },
        { role: "user", content: `Schema: ${schemaHint}\nTEXT:\n${raw}` },
      ],
      { ...opts, temperature: 0.0, maxTokens: Math.max(420, opts.maxTokens || 420) }
    );
    return extractJsonFromText(repair);
  }
}

function collectManagerBlocksFromNode(node, collector, currentQuarter = "") {
  if (Array.isArray(node)) {
    node.forEach((item) => collectManagerBlocksFromNode(item, collector, currentQuarter));
    return;
  }
  if (!node || typeof node !== "object") return;

  const quarter =
    String(node.quarter || node.Quarter || currentQuarter || "").trim().toUpperCase() ||
    String(currentQuarter || "").trim().toUpperCase();
  const manager =
    String(
      node.manager_name ||
      node.managerName ||
      node.manager ||
      node.reporting_manager ||
      node.reportingManager ||
      ""
    ).trim();

  const teamLike = Array.isArray(node.team)
    ? node.team
    : Array.isArray(node.employees)
      ? node.employees
      : null;

  if (manager && teamLike) {
    collector.push({
      quarter: quarter || "",
      managerName: manager,
      team: teamLike,
    });
  }

  Object.values(node).forEach((child) => collectManagerBlocksFromNode(child, collector, quarter));
}

function normalizeEmployeeRecord(rawEmp, quarter, managerName) {
  if (typeof rawEmp === "string") {
    return {
      quarter,
      managerName,
      employeeName: rawEmp.trim(),
      role: "",
      kpiScore: "",
      peerFeedback: "",
      managerNotes: "",
      promoted: null,
      reason: "",
    };
  }
  const emp = rawEmp && typeof rawEmp === "object" ? rawEmp : {};
  const ai = emp.ai_analytics && typeof emp.ai_analytics === "object" ? emp.ai_analytics : {};
  return {
    quarter,
    managerName,
    employeeName: String(emp.name || emp.employeeName || emp.employee_name || emp.employee || "").trim(),
    role: String(emp.role || emp.designation || "").trim(),
    kpiScore: String(emp.kpi_score ?? emp.kpiScore ?? emp.kpi ?? "").trim(),
    peerFeedback: String(emp.peer_feedback || emp.peerFeedback || "").trim(),
    managerNotes: String(emp.manager_notes || emp.managerNotes || "").trim(),
    promoted: typeof emp.promoted === "boolean" ? emp.promoted : null,
    reason: String(emp.reason || emp.promotion_reason || "").trim(),
    sentimentScore: ai.sentiment_score ?? null,
    retentionRiskLevel: String(ai.retention_risk_level || "").trim(),
    potentialRating: ai.potential_rating ?? null,
    collaborationIndex: ai.collaboration_index ?? null,
    resilienceScore: ai.resilience_score ?? ai.resilience ?? null,
    skillProficiency: ai.skill_proficiency && typeof ai.skill_proficiency === "object" ? ai.skill_proficiency : {},
    flightRiskProbability: ai.flight_risk_probability ?? null,
  };
}

function collectAllQuarterRows(reports) {
  const blocks = [];
  reports.forEach((reportDoc) => {
    const q = String(reportDoc.quarter || "").toUpperCase();
    collectManagerBlocksFromNode(reportDoc.content, blocks, q);
  });
  const rows = [];
  blocks.forEach((block) => {
    block.team.forEach((empRaw) => {
      const row = normalizeEmployeeRecord(empRaw, block.quarter || "", block.managerName);
      if (row.employeeName) rows.push(row);
    });
  });
  return rows;
}

function buildQuarterlyContext(reports, managerName, employeeName) {
  const blocks = [];
  reports.forEach((reportDoc) => {
    const q = String(reportDoc.quarter || "").toUpperCase();
    collectManagerBlocksFromNode(reportDoc.content, blocks, q);
  });

  const managerBlocks = blocks.filter((b) => b.managerName.toLowerCase() === managerName.toLowerCase());
  const managerEmployeeMap = new Map();
  const managerQuarterRows = [];

  managerBlocks.forEach((block) => {
    block.team.forEach((empRaw) => {
      const row = normalizeEmployeeRecord(empRaw, block.quarter || "", block.managerName);
      if (!row.employeeName) return;
      managerQuarterRows.push(row);
      if (!managerEmployeeMap.has(row.employeeName)) managerEmployeeMap.set(row.employeeName, []);
      managerEmployeeMap.get(row.employeeName).push(row);
    });
  });

  const selectedEmployeeRows = managerQuarterRows
    .filter((r) => r.employeeName.toLowerCase() === employeeName.toLowerCase())
    .sort((a, b) => String(a.quarter).localeCompare(String(b.quarter)));

  const employeesUnderManager = [...managerEmployeeMap.keys()].sort((a, b) => a.localeCompare(b));
  const promotedRows = managerQuarterRows.filter((r) => r.promoted === true);
  const nonPromotedRows = managerQuarterRows.filter((r) => r.promoted === false);

  return {
    managerName,
    employeeName,
    employeeRows: selectedEmployeeRows,
    managerRows: managerQuarterRows,
    employeesUnderManager,
    managerStats: {
      totalEvaluations: managerQuarterRows.length,
      promotedCount: promotedRows.length,
      notPromotedCount: nonPromotedRows.length,
      promotionRate: managerQuarterRows.length ? Number(((promotedRows.length / managerQuarterRows.length) * 100).toFixed(2)) : 0,
    },
  };
}

function toKpiPercent(value) {
  const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function average(nums) {
  if (!nums.length) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function getQuarterSortKey(quarter) {
  const m = String(quarter || "").toUpperCase().match(/^Q([1-4])$/);
  return m ? Number(m[1]) : 99;
}

function scoreManagerNotePositivity(text) {
  const positive = ["excellent", "strong", "improved", "reliable", "ready", "leader", "benchmark", "great", "mastered", "flawless", "champion"];
  const source = String(text || "").toLowerCase();
  let score = 0;
  positive.forEach((w) => {
    if (source.includes(w)) score += 1;
  });
  return score;
}

function buildManagerCalibration(globalRows) {
  const byManager = new Map();
  globalRows.forEach((r) => {
    if (!byManager.has(r.managerName)) byManager.set(r.managerName, []);
    byManager.get(r.managerName).push(r);
  });
  const calibration = [...byManager.entries()].map(([managerName, rows]) => {
    const avgKpi = average(rows.map((r) => toKpiPercent(r.kpiScore)).filter((n) => Number.isFinite(n)));
    const avgPotential = average(rows.map((r) => Number(r.potentialRating)).filter((n) => Number.isFinite(n)));
    return {
      managerName,
      averageKpi: Number.isFinite(avgKpi) ? Number(avgKpi.toFixed(2)) : null,
      averagePotentialRating: Number.isFinite(avgPotential) ? Number(avgPotential.toFixed(2)) : null,
      evaluations: rows.length,
    };
  });
  calibration.sort((a, b) => a.managerName.localeCompare(b.managerName));
  return calibration;
}

function buildPredictiveAuditSignals(context) {
  const globalRows = Array.isArray(context.globalRows) ? context.globalRows : [];
  const byEmployee = new Map();
  globalRows.forEach((r) => {
    if (!byEmployee.has(r.employeeName)) byEmployee.set(r.employeeName, []);
    byEmployee.get(r.employeeName).push(r);
  });

  const highPerformanceHighRisk = [];
  const forceMultipliers = [];
  const skillEvolutionCandidates = [];
  const criticalSrsRisk = [];

  [...byEmployee.entries()].forEach(([employeeName, rows]) => {
    const sorted = [...rows].sort((a, b) => getQuarterSortKey(a.quarter) - getQuarterSortKey(b.quarter));
    const kpis = sorted.map((r) => toKpiPercent(r.kpiScore)).filter((n) => Number.isFinite(n));
    const sentiments = sorted.map((r) => Number(r.sentimentScore)).filter((n) => Number.isFinite(n));
    const flights = sorted.map((r) => Number(r.flightRiskProbability)).filter((n) => Number.isFinite(n));
    const collabs = sorted.map((r) => Number(r.collaborationIndex)).filter((n) => Number.isFinite(n));
    const avgKpi = average(kpis);
    const latestFlight = flights.length ? flights[flights.length - 1] : null;
    const sentimentDecline = sentiments.length >= 2 ? sentiments[sentiments.length - 1] < sentiments[0] : false;
    const kpiStable = kpis.length >= 2 ? Math.abs(kpis[kpis.length - 1] - kpis[0]) <= 6 : false;
    const highCollab = collabs.length ? collabs[collabs.length - 1] >= 0.9 : false;
    const latest = sorted[sorted.length - 1] || {};
    const latestKpi = toKpiPercent(latest.kpiScore);
    const srsCalc = calculateSyntheticResilienceFromRow(latest);
    const latestSrs = Number(srsCalc.srs);

    if (avgKpi > 100 && latestFlight !== null && latestFlight > 0.3 && sentimentDecline) {
      highPerformanceHighRisk.push({
        employeeName,
        role: sorted[sorted.length - 1]?.role || "",
        averageKpi: Number(avgKpi.toFixed(2)),
        latestFlightRisk: latestFlight,
        sentimentStart: sentiments[0] ?? null,
        sentimentEnd: sentiments[sentiments.length - 1] ?? null,
      });
    }

    if (highCollab && kpiStable) {
      forceMultipliers.push({
        employeeName,
        role: sorted[sorted.length - 1]?.role || "",
        latestCollaboration: collabs[collabs.length - 1],
        kpiStart: kpis[0] ?? null,
        kpiEnd: kpis[kpis.length - 1] ?? null,
        mentorshipEvidence: sorted
          .map((r) => r.managerNotes)
          .filter((t) => /mentor|mentorship|coach|training|enable|upskill/i.test(String(t)))
          .slice(-2),
      });
    }

    if (Number.isFinite(latestKpi) && latestKpi > 90 && Number.isFinite(latestSrs) && latestSrs < 4) {
      criticalSrsRisk.push({
        employeeName,
        role: sorted[sorted.length - 1]?.role || "",
        managerName: sorted[sorted.length - 1]?.managerName || "",
        latestKpi,
        latestSrs,
        sentimentEnd: sentiments[sentiments.length - 1] ?? null,
      });
    }

    const skillCount = sorted.reduce((sum, r) => sum + Object.keys(r.skillProficiency || {}).length, 0);
    skillEvolutionCandidates.push({ employeeName, skillCount, rows: sorted });
  });

  const promotionAnomalies = [];
  const softSkillPromotionReasons = [];
  const byManagerQuarter = new Map();
  globalRows.forEach((r) => {
    const key = `${r.managerName}__${r.quarter}`;
    if (!byManagerQuarter.has(key)) byManagerQuarter.set(key, []);
    byManagerQuarter.get(key).push(r);
  });

  [...byManagerQuarter.entries()].forEach(([key, rows]) => {
    const promoted = rows.filter((r) => r.promoted === true);
    const nonPromoted = rows.filter((r) => r.promoted === false);
    promoted.forEach((p) => {
      const pKpi = toKpiPercent(p.kpiScore);
      nonPromoted.forEach((n) => {
        const nKpi = toKpiPercent(n.kpiScore);
        if (Number.isFinite(pKpi) && Number.isFinite(nKpi) && pKpi < nKpi) {
          promotionAnomalies.push(
            `${key}: Promoted ${p.employeeName} (${pKpi}) over ${n.employeeName} (${nKpi})`
          );
          softSkillPromotionReasons.push({
            managerQuarter: key,
            promotedEmployee: p.employeeName,
            reason: p.reason,
          });
        }
      });
    });
  });

  const sentimentManagerDisconnects = globalRows
    .filter((r) => scoreManagerNotePositivity(r.managerNotes) >= 1 && Number(r.sentimentScore) < 0.6)
    .map((r) => `${r.quarter}: ${r.managerName} -> ${r.employeeName} (sentiment ${r.sentimentScore})`);

  const calibration = buildManagerCalibration(globalRows);
  const hardest = [...calibration]
    .filter((m) => Number.isFinite(m.averageKpi) && Number.isFinite(m.averagePotentialRating))
    .sort((a, b) => (a.averageKpi + a.averagePotentialRating) - (b.averageKpi + b.averagePotentialRating))[0];

  skillEvolutionCandidates.sort((a, b) => b.skillCount - a.skillCount);
  const skillEvolutionTop3 = skillEvolutionCandidates.slice(0, 3).map((x) => ({
    employeeName: x.employeeName,
    quarters: x.rows.map((r) => ({
      quarter: r.quarter,
      skillProficiency: r.skillProficiency,
    })),
  }));

  return {
    highPerformanceHighRisk,
    criticalSrsRisk,
    forceMultipliers,
    skillEvolutionTop3,
    promotionAnomalies,
    softSkillPromotionReasons: softSkillPromotionReasons.slice(0, 20),
    sentimentManagerDisconnects,
    managerCalibration: calibration,
    hardestManagerSignal: hardest || null,
  };
}

function uniqueStrings(items) {
  return [...new Set((items || []).map((x) => String(x || "").trim()).filter(Boolean))];
}

function buildStayInterviewQuestions(notesHistory) {
  const notesText = String(notesHistory || "").toLowerCase();
  const questions = [
    "Which part of your current workload is most draining, and what support would immediately help?",
    "What would make you feel more recognized and sustainable in this role over the next two quarters?",
    "What one change from management would most improve your day-to-day effectiveness?",
  ];

  if (notesText.includes("mentor") || notesText.includes("training") || notesText.includes("coach")) {
    questions[1] = "Are mentoring expectations realistic, and what boundaries or support do you need to continue mentoring effectively?";
  }
  if (notesText.includes("system") || notesText.includes("documentation") || notesText.includes("process")) {
    questions[2] = "Where are you acting as an unofficial systems/process owner, and what responsibilities should be redistributed?";
  }
  return questions;
}

function suggestResourceReallocation(notesHistory, reasonsHistory) {
  const text = `${notesHistory} ${reasonsHistory}`.toLowerCase();
  if (text.includes("system") || text.includes("implementation") || text.includes("admin")) {
    return "Assign an HR Ops or Systems assistant for operational/admin load redistribution.";
  }
  if (text.includes("mentor") || text.includes("training") || text.includes("coach")) {
    return "Allocate formal mentoring bandwidth and redistribute at least one delivery stream.";
  }
  if (text.includes("documentation") || text.includes("quality") || text.includes("testing")) {
    return "Add a documentation/QA partner to reduce invisible cognitive workload.";
  }
  return "Rebalance workload by moving one non-core responsibility to a peer for 4-6 weeks.";
}

function inferRootCause(notesHistory, reasonsHistory) {
  const text = `${notesHistory} ${reasonsHistory}`.toLowerCase();
  if (text.includes("system") || text.includes("implementation") || text.includes("admin")) {
    return "Support burden from unofficial systems ownership is likely impacting sentiment.";
  }
  if (text.includes("mentor") || text.includes("training") || text.includes("coach")) {
    return "Sustained mentoring load may be reducing available recovery time.";
  }
  if (text.includes("quality") || text.includes("testing") || text.includes("documentation")) {
    return "Invisible quality/documentation overhead appears high relative to recognition.";
  }
  return "Workload/recognition mismatch likely driving sentiment decline despite strong KPI.";
}

function buildWorkloadChanges(notesHistory, reasonsHistory) {
  const text = `${notesHistory} ${reasonsHistory}`.toLowerCase();
  const changes = [];
  if (text.includes("system") || text.includes("implementation") || text.includes("admin")) {
    changes.push("Transfer first-line systems/admin support tickets to HR Ops assistant effective immediately.");
    changes.push("Limit employee to one weekly escalation slot; reroute all ad-hoc tooling requests through manager queue.");
  }
  if (text.includes("mentor") || text.includes("training") || text.includes("coach")) {
    changes.push("Formalize mentoring load to max 2 hours/week and assign a backup mentor.");
  }
  if (text.includes("documentation") || text.includes("testing") || text.includes("quality")) {
    changes.push("Assign documentation/QA buddy for shared ownership of process-heavy tasks.");
  }
  while (changes.length < 3) {
    changes.push("Move one non-core deliverable from current sprint to another team member for 30 days.");
  }
  return changes.slice(0, 3);
}

function buildThirtyDayRoadmap(employeeName, managerName, rootCause, workloadChanges) {
  return [
    `Days 1-3: Manager (${managerName}) sends support message, confirms concern areas, and schedules a stay interview with ${employeeName}.`,
    `Days 4-10: Implement workload change #1: ${workloadChanges[0]}`,
    `Days 11-20: Implement workload change #2: ${workloadChanges[1]} and track weekly sentiment pulse.`,
    `Days 21-30: Implement workload change #3: ${workloadChanges[2]}; run checkpoint on sentiment + flight risk with manager.`,
    `Outcome target: mitigate risk driver - ${rootCause}`,
  ];
}

function buildYearlyBurnoutAnalysis(sortedRows) {
  const rows = [...sortedRows].sort((a, b) => getQuarterSortKey(a.quarter) - getQuarterSortKey(b.quarter));
  const q1to3 = rows.filter((r) => getQuarterSortKey(r.quarter) <= 3);
  const q4 = rows.find((r) => getQuarterSortKey(r.quarter) === 4) || rows[rows.length - 1] || null;

  const kpisEarly = q1to3.map((r) => toKpiPercent(r.kpiScore)).filter((n) => Number.isFinite(n));
  const sentimentsEarly = q1to3.map((r) => Number(r.sentimentScore)).filter((n) => Number.isFinite(n));
  const kpiEarlyAvg = average(kpisEarly);
  const sentimentEarlyAvg = average(sentimentsEarly);
  const ratioEarly = (Number.isFinite(kpiEarlyAvg) && Number.isFinite(sentimentEarlyAvg) && sentimentEarlyAvg > 0)
    ? Number((kpiEarlyAvg / sentimentEarlyAvg).toFixed(2))
    : null;

  const kpiQ4 = toKpiPercent(q4?.kpiScore);
  const sentimentQ4 = Number(q4?.sentimentScore);
  const ratioQ4 = (Number.isFinite(kpiQ4) && Number.isFinite(sentimentQ4) && sentimentQ4 > 0)
    ? Number((kpiQ4 / sentimentQ4).toFixed(2))
    : null;

  const sentimentSeries = rows
    .map((r) => ({ quarter: r.quarter, sentiment: Number(r.sentimentScore) }))
    .filter((x) => Number.isFinite(x.sentiment));
  const kpiSeries = rows
    .map((r) => ({ quarter: r.quarter, kpi: toKpiPercent(r.kpiScore) }))
    .filter((x) => Number.isFinite(x.kpi));

  const sentimentDrop = sentimentSeries.length >= 2
    ? Number((sentimentSeries[sentimentSeries.length - 1].sentiment - sentimentSeries[0].sentiment).toFixed(2))
    : null;
  const divergenceScore = (ratioEarly !== null && ratioQ4 !== null)
    ? Number((ratioQ4 - ratioEarly).toFixed(2))
    : null;
  const negativeDivergence = divergenceScore !== null && divergenceScore > 12;
  const lagEffect = Number.isFinite(kpiQ4) && Number.isFinite(kpiEarlyAvg) && Number.isFinite(sentimentQ4) && Number.isFinite(sentimentEarlyAvg)
    ? kpiQ4 >= Math.max(95, kpiEarlyAvg - 5) && sentimentQ4 <= Math.min(0.6, sentimentEarlyAvg - 0.2)
    : false;

  const byQuarter = new Map(rows.map((r) => [String(r.quarter).toUpperCase(), r]));
  const q2Notes = byQuarter.get("Q2")?.managerNotes || "";
  const q3Notes = byQuarter.get("Q3")?.managerNotes || "";
  const q4Notes = byQuarter.get("Q4")?.managerNotes || q4?.managerNotes || "";
  const q2Reason = byQuarter.get("Q2")?.reason || "";
  const q3Reason = byQuarter.get("Q3")?.reason || "";
  const q4Reason = byQuarter.get("Q4")?.reason || q4?.reason || "";

  return {
    kpiEarlyAvg: Number.isFinite(kpiEarlyAvg) ? Number(kpiEarlyAvg.toFixed(2)) : null,
    sentimentEarlyAvg: Number.isFinite(sentimentEarlyAvg) ? Number(sentimentEarlyAvg.toFixed(2)) : null,
    kpiQ4: Number.isFinite(kpiQ4) ? kpiQ4 : null,
    sentimentQ4: Number.isFinite(sentimentQ4) ? sentimentQ4 : null,
    ratioEarly,
    ratioQ4,
    divergenceScore,
    negativeDivergence,
    lagEffect,
    sentimentDrop,
    historicalBaseline:
      `Q1-Q3 baseline shows KPI avg ${Number.isFinite(kpiEarlyAvg) ? Number(kpiEarlyAvg.toFixed(2)) : "N/A"} and sentiment avg ${Number.isFinite(sentimentEarlyAvg) ? Number(sentimentEarlyAvg.toFixed(2)) : "N/A"}, indicating stable performance-morale alignment.`,
    divergenceNarrative:
      `Q4 shows KPI ${Number.isFinite(kpiQ4) ? kpiQ4 : "N/A"} with sentiment ${Number.isFinite(sentimentQ4) ? sentimentQ4 : "N/A"}. ` +
      `Divergence score vs baseline ratio: ${divergenceScore ?? "N/A"} (${negativeDivergence ? "Negative Divergence" : "No severe divergence"}).`,
    lagNarrative:
      lagEffect
        ? "Lag effect detected: output stayed resilient while morale dropped sharply, indicating hidden attrition risk."
        : "Lag effect not strongly detected from full-year trend.",
    contextualSynthesis:
      `Q2 context: ${q2Notes || q2Reason || "N/A"}\n` +
      `Q3 context: ${q3Notes || q3Reason || "N/A"}\n` +
      `Q4 context: ${q4Notes || q4Reason || "N/A"}`,
  };
}

function buildTalentGuardianAlerts(globalRows) {
  const rows = Array.isArray(globalRows) ? globalRows : [];
  const byEmployee = new Map();
  rows.forEach((r) => {
    if (!byEmployee.has(r.employeeName)) byEmployee.set(r.employeeName, []);
    byEmployee.get(r.employeeName).push(r);
  });

  const alerts = [];
  [...byEmployee.entries()].forEach(([employeeName, employeeRows]) => {
    const sorted = [...employeeRows].sort((a, b) => getQuarterSortKey(a.quarter) - getQuarterSortKey(b.quarter));
    const yearly = buildYearlyBurnoutAnalysis(sorted);
    const latest = sorted[sorted.length - 1];
    const latestKpi = toKpiPercent(latest?.kpiScore);
    const latestSentiment = Number(latest?.sentimentScore);
    if (!Number.isFinite(latestSentiment)) return;

    const avgKpi = average(sorted.map((r) => toKpiPercent(r.kpiScore)).filter((n) => Number.isFinite(n)));
    const yearlyBurnoutTrigger =
      Number.isFinite(avgKpi) &&
      avgKpi > 95 &&
      latestSentiment < 0.6 &&
      ((yearly.negativeDivergence === true) || (yearly.lagEffect === true) || (Number.isFinite(yearly.sentimentDrop) && yearly.sentimentDrop <= -0.2));
    if (!yearlyBurnoutTrigger) return;

    const triggerKpi = Number.isFinite(yearly.kpiQ4) ? yearly.kpiQ4 : latestKpi;
    const triggerSentiment = Number.isFinite(yearly.sentimentQ4) ? yearly.sentimentQ4 : latestSentiment;
    const triggerQuarter = "Q4";

    const sentimentStart = Number(sorted[0]?.sentimentScore);
    const sentimentDecline = Number.isFinite(sentimentStart) ? Number((latestSentiment - sentimentStart).toFixed(2)) : null;
    const notesHistory = sorted.map((r) => `[${r.quarter}] ${r.managerNotes || "N/A"}`).join(" ");
    const reasonsHistory = sorted.map((r) => `[${r.quarter}] ${r.reason || "N/A"}`).join(" ");
    const managerName = latest.managerName || "";
    const role = latest.role || "";
    const flightRisk = Number(latest.flightRiskProbability);
    const rootCause = inferRootCause(notesHistory, reasonsHistory);
    const resourceSuggestion = suggestResourceReallocation(notesHistory, reasonsHistory);
    const workloadChanges = buildWorkloadChanges(notesHistory, reasonsHistory);
    const thirtyDayRoadmap = buildThirtyDayRoadmap(employeeName, managerName, rootCause, workloadChanges);
    const stayInterviewQuestions = buildStayInterviewQuestions(notesHistory);
    const slackMessage =
      `Hi ${employeeName}, checking in after this cycle. You've delivered strong outcomes, and I want to make sure workload pressure stays sustainable. ` +
      `Can we do a 30-minute stay conversation this week to review support needs and priorities for next month?`;
    const calendarInvite =
      `Title: Stay Interview - ${employeeName}\n` +
      `Duration: 30 minutes\n` +
      `Owner: ${managerName}\n` +
      `Agenda: Engagement pulse, workload pressure points, support actions, 30-day follow-up plan.`;
    const q1Reminder =
      `Q1 Reminder: Verify that ${managerName} executed intervention actions for ${employeeName} in the next uploaded Q1 JSON.`;

    const diagnosis = [
      `Triggered by yearly burnout model in ${triggerQuarter}: sustained high KPI (year avg ${Number(avgKpi.toFixed(2))}) with low sentiment (${triggerSentiment}).`,
      yearly.historicalBaseline,
      yearly.divergenceNarrative,
      yearly.lagNarrative,
      sentimentDecline !== null ? `Sentiment trend delta since Q1: ${sentimentDecline}.` : "Sentiment trend baseline unavailable.",
      Number.isFinite(flightRisk) ? `Latest flight risk probability: ${flightRisk}.` : "Flight risk probability unavailable.",
      `Potential divergence: high measurable output with declining emotional/engagement signal. Root cause signal: ${rootCause}`,
    ].join(" ");

    const managerEmail =
      `Subject: Talent Guardian Alert - Immediate Retention Check for ${employeeName}\n\n` +
      `Hi ${managerName || "Manager"},\n\n` +
      `The Talent Guardian agent flagged ${employeeName} (${role}) due to a high-performance/low-sentiment divergence. ` +
      `Latest KPI is ${latestKpi}% while sentiment score is ${latestSentiment}. ${Number.isFinite(flightRisk) ? `Flight risk is ${flightRisk}. ` : ""}` +
      `${sentimentDecline !== null ? `Sentiment has shifted by ${sentimentDecline} since Q1. ` : ""}` +
      `This pattern can indicate hidden workload stress, especially when the employee carries informal team responsibilities.\n\n` +
      `Recommended immediate actions:\n` +
      `1) Conduct a stay interview this week using the attached script.\n` +
      `2) Implement this resource reallocation: ${resourceSuggestion}\n` +
      `3) Execute the 30-day intervention roadmap attached below.\n\n` +
      `- Talent Guardian Agent`;

    alerts.push({
      employeeName,
      managerName,
      role,
      quarter: latest.quarter,
      kpiScore: latestKpi,
      sentimentScore: latestSentiment,
      flightRiskProbability: Number.isFinite(flightRisk) ? flightRisk : null,
      diagnosis,
      interventionPackage: {
        managerEmail,
        slackMessageToEmployee: slackMessage,
        calendarInviteDraft: calendarInvite,
        stayInterviewScript: stayInterviewQuestions,
        resourceReallocation: resourceSuggestion,
        workloadChanges,
        thirtyDayRoadmap,
        q1FollowUpReminder: q1Reminder,
        yearlyBurnoutAnalysis: yearly,
      },
    });
  });

  return {
    generatedAt: new Date().toISOString(),
    rule: "Yearly Burnout Model: avg KPI > 95 + latest sentiment < 0.60 + negative divergence/lag-effect",
    count: alerts.length,
    employeeNames: uniqueStrings(alerts.map((a) => a.employeeName)),
    alerts,
  };
}

function buildSrsCriticalFallbackAlert(employeeName, globalRows) {
  const rows = (globalRows || []).filter(
    (r) => String(r.employeeName || "").toLowerCase() === String(employeeName || "").toLowerCase()
  );
  if (!rows.length) return null;

  const sorted = [...rows].sort((a, b) => getQuarterSortKey(a.quarter) - getQuarterSortKey(b.quarter));
  const latest = sorted[sorted.length - 1] || {};
  const managerName = latest.managerName || "";
  const role = latest.role || "";
  const latestKpi = toKpiPercent(latest.kpiScore);
  const latestSentiment = Number(latest.sentimentScore);
  const latestFlightRisk = Number(latest.flightRiskProbability);
  const srsCalc = calculateSyntheticResilienceFromRow(latest);
  const yearly = buildYearlyBurnoutAnalysis(sorted);
  const notesHistory = sorted.map((r) => `[${r.quarter}] ${r.managerNotes || "N/A"}`).join(" ");
  const reasonsHistory = sorted.map((r) => `[${r.quarter}] ${r.reason || "N/A"}`).join(" ");
  const rootCause = inferRootCause(notesHistory, reasonsHistory);
  const resourceSuggestion = suggestResourceReallocation(notesHistory, reasonsHistory);
  const workloadChanges = buildWorkloadChanges(notesHistory, reasonsHistory);
  const thirtyDayRoadmap = buildThirtyDayRoadmap(employeeName, managerName, rootCause, workloadChanges);
  const stayInterviewQuestions = buildStayInterviewQuestions(notesHistory);

  const managerEmail =
    `Subject: Critical SRS Risk Alert - Immediate Retention Check for ${employeeName}\n\n` +
    `Hi ${managerName || "Manager"},\n\n` +
    `The Talent Guardian system flagged ${employeeName} under Critical SRS Risk (KPI ${Number.isFinite(latestKpi) ? latestKpi : "N/A"} with SRS ${srsCalc.srs}). ` +
    `This indicates high output with critically low resilience and elevated attrition risk.\n\n` +
    `Recommended immediate actions:\n` +
    `1) Conduct a stay interview this week using the attached script.\n` +
    `2) Implement this resource reallocation: ${resourceSuggestion}\n` +
    `3) Execute the 30-day intervention roadmap attached below.\n\n` +
    `- Talent Guardian Agent`;

  return {
    employeeName,
    managerName,
    role,
    quarter: latest.quarter || "Q4",
    kpiScore: Number.isFinite(latestKpi) ? latestKpi : null,
    sentimentScore: Number.isFinite(latestSentiment) ? latestSentiment : null,
    flightRiskProbability: Number.isFinite(latestFlightRisk) ? latestFlightRisk : null,
    diagnosis:
      `Critical SRS Risk trigger matched: KPI>90 and synthetic resilience below 4 (SRS ${srsCalc.srs}, category ${srsCalc.category}). ` +
      `${yearly.divergenceNarrative || ""}`.trim(),
    interventionPackage: {
      managerEmail,
      slackMessageToEmployee:
        `Hi ${employeeName}, your recent delivery has been strong and we want to ensure the pace remains sustainable. ` +
        `Let's run a stay interview this week to align support actions for the next 30 days.`,
      calendarInviteDraft:
        `Title: Stay Interview - ${employeeName}\n` +
        `Duration: 30 minutes\n` +
        `Owner: ${managerName}\n` +
        `Agenda: Resilience check, workload blockers, and 30-day support actions.`,
      stayInterviewScript: stayInterviewQuestions,
      resourceReallocation: resourceSuggestion,
      workloadChanges,
      thirtyDayRoadmap,
      q1FollowUpReminder:
        `Q1 Reminder: Verify that ${managerName} executed critical-resilience intervention actions for ${employeeName}.`,
      yearlyBurnoutAnalysis: yearly,
    },
  };
}

function resolveInterventionAlertForEmployee(guardianPayload, employeeName, globalRows) {
  const employee = String(employeeName || "").trim();
  if (!employee) return null;

  const directAlert = (guardianPayload?.alerts || []).find(
    (a) => String(a.employeeName || "").toLowerCase() === employee.toLowerCase()
  );
  if (directAlert) return directAlert;

  const predictive = buildPredictiveAuditSignals({ globalRows: globalRows || [] });
  const isCritical = (predictive.criticalSrsRisk || []).some(
    (r) => String(r.employeeName || "").toLowerCase() === employee.toLowerCase()
  );
  if (!isCritical) return null;

  return buildSrsCriticalFallbackAlert(employee, globalRows);
}

function buildLatestEmployeeSnapshots(globalRows) {
  const byEmployee = new Map();
  (globalRows || []).forEach((row) => {
    if (!row || !row.employeeName) return;
    if (!byEmployee.has(row.employeeName)) byEmployee.set(row.employeeName, []);
    byEmployee.get(row.employeeName).push(row);
  });

  const snapshots = [];
  for (const [employeeName, rows] of byEmployee.entries()) {
    const sorted = [...rows].sort((a, b) => getQuarterSortKey(a.quarter) - getQuarterSortKey(b.quarter));
    const latest = sorted[sorted.length - 1] || {};
    const rawResilience = Number(latest.resilienceScore);
    const sentiment = Number(latest.sentimentScore);
    const flightRisk = Number(latest.flightRiskProbability);
    const collaboration = Number(latest.collaborationIndex);
    const kpi = toKpiPercent(latest.kpiScore);
    const skillValues = Object.values(latest.skillProficiency || {})
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n));
    const avgSkill = skillValues.length ? average(skillValues) : null;
    const latestSkillProficiency = latest.skillProficiency && typeof latest.skillProficiency === "object"
      ? latest.skillProficiency
      : {};
    const syntheticResilience = calculateSyntheticResilienceFromRow(latest);
    const resilience = syntheticResilience.srs;

    snapshots.push({
      employeeName,
      managerName: latest.managerName || "",
      role: latest.role || "",
      quarter: latest.quarter || "",
      kpi: Number.isFinite(kpi) ? kpi : null,
      resilience: Number.isFinite(resilience) ? resilience : null,
      rawResilience: Number.isFinite(rawResilience) ? rawResilience : null,
      syntheticResilience,
      resilienceSource: "synthetic_srs",
      sentiment: Number.isFinite(sentiment) ? sentiment : null,
      flightRisk: Number.isFinite(flightRisk) ? flightRisk : null,
      collaboration: Number.isFinite(collaboration) ? collaboration : null,
      avgSkill: Number.isFinite(avgSkill) ? Number(avgSkill.toFixed(2)) : null,
      latestSkillProficiency,
      notesHistory: sorted.map((r) => `[${r.quarter}] ${r.managerNotes || "N/A"}`).join(" "),
      reasonHistory: sorted.map((r) => `[${r.quarter}] ${r.reason || "N/A"}`).join(" "),
      rows: sorted,
    });
  }
  return snapshots;
}

function extractMaintenanceTasksFromHistory(notesHistory, reasonHistory) {
  const text = `${notesHistory || ""} ${reasonHistory || ""}`.toLowerCase();
  const tasks = [];
  if (/maintain|maintenance|support|ticket|escalation/.test(text)) tasks.push("Operational maintenance/support queue");
  if (/system|tool|automation|implementation|admin/.test(text)) tasks.push("HR systems/tooling support");
  if (/documentation|doc|process|compliance/.test(text)) tasks.push("Documentation/process ownership");
  if (/mentor|mentorship|coach|training/.test(text)) tasks.push("Mentorship/training overhead");
  if (/testing|quality|qa|review/.test(text)) tasks.push("Quality/review burden");
  if (!tasks.length) tasks.push("One non-core recurring maintenance stream");
  return [...new Set(tasks)].slice(0, 3);
}

function computePeerCapacity(peer) {
  const resilience = Number(peer.resilience);
  const avgSkill = Number(peer.avgSkill);
  const sentiment = Number(peer.sentiment);
  const collaboration = Number(peer.collaboration);
  const flightRisk = Number(peer.flightRisk);

  const r = Number.isFinite(resilience) ? resilience : 5;
  const s = Number.isFinite(avgSkill) ? avgSkill : 5;
  const t = Number.isFinite(sentiment) ? sentiment : 0.6;
  const c = Number.isFinite(collaboration) ? collaboration : 0.6;
  const f = Number.isFinite(flightRisk) ? flightRisk : 0.3;

  const score = ((r / 10) * 40) + ((s / 10) * 30) + (t * 20) + (c * 10) - (f * 20);
  return Number(Math.max(0, Math.min(100, score)).toFixed(2));
}

function resilienceCategory(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return "Unknown";
  if (s <= 3) return "Critical";
  if (s <= 6) return "Vulnerable";
  return "Stable";
}

function managerNotesPositivityBucket(notes) {
  const p = scoreManagerNotePositivity(notes);
  if (p >= 2) return 2;
  if (p >= 1) return 1;
  return 0;
}

function calculateSyntheticResilienceFromRow(row) {
  const sentiment = Number(row?.sentimentScore);
  const collaboration = Number(row?.collaborationIndex);
  const kpi = toKpiPercent(row?.kpiScore);
  const notes = String(row?.managerNotes || "");
  const positivity = managerNotesPositivityBucket(notes);

  const sentimentBase = Number.isFinite(sentiment) ? sentiment * 6 : 0; // 60%
  const collaborationBuffer = Number.isFinite(collaboration) ? collaboration * 3 : 0; // 30%
  const managerialSentiment = positivity >= 2 ? 1 : (positivity === 0 ? -1 : 0); // 10%
  let srs = sentimentBase + collaborationBuffer + managerialSentiment;

  if (Number.isFinite(kpi) && Number.isFinite(sentiment) && kpi > 105 && sentiment < 0.6) srs -= 2;
  if (/(overwhelmed|stress|late|bottleneck)/i.test(notes)) srs -= 1.5;

  srs = Math.max(0, Math.min(10, srs));
  const rounded = Number(srs.toFixed(2));
  return {
    srs: rounded,
    category: resilienceCategory(rounded),
    components: {
      sentimentBase: Number(sentimentBase.toFixed(2)),
      collaborationBuffer: Number(collaborationBuffer.toFixed(2)),
      managerialSentiment,
      managerNotesPositivity: positivity,
    },
  };
}

function roleToDepartment(role) {
  const r = String(role || "").toLowerCase();
  if (/(developer|engineer|qa|devops|architect)/.test(r)) return "engineering";
  if (/(data analyst|analyst|bi|data science)/.test(r)) return "analytics";
  if (/(sales|account|business development)/.test(r)) return "sales";
  if (/(hr|recruit|people)/.test(r)) return "hr";
  if (/(finance|accounting)/.test(r)) return "finance";
  return "general";
}

function canCrossFunctionalBridge(senderRole, peerRole) {
  const s = roleToDepartment(senderRole);
  const p = roleToDepartment(peerRole);
  if (s === p) return false;
  // Explicit bridge example requested: Data Analyst <-> Developer (reporting/process only)
  return (
    (s === "engineering" && p === "analytics") ||
    (s === "analytics" && p === "engineering")
  );
}

function weightedDomainLockedScore(sender, peer, domainMatch) {
  const senderRole = String(sender?.role || "");
  const peerRole = String(peer?.role || "");
  const deptMatch = roleToDepartment(senderRole) === roleToDepartment(peerRole);
  const bridge = canCrossFunctionalBridge(senderRole, peerRole);
  const baseSkill = Number.isFinite(Number(domainMatch?.receiverDomainLevel))
    ? Number(domainMatch.receiverDomainLevel) / 10
    : Number.isFinite(Number(peer?.avgSkill))
      ? Number(peer.avgSkill) / 10
      : 0;
  const skillComponent = Math.max(0, Math.min(1, deptMatch ? baseSkill : (bridge ? baseSkill * 0.8 : 0)));
  const resGap = Number(peer?.resilience) - Number(sender?.resilience);
  const resGapComponent = Number.isFinite(resGap) ? Math.max(0, Math.min(1, resGap / 10)) : 0;
  const sentimentComponent = Number.isFinite(Number(peer?.sentiment))
    ? Math.max(0, Math.min(1, Number(peer.sentiment)))
    : 0;
  const score = (skillComponent * 60) + (resGapComponent * 30) + (sentimentComponent * 10);
  return Number(Math.max(0, Math.min(100, score)).toFixed(2));
}

function getPrimaryDomain(skillMap) {
  const entries = Object.entries(skillMap || {})
    .map(([k, v]) => [k, Number(v)])
    .filter(([, v]) => Number.isFinite(v))
    .sort((a, b) => b[1] - a[1]);
  return entries.length ? { domain: entries[0][0], level: entries[0][1] } : { domain: "general", level: null };
}

function computeDomainMatchSkill(sender, receiver) {
  const senderPrimary = getPrimaryDomain(sender?.latestSkillProficiency || {});
  const receiverSkills = receiver?.latestSkillProficiency || {};
  const domainLevel = Number(receiverSkills[senderPrimary.domain]);
  const avgSkill = Number(receiver?.avgSkill);
  return {
    senderPrimaryDomain: senderPrimary.domain,
    senderPrimaryLevel: senderPrimary.level,
    receiverDomainLevel: Number.isFinite(domainLevel) ? domainLevel : null,
    receiverAvgSkill: Number.isFinite(avgSkill) ? avgSkill : null,
    pass: Number.isFinite(domainLevel) ? domainLevel >= 6 : Number.isFinite(avgSkill) && avgSkill >= 6,
  };
}

function evaluateSenderHazardsRuleBased(target) {
  const rows = [...(target?.rows || [])].sort((a, b) => getQuarterSortKey(a.quarter) - getQuarterSortKey(b.quarter));
  const latest = rows[rows.length - 1] || {};
  const latestKpi = Number(target?.kpi);
  const latestResilience = Number(target?.resilience);
  const latestCollab = Number(target?.collaboration);
  const latestSentiment = Number(target?.sentiment);
  const skillMap = target?.latestSkillProficiency || latest.skillProficiency || {};
  const hasTenSkill = Object.values(skillMap).some((v) => Number(v) === 10);

  const hazards = [];
  if (Number.isFinite(latestResilience) && latestResilience < 4 && Number.isFinite(latestKpi) && latestKpi > 90) {
    hazards.push("Battery Exhaustion");
  }

  if (rows.length >= 3) {
    const prev2 = rows[rows.length - 3];
    const oldSent = Number(prev2.sentimentScore);
    const oldKpi = toKpiPercent(prev2.kpiScore);
    const sentDropPct =
      Number.isFinite(oldSent) && oldSent > 0 && Number.isFinite(latestSentiment)
        ? ((oldSent - latestSentiment) / oldSent)
        : null;
    const kpiStableOrUp = Number.isFinite(oldKpi) && Number.isFinite(latestKpi) ? latestKpi >= oldKpi : false;
    if (sentDropPct !== null && sentDropPct > 0.2 && kpiStableOrUp) {
      hazards.push("Scissors Divergence");
    }
  }

  if (hasTenSkill && Number.isFinite(latestCollab) && latestCollab < 0.4) {
    hazards.push("Expert Bottleneck");
  }

  const senderEligible = hazards.length > 0;
  const primaryHazard = hazards[0] || "Not a Sender";
  const rationale = senderEligible
    ? `Matched hazard cluster(s): ${hazards.join(", ")}.`
    : "No sender hazard cluster matched; off-load not required currently.";
  return { senderEligible, hazards, primaryHazard, rationale };
}

async function evaluateSenderEligibilityWithLlm(target) {
  const schema = `{
  "senderEligible": "boolean",
  "primaryHazard": "string",
  "matchedHazards": ["string"],
  "rationale": "string"
}`;
  const rows = (target?.rows || []).map((r) => ({
    quarter: r.quarter,
    kpi_score: toKpiPercent(r.kpiScore),
    sentiment_score: Number(r.sentimentScore),
    resilience_score: Number(r.resilienceScore),
    collaboration_index: Number(r.collaborationIndex),
    skill_proficiency: r.skillProficiency || {},
  }));
  const fallback = evaluateSenderHazardsRuleBased(target);
  try {
    const out = await callGroqJson(
      [
        {
          role: "system",
          content:
            "You are the Sender Classifier Agent for workload rebalancing.\n" +
            "Classify sender eligibility using exact rules:\n" +
            "1) Battery Exhaustion: resilience_score < 4 AND kpi_score > 90\n" +
            "2) Scissors Divergence: sentiment dropped >20% over 2 quarters while KPI stable/increasing\n" +
            "3) Expert Bottleneck: any skill_proficiency == 10 AND collaboration_index < 0.40\n" +
            "If none match, senderEligible=false. Return strict JSON only.",
        },
        {
          role: "user",
          content:
            `Employee: ${target?.employeeName || "N/A"}\n` +
            `Rows:\n${JSON.stringify(rows, null, 2)}\n` +
            `Schema:\n${schema}`,
        },
      ],
      schema,
      { temperature: 0.0, maxTokens: 420 }
    );
    return {
      senderEligible: Boolean(out.senderEligible),
      primaryHazard: toReadableText(out.primaryHazard, fallback.primaryHazard),
      matchedHazards: Array.isArray(out.matchedHazards) ? out.matchedHazards.map((x) => toReadableText(x, "")).filter(Boolean) : fallback.hazards,
      rationale: toReadableText(out.rationale, fallback.rationale),
      llmUsed: true,
    };
  } catch (_err) {
    return { ...fallback, matchedHazards: fallback.hazards, llmUsed: false };
  }
}

function analyzeWorkloadRebalancing(globalRows, managerName, employeeName, senderAssessment = null, options = {}) {
  const snapshots = buildLatestEmployeeSnapshots(globalRows);
  const target = snapshots.find((s) => s.employeeName.toLowerCase() === String(employeeName || "").toLowerCase());
  if (!target) {
    return { error: "Selected employee not found in quarterly dataset." };
  }

  const offloadPercent = 50;
  const targetTasks = extractMaintenanceTasksFromHistory(target.notesHistory, target.reasonHistory);
  const kpi = Number(target.kpi);
  const resilience = Number(target.resilience);
  const sentiment = Number(target.sentiment);
  const exhaustionIndex = (Number.isFinite(kpi) ? (kpi * 0.4) : 0) + ((10 - (Number.isFinite(resilience) ? resilience : 10)) * 0.6);
  const eligibleForRelief = Number.isFinite(kpi) && Number.isFinite(resilience) && kpi > 90 && resilience < 4;
  const exitCondition = (Number.isFinite(resilience) && resilience >= 4) || (Number.isFinite(kpi) && kpi < 80);
  const diagnosis = eligibleForRelief
    ? "Burnout/High-Output paradox detected."
    : "Employee is not currently in the critical risk zone for workload off-loading.";

  const baseSimulation = {
    targetEmployee: {
      employeeName: target.employeeName,
      managerName: target.managerName,
      role: target.role,
      kpi: target.kpi,
      resilience: target.resilience,
      rawResilience: target.rawResilience,
      syntheticResilience: target.syntheticResilience?.srs ?? target.resilience,
      resilienceCategory: target.syntheticResilience?.category || resilienceCategory(target.resilience),
      resilienceSource: target.resilienceSource || "synthetic_srs",
      sentiment: target.sentiment,
      flightRisk: target.flightRisk,
      requestedReductionPercent: offloadPercent,
      suggestedOffloadTasks: targetTasks,
    },
    riskAssessment: {
      employeeName: target.employeeName,
      diagnosis,
      numericalProof: `KPI=${Number.isFinite(kpi) ? kpi : "N/A"}, SRS=${Number.isFinite(resilience) ? resilience : "N/A"}, Sentiment=${Number.isFinite(sentiment) ? sentiment : "N/A"}, EI=${Number(exhaustionIndex.toFixed(2))}`,
      exhaustionIndex: Number(exhaustionIndex.toFixed(2)),
      eligibility: eligibleForRelief ? "Eligible for Relief" : "Not Eligible",
    },
  };

  if (exitCondition || !eligibleForRelief) {
    return {
      ...baseSimulation,
      senderAssessment: {
        senderEligible: false,
        primaryHazard: "Not in critical risk zone",
        matchedHazards: [],
        rationale: `Employee ${target.employeeName} is not currently in the critical risk zone for workload off-loading.`,
        llmUsed: false,
      },
      trigger: "Risk gate stop.",
      crossTeamScan: {
        scannedEmployees: 0,
        eligiblePeers: 0,
        sameTeamOnly: false,
      },
      compatiblePeers: [],
      receiverDiagnostics: [],
      assignments: [],
      conflictAlert: `Employee ${target.employeeName} is not currently in the critical risk zone for workload off-loading.`,
      blockInternalOffload: false,
      openRequisitionAlert: null,
      generatedAt: new Date().toISOString(),
    };
  }

  const assignedPeerPool = new Set((options.assignedPeers || []).map((x) => String(x || "").toLowerCase()));
  const senderDept = roleToDepartment(target.role);
  const peers = snapshots.filter((s) => s.employeeName.toLowerCase() !== target.employeeName.toLowerCase());

  const peerDiagnostics = peers.map((peer) => {
    const peerDept = roleToDepartment(peer.role);
    const primaryRoleMatch = peerDept === senderDept;
    const secondaryBridge = !primaryRoleMatch && canCrossFunctionalBridge(target.role, peer.role);
    const roleMatchScore = primaryRoleMatch ? 1.0 : (secondaryBridge ? 0.5 : 0);
    const isCapacityRestricted = assignedPeerPool.has(String(peer.employeeName || "").toLowerCase());
    const safetyFilter =
      Number(peer.resilience) >= 7 &&
      Number(peer.sentiment) >= 0.75;
    const capacityBuffer = Number(peer.kpi) < 105;
    const roleSiloPass = roleMatchScore > 0;
    const eligible =
      !isCapacityRestricted &&
      safetyFilter &&
      roleSiloPass &&
      capacityBuffer;
    const pcs =
      (Number(peer.resilience) * 0.5) +
      (Number(peer.sentiment) * 0.3) +
      (roleMatchScore * 0.2);
    return {
      employeeName: peer.employeeName,
      managerName: peer.managerName,
      role: peer.role,
      kpi: peer.kpi,
      resilience: peer.resilience,
      rawResilience: peer.rawResilience,
      syntheticResilience: peer.syntheticResilience?.srs ?? peer.resilience,
      resilienceCategory: peer.syntheticResilience?.category || resilienceCategory(peer.resilience),
      sentiment: peer.sentiment,
      collaboration: peer.collaboration,
      roleMatchScore,
      roleMatchType: primaryRoleMatch ? "Primary Match" : (secondaryBridge ? "Secondary Match" : "No Match"),
      capacityRestricted: isCapacityRestricted,
      capacityRestrictedReason: isCapacityRestricted ? "Capacity Restricted (already assigned in this audit)." : "",
      criteria: {
        safetyFilter,
        roleSiloPass,
        capacityBuffer,
      },
      pcs: Number.isFinite(pcs) ? Number(pcs.toFixed(3)) : null,
      eligible,
      matchedPeer: peer.employeeName,
      safetyRating: Number(peer.resilience) >= 8 ? "Green" : "Yellow",
      transferPlan: eligible
        ? `Delegate 30% of ${primaryRoleMatch ? "Technical" : "Non-Technical"} tasks to ${peer.employeeName} based on ${primaryRoleMatch ? "Role Match" : "Cross-Functional Bridge"}.`
        : "",
    };
  });

  const eligiblePeers = peerDiagnostics
    .filter((p) => p.eligible)
    .sort((a, b) => (Number(b.pcs) - Number(a.pcs)));

  const topPeers = eligiblePeers.slice(0, 2);
  const assignments = topPeers.map((peer) => ({
    toEmployee: peer.employeeName,
    toManager: peer.managerName,
    suggestedLoadPercent: 30,
    taskChunk: peer.roleMatchType === "Primary Match" ? "Technical" : "Non-Technical",
    rationale: `PCS ${peer.pcs} | ${peer.roleMatchType} | Resilience ${peer.resilience} | Sentiment ${peer.sentiment}`,
    transferPlan: peer.transferPlan,
  }));

  const remainingResilience = peerDiagnostics
    .filter((p) => !p.capacityRestricted)
    .map((p) => Number(p.resilience))
    .filter((n) => Number.isFinite(n));
  const remainingTeamAvgResilience = remainingResilience.length ? average(remainingResilience) : null;
  const resourceDepletion = !topPeers.length && (!Number.isFinite(remainingTeamAvgResilience) || remainingTeamAvgResilience < 7);
  const alertText = "RESOURCE DEPLETION DETECTED.";

  return {
    ...baseSimulation,
    senderAssessment: {
      senderEligible: true,
      primaryHazard: "Eligible for Relief",
      matchedHazards: ["KPI>90", "Resilience<4"],
      rationale: "Risk gate passed under Strategic Resource Orchestrator Phase 1.",
      llmUsed: false,
    },
    trigger: "Strategic Resource Orchestrator active.",
    crossTeamScan: {
      scannedEmployees: peerDiagnostics.length,
      eligiblePeers: topPeers.length,
      sameTeamOnly: false,
      senderDepartment: senderDept,
      roleSiloMode: "Department match first with cross-functional bridge fallback",
      remainingTeamAvgResilience: Number.isFinite(remainingTeamAvgResilience) ? Number(remainingTeamAvgResilience.toFixed(2)) : null,
    },
    compatiblePeers: topPeers,
    receiverDiagnostics: peerDiagnostics,
    assignments,
    conflictAlert: topPeers.length
      ? "Top compatible peers identified by PCS."
      : (resourceDepletion
        ? `${alertText} HR must hire an external Contractor/Freelancer immediately. No internal peers have the Safety Buffer (Resilience >= 7) required to absorb additional load without risking further team burnout.`
        : "No compatible peer recommendations after strict filtering."),
    blockInternalOffload: !topPeers.length,
    openRequisitionAlert: topPeers.length
      ? null
      : {
        title: alertText,
        severity: "high",
        message:
          "HR must hire an external Contractor/Freelancer immediately. No internal peers have the Safety Buffer (Resilience >= 7) required to absorb additional load without risking further team burnout.",
        requestedCoverage: "External temporary support required",
      },
    generatedAt: new Date().toISOString(),
  };
}

function pickAutoTargetForRebalancing(globalRows, managerName) {
  const snapshots = buildLatestEmployeeSnapshots(globalRows);
  const scoped = managerName
    ? snapshots.filter((s) => String(s.managerName).toLowerCase() === String(managerName).toLowerCase())
    : snapshots;
  if (!scoped.length) return null;

  const senderCandidates = scoped
    .map((s) => {
      const kpi = Number(s.kpi);
      const resilience = Number(s.resilience);
      const ei = (Number.isFinite(kpi) ? (kpi * 0.4) : 0) + ((10 - (Number.isFinite(resilience) ? resilience : 10)) * 0.6);
      const eligible = Number.isFinite(kpi) && Number.isFinite(resilience) && kpi > 90 && resilience < 4;
      return { s, eligible, ei };
    })
    .filter((x) => x.eligible);

  if (senderCandidates.length) {
    const scoredSenders = senderCandidates.map(({ s, ei }) => {
      const kpi = Number(s.kpi);
      const resilience = Number(s.resilience);
      let riskScore = Number.isFinite(ei) ? ei : 0;
      if (Number.isFinite(kpi) && kpi > 100) riskScore += 10;
      if (Number.isFinite(resilience) && resilience < 2) riskScore += 10;
      return { employeeName: s.employeeName, managerName: s.managerName, riskScore };
    }).sort((a, b) => b.riskScore - a.riskScore);
    return scoredSenders[0];
  }

  const scored = scoped.map((s) => {
    const kpi = Number(s.kpi);
    const sentiment = Number(s.sentiment);
    const flight = Number(s.flightRisk);
    const resilience = Number(s.resilience);
    let riskScore = 0;
    if (Number.isFinite(kpi) && kpi > 95) riskScore += 30;
    if (Number.isFinite(sentiment)) riskScore += Math.max(0, (0.7 - sentiment) * 100);
    if (Number.isFinite(flight)) riskScore += flight * 40;
    if (Number.isFinite(resilience) && resilience < 5) riskScore += (5 - resilience) * 8;
    return { employeeName: s.employeeName, managerName: s.managerName, riskScore };
  }).sort((a, b) => b.riskScore - a.riskScore);

  return scored[0] || null;
}

function buildWorkloadCouncilFallback(simulation) {
  const t = simulation.targetEmployee || {};
  const sender = simulation.senderAssessment || {};
  if (sender.senderEligible === false) {
    return {
      diagnosisTitle: "No Offload Needed",
      cynicNote: "Risk agent: sender hazard clusters did not trigger. Off-loading now may create unnecessary team churn.",
      optimistNote: "Growth agent: continue regular coaching and monitor trajectory; no emergency redistribution required.",
      orchestratorSynthesis: "Synthesis: employee is not a Sender under configured hazard clusters, so receiver search is skipped.",
      executiveSummary: `${t.employeeName || "Employee"} is not currently classified as Sender. No peer off-load required.`,
      decision: "Do not rebalance workload now. Continue normal monitoring cadence.",
      recommendedOwner: t.managerName || "Manager",
      nextActions: [
        "Maintain current workload allocation.",
        "Track resilience/sentiment in next quarterly cycle.",
        "Re-run sender classification if risk indicators worsen."
      ],
      llmUsed: false,
      councilMode: "fallback",
    };
  }
  const kpi = Number(t.kpi);
  const resilience = Number(t.resilience);
  const sentiment = Number(t.sentiment);
  const flight = Number(t.flightRisk);
  const block = Boolean(simulation.blockInternalOffload);
  const assignmentsCount = Array.isArray(simulation.assignments) ? simulation.assignments.length : 0;
  const peers = simulation.crossTeamScan?.eligiblePeers ?? 0;

  let diagnosisTitle = "Balanced Capacity Realignment";
  if (Number.isFinite(kpi) && kpi > 100 && Number.isFinite(resilience) && resilience <= 2) diagnosisTitle = "Performance-Morale Fragility";
  else if (block) diagnosisTitle = "No-Safe-Capacity Constraint";
  else if (peers >= 2 && assignmentsCount >= 2) diagnosisTitle = "Distributed Relief Opportunity";

  const cynic = [
    `Risk view: ${t.employeeName || "Employee"} shows KPI ${Number.isFinite(kpi) ? kpi : "N/A"} with resilience ${Number.isFinite(resilience) ? resilience : "N/A"} and sentiment ${Number.isFinite(sentiment) ? sentiment : "N/A"}.`,
    block
      ? "Internal offload would likely spread burnout; immediate internal redistribution is unsafe."
      : "Without strict cap controls, reassigned load can backfire within 2-4 weeks.",
    Number.isFinite(flight) && flight > 0.35
      ? "Flight-risk signal is elevated; delay in action may cause attrition."
      : "Flight-risk signal is moderate; proactive intervention is still required.",
  ].join(" ");

  const optimist = [
    `Growth view: ${t.employeeName || "Employee"} can stabilize quickly if non-core load is reduced by ${t.requestedReductionPercent || 50}%.`,
    block
      ? "Use temporary external capacity to preserve performance momentum without team collapse."
      : `Eligible peers (${peers}) allow phased transfer with measurable handoff milestones.`,
    "Use this as a role-clarity reset and track sentiment/resilience weekly.",
  ].join(" ");

  const decision = block
    ? "Block internal transfer and open a 30-day contractor requisition."
    : "Proceed with controlled internal reassignment and weekly risk monitoring.";
  const actions = block
    ? [
      "Open temporary requisition (30 days) for maintenance coverage.",
      `Remove one non-core stream from ${t.employeeName || "employee"} this week.`,
      "Run weekly resilience/sentiment checks with manager accountability.",
    ]
    : [
      "Transfer load using proposed assignments with hard percentage caps.",
      "Protect recipient peers with explicit time-boxed ownership boundaries.",
      "Recompute capacity and burnout signals after 14 days.",
    ];

  return {
    diagnosisTitle,
    cynicNote: cynic,
    optimistNote: optimist,
    orchestratorSynthesis:
      `Synthesis: ${decision} Diagnosis selected: ${diagnosisTitle}.`,
    executiveSummary:
      `${diagnosisTitle}. Target ${t.employeeName || "employee"} requires immediate workload intervention based on current risk/capacity profile.`,
    decision,
    recommendedOwner: t.managerName || "Manager",
    nextActions: actions,
    llmUsed: false,
    councilMode: "fallback",
  };
}

async function summarizeWorkloadSimulationWithLlm(simulation) {
  const payload = {
    target: simulation.targetEmployee,
    senderAssessment: simulation.senderAssessment,
    trigger: simulation.trigger,
    crossTeamScan: simulation.crossTeamScan,
    compatiblePeers: simulation.compatiblePeers,
    assignments: simulation.assignments,
    hybridOffloadPlan: simulation.hybridOffloadPlan,
    blockInternalOffload: simulation.blockInternalOffload,
    openRequisitionAlert: simulation.openRequisitionAlert,
    conflictAlert: simulation.conflictAlert,
  };

  const cynicSchema = `{"diagnosisTitle":"string","riskNarrative":"string","hardStop":"string","riskScore":"number"}`;
  const optimistSchema = `{"diagnosisTitle":"string","growthNarrative":"string","upsideMove":"string","confidence":"number"}`;
  const orchestratorSchema = `{
    "diagnosisTitle":"string",
    "orchestratorSynthesis":"string",
    "executiveSummary":"string",
    "decision":"string",
    "recommendedOwner":"string",
    "nextActions":["string","string","string"]
  }`;

  try {
    const cynic = await callGroqJson(
      [
        {
          role: "system",
          content:
            "You are THE CYNIC (Risk Agent). Focus only on downside risk, burnout propagation, and attrition. " +
            "Be specific to employee metrics. Return strict JSON only.",
        },
        { role: "user", content: `Simulation:\n${JSON.stringify(payload, null, 2)}\nSchema:\n${cynicSchema}` },
      ],
      cynicSchema,
      { temperature: 0.2, maxTokens: 420 }
    );

    const optimist = await callGroqJson(
      [
        {
          role: "system",
          content:
            "You are THE OPTIMIST (Growth Agent). Focus on potential, skill leverage, and feasible recovery paths. " +
            "Be specific to employee and capacity data. Return strict JSON only.",
        },
        { role: "user", content: `Simulation:\n${JSON.stringify(payload, null, 2)}\nSchema:\n${optimistSchema}` },
      ],
      optimistSchema,
      { temperature: 0.25, maxTokens: 420 }
    );

    const orchestrator = await callGroqJson(
      [
        {
          role: "system",
          content:
            "You are THE ORCHESTRATOR (Final Output Agent). Read both agent notes and synthesize a middle-ground, " +
            "employee-specific decision. If senderAssessment.senderEligible=false, decision must state no offload needed. " +
            "If blockInternalOffload=true, you must require open requisition.",
        },
        {
          role: "user",
          content:
            `Simulation:\n${JSON.stringify(payload, null, 2)}\n\n` +
            `Cynic Note:\n${JSON.stringify(cynic, null, 2)}\n\n` +
            `Optimist Note:\n${JSON.stringify(optimist, null, 2)}\n\n` +
            `Schema:\n${orchestratorSchema}`,
        },
      ],
      orchestratorSchema,
      { temperature: 0.15, maxTokens: 620 }
    );

    return {
      diagnosisTitle: toReadableText(orchestrator.diagnosisTitle, "Balanced Capacity Realignment"),
      cynicNote: toReadableText(cynic.riskNarrative, "Risk note unavailable."),
      optimistNote: toReadableText(optimist.growthNarrative, "Growth note unavailable."),
      orchestratorSynthesis: toReadableText(orchestrator.orchestratorSynthesis, "Synthesis unavailable."),
      executiveSummary: toReadableText(orchestrator.executiveSummary, "Workload simulation completed."),
      decision: toReadableText(orchestrator.decision, simulation.blockInternalOffload ? "Open requisition required." : "Proceed with controlled internal redistribution."),
      recommendedOwner: toReadableText(orchestrator.recommendedOwner, simulation.targetEmployee.managerName || "Manager"),
      nextActions: Array.isArray(orchestrator.nextActions) ? orchestrator.nextActions.map((x) => toReadableText(x, "")).filter(Boolean).slice(0, 4) : [],
      llmUsed: true,
      councilMode: "llm-council",
    };
  } catch (_err) {
    return buildWorkloadCouncilFallback(simulation);
  }
}

function toReadableText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    const s = value.trim();
    return s || fallback;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return fallback;
    if (value.every((x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean")) {
      return value.map((x) => String(x)).join(", ");
    }
    return value
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object") {
          return Object.entries(x).map(([k, v]) => `${k}: ${toReadableText(v, "N/A")}`).join(" | ");
        }
        return String(x);
      })
      .join("\n");
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${toReadableText(v, "N/A")}`)
      .join("\n");
  }
  return fallback;
}

function synthesizeAnalysisDefaults(context, predictiveSignals, ruleSignals) {
  const employeeRows = context.employeeRows || [];
  const managerRows = context.managerRows || [];
  const sentimentSeries = employeeRows
    .map((r) => ({ quarter: r.quarter, sentiment: Number(r.sentimentScore) }))
    .filter((x) => Number.isFinite(x.sentiment))
    .map((x) => `${x.quarter}:${x.sentiment}`);

  const kpiSeries = employeeRows
    .map((r) => ({ quarter: r.quarter, kpi: toKpiPercent(r.kpiScore) }))
    .filter((x) => Number.isFinite(x.kpi))
    .map((x) => `${x.quarter}:${x.kpi}`);

  const collaborationSeries = employeeRows
    .map((r) => ({ quarter: r.quarter, c: Number(r.collaborationIndex) }))
    .filter((x) => Number.isFinite(x.c))
    .map((x) => `${x.quarter}:${x.c}`);

  const matrixRows = []
    .concat(
      (predictiveSignals.highPerformanceHighRisk || []).slice(0, 6).map((r) =>
        `| ${r.employeeName} | High Performance, High Risk | KPI ${r.averageKpi}, Flight ${r.latestFlightRisk}, Sentiment ${r.sentimentStart} -> ${r.sentimentEnd} |`
      )
    )
    .concat(
      (predictiveSignals.forceMultipliers || []).slice(0, 6).map((r) =>
        `| ${r.employeeName} | Force Multiplier | Collaboration ${r.latestCollaboration}, KPI ${r.kpiStart} -> ${r.kpiEnd} |`
      )
    );
  const riskSuccessMatrixTable =
    `| Employee | Category | Evidence |\n|---|---|---|\n${matrixRows.join("\n") || "| None | N/A | No qualifying signals |"}`;

  const managerCalibrationSummary =
    (predictiveSignals.managerCalibration || [])
      .map((m) => `${m.managerName}: Avg KPI ${m.averageKpi}, Avg Potential ${m.averagePotentialRating}, N=${m.evaluations}`)
      .join("\n") || "Calibration unavailable.";

  const strategicRecommendation2027 =
    `Promote Next: ${(predictiveSignals.forceMultipliers || [])[0]?.employeeName || "TBD after Q1 2027 data"}. ` +
    `Stay Interview Priority: ${((predictiveSignals.highPerformanceHighRisk || [])[0]?.employeeName || (predictiveSignals.criticalSrsRisk || [])[0]?.employeeName || "No critical risk detected")}.`;

  return {
    employeeOverview:
      `${context.employeeName} (${employeeRows[0]?.role || "Role N/A"}) under ${context.managerName}. ` +
      `KPI series: ${kpiSeries.join(", ") || "N/A"}. Sentiment series: ${sentimentSeries.join(", ") || "N/A"}.`,
    kpiVariation:
      kpiSeries.join(", ") || "No KPI series available.",
    peerViewOverall:
      `Dataset has no explicit peer_feedback field in updated schema. Proxy via sentiment/collaboration: ` +
      `${sentimentSeries.join(", ") || "N/A"} | Collaboration: ${collaborationSeries.join(", ") || "N/A"}.`,
    improvementTrend:
      `KPI: ${kpiSeries.join(" -> ") || "N/A"}; Sentiment: ${sentimentSeries.join(" -> ") || "N/A"}; Collaboration: ${collaborationSeries.join(" -> ") || "N/A"}.`,
    managerOverallTake:
      managerRows
        .filter((r) => r.employeeName === context.employeeName)
        .map((r) => `[${r.quarter}] ${r.managerNotes || "N/A"}`)
        .join(" ") || "No manager notes found.",
    trajectoryPrediction:
      (predictiveSignals.highPerformanceHighRisk || []).some((r) => r.employeeName === context.employeeName)
        ? "Strong performer with retention risk; prioritize stay interview and workload calibration."
        : "Stable trajectory; continue development plan and role-scope expansion.",
    managerPattern:
      `Promotion anomalies: ${(predictiveSignals.promotionAnomalies || []).length}; ` +
      `manager strictness baseline built across ${(predictiveSignals.managerCalibration || []).length} managers.`,
    managerBiasReport:
      `Sentiment/manager disconnects: ${(predictiveSignals.sentimentManagerDisconnects || []).length}. ` +
      `Rule contradictions: ${(ruleSignals.contradictions || []).length}.`,
    riskSuccessMatrixTable,
    managerCalibrationSummary,
    strategicRecommendation2027,
  };
}

function normalizeAnalysisResult(analysis, context, predictiveSignals, ruleSignals) {
  const defaults = synthesizeAnalysisDefaults(context, predictiveSignals, ruleSignals);
  const normalized = { ...analysis };
  const textFields = [
    "employeeOverview",
    "kpiVariation",
    "peerViewOverall",
    "improvementTrend",
    "managerOverallTake",
    "trajectoryPrediction",
    "managerPattern",
    "managerBiasReport",
    "riskSuccessMatrixTable",
    "managerCalibrationSummary",
    "strategicRecommendation2027",
  ];
  textFields.forEach((key) => {
    normalized[key] = toReadableText(normalized[key], defaults[key] || "N/A");
    if (!normalized[key] || normalized[key] === "N/A") normalized[key] = defaults[key] || "N/A";
  });
  if (!Array.isArray(normalized.biasFlags)) normalized.biasFlags = [];
  normalized.biasFlags = normalized.biasFlags.map((x) => toReadableText(x, "")).filter(Boolean);
  return normalized;
}

function inferPrimaryBlockerRuleBased(employeeRows) {
  const sorted = [...employeeRows].sort((a, b) => getQuarterSortKey(a.quarter) - getQuarterSortKey(b.quarter));
  const latest = sorted[sorted.length - 1] || {};
  const first = sorted[0] || {};
  const latestKpi = toKpiPercent(latest.kpiScore);
  const latestSentiment = Number(latest.sentimentScore);
  const latestCollab = Number(latest.collaborationIndex);
  const latestFlight = Number(latest.flightRiskProbability);
  const latestResilience = Number(latest.resilienceScore);
  const maxSkill = Math.max(...Object.values(latest.skillProficiency || {}).map((v) => Number(v)).filter((n) => Number.isFinite(n)), -Infinity);
  const minSkill = Math.min(...Object.values(latest.skillProficiency || {}).map((v) => Number(v)).filter((n) => Number.isFinite(n)), Infinity);
  const kpiStart = toKpiPercent(first.kpiScore);
  const sentimentStart = Number(first.sentimentScore);
  const notesText = sorted.map((r) => r.managerNotes || "").join(" ").toLowerCase();
  const kpis = sorted.map((r) => toKpiPercent(r.kpiScore)).filter((n) => Number.isFinite(n));
  const hasStableKpi2Quarters =
    kpis.length >= 2 &&
    kpis.some((v, i) => i > 0 && Math.abs(v - kpis[i - 1]) <= 3);
  const positiveNotes = scoreManagerNotePositivity(notesText) >= 1;

  // Hard-threshold diagnostic framework (no generic diagnosis allowed)
  if (Number.isFinite(latestSentiment) && latestSentiment < 0.5 && Number.isFinite(latestKpi) && latestKpi > 100) {
    return "Scissors Pattern Burnout (Unsustainable Velocity)";
  }
  if (Number.isFinite(maxSkill) && maxSkill >= 10 && hasStableKpi2Quarters) {
    return "Promotion Ceiling (Stagnation / Under-utilization)";
  }
  if (Number.isFinite(latestCollab) && latestCollab < 0.4 && Number.isFinite(latestKpi) && latestKpi > 95) {
    return "Silo Risk (Knowledge Isolation)";
  }
  if (positiveNotes && Number.isFinite(latestSentiment) && latestSentiment < 0.6) {
    return "Management Blindness (Narrative vs Data Gap)";
  }

  if (Number.isFinite(maxSkill) && maxSkill >= 10 && Number.isFinite(latestSentiment) && latestSentiment < 0.5) {
    return "Curse of Competence (Over-reliance)";
  }
  if (Number.isFinite(kpiStart) && Number.isFinite(latestKpi) && Number.isFinite(sentimentStart) && Number.isFinite(latestSentiment) && latestKpi > kpiStart && latestSentiment < sentimentStart) {
    if (Number.isFinite(latestFlight) && latestFlight > 0.45) return "Imminent Burnout (Scissors Effect)";
    return "Unsustainable Velocity (Scissors Effect)";
  }
  if (Number.isFinite(latestKpi) && latestKpi > 90 && Number.isFinite(latestCollab) && latestCollab < 0.3) {
    return "Ghost Worker (Knowledge Silo / Isolation)";
  }
  if (Number.isFinite(latestResilience) && latestResilience < 5 && /(delay|red tape|approval|waiting)/i.test(notesText)) {
    return "Process Friction (Institutional Bureaucracy)";
  }
  if (Number.isFinite(latestKpi) && latestKpi < 80 && Number.isFinite(maxSkill) && maxSkill >= 9 && Number.isFinite(minSkill) && minSkill <= 4) {
    return "Mismatched Load (Role-Skill Mismatch)";
  }
  if (Number.isFinite(maxSkill) && maxSkill >= 10 && Number.isFinite(latestKpi) && latestKpi >= 95 && Number.isFinite(latestSentiment) && latestSentiment <= 0.6) {
    return "Promotion Ceiling (Under-utilization / Stagnation)";
  }
  if (Number.isFinite(latestCollab) && latestCollab > 0.85 && Number.isFinite(latestKpi) && latestKpi > 95 && Number.isFinite(latestSentiment) && latestSentiment < 0.6) {
    return "Emotional Labor Tax (Team Glue Burnout)";
  }
  return "Multi-Factor Crash (Composite Pressure)";
}

function buildRecoveryRoadmapForBlocker(blocker, employeeName, metrics = {}) {
  const lowResilience = Number.isFinite(Number(metrics.resilienceEnd)) && Number(metrics.resilienceEnd) < 5;
  if (blocker.includes("Ghost Worker")) {
    return [
      "Assign mentor responsibility for one active project to force knowledge sharing.",
      "Create weekly 30-min documentation handoff sessions with a backup owner.",
      "Set collaboration KPI target increase for next 30 days."
    ];
  }
  if (blocker.includes("Promotion Ceiling")) {
    if (lowResilience) {
      return [
        "Stop 50% of current maintenance/BAU load for the next 30 days before assigning any strategic initiative.",
        "Introduce recovery buffer (no new cross-team ownership) for first 2 weeks with weekly resilience checks.",
        "Then phase in one strategic task only after resilience trend improves."
      ];
    }
    return [
      "Run immediate growth-path discussion with manager within 7 days.",
      "Assign one cross-department strategic initiative with executive visibility.",
      "Define next-level role criteria and milestone checkpoints for 30 days."
    ];
  }
  if (blocker.includes("Process Friction")) {
    return [
      "Manager takes over administrative approval follow-ups for 30 days.",
      "Escalate top 3 recurring red-tape blockers to HR Ops for fast-track.",
      "Add weekly unblock-review and track cycle-time reduction."
    ];
  }
  if (blocker.includes("Mismatched Load")) {
    return [
      "Reduce client-facing/presentation duties for 30 days.",
      "Shift employee to technical-delivery dominant task allocation.",
      "Pair with communication coach for targeted improvement plan."
    ];
  }
  if (blocker.includes("Scissors") || blocker.includes("Burnout") || blocker.includes("Unsustainable")) {
    return [
      "Apply mandatory 3-day cool-down period this month.",
      "Reduce Q1 target load by 20% and rebalance critical tasks.",
      "Run weekly sentiment check-in with manager and HR partner."
    ];
  }
  return [
    "Schedule stay interview within 7 days.",
    "Remove one non-core task from employee workload immediately.",
    "Track sentiment + flight risk weekly for 30 days."
  ];
}

function buildManagerBriefingForBlocker(blocker, employeeName, metrics = {}) {
  const lowResilience = Number.isFinite(Number(metrics.resilienceEnd)) && Number(metrics.resilienceEnd) < 5;
  if (blocker.includes("Ghost Worker")) {
    return `Primary action: remove solo ownership pressure for ${employeeName}; assign a co-owner for key workflows immediately.`;
  }
  if (blocker.includes("Promotion Ceiling")) {
    if (lowResilience) {
      return `Primary action: remove 50% of maintenance work from ${employeeName} immediately; only then consider strategic growth work.`;
    }
    return `Primary action: remove repetitive BAU tasks from ${employeeName}; allocate strategic cross-functional project ownership.`;
  }
  if (blocker.includes("Process Friction")) {
    return `Primary action: remove approval-chasing duties from ${employeeName}; manager should own escalations for 30 days.`;
  }
  if (blocker.includes("Mismatched Load")) {
    return `Primary action: remove high-stakes client presentation load from ${employeeName}; reassign to role-aligned experts.`;
  }
  if (blocker.includes("Scissors") || blocker.includes("Burnout") || blocker.includes("Unsustainable")) {
    return `Primary action: remove one high-intensity deliverable from ${employeeName}'s sprint and redistribute across team.`;
  }
  return `Primary action: remove one non-core responsibility from ${employeeName} to reduce load and monitor response.`;
}

function buildDiagnosisEvidenceRuleBased(employeeRows, primaryDiagnosis, secondaryFactor) {
  const sorted = [...employeeRows].sort((a, b) => getQuarterSortKey(a.quarter) - getQuarterSortKey(b.quarter));
  const latest = sorted[sorted.length - 1] || {};
  const first = sorted[0] || {};
  const kpiStart = toKpiPercent(first.kpiScore);
  const kpiEnd = toKpiPercent(latest.kpiScore);
  const sentimentStart = Number(first.sentimentScore);
  const sentimentEnd = Number(latest.sentimentScore);
  const resilienceEnd = Number(latest.resilienceScore);
  const collabEnd = Number(latest.collaborationIndex);
  const maxSkill = Math.max(...Object.values(latest.skillProficiency || {}).map((v) => Number(v)).filter((n) => Number.isFinite(n)), -Infinity);
  const notesPositivity = scoreManagerNotePositivity(sorted.map((r) => r.managerNotes || "").join(" "));

  const lines = [
    `Q1->Q4 KPI: ${Number.isFinite(kpiStart) ? kpiStart : "N/A"} -> ${Number.isFinite(kpiEnd) ? kpiEnd : "N/A"}`,
    `Q1->Q4 Sentiment: ${Number.isFinite(sentimentStart) ? sentimentStart : "N/A"} -> ${Number.isFinite(sentimentEnd) ? sentimentEnd : "N/A"}`,
    `Latest Resilience: ${Number.isFinite(resilienceEnd) ? resilienceEnd : "N/A"}`,
    `Latest Collaboration: ${Number.isFinite(collabEnd) ? collabEnd : "N/A"}`,
    `Max Skill (latest quarter): ${Number.isFinite(maxSkill) && maxSkill > -Infinity ? maxSkill : "N/A"}`,
    `Manager-notes positivity score: ${notesPositivity}`,
    `Diagnosis intersection: ${primaryDiagnosis} + ${secondaryFactor || "N/A"}`,
  ];
  return lines;
}

function inferSecondaryFactorRuleBased(employeeRows, primaryDiagnosis) {
  const sorted = [...employeeRows].sort((a, b) => getQuarterSortKey(a.quarter) - getQuarterSortKey(b.quarter));
  const latest = sorted[sorted.length - 1] || {};
  const latestKpi = toKpiPercent(latest.kpiScore);
  const latestCollab = Number(latest.collaborationIndex);
  const latestSentiment = Number(latest.sentimentScore);
  const notesText = sorted.map((r) => r.managerNotes || "").join(" ").toLowerCase();
  if (primaryDiagnosis.includes("Ghost Worker")) return "Low social integration and low documentation redundancy";
  if (primaryDiagnosis.includes("Promotion Ceiling")) return "Lack of role variety / insufficient complexity";
  if (primaryDiagnosis.includes("Process Friction")) return "Administrative overload due to red-tape dependencies";
  if (primaryDiagnosis.includes("Mismatched Load")) return "Communication-role misfit in current workload design";
  if (primaryDiagnosis.includes("Scissors") || primaryDiagnosis.includes("Burnout")) return "Team support deficit and unsustainable pacing";
  if (Number.isFinite(latestCollab) && latestCollab > 0.9 && Number.isFinite(latestSentiment) && latestSentiment < 0.6) return "Emotional labor tax";
  if (Number.isFinite(latestKpi) && latestKpi < 85 && /feedback|trust|attacked/i.test(notesText)) return "Psychological safety gap";
  return "Multi-factor pressure from workload, role clarity, and support constraints";
}

function inferSilentBlockerRuleBased(employeeRows, primaryDiagnosis, secondaryFactor) {
  const notes = employeeRows.map((r) => `[${r.quarter}] ${r.managerNotes || ""}`).join(" ").toLowerCase();
  if (/automation|system|ops|support/.test(notes)) {
    return "Likely carrying invisible system-support work beyond formal role scope.";
  }
  if (/mentor|training|help|team/.test(notes) && primaryDiagnosis.includes("Burnout")) {
    return "Likely covering team capability gaps without workload recognition.";
  }
  if (secondaryFactor.includes("Psychological safety")) {
    return "Employee may have stopped giving honest feedback due to trust breakdown.";
  }
  if (primaryDiagnosis.includes("Promotion Ceiling")) {
    return "Employee likely sees no credible advancement path in current role design.";
  }
  return "Untracked hidden work and expectation ambiguity likely driving disengagement.";
}

function buildStopStartContinuePlan(primaryDiagnosis, employeeName) {
  if (primaryDiagnosis.includes("Dual-State Conflict")) {
    return {
      stop: "Stop 50% of maintenance and reactive support workload immediately.",
      start: `Start recovery-first cadence for ${employeeName}; add strategic work only after resilience rebounds.`,
      continue: "Continue transparent check-ins with weekly resilience and sentiment tracking."
    };
  }
  if (primaryDiagnosis.includes("Ghost Worker")) {
    return {
      stop: "Stop assigning critical work to a single owner without backup.",
      start: `Start structured knowledge-transfer rituals with ${employeeName} as project mentor.`,
      continue: "Continue recognizing delivery quality while tracking collaboration uplift."
    };
  }
  if (primaryDiagnosis.includes("Promotion Ceiling")) {
    return {
      stop: "Stop repetitive low-complexity assignments.",
      start: `Start cross-functional strategic ownership for ${employeeName} with measurable impact.`,
      continue: "Continue performance recognition and transparent growth conversations."
    };
  }
  if (primaryDiagnosis.includes("Process Friction")) {
    return {
      stop: "Stop requiring employee-owned approval chasing.",
      start: "Start manager-owned escalation lane for process bottlenecks.",
      continue: "Continue weekly unblock reviews and cycle-time tracking."
    };
  }
  if (primaryDiagnosis.includes("Mismatched Load")) {
    return {
      stop: "Stop over-indexing on client-facing tasks for a technical specialist.",
      start: `Start role alignment by shifting ${employeeName} toward technical execution priorities.`,
      continue: "Continue targeted communication coaching with lower-stakes exposure."
    };
  }
  return {
    stop: "Stop assigning sustained high-intensity load without recovery windows.",
    start: `Start 30-day recovery cadence for ${employeeName} with weekly sentiment checks.`,
    continue: "Continue transparent manager support and workload reprioritization."
  };
}

function buildEmployeeDiagnosticRecord(employeeName, rows) {
  const sorted = [...rows].sort((a, b) => getQuarterSortKey(a.quarter) - getQuarterSortKey(b.quarter));
  const latest = sorted[sorted.length - 1] || {};
  const first = sorted[0] || {};
  const kpiStart = toKpiPercent(first.kpiScore);
  const kpiEnd = toKpiPercent(latest.kpiScore);
  const sentimentStart = Number(first.sentimentScore);
  const sentimentEnd = Number(latest.sentimentScore);
  const collabEnd = Number(latest.collaborationIndex);
  const resilienceEnd = Number(latest.resilienceScore);
  const flightEnd = Number(latest.flightRiskProbability);
  const maxSkill = Math.max(...Object.values(latest.skillProficiency || {}).map((v) => Number(v)).filter((n) => Number.isFinite(n)), -Infinity);
  let primary = inferPrimaryBlockerRuleBased(sorted);
  const metrics = {
    kpiStart: Number.isFinite(kpiStart) ? kpiStart : null,
    kpiEnd: Number.isFinite(kpiEnd) ? kpiEnd : null,
    sentimentStart: Number.isFinite(sentimentStart) ? sentimentStart : null,
    sentimentEnd: Number.isFinite(sentimentEnd) ? sentimentEnd : null,
    collaborationEnd: Number.isFinite(collabEnd) ? collabEnd : null,
    resilienceEnd: Number.isFinite(resilienceEnd) ? resilienceEnd : null,
    flightRiskEnd: Number.isFinite(flightEnd) ? flightEnd : null,
    maxSkillEnd: Number.isFinite(maxSkill) && maxSkill > -Infinity ? maxSkill : null,
  };
  const resilienceSkillConflict =
    Number.isFinite(metrics.maxSkillEnd) &&
    metrics.maxSkillEnd >= 10 &&
    Number.isFinite(metrics.resilienceEnd) &&
    metrics.resilienceEnd < 5;
  if (primary.includes("Promotion Ceiling") && resilienceSkillConflict) {
    primary = "Dual-State Conflict (Promotion Ceiling + Burnout Vulnerability)";
  }
  const secondary = inferSecondaryFactorRuleBased(sorted, primary);
  const silent = inferSilentBlockerRuleBased(sorted, primary, secondary);
  const ssc = buildStopStartContinuePlan(primary, employeeName);
  const roadmap = buildRecoveryRoadmapForBlocker(primary, employeeName, metrics);
  const briefing = buildManagerBriefingForBlocker(primary, employeeName, metrics);
  const evidence = buildDiagnosisEvidenceRuleBased(sorted, primary, secondary);
  const riskFlag =
    (Number.isFinite(sentimentEnd) && sentimentEnd < 0.6) ||
    (Number.isFinite(flightEnd) && flightEnd > 0.35) ||
    (Number.isFinite(kpiStart) && Number.isFinite(kpiEnd) && Number.isFinite(sentimentStart) && Number.isFinite(sentimentEnd) && kpiEnd > kpiStart && sentimentEnd < sentimentStart);

  const managerPositivityScore = scoreManagerNotePositivity(sorted.map((r) => r.managerNotes || "").join(" "));
  const managerAwarenessAlert =
    Number.isFinite(metrics.resilienceEnd) &&
    metrics.resilienceEnd < 2 &&
    managerPositivityScore >= 2
      ? "Warning: Manager seems unaware of employee exhaustion levels."
      : "";

  return {
    employeeName,
    managerName: latest.managerName || "",
    role: latest.role || "",
    quarterSpan: `${first.quarter || "Q1"} -> ${latest.quarter || "Q4"}`,
    metrics,
    riskFlag,
    primaryDiagnosis: primary,
    secondaryContributingFactor: secondary,
    silentBlocker: silent,
    diagnosisEvidence: evidence,
    managerPositivityScore,
    managerAwarenessAlert,
    stopStartContinue: ssc,
    primaryBlocker: primary,
    thirtyDayRecoveryRoadmap: roadmap,
    managerBriefing: briefing,
  };
}

function buildInternalInvestigationFallback(selectedRows, allRows, selectedEmployee, selectedManager) {
  const sorted = [...selectedRows].sort((a, b) => getQuarterSortKey(a.quarter) - getQuarterSortKey(b.quarter));
  const latest = sorted[sorted.length - 1] || {};
  const employeeName = selectedEmployee || latest.employeeName || "Employee";
  const managerName = selectedManager || latest.managerName || "";
  const role = latest.role || "";
  const kpi = toKpiPercent(latest.kpiScore);
  const srsObj = calculateSyntheticResilienceFromRow(latest);
  const srs = Number(srsObj.srs);
  const ei = (Number.isFinite(kpi) ? (kpi * 0.4) : 0) + ((10 - (Number.isFinite(srs) ? srs : 10)) * 0.6);
  const positivity = managerNotesPositivityBucket(sorted.map((r) => String(r.managerNotes || "")).join(" "));
  const blindspotDetected = positivity >= 2 && Number.isFinite(srs) && srs < 4;
  const needsRelief = Number.isFinite(kpi) && Number.isFinite(srs) && kpi > 90 && srs < 4;
  const snapshots = buildLatestEmployeeSnapshots(allRows);
  const targetSnapshot = snapshots.find((s) => String(s.employeeName || "").toLowerCase() === String(employeeName).toLowerCase());
  const peers = snapshots
    .filter((p) => String(p.employeeName || "").toLowerCase() !== String(employeeName).toLowerCase())
    .filter((p) => String(p.managerName || "").toLowerCase() === String(managerName || "").toLowerCase())
    .filter((p) => Number(p.resilience) >= 7 && toKpiPercent(p.kpi) < 105)
    .map((p) => {
      const roleMatch = String(p.role || "").toLowerCase() === String(role || "").toLowerCase() ? 10 : 6;
      const pcs = (Number(p.resilience) * 0.5) + (roleMatch * 0.5);
      return { ...p, pcs: Number(pcs.toFixed(2)), roleMatch };
    })
    .sort((a, b) => b.pcs - a.pcs);
  const best = peers[0];

  const recommendation = !needsRelief
    ? `${employeeName} does not currently require workload delegation.`
    : best
      ? best.employeeName
      : "RECOURSE TO EXTERNAL CONTRACTOR: Team resilience floor is too low for internal delegation.";

  const taskType = !needsRelief
    ? "No transfer required"
    : best
      ? (String(best.role || "").toLowerCase() === String(role || "").toLowerCase() ? "Technical + non-technical split" : "Non-technical/process transfer")
      : "External temporary technical support";

  const justification = !needsRelief
    ? `Latest KPI ${Number.isFinite(kpi) ? kpi : "N/A"} and SRS ${Number.isFinite(srs) ? srs : "N/A"} do not indicate critical relief need.`
    : best
      ? `${best.employeeName} passes hard safety gate (SRS ${best.resilience}, KPI ${toKpiPercent(best.kpi)}), with PCS ${best.pcs}.`
      : "No internal peer satisfies SRS >= 7 and KPI < 105 simultaneously.";

  const report = {
    employeeName,
    managerName,
    role,
    srs,
    srsCategory: srsObj.category,
    riskFlag: Boolean(needsRelief),
    clinicalDiagnosis: needsRelief ? "Burnout Paradox (High Output, Low Sustainability)" : "Sustainable Stabilizer",
    riskExhaustionIndex: Number(ei.toFixed(2)),
    silentBlocker: needsRelief ? "Sustained delivery with depleted resilience buffer." : "No critical blocker detected.",
    sustainabilityAnalysis: needsRelief
      ? `Current delivery is not sustainable: KPI ${Number.isFinite(kpi) ? kpi : "N/A"} with SRS ${Number.isFinite(srs) ? srs : "N/A"}.`
      : `Performance appears sustainable at current load with SRS ${Number.isFinite(srs) ? srs : "N/A"}.`,
    managerCalibration: blindspotDetected
      ? "Blindspot Detected: manager tone is positive while AI resilience signal is low."
      : "Manager notes and AI risk signal are reasonably aligned.",
    recommendation,
    taskType,
    justification,
    peerOptions: peers.slice(0, 3).map((p) => ({
      employeeName: p.employeeName,
      managerName: p.managerName,
      role: p.role,
      srs: Number(p.resilience),
      kpi: toKpiPercent(p.kpi),
      skillMatch: p.roleMatch,
      pcs: p.pcs,
    })),
    diagnostics: {
      kpiLatest: Number.isFinite(kpi) ? kpi : null,
      managerPositivity: positivity,
      blindspotDetected,
      targetSkill: targetSnapshot?.avgSkill ?? null,
    },
  };

  return {
    generatedBy: "fallback_rules",
    summary: `Internal AI audit generated for ${employeeName}.`,
    employeeInvestigations: [report],
    highRiskEmployees: report.riskFlag ? [{ employeeName }] : [],
  };
}

async function analyzeInternalInvestigationWithLlm(selectedRows, allRows, selectedEmployee, selectedManager) {
  const sorted = [...selectedRows].sort((a, b) => getQuarterSortKey(a.quarter) - getQuarterSortKey(b.quarter));
  const latest = sorted[sorted.length - 1] || {};
  const employeeName = selectedEmployee || latest.employeeName || "";
  const managerName = selectedManager || latest.managerName || "";
  const role = latest.role || "";
  const srsByQuarter = sorted.map((r) => ({
    quarter: r.quarter,
    srs: calculateSyntheticResilienceFromRow(r).srs,
    category: calculateSyntheticResilienceFromRow(r).category,
    kpi: toKpiPercent(r.kpiScore),
    sentiment: Number(r.sentimentScore),
    collaboration: Number(r.collaborationIndex),
    flightRisk: Number(r.flightRiskProbability),
    managerNotes: String(r.managerNotes || "").slice(0, 200),
  }));
  const latestSrsObj = calculateSyntheticResilienceFromRow(latest);
  const latestSrs = Number(latestSrsObj.srs);
  const latestKpi = toKpiPercent(latest.kpiScore);
  const exhaustionIndex = (Number.isFinite(latestKpi) ? (latestKpi * 0.4) : 0) + ((10 - (Number.isFinite(latestSrs) ? latestSrs : 10)) * 0.6);
  const managerPositivityScore = managerNotesPositivityBucket(sorted.map((r) => String(r.managerNotes || "")).join(" "));
  const blindspotDetected = managerPositivityScore >= 2 && Number.isFinite(latestSrs) && latestSrs < 4;
  const needsRelief = Number.isFinite(latestKpi) && Number.isFinite(latestSrs) && latestKpi > 90 && latestSrs < 4;

  const snapshots = buildLatestEmployeeSnapshots(allRows);
  const sameTeam = snapshots
    .filter((p) => String(p.employeeName || "").toLowerCase() !== String(employeeName).toLowerCase())
    .filter((p) => String(p.managerName || "").toLowerCase() === String(managerName || "").toLowerCase());
  const peerCandidates = sameTeam
    .map((p) => {
      const peerKpi = toKpiPercent(p.kpi);
      const sameRole = String(p.role || "").toLowerCase() === String(role || "").toLowerCase();
      const skillMatch = sameRole ? 10 : 6;
      const passesGate = Number(p.resilience) >= 7 && Number.isFinite(peerKpi) && peerKpi < 105;
      const pcs = (Number(p.resilience) * 0.5) + (skillMatch * 0.5);
      return {
        employeeName: p.employeeName,
        managerName: p.managerName,
        role: p.role,
        srs: Number(p.resilience),
        kpi: peerKpi,
        skillMatch,
        pcs: Number(pcs.toFixed(2)),
        passesGate,
      };
    })
    .sort((a, b) => b.pcs - a.pcs);
  const eligiblePeers = peerCandidates.filter((p) => p.passesGate).slice(0, 5);

  const schema =
    "{ summary: string, report: { clinical_diagnosis: string, risk_exhaustion_index: number, silent_blocker: string, sustainability_analysis: string, manager_calibration: string, recommendation: string, task_type: string, justification: string } }";

  const parsed = await callGroqJson(
    [
      {
        role: "system",
        content:
          "You are a Senior People Analytics Scientist.\n" +
          "Produce only strict JSON.\n" +
          "Use exactly this framework:\n" +
          "PHASE 1 INTERNAL AI AUDIT: Diagnostic State, Exhaustion Index, Silent Blocker, Managerial Calibration.\n" +
          "PHASE 2 WORKLOAD REBALANCING: if relief needed, choose receiver from hard gate only (SRS>=7 and KPI<105), PCS=(SRS*0.5)+(Skill_Match*0.5). If none, recommend external contractor.\n" +
          "Do not provide generic labels. Diagnosis must be specific and tied to numeric intersections.\n" +
          "Keep text concise and executive-ready.",
      },
      {
        role: "user",
        content:
          `Selected Employee: ${employeeName}\n` +
          `Manager: ${managerName}\n` +
          `Role: ${role}\n` +
          `SRS Formula already applied per quarter. Latest SRS=${Number.isFinite(latestSrs) ? latestSrs : "N/A"} (${latestSrsObj.category}).\n` +
          `EI Formula: (KPI*0.4)+((10-SRS)*0.6). Latest EI=${Number(exhaustionIndex.toFixed(2))}.\n` +
          `Manager positivity bucket=${managerPositivityScore}. Blindspot detected=${blindspotDetected}.\n` +
          `Needs relief gate (KPI>90 and SRS<4)=${needsRelief}.\n` +
          `Quarter Analytics:\n${JSON.stringify(srsByQuarter, null, 2)}\n` +
          `Peer Candidates (same team):\n${JSON.stringify(peerCandidates, null, 2)}\n` +
          "Return report card fields exactly per schema.",
      },
    ],
    schema,
    { temperature: 0.0, maxTokens: 620 }
  );

  const report = {
    employeeName,
    managerName,
    role,
    srs: latestSrs,
    srsCategory: latestSrsObj.category,
    riskFlag: Boolean(needsRelief),
    clinicalDiagnosis: String(parsed.report?.clinical_diagnosis || "").trim(),
    riskExhaustionIndex: Number.isFinite(Number(parsed.report?.risk_exhaustion_index))
      ? Number(parsed.report.risk_exhaustion_index)
      : Number(exhaustionIndex.toFixed(2)),
    silentBlocker: String(parsed.report?.silent_blocker || "").trim(),
    sustainabilityAnalysis: String(parsed.report?.sustainability_analysis || "").trim(),
    managerCalibration: String(parsed.report?.manager_calibration || "").trim(),
    recommendation: String(parsed.report?.recommendation || "").trim(),
    taskType: String(parsed.report?.task_type || "").trim(),
    justification: String(parsed.report?.justification || "").trim(),
    diagnostics: {
      kpiLatest: Number.isFinite(latestKpi) ? latestKpi : null,
      managerPositivity: managerPositivityScore,
      blindspotDetected,
      needsRelief,
    },
    peerOptions: eligiblePeers,
  };

  if (!report.clinicalDiagnosis) report.clinicalDiagnosis = needsRelief ? "Burnout Paradox (High Output, Low Sustainability)" : "Sustainable Stabilizer";
  if (!report.silentBlocker) report.silentBlocker = needsRelief ? "Sustained output despite resilience depletion." : "No critical blocker detected.";
  if (!report.sustainabilityAnalysis) report.sustainabilityAnalysis = needsRelief
    ? `Current output is unstable: KPI ${Number.isFinite(latestKpi) ? latestKpi : "N/A"} with SRS ${Number.isFinite(latestSrs) ? latestSrs : "N/A"}.`
    : `Performance remains sustainable at current load.`;
  if (!report.managerCalibration) report.managerCalibration = blindspotDetected
    ? "Blindspot Detected: manager tone appears positive while resilience signal is low."
    : "Manager narrative and AI risk signals are aligned.";
  if (!report.recommendation) {
    report.recommendation = needsRelief
      ? (eligiblePeers.length ? eligiblePeers[0].employeeName : "RECOURSE TO EXTERNAL CONTRACTOR: Team resilience floor is too low for internal delegation.")
      : `${employeeName} does not currently require workload delegation.`;
  }
  if (!report.taskType) {
    report.taskType = needsRelief
      ? (eligiblePeers.length ? "Technical/non-technical split based on role overlap" : "External temporary technical support")
      : "No transfer required";
  }
  if (!report.justification) {
    report.justification = needsRelief
      ? (eligiblePeers.length
        ? `${eligiblePeers[0].employeeName} satisfies SRS>=7 and KPI<105 safety gate with strong PCS.`
        : "No internal peer satisfies SRS>=7 and KPI<105 simultaneously.")
      : `Latest KPI/SRS profile does not indicate critical relief need.`;
  }

  return {
    generatedBy: "llm",
    summary: String(parsed.summary || "").trim() || `Internal AI audit generated for ${employeeName}.`,
    employeeInvestigations: [report],
    highRiskEmployees: report.riskFlag ? [{ employeeName }] : [],
  };
}

function escHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMatrixTableHtml(matrixText) {
  const lines = String(matrixText || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const tableLines = lines.filter((l) => l.startsWith("|") && l.endsWith("|"));
  if (tableLines.length < 2) return `<pre>${escHtml(matrixText || "No matrix data.")}</pre>`;
  const rows = tableLines
    .map((l) => l.slice(1, -1).split("|").map((c) => c.trim()))
    .filter((r) => r.length >= 3);
  if (!rows.length) return `<pre>${escHtml(matrixText || "No matrix data.")}</pre>`;
  const header = rows[0];
  const body = rows.slice(1).filter((r) => !r.every((c) => /^-+$/.test(c.replace(/\s+/g, ""))));
  const thead = `<thead><tr>${header.map((h) => `<th>${escHtml(h)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${escHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

function buildDashboardReportHtml(payload, options = {}) {
  const employeeLayout = payload.employeeLayout || {};
  const managerLayout = payload.managerLayout || {};
  const analysis = payload.analysis || {};
  const ruleSignals = payload.ruleSignals || {};
  const predictive = payload.predictiveSignals || {};
  const guardian = payload.talentGuardian || {};
  const alert = (guardian.alerts || []).find((a) => String(a.employeeName).toLowerCase() === String(employeeLayout.employeeName || "").toLowerCase());
  const quarterRows = (employeeLayout.quarterRecords || [])
    .map((r) =>
      `<tr>` +
      `<td>${escHtml(r.quarter)}</td>` +
      `<td>${escHtml(r.kpiScore)}</td>` +
      `<td>${escHtml(r.sentimentScore)}</td>` +
      `<td>${escHtml(r.collaborationIndex)}</td>` +
      `<td>${escHtml(r.flightRiskProbability)}</td>` +
      `<td>${escHtml(r.managerNotes)}</td>` +
      `</tr>`
    )
    .join("");

  const calibrationRows = (predictive.managerCalibration || [])
    .map((r) => `<tr><td>${escHtml(r.managerName)}</td><td>${escHtml(r.averageKpi)}</td><td>${escHtml(r.averagePotentialRating)}</td><td>${escHtml(r.evaluations)}</td></tr>`)
    .join("");

  const interventionHtml = alert
    ? `<h3>Talent Guardian Intervention (High Risk)</h3>
       <p><strong>Diagnosis:</strong> ${escHtml(alert.diagnosis)}</p>
       <p><strong>Resource Reallocation:</strong> ${escHtml(alert.interventionPackage?.resourceReallocation)}</p>
       <p><strong>30-Day Roadmap:</strong><br>${escHtml((alert.interventionPackage?.thirtyDayRoadmap || []).join("\n")).replace(/\n/g, "<br>")}</p>
       <p><strong>Stay Interview Questions:</strong><br>${escHtml((alert.interventionPackage?.stayInterviewScript || []).join("\n")).replace(/\n/g, "<br>")}</p>`
    : `<p><strong>Risk Status:</strong> This employee isn't flagged for high risk in current yearly model.</p>`;

  const autoprintScript = options.autoPrint
    ? `<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));</script>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>HR Analytics Report</title>
<style>
body{font-family:Arial,sans-serif;margin:20px;color:#111}
h1,h2,h3{margin:10px 0}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.card{border:1px solid #ccc;border-radius:8px;padding:12px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #bbb;padding:6px;vertical-align:top;text-align:left}
th{background:#f4f4f4}
pre{white-space:pre-wrap;font-size:12px;background:#fafafa;border:1px solid #ddd;padding:8px}
@media print {.grid{grid-template-columns:1fr}}
</style></head>
<body>
<h1>AI Performance Dashboard - Detailed Analytics Report</h1>
<p><strong>Employee:</strong> ${escHtml(employeeLayout.employeeName)} | <strong>Manager:</strong> ${escHtml(employeeLayout.managerName)} | <strong>Role:</strong> ${escHtml(employeeLayout.role)}</p>
<div class="grid">
  <div class="card">
    <h2>Employee Annual Analysis</h2>
    <p><strong>Overview:</strong> ${escHtml(analysis.employeeOverview)}</p>
    <p><strong>KPI Variation:</strong> ${escHtml(analysis.kpiVariation)}</p>
    <p><strong>Improvement Trend:</strong> ${escHtml(analysis.improvementTrend)}</p>
    <p><strong>Manager Take:</strong> ${escHtml(analysis.managerOverallTake)}</p>
    <p><strong>Trajectory:</strong> ${escHtml(analysis.trajectoryPrediction)}</p>
  </div>
  <div class="card">
    <h2>Manager + Bias Audit</h2>
    <p><strong>Pattern:</strong> ${escHtml(analysis.managerPattern)}</p>
    <p><strong>Bias Report:</strong> ${escHtml(analysis.managerBiasReport)}</p>
    <p><strong>Strategic Recommendation 2027:</strong> ${escHtml(analysis.strategicRecommendation2027)}</p>
    <p><strong>Predictive Snapshot:</strong> High Risk ${escHtml((predictive.highPerformanceHighRisk || []).length)} | Force Multipliers ${escHtml((predictive.forceMultipliers || []).length)} | Disconnects ${escHtml((predictive.sentimentManagerDisconnects || []).length)}</p>
  </div>
</div>
<div class="card"><h2>Quarterly Detail Table</h2>
<table><thead><tr><th>Quarter</th><th>KPI</th><th>Sentiment</th><th>Collaboration</th><th>Flight Risk</th><th>Manager Notes</th></tr></thead><tbody>${quarterRows || "<tr><td colspan='6'>No rows</td></tr>"}</tbody></table>
</div>
<div class="card"><h2>Risk/Success Matrix</h2>${renderMatrixTableHtml(analysis.riskSuccessMatrixTable)}</div>
<div class="card"><h2>Manager Calibration Summary</h2>
<table><thead><tr><th>Manager</th><th>Avg KPI</th><th>Avg Potential</th><th>N</th></tr></thead><tbody>${calibrationRows || "<tr><td colspan='4'>No rows</td></tr>"}</tbody></table>
<pre>${escHtml(analysis.managerCalibrationSummary || "")}</pre>
</div>
<div class="card">${interventionHtml}</div>
<div class="card"><h3>Rule Signals</h3><pre>${escHtml((ruleSignals.contradictions || []).join("\n") || "None")}</pre></div>
${autoprintScript}
</body></html>`;
}

function scoreTextPolarity(text) {
  const positive = ["excellent", "strong", "great", "improved", "reliable", "leadership", "mentor", "quality", "ownership"];
  const negative = ["not good", "poor", "weak", "arrogant", "aggressive", "emotional", "bossy", "lazy", "struggle", "lack", "inconsistent"];
  const source = String(text || "").toLowerCase();
  let score = 0;
  positive.forEach((w) => {
    if (source.includes(w)) score += 1;
  });
  negative.forEach((w) => {
    if (source.includes(w)) score -= 1;
  });
  return score;
}

function buildEmployeeLayout(context) {
  const rows = [...context.employeeRows].sort((a, b) => getQuarterSortKey(a.quarter) - getQuarterSortKey(b.quarter));
  const kpis = rows.map((r) => toKpiPercent(r.kpiScore)).filter((n) => Number.isFinite(n));
  const role = rows.map((r) => r.role).find(Boolean) || "";
  const managerName = rows.map((r) => r.managerName).find(Boolean) || context.managerName;
  const quarters = rows.map((r) => r.quarter).filter(Boolean);
  const firstKpi = kpis.length ? kpis[0] : null;
  const lastKpi = kpis.length ? kpis[kpis.length - 1] : null;
  const kpiTrend = (firstKpi !== null && lastKpi !== null) ? Number((lastKpi - firstKpi).toFixed(2)) : null;

  return {
    employeeName: context.employeeName,
    managerName,
    role,
    quartersAvailable: quarters,
    quarterRecords: rows,
    kpiAverage: kpis.length ? Number(average(kpis).toFixed(2)) : null,
    kpiTrend,
    promotedQuarters: rows.filter((r) => r.promoted === true).map((r) => r.quarter),
  };
}

function buildManagerLayout(context) {
  const rows = context.managerRows;
  const byEmployee = new Map();
  rows.forEach((r) => {
    if (!byEmployee.has(r.employeeName)) byEmployee.set(r.employeeName, []);
    byEmployee.get(r.employeeName).push(r);
  });

  const employeeSummaries = [...byEmployee.entries()]
    .map(([name, recs]) => {
      const sorted = [...recs].sort((a, b) => getQuarterSortKey(a.quarter) - getQuarterSortKey(b.quarter));
      const promotedCount = sorted.filter((r) => r.promoted === true).length;
      const avgKpi = average(sorted.map((r) => toKpiPercent(r.kpiScore)).filter((n) => Number.isFinite(n)));
      return {
        employeeName: name,
        role: sorted.map((r) => r.role).find(Boolean) || "",
        promotedCount,
        averageKpi: Number.isFinite(avgKpi) ? Number(avgKpi.toFixed(2)) : null,
        lastQuarter: sorted[sorted.length - 1]?.quarter || "",
      };
    })
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  const avgPotential = average(rows.map((r) => Number(r.potentialRating)).filter((n) => Number.isFinite(n)));
  const avgSentiment = average(rows.map((r) => Number(r.sentimentScore)).filter((n) => Number.isFinite(n)));

  return {
    managerName: context.managerName,
    employeesUnderManager: context.employeesUnderManager,
    employeeSummaries,
    stats: context.managerStats,
    averagePotentialRating: Number.isFinite(avgPotential) ? Number(avgPotential.toFixed(2)) : null,
    averageSentimentScore: Number.isFinite(avgSentiment) ? Number(avgSentiment.toFixed(2)) : null,
  };
}

function ruleBasedBiasAndPattern(context) {
  const rows = context.managerRows;
  const explicitBiasTerms = [
    "because she's a girl",
    "because he is a boy",
    "too emotional",
    "too aggressive",
    "young",
    "mature",
    "same background",
    "same role as me",
  ];
  const explicitFlags = [];
  rows.forEach((r) => {
    const combined = `${r.peerFeedback} ${r.managerNotes} ${r.reason}`.toLowerCase();
    explicitBiasTerms.forEach((term) => {
      if (combined.includes(term)) explicitFlags.push(`${r.quarter}:${r.employeeName}:${term}`);
    });
  });

  const contradictions = [];
  const promoted = rows.filter((r) => r.promoted === true);
  const notPromoted = rows.filter((r) => r.promoted === false);

  promoted.forEach((p) => {
    const pKpi = toKpiPercent(p.kpiScore);
    const pTone = scoreTextPolarity(`${p.peerFeedback} ${p.managerNotes} ${p.reason}`);
    notPromoted.forEach((n) => {
      if (String(n.quarter) !== String(p.quarter)) return;
      const nKpi = toKpiPercent(n.kpiScore);
      const nTone = scoreTextPolarity(`${n.peerFeedback} ${n.managerNotes} ${n.reason}`);
      if (Number.isFinite(pKpi) && Number.isFinite(nKpi) && pKpi + 8 < nKpi && pTone + 2 < nTone) {
        contradictions.push(
          `${p.quarter}: ${p.employeeName} promoted with weaker KPI/tone than ${n.employeeName} (not promoted)`
        );
      }
    });
  });

  const patternSummary = `Promotion rate ${context.managerStats.promotionRate}% (${context.managerStats.promotedCount}/${context.managerStats.totalEvaluations}).`;
  const biasSummary = contradictions.length || explicitFlags.length
    ? "Potential bias/consistency risks found."
    : "No strong deterministic bias signal found from rule checks.";

  return {
    patternSummary,
    biasSummary,
    contradictions,
    explicitFlags,
  };
}

async function analyzeYearlyWithLlm(context, policyText) {
  const schema =
    "{ employee_overview: string, kpi_variation: string, peer_view_overall: string, improvement_trend: string, manager_overall_take: string, trajectory_prediction: string, manager_pattern: string, manager_bias_report: string, risk_success_matrix_table: string, manager_calibration_summary: string, strategic_recommendation_2027: string, bias_flags: string[] }";

  const compactEmployeeRows = context.employeeRows.map((r) => ({
    quarter: r.quarter,
    employeeName: r.employeeName,
    role: r.role,
    kpiScore: r.kpiScore,
    peerFeedback: String(r.peerFeedback || "").slice(0, 150),
    managerNotes: String(r.managerNotes || "").slice(0, 150),
    promoted: r.promoted,
    reason: String(r.reason || "").slice(0, 170),
  }));
  const compactManagerRows = context.managerRows.map((r) => ({
    quarter: r.quarter,
    employeeName: r.employeeName,
    role: r.role,
    kpiScore: r.kpiScore,
    promoted: r.promoted,
    peerFeedback: String(r.peerFeedback || "").slice(0, 90),
    managerNotes: String(r.managerNotes || "").slice(0, 90),
    reason: String(r.reason || "").slice(0, 90),
  }));
  const ps = context.predictiveSignals || {};
  const managerRows = context.managerRows || [];
  const managerQuarterSummary = ["Q1", "Q2", "Q3", "Q4"].map((q) => {
    const rows = managerRows.filter((r) => String(r.quarter).toUpperCase() === q);
    const kpis = rows.map((r) => toKpiPercent(r.kpiScore)).filter((n) => Number.isFinite(n));
    const promoted = rows.filter((r) => r.promoted === true).length;
    const avgKpi = kpis.length ? Number(average(kpis).toFixed(2)) : null;
    return { quarter: q, evaluations: rows.length, promoted, avgKpi };
  });
  const globalSummary = {
    highPerformanceHighRisk: (ps.highPerformanceHighRisk || []).slice(0, 5),
    criticalSrsRisk: (ps.criticalSrsRisk || []).slice(0, 5),
    forceMultipliers: (ps.forceMultipliers || []).slice(0, 5),
    promotionAnomalies: (ps.promotionAnomalies || []).slice(0, 8),
    sentimentManagerDisconnects: (ps.sentimentManagerDisconnects || []).slice(0, 8),
    managerCalibration: (ps.managerCalibration || []).slice(0, 8),
    hardestManagerSignal: ps.hardestManagerSignal || null,
  };

  const primaryMessages = [
    {
      role: "system",
      content:
        "You are an HR annual performance and bias analyst. Return strict JSON only.\n" +
        "Use all 4 quarters, be objective, and provide evidence-backed conclusions.\n" +
        "Output must be compact and token-efficient: each field max 220 characters except risk_success_matrix_table (max 8 table rows).\n" +
        "Never add markdown fences, commentary, or extra keys.\n" +
        "For employee_overview and manager_overall_take include at least two concrete numbers from input.",
    },
    {
      role: "user",
      content:
        "Role: Senior People Analytics Scientist.\n" +
        "Task: Analyze 4-quarter performance for predictive and bias-detection audit.\n\n" +
        `Policy (compressed):\n${String(policyText || "N/A").slice(0, 500)}\n\n` +
        `Selected Manager: ${context.managerName}\n` +
        `Selected Employee: ${context.employeeName}\n\n` +
        `Employee Quarterly Data:\n${JSON.stringify(compactEmployeeRows, null, 2)}\n\n` +
        `Manager Team Sample Rows:\n${JSON.stringify(compactManagerRows.slice(0, 8), null, 2)}\n\n` +
        `Manager Quarter Summary:\n${JSON.stringify(managerQuarterSummary, null, 2)}\n\n` +
        `Manager Stats:\n${JSON.stringify(context.managerStats, null, 2)}\n\n` +
        `Global Predictive Summary:\n${JSON.stringify(globalSummary, null, 2)}\n\n` +
        "Required sections:\n" +
        "- employee_overview\n- kpi_variation\n- peer_view_overall\n- improvement_trend\n- manager_overall_take\n- trajectory_prediction\n- manager_pattern\n- manager_bias_report\n- risk_success_matrix_table\n- manager_calibration_summary\n- strategic_recommendation_2027\n- bias_flags",
    },
  ];

  let parsed;
  try {
    parsed = await callGroqJson(primaryMessages, schema, { temperature: 0.0, maxTokens: 1100 });
  } catch (_firstErr) {
    const lightMessages = [
      {
        role: "system",
        content:
          "Return strict compact JSON only for annual HR review. Keep each value short and numeric where possible.",
      },
      {
        role: "user",
        content:
          `Employee: ${context.employeeName} | Manager: ${context.managerName}\n` +
          `Quarterly employee rows: ${JSON.stringify(compactEmployeeRows)}\n` +
          `Manager summary: ${JSON.stringify(managerQuarterSummary)}\n` +
          `Predictive summary: ${JSON.stringify(globalSummary)}\n` +
          `Schema: ${schema}`,
      },
    ];
    try {
      parsed = await callGroqJson(lightMessages, schema, { temperature: 0.0, maxTokens: 700 });
    } catch (_secondErr) {
      // Final compact LLM attempt before full deterministic fallback at caller level.
      parsed = await callGroqJson(
        [
          { role: "system", content: "Return only strict compact JSON with all schema keys present." },
          {
            role: "user",
            content:
              `Selected ${context.employeeName} under ${context.managerName}. ` +
              `Use this summary only: ${JSON.stringify({ employee: compactEmployeeRows, managerQuarterSummary, globalSummary, managerStats: context.managerStats })}. ` +
              `Schema: ${schema}`,
          },
        ],
        schema,
        { temperature: 0.0, maxTokens: 600 }
      );
    }
  }

  return {
    employeeOverview: parsed.employee_overview,
    kpiVariation: parsed.kpi_variation,
    peerViewOverall: parsed.peer_view_overall,
    improvementTrend: parsed.improvement_trend,
    managerOverallTake: parsed.manager_overall_take,
    trajectoryPrediction: parsed.trajectory_prediction,
    managerPattern: parsed.manager_pattern,
    managerBiasReport: parsed.manager_bias_report,
    riskSuccessMatrixTable: parsed.risk_success_matrix_table,
    managerCalibrationSummary: parsed.manager_calibration_summary,
    strategicRecommendation2027: parsed.strategic_recommendation_2027,
    biasFlags: Array.isArray(parsed.bias_flags) ? parsed.bias_flags.map((x) => String(x).trim()).filter(Boolean) : [],
  };
}

function analyzeYearlyFallback(context) {
  const employeeLayout = buildEmployeeLayout(context);
  const managerLayout = buildManagerLayout(context);
  const ruleSignals = ruleBasedBiasAndPattern(context);
  const predictive = context.predictiveSignals || buildPredictiveAuditSignals(context);

  const kpiParts = employeeLayout.quarterRecords
    .map((r) => `${r.quarter}: ${r.kpiScore || "N/A"}`)
    .join(", ");

  const peerCombined = employeeLayout.quarterRecords
    .map((r) => `[${r.quarter}] ${r.peerFeedback || "N/A"}`)
    .join(" ");

  const managerCombined = employeeLayout.quarterRecords
    .map((r) => `[${r.quarter}] ${r.managerNotes || "N/A"}`)
    .join(" ");

  const trendText = employeeLayout.kpiTrend === null
    ? "Insufficient KPI continuity across all quarters."
    : employeeLayout.kpiTrend >= 0
      ? `KPI shows an improving trend of +${employeeLayout.kpiTrend} points from first to last quarter.`
      : `KPI shows a declining trend of ${employeeLayout.kpiTrend} points from first to last quarter.`;

  const trajectory = employeeLayout.kpiTrend !== null && employeeLayout.kpiTrend > 0
    ? "If current progression continues, the employee is likely to sustain stronger outcomes next year with focused behavior development."
    : "Future trajectory is mixed; improvement depends on closing behavior and collaboration gaps noted in reviews.";

  const matrixRows = []
    .concat(
      (predictive.highPerformanceHighRisk || []).slice(0, 6).map((r) =>
        `| ${r.employeeName} | High Performance, High Risk | KPI ${r.averageKpi}, Flight ${r.latestFlightRisk}, Sentiment ${r.sentimentStart} -> ${r.sentimentEnd} |`
      )
    )
    .concat(
      (predictive.forceMultipliers || []).slice(0, 6).map((r) =>
        `| ${r.employeeName} | Force Multiplier | Collaboration ${r.latestCollaboration}, KPI ${r.kpiStart} -> ${r.kpiEnd} |`
      )
    );
  const riskSuccessMatrixTable =
    `| Employee | Category | Evidence |\n|---|---|---|\n${matrixRows.join("\n") || "| None | N/A | No qualifying signals |"}`;

  const managerCalibrationSummary =
    (predictive.managerCalibration || [])
      .map((m) => `${m.managerName}: Avg KPI ${m.averageKpi}, Avg Potential ${m.averagePotentialRating}, N=${m.evaluations}`)
      .join("\n") || "Calibration unavailable.";

  const strategicRecommendation2027 =
    `Promote Next: ${(predictive.forceMultipliers || [])[0]?.employeeName || "TBD after Q1 2027 data"}. ` +
    `Stay Interview Priority: ${(predictive.highPerformanceHighRisk || [])[0]?.employeeName || "No critical risk detected"}.`;

  return {
    employeeOverview: `${employeeLayout.employeeName} (${employeeLayout.role || "Role N/A"}) reported under ${employeeLayout.managerName}. Quarterly KPI path: ${kpiParts}.`,
    kpiVariation: `Average KPI: ${employeeLayout.kpiAverage ?? "N/A"}; trend: ${employeeLayout.kpiTrend ?? "N/A"}.`,
    peerViewOverall: peerCombined || "Peer feedback unavailable.",
    improvementTrend: trendText,
    managerOverallTake: managerCombined || "Manager notes unavailable.",
    trajectoryPrediction: trajectory,
    managerPattern: `${ruleSignals.patternSummary} Team size in year dataset: ${managerLayout.employeesUnderManager.length} employees.`,
    managerBiasReport: `${ruleSignals.biasSummary} Contradictions: ${ruleSignals.contradictions.join(" | ") || "None"}. Explicit flags: ${ruleSignals.explicitFlags.join(" | ") || "None"}.`,
    riskSuccessMatrixTable,
    managerCalibrationSummary,
    strategicRecommendation2027,
    biasFlags: [...ruleSignals.contradictions, ...ruleSignals.explicitFlags],
    llmUsed: false,
  };
}

function safeResolve(baseDir, requestPath) {
  const cleanPath = requestPath.split("?")[0].split("#")[0];
  const normalized = path.normalize(decodeURIComponent(cleanPath)).replace(/^([.][.][\\/])+/, "");
  const resolved = path.resolve(baseDir, `.${normalized}`);
  if (!resolved.startsWith(baseDir)) return null;
  return resolved;
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function main(options = {}) {
  loadEnvFile();
  const listen = options.listen !== false;

  const mongoUri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;
  let usersCol = null;
  let reportsCol = null;
  let guardianCol = null;
  let mongoAvailable = false;
  if (mongoUri && dbName) {
    try {
      const client = new MongoClient(mongoUri);
      await client.connect();
      const db = client.db(dbName);
      usersCol = db.collection("users");
      reportsCol = db.collection("quarterly_reports");
      guardianCol = db.collection("talent_guardian_alerts");
      await usersCol.createIndex({ email: 1 }, { unique: true });
      await reportsCol.createIndex({ userId: 1, quarter: 1 }, { unique: true });
      await guardianCol.createIndex({ userId: 1 }, { unique: true });
      mongoAvailable = true;
    } catch (err) {
      console.warn(`[WARN] MongoDB unavailable. Running in guest-capable fallback mode. ${err?.message || err}`);
    }
  } else {
    console.warn("[WARN] MONGODB_URI/MONGODB_DB missing. Running in guest-capable fallback mode.");
  }

  const sessions = new Map();
  const resetTokens = new Map();
  const fallbackUsersByEmail = new Map();
  const fallbackUsersById = new Map();

  function makeFallbackUserId() {
    return crypto.randomBytes(12).toString("hex");
  }

  function getFallbackUserByEmail(email) {
    return fallbackUsersByEmail.get(String(email || "").toLowerCase()) || null;
  }

  function getFallbackUserById(id) {
    return fallbackUsersById.get(String(id || "").toLowerCase()) || null;
  }

  function upsertFallbackUser(user) {
    if (!user || !user._id || !user.email) return null;
    const email = String(user.email || "").toLowerCase();
    const id = String(user._id);
    const normalized = { ...user, _id: id, email };
    fallbackUsersByEmail.set(email, normalized);
    fallbackUsersById.set(id, normalized);
    return normalized;
  }

  function createFallbackUser({ name, email, password, authProvider, googleSub }) {
    const user = {
      _id: makeFallbackUserId(),
      name: name || "User",
      email: String(email || "").toLowerCase(),
      password: password || null,
      authProvider: authProvider || "local",
      googleSub: googleSub || null,
      createdAt: new Date(),
    };
    return upsertFallbackUser(user);
  }

  async function findUserByEmail(email) {
    if (usersCol) return usersCol.findOne({ email });
    return getFallbackUserByEmail(email);
  }

  async function findUserById(id) {
    if (usersCol) return usersCol.findOne({ _id: new ObjectId(id) });
    return getFallbackUserById(id);
  }

  async function insertUser(doc) {
    if (usersCol) return usersCol.insertOne(doc);
    if (getFallbackUserByEmail(doc.email)) {
      const err = new Error("E11000 duplicate key error");
      err.code = "E11000";
      throw err;
    }
    const user = createFallbackUser(doc);
    return { insertedId: user._id, user };
  }

  async function updateUserById(id, update) {
    if (usersCol) return usersCol.updateOne({ _id: new ObjectId(id) }, update);
    const user = getFallbackUserById(id);
    if (!user) return { matchedCount: 0, modifiedCount: 0 };
    const next = { ...user, ...(update && update.$set ? update.$set : {}) };
    upsertFallbackUser(next);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  const { port } = parseArgs(process.argv.slice(2));
  const baseDir = path.resolve(process.cwd());
  const baseCsvPath = path.resolve("data/employees.csv");
  const defaultGuestReports = loadDefaultGuestReports(baseCsvPath);
  const tempDir = path.join(os.tmpdir(), "hr-agent-ui");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  async function getSessionPrincipal(req) {
    const cookies = parseCookies(req);
    const token = cookies.hr_session || "";
    const session = sessions.get(token);
    if (!session) return null;

      if (session.type === "guest") {
      return {
        type: "guest",
        id: session.guestId,
        name: "Guest User",
        email: "guest@local",
        sessionToken: token,
        session,
      };
    }

      try {
        if (!usersCol) {
          const user = getFallbackUserById(session.userId);
          if (!user) return null;
          return {
            type: "user",
            id: String(user._id),
            name: user.name,
            email: user.email,
            sessionToken: token,
            session,
          };
        }
        const user = await usersCol.findOne({ _id: new ObjectId(session.userId) });
        if (!user) return null;
        return {
          type: "user",
          id: String(user._id),
          name: user.name,
          email: user.email,
          sessionToken: token,
          session,
        };
      } catch (_err) {
        return null;
      }
  }

  async function getQuarterStatus(principal) {
    const required = ["Q1", "Q2", "Q3", "Q4"];
    let docs = [];

    if (principal.type === "guest") {
      docs = Array.isArray(principal.session.guestReports) && principal.session.guestReports.length
        ? principal.session.guestReports
        : defaultGuestReports;
      const quarters = new Set(docs.map((d) => normalizeQuarter(d.quarter)));
      const missing = required.filter((q) => !quarters.has(q));
      return {
        uploadedCount: quarters.size,
        quarters: [...quarters].sort(),
        missing,
        complete: true,
        docs,
        isGuest: true,
        persisted: false,
      };
    }

    if (!reportsCol) {
      return {
        uploadedCount: 0,
        quarters: [],
        missing: required,
        complete: false,
        docs: [],
        isGuest: false,
        persisted: false,
      };
    }
    docs = await reportsCol.find({ userId: principal.id }).toArray();
    const quarters = new Set(docs.map((d) => d.quarter));
    const missing = required.filter((q) => !quarters.has(q));
    return {
      uploadedCount: quarters.size,
      quarters: [...quarters].sort(),
      missing,
      complete: missing.length === 0,
      docs,
      isGuest: false,
      persisted: true,
    };
  }

  async function getTalentGuardianState(principal, docsOverride = null) {
    const docs = Array.isArray(docsOverride) ? docsOverride : (await getQuarterStatus(principal)).docs;
    if (principal.type === "guest") {
      const computed = buildTalentGuardianAlerts(collectAllQuarterRows(docs));
      const stored = principal.session.guardianAlerts || computed;
      return { ...stored, persisted: false };
    }

    if (Array.isArray(docsOverride)) {
      const computed = buildTalentGuardianAlerts(collectAllQuarterRows(docs));
      await guardianCol.updateOne(
        { userId: principal.id },
        { $set: { userId: principal.id, payload: computed, updatedAt: new Date() } },
        { upsert: true }
      );
      return { ...computed, persisted: true };
    }

    const existing = await guardianCol.findOne({ userId: principal.id });
    if (existing?.payload) return { ...existing.payload, persisted: true };
    const computed = buildTalentGuardianAlerts(collectAllQuarterRows(docs));
    await guardianCol.updateOne(
      { userId: principal.id },
      { $set: { userId: principal.id, payload: computed, updatedAt: new Date() } },
      { upsert: true }
    );
    return { ...computed, persisted: true };
  }

  async function refreshTalentGuardianState(principal, docs) {
    const payload = buildTalentGuardianAlerts(collectAllQuarterRows(docs));
    if (principal.type === "guest") {
      principal.session.guardianAlerts = payload;
      return { ...payload, persisted: false };
    }
    await guardianCol.updateOne(
      { userId: principal.id },
      { $set: { userId: principal.id, payload, updatedAt: new Date() } },
      { upsert: true }
    );
    return { ...payload, persisted: true };
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/api/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && req.url === "/api/auth/signup") {
        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody || "{}");
        const name = String(body.name || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!name || !email || password.length < 6) {
          sendJson(res, 400, { error: "Name, email, and password (min 6 chars) are required." });
          return;
        }

        const digest = makePasswordDigest(password);
        try {
          const result = await insertUser({
            name,
            email,
            password: digest,
            authProvider: "local",
            createdAt: new Date(),
          });

          const user = result.user || { _id: result.insertedId, name, email };
          const token = createSessionToken();
          sessions.set(token, {
            type: "user",
            userId: String(user._id),
            email: user.email,
            workloadAssignedPeers: [],
          });
          sendJson(
            res,
            200,
            { ok: true, user: { id: String(user._id), name: user.name, email: user.email }, fallback: !usersCol },
            { "Set-Cookie": `hr_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax` }
          );
        } catch (err) {
          if (String(err.message || "").includes("E11000")) {
            sendJson(res, 409, { error: "Email already exists." });
            return;
          }
          throw err;
        }
        return;
      }

      if (req.method === "POST" && req.url === "/api/auth/login") {
        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody || "{}");
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        const user = await findUserByEmail(email);
        if (user && String(user.authProvider || "").toLowerCase() === "google" && !user.password) {
          sendJson(res, 401, { error: "This account uses Google Sign-In. Please continue with Google." });
          return;
        }
        if (!user || !verifyPassword(password, user.password)) {
          sendJson(res, 401, { error: "Invalid email or password." });
          return;
        }

        const token = createSessionToken();
        sessions.set(token, {
          type: "user",
          userId: String(user._id),
          email: user.email,
          workloadAssignedPeers: [],
        });
        sendJson(
          res,
          200,
          { ok: true, user: { id: String(user._id), name: user.name, email: user.email } },
          { "Set-Cookie": `hr_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax` }
        );
        return;
      }

      if (req.method === "GET" && req.url === "/api/auth/google-config") {
        const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
        if (!clientId) {
          sendJson(res, 503, { error: "GOOGLE_CLIENT_ID is not configured." });
          return;
        }
        sendJson(res, 200, { clientId });
        return;
      }

      if (req.method === "POST" && req.url === "/api/auth/google") {
        const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
        if (!clientId) {
          sendJson(res, 503, { error: "GOOGLE_CLIENT_ID is not configured." });
          return;
        }
        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody || "{}");
        const credential = String(body.credential || "").trim();
        if (!credential) {
          sendJson(res, 400, { error: "Google credential is required." });
          return;
        }

        let tokenInfo;
        try {
          const verifyResp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
          const verifyText = await verifyResp.text();
          if (!verifyResp.ok) {
            sendJson(res, 401, { error: "Google verification failed." });
            return;
          }
          tokenInfo = JSON.parse(verifyText);
        } catch (_err) {
          sendJson(res, 502, { error: "Unable to verify Google token right now." });
          return;
        }

        const aud = String(tokenInfo.aud || "");
        const email = String(tokenInfo.email || "").trim().toLowerCase();
        const name = String(tokenInfo.name || tokenInfo.given_name || "Google User").trim();
        const sub = String(tokenInfo.sub || "").trim();
        const emailVerified = String(tokenInfo.email_verified || "").toLowerCase() === "true";

        if (aud !== clientId) {
          sendJson(res, 401, { error: "Google token audience mismatch." });
          return;
        }
        if (!email || !sub || !emailVerified) {
          sendJson(res, 401, { error: "Google email is not verified." });
          return;
        }

        let user = await findUserByEmail(email);
        if (user) {
          const provider = String(user.authProvider || (user.password ? "local" : "google")).toLowerCase();
          if (provider === "local" || !!user.password) {
            sendJson(res, 409, { error: "Account with this gmail exists, please login/reset password." });
            return;
          }
          await updateUserById(user._id, {
            $set: { name: name || user.name, authProvider: "google", googleSub: sub, lastLoginAt: new Date() },
          });
          user = await findUserById(user._id);
        } else {
          const result = await insertUser({
            name: name || "Google User",
            email,
            authProvider: "google",
            googleSub: sub,
            createdAt: new Date(),
          });
          user = result.user || { _id: result.insertedId, name: name || "Google User", email };
        }

        const token = createSessionToken();
        sessions.set(token, {
          type: "user",
          userId: String(user._id),
          email: user.email,
          workloadAssignedPeers: [],
        });
        sendJson(
          res,
          200,
          { ok: true, user: { id: String(user._id), name: user.name, email: user.email, provider: "google" } },
          { "Set-Cookie": `hr_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax` }
        );
        return;
      }

      if (req.method === "POST" && req.url === "/api/auth/forgot-password") {
        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody || "{}");
        const email = String(body.email || "").trim().toLowerCase();
        if (!email) {
          sendJson(res, 400, { error: "Email is required." });
          return;
        }

        const user = await findUserByEmail(email);
        if (!user) {
          sendJson(res, 404, { error: "This email ID doesn't exist, create a new account." });
          return;
        }
        if (String(user.authProvider || "").toLowerCase() === "google" && !user.password) {
          sendJson(res, 400, { error: "This account uses Google Sign-In. Password reset is not required." });
          return;
        }

        const token = createResetToken();
        resetTokens.set(token, {
          userId: String(user._id),
          email,
          expiresAt: Date.now() + (30 * 60 * 1000),
        });

        const proto = (req.headers["x-forwarded-proto"] || "http");
        const host = req.headers.host || "localhost:5602";
        const resetUrl =
          `${proto}://${host}/frontend/auth.html?reset_token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

        const smtpHost = process.env.SMTP_HOST;
        const smtpPort = Number(process.env.SMTP_PORT || 587);
        const smtpSecure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        const smtpFrom = process.env.SMTP_FROM || smtpUser;

        if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
          sendJson(res, 503, { error: "Email service not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM." });
          return;
        }

        let nodemailer;
        try {
          nodemailer = require("nodemailer");
        } catch (_err) {
          sendJson(res, 503, { error: "Email dependency missing. Run npm install." });
          return;
        }

        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: { user: smtpUser, pass: smtpPass },
        });

        await transporter.sendMail({
          from: smtpFrom,
          to: email,
          subject: "Password Reset - HR Agentic Suite",
          text:
            `Hi ${user.name || "User"},\n\n` +
            `We received a request to reset your password.\n` +
            `Use this secure link (valid for 30 minutes):\n${resetUrl}\n\n` +
            `If you did not request this, ignore this email.\n`,
        });

        sendJson(res, 200, { ok: true, message: "Password reset email sent." });
        return;
      }

      if (req.method === "POST" && req.url === "/api/auth/reset-password") {
        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody || "{}");
        const email = String(body.email || "").trim().toLowerCase();
        const token = String(body.token || "").trim();
        const newPassword = String(body.newPassword || "");

        if (!email || !token || newPassword.length < 6) {
          sendJson(res, 400, { error: "Email, token, and new password (min 6 chars) are required." });
          return;
        }

        const tokenData = resetTokens.get(token);
        if (!tokenData || tokenData.email !== email || Date.now() > Number(tokenData.expiresAt || 0)) {
          if (token) resetTokens.delete(token);
          sendJson(res, 400, { error: "Invalid or expired reset link." });
          return;
        }

        const digest = makePasswordDigest(newPassword);
        await updateUserById(tokenData.userId, { $set: { password: digest } });
        resetTokens.delete(token);
        sendJson(res, 200, { ok: true, message: "Password reset successful." });
        return;
      }

      if (req.method === "POST" && req.url === "/api/auth/guest") {
        const token = createSessionToken();
        sessions.set(token, {
          type: "guest",
          guestId: `guest-${Date.now()}`,
          guestReports: null,
          workloadAssignedPeers: [],
        });
        sendJson(
          res,
          200,
          {
            ok: true,
            user: { id: "guest", name: "Guest User", email: "guest@local", type: "guest" },
          },
          { "Set-Cookie": `hr_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax` }
        );
        return;
      }

      if (req.method === "POST" && req.url === "/api/auth/logout") {
        const cookies = parseCookies(req);
        const token = cookies.hr_session || "";
        if (token) sessions.delete(token);
        sendJson(res, 200, { ok: true }, { "Set-Cookie": "hr_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax" });
        return;
      }

      if (req.method === "GET" && req.url === "/api/auth/me") {
        const principal = await getSessionPrincipal(req);
        if (!principal) {
          sendJson(res, 200, { authenticated: false });
          return;
        }
        const status = await getQuarterStatus(principal);
        const guardian = await getTalentGuardianState(principal, status.docs);
        sendJson(res, 200, {
          authenticated: true,
          user: { id: principal.id, name: principal.name, email: principal.email, type: principal.type },
          upload: status,
          guardian: { count: guardian.count, rule: guardian.rule, generatedAt: guardian.generatedAt },
        });
        return;
      }

      if (req.method === "POST" && req.url === "/api/reports/upload") {
        const principal = await getSessionPrincipal(req);
        if (!principal) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }

        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody || "{}");
        const files = Array.isArray(body.files) ? body.files : [];
        if (files.length < 1 || files.length > 4) {
          sendJson(res, 400, { error: "Upload between 1 and 4 quarter JSON files." });
          return;
        }

        const validQuarters = new Set(["Q1", "Q2", "Q3", "Q4"]);
        const normalizedFiles = [];
        for (const file of files) {
          const quarter = normalizeQuarter(file.quarter);
          if (!validQuarters.has(quarter)) {
            sendJson(res, 400, { error: `Invalid quarter: ${file.quarter}` });
            return;
          }
          if (typeof file.content !== "object" || file.content === null) {
            sendJson(res, 400, { error: `Invalid JSON content for ${quarter}` });
            return;
          }
          normalizedFiles.push({
            quarter,
            fileName: String(file.fileName || `${quarter}.json`),
            content: file.content,
          });
        }

        if (principal.type === "guest") {
          const base = Array.isArray(principal.session.guestReports) && principal.session.guestReports.length
            ? [...principal.session.guestReports]
            : [...defaultGuestReports];
          const byQuarter = new Map(base.map((r) => [normalizeQuarter(r.quarter), { ...r, source: "session" }]));
          normalizedFiles.forEach((file) => {
            byQuarter.set(file.quarter, {
              quarter: file.quarter,
              fileName: file.fileName,
              content: file.content,
              uploadedAt: new Date(),
              source: "session",
            });
          });
          principal.session.guestReports = [...byQuarter.values()];
        } else {
          for (const file of normalizedFiles) {
            await reportsCol.updateOne(
              { userId: principal.id, quarter: file.quarter },
              {
                $set: {
                  userId: principal.id,
                  quarter: file.quarter,
                  fileName: file.fileName,
                  content: file.content,
                  uploadedAt: new Date(),
                },
              },
              { upsert: true }
            );
          }
        }

        const status = await getQuarterStatus(principal);
        const guardian = await refreshTalentGuardianState(principal, status.docs);
        sendJson(res, 200, { ok: true, upload: status, talentGuardian: guardian });
        return;
      }

      if (req.method === "GET" && req.url === "/api/reports/status") {
        const principal = await getSessionPrincipal(req);
        if (!principal) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
        const status = await getQuarterStatus(principal);
        const guardian = await getTalentGuardianState(principal, status.docs);
        sendJson(res, 200, { upload: status, talentGuardian: guardian });
        return;
      }

      if (req.method === "GET" && req.url === "/api/reports/list") {
        const principal = await getSessionPrincipal(req);
        if (!principal) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
        const status = await getQuarterStatus(principal);
        const files = status.docs.map((d) => ({
          quarter: d.quarter,
          fileName: d.fileName || `${d.quarter}.json`,
          uploadedAt: d.uploadedAt || null,
          source: d.source || (status.isGuest ? "default" : "mongo"),
        }));
        files.sort((a, b) => String(a.quarter).localeCompare(String(b.quarter)));
        sendJson(res, 200, { files, upload: status });
        return;
      }

      if (req.method === "DELETE" && req.url.startsWith("/api/reports/")) {
        const principal = await getSessionPrincipal(req);
        if (!principal) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
        const quarter = normalizeQuarter(req.url.split("/").pop());
        if (!["Q1", "Q2", "Q3", "Q4"].includes(quarter)) {
          sendJson(res, 400, { error: "Invalid quarter in delete request." });
          return;
        }

        if (principal.type === "guest") {
          const base = Array.isArray(principal.session.guestReports) ? principal.session.guestReports : [...defaultGuestReports];
          principal.session.guestReports = base.filter((r) => normalizeQuarter(r.quarter) !== quarter);
        } else {
          await reportsCol.deleteOne({ userId: principal.id, quarter });
        }

        const status = await getQuarterStatus(principal);
        const guardian = await refreshTalentGuardianState(principal, status.docs);
        sendJson(res, 200, { ok: true, upload: status, talentGuardian: guardian });
        return;
      }

      if (req.method === "GET" && req.url === "/api/talent-guardian") {
        const principal = await getSessionPrincipal(req);
        if (!principal) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
        const status = await getQuarterStatus(principal);
        if (!status.complete && principal.type !== "guest") {
          sendJson(res, 403, { error: "Upload all 4 quarterly JSON files first." });
          return;
        }
        const guardian = await getTalentGuardianState(principal, status.docs);
        sendJson(res, 200, { talentGuardian: guardian });
        return;
      }

      if (req.method === "GET" && req.url.startsWith("/api/talent-guardian/package")) {
        const principal = await getSessionPrincipal(req);
        if (!principal) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
        const status = await getQuarterStatus(principal);
        if (!status.complete && principal.type !== "guest") {
          sendJson(res, 403, { error: "Upload all 4 quarterly JSON files first." });
          return;
        }
        const guardian = await getTalentGuardianState(principal, status.docs);
        const globalRows = collectAllQuarterRows(status.docs);
        const urlObj = new URL(req.url, "http://localhost");
        const employee = String(urlObj.searchParams.get("employee") || "").trim();
        const alert = resolveInterventionAlertForEmployee(guardian, employee, globalRows);
        if (!alert) {
          sendJson(res, 404, { error: "No intervention package found for requested employee." });
          return;
        }

        const pkg = alert.interventionPackage || {};
        const yearly = pkg.yearlyBurnoutAnalysis || {};
        const lines = [
          "TALENT GUARDIAN - AUTO-PILOT INTERVENTION PACKAGE",
          `Employee: ${alert.employeeName}`,
          `Manager: ${alert.managerName}`,
          `Role: ${alert.role}`,
          `Quarter: ${alert.quarter}`,
          `KPI: ${alert.kpiScore}%`,
          `Sentiment: ${alert.sentimentScore}`,
          `Flight Risk: ${alert.flightRiskProbability ?? "N/A"}`,
          "",
          "Diagnosis:",
          alert.diagnosis || "N/A",
          "",
          "Yearly Burnout Analysis:",
          `Historical Baseline: ${yearly.historicalBaseline || "N/A"}`,
          `Divergence: ${yearly.divergenceNarrative || "N/A"}`,
          `Lag Effect: ${yearly.lagNarrative || "N/A"}`,
          `Contextual Root-Cause Synthesis:\n${yearly.contextualSynthesis || "N/A"}`,
          "",
          "Manager Email Draft:",
          pkg.managerEmail || "N/A",
          "",
          "Slack Message Draft:",
          pkg.slackMessageToEmployee || "N/A",
          "",
          "Calendar Invite Draft:",
          pkg.calendarInviteDraft || "N/A",
          "",
          "Stay Interview Script:",
          `- ${(pkg.stayInterviewScript || []).join("\n- ")}`,
          "",
          "3 Workload Changes:",
          `- ${(pkg.workloadChanges || []).join("\n- ")}`,
          "",
          "30-Day Intervention Roadmap:",
          `- ${(pkg.thirtyDayRoadmap || []).join("\n- ")}`,
          "",
          "Q1 Follow-Up Reminder:",
          pkg.q1FollowUpReminder || "N/A",
          "",
        ];
        const content = `${lines.join("\n")}\n`;
        const safeName = String(alert.employeeName || "employee").replace(/[^a-z0-9_-]+/gi, "_");
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="talent_guardian_${safeName}.txt"`,
        });
        res.end(content);
        return;
      }

      if (req.method === "GET" && req.url.startsWith("/api/talent-guardian/gmail-draft")) {
        const principal = await getSessionPrincipal(req);
        if (!principal) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
        const status = await getQuarterStatus(principal);
        if (!status.complete && principal.type !== "guest") {
          sendJson(res, 403, { error: "Upload all 4 quarterly JSON files first." });
          return;
        }
        const guardian = await getTalentGuardianState(principal, status.docs);
        const globalRows = collectAllQuarterRows(status.docs);
        const urlObj = new URL(req.url, "http://localhost");
        const employee = String(urlObj.searchParams.get("employee") || "").trim();
        const alert = resolveInterventionAlertForEmployee(guardian, employee, globalRows);
        if (!alert) {
          sendJson(res, 404, { error: "No intervention package found for requested employee." });
          return;
        }

        const employeeEmail = FIXED_EMPLOYEE_EMAIL;
        const managerEmail = FIXED_MANAGER_EMAIL;
        const proto = (req.headers["x-forwarded-proto"] || "http");
        const host = req.headers.host || "localhost:5602";
        const reportUrl =
          `${proto}://${host}/api/dashboard-report?manager=${encodeURIComponent(alert.managerName)}&employee=${encodeURIComponent(alert.employeeName)}&autoprint=1`;
        const schedule = buildStayInterviewSchedule(
          alert.employeeName,
          alert.managerName,
          employeeEmail,
          managerEmail,
          principal.email || "",
          reportUrl
        );
        const pkg = alert.interventionPackage || {};
        const roadmap = (pkg.thirtyDayRoadmap || []).map((x) => `- ${x}`).join("\n");
        const workload = (pkg.workloadChanges || []).map((x) => `- ${x}`).join("\n");
        const questions = (pkg.stayInterviewScript || []).map((x) => `- ${x}`).join("\n");
        const subject = `Retention Support Plan - ${alert.employeeName} (Stay Interview + 30-Day Plan)`;
        const body =
          `Hi ${alert.employeeName} and ${alert.managerName},\n\n` +
          `Based on annual Talent Guardian review, a focused retention and workload support Stay Interview has been scheduled.\n\n` +
          `Summary:\n${alert.diagnosis || "N/A"}\n\n` +
          `Proposed 30-Day Intervention Roadmap:\n${roadmap || "- N/A"}\n\n` +
          `Proposed Workload Changes:\n${workload || "- N/A"}\n\n` +
          `Stay Interview Questions:\n${questions || "- N/A"}\n\n` +
          `Interview Slot (45 min): ${schedule.startIso} to ${schedule.endIso} (${schedule.timezone})\n` +
          `Google Meet Link: ${schedule.meetBootstrapUrl}\n\n` +
          `Detailed Analytics PDF: ${reportUrl}\n\n` +
          `Both calendars have been booked for this interview event. Please be ready at the scheduled time.\n\n` +
          `Regards,\n${principal.name || "HR Team"}\n${principal.email || ""}`;

        const composeUrl =
          `https://mail.google.com/mail/?view=cm&fs=1` +
          `&to=${encodeURIComponent(employeeEmail)}` +
          `&cc=${encodeURIComponent(managerEmail)}` +
          `&su=${encodeURIComponent(subject)}` +
          `&body=${encodeURIComponent(body)}`;

        sendJson(res, 200, {
          employee: alert.employeeName,
          manager: alert.managerName,
          to: employeeEmail,
          cc: managerEmail,
          subject,
          body,
          composeUrl,
          schedule,
          reportUrl,
        });
        return;
      }

      if (req.method === "GET" && req.url.startsWith("/api/talent-guardian/schedule")) {
        const principal = await getSessionPrincipal(req);
        if (!principal) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
        const status = await getQuarterStatus(principal);
        if (!status.complete && principal.type !== "guest") {
          sendJson(res, 403, { error: "Upload all 4 quarterly JSON files first." });
          return;
        }
        const guardian = await getTalentGuardianState(principal, status.docs);
        const globalRows = collectAllQuarterRows(status.docs);
        const urlObj = new URL(req.url, "http://localhost");
        const employee = String(urlObj.searchParams.get("employee") || "").trim();
        const alert = resolveInterventionAlertForEmployee(guardian, employee, globalRows);
        if (!alert) {
          sendJson(res, 404, { error: "No intervention package found for requested employee." });
          return;
        }

        const employeeEmail = FIXED_EMPLOYEE_EMAIL;
        const managerEmail = FIXED_MANAGER_EMAIL;
        const proto = (req.headers["x-forwarded-proto"] || "http");
        const host = req.headers.host || "localhost:5602";
        const reportUrl =
          `${proto}://${host}/api/dashboard-report?manager=${encodeURIComponent(alert.managerName)}&employee=${encodeURIComponent(alert.employeeName)}&autoprint=1`;
        const schedule = buildStayInterviewSchedule(
          alert.employeeName,
          alert.managerName,
          employeeEmail,
          managerEmail,
          principal.email || "",
          reportUrl
        );
        sendJson(res, 200, {
          employee: alert.employeeName,
          manager: alert.managerName,
          employeeEmail,
          managerEmail,
          schedule,
          reportUrl,
        });
        return;
      }

      if (req.method === "GET" && req.url === "/api/employees") {
        const principal = await getSessionPrincipal(req);
        if (!principal) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
        const status = await getQuarterStatus(principal);
        if (!status.complete && principal.type !== "guest") {
          sendJson(res, 403, { error: "Upload all 4 quarterly JSON files first." });
          return;
        }
        const employees = loadEmployees(baseCsvPath);
        sendJson(res, 200, { employees, count: employees.length });
        return;
      }

      if (req.method === "GET" && req.url === "/api/hierarchy") {
        const principal = await getSessionPrincipal(req);
        if (!principal) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
        const status = await getQuarterStatus(principal);
        if (!status.complete && principal.type !== "guest") {
          sendJson(res, 403, { error: "Upload all 4 quarterly JSON files first." });
          return;
        }
        const hierarchy = extractHierarchyFromReports(status.docs);
        sendJson(res, 200, hierarchy);
        return;
      }

      if (req.method === "GET" && req.url.startsWith("/api/context")) {
        const principal = await getSessionPrincipal(req);
        if (!principal) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
        const status = await getQuarterStatus(principal);
        if (!status.complete && principal.type !== "guest") {
          sendJson(res, 403, { error: "Upload all 4 quarterly JSON files first." });
          return;
        }

        const urlObj = new URL(req.url, "http://localhost");
        const managerName = String(urlObj.searchParams.get("manager") || "").trim();
        const employeeName = String(urlObj.searchParams.get("employee") || "").trim();
        if (!managerName || !employeeName) {
          sendJson(res, 400, { error: "manager and employee query params are required." });
          return;
        }

        const context = buildQuarterlyContext(status.docs, managerName, employeeName);
        if (!context.employeeRows.length) {
          sendJson(res, 404, { error: "Employee not found under selected manager in uploaded quarterly data." });
          return;
        }

        const managerLayout = buildManagerLayout(context);
        const employeeLayout = buildEmployeeLayout(context);
        sendJson(res, 200, { managerLayout, employeeLayout });
        return;
      }

      if (req.method === "POST" && req.url === "/api/analyze-performance") {
        const principal = await getSessionPrincipal(req);
        if (!principal) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
        const status = await getQuarterStatus(principal);
        if (!status.complete && principal.type !== "guest") {
          sendJson(res, 403, { error: "Upload all 4 quarterly JSON files first." });
          return;
        }

        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody || "{}");
        const managerName = String(body.managerName || "").trim();
        const employeeName = String(body.employeeName || "").trim();
        if (!managerName || !employeeName) {
          sendJson(res, 400, { error: "managerName and employeeName are required." });
          return;
        }

        const context = buildQuarterlyContext(status.docs, managerName, employeeName);
        if (!context.employeeRows.length) {
          sendJson(res, 404, { error: "Employee not found under selected manager in uploaded quarterly data." });
          return;
        }
        context.globalRows = collectAllQuarterRows(status.docs);
        context.predictiveSignals = buildPredictiveAuditSignals(context);
        const guardian = await getTalentGuardianState(principal, status.docs);

        const managerLayout = buildManagerLayout(context);
        const employeeLayout = buildEmployeeLayout(context);
        const policyText = loadPolicyText("policy.txt");

        let analysis;
        try {
          analysis = await analyzeYearlyWithLlm(context, policyText);
          analysis.llmUsed = true;
          analysis.llmError = null;
        } catch (_err) {
          analysis = analyzeYearlyFallback(context);
          analysis.llmUsed = false;
          analysis.llmError = _err?.message || "LLM call failed; fallback used.";
        }
        const ruleSignals = ruleBasedBiasAndPattern(context);
        analysis = normalizeAnalysisResult(analysis, context, context.predictiveSignals, ruleSignals);
        const biasFlags = [...new Set([...(analysis.biasFlags || []), ...ruleSignals.explicitFlags, ...ruleSignals.contradictions])];
        analysis.biasFlags = biasFlags;

        sendJson(res, 200, {
          managerLayout,
          employeeLayout,
          analysis,
          ruleSignals,
          predictiveSignals: context.predictiveSignals,
          talentGuardian: guardian,
          internalInvestigation: null,
        });
        return;
      }

      if (req.method === "POST" && req.url === "/api/investigation-audit") {
        const principal = await getSessionPrincipal(req);
        if (!principal) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
        const status = await getQuarterStatus(principal);
        if (!status.complete && principal.type !== "guest") {
          sendJson(res, 403, { error: "Upload all 4 quarterly JSON files first." });
          return;
        }
        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody || "{}");
        const managerName = String(body.managerName || "").trim();
        const employeeName = String(body.employeeName || "").trim();
        if (!managerName || !employeeName) {
          sendJson(res, 400, { error: "managerName and employeeName are required." });
          return;
        }

        const allRows = collectAllQuarterRows(status.docs);
        const employeeRows = allRows.filter((r) => String(r.employeeName).toLowerCase() === employeeName.toLowerCase());
        if (!employeeRows.length) {
          sendJson(res, 404, { error: "No quarterly records found for selected employee." });
          return;
        }

        const scopedRows = employeeRows.filter(
          (r) => String(r.managerName).toLowerCase() === managerName.toLowerCase()
        );
        const investigationRows = scopedRows.length ? scopedRows : employeeRows;

        let internalInvestigation;
        try {
          internalInvestigation = await analyzeInternalInvestigationWithLlm(
            investigationRows,
            allRows,
            employeeName,
            managerName
          );
        } catch (_err) {
          internalInvestigation = buildInternalInvestigationFallback(
            investigationRows,
            allRows,
            employeeName,
            managerName
          );
        }
        sendJson(res, 200, { internalInvestigation });
        return;
      }

      if (req.method === "POST" && req.url === "/api/workload-rebalance") {
        const principal = await getSessionPrincipal(req);
        if (!principal) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
        const status = await getQuarterStatus(principal);
        if (!status.complete && principal.type !== "guest") {
          sendJson(res, 403, { error: "Upload all 4 quarterly JSON files first." });
          return;
        }

        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody || "{}");
        const managerName = String(body.managerName || "").trim();
        const employeeName = String(body.employeeName || "").trim();
        const allRows = collectAllQuarterRows(status.docs);
        let resolvedManager = managerName;
        let resolvedEmployee = employeeName;
        if (!resolvedEmployee) {
          const autoPick = pickAutoTargetForRebalancing(allRows, resolvedManager);
          if (!autoPick) {
            sendJson(res, 404, { error: "No employees available for workload analysis." });
            return;
          }
          resolvedEmployee = autoPick.employeeName;
          if (!resolvedManager) resolvedManager = autoPick.managerName;
        }
        const snapshots = buildLatestEmployeeSnapshots(allRows);
        const targetSnapshot = snapshots.find(
          (s) => String(s.employeeName).toLowerCase() === String(resolvedEmployee).toLowerCase()
        );
        if (!targetSnapshot) {
          sendJson(res, 404, { error: "Selected employee not found in dataset." });
          return;
        }
        const senderAssessment = await evaluateSenderEligibilityWithLlm(targetSnapshot);
        const assignedPeers = Array.isArray(principal.session.workloadAssignedPeers)
          ? principal.session.workloadAssignedPeers
          : [];
        const result = analyzeWorkloadRebalancing(
          allRows,
          resolvedManager,
          resolvedEmployee,
          senderAssessment,
          { assignedPeers }
        );
        if (result.error) {
          sendJson(res, 404, { error: result.error });
          return;
        }
        const newlyAssigned = (result.assignments || [])
          .map((a) => String(a.toEmployee || "").trim())
          .filter((name) => name && !/^external contractor$/i.test(name));
        if (!principal.session.workloadAssignedPeers) principal.session.workloadAssignedPeers = [];
        const merged = new Set(principal.session.workloadAssignedPeers.map((x) => String(x).toLowerCase()));
        newlyAssigned.forEach((n) => merged.add(String(n).toLowerCase()));
        principal.session.workloadAssignedPeers = [...merged];
        const llmSummary = await summarizeWorkloadSimulationWithLlm(result);
        sendJson(res, 200, {
          workloadSimulation: result,
          llmSummary,
          spongeLimit: {
            assignedPeers: principal.session.workloadAssignedPeers,
            newlyAssigned,
          },
          resolvedSelection: { managerName: resolvedManager, employeeName: resolvedEmployee },
        });
        return;
      }

      if (req.method === "GET" && req.url.startsWith("/api/dashboard-report")) {
        const principal = await getSessionPrincipal(req);
        if (!principal) {
          sendText(res, 401, "Unauthorized");
          return;
        }
        const status = await getQuarterStatus(principal);
        if (!status.complete && principal.type !== "guest") {
          sendText(res, 403, "Upload all 4 quarterly JSON files first.");
          return;
        }
        const urlObj = new URL(req.url, "http://localhost");
        const managerName = String(urlObj.searchParams.get("manager") || "").trim();
        const employeeName = String(urlObj.searchParams.get("employee") || "").trim();
        const autoPrint = String(urlObj.searchParams.get("autoprint") || "") === "1";
        if (!managerName || !employeeName) {
          sendText(res, 400, "manager and employee are required.");
          return;
        }

        const context = buildQuarterlyContext(status.docs, managerName, employeeName);
        if (!context.employeeRows.length) {
          sendText(res, 404, "Employee not found under selected manager.");
          return;
        }
        context.globalRows = collectAllQuarterRows(status.docs);
        context.predictiveSignals = buildPredictiveAuditSignals(context);
        const managerLayout = buildManagerLayout(context);
        const employeeLayout = buildEmployeeLayout(context);
        const policyText = loadPolicyText("policy.txt");

        let analysis;
        try {
          analysis = await analyzeYearlyWithLlm(context, policyText);
          analysis.llmUsed = true;
          analysis.llmError = null;
        } catch (_err) {
          analysis = analyzeYearlyFallback(context);
          analysis.llmUsed = false;
          analysis.llmError = _err?.message || "LLM call failed; fallback used.";
        }
        const ruleSignals = ruleBasedBiasAndPattern(context);
        analysis = normalizeAnalysisResult(analysis, context, context.predictiveSignals, ruleSignals);
        const guardian = await getTalentGuardianState(principal, status.docs);
        const payload = {
          managerLayout,
          employeeLayout,
          analysis,
          ruleSignals,
          predictiveSignals: context.predictiveSignals,
          talentGuardian: guardian,
          internalInvestigation: null,
        };
        const html = buildDashboardReportHtml(payload, { autoPrint });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (req.method === "POST" && req.url === "/api/review") {
        const principal = await getSessionPrincipal(req);
        if (!principal) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
        const status = await getQuarterStatus(principal);
        if (!status.complete && principal.type !== "guest") {
          sendJson(res, 403, { error: "Upload all 4 quarterly JSON files first." });
          return;
        }

        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody || "{}");
        const required = ["employeeName", "role", "kpiScore", "peerFeedback", "managerNotes"];
        const missing = required.filter((k) => !String(body[k] || "").trim());
        if (missing.length > 0) {
          sendJson(res, 400, { error: `Missing fields: ${missing.join(", ")}` });
          return;
        }

        const mode = ["local", "hybrid", "llm"].includes(body.mode) ? body.mode : "hybrid";
        const tempCsvPath = path.join(tempDir, `request-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
        const csv = buildDatasetWithPayload(baseCsvPath, body);
        fs.writeFileSync(tempCsvPath, csv, "utf8");

        const result = await runAgent({
          tempCsvPath,
          employeeName: body.employeeName.trim(),
          mode,
        });

        try {
          fs.unlinkSync(tempCsvPath);
        } catch (_err) {
          // ignore temp cleanup failure
        }

        const review = result?.reviews?.[0];
        if (!review) throw new Error("No review returned from agent");

        sendJson(res, 200, { review, summary: result.summary, mode: result.mode });
        return;
      }

      const principal = await getSessionPrincipal(req);
      const status = principal ? await getQuarterStatus(principal) : null;
      const reqPath = req.url === "/" ? "/" : req.url;

      if (reqPath === "/") {
        if (!principal) {
          redirect(res, "/frontend/auth.html");
          return;
        }
        if (!status.complete && principal.type !== "guest") {
          redirect(res, "/frontend/upload.html");
          return;
        }
        redirect(res, "/frontend/index.html");
        return;
      }

      if (reqPath === "/frontend/auth.html" && principal) {
        redirect(res, status.complete || principal.type === "guest" ? "/frontend/index.html" : "/frontend/upload.html");
        return;
      }

      if (reqPath === "/frontend/upload.html") {
        if (!principal) {
          redirect(res, "/frontend/auth.html");
          return;
        }
        if (principal.type === "guest") {
          redirect(res, "/frontend/index.html");
          return;
        }
      }

      if (reqPath.startsWith("/frontend/index")) {
        if (!principal) {
          redirect(res, "/frontend/auth.html");
          return;
        }
        if (!status.complete && principal.type !== "guest") {
          redirect(res, "/frontend/upload.html");
          return;
        }
      }

      if (reqPath.startsWith("/frontend/workload")) {
        if (!principal) {
          redirect(res, "/frontend/auth.html");
          return;
        }
        if (!status.complete && principal.type !== "guest") {
          redirect(res, "/frontend/upload.html");
          return;
        }
      }

      const resolved = safeResolve(baseDir, reqPath);
      if (!resolved) {
        sendText(res, 403, "Forbidden");
        return;
      }

      let filePath = resolved;
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          sendText(res, 404, "Not Found");
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Server error" });
    }
  });

  if (listen) {
    server.listen(port, () => {
      process.stdout.write("App server running at http://localhost:" + port + "/\n");
    });
  }
  return server;
}

if (process.env.VERCEL) {
  let cachedServer = null;
  module.exports = async (req, res) => {
    try {
      if (!cachedServer) {
        cachedServer = await main({ listen: false });
      }
      return cachedServer.emit("request", req, res);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(err?.message || "Server error");
    }
  };
} else {
  main().catch((err) => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  });
}
