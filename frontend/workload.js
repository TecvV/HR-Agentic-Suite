"use strict";

const backBtn = document.getElementById("backBtn");
const logoutBtn = document.getElementById("logoutBtn");
const managerInputEl = document.getElementById("managerInput");
const employeeInputEl = document.getElementById("employeeInput");
const analyzeWorkloadBtn = document.getElementById("analyzeWorkloadBtn");
const statusBoxEl = document.getElementById("statusBox");
const riskQuadrantEl = document.getElementById("riskQuadrant");
const scissorsSvgEl = document.getElementById("scissorsSvg");
const scissorsAnnotationEl = document.getElementById("scissorsAnnotation");
const calibrationDialEl = document.getElementById("calibrationDial");
const teamHeatmapSvgEl = document.getElementById("teamHeatmapSvg");
const workloadFlowBlockEl = document.getElementById("workloadFlowBlock");
const matchRadarSvgEl = document.getElementById("matchRadarSvg");
const openCapacityStackBtn = document.getElementById("openCapacityStackBtn");
const capacityStackDialogEl = document.getElementById("capacityStackDialog");
const closeCapacityStackBtn = document.getElementById("closeCapacityStackBtn");
const capacityStackDialogBodyEl = document.getElementById("capacityStackDialogBody");
const graphZoomDialogEl = document.getElementById("graphZoomDialog");
const graphZoomTitleEl = document.getElementById("graphZoomTitle");
const graphZoomViewportEl = document.getElementById("graphZoomViewport");
const graphZoomBodyEl = document.getElementById("graphZoomBody");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomResetBtn = document.getElementById("zoomResetBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const closeGraphZoomBtn = document.getElementById("closeGraphZoomBtn");
const peersTableEl = document.getElementById("peersTable");
const openPeerGaugeBtn = document.getElementById("openPeerGaugeBtn");
const peerGaugeDialogEl = document.getElementById("peerGaugeDialog");
const closePeerGaugeBtn = document.getElementById("closePeerGaugeBtn");
const peerGaugeDialogBodyEl = document.getElementById("peerGaugeDialogBody");
const matchExplainTitleEl = document.getElementById("matchExplainTitle");
const matchExplainBlockEl = document.getElementById("matchExplainBlock");
const assignmentBlockEl = document.getElementById("assignmentBlock");

let hierarchy = { managers: [], employees: [] };
let latestPeerBatteries = [];
let latestCapacityStack = [];
let latestAdvancedPayload = null;
let currentGraphZoom = 1;
const skillMetricsCache = new Map();

function esc(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(msg) {
  statusBoxEl.textContent = msg;
}

function resetOutput() {
  matchExplainTitleEl.textContent = "Why This Peer Was Picked";
  riskQuadrantEl.textContent = "Run analysis to render.";
  scissorsSvgEl.innerHTML = "";
  scissorsAnnotationEl.textContent = "No trend annotation yet.";
  calibrationDialEl.innerHTML = `<div class="dial-value">0%</div><div class="dial-label">No calibration data</div>`;
  teamHeatmapSvgEl.innerHTML = "";
  workloadFlowBlockEl.textContent = "No flow data yet.";
  matchRadarSvgEl.innerHTML = "";
  peersTableEl.textContent = "No simulation yet.";
  latestPeerBatteries = [];
  latestCapacityStack = [];
  if (peerGaugeDialogBodyEl) {
    peerGaugeDialogBodyEl.textContent = "Run workload analysis to view peer batteries.";
  }
  if (capacityStackDialogBodyEl) {
    capacityStackDialogBodyEl.textContent = "Run workload analysis to view capacity stack.";
  }
  matchExplainBlockEl.textContent = "No simulation yet.";
  assignmentBlockEl.textContent = "No simulation yet.";
}

function fillManagerOptions(managers) {
  managerInputEl.innerHTML = "<option value=\"\">Select manager</option>";
  managers.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.name;
    opt.textContent = `${m.name} (${m.employees.length} employees)`;
    managerInputEl.appendChild(opt);
  });
}

function fillEmployeeOptions(managerName) {
  employeeInputEl.innerHTML = "<option value=\"\">Select employee</option>";
  const selectedManager = (hierarchy.managers || []).find((m) => m.name === managerName);
  const names = selectedManager ? selectedManager.employees : (hierarchy.employees || []).map((e) => e.name);
  [...new Set(names)].sort((a, b) => a.localeCompare(b)).forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    employeeInputEl.appendChild(opt);
  });
}

function applyQueryDefaults() {
  const params = new URLSearchParams(window.location.search);
  const qManager = (params.get("manager") || "").trim();
  const qEmployee = (params.get("employee") || "").trim();
  if (qManager) {
    const managerMatch = [...managerInputEl.options].find(
      (opt) => String(opt.value || "").trim().toLowerCase() === qManager.toLowerCase()
    );
    managerInputEl.value = managerMatch ? managerMatch.value : "";
  }
  fillEmployeeOptions(managerInputEl.value);
  if (qEmployee) {
    const employeeMatch = [...employeeInputEl.options].find(
      (opt) => String(opt.value || "").trim().toLowerCase() === qEmployee.toLowerCase()
    );
    employeeInputEl.value = employeeMatch ? employeeMatch.value : "";
  }
}

function shouldAutoAnalyzeFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get("autoAnalyze") === "1";
}

function batteryColorClass(level) {
  if (level > 70) return "battery-green";
  if (level >= 40) return "battery-yellow";
  return "battery-red";
}

function renderPeerBatteries(items) {
  if (!Array.isArray(items) || !items.length) {
    peersTableEl.textContent = "No peer batteries available.";
    return;
  }
  peersTableEl.innerHTML = items.map((item) => {
    const level = Number(item.level) || 0;
    return (
      `<div class="battery-row">` +
      `<div class="battery-name">${esc(item.name)}</div>` +
      `<div class="battery-track"><div class="battery-fill ${batteryColorClass(level)}" style="width:${Math.max(0, Math.min(100, level))}%"></div></div>` +
      `<div class="battery-meta">${level}% · ${esc(item.color)} · ${esc(item.status || "N/A")}</div>` +
      `</div>`
    );
  }).join("");
}

