"use strict";

const logoutBtn = document.getElementById("logoutBtn");
const manageReportsBtn = document.getElementById("manageReportsBtn");
const managerSelectEl = document.getElementById("managerSelect");
const employeeSelectEl = document.getElementById("employeeSelect");
const analyzeBtn = document.getElementById("analyzeBtn");
const workloadBtn = document.getElementById("workloadBtn");
const generateAuditBtn = document.getElementById("generateAuditBtn");
const statusBoxEl = document.getElementById("statusBox");

const managersCountEl = document.getElementById("managersCount");
const employeesCountEl = document.getElementById("employeesCount");
const flagsCountEl = document.getElementById("flagsCount");
const llmModeEl = document.getElementById("llmMode");

const employeeAvatarEl = document.getElementById("employeeAvatar");
const employeeIdentityEl = document.getElementById("employeeIdentity");
const kpiBarChartEl = document.getElementById("kpiBarChart");
const trendSvgEl = document.getElementById("trendSvg");
const scissorsAreaSvgEl = document.getElementById("scissorsAreaSvg");
const skillWebSvgEl = document.getElementById("skillWebSvg");
const biasDistributionSvgEl = document.getElementById("biasDistributionSvg");
const collabChordSvgEl = document.getElementById("collabChordSvg");
const longitudinalPhaseSvgEl = document.getElementById("longitudinalPhaseSvg");
const skillSurplusBulletEl = document.getElementById("skillSurplusBullet");
const calibrationXSvgEl = document.getElementById("calibrationXSvg");
const blastRadiusSvgEl = document.getElementById("blastRadiusSvg");
const longitudinalSummaryEl = document.getElementById("longitudinalSummary");
const dashboardGraphZoomDialogEl = document.getElementById("dashboardGraphZoomDialog");
const dashboardGraphZoomTitleEl = document.getElementById("dashboardGraphZoomTitle");
const dashboardGraphZoomViewportEl = document.getElementById("dashboardGraphZoomViewport");
const dashboardGraphZoomBodyEl = document.getElementById("dashboardGraphZoomBody");
const dashboardZoomOutBtn = document.getElementById("dashboardZoomOutBtn");
const dashboardZoomResetBtn = document.getElementById("dashboardZoomResetBtn");
const dashboardZoomInBtn = document.getElementById("dashboardZoomInBtn");
const dashboardCloseGraphZoomBtn = document.getElementById("dashboardCloseGraphZoomBtn");
const employeeOverviewBlockEl = document.getElementById("employeeOverviewBlock");
const skillTrendsBlockEl = document.getElementById("skillTrendsBlock");
const managerTakeBlockEl = document.getElementById("managerTakeBlock");
const trajectoryBlockEl = document.getElementById("trajectoryBlock");
const riskMatrixBlockEl = document.getElementById("riskMatrixBlock");
const openRiskMatrixBtn = document.getElementById("openRiskMatrixBtn");
const riskMatrixDialogEl = document.getElementById("riskMatrixDialog");
const closeRiskMatrixBtn = document.getElementById("closeRiskMatrixBtn");
const riskMatrixDialogBodyEl = document.getElementById("riskMatrixDialogBody");

const managerPatternBlockEl = document.getElementById("managerPatternBlock");
const managerBiasBlockEl = document.getElementById("managerBiasBlock");
const managerCalibrationChartEl = document.getElementById("managerCalibrationChart");
const managerCalibrationTextEl = document.getElementById("managerCalibrationText");
const predictiveSignalsBlockEl = document.getElementById("predictiveSignalsBlock");
const internalInvestigationBlockEl = document.getElementById("internalInvestigationBlock");
const recommendationBlockEl = document.getElementById("recommendationBlock");
const riskActionStatusEl = document.getElementById("riskActionStatus");
const autoPilotInterventionBtn = document.getElementById("autoPilotInterventionBtn");
const interventionActionsEl = document.getElementById("interventionActions");

let hierarchy = { managers: [], employees: [] };
let selectedManager = "";
let selectedEmployee = "";
let latestTalentGuardian = null;
let latestInternalInvestigation = null;
let latestAnalysisPayload = null;
let dashboardGraphZoom = 1;
let latestRiskMatrixHtml = "";

function escHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function textOrFallback(value, fallback = "N/A") {
  const s = String(value ?? "").trim();
  return s || fallback;
}