function renderPeerBatteriesInDialog(items) {
  if (!peerGaugeDialogBodyEl) return;
  if (!Array.isArray(items) || !items.length) {
    peerGaugeDialogBodyEl.textContent = "No peer batteries available.";
    return;
  }
  peerGaugeDialogBodyEl.innerHTML = items.map((item) => {
    const level = Number(item.level) || 0;
    return (
      `<div class="battery-row">` +
      `<div class="battery-name">${esc(item.name)}</div>` +
      `<div class="battery-track"><div class="battery-fill ${batteryColorClass(level)}" style="width:${Math.max(0, Math.min(100, level))}%"></div></div>` +
      `<div class="battery-meta">${level}% - ${esc(item.color)} - ${esc(item.status || "N/A")}</div>` +
      `</div>`
    );
  }).join("");
}

function renderEligiblePeersTable(peers) {
  if (!Array.isArray(peers) || !peers.length) {
    peersTableEl.textContent = "No compatible peers found.";
    return;
  }
  const header = ["Matched Peer", "PCS", "Role Match", "Resilience", "Sentiment", "Safety Rating", "Transfer Plan"];
  const body = peers.map((p) => (
    `<tr>` +
    `<td>${esc(p.matchedPeer || p.employeeName)}</td>` +
    `<td>${esc(p.pcs ?? "-")}</td>` +
    `<td>${esc(p.roleMatchType || "-")}</td>` +
    `<td>${esc(p.resilience ?? "-")}</td>` +
    `<td>${esc(p.sentiment ?? "-")}</td>` +
    `<td>${esc(p.safetyRating || "-")}</td>` +
    `<td>${esc(p.transferPlan || "-")}</td>` +
    `</tr>`
  )).join("");
  peersTableEl.innerHTML =
    `<table class="matrix-table"><thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
}

function managerPositivityFromNotes(notes) {
  const text = String(notes || "").toLowerCase();
  const positive = (text.match(/\b(strong|excellent|great|improv|growth|leader|collab|ownership|impact|reliable|consistent)\b/g) || []).length;
  const negative = (text.match(/\b(weak|delay|issue|risk|concern|poor|late|struggle|overwhelmed|stress|bottleneck)\b/g) || []).length;
  if (positive - negative >= 2) return 2;
  if (positive - negative <= -1) return 0;
  return 1;
}

function averageFromArray(values) {
  const nums = (values || []).map((v) => Number(v)).filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function parseKpiNumber(value) {
  const m = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

function calculateSrsFromRecord(record) {
  const sentiment = Number(record?.sentimentScore);
  const collaboration = Number(record?.collaborationIndex);
  const kpi = parseKpiNumber(record?.kpiScore);
  const notes = String(record?.managerNotes || "");
  const positivity = managerPositivityFromNotes(notes);
  let srs = (Number.isFinite(sentiment) ? sentiment * 6 : 0) + (Number.isFinite(collaboration) ? collaboration * 3 : 0) + (positivity >= 2 ? 1 : (positivity === 0 ? -1 : 0));
  if (Number.isFinite(kpi) && Number.isFinite(sentiment) && kpi > 105 && sentiment < 0.6) srs -= 2;
  if (/(overwhelmed|stress|late|bottleneck)/i.test(notes)) srs -= 1.5;
  return Number(Math.max(0, Math.min(10, srs)).toFixed(2));
}

function buildTrendData(contextRecords, targetEmployee, fallbackKpi, fallbackSrs) {
  if (!Array.isArray(contextRecords) || !contextRecords.length) {
    return [{ period: "Q4", prod: fallbackKpi || 0, res: fallbackSrs || 0 }];
  }
  const byQuarter = [...contextRecords]
    .map((r) => ({
      period: String(r.quarter || "Q?"),
      prod: parseKpiNumber(r.kpiScore) || 0,
      res: calculateSrsFromRecord(r),
    }))
    .sort((a, b) => Number(a.period.replace("Q", "")) - Number(b.period.replace("Q", "")));
  return byQuarter.slice(0, 4);
}

function getZoneLabel(x, y) {
  if (x >= 100 && y < 4) return "Burnout Zone";
  if (x >= 100 && y >= 7) return "Safe Harbor";
  if (x >= 90 && y >= 4 && y < 7) return "Golden Cage";
  if (x < 90 && y < 4) return "Attrition Cliff";
  return "Watchlist";
}

function buildCompetitiveEdge(senderMetrics, peerMetrics) {
  if (!peerMetrics) return "No peer selected";
  const deltas = [
    { key: "resilience", d: Number(peerMetrics.resilience || 0) - Number(senderMetrics.resilience || 0), text: "Higher resilience buffer" },
    { key: "skill", d: Number(peerMetrics.skill || 0) - Number(senderMetrics.skill || 0), text: "Stronger skill depth" },
    { key: "sentiment", d: Number(peerMetrics.sentiment || 0) - Number(senderMetrics.sentiment || 0), text: "Better sentiment stability" },
    { key: "collaboration", d: Number(peerMetrics.collaboration || 0) - Number(senderMetrics.collaboration || 0), text: "Higher collaboration lift" },
  ].sort((a, b) => b.d - a.d);
  return deltas[0].text;
}

function openGraphZoom(title, html) {
  if (!graphZoomDialogEl || !graphZoomBodyEl || !graphZoomTitleEl || !graphZoomViewportEl) return;
  graphZoomTitleEl.textContent = title;
  graphZoomBodyEl.innerHTML = html;
  currentGraphZoom = 1;
  graphZoomViewportEl.style.setProperty("--zoom", String(currentGraphZoom));
  if (typeof graphZoomDialogEl.showModal === "function") graphZoomDialogEl.showModal();
}

function updateGraphZoom(delta) {
  if (!graphZoomViewportEl) return;
  currentGraphZoom = Math.max(0.5, Math.min(2.5, Number((currentGraphZoom + delta).toFixed(2))));
  graphZoomViewportEl.style.setProperty("--zoom", String(currentGraphZoom));
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

function buildVisualPackage(data, contextRecords) {
  const sim = data.workloadSimulation || {};
  const target = sim.targetEmployee || {};
  const kpi = Number(target.kpi) || 0;
  const srs = Number(target.syntheticResilience ?? target.resilience) || 0;
  const ei = Number(sim.riskAssessment?.exhaustionIndex) || 0;
  const trend = buildTrendData(contextRecords, target.employeeName, kpi, srs);
  const last = trend[trend.length - 1] || { period: "Q4", prod: kpi, res: srs };
  const prev = trend[Math.max(0, trend.length - 2)] || last;
  const divergence = (last.prod - prev.prod) - ((last.res - prev.res) * 10);
  const annotation = divergence > 8 ? `${last.period}: Scissors divergence sharply widened` : `${last.period}: Load and resilience remained stable`;

  const peerSource = Array.isArray(sim.receiverDiagnostics) && sim.receiverDiagnostics.length
    ? sim.receiverDiagnostics
    : (Array.isArray(sim.compatiblePeers) ? sim.compatiblePeers : []);
  const peerBatteries = peerSource.map((peer) => {
    const level = Math.max(0, Math.min(100, Math.round((Number(peer.resilience) / 10) * 100)));
    const color = level > 70 ? "Green" : (level >= 40 ? "Yellow" : "Red");
    return {
      name: String(peer.employeeName || peer.matchedPeer || "Unknown"),
      level,
      color,
      status: level > 70 ? "Safe" : (level >= 40 ? "Caution" : "Blocked"),
    };
  });

  const notesJoined = (Array.isArray(contextRecords) ? contextRecords : []).map((r) => String(r.managerNotes || "")).join(" ");
  const managerPos = managerPositivityFromNotes(notesJoined);
  const managerPositivePct = (managerPos / 2) * 100;
  const exhaustionPct = Math.max(0, Math.min(100, (ei / 58) * 100));
  const expectedManagerPct = 100 - exhaustionPct;
  const alignment = Math.max(0, Math.min(100, 100 - Math.abs(managerPositivePct - expectedManagerPct)));
  const alertLevel = alignment >= 70 ? "Aligned" : (alignment >= 45 ? "Review Needed" : "Blindspot Detected");

  return {
    quadrant: {
      x: Number(kpi.toFixed(2)),
      y: Number(srs.toFixed(2)),
      zone: getZoneLabel(kpi, srs),
    },
    peer_batteries: peerBatteries,
    trend_chart: trend.map((t) => ({ period: t.period, prod: Number(t.prod.toFixed(2)), res: Number(t.res.toFixed(2)) })),
    trend_annotation: annotation,
    manager_calibration: {
      score: Number(alignment.toFixed(2)),
      alert_level: alertLevel,
    },
  };
}

async function fetchEmployeeLatestMetrics(managerName, employeeName) {
  const key = `${String(managerName || "").toLowerCase()}::${String(employeeName || "").toLowerCase()}`;
  if (skillMetricsCache.has(key)) return skillMetricsCache.get(key);
  const q = new URLSearchParams({ manager: managerName || "", employee: employeeName || "" }).toString();
  const context = await requestJson(`/api/context?${q}`).catch(() => null);
  const records = Array.isArray(context?.employeeLayout?.quarterRecords) ? context.employeeLayout.quarterRecords : [];
  if (!records.length) {
    const fallback = { skill: 5, srs: 5, sentiment: 0.6, collaboration: 0.6, kpi: 90 };
    skillMetricsCache.set(key, fallback);
    return fallback;
  }
  const sorted = [...records].sort((a, b) => Number(String(a.quarter || "").replace("Q", "")) - Number(String(b.quarter || "").replace("Q", "")));
  const latest = sorted[sorted.length - 1];
  const skillAvg = averageFromArray(Object.values(latest.skillProficiency || {}));
  const metrics = {
    skill: Number.isFinite(skillAvg) ? Number(skillAvg.toFixed(2)) : 5,
    srs: calculateSrsFromRecord(latest),
    sentiment: Number(latest.sentimentScore),
    collaboration: Number(latest.collaborationIndex),
    kpi: parseKpiNumber(latest.kpiScore),
  };
  skillMetricsCache.set(key, metrics);
  return metrics;
}

async function buildAdvancedVisualPayload(data, contextData) {
  const sim = data.workloadSimulation || {};
  const sender = sim.targetEmployee || {};
  const senderName = String(sender.employeeName || "");
  const senderManager = String(sender.managerName || "");
  const peers = Array.isArray(sim.receiverDiagnostics) ? sim.receiverDiagnostics : [];
  const assignments = Array.isArray(sim.assignments) ? sim.assignments : [];
  const senderMetrics = await fetchEmployeeLatestMetrics(senderManager, senderName);
  const contextRecords = Array.isArray(contextData?.employeeLayout?.quarterRecords) ? contextData.employeeLayout.quarterRecords : [];

  const peerMetricTuples = await Promise.all(peers.map(async (p) => {
    const m = await fetchEmployeeLatestMetrics(String(p.managerName || ""), String(p.employeeName || ""));
    return { peer: p, metrics: m };
  }));

  const heatmapData = [
    {
      name: senderName,
      role: sender.role || "",
      x: Number(senderMetrics.skill || 0),
      y: Number(senderMetrics.srs || 0),
      silo_risk: Number(senderMetrics.skill) >= 8 && Number(senderMetrics.srs) < 4,
      is_sender: true,
    },
    ...peerMetricTuples.map(({ peer, metrics }) => ({
      name: String(peer.employeeName || ""),
      role: String(peer.role || ""),
      x: Number(metrics.skill || 0),
      y: Number(metrics.srs || 0),
      silo_risk: Number(metrics.skill) >= 8 && Number(metrics.srs) < 4,
      is_sender: false,
    })),
  ];

  const offload = Number(sender.requestedReductionPercent) || 50;
  const assignedTotal = assignments.reduce((sum, a) => sum + (Number(a.suggestedLoadPercent) || 0), 0);
  const destinations = assignments.map((a) => ({
    name: String(a.toEmployee || ""),
    type: "peer",
    value: Number(a.suggestedLoadPercent) || 0,
  }));
  if (offload > assignedTotal) {
    destinations.push({
      name: "External Contractor",
      type: "contractor",
      value: Number((offload - assignedTotal).toFixed(2)),
    });
  }
  const flowData = {
    source: senderName || "Sender",
    value: offload,
    destinations,
  };

  const selectedPeer = (Array.isArray(sim.compatiblePeers) && sim.compatiblePeers[0]) || null;
  const selectedPeerMetrics = selectedPeer
    ? await fetchEmployeeLatestMetrics(String(selectedPeer.managerName || ""), String(selectedPeer.employeeName || ""))
    : null;
  const radarComparison = {
    sender: {
      name: senderName || "Sender",
      resilience: Number(sender.syntheticResilience ?? sender.resilience ?? senderMetrics.srs ?? 0),
      skill: Number(senderMetrics.skill || 0),
      sentiment: Number(sender.sentiment ?? senderMetrics.sentiment ?? 0),
      collaboration: Number((senderMetrics.collaboration || 0) * 10),
    },
    selected_peer: selectedPeer
      ? {
        name: String(selectedPeer.employeeName || ""),
        resilience: Number(selectedPeer.resilience || selectedPeerMetrics?.srs || 0),
        skill: Number(selectedPeerMetrics?.skill || 0),
        sentiment: Number(selectedPeer.sentiment || selectedPeerMetrics?.sentiment || 0),
        collaboration: Number((selectedPeer.collaboration ?? selectedPeerMetrics?.collaboration ?? 0) * 10),
      }
      : null,
  };
  const radarAnnotations = {
    competitive_edge: buildCompetitiveEdge(
      {
        resilience: Number(sender.syntheticResilience ?? sender.resilience ?? senderMetrics.srs ?? 0),
        skill: Number(senderMetrics.skill || 0),
        sentiment: Number(sender.sentiment ?? senderMetrics.sentiment ?? 0),
        collaboration: Number(senderMetrics.collaboration || 0),
      },
      selectedPeer
        ? {
          resilience: Number(selectedPeer.resilience || selectedPeerMetrics?.srs || 0),
          skill: Number(selectedPeerMetrics?.skill || 0),
          sentiment: Number(selectedPeer.sentiment || selectedPeerMetrics?.sentiment || 0),
          collaboration: Number(selectedPeer.collaboration ?? selectedPeerMetrics?.collaboration ?? 0),
        }
        : null
    ),
  };

  const assignedMap = new Map(assignments.map((a) => [String(a.toEmployee || "").toLowerCase(), Number(a.suggestedLoadPercent) || 0]));
  const capacityStack = peerMetricTuples.map(({ peer }) => {
    const internalLoad = Math.max(0, Math.min(100, Number(peer.kpi) || 0));
    const absorbedLoad = assignedMap.get(String(peer.employeeName || "").toLowerCase()) || 0;
    const remainingBuffer = Math.max(0, 100 - internalLoad - absorbedLoad);
    return {
      name: String(peer.employeeName || ""),
      internal_load: Number(internalLoad.toFixed(2)),
      absorbed_load: Number(absorbedLoad.toFixed(2)),
      remaining_buffer: Number(remainingBuffer.toFixed(2)),
    };
  });

  const healthyPool = heatmapData.filter((p) => Number(p.y) >= 6);
  const clusterRef = healthyPool.length ? healthyPool : heatmapData;
  const clusterCenter = {
    x: Number((averageFromArray(clusterRef.map((p) => p.x)) || 0).toFixed(2)),
    y: Number((averageFromArray(clusterRef.map((p) => p.y)) || 0).toFixed(2)),
    size: clusterRef.length,
  };

  const trend = buildTrendData(contextRecords, senderName, Number(sender.kpi) || 0, Number(sender.syntheticResilience ?? sender.resilience) || 0);
  const areaFill = trend.map((t, idx) => {
    const scaledSrs = Number(t.res) * 13;
    return {
      index: idx,
      period: t.period,
      gap: Number((Number(t.prod) - scaledSrs).toFixed(2)),
    };
  });
  const divergenceIndex = areaFill.findIndex((p) => p.gap > 0);

  const teamBufferPct = Number((averageFromArray(capacityStack.map((r) => r.remaining_buffer)) || 0).toFixed(2));
  const spongeLoad = (data?.spongeLimit?.assignedPeers || []).map((name) => {
    const item = capacityStack.find((r) => String(r.name).toLowerCase() === String(name).toLowerCase());
    return {
      name,
      absorbed_load: Number(item?.absorbed_load || 30),
    };
  });
  const capacitySummary = {
    team_buffer_percentage: teamBufferPct,
    sponge_load: spongeLoad,
  };

  return {
    heatmap_data: heatmapData,
    flow_data: flowData,
    radar_comparison: radarComparison,
    capacity_stack: capacityStack,
    scissors_enhancement: {
      area_fill: areaFill,
      divergence_index: divergenceIndex,
    },
    heatmap_clustering: {
      cluster_center: clusterCenter,
      outlier_id: senderName,
      pulse: true,
    },
    capacity_summary: capacitySummary,
    radar_annotations: radarAnnotations,
  };
}

function renderHeatmap(points, clustering = null) {
  if (!Array.isArray(points) || !points.length) {
    teamHeatmapSvgEl.innerHTML = "";
    return;
  }
  const w = 320;
  const h = 160;
  const pad = 20;
  const innerW = w - pad * 2;
  const innerH = 110;
  const xFor = (v) => pad + (Math.max(0, Math.min(10, Number(v) || 0)) / 10) * innerW;
  const yFor = (v) => 126 - (Math.max(0, Math.min(10, Number(v) || 0)) / 10) * innerH;
  const outlierId = String(clustering?.outlier_id || "").toLowerCase();
  const dots = points.map((p) => {
    const x = xFor(p.x);
    const y = yFor(p.y);
    const color = p.is_sender ? "#7de4f0" : (p.silo_risk ? "#ff8f98" : "#65d8b2");
    const pulse = String(p.name || "").toLowerCase() === outlierId ? ` class="pulse-dot"` : "";
    return `<circle${pulse} cx="${x}" cy="${y}" r="4" fill="${color}" stroke="#0f2430" stroke-width="1"><title>${esc(p.name)} (${p.role}) Skill ${p.x}, SRS ${p.y}${p.silo_risk ? " [SILO RISK]" : ""}</title></circle>`;
  }).join("");
  const center = clustering?.cluster_center
    ? `<circle cx="${xFor(clustering.cluster_center.x)}" cy="${yFor(clustering.cluster_center.y)}" r="5" fill="none" stroke="#ffd979" stroke-width="1.5"></circle>
       <text x="${xFor(clustering.cluster_center.x) + 8}" y="${yFor(clustering.cluster_center.y) - 6}" fill="#ffd979" font-size="8">Cluster</text>`
    : "";
  teamHeatmapSvgEl.innerHTML =
    `<line x1="20" y1="126" x2="300" y2="126" stroke="#244050" stroke-width="1"></line>` +
    `<line x1="20" y1="16" x2="20" y2="126" stroke="#244050" stroke-width="1"></line>` +
    `<line x1="20" y1="71" x2="300" y2="71" stroke="#1e3341" stroke-width="1"></line>` +
    `<line x1="160" y1="16" x2="160" y2="126" stroke="#1e3341" stroke-width="1"></line>` +
    `<text x="20" y="138" fill="#8ea0af" font-size="8" text-anchor="middle">0</text>` +
    `<text x="160" y="138" fill="#8ea0af" font-size="8" text-anchor="middle">5</text>` +
    `<text x="300" y="138" fill="#8ea0af" font-size="8" text-anchor="middle">10</text>` +
    `<text x="12" y="126" fill="#8ea0af" font-size="8" text-anchor="end">0</text>` +
    `<text x="12" y="71" fill="#8ea0af" font-size="8" text-anchor="end">5</text>` +
    `<text x="12" y="16" fill="#8ea0af" font-size="8" text-anchor="end">10</text>` +
    `<text x="295" y="144" fill="#8ea0af" font-size="9" text-anchor="end">Skill (0-10)</text>` +
    `<text x="8" y="16" fill="#8ea0af" font-size="9">SRS</text>` +
    dots +
    center;
}

function renderWorkloadFlow(flow) {
  if (!flow || !Array.isArray(flow.destinations)) {
    workloadFlowBlockEl.textContent = "No flow data yet.";
    return;
  }
  const rows = flow.destinations.map((d) => {
    const cls = d.type === "contractor" ? "battery-red" : "battery-green";
    return (
      `<div class="flow-row">` +
      `<div class="flow-label">${esc(flow.source)} -> ${esc(d.name)}</div>` +
      `<div class="battery-track"><div class="battery-fill ${cls}" style="width:${Math.max(0, Math.min(100, Number(d.value) || 0))}%"></div></div>` +
      `<div class="battery-meta">${Number(d.value) || 0}%</div>` +
      `</div>`
    );
  }).join("");
  workloadFlowBlockEl.innerHTML = rows || "No destinations.";
}

function radarPolygonPoints(cx, cy, r, values) {
  const keys = ["resilience", "skill", "sentiment", "collaboration"];
  return keys.map((k, idx) => {
    const angle = (-Math.PI / 2) + (idx * (Math.PI * 2 / keys.length));
    const v = Math.max(0, Math.min(10, Number(values[k]) || 0));
    const rr = (v / 10) * r;
    return `${cx + Math.cos(angle) * rr},${cy + Math.sin(angle) * rr}`;
  }).join(" ");
}

function renderRadar(radar, annotation = null) {
  if (!radar || !radar.sender) {
    matchRadarSvgEl.innerHTML = "";
    return;
  }
  const cx = 160;
  const cy = 88;
  const r = 62;
  const rings = [0.25, 0.5, 0.75, 1].map((m) => `<circle cx="${cx}" cy="${cy}" r="${(r * m).toFixed(2)}" fill="none" stroke="#274050" stroke-width="1"></circle>`).join("");
  const ringLabels = [2.5, 5, 7.5, 10]
    .map((v, i) => `<text x="${cx + 4}" y="${cy - (r * ((i + 1) / 4))}" fill="#8ea0af" font-size="8">${v}</text>`)
    .join("");
  const axes = [
    [cx, cy - r, "Resilience"],
    [cx + r, cy, "Skill"],
    [cx, cy + r, "Sentiment"],
    [cx - r, cy, "Collab"],
  ].map(([x, y, t]) => `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#244050" stroke-width="1"></line><text x="${x}" y="${Number(y) + (t === "Sentiment" ? 12 : -4)}" fill="#8ea0af" font-size="9" text-anchor="middle">${t}</text>`).join("");
  const senderPoly = `<polygon points="${radarPolygonPoints(cx, cy, r, radar.sender)}" fill="rgba(125,228,240,0.22)" stroke="#7de4f0" stroke-width="1.5"></polygon>`;
  const peerPoly = radar.selected_peer
    ? `<polygon points="${radarPolygonPoints(cx, cy, r, radar.selected_peer)}" fill="rgba(255,143,152,0.2)" stroke="#ff8f98" stroke-width="1.5"></polygon>`
    : "";
  const legend = radar.selected_peer
    ? `<text x="16" y="170" fill="#7de4f0" font-size="9">${esc(radar.sender.name)}</text><text x="170" y="170" fill="#ff8f98" font-size="9">${esc(radar.selected_peer.name)}</text>`
    : `<text x="16" y="170" fill="#7de4f0" font-size="9">${esc(radar.sender.name)}</text><text x="170" y="170" fill="#8ea0af" font-size="9">No selected peer</text>`;
  const edge = annotation ? `<text x="160" y="14" fill="#ffd979" font-size="9" text-anchor="middle">${esc(annotation)}</text>` : "";
  matchRadarSvgEl.innerHTML = rings + ringLabels + axes + senderPoly + peerPoly + legend + edge;
}

function renderCapacityStack(rows, summary = null) {
  if (!capacityStackDialogBodyEl) return;
  if (!Array.isArray(rows) || !rows.length) {
    capacityStackDialogBodyEl.textContent = "No capacity data yet.";
    return;
  }
  const summaryHtml = summary
    ? `<div class="capacity-summary">
         <div>Team Buffer: ${Number(summary.team_buffer_percentage || 0).toFixed(2)}%</div>
         <div>Sponge Load: ${(summary.sponge_load || []).map((s) => `${esc(s.name)} (${s.absorbed_load}%)`).join(", ") || "None"}</div>
       </div>`
    : "";
  capacityStackDialogBodyEl.innerHTML = summaryHtml + rows.map((r) => (
    `<div class="capacity-row">` +
    `<div class="capacity-name">${esc(r.name)}</div>` +
    `<div class="capacity-track">` +
    `<div class="capacity-seg internal" style="width:${Math.max(0, Math.min(100, Number(r.internal_load) || 0))}%"></div>` +
    `<div class="capacity-seg absorbed" style="width:${Math.max(0, Math.min(100, Number(r.absorbed_load) || 0))}%"></div>` +
    `<div class="capacity-seg buffer" style="width:${Math.max(0, Math.min(100, Number(r.remaining_buffer) || 0))}%"></div>` +
    `</div>` +
    `<div class="battery-meta">L:${r.internal_load}% A:${r.absorbed_load}% B:${r.remaining_buffer}%</div>` +
    `</div>`
  )).join("");
}