function parseNum(value) {
  const m = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function quarterSort(a, b) {
  const qa = Number(String(a?.quarter || "").replace("Q", "")) || 99;
  const qb = Number(String(b?.quarter || "").replace("Q", "")) || 99;
  return qa - qb;
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "--";
}

function renderKpiBars(records) {
  const sorted = [...records].sort(quarterSort);
  const nums = sorted.map((r) => parseNum(r.kpiScore)).filter((n) => Number.isFinite(n));
  const max = nums.length ? Math.max(...nums, 100) : 100;
  const bars = sorted.map((row, idx) => {
    const val = parseNum(row.kpiScore);
    const h = Number.isFinite(val) ? Math.max(12, Math.round((val / max) * 100)) : 12;
    return (
      `<div class="bar">` +
      `<div class="bar-value">${Number.isFinite(val) ? `${val}%` : "N/A"}</div>` +
      `<div class="bar-fill" style="height:${h}px"></div>` +
      `<div class="bar-label">${idx + 1}</div>` +
      `<div class="bar-label-sub">${textOrFallback(row.quarter, "-")}</div>` +
      `</div>`
    );
  }).join("");
  if (!bars) {
    kpiBarChartEl.innerHTML = "<div class=\"insight-content\">No KPI data</div>";
    return;
  }
  kpiBarChartEl.innerHTML =
    `<div class="bar-chart-frame">` +
    `<div class="bar-y-axis">` +
    `<span>${max}</span><span>${Math.round(max / 2)}</span><span>0</span>` +
    `</div>` +
    `<div class="bar-chart-plot">${bars}</div>` +
    `</div>` +
    `<div class="bar-x-axis">X: Quarter Index (1-${sorted.length}) | Y: KPI%</div>`;
}

function drawTrendSvg(records) {
  const sorted = [...records].sort(quarterSort);
  const padX = 20;
  const width = 320;
  const height = 140;
  const innerW = width - padX * 2;
  const yFor = (v) => 116 - (Math.max(0, Math.min(1, v)) * 90);
  const xFor = (i, total) => padX + ((innerW * i) / Math.max(1, total - 1));

  const sentiment = sorted.map((r) => Number(r.sentimentScore)).filter((n) => Number.isFinite(n));
  const collab = sorted.map((r) => Number(r.collaborationIndex)).filter((n) => Number.isFinite(n));
  const total = sorted.length;

  const pointsSent = sorted
    .map((r, i) => {
      const v = Number(r.sentimentScore);
      if (!Number.isFinite(v)) return "";
      return `${xFor(i, total)},${yFor(v)}`;
    })
    .filter(Boolean)
    .join(" ");
  const pointsCol = sorted
    .map((r, i) => {
      const v = Number(r.collaborationIndex);
      if (!Number.isFinite(v)) return "";
      return `${xFor(i, total)},${yFor(v)}`;
    })
    .filter(Boolean)
    .join(" ");

  const xLabels = sorted
    .map((r, i) => `<text x="${xFor(i, total)}" y="132" fill="#8ea0af" font-size="9" text-anchor="middle">${textOrFallback(r.quarter, "")}</text>`)
    .join("");

  trendSvgEl.innerHTML =
    `<line x1="20" y1="116" x2="300" y2="116" stroke="#244050" stroke-width="1"></line>` +
    `<line x1="20" y1="26" x2="20" y2="116" stroke="#244050" stroke-width="1"></line>` +
    (pointsSent ? `<polyline fill="none" stroke="#7de4f0" stroke-width="2.5" points="${pointsSent}"></polyline>` : "") +
    (pointsCol ? `<polyline fill="none" stroke="#64dbb3" stroke-width="2.5" points="${pointsCol}"></polyline>` : "") +
    `<text x="28" y="20" fill="#7de4f0" font-size="9">Sentiment</text>` +
    `<text x="98" y="20" fill="#64dbb3" font-size="9">Collaboration</text>` +
    xLabels;

  if (!sentiment.length && !collab.length) {
    trendSvgEl.innerHTML += `<text x="160" y="72" fill="#8ea0af" font-size="11" text-anchor="middle">No trend data</text>`;
  }
}

function renderSkillTrends(records) {
  const sorted = [...records].sort(quarterSort);
  const first = sorted[0]?.skillProficiency || {};
  const last = sorted[sorted.length - 1]?.skillProficiency || {};
  const keys = [...new Set([...Object.keys(first), ...Object.keys(last)])].slice(0, 5);
  if (!keys.length) {
    skillTrendsBlockEl.textContent = "Skill proficiency data not present for selected employee.";
    return;
  }
  skillTrendsBlockEl.textContent = keys
    .map((k) => `${k}: ${first[k] ?? "N/A"} -> ${last[k] ?? "N/A"}`)
    .join("\n");
}

function buildManagerTakeSummary(records) {
  const sorted = [...records].sort(quarterSort);
  if (!sorted.length) return "Manager take unavailable.";
  const kpis = sorted.map((r) => parseNum(r.kpiScore)).filter((n) => Number.isFinite(n));
  const firstKpi = kpis.length ? kpis[0] : null;
  const lastKpi = kpis.length ? kpis[kpis.length - 1] : null;
  const trend = (Number.isFinite(firstKpi) && Number.isFinite(lastKpi))
    ? Number((lastKpi - firstKpi).toFixed(2))
    : null;
  const sentimentAvg = mean(sorted.map((r) => Number(r.sentimentScore)).filter((n) => Number.isFinite(n)));
  const collabAvg = mean(sorted.map((r) => Number(r.collaborationIndex)).filter((n) => Number.isFinite(n)));
  const promotedQs = sorted.filter((r) => r.promoted === true).map((r) => r.quarter);
  const performanceView = trend === null
    ? "Performance trajectory is inconclusive from available quarters."
    : trend > 0
      ? `Performance trend is improving (+${trend} KPI points across the year).`
      : trend < 0
        ? `Performance trend is declining (${trend} KPI points across the year).`
        : "Performance trend is stable across the year.";
  const behaviorView =
    `Behavioral signal remains ${Number(sentimentAvg) >= 0.65 ? "healthy" : "watchlisted"} with average sentiment ${Number.isFinite(sentimentAvg) ? sentimentAvg.toFixed(2) : "N/A"} and collaboration ${Number.isFinite(collabAvg) ? collabAvg.toFixed(2) : "N/A"}.`;
  const promotionView = promotedQs.length
    ? `Promotion decisions were concentrated in ${promotedQs.join(", ")}.`
    : "No promotion was recorded in the current annual cycle.";
  return `${performanceView} ${behaviorView} ${promotionView}`;
}

function renderManagerCalibration(calibration) {
  const rows = Array.isArray(calibration) ? calibration : [];
  if (!rows.length) {
    managerCalibrationChartEl.innerHTML = "<div class=\"insight-content\">No manager calibration data</div>";
    return;
  }
  const max = Math.max(...rows.map((r) => Number(r.averageKpi) || 0), 120);
  managerCalibrationChartEl.innerHTML = rows.map((r) => {
    const pct = Math.max(2, Math.round(((Number(r.averageKpi) || 0) / max) * 100));
    return (
      `<div class="stack-row">` +
      `<div class="stack-label">${textOrFallback(r.managerName).split(" ")[0]}</div>` +
      `<div class="stack-track"><div class="stack-fill" style="width:${pct}%"></div></div>` +
      `</div>`
    );
  }).join("");
}

function mean(values) {
  const nums = (values || []).map((v) => Number(v)).filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function quantile(values, q) {
  const nums = (values || []).map((v) => Number(v)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const pos = (nums.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (nums[base + 1] !== undefined) return nums[base] + rest * (nums[base + 1] - nums[base]);
  return nums[base];
}

function positivityScoreFromNotes(text) {
  const source = String(text || "").toLowerCase();
  if (!source) return 0;
  const positive = ["excellent", "strong", "improved", "reliable", "ready", "leader", "benchmark", "great", "mastered", "flawless", "champion"];
  let hits = 0;
  positive.forEach((w) => {
    if (source.includes(w)) hits += 1;
  });
  if (hits >= 2) return 2;
  if (hits >= 1) return 1;
  return 0;
}

function roleCeiling(role) {
  const r = String(role || "").toLowerCase();
  if (/(developer|engineer|qa|devops|architect)/.test(r)) return 8;
  if (/(sales|business|account)/.test(r)) return 8;
  if (/(analyst|data)/.test(r)) return 7;
  if (/(hr|people|recruit)/.test(r)) return 7;
  return 7;
}

function buildLongitudinalPayload(records, analysisPayload, managerName, employeeName, roleName) {
  const sorted = [...(records || [])].sort(quarterSort);
  const q3 = sorted.find((r) => String(r.quarter || "").toUpperCase() === "Q3") || sorted[Math.max(0, sorted.length - 2)] || {};
  const q4 = sorted.find((r) => String(r.quarter || "").toUpperCase() === "Q4") || sorted[sorted.length - 1] || {};
  const kpiQ3 = parseNum(q3.kpiScore);
  const kpiQ4 = parseNum(q4.kpiScore);
  const sentQ3 = Number(q3.sentimentScore);
  const sentQ4 = Number(q4.sentimentScore);
  const deltaKpi = (Number.isFinite(kpiQ4) && Number.isFinite(kpiQ3)) ? Number((kpiQ4 - kpiQ3).toFixed(2)) : 0;
  const deltaSent = (Number.isFinite(sentQ4) && Number.isFinite(sentQ3)) ? Number((sentQ4 - sentQ3).toFixed(2)) : 0;
  const burnout = deltaKpi > 0 && deltaSent < 0;

  const latestSkills = sorted[sorted.length - 1]?.skillProficiency || {};
  const skillValues = Object.values(latestSkills).map((v) => Number(v)).filter((n) => Number.isFinite(n));
  const currentSkill = Number((mean(skillValues) ?? 0).toFixed(2));
  const ceiling = roleCeiling(roleName);
  const overflow = Number(Math.max(0, currentSkill - ceiling).toFixed(2));
  const atMaxCount = sorted.filter((r) => {
    const vals = Object.values(r.skillProficiency || {}).map((v) => Number(v)).filter((n) => Number.isFinite(n));
    return vals.some((x) => x >= 10);
  }).length;
  const daysAtTen = atMaxCount * 90;
  const roleLevelChange = sorted.filter((r) => r.promoted === true).length;

  const mgrQ3 = positivityScoreFromNotes(q3.managerNotes);
  const mgrQ4 = positivityScoreFromNotes(q4.managerNotes);
  const mgrDelta = mgrQ4 - mgrQ3;
  const aiDelta = (Number.isFinite(sentQ4) && Number.isFinite(sentQ3)) ? (sentQ4 - sentQ3) : 0;
  const managerSlope = mgrDelta > 0 ? "positive" : mgrDelta < 0 ? "negative" : "stable";
  const aiSlope = aiDelta > 0 ? "positive" : aiDelta < 0 ? "negative" : "stable";
  const xCross = (mgrDelta * aiDelta) < 0;

  const predictive = analysisPayload?.predictiveSignals || {};
  const manager = (analysisPayload?.managerLayout?.managerName || managerName || "").toLowerCase();
  const peers = ((analysisPayload?.managerLayout?.employeesUnderManager || [])
    .map((n) => String(n || "").trim())
    .filter((n) => n && n.toLowerCase() !== String(employeeName || "").toLowerCase()));
  const forceSet = new Set((predictive.forceMultipliers || []).map((x) => String(x.employeeName || "").toLowerCase()));
  const riskSet = new Set((predictive.criticalSrsRisk || []).map((x) => String(x.employeeName || "").toLowerCase()));
  const highRiskSet = new Set((predictive.highPerformanceHighRisk || []).map((x) => String(x.employeeName || "").toLowerCase()));
  const dependents = peers.slice(0, 8).map((name, idx) => {
    const key = name.toLowerCase();
    const base = forceSet.has(key) ? 0.82 : riskSet.has(key) ? 0.4 : highRiskSet.has(key) ? 0.58 : (0.45 + ((idx % 4) * 0.1));
    const dependency = Number(Math.max(0.2, Math.min(0.95, base)).toFixed(2));
    return {
      name,
      dependency,
      color: dependency >= 0.75 ? "red" : dependency >= 0.55 ? "yellow" : "green",
      manager,
    };
  });
  const impactScore = Number(
    Math.min(
      100,
      Math.max(
        0,
        Math.round((overflow * 15) + (burnout ? 35 : 10) + (dependents.reduce((s, d) => s + d.dependency, 0) * 7))
      )
    )
  );

  return {
    phase_plane: {
      q3_coord: [Number.isFinite(kpiQ3) ? kpiQ3 : 0, Number.isFinite(sentQ3) ? Number(sentQ3.toFixed(2)) : 0],
      q4_coord: [Number.isFinite(kpiQ4) ? kpiQ4 : 0, Number.isFinite(sentQ4) ? Number(sentQ4.toFixed(2)) : 0],
      alert: burnout ? "Burnout" : "Stable",
      delta: { kpi: deltaKpi, sentiment: deltaSent },
    },
    skill_surplus: {
      current_skill: currentSkill,
      role_ceiling: ceiling,
      overflow,
      days_at_skill_10: daysAtTen,
      role_level_change: roleLevelChange,
    },
    calibration_x: {
      manager_slope: managerSlope,
      ai_slope: aiSlope,
      status: xCross ? "X-CROSS" : "ALIGNED",
      q3: { manager: mgrQ3, sentiment: Number.isFinite(sentQ3) ? Number(sentQ3.toFixed(2)) : 0 },
      q4: { manager: mgrQ4, sentiment: Number.isFinite(sentQ4) ? Number(sentQ4.toFixed(2)) : 0 },
    },
    blast_radius: {
      impact_score: impactScore,
      dependent_nodes: dependents,
    },
  };
}

function mapSkillWeb(role, skillMap) {
  const entries = Object.entries(skillMap || {})
    .map(([k, v]) => ({ key: String(k || "").toLowerCase(), value: Number(v) }))
    .filter((x) => Number.isFinite(x.value));
  const allAvg = mean(entries.map((x) => x.value)) ?? 6;
  const pick = (re) => {
    const vals = entries.filter((x) => re.test(x.key)).map((x) => x.value);
    return Number((mean(vals) ?? allAvg).toFixed(2));
  };
  const actual = {
    Technical: pick(/tech|code|dev|engineer|arch|system|qa|debug|crm|admin/),
    Leadership: pick(/lead|mentor|coach|people|manage|owner/),
    Strategy: pick(/strategy|planning|vision|negotiation|closing|roadmap/),
    Process: pick(/process|documentation|pipeline|compliance|report|discipline/),
    Collaboration: pick(/collab|team|communication|stakeholder|cross/),
    Innovation: pick(/innovation|automation|experiment|research|improv/),
  };
  const r = String(role || "").toLowerCase();
  const bench = /developer|engineer|qa/.test(r)
    ? { Technical: 8, Leadership: 6, Strategy: 6, Process: 7, Collaboration: 6, Innovation: 7 }
    : /sales|business/.test(r)
      ? { Technical: 5, Leadership: 6, Strategy: 8, Process: 7, Collaboration: 7, Innovation: 6 }
      : { Technical: 6, Leadership: 7, Strategy: 7, Process: 7, Collaboration: 7, Innovation: 6 };
  return { actual, bench };
}

function buildVisualAnalyticsPayload(records, predictive, managerName, role) {
  const sorted = [...(records || [])].sort(quarterSort);
  const scissorsRows = sorted.map((r, idx) => {
    const kpi = parseNum(r.kpiScore);
    const sentiment = Number(r.sentimentScore);
    const kpiArea = Number.isFinite(kpi) ? Number(((kpi / 130) * 100).toFixed(2)) : 0;
    const sentimentLine = Number.isFinite(sentiment) ? Number((sentiment * 100).toFixed(2)) : 0;
    const gap = Number((kpiArea - sentimentLine).toFixed(2));
    return {
      period: textOrFallback(r.quarter, `Q${idx + 1}`),
      kpi_area: kpiArea,
      sentiment_line: sentimentLine,
      gap,
    };
  });
  const divergenceZone = scissorsRows
    .filter((r) => r.gap > 30)
    .map((r, i) => ({ index: scissorsRows.indexOf(r), period: r.period, gap: r.gap }));

  const latestSkill = sorted[sorted.length - 1]?.skillProficiency || {};
  const skillPack = mapSkillWeb(role, latestSkill);
  const webPayload = {
    labels: ["Technical", "Leadership", "Strategy", "Process", "Collaboration", "Innovation"],
    target_benchmarks: skillPack.bench,
    actual_scores: skillPack.actual,
  };

  const calib = Array.isArray(predictive?.managerCalibration) ? predictive.managerCalibration : [];
  const points = calib.map((c) => Number(c.averagePotentialRating)).filter((n) => Number.isFinite(n));
  const median = quantile(points, 0.5) ?? 0;
  const q1 = quantile(points, 0.25) ?? median;
  const q3 = quantile(points, 0.75) ?? median;
  const current = calib.find((c) => String(c.managerName || "").toLowerCase().includes(String(managerName || "").toLowerCase()));
  const managerPoint = Number(current?.averagePotentialRating);
  const anomaly = Number.isFinite(managerPoint) ? Number((managerPoint - median).toFixed(2)) : 0;
  const distributionPayload = {
    company_median: Number(median.toFixed(2)),
    interquartile_range: [Number(q1.toFixed(2)), Number(q3.toFixed(2))],
    manager_current_point: Number.isFinite(managerPoint) ? Number(managerPoint.toFixed(2)) : 0,
    anomaly_distance: anomaly,
  };

  const collabAvg = mean(sorted.map((r) => Number(r.collaborationIndex)).filter((n) => Number.isFinite(n))) ?? 0.6;
  const sentAvg = mean(sorted.map((r) => Number(r.sentimentScore)).filter((n) => Number.isFinite(n))) ?? 0.6;
  const latest = sorted[sorted.length - 1] || {};
  const kpiLatest = parseNum(latest.kpiScore) || 90;
  const srsProxy = Math.max(0, Math.min(10, Number(((sentAvg * 6) + (collabAvg * 3) + (kpiLatest > 105 && sentAvg < 0.6 ? -2 : 1)).toFixed(2))));
  const baseFreq = Math.max(2, Math.round(collabAvg * 12));
  const mgmtFreq = Math.max(0, Math.round(baseFreq * (sentAvg < 0.45 ? 0.2 : 0.8)));
  const peerAFreq = Math.max(1, Math.round(baseFreq * 1.1));
  const peerBFreq = Math.max(1, Math.round(baseFreq * 0.95));
  const peerCFreq = Math.max(1, Math.round(baseFreq * 0.85));
  const colorFor = (freq, s) => {
    if (freq >= 7 && s >= 0.7) return "green";
    if (freq >= 7 && s >= 0.5) return "orange";
    if (freq >= 7) return "red";
    return "green";
  };
  const collaborationNetwork = {
    center_node: { name: selectedEmployee, size: 9, resilience_score: srsProxy },
    peer_nodes: [
      { name: "Team A", size: Number((Math.max(3, Math.min(10, srsProxy + 1.2))).toFixed(2)), resilience_score: Number((srsProxy + 1.2).toFixed(2)) },
      { name: "Team B", size: Number((Math.max(3, Math.min(10, srsProxy + 0.4))).toFixed(2)), resilience_score: Number((srsProxy + 0.4).toFixed(2)) },
      { name: "Team C", size: Number((Math.max(3, Math.min(10, srsProxy - 0.6))).toFixed(2)), resilience_score: Number((srsProxy - 0.6).toFixed(2)) },
      { name: "Management", size: Number((Math.max(3, Math.min(10, srsProxy - 0.9))).toFixed(2)), resilience_score: Number((srsProxy - 0.9).toFixed(2)) },
    ],
    edges: [
      { source: selectedEmployee, target: "Team A", value: peerAFreq, ribbon_thickness: peerAFreq, sentiment_color: colorFor(peerAFreq, sentAvg) },
      { source: selectedEmployee, target: "Team B", value: peerBFreq, ribbon_thickness: peerBFreq, sentiment_color: colorFor(peerBFreq, sentAvg) },
      { source: selectedEmployee, target: "Team C", value: peerCFreq, ribbon_thickness: peerCFreq, sentiment_color: colorFor(peerCFreq, sentAvg) },
      { source: selectedEmployee, target: "Management", value: mgmtFreq, ribbon_thickness: mgmtFreq, sentiment_color: colorFor(mgmtFreq, sentAvg) },
    ],
  };
  const maxPeerEdge = Math.max(peerAFreq, peerBFreq, peerCFreq);
  const anomalyFlag = mgmtFreq === 0 && maxPeerEdge >= 10 ? "Management Shadowing" : "";
  const chordPayload = {
    employee: selectedEmployee,
    collaboration_network: collaborationNetwork,
    anomaly_flag: anomalyFlag,
  };

  return {
    scissors_payload: {
      quarters: scissorsRows,
      divergence_zone: divergenceZone,
    },
    web_payload: webPayload,
    distribution_payload: distributionPayload,
    chord_payload: chordPayload,
  };
}

function renderScissorsArea(payload) {
  if (!payload?.quarters?.length) {
    scissorsAreaSvgEl.innerHTML = "";
    return;
  }
  const rows = payload.quarters;
  const xFor = (i) => 26 + ((268 * i) / Math.max(1, rows.length - 1));
  const yForPct = (v) => 126 - (Math.max(0, Math.min(100, v)) * 0.94);
  const kpiPts = rows.map((r, i) => `${xFor(i)},${yForPct(r.kpi_area)}`).join(" ");
  const sentPts = rows.map((r, i) => `${xFor(i)},${yForPct(r.sentiment_line)}`).join(" ");
  const shade = rows
    .filter((r) => r.gap > 30)
    .map((r) => {
      const i = rows.indexOf(r);
      const x = xFor(i);
      return `<rect x="${x - 12}" y="20" width="24" height="106" fill="rgba(255,111,125,0.14)"></rect>`;
    })
    .join("");
  const labels = rows.map((r, i) => `<text x="${xFor(i)}" y="142" fill="#8ea0af" font-size="9" text-anchor="middle">${r.period}</text>`).join("");
  const yTicks = [0, 50, 100].map((v) => `<text x="20" y="${yForPct(v)}" fill="#8ea0af" font-size="8" text-anchor="end">${v}</text>`).join("");
  const xTicks = rows.map((_, i) => `<text x="${xFor(i)}" y="148" fill="#8ea0af" font-size="8" text-anchor="middle">${i + 1}</text>`).join("");
  scissorsAreaSvgEl.innerHTML =
    `<line x1="26" y1="126" x2="294" y2="126" stroke="#244050" stroke-width="1"></line>` +
    `<line x1="26" y1="20" x2="26" y2="126" stroke="#244050" stroke-width="1"></line>` +
    yTicks +
    shade +
    `<polygon points="${kpiPts} ${rows.map((_, i) => `${xFor(rows.length - 1 - i)},126`).join(" ")}" fill="rgba(125,228,240,0.15)"></polygon>` +
    `<polyline fill="none" stroke="#7de4f0" stroke-width="2" points="${kpiPts}"></polyline>` +
    `<polyline fill="none" stroke="#ff8f98" stroke-width="2" points="${sentPts}"></polyline>` +
    `<text x="292" y="18" fill="#ff8f98" font-size="9" text-anchor="end">Burnout gap &gt; 30%</text>` +
    `<text x="18" y="16" fill="#8ea0af" font-size="8">Y%</text>` +
    `<text x="294" y="148" fill="#8ea0af" font-size="8" text-anchor="end">X index</text>` +
    labels +
    xTicks;
}

function renderSkillWeb(payload) {
  if (!payload?.labels?.length) {
    skillWebSvgEl.innerHTML = "";
    return;
  }
  const labels = payload.labels;
  const cx = 160;
  const cy = 92;
  const r = 64;
  const ring = [0.25, 0.5, 0.75, 1].map((m) => `<circle cx="${cx}" cy="${cy}" r="${(r * m).toFixed(2)}" fill="none" stroke="#294354" stroke-width="1"></circle>`).join("");
  const pointFor = (value, idx) => {
    const a = (-Math.PI / 2) + ((idx * Math.PI * 2) / labels.length);
    const rr = (Math.max(0, Math.min(10, Number(value) || 0)) / 10) * r;
    return `${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`;
  };
  const actualPts = labels.map((k, i) => pointFor(payload.actual_scores[k], i)).join(" ");
  const benchPts = labels.map((k, i) => pointFor(payload.target_benchmarks[k], i)).join(" ");
  const axes = labels.map((k, i) => {
    const a = (-Math.PI / 2) + ((i * Math.PI * 2) / labels.length);
    const x = cx + Math.cos(a) * (r + 12);
    const y = cy + Math.sin(a) * (r + 12);
    return `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(a) * r}" y2="${cy + Math.sin(a) * r}" stroke="#244050" stroke-width="1"></line>
            <text x="${x}" y="${y}" fill="#8ea0af" font-size="8" text-anchor="middle">${k}</text>`;
  }).join("");
  skillWebSvgEl.innerHTML =
    ring +
    axes +
    `<polygon points="${benchPts}" fill="rgba(100,219,179,0.12)" stroke="#64dbb3" stroke-width="1.5"></polygon>` +
    `<polygon points="${actualPts}" fill="rgba(125,228,240,0.2)" stroke="#7de4f0" stroke-width="1.5"></polygon>` +
    `<text x="18" y="176" fill="#7de4f0" font-size="8">Actual</text><text x="72" y="176" fill="#64dbb3" font-size="8">Benchmark</text>`;
}

function renderBiasDistribution(payload) {
  const median = Number(payload?.company_median);
  const iqr = payload?.interquartile_range || [0, 0];
  const current = Number(payload?.manager_current_point);
  if (!Number.isFinite(median)) {
    biasDistributionSvgEl.innerHTML = "";
    return;
  }
  const maxVal = Math.max(12, median + 4, Number(iqr[1]) + 3, current + 3);
  const xFor = (v) => 24 + ((Math.max(0, Math.min(maxVal, v)) / maxVal) * 272);
  biasDistributionSvgEl.innerHTML =
    `<line x1="24" y1="80" x2="296" y2="80" stroke="#244050" stroke-width="1"></line>` +
    `<rect x="${xFor(iqr[0])}" y="68" width="${Math.max(2, xFor(iqr[1]) - xFor(iqr[0]))}" height="24" fill="rgba(100,219,179,0.2)" stroke="#64dbb3" stroke-width="1.2"></rect>` +
    `<line x1="${xFor(median)}" y1="64" x2="${xFor(median)}" y2="96" stroke="#ffd979" stroke-width="2"></line>` +
    `<circle cx="${xFor(current)}" cy="80" r="5" fill="#ff8f98" stroke="#ffd1d6" stroke-width="1"></circle>` +
    `<text x="${xFor(median)}" y="58" fill="#ffd979" font-size="8" text-anchor="middle">Median ${median}</text>` +
    `<text x="${xFor(current)}" y="108" fill="#ff8f98" font-size="8" text-anchor="middle">Manager ${current}</text>` +
    `<text x="24" y="124" fill="#8ea0af" font-size="8">IQR [${iqr[0]} - ${iqr[1]}] | Anomaly ${payload.anomaly_distance}</text>`;
}

function renderCollabChord(payload) {
  const network = payload?.collaboration_network;
  const ribbons = network?.edges || [];
  const peerNodes = network?.peer_nodes || [];
  if (!ribbons.length) {
    collabChordSvgEl.innerHTML = "";
    return;
  }
  const cx = 160;
  const cy = 85;
  const edgeColor = (c) => (c === "red" ? "rgba(255,111,125,0.8)" : c === "orange" ? "rgba(246,185,95,0.82)" : "rgba(100,219,179,0.8)");
  const nodes = [
    { name: payload.employee || "Employee", x: cx, y: cy, size: 9 },
    { name: "Team A", x: 62, y: 32, size: Number(peerNodes.find((n) => n.name === "Team A")?.size || 5) },
    { name: "Team B", x: 258, y: 32, size: Number(peerNodes.find((n) => n.name === "Team B")?.size || 5) },
    { name: "Team C", x: 62, y: 138, size: Number(peerNodes.find((n) => n.name === "Team C")?.size || 5) },
    { name: "Management", x: 258, y: 138, size: Number(peerNodes.find((n) => n.name === "Management")?.size || 5) },
  ];
  const nodeMap = new Map(nodes.map((n) => [n.name, n]));
  const paths = ribbons.map((r) => {
    const t = nodeMap.get(r.target);
    if (!t) return "";
    const w = Math.max(1.2, Math.min(8, Number(r.value) / 2));
    return `<path d="M ${cx} ${cy} Q ${(cx + t.x) / 2} ${(cy + t.y) / 2 - 18} ${t.x} ${t.y}" stroke="${edgeColor(r.sentiment_color)}" stroke-width="${w}" fill="none"></path>`;
  }).join("");
  const nodeEls = nodes.map((n) => `<circle cx="${n.x}" cy="${n.y}" r="${Math.max(4, Math.min(10, n.size))}" fill="${n.name === (payload.employee || "Employee") ? "#7de4f0" : "#64dbb3"}"></circle><text x="${n.x}" y="${n.y - 12}" fill="#8ea0af" font-size="8" text-anchor="middle">${n.name}</text>`).join("");
  const anomaly = payload?.anomaly_flag ? `<text x="160" y="164" fill="#ff8f98" font-size="9" text-anchor="middle">${payload.anomaly_flag}</text>` : "";
  collabChordSvgEl.innerHTML = paths + nodeEls + anomaly;
}

function renderLongitudinalPhasePlane(payload) {
  if (!longitudinalPhaseSvgEl || !payload) return;
  const q3 = payload.phase_plane?.q3_coord || [0, 0];
  const q4 = payload.phase_plane?.q4_coord || [0, 0];
  const alert = String(payload.phase_plane?.alert || "Stable");
  const maxKpi = Math.max(130, q3[0], q4[0], 1);
  const xFor = (kpi) => 30 + ((Math.max(0, Math.min(maxKpi, Number(kpi) || 0)) / maxKpi) * 260);
  const yFor = (sent) => 132 - (Math.max(0, Math.min(1, Number(sent) || 0)) * 104);
  const q3x = xFor(q3[0]); const q3y = yFor(q3[1]);
  const q4x = xFor(q4[0]); const q4y = yFor(q4[1]);
  const burnoutLine = alert === "Burnout";
  const yTicks = [0, 0.5, 1].map((v) => `<text x="24" y="${yFor(v)}" fill="#8ea0af" font-size="8" text-anchor="end">${v.toFixed(1)}</text>`).join("");
  const xTicks = [0, Math.round(maxKpi / 2), Math.round(maxKpi)].map((v) => `<text x="${xFor(v)}" y="148" fill="#8ea0af" font-size="8" text-anchor="middle">${v}</text>`).join("");
  longitudinalPhaseSvgEl.innerHTML =
    `<line x1="30" y1="132" x2="292" y2="132" stroke="#244050" stroke-width="1"></line>` +
    `<line x1="30" y1="24" x2="30" y2="132" stroke="#244050" stroke-width="1"></line>` +
    yTicks + xTicks +
    `<line x1="${q3x}" y1="${q3y}" x2="${q4x}" y2="${q4y}" stroke="${burnoutLine ? "#ff5f74" : "#7de4f0"}" stroke-width="${burnoutLine ? 3 : 2}" class="${burnoutLine ? "phase-burnout-vector" : ""}"></line>` +
    `<circle cx="${q3x}" cy="${q3y}" r="4.5" fill="#64dbb3"></circle>` +
    `<circle cx="${q4x}" cy="${q4y}" r="5" fill="${burnoutLine ? "#ff5f74" : "#7de4f0"}" class="${burnoutLine ? "pulse-dot-red" : "pulse-dot"}"></circle>` +
    `<text x="${q3x + 6}" y="${q3y - 6}" fill="#9be7d8" font-size="8">Q3</text>` +
    `<text x="${q4x + 6}" y="${q4y - 6}" fill="${burnoutLine ? "#ff9aa5" : "#9fdfee"}" font-size="8">Q4</text>` +
    `<text x="292" y="18" fill="${burnoutLine ? "#ff9aa5" : "#8ea0af"}" font-size="9" text-anchor="end">${burnoutLine ? "Aggressive Burnout Slope" : "Stable / Recovering"}</text>` +
    `<text x="292" y="160" fill="#8ea0af" font-size="8" text-anchor="end">X: KPI</text>` +
    `<text x="14" y="18" fill="#8ea0af" font-size="8">Y: Sentiment</text>`;
}

function renderSkillSurplusBullet(payload) {
  if (!skillSurplusBulletEl || !payload?.skill_surplus) return;
  const s = payload.skill_surplus;
  const ceilingPct = Math.max(0, Math.min(100, (Number(s.role_ceiling) / 10) * 100));
  const actualPct = Math.max(0, Math.min(100, (Number(s.current_skill) / 10) * 100));
  const overflowPct = Math.max(0, actualPct - ceilingPct);
  skillSurplusBulletEl.innerHTML =
    `<div class="bullet-track">` +
      `<div class="bullet-ceiling" style="width:${ceilingPct}%"></div>` +
      `<div class="bullet-actual" style="width:${Math.min(actualPct, ceilingPct)}%"></div>` +
      `<div class="bullet-overflow" style="left:${ceilingPct}%;width:${overflowPct}%"></div>` +
    `</div>` +
    `<div class="bullet-legend">` +
      `<span>Skill ${Number(s.current_skill).toFixed(2)}</span>` +
      `<span>Role Ceiling ${s.role_ceiling}</span>` +
      `<span>Overflow ${Number(s.overflow).toFixed(2)}</span>` +
    `</div>` +
    `<div class="bullet-meta">Days@Skill10: ${s.days_at_skill_10 || 0} | Role Changes: ${s.role_level_change || 0}</div>`;
}

function renderCalibrationX(payload) {
  if (!calibrationXSvgEl || !payload?.calibration_x) return;
  const p = payload.calibration_x;
  const yMgr = (v) => 132 - ((Math.max(0, Math.min(2, Number(v) || 0)) / 2) * 104);
  const yAi = (v) => 132 - (Math.max(0, Math.min(1, Number(v) || 0)) * 104);
  const q3Mgr = yMgr(p.q3?.manager);
  const q4Mgr = yMgr(p.q4?.manager);
  const q3Ai = yAi(p.q3?.sentiment);
  const q4Ai = yAi(p.q4?.sentiment);
  const crossed = String(p.status || "") === "X-CROSS";
  calibrationXSvgEl.innerHTML =
    `<line x1="90" y1="24" x2="90" y2="132" stroke="#2a4556" stroke-width="1.2"></line>` +
    `<line x1="240" y1="24" x2="240" y2="132" stroke="#2a4556" stroke-width="1.2"></line>` +
    `<text x="90" y="146" fill="#8ea0af" font-size="8" text-anchor="middle">Manager (0-2)</text>` +
    `<text x="240" y="146" fill="#8ea0af" font-size="8" text-anchor="middle">AI Sentiment (0-1)</text>` +
    `<line x1="90" y1="${q3Mgr}" x2="240" y2="${q3Ai}" stroke="#64dbb3" stroke-width="2.2"></line>` +
    `<line x1="90" y1="${q4Mgr}" x2="240" y2="${q4Ai}" stroke="${crossed ? "#ff7e8e" : "#7de4f0"}" stroke-width="${crossed ? 2.8 : 2.2}"></line>` +
    `<circle cx="90" cy="${q3Mgr}" r="3.5" fill="#64dbb3"></circle><circle cx="240" cy="${q3Ai}" r="3.5" fill="#64dbb3"></circle>` +
    `<circle cx="90" cy="${q4Mgr}" r="3.8" fill="${crossed ? "#ff7e8e" : "#7de4f0"}"></circle><circle cx="240" cy="${q4Ai}" r="3.8" fill="${crossed ? "#ff7e8e" : "#7de4f0"}"></circle>` +
    `<text x="30" y="18" fill="${crossed ? "#ff9aa5" : "#8ea0af"}" font-size="9">${crossed ? "MANAGER DISCONNECT (X-CROSS)" : "Calibration Aligned"}</text>` +
    `<text x="18" y="${q3Mgr - 4}" fill="#9be7d8" font-size="8">Q3</text>` +
    `<text x="18" y="${q4Mgr - 4}" fill="${crossed ? "#ff9aa5" : "#9fdfee"}" font-size="8">Q4</text>`;
}

function renderBlastRadius(payload, employeeName) {
  if (!blastRadiusSvgEl || !payload?.blast_radius) return;
  const b = payload.blast_radius;
  const nodes = Array.isArray(b.dependent_nodes) ? b.dependent_nodes : [];
  const cx = 160; const cy = 95;
  const centerR = Math.max(14, Math.min(26, 14 + ((Number(b.impact_score) || 0) / 10)));
  const ring = `<circle cx="${cx}" cy="${cy}" r="${centerR + 6}" fill="none" stroke="rgba(255,143,152,0.45)" stroke-width="2" class="blast-halo"></circle>`;
  const peerEls = nodes.slice(0, 8).map((n, idx) => {
    const angle = (-Math.PI / 2) + ((idx * Math.PI * 2) / Math.max(1, Math.min(nodes.length, 8)));
    const radius = 66;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    const dep = Number(n.dependency) || 0;
    const r = Math.max(7, Math.min(14, 7 + dep * 7));
    const color = n.color === "red" ? "#ff6f7d" : n.color === "yellow" ? "#f6b95f" : "#64dbb3";
    return (
      `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${color}" stroke-opacity="0.8" stroke-width="${Math.max(1, dep * 3)}"></line>` +
      `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" fill-opacity="0.78"></circle>` +
      `<text x="${x}" y="${y - r - 4}" fill="#a9c1cf" font-size="7.5" text-anchor="middle">${escHtml(String(n.name || ""))}</text>`
    );
  }).join("");
  blastRadiusSvgEl.innerHTML =
    ring +
    peerEls +
    `<circle cx="${cx}" cy="${cy}" r="${centerR}" fill="#7de4f0" fill-opacity="0.88"></circle>` +
    `<text x="${cx}" y="${cy + 3}" fill="#0a141b" font-size="8" text-anchor="middle">${escHtml(employeeName || "Employee")}</text>` +
    `<text x="16" y="18" fill="#ff9aa5" font-size="9">Strategic Exit Risk: ${Number(b.impact_score) || 0}</text>`;
}

function openDashboardGraphZoom(title, html) {
  if (!dashboardGraphZoomDialogEl || !dashboardGraphZoomBodyEl || !dashboardGraphZoomTitleEl || !dashboardGraphZoomViewportEl) return;
  dashboardGraphZoomTitleEl.textContent = title;
  dashboardGraphZoomBodyEl.innerHTML = html;
  dashboardGraphZoom = 1;
  dashboardGraphZoomViewportEl.style.setProperty("--zoom", String(dashboardGraphZoom));
  if (typeof dashboardGraphZoomDialogEl.showModal === "function") dashboardGraphZoomDialogEl.showModal();
}

function bindDashboardGraphZoom() {
  [
    { el: kpiBarChartEl, title: "KPI Across Quarters" },
    { el: trendSvgEl, title: "Sentiment + Collaboration" },
    { el: scissorsAreaSvgEl, title: "Scissors Area" },
    { el: skillWebSvgEl, title: "Skill Web" },
    { el: biasDistributionSvgEl, title: "Bias Distribution" },
    { el: collabChordSvgEl, title: "Collaboration Chord" },
    { el: longitudinalPhaseSvgEl, title: "Burnout Velocity (Phase Plane)" },
    { el: skillSurplusBulletEl, title: "Skill Stagnation Overflow" },
    { el: calibrationXSvgEl, title: "Calibration Disconnect (X-Cross)" },
    { el: blastRadiusSvgEl, title: "Blast Radius (Dependency Map)" },
  ].forEach(({ el, title }) => {
    if (!el) return;
    el.style.cursor = "zoom-in";
    if (!el.dataset.zoomBound) {
      el.addEventListener("click", () => openDashboardGraphZoom(title, el.outerHTML));
      el.dataset.zoomBound = "1";
    }
  });
}

function bindDialogBackdropClose(dialogEl) {
  if (!dialogEl || dialogEl.dataset.backdropCloseBound === "1") return;
  dialogEl.addEventListener("click", (event) => {
    const rect = dialogEl.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!inside && typeof dialogEl.close === "function") {
      dialogEl.close();
    }
  });
  dialogEl.dataset.backdropCloseBound = "1";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function extractEmployeeName(item) {
  if (typeof item === "string") {
    const fromArrow = item.match(/->\s*([^(]+)\s*\(/i);
    if (fromArrow && fromArrow[1]) return fromArrow[1].trim();
    const fromColon = item.match(/:\s*([^()]+)\s*\(/i);
    if (fromColon && fromColon[1]) return fromColon[1].trim();
    return item.split(":")[0]?.trim() || "Unknown";
  }
  if (item && typeof item === "object") {
    return String(
      item.employeeName ||
      item.employee_name ||
      item.name ||
      item.employee ||
      item.person ||
      ""
    ).trim() || "Unknown";
  }
  return "Unknown";
}

function buildRowsFromPredictiveSignals(predictive) {
  const rows = [];
  const addRows = (arr, category, evidenceBuilder) => {
    (Array.isArray(arr) ? arr : []).forEach((item) => {
      const name = extractEmployeeName(item);
      rows.push({
        employee: String(name),
        category,
        evidence: evidenceBuilder(item),
      });
    });
  };
  addRows(predictive?.highPerformanceHighRisk, "High Performance, High Risk", (x) =>
    `KPI ${x?.kpiScore ?? x?.kpi ?? "N/A"}, Sentiment ${x?.sentimentScore ?? x?.sentiment ?? "N/A"}, Flight ${x?.flightRiskProbability ?? x?.flightRisk ?? "N/A"}`
  );
  addRows(predictive?.forceMultipliers, "Force Multiplier", (x) =>
    `Collaboration ${x?.collaborationIndex ?? x?.collaboration ?? "N/A"}, KPI ${x?.kpiStart ?? "N/A"} -> ${x?.kpiEnd ?? x?.kpi ?? "N/A"}`
  );
  addRows(predictive?.sentimentManagerDisconnects, "Sentiment/Manager Disconnect", (x) =>
    typeof x === "string"
      ? x
      : `Sentiment ${x?.sentimentScore ?? x?.sentiment ?? "N/A"} with manager note mismatch`
  );
  addRows(predictive?.criticalSrsRisk, "Critical SRS Risk", (x) =>
    `KPI ${x?.kpiScore ?? x?.kpi ?? "N/A"}, SRS ${x?.syntheticResilience ?? x?.resilience ?? "N/A"}`
  );
  return rows;
}

function renderMatrixTable(matrixText, predictive = null) {
  const lines = String(matrixText || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const tableLines = lines.filter((l) => l.startsWith("|") && l.endsWith("|"));
  if (tableLines.length < 2) {
    const fallbackRows = buildRowsFromPredictiveSignals(predictive);
    if (!fallbackRows.length) {
      const text = textOrFallback(matrixText, "No matrix data.");
      riskMatrixBlockEl.textContent = text;
      latestRiskMatrixHtml = `<div class="insight-content">${escapeHtml(text)}</div>`;
      return;
    }
    const thead = `<thead><tr><th>Employee</th><th>Category</th><th>Evidence</th></tr></thead>`;
    const tbody = `<tbody>${fallbackRows.map((r) => `<tr><td>${escapeHtml(r.employee)}</td><td>${escapeHtml(r.category)}</td><td>${escapeHtml(r.evidence)}</td></tr>`).join("")}</tbody>`;
    const html = `<table class="matrix-table">${thead}${tbody}</table>`;
    latestRiskMatrixHtml = html;
    riskMatrixBlockEl.textContent = `Table ready with ${fallbackRows.length} rows. Click 'View Matrix Table'.`;
    return;
  }

  const rows = tableLines
    .map((l) => l.slice(1, -1).split("|").map((c) => c.trim()))
    .filter((r) => r.length >= 3);
  const header = rows[0];
  const bodyRows = rows.slice(1).filter((r) => !r.every((c) => /^-+$/.test(c.replace(/\s+/g, ""))));
  if (!bodyRows.length) {
    riskMatrixBlockEl.textContent = "No matrix rows available.";
    latestRiskMatrixHtml = `<div class="insight-content">No matrix rows available.</div>`;
    return;
  }

  const thead = `<thead><tr>${header.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${bodyRows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  latestRiskMatrixHtml = `<table class="matrix-table">${thead}${tbody}</table>`;
  riskMatrixBlockEl.textContent = `Table ready with ${bodyRows.length} rows. Click 'View Matrix Table'.`;
}

function renderDashboard(layouts, analysisPayload) {
  const employeeLayout = layouts.employeeLayout || {};
  const managerLayout = layouts.managerLayout || {};
  const records = Array.isArray(employeeLayout.quarterRecords) ? employeeLayout.quarterRecords : [];
  const analysis = analysisPayload.analysis || {};
  const ruleSignals = analysisPayload.ruleSignals || {};
  const predictive = analysisPayload.predictiveSignals || {};
  const internalInvestigation = analysisPayload.internalInvestigation || latestInternalInvestigation || {};
  const talentGuardian = analysisPayload.talentGuardian || {};
  latestTalentGuardian = talentGuardian;
  const biasFlags = Array.isArray(analysis.biasFlags) ? analysis.biasFlags : [];

  flagsCountEl.textContent = String(biasFlags.length);
  llmModeEl.textContent = analysis.llmUsed ? "LLM" : "Fallback";
  employeeAvatarEl.textContent = initials(employeeLayout.employeeName);
  employeeIdentityEl.textContent =
    `${textOrFallback(employeeLayout.employeeName)} | ${textOrFallback(employeeLayout.role)} | Manager: ${textOrFallback(employeeLayout.managerName)}`;

  renderKpiBars(records);
  drawTrendSvg(records);
  renderSkillTrends(records);
  renderManagerCalibration(predictive.managerCalibration || []);
  const visualPayload = buildVisualAnalyticsPayload(records, predictive, employeeLayout.managerName || selectedManager, employeeLayout.role);
  renderScissorsArea(visualPayload.scissors_payload);
  renderSkillWeb(visualPayload.web_payload);
  renderBiasDistribution(visualPayload.distribution_payload);
  renderCollabChord(visualPayload.chord_payload);
  const longitudinalPayload = buildLongitudinalPayload(
    records,
    analysisPayload,
    employeeLayout.managerName || selectedManager,
    employeeLayout.employeeName || selectedEmployee,
    employeeLayout.role
  );
  renderLongitudinalPhasePlane(longitudinalPayload);
  renderSkillSurplusBullet(longitudinalPayload);
  renderCalibrationX(longitudinalPayload);
  renderBlastRadius(longitudinalPayload, employeeLayout.employeeName || selectedEmployee);
  if (longitudinalSummaryEl) longitudinalSummaryEl.textContent = "";
  bindDashboardGraphZoom();

  employeeOverviewBlockEl.textContent =
    `Name: ${textOrFallback(employeeLayout.employeeName)}\n` +
    `Role: ${textOrFallback(employeeLayout.role)}\n` +
    `KPI Range: ${employeeLayout.kpiAverage ?? "N/A"} avg (${textOrFallback(analysis.kpiVariation, "No KPI variation text")})\n` +
    `Promotions: ${(employeeLayout.promotedQuarters || []).join(", ") || "None"}`;
  const managerTakeSynth = buildManagerTakeSummary(records);
  const managerTakeText = textOrFallback(analysis.managerOverallTake, "");
  managerTakeBlockEl.textContent =
    managerTakeText && !/not generated|n\/a/i.test(managerTakeText)
      ? `${managerTakeText}\n\nOverall Summary: ${managerTakeSynth}`
      : managerTakeSynth;
  trajectoryBlockEl.textContent = textOrFallback(analysis.trajectoryPrediction, "Not generated.");
  renderMatrixTable(analysis.riskSuccessMatrixTable, predictive);

  managerPatternBlockEl.textContent = textOrFallback(analysis.managerPattern, "Not generated.");
  managerBiasBlockEl.textContent = textOrFallback(analysis.managerBiasReport, "Not generated.");
  managerCalibrationTextEl.textContent = textOrFallback(analysis.managerCalibrationSummary, "Not generated.");
  recommendationBlockEl.textContent = textOrFallback(analysis.strategicRecommendation2027, "Not generated.");
  const invRows = Array.isArray(internalInvestigation.employeeInvestigations)
    ? internalInvestigation.employeeInvestigations
    : [];
  const selectedInv = invRows.find(
    (r) => String(r.employeeName || "").toLowerCase() === String(selectedEmployee || "").toLowerCase()
  );
  if (!latestInternalInvestigation) {
    internalInvestigationBlockEl.textContent = "AI audit report not generated yet. Click 'Generate AI Audit Report'.";
  } else {
    const reportText = selectedInv
      ? `INTERNAL AI AUDIT: ${selectedInv.employeeName} (${selectedInv.role})\n` +
        `Manager: ${textOrFallback(selectedInv.managerName, "N/A")}\n` +
        `SRS: ${selectedInv.srs ?? "N/A"}/10 (${textOrFallback(selectedInv.srsCategory, "N/A")})\n\n` +
        `Clinical Diagnosis: ${textOrFallback(selectedInv.clinicalDiagnosis, selectedInv.primaryDiagnosis || selectedInv.primaryBlocker || "N/A")}\n` +
        `Risk/Exhaustion Index: ${selectedInv.riskExhaustionIndex ?? "N/A"}\n` +
        `Silent Blocker: ${textOrFallback(selectedInv.silentBlocker, "N/A")}\n\n` +
        `DATA CORRELATION\n` +
        `Sustainability Analysis: ${textOrFallback(selectedInv.sustainabilityAnalysis, "N/A")}\n` +
        `Manager Calibration: ${textOrFallback(selectedInv.managerCalibration, selectedInv.managerAwarenessAlert || "N/A")}\n\n` +
        `PEER DELEGATION PLAN\n` +
        `Recommendation: ${textOrFallback(selectedInv.recommendation, "N/A")}\n` +
        `Task Type: ${textOrFallback(selectedInv.taskType, "N/A")}\n` +
        `Justification: ${textOrFallback(selectedInv.justification, "N/A")}`
      : `${selectedEmployee || "Selected employee"} has no investigation record in current result.`;

    const rec = String(selectedInv?.recommendation || "").toLowerCase();
    const needsDelegation = Boolean(selectedInv && (
      selectedInv.riskFlag ||
      (/external contractor|delegate|delegation|relief/i.test(rec) && !/does not currently require/i.test(rec))
    ));

    if (needsDelegation) {
      const btnLabel = `Generate optimal workload Plan for ${selectedInv.employeeName}`;
      internalInvestigationBlockEl.innerHTML =
        `${escHtml(reportText).replace(/\n/g, "<br>")}` +
        `<div style="margin-top:10px;">` +
        `<button type="button" id="generateWorkloadPlanBtn" class="btn-primary">${escHtml(btnLabel)}</button>` +
        `</div>`;
    } else {
      internalInvestigationBlockEl.textContent = reportText;
    }
  }

  const guardianAlerts = Array.isArray(talentGuardian.alerts) ? talentGuardian.alerts : [];
  const srsCritical = Array.isArray(predictive.criticalSrsRisk) ? predictive.criticalSrsRisk : [];
  const selectedAlert = guardianAlerts.find((a) => String(a.employeeName).toLowerCase() === String(selectedEmployee).toLowerCase());
  const flaggedNames = guardianAlerts.map((a) => `[HIGH RISK] ${a.employeeName}`).join(", ") || "None";
  const srsNames = srsCritical.map((a) => `[SRS-CRITICAL] ${a.employeeName}`).join(", ") || "None";
  const selectedSrsCritical = srsCritical.find(
    (a) => String(a.employeeName).toLowerCase() === String(selectedEmployee).toLowerCase()
  );
  predictiveSignalsBlockEl.classList.toggle("high-risk-text", guardianAlerts.length > 0 || srsCritical.length > 0);
  predictiveSignalsBlockEl.textContent =
    `Talent Guardian Rule: ${textOrFallback(talentGuardian.rule, "kpi_score > 95 AND sentiment_score < 0.60")}\n` +
    `Talent Guardian Alerts: ${guardianAlerts.length}\n` +
    `Flagged Employees: ${flaggedNames}\n\n` +
    `Critical SRS Risk (KPI>90 & SRS<4): ${srsCritical.length}\n` +
    `SRS Critical Employees: ${srsNames}\n\n` +
    `High Performance, High Risk: ${(predictive.highPerformanceHighRisk || []).length}\n` +
    `Force Multipliers: ${(predictive.forceMultipliers || []).length}\n` +
    `Sentiment/Manager Disconnects: ${(predictive.sentimentManagerDisconnects || []).length}\n` +
    `Rule Contradictions: ${(ruleSignals.contradictions || []).length}\n` +
    `Explicit Bias Flags: ${(ruleSignals.explicitFlags || []).length}\n` +
    `Final Bias Flags: ${biasFlags.length}`;

  if (selectedAlert?.interventionPackage || selectedSrsCritical) {
    const riskName = selectedAlert?.employeeName || selectedSrsCritical?.employeeName || selectedEmployee;
    riskActionStatusEl.textContent = `${riskName} is flagged as high risk. Use the actions below to draft mail or download package.`;
    interventionActionsEl.style.display = "flex";
  } else {
    riskActionStatusEl.textContent = `${selectedEmployee || "Selected employee"} isn't flagged for risk.`;
    interventionActionsEl.style.display = "none";
  }

  const m = getManagerByName(selectedManager);
  if (m && !managerLayout.managerName) {
    managerPatternBlockEl.textContent = `Selected Manager: ${selectedManager} (${m.employees.length} employees).\n` + managerPatternBlockEl.textContent;
  }
}

function resetDashboard() {
  flagsCountEl.textContent = "0";
  llmModeEl.textContent = "-";
  employeeAvatarEl.textContent = "--";
  employeeIdentityEl.textContent = "Select manager and employee to load analytics.";
  kpiBarChartEl.innerHTML = "";
  trendSvgEl.innerHTML = "";
  scissorsAreaSvgEl.innerHTML = "";
  skillWebSvgEl.innerHTML = "";
  biasDistributionSvgEl.innerHTML = "";
  collabChordSvgEl.innerHTML = "";
  if (longitudinalPhaseSvgEl) longitudinalPhaseSvgEl.innerHTML = "";
  if (skillSurplusBulletEl) skillSurplusBulletEl.innerHTML = "No data yet.";
  if (calibrationXSvgEl) calibrationXSvgEl.innerHTML = "";
  if (blastRadiusSvgEl) blastRadiusSvgEl.innerHTML = "";
  if (longitudinalSummaryEl) longitudinalSummaryEl.textContent = "";
  employeeOverviewBlockEl.textContent = "No data yet.";
  skillTrendsBlockEl.textContent = "No data yet.";
  managerTakeBlockEl.textContent = "No data yet.";
  trajectoryBlockEl.textContent = "No data yet.";
  riskMatrixBlockEl.textContent = "No data yet.";
  latestRiskMatrixHtml = "";
  managerPatternBlockEl.textContent = "No data yet.";
  managerBiasBlockEl.textContent = "No data yet.";
  managerCalibrationChartEl.innerHTML = "";
  managerCalibrationTextEl.textContent = "No data yet.";
  predictiveSignalsBlockEl.textContent = "No data yet.";
  predictiveSignalsBlockEl.classList.remove("high-risk-text");
  recommendationBlockEl.textContent = "No data yet.";
  internalInvestigationBlockEl.textContent = "AI audit report not generated yet. Click 'Generate AI Audit Report'.";
  generateAuditBtn.style.display = "none";
  riskActionStatusEl.textContent = "No risk status yet.";
  interventionActionsEl.style.display = "none";
  latestTalentGuardian = null;
  latestInternalInvestigation = null;
  latestAnalysisPayload = null;
}

function getManagerByName(name) {
  return (hierarchy.managers || []).find((m) => m.name === name);
}

function populateManagers() {
  managerSelectEl.innerHTML = "<option value=\"\">Select manager</option>";
  (hierarchy.managers || []).forEach((manager) => {
    const opt = document.createElement("option");
    opt.value = manager.name;
    opt.textContent = `${manager.name} (${manager.employees.length} employees)`;
    managerSelectEl.appendChild(opt);
  });
}

function populateEmployeesForManager(managerName) {
  const manager = getManagerByName(managerName);
  employeeSelectEl.innerHTML = "";
  if (!manager) {
    employeeSelectEl.disabled = true;
    employeeSelectEl.innerHTML = "<option value=\"\">Select manager first</option>";
    return;
  }

  employeeSelectEl.disabled = false;
  employeeSelectEl.innerHTML = "<option value=\"\">Select employee</option>";
  manager.employees.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    employeeSelectEl.appendChild(opt);
  });
}

async function loadContextLayouts() {
  if (!selectedManager || !selectedEmployee) return null;
  statusBoxEl.textContent = "Loading dashboard context from uploaded quarterly JSONs...";
  const response = await fetch(`/api/context?manager=${encodeURIComponent(selectedManager)}&employee=${encodeURIComponent(selectedEmployee)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Context load failed (${response.status})`);
  return data;
}

async function runAnalysis() {
  if (!selectedManager || !selectedEmployee) {
    throw new Error("Both manager and employee selection are mandatory.");
  }
  statusBoxEl.textContent = "Analyzing all four quarters with LLM...";
  const response = await fetch("/api/analyze-performance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ managerName: selectedManager, employeeName: selectedEmployee }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Analysis failed (${response.status})`);
  return data;
}

async function runInvestigationAudit(managerName, employeeName) {
  const response = await fetch("/api/investigation-audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ managerName, employeeName }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Investigation audit failed (${response.status})`);
  return data.internalInvestigation || null;
}

async function loadTalentGuardianSnapshot() {
  const response = await fetch("/api/talent-guardian");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return data.talentGuardian || null;
}

async function bootstrap() {
  const meResp = await fetch("/api/auth/me");
  const me = await meResp.json().catch(() => ({}));
  if (!me.authenticated) {
    window.location.href = "/frontend/auth.html";
    return;
  }
  if (!me.upload?.complete && me.user?.type !== "guest") {
    window.location.href = "/frontend/upload.html";
    return;
  }
  if (me.user?.type === "guest") {
    manageReportsBtn.style.display = "none";
  } else {
    manageReportsBtn.style.display = "inline-flex";
  }

  const hierarchyResp = await fetch("/api/hierarchy");
  const hierarchyData = await hierarchyResp.json().catch(() => ({}));
  if (!hierarchyResp.ok) throw new Error(hierarchyData.error || "Could not load hierarchy.");

  hierarchy = {
    managers: Array.isArray(hierarchyData.managers) ? hierarchyData.managers : [],
    employees: Array.isArray(hierarchyData.employees) ? hierarchyData.employees : [],
  };
  managersCountEl.textContent = String(hierarchy.managers.length);
  employeesCountEl.textContent = String(hierarchy.employees.length);
  populateManagers();
}

managerSelectEl.addEventListener("change", () => {
  selectedManager = managerSelectEl.value;
  selectedEmployee = "";
  populateEmployeesForManager(selectedManager);
  resetDashboard();
  statusBoxEl.textContent = selectedManager ? "Manager selected. Select employee." : "Select both Manager and Employee to begin analysis.";
});

employeeSelectEl.addEventListener("change", async () => {
  selectedEmployee = employeeSelectEl.value;
  resetDashboard();
  if (!selectedManager || !selectedEmployee) {
    statusBoxEl.textContent = "Select both Manager and Employee to begin analysis.";
    return;
  }
  statusBoxEl.textContent = "Selection ready. Click Analyze Performance Report to load all details.";
});

analyzeBtn.addEventListener("click", async () => {
  try {
    const data = await runAnalysis();
    latestAnalysisPayload = data;
    renderDashboard(data, data);
    generateAuditBtn.style.display = "inline-flex";
    internalInvestigationBlockEl.textContent = "AI audit report not generated yet. Click 'Generate AI Audit Report'.";
    statusBoxEl.textContent = data.analysis?.llmUsed
      ? "Analysis complete (LLM)."
      : `Analysis complete (Fallback). ${data.analysis?.llmError ? `Reason: ${data.analysis.llmError}` : ""}`.trim();
  } catch (err) {
    statusBoxEl.textContent = `Error: ${err.message}`;
    llmModeEl.textContent = "-";
  }
});

workloadBtn.addEventListener("click", () => {
  const params = new URLSearchParams();
  if (selectedManager) params.set("manager", selectedManager);
  if (selectedEmployee) params.set("employee", selectedEmployee);
  const q = params.toString();
  window.location.href = `/frontend/workload.html${q ? `?${q}` : ""}`;
});

generateAuditBtn.addEventListener("click", async () => {
  if (!selectedManager || !selectedEmployee) {
    statusBoxEl.textContent = "Select manager and employee first.";
    return;
  }
  try {
    const auditMsg = `AI Audit report are being generated for ${selectedEmployee}`;
    statusBoxEl.textContent = auditMsg;
    internalInvestigationBlockEl.textContent = auditMsg;
    latestInternalInvestigation = await runInvestigationAudit(selectedManager, selectedEmployee);
    if (!latestAnalysisPayload) {
      statusBoxEl.textContent = "AI audit generated. Run Analyze Performance Report once to load full dashboard panels.";
      return;
    }
    const mergedPayload = {
      ...latestAnalysisPayload,
      internalInvestigation: latestInternalInvestigation,
    };
    renderDashboard(mergedPayload, mergedPayload);
    statusBoxEl.textContent = "AI audit report generated successfully.";
  } catch (err) {
    statusBoxEl.textContent = `Error: ${err.message}`;
  }
});

internalInvestigationBlockEl.addEventListener("click", (event) => {
  const btn = event.target && event.target.closest ? event.target.closest("#generateWorkloadPlanBtn") : null;
  if (!btn) return;
  window.location.href = "/frontend/workload.html";
});

autoPilotInterventionBtn.addEventListener("click", async () => {
  if (!selectedEmployee) {
    statusBoxEl.textContent = "Select an employee first.";
    return;
  }
  try {
    const response = await fetch(`/api/talent-guardian/gmail-draft?employee=${encodeURIComponent(selectedEmployee)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Auto-pilot action failed (${response.status})`);
    window.open(data.composeUrl, "_blank");
    const schedule = data.schedule || {};
    if (!schedule.interviewGoogleCalendarUrl) {
      throw new Error("No schedule URL returned.");
    }
    window.open(schedule.interviewGoogleCalendarUrl, "_blank");
    window.open(schedule.bufferMeetCalendarUrl, "_blank");
    sessionStorage.setItem(
      "autopilot_notice",
      `Success: Gmail draft + buffer meet + stay interview event completed successfully for ${selectedEmployee}.`
    );
    statusBoxEl.textContent = `Success: All Stay Interview process steps completed successfully for ${selectedEmployee}.`;
  } catch (err) {
    statusBoxEl.textContent = `Error: ${err.message}`;
  }
});

if (dashboardZoomInBtn) {
  dashboardZoomInBtn.addEventListener("click", () => {
    dashboardGraphZoom = Math.max(0.5, Math.min(2.5, Number((dashboardGraphZoom + 0.2).toFixed(2))));
    if (dashboardGraphZoomViewportEl) dashboardGraphZoomViewportEl.style.setProperty("--zoom", String(dashboardGraphZoom));
  });
}

if (dashboardZoomOutBtn) {
  dashboardZoomOutBtn.addEventListener("click", () => {
    dashboardGraphZoom = Math.max(0.5, Math.min(2.5, Number((dashboardGraphZoom - 0.2).toFixed(2))));
    if (dashboardGraphZoomViewportEl) dashboardGraphZoomViewportEl.style.setProperty("--zoom", String(dashboardGraphZoom));
  });
}

if (dashboardZoomResetBtn) {
  dashboardZoomResetBtn.addEventListener("click", () => {
    dashboardGraphZoom = 1;
    if (dashboardGraphZoomViewportEl) dashboardGraphZoomViewportEl.style.setProperty("--zoom", "1");
  });
}

if (dashboardCloseGraphZoomBtn) {
  dashboardCloseGraphZoomBtn.addEventListener("click", () => {
    if (dashboardGraphZoomDialogEl && typeof dashboardGraphZoomDialogEl.close === "function") {
      dashboardGraphZoomDialogEl.close();
    }
  });
}

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/frontend/auth.html";
});

manageReportsBtn.addEventListener("click", () => {
  if (manageReportsBtn.style.display === "none") return;
  window.location.href = "/frontend/upload.html";
});

bootstrap().then(resetDashboard).catch((err) => {
  statusBoxEl.textContent = `Error: ${err.message}`;
});

window.addEventListener("focus", () => {
  const notice = sessionStorage.getItem("autopilot_notice");
  if (notice) {
    statusBoxEl.textContent = `${notice} You are back on dashboard.`;
    sessionStorage.removeItem("autopilot_notice");
  }
});

if (openRiskMatrixBtn) {
  openRiskMatrixBtn.addEventListener("click", () => {
    if (!riskMatrixDialogBodyEl || !riskMatrixDialogEl) return;
    riskMatrixDialogBodyEl.innerHTML = latestRiskMatrixHtml || "<div class=\"insight-content\">Run analysis to view matrix.</div>";
    if (typeof riskMatrixDialogEl.showModal === "function") {
      riskMatrixDialogEl.showModal();
    }
  });
}

if (closeRiskMatrixBtn) {
  closeRiskMatrixBtn.addEventListener("click", () => {
    if (!riskMatrixDialogEl) return;
    if (typeof riskMatrixDialogEl.close === "function") {
      riskMatrixDialogEl.close();
    }
  });
}

bindDialogBackdropClose(dashboardGraphZoomDialogEl);
bindDialogBackdropClose(riskMatrixDialogEl);