function renderRiskQuadrant(quadrant) {
  const x = Math.max(0, Math.min(130, Number(quadrant?.x) || 0));
  const y = Math.max(0, Math.min(10, Number(quadrant?.y) || 0));
  const left = (x / 130) * 100;
  const bottom = (y / 10) * 100;
  riskQuadrantEl.innerHTML =
    `<div class="quadrant-grid">` +
    `<span class="axis-x axis-x-0">0</span>` +
    `<span class="axis-x axis-x-50">65</span>` +
    `<span class="axis-x axis-x-100">130</span>` +
    `<span class="axis-y axis-y-0">0</span>` +
    `<span class="axis-y axis-y-50">5</span>` +
    `<span class="axis-y axis-y-100">10</span>` +
    `<div class="quadrant-dot" style="left:${left}%;bottom:${bottom}%"></div>` +
    `<div class="quadrant-label">Zone: ${esc(quadrant?.zone || "N/A")} | KPI ${x.toFixed(1)} | SRS ${y.toFixed(1)}</div>` +
    `</div>`;
}

function renderScissorsTrend(series, annotation, enhancement = null) {
  if (!Array.isArray(series) || !series.length) {
    scissorsSvgEl.innerHTML = "";
    scissorsAnnotationEl.textContent = "No trend annotation yet.";
    return;
  }
  const width = 320;
  const height = 140;
  const padX = 20;
  const innerW = width - (padX * 2);
  const xFor = (i, total) => padX + ((innerW * i) / Math.max(1, total - 1));
  const yProd = (v) => 116 - ((Math.max(0, Math.min(130, v)) / 130) * 90);
  const yRes = (v) => 116 - ((Math.max(0, Math.min(10, v)) / 10) * 90);
  const prodPoints = series.map((p, i) => `${xFor(i, series.length)},${yProd(p.prod)}`).join(" ");
  const resPoints = series.map((p, i) => `${xFor(i, series.length)},${yRes(p.res)}`).join(" ");
  const labels = series.map((p, i) => `<text x="${xFor(i, series.length)}" y="132" fill="#8ea0af" font-size="9" text-anchor="middle">${esc(p.period)}</text>`).join("");
  const prodDots = series.map((p, i) => `<circle cx="${xFor(i, series.length)}" cy="${yProd(p.prod)}" r="2.5" fill="#7de4f0"></circle>`).join("");
  const resDots = series.map((p, i) => `<circle cx="${xFor(i, series.length)}" cy="${yRes(p.res)}" r="2.5" fill="#ff8f98"></circle>`).join("");
  const yLeft = [0, 65, 130]
    .map((v) => `<text x="16" y="${yProd(v)}" fill="#7de4f0" font-size="8" text-anchor="end">${v}</text>`)
    .join("");
  const yRight = [0, 5, 10]
    .map((v) => `<text x="304" y="${yRes(v)}" fill="#ff8f98" font-size="8">${v}</text>`)
    .join("");
  const areaPoly = series.length > 1
    ? `<polygon points="${prodPoints} ${series.map((p, i) => `${xFor(series.length - 1 - i, series.length)},${yRes(series[series.length - 1 - i].res)}`).join(" ")}" fill="rgba(255,95,126,0.12)"></polygon>`
    : "";
  const divIndex = Number(enhancement?.divergence_index);
  const divLine = Number.isFinite(divIndex) && divIndex >= 0 && divIndex < series.length
    ? `<line x1="${xFor(divIndex, series.length)}" y1="26" x2="${xFor(divIndex, series.length)}" y2="116" stroke="#ff8f98" stroke-dasharray="3 3" stroke-width="1"></line>`
    : "";
  scissorsSvgEl.innerHTML =
    `<line x1="20" y1="116" x2="300" y2="116" stroke="#244050" stroke-width="1"></line>` +
    `<line x1="20" y1="26" x2="20" y2="116" stroke="#244050" stroke-width="1"></line>` +
    `<line x1="300" y1="26" x2="300" y2="116" stroke="#244050" stroke-width="1"></line>` +
    yLeft +
    yRight +
    areaPoly +
    divLine +
    (series.length > 1 ? `<polyline fill="none" stroke="#7de4f0" stroke-width="2.5" points="${prodPoints}"></polyline>` : "") +
    (series.length > 1 ? `<polyline fill="none" stroke="#ff8f98" stroke-width="2.5" points="${resPoints}"></polyline>` : "") +
    prodDots +
    resDots +
    labels;
  scissorsAnnotationEl.textContent = annotation || "No point of interest.";
}

function renderCalibrationDial(calibration) {
  const score = Math.max(0, Math.min(100, Number(calibration?.score) || 0));
  const level = String(calibration?.alert_level || "N/A");
  calibrationDialEl.innerHTML =
    `<div class="dial-ring" style="--dial:${score}%;">` +
    `<div class="dial-core">` +
    `<div class="dial-value">${score.toFixed(0)}%</div>` +
    `<div class="dial-label">${esc(level)}</div>` +
    `</div></div>`;
}

function renderSimulation(data, contextData = null, advancedPayload = null) {
  const sim = data.workloadSimulation || {};
  const target = sim.targetEmployee || {};
  const sender = sim.senderAssessment || {};
  const risk = sim.riskAssessment || {};
  const llm = data.llmSummary || {};
  const resolved = data.resolvedSelection || {};
  const hybrid = sim.hybridOffloadPlan || null;
  const sponge = data.spongeLimit || {};
  const records = Array.isArray(contextData?.employeeLayout?.quarterRecords) ? contextData.employeeLayout.quarterRecords : [];
  const visualPackage = buildVisualPackage(data, records);

  renderRiskQuadrant(visualPackage.quadrant);
  renderScissorsTrend(visualPackage.trend_chart, visualPackage.trend_annotation, advancedPayload?.scissors_enhancement || null);
  renderCalibrationDial(visualPackage.manager_calibration);
  latestPeerBatteries = Array.isArray(visualPackage.peer_batteries) ? visualPackage.peer_batteries : [];
  latestCapacityStack = Array.isArray(advancedPayload?.capacity_stack) ? advancedPayload.capacity_stack : [];
  latestAdvancedPayload = advancedPayload || null;
  renderEligiblePeersTable(sim.compatiblePeers || []);
  renderHeatmap(advancedPayload?.heatmap_data || [], advancedPayload?.heatmap_clustering || null);
  renderWorkloadFlow(advancedPayload?.flow_data || null);
  renderRadar(advancedPayload?.radar_comparison || null, advancedPayload?.radar_annotations?.competitive_edge || null);
  renderCapacityStack(latestCapacityStack, advancedPayload?.capacity_summary || null);
  renderMatchExplain(sim);

  const assignments = (sim.assignments || [])
    .map((a) => `- ${a.toEmployee} (${a.toManager}) -> ${a.suggestedLoadPercent}% | ${a.taskChunk}\n  ${a.rationale}\n  ${a.transferPlan || ""}`.trim())
    .join("\n");
  assignmentBlockEl.textContent =
    `Assignments:\n${assignments || "None"}\n\n` +
    `Conflict Alert: ${sim.conflictAlert || "None"}\n\n` +
    (sender.senderEligible === false
      ? "Receiver Search: Skipped because selected employee is not a Sender.\n\n"
      : "") +
    (hybrid
      ? `Hybrid Offloading (Partial Matching):\n` +
        `- Mode: ${hybrid.mode}\n` +
        `- Reason: ${hybrid.reason}\n` +
        `- Split: ${hybrid.split?.technicalTasksPercent}% technical -> ${hybrid.split?.technicalChannel}\n` +
        `         ${hybrid.split?.administrativeTasksPercent}% admin/process -> ${hybrid.split?.administrativeChannel}\n` +
        `- Designated Peer: ${hybrid.designatedPeer?.employeeName || "N/A"} (${hybrid.designatedPeer?.role || "N/A"})\n` +
        `- Note: ${hybrid.designatedPeer?.note || "N/A"}\n\n`
      : "") +
    (sim.openRequisitionAlert
      ? `Open Requisition Alert:\n` +
        `- Severity: ${sim.openRequisitionAlert.severity}\n` +
        `- Message: ${sim.openRequisitionAlert.message}\n` +
        `- Requested Coverage: ${sim.openRequisitionAlert.requestedCoverage}\n\n`
      : "") +
    `Sponge Limit (Anti-loop):\n` +
    `- Newly Assigned This Audit: ${(sponge.newlyAssigned || []).join(", ") || "None"}\n` +
    `- Locked Pool: ${(sponge.assignedPeers || []).join(", ") || "None"}\n\n` +
    `Next Actions:\n- ${(llm.nextActions || []).join("\n- ") || "N/A"}`;
}

function yesNo(v) {
  return v ? "Yes" : "No";
}

function renderMatchExplain(sim) {
  const all = Array.isArray(sim.receiverDiagnostics) ? sim.receiverDiagnostics : [];
  const selectedPeers = Array.isArray(sim.compatiblePeers) ? sim.compatiblePeers : [];
  const selectedPeerNames = new Set(selectedPeers.map((p) => String(p.employeeName || "").toLowerCase()));
  const hasSelectedPeer = selectedPeers.length > 0;
  const senderName = sim.targetEmployee?.employeeName || "selected employee";
  matchExplainTitleEl.textContent = hasSelectedPeer
    ? "Why This Peer Was Picked"
    : `Best possible match for reducing work-load of ${senderName}`;
  if (!all.length) {
    matchExplainBlockEl.textContent = "No receiver diagnostics available.";
    return;
  }
  const sorted = [...all].sort((a, b) => (a.rank - b.rank) || (b.capacityScore - a.capacityScore));
  const top = hasSelectedPeer
    ? (sorted.find((p) => selectedPeerNames.has(String(p.employeeName || "").toLowerCase())) || sorted[0])
    : sorted[0];
  const second = sorted.find((p) => p.employeeName !== top.employeeName);
  const sender = sim.targetEmployee || {};

  const lineFor = (p, label) =>
    `${label}: ${p.employeeName} | PCS ${p.pcs ?? "N/A"}\n` +
    `- Safety Filter (Resilience>=7 AND Sentiment>=0.75): ${yesNo(p.criteria?.safetyFilter)} (R=${p.resilience ?? "N/A"}, S=${p.sentiment ?? "N/A"})\n` +
    `- Role-Silo Match: ${yesNo(p.criteria?.roleSiloPass)} (${p.roleMatchType || "N/A"}, score ${p.roleMatchScore ?? "N/A"})\n` +
    `- Capacity Buffer (KPI<105): ${yesNo(p.criteria?.capacityBuffer)} (KPI ${p.kpi ?? "N/A"})\n` +
    `${p.capacityRestricted ? `- Capacity Restricted: Yes (${p.capacityRestrictedReason || "Already assigned"})\n` : ""}` +
    `- Final Eligible: ${yesNo(p.eligible)} | Safety: ${p.safetyRating || "N/A"}` +
    ((hasSelectedPeer && p.eligible)
      ? `\n- Transfer Plan: ${p.transferPlan || "N/A"}`
      : "");

  const header =
    `Sender: ${sender.employeeName || "N/A"} (${sender.role || "N/A"})\n` +
    `Selection logic: Strict filters first, then top-2 by PCS.\n`;

  const picked = lineFor(top, hasSelectedPeer ? "Picked Peer" : "Best Possible Match");
  const runner = second ? `\n\n${lineFor(second, "Runner-up")}` : "";

  const deltas = second
    ? `\n\nDecision Delta:\n` +
      `- PCS advantage: ${top.pcs} vs ${second.pcs}\n` +
      `- Eligibility: ${yesNo(top.eligible)} vs ${yesNo(second.eligible)}`
    : "";

  matchExplainBlockEl.textContent = `${header}\n${picked}${runner}${deltas}`;
}

async function requestJson(url, options = {}) {
  const resp = await fetch(url, options);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
  return data;
}

async function bootstrap() {
  const me = await requestJson("/api/auth/me");
  if (!me.authenticated) {
    window.location.href = "/frontend/auth.html";
    return;
  }
  if (!me.upload?.complete && me.user?.type !== "guest") {
    window.location.href = "/frontend/upload.html";
    return;
  }

  const h = await requestJson("/api/hierarchy");
  hierarchy = {
    managers: Array.isArray(h.managers) ? h.managers : [],
    employees: Array.isArray(h.employees) ? h.employees : [],
  };
  fillManagerOptions(hierarchy.managers || []);
  fillEmployeeOptions("");
  applyQueryDefaults();
}

managerInputEl.addEventListener("change", () => {
  fillEmployeeOptions(managerInputEl.value);
  resetOutput();
});

employeeInputEl.addEventListener("change", () => {
  resetOutput();
});

if (openPeerGaugeBtn) {
  openPeerGaugeBtn.addEventListener("click", () => {
    renderPeerBatteriesInDialog(latestPeerBatteries);
    if (peerGaugeDialogEl && typeof peerGaugeDialogEl.showModal === "function") {
      peerGaugeDialogEl.showModal();
    }
  });
}

if (closePeerGaugeBtn) {
  closePeerGaugeBtn.addEventListener("click", () => {
    if (peerGaugeDialogEl && typeof peerGaugeDialogEl.close === "function") {
      peerGaugeDialogEl.close();
    }
  });
}

if (openCapacityStackBtn) {
  openCapacityStackBtn.addEventListener("click", () => {
    renderCapacityStack(latestCapacityStack);
    if (capacityStackDialogEl && typeof capacityStackDialogEl.showModal === "function") {
      capacityStackDialogEl.showModal();
    }
  });
}

if (closeCapacityStackBtn) {
  closeCapacityStackBtn.addEventListener("click", () => {
    if (capacityStackDialogEl && typeof capacityStackDialogEl.close === "function") {
      capacityStackDialogEl.close();
    }
  });
}

[
  { el: riskQuadrantEl, title: "Risk Quadrant" },
  { el: scissorsSvgEl, title: "Scissors Trend (KPI vs SRS)" },
  { el: teamHeatmapSvgEl, title: "Team Heatmap (Skill vs SRS)" },
  { el: workloadFlowBlockEl, title: "Workload Flow (Sankey View)" },
  { el: matchRadarSvgEl, title: "Match Radar (Sender vs Peer)" },
].forEach(({ el, title }) => {
  if (!el) return;
  el.style.cursor = "zoom-in";
  el.addEventListener("click", () => openGraphZoom(title, el.outerHTML));
});

if (zoomInBtn) zoomInBtn.addEventListener("click", () => updateGraphZoom(0.2));
if (zoomOutBtn) zoomOutBtn.addEventListener("click", () => updateGraphZoom(-0.2));
if (zoomResetBtn) zoomResetBtn.addEventListener("click", () => {
  currentGraphZoom = 1;
  if (graphZoomViewportEl) graphZoomViewportEl.style.setProperty("--zoom", "1");
});
if (closeGraphZoomBtn) closeGraphZoomBtn.addEventListener("click", () => {
  if (graphZoomDialogEl && typeof graphZoomDialogEl.close === "function") graphZoomDialogEl.close();
});

bindDialogBackdropClose(peerGaugeDialogEl);
bindDialogBackdropClose(capacityStackDialogEl);
bindDialogBackdropClose(graphZoomDialogEl);

analyzeWorkloadBtn.addEventListener("click", async () => {
  try {
    setStatus("Running Workload Rebalancing & Impact Simulation with LLM...");
    const payload = {
      managerName: managerInputEl.value || "",
      employeeName: employeeInputEl.value || "",
    };
    const data = await requestJson("/api/workload-rebalance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let contextData = null;
    if (data?.resolvedSelection?.managerName && data?.resolvedSelection?.employeeName) {
      const q = new URLSearchParams({
        manager: data.resolvedSelection.managerName,
        employee: data.resolvedSelection.employeeName,
      }).toString();
      contextData = await requestJson(`/api/context?${q}`).catch(() => null);
    }
    const advancedPayload = await buildAdvancedVisualPayload(data, contextData);
    renderSimulation(data, contextData, advancedPayload);
    setStatus("Workload analysis completed.");
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
});

backBtn.addEventListener("click", () => {
  window.location.href = "/frontend/index.html";
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/frontend/auth.html";
});

bootstrap().then(() => {
  setStatus("Ready.");
  resetOutput();
  if (shouldAutoAnalyzeFromQuery()) {
    if (!managerInputEl.value || !employeeInputEl.value) {
      setStatus("Auto-run blocked: manager/employee from dashboard link could not be matched in dropdowns.");
      return;
    }
    setStatus(`Auto-running workload analysis for ${employeeInputEl.value} under ${managerInputEl.value}...`);
    analyzeWorkloadBtn.click();
  }
}).catch((err) => {
  setStatus(`Error: ${err.message}`);
});
