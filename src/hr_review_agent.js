#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const BIAS_KEYWORDS = {
  aggressive: "Use behavior-specific language tied to outcomes.",
  emotional: "Describe observable work behavior, not personality traits.",
  bossy: "Use neutral collaboration and leadership wording.",
  supportive: "Ensure this term is tied to concrete business impact.",
  young: "Avoid age-based descriptors in performance evaluations.",
  mature: "Avoid age-coded terms; use role-relevant evidence.",
  girl: "Avoid gender-based references in performance decisions.",
  boy: "Avoid gender-based references in performance decisions.",
  female: "Avoid gender-based references in performance decisions.",
  male: "Avoid gender-based references in performance decisions.",
  woman: "Avoid gender-based references in performance decisions.",
  man: "Avoid gender-based references in performance decisions.",
};

const BIAS_PATTERNS = [
  {
    flag: "gender_preference",
    pattern: /\b(promot\w*|hire\w*|prefer\w*|select\w*)\b[\s\S]{0,40}\b(because|since|as)\b[\s\S]{0,20}\b(she|he|girl|boy|female|male|woman|man)\b/i,
  },
  {
    flag: "non_performance_gender_reference",
    pattern: /\b(she'?s a girl|he'?s a boy|because she is a girl|because he is a boy)\b/i,
  },
];

const VALID_PROMOTION_DECISIONS = new Set([
  "Promotion Ready",
  "Needs 6-month development",
  "Not recommended",
]);

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  });
}

function parseArgs(argv) {
  const args = {
    data: "data/employees.csv",
    policyFile: "policy.txt",
    employee: null,
    json: false,
    mode: "hybrid",
    timeoutMs: 30000,
    noState: false,
    stateFile: ".agent_state.json",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--data" && i + 1 < argv.length) {
      args.data = argv[i + 1];
      i += 1;
    } else if (token === "--policy-file" && i + 1 < argv.length) {
      args.policyFile = argv[i + 1];
      i += 1;
    } else if (token === "--employee" && i + 1 < argv.length) {
      args.employee = argv[i + 1];
      i += 1;
    } else if (token === "--json") {
      args.json = true;
    } else if (token === "--local-only") {
      args.mode = "local";
    } else if (token === "--llm-only") {
      args.mode = "llm";
    } else if (token === "--timeout-ms" && i + 1 < argv.length) {
      args.timeoutMs = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--no-state") {
      args.noState = true;
    } else if (token === "--state-file" && i + 1 < argv.length) {
      args.stateFile = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
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

function loadRecords(csvPath) {
  const absPath = path.resolve(csvPath);
  const raw = fs.readFileSync(absPath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const idx = {
    employeeName: headers.indexOf("Employee Name"),
    role: headers.indexOf("Role"),
    kpiScoreRaw: headers.indexOf("KPI Score"),
    peerFeedback: headers.indexOf("Peer Feedback"),
    managerNotes: headers.indexOf("Manager Notes"),
  };

  return lines.slice(1).map((line) => {
    const row = parseCsvLine(line);
    return {
      employee_name: row[idx.employeeName],
      role: row[idx.role],
      kpi_score_raw: row[idx.kpiScoreRaw],
      peer_feedback: row[idx.peerFeedback],
      manager_notes: row[idx.managerNotes],
    };
  });
}

function loadPolicyDocument(policyPath) {
  const absPath = path.resolve(policyPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Policy document not found: ${absPath}`);
  }
  const text = fs.readFileSync(absPath, "utf8").replace(/^\uFEFF/, "").trim();
  if (!text) {
    throw new Error(`Policy document is empty: ${absPath}`);
  }
  return { path: absPath, text };
}

function parseKpiPercent(raw) {
  const match = String(raw).match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) throw new Error(`Could not parse KPI percent from: ${raw}`);
  return Number(match[1]);
}

function evaluateKpi(kpiPercent) {
  if (kpiPercent >= 110) return "Exceeds Expectations";
  if (kpiPercent >= 90) return "Meets Expectations";
  return "Needs Improvement";
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function percentileRank(values, value) {
  if (!values.length) return 0;
  const lessOrEqual = values.filter((v) => v <= value).length;
  return (lessOrEqual / values.length) * 100;
}

function initializeDatasetContext(records) {
  const enriched = records.map((record) => {
    const kpiPercent = parseKpiPercent(record.kpi_score_raw);
    return { ...record, kpi_percent: kpiPercent, rating: evaluateKpi(kpiPercent) };
  });

  const allKpis = enriched.map((r) => r.kpi_percent);
  const roleMap = new Map();

  for (const record of enriched) {
    if (!roleMap.has(record.role)) roleMap.set(record.role, []);
    roleMap.get(record.role).push(record.kpi_percent);
  }

  return {
    enrichedRecords: enriched,
    globalAverage: average(allKpis),
    roleAverages: Object.fromEntries([...roleMap.entries()].map(([role, vals]) => [role, average(vals)])),
    allKpis,
    roleKpis: Object.fromEntries([...roleMap.entries()]),
  };
}

function draftReviewLocal(record, score) {
  const achievementSummary =
    `${record.employee_name} delivered ${Math.round(score.kpi_percent)}% of KPI target in the current review cycle, ` +
    `which is rated as ${score.rating}.`;

  const strengths = `Peer feedback highlights: ${record.peer_feedback}.`;
  const developmentAreas = `Manager observation: ${record.manager_notes}.`;

  const draftedReview =
    `Achievement Summary: ${achievementSummary}\n` +
    `Strengths: ${strengths}\n` +
    `Development Areas: ${developmentAreas}\n` +
    `Overall Rating: ${score.rating}`;

  return {
    achievement_summary: achievementSummary,
    strengths,
    development_areas: developmentAreas,
    drafted_review: draftedReview,
  };
}

function detectBiasLocal(text) {
  const lowered = text.toLowerCase();
  const keywordFlags = Object.keys(BIAS_KEYWORDS).filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(lowered);
  });

  const patternFlags = BIAS_PATTERNS.filter((p) => p.pattern.test(text)).map((p) => p.flag);
  return Array.from(new Set([...keywordFlags, ...patternFlags]));
}

function rewriteReviewLocal(record, score, flags) {
  let biasNote = "";
  if (flags.length > 0) {
    const guidance = flags.map((f) => BIAS_KEYWORDS[f] || "Use objective performance language.").join("; ");
    biasNote = `Bias handling applied: ${guidance}. `;
  }

  return (
    `Achievement Summary: ${record.employee_name} achieved ${Math.round(score.kpi_percent)}% against KPI targets, ` +
    `resulting in a ${score.rating} assessment based on measurable performance.\n` +
    `Strengths: ${record.peer_feedback}.\n` +
    `Development Areas: ${record.manager_notes}.\n` +
    `Overall Rating: ${score.rating}.\n` +
    `${biasNote}Review language is aligned to outcomes, evidence, and role expectations.`
  ).trim();
}

function countGapSignals(text) {
  const lower = text.toLowerCase();
  const cues = ["needs", "improve", "should", "gap", "issue", "delay", "risk"];
  return cues.reduce((count, cue) => count + (lower.includes(cue) ? 1 : 0), 0);
}

function countBehaviorRiskSignals(text) {
  const lower = text.toLowerCase();
  const cues = [
    "not good",
    "poor collaboration",
    "cannot work in team",
    "can't work in team",
    "doesn't know how to work in team",
    "does not know how to work in team",
    "team-spirit",
    "team spirit",
    "lack of leadership",
    "poor leadership",
    "not hardworking",
    "lazy",
    "arrogant",
    "too arrogant",
    "conflict",
    "resistance to feedback",
    "disrespect",
    "harmful",
    "hostile",
    "unprofessional",
  ];
  return cues.reduce((count, cue) => count + (lower.includes(cue) ? 1 : 0), 0);
}

function toolKpiScorer(record) {
  const kpiPercent = parseKpiPercent(record.kpi_score_raw);
  return {
    kpi_percent: kpiPercent,
    rating: evaluateKpi(kpiPercent),
  };
}

function toolDatasetAnalyzer(record, score, datasetContext) {
  const roleAverage = datasetContext.roleAverages[record.role] ?? datasetContext.globalAverage;
  const percentileGlobal = percentileRank(datasetContext.allKpis, score.kpi_percent);
  const roleKpis = datasetContext.roleKpis[record.role] || [];
  const percentileRole = percentileRank(roleKpis, score.kpi_percent);

  return {
    global_average_kpi: Number(datasetContext.globalAverage.toFixed(2)),
    role_average_kpi: Number(roleAverage.toFixed(2)),
    percentile_global: Number(percentileGlobal.toFixed(2)),
    percentile_role: Number(percentileRole.toFixed(2)),
    top_decile: percentileGlobal >= 90,
    bottom_decile: percentileGlobal <= 10,
  };
}

function toolPolicyInterpreter(record, score, comparative, managerNotes, peerFeedback, biasFlags, policyDocument) {
  const notesLower = managerNotes.toLowerCase();
  const peerLower = peerFeedback.toLowerCase();
  const gapSignals = countGapSignals(managerNotes);
  const behaviorSignals = countBehaviorRiskSignals(`${managerNotes}\n${peerFeedback}`);
  const leadershipRiskSignals = countBehaviorRiskSignals(`${managerNotes}\n${peerFeedback}`);

  const performance_results = score.kpi_percent >= 90;
  const quality_and_responsibility = score.kpi_percent >= 90 && gapSignals <= 1;
  const behavior_and_team_impact = behaviorSignals === 0 && !biasFlags.some((f) => String(f).includes("gender"));
  const role_readiness =
    (score.kpi_percent >= 105 || comparative.percentile_global >= 75) &&
    gapSignals <= 1 &&
    leadershipRiskSignals === 0;

  const contradiction_detected =
    score.kpi_percent >= 105 &&
    (behaviorSignals > 0 ||
      notesLower.includes("poor collaboration") ||
      notesLower.includes("conflict") ||
      peerLower.includes("poor collaboration") ||
      peerLower.includes("conflict"));

  const mandatory_all = performance_results && quality_and_responsibility && behavior_and_team_impact && role_readiness;
  const must_pause_for_contradiction = contradiction_detected;

  const failed_criteria = [];
  if (!performance_results) failed_criteria.push("Performance Results");
  if (!quality_and_responsibility) failed_criteria.push("Quality of Work and Responsibility");
  if (!behavior_and_team_impact) failed_criteria.push("Behavior and Team Impact");
  if (!role_readiness) failed_criteria.push("Role Readiness");

  return {
    policy_document_path: policyDocument.path,
    policy_loaded: Boolean(policyDocument.text),
    mandatory_checks: {
      performance_results,
      quality_and_responsibility,
      behavior_and_team_impact,
      role_readiness,
    },
    contradiction_detected,
    must_pause_for_contradiction,
    failed_criteria,
    policy_summary:
      "Promotion requires all mandatory criteria: sustained performance, responsibility readiness, healthy behavior impact, and role readiness.",
  };
}

function toolPromotionPolicyChecker(score, comparative, managerNotes, policyEval) {
  const gapSignals = countGapSignals(managerNotes);
  const highPerformer = score.kpi_percent >= 110 || comparative.percentile_global >= 85;
  const underPerformer = score.kpi_percent < 90 || comparative.percentile_global <= 15;

  let decision = "Needs 6-month development";
  let reason = "Balanced recommendation based on KPI trend and development evidence.";

  if (policyEval.must_pause_for_contradiction) {
    decision = "Needs 6-month development";
    reason = "Policy requires pausing promotion when high KPI conflicts with behavioral concerns.";
  } else if (policyEval.mandatory_checks.performance_results === false) {
    decision = "Not recommended";
    reason = "Policy requires sustained performance; current KPI does not satisfy minimum threshold.";
  } else if (policyEval.mandatory_checks.behavior_and_team_impact === false) {
    decision = "Not recommended";
    reason = "Policy disallows promotion when behavior or fairness concerns are unresolved.";
  } else if (policyEval.mandatory_checks.role_readiness === false) {
    decision = "Needs 6-month development";
    reason = "Policy requires demonstrated role readiness before promotion.";
  } else if (highPerformer && gapSignals === 0) {
    decision = "Promotion Ready";
    reason = "Strong KPI outcomes and benchmarking indicate readiness for increased scope.";
  } else if (underPerformer) {
    decision = "Not recommended";
    reason = "Current KPI level and comparative ranking require performance recovery before promotion.";
  } else if (comparative.percentile_global >= 70 && gapSignals <= 1) {
    decision = "Promotion Ready";
    reason = "Above-benchmark KPI performance with limited risk indicators supports promotion readiness.";
  } else {
    decision = "Needs 6-month development";
    reason = "Performance is competitive, but development signals indicate additional maturity window.";
  }

  if (!VALID_PROMOTION_DECISIONS.has(decision)) {
    throw new Error("Promotion policy checker produced invalid decision");
  }

  return {
    decision,
    reason,
    gap_signals: gapSignals,
    policy_failed_criteria: policyEval.failed_criteria,
    contradiction_detected: policyEval.contradiction_detected,
  };
}

function toolDisagreementDetector(score, comparative, recommendation, managerNotes, policyEval) {
  const issues = [];
  const gapSignals = countGapSignals(managerNotes);

  if (score.kpi_percent >= 105 && recommendation.decision === "Not recommended") {
    issues.push("High KPI with negative recommendation suggests inconsistency.");
  }

  if (
    comparative.percentile_global >= 80 &&
    recommendation.decision === "Needs 6-month development" &&
    gapSignals === 0 &&
    !policyEval.must_pause_for_contradiction
  ) {
    issues.push("Top-quintile performer marked non-ready without evidence of risk.");
  }

  if (score.kpi_percent < 90 && recommendation.decision === "Promotion Ready") {
    issues.push("Low KPI with promotion-ready decision violates policy boundaries.");
  }

  return {
    inconsistent: issues.length > 0,
    issues,
  };
}

function toolInterventionTrigger(record, score, recommendation, disagreement) {
  if (recommendation.decision === "Not recommended" || score.rating === "Needs Improvement") {
    return {
      type: "PIP",
      title: "Performance Improvement Plan (90 days)",
      actions: [
        "Set weekly KPI milestones with manager check-ins.",
        "Assign targeted skill training tied to role outcomes.",
        "Run bi-weekly progress calibration with HRBP.",
      ],
    };
  }

  if (disagreement.inconsistent) {
    return {
      type: "Calibration",
      title: "Manager Calibration Review",
      actions: [
        "Escalate case for panel review to resolve rating inconsistency.",
        "Require evidence-based narrative aligned to KPI percentile.",
        "Log final decision with audit trail.",
      ],
    };
  }

  if (recommendation.decision === "Needs 6-month development") {
    return {
      type: "Development Plan",
      title: "6-Month Growth Plan",
      actions: [
        "Define 2 capability goals linked to role expectations.",
        "Assign mentor and monthly progress checkpoints.",
        "Track KPI delta and readiness review at month 6.",
      ],
    };
  }

  return {
    type: "Acceleration",
    title: "Promotion Transition Plan",
    actions: [
      "Expand ownership scope over next quarter.",
      "Assign leadership deliverable with measurable outcomes.",
      "Finalize promotion packet in next cycle.",
    ],
  };
}

function extractJsonFromText(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) throw new Error("Empty LLM response content");
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  const attempts = [candidate];
  const start = candidate.search(/[\[{]/);
  const endObj = candidate.lastIndexOf("}");
  const endArr = candidate.lastIndexOf("]");
  const end = Math.max(endObj, endArr);
  if (start >= 0 && end > start) {
    attempts.push(candidate.slice(start, end + 1));
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch (_err) {
      const normalized = attempt
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .replace(/\u0000/g, "");
      try {
        return JSON.parse(normalized);
      } catch (_innerErr) {
        // Continue with next parse strategy.
      }
    }
  }

  throw new Error("Could not parse JSON from LLM response");
}

async function parseJsonWithRepair(rawContent, schemaHint, config) {
  try {
    return extractJsonFromText(rawContent);
  } catch (_err) {
    const repaired = await callGroq(
      [
        {
          role: "system",
          content:
            "You are a JSON repair assistant. Convert the user text into one valid JSON object only. Do not include markdown.",
        },
        {
          role: "user",
          content:
            `Return strict JSON with this schema: ${schemaHint}\n` +
            `If a field is missing, infer safely from text. Keep it concise.\n\n` +
            `TEXT:\n${rawContent}`,
        },
      ],
      { ...config, temperature: 0.0, maxTokens: Math.max(420, config.maxTokens || 420) }
    );

    return extractJsonFromText(repaired);
  }
}

async function callGroq(messages, config) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL;
  const url = process.env.GROQ_API_URL || "https://api.groq.com/openai/v1/chat/completions";

  if (!apiKey) throw new Error("GROQ_API_KEY is not set");
  if (!model) throw new Error("GROQ_MODEL is not set");

  const modelCandidates = model.includes("/") ? [model] : [model, `openai/${model}`];
  let lastError = null;
  const maxAttemptsPerPayload = 4;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  for (const candidateModel of modelCandidates) {
    const payloads = [
      {
        model: candidateModel,
        messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        response_format: { type: "json_object" },
      },
      {
        model: candidateModel,
        messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      },
    ];

    for (let payloadIndex = 0; payloadIndex < payloads.length; payloadIndex += 1) {
      const payload = payloads[payloadIndex];
      const usingStrictJson = payloadIndex === 0;
      for (let attempt = 1; attempt <= maxAttemptsPerPayload; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), config.timeoutMs);
        const adaptiveMaxTokens = Math.min(
          1800,
          Math.max(220, Math.floor((payload.max_tokens || config.maxTokens || 400) * (1 + (attempt - 1) * 0.5)))
        );
        const adaptivePayload = { ...payload, max_tokens: adaptiveMaxTokens };

        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(adaptivePayload),
            signal: controller.signal,
          });

          const text = await response.text();
          if (!response.ok) {
            if (usingStrictJson && response.status === 400 && text.includes("json_validate_failed")) {
              lastError = new Error(`Groq strict JSON format failed for '${candidateModel}', retrying.`);
              continue;
            }
            if (response.status === 404 && candidateModel !== modelCandidates[modelCandidates.length - 1]) {
              lastError = new Error(`Groq model not found for '${candidateModel}'`);
              continue;
            }
            throw new Error(`Groq API error ${response.status}: ${text.slice(0, 260)}`);
          }

          const data = JSON.parse(text);
          const message = data?.choices?.[0]?.message || {};
          const content = message.content;
          if (typeof content === "string" && content.trim().length > 0) {
            return content;
          }

          const finishReason = data?.choices?.[0]?.finish_reason || "unknown";
          const fallbackText = message.refusal || "";
          const noContentErr = new Error(
            `Groq returned no content (finish_reason=${finishReason}${fallbackText ? `, refusal=${fallbackText}` : ""})`
          );
          lastError = noContentErr;

          if (attempt < maxAttemptsPerPayload) {
            await sleep(150 * attempt);
            continue;
          }
          if (usingStrictJson) {
            // Try the non-strict payload variant before failing.
            continue;
          }
          throw noContentErr;
        } catch (err) {
          lastError = err;
          const lastAttempt = attempt === maxAttemptsPerPayload;
          const lastPayload = payloadIndex === payloads.length - 1;
          const lastModel = candidateModel === modelCandidates[modelCandidates.length - 1];
          if (lastAttempt && lastPayload && lastModel) throw err;
        } finally {
          clearTimeout(timer);
        }
      }
    }
  }

  throw lastError || new Error("Groq call failed");
}

async function draftReviewLLM(record, score, comparative, config) {
  const content = await callGroq(
    [
      {
        role: "system",
        content:
          "You are an HR review writer. Return strict JSON with keys: achievement_summary, strengths, development_areas, drafted_review. Never hide critical negative feedback when present; keep both strengths and risks explicit and evidence-based.",
      },
      {
        role: "user",
        content:
          `Employee: ${record.employee_name}\nRole: ${record.role}\nKPI: ${score.kpi_percent}%\nRating: ${score.rating}\n` +
          `Role Avg KPI: ${comparative.role_average_kpi}\nGlobal Avg KPI: ${comparative.global_average_kpi}\n` +
          `Percentile Global: ${comparative.percentile_global}\nPeer Feedback: ${record.peer_feedback}\nManager Notes: ${record.manager_notes}`,
      },
    ],
    { ...config, temperature: 0.2, maxTokens: 650 }
  );

  const parsed = await parseJsonWithRepair(
    content,
    "{ achievement_summary: string, strengths: string, development_areas: string, drafted_review: string }",
    config
  );
  if (!parsed.achievement_summary || !parsed.strengths || !parsed.development_areas || !parsed.drafted_review) {
    throw new Error("LLM draft response missing required fields");
  }

  return {
    achievement_summary: String(parsed.achievement_summary).trim(),
    strengths: String(parsed.strengths).trim(),
    development_areas: String(parsed.development_areas).trim(),
    drafted_review: String(parsed.drafted_review).trim(),
  };
}

async function detectBiasLLM(reviewText, config) {
  const content = await callGroq(
    [
      {
        role: "system",
        content:
          "You are an HR bias checker. Return strict JSON with keys: has_bias(boolean), flags(array), rationale(string).",
      },
      {
        role: "user",
        content:
          "Find biased or non-performance language. Include terms for gender, age, affinity, halo, leniency, recency biases.\n" +
          `Review Text:\n${reviewText}`,
      },
    ],
    { ...config, temperature: 0.0, maxTokens: 380 }
  );

  const parsed = await parseJsonWithRepair(
    content,
    "{ has_bias: boolean, flags: string[], rationale: string }",
    config
  );
  return {
    has_bias: Boolean(parsed.has_bias),
    flags: Array.isArray(parsed.flags) ? parsed.flags.map((x) => String(x).trim()).filter(Boolean) : [],
    rationale: String(parsed.rationale || "").trim(),
  };
}

async function rewriteReviewLLM(record, draftText, flags, config) {
  const content = await callGroq(
    [
      {
        role: "system",
        content: "Rewrite reviews with objective, KPI-aligned language. Return strict JSON key: rewritten_review.",
      },
      {
        role: "user",
        content:
          `Employee: ${record.employee_name}\nRole: ${record.role}\nBias Flags: ${flags.join(", ") || "none"}\n` +
          `Draft:\n${draftText}`,
      },
    ],
    { ...config, temperature: 0.2, maxTokens: 650 }
  );

  const parsed = await parseJsonWithRepair(
    content,
    "{ rewritten_review: string }",
    config
  );
  if (!parsed.rewritten_review) throw new Error("LLM rewrite response missing rewritten_review");
  return String(parsed.rewritten_review).trim();
}

async function explainRecommendationLLM(record, score, comparative, recommendation, policyEval, policyDocument, config) {
  const content = await callGroq(
    [
      {
        role: "system",
        content: "Write concise HR justification tied to policy rules. Return strict JSON key: reason.",
      },
      {
        role: "user",
        content:
          `Employee: ${record.employee_name}\nRole: ${record.role}\nKPI: ${score.kpi_percent}%\nRating: ${score.rating}\n` +
          `Global Percentile: ${comparative.percentile_global}\nRole Percentile: ${comparative.percentile_role}\n` +
          `Decision: ${recommendation.decision}\nManager Notes: ${record.manager_notes}\n` +
          `Failed Policy Criteria: ${policyEval.failed_criteria.join(", ") || "None"}\n` +
          `Contradiction Detected: ${policyEval.contradiction_detected ? "Yes" : "No"}\n` +
          `Policy Summary: ${policyEval.policy_summary}\n` +
          `Respond in one short sentence only.`,
      },
    ],
    { ...config, temperature: 0.1, maxTokens: 180 }
  );

  const parsed = await parseJsonWithRepair(
    content,
    "{ reason: string }",
    config
  );
  const reason = String(parsed.reason || "").trim();
  if (!reason) throw new Error("LLM explanation missing reason");
  return reason;
}

async function calibrateContradictionDecisionLLM(record, score, comparative, policyEval, recommendation, config) {
  const content = await callGroq(
    [
      {
        role: "system",
        content:
          "You are an HR promotion calibration agent. Detect contradictions between KPI strength and behavioral feedback. Return strict JSON with keys: contradiction_detected(boolean), balanced_decision(string), rationale(string), confidence(string). balanced_decision must be one of Promotion Ready, Needs 6-month development, Not recommended.",
      },
      {
        role: "user",
        content:
          "Policy Rules (non-negotiable):\n" +
          "1) Promotion requires BOTH performance and behavior readiness.\n" +
          "2) High KPI does NOT override serious collaboration/leadership risks.\n" +
          "3) If strong KPI conflicts with behavioral concerns, promotion must be paused.\n\n" +
          "Few-shot examples:\n" +
          "Example A:\n" +
          "- KPI: 114%\n" +
          "- Feedback: poor collaboration, recurring conflict, resistant to feedback\n" +
          "- Decision: Needs 6-month development\n" +
          "- Why: contradiction present; behavior risk blocks promotion despite high KPI\n\n" +
          "Example B:\n" +
          "- KPI: 112%\n" +
          "- Feedback: strong ownership, collaborative, guides team\n" +
          "- Decision: Promotion Ready\n" +
          "- Why: no contradiction; both performance and behavior are strong\n\n" +
          "Evaluate this case now:\n" +
          `Employee: ${record.employee_name}\nRole: ${record.role}\nKPI: ${score.kpi_percent}%\nRating: ${score.rating}\n` +
          `Global Percentile: ${comparative.percentile_global}\nRole Percentile: ${comparative.percentile_role}\n` +
          `Peer Feedback: ${record.peer_feedback}\nManager Notes: ${record.manager_notes}\n` +
          `Policy Failed Criteria: ${policyEval.failed_criteria.join(", ") || "None"}\n` +
          `Policy Contradiction Flag: ${policyEval.contradiction_detected ? "true" : "false"}\n` +
          `Current Recommendation: ${recommendation.decision}`,
      },
    ],
    { ...config, temperature: 0.0, maxTokens: 260 }
  );

  const parsed = await parseJsonWithRepair(
    content,
    "{ contradiction_detected: boolean, balanced_decision: string, rationale: string, confidence: string }",
    config
  );

  const balancedDecision = String(parsed.balanced_decision || "").trim();
  if (!VALID_PROMOTION_DECISIONS.has(balancedDecision)) {
    throw new Error("LLM contradiction calibration returned invalid decision");
  }

  return {
    contradiction_detected: Boolean(parsed.contradiction_detected),
    balanced_decision: balancedDecision,
    rationale: String(parsed.rationale || "").trim(),
    confidence: String(parsed.confidence || "").trim() || "medium",
  };
}

function createMemory(stateFile, noState) {
  const session = {
    processed: 0,
    promotion_ready: 0,
    needs_development: 0,
    not_recommended: 0,
    exceeds_expectations: 0,
    meets_expectations: 0,
    needs_improvement: 0,
    bias_flagged: 0,
    inconsistencies: 0,
  };

  const absoluteStateFile = path.resolve(stateFile);
  let persisted = {
    total_runs: 0,
    total_processed: 0,
    total_promotion_ready: 0,
    total_needs_development: 0,
    total_not_recommended: 0,
    last_run_at: null,
  };

  if (!noState && fs.existsSync(absoluteStateFile)) {
    try {
      persisted = { ...persisted, ...JSON.parse(fs.readFileSync(absoluteStateFile, "utf8")) };
    } catch (_err) {
      // Keep default state on parse errors.
    }
  }

  return {
    session,
    persisted,
    noState,
    stateFile: absoluteStateFile,
  };
}

function updateMemory(memory, review) {
  memory.session.processed += 1;
  if (review.overall_rating === "Exceeds Expectations") memory.session.exceeds_expectations += 1;
  if (review.overall_rating === "Meets Expectations") memory.session.meets_expectations += 1;
  if (review.overall_rating === "Needs Improvement") memory.session.needs_improvement += 1;

  if (review.bias_flags.length > 0) memory.session.bias_flagged += 1;
  if (review.disagreement.inconsistent) memory.session.inconsistencies += 1;

  if (review.promotion_recommendation === "Promotion Ready") memory.session.promotion_ready += 1;
  if (review.promotion_recommendation === "Needs 6-month development") memory.session.needs_development += 1;
  if (review.promotion_recommendation === "Not recommended") memory.session.not_recommended += 1;
}

function persistMemory(memory) {
  if (memory.noState) return;

  const nextState = {
    total_runs: memory.persisted.total_runs + 1,
    total_processed: memory.persisted.total_processed + memory.session.processed,
    total_promotion_ready: memory.persisted.total_promotion_ready + memory.session.promotion_ready,
    total_needs_development: memory.persisted.total_needs_development + memory.session.needs_development,
    total_not_recommended: memory.persisted.total_not_recommended + memory.session.not_recommended,
    last_run_at: new Date().toISOString(),
  };

  fs.writeFileSync(memory.stateFile, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
  memory.persisted = nextState;
}

async function runAgentOnRecord(record, context) {
  const toolTrace = [];
  const llmErrors = [];

  toolTrace.push("tool_kpi_scorer");
  const score = toolKpiScorer(record);

  toolTrace.push("tool_dataset_analyzer");
  const comparative = toolDatasetAnalyzer(record, score, context.datasetContext);

  let draft = draftReviewLocal(record, score);
  toolTrace.push("tool_review_drafter");
  if (context.options.useLlm) {
    try {
      draft = await draftReviewLLM(record, score, comparative, context.options.llmConfig);
      toolTrace.push("tool_review_drafter_llm");
    } catch (err) {
      llmErrors.push(`draft: ${err.message}`);
      if (context.options.mode === "llm") throw err;
    }
  }

  toolTrace.push("tool_bias_classifier");
  const biasSourceText =
    `${draft.drafted_review}\n\n` +
    `Peer Feedback Raw: ${record.peer_feedback}\n` +
    `Manager Notes Raw: ${record.manager_notes}`;

  const localFlags = detectBiasLocal(biasSourceText);
  let llmBias = { has_bias: false, flags: [], rationale: "" };
  if (context.options.useLlm) {
    try {
      llmBias = await detectBiasLLM(biasSourceText, context.options.llmConfig);
      toolTrace.push("tool_bias_classifier_llm");
    } catch (err) {
      llmErrors.push(`bias: ${err.message}`);
      if (context.options.mode === "llm") throw err;
    }
  }

  const biasFlags = Array.from(new Set([...localFlags, ...llmBias.flags]));

  toolTrace.push("tool_policy_retriever");
  toolTrace.push("tool_policy_interpreter");
  const policyEval = toolPolicyInterpreter(
    record,
    score,
    comparative,
    record.manager_notes,
    record.peer_feedback,
    biasFlags,
    context.policyDocument
  );

  let rewrittenReview = draft.drafted_review;
  let rewriteApplied = false;
  if (biasFlags.length > 0) {
    toolTrace.push("tool_rewrite_agent");
    rewriteApplied = true;
    rewrittenReview = rewriteReviewLocal(record, score, biasFlags);

    if (context.options.useLlm) {
      try {
        rewrittenReview = await rewriteReviewLLM(record, draft.drafted_review, biasFlags, context.options.llmConfig);
        toolTrace.push("tool_rewrite_agent_llm");
      } catch (err) {
        llmErrors.push(`rewrite: ${err.message}`);
        if (context.options.mode === "llm") throw err;
      }
    }
  }

  toolTrace.push("tool_promotion_policy_checker");
  const recommendation = toolPromotionPolicyChecker(score, comparative, record.manager_notes, policyEval);

  let contradictionCalibration = {
    contradiction_detected: policyEval.contradiction_detected,
    balanced_decision: recommendation.decision,
    rationale: "Rule-based calibration applied.",
    confidence: "high",
  };

  if (context.options.useLlm) {
    try {
      contradictionCalibration = await calibrateContradictionDecisionLLM(
        record,
        score,
        comparative,
        policyEval,
        recommendation,
        context.options.llmConfig
      );
      toolTrace.push("tool_contradiction_calibrator_llm");
    } catch (err) {
      llmErrors.push(`contradiction_calibrator: ${err.message}`);
      if (context.options.mode === "llm") throw err;
    }
  }

  if (policyEval.must_pause_for_contradiction || policyEval.failed_criteria.length > 0) {
    // Hard policy guardrail: any failed mandatory criterion blocks Promotion Ready.
    if (contradictionCalibration.balanced_decision === "Promotion Ready") {
      contradictionCalibration.balanced_decision =
        policyEval.mandatory_checks.performance_results && !policyEval.mandatory_checks.behavior_and_team_impact
          ? "Needs 6-month development"
          : "Not recommended";
      contradictionCalibration.rationale =
        "Overridden by policy guardrail: mandatory criteria failure prevents Promotion Ready.";
      contradictionCalibration.confidence = "high";
    }
  }

  recommendation.decision = contradictionCalibration.balanced_decision;

  if (context.options.useLlm) {
    try {
      recommendation.reason = await explainRecommendationLLM(
        record,
        score,
        comparative,
        recommendation,
        policyEval,
        context.policyDocument,
        context.options.llmConfig
      );
      toolTrace.push("tool_promotion_explainer_llm");
    } catch (err) {
      llmErrors.push(`promotion_explainer: ${err.message}`);
      if (context.options.mode === "llm") throw err;
    }
  }

  if (!context.options.useLlm && contradictionCalibration.rationale) {
    recommendation.reason = `${recommendation.reason} ${contradictionCalibration.rationale}`.trim();
  }

  toolTrace.push("tool_disagreement_detector");
  const disagreement = toolDisagreementDetector(score, comparative, recommendation, record.manager_notes, policyEval);

  toolTrace.push("tool_intervention_trigger");
  const intervention = toolInterventionTrigger(record, score, recommendation, disagreement);

  return {
    employee_name: record.employee_name,
    role: record.role,
    kpi_percent: score.kpi_percent,
    overall_rating: score.rating,
    comparative,
    achievement_summary: draft.achievement_summary,
    strengths: draft.strengths,
    development_areas: draft.development_areas,
    drafted_review: draft.drafted_review,
    bias_flags: biasFlags,
    bias_rationale: llmBias.rationale || "",
    rewrite_applied: rewriteApplied,
    rewritten_review: rewrittenReview,
    promotion_recommendation: recommendation.decision,
    promotion_justification: recommendation.reason,
    contradiction_calibration: contradictionCalibration,
    policy_evaluation: policyEval,
    disagreement,
    intervention,
    tool_trace: toolTrace,
    llm_mode: context.options.mode,
    llm_used: context.options.useLlm,
    llm_fallback_used: llmErrors.length > 0,
    llm_errors: llmErrors,
  };
}

function buildBatchSummary(reviews, datasetContext, memory) {
  const sorted = [...reviews].sort((a, b) => b.kpi_percent - a.kpi_percent);
  const groupSize = Math.max(1, Math.ceil(sorted.length * 0.1));
  const top10 = sorted.slice(0, groupSize).map((r) => ({ employee_name: r.employee_name, kpi_percent: r.kpi_percent }));
  const bottom10 = sorted.slice(-groupSize).map((r) => ({ employee_name: r.employee_name, kpi_percent: r.kpi_percent }));

  const exceedsRatio = reviews.length ? memory.session.exceeds_expectations / reviews.length : 0;
  const promotionRatio = reviews.length ? memory.session.promotion_ready / reviews.length : 0;
  const leniencyRisk = exceedsRatio >= 0.6 || promotionRatio >= 0.5;

  return {
    employees_processed: reviews.length,
    global_average_kpi: Number(datasetContext.globalAverage.toFixed(2)),
    top_10_percent: top10,
    bottom_10_percent: bottom10,
    potential_leniency_bias: leniencyRisk,
    leniency_reason: leniencyRisk
      ? "High concentration of Exceeds Expectations / Promotion Ready decisions detected."
      : "No strong evidence of rating inflation in this run.",
    inconsistent_cases: reviews.filter((r) => r.disagreement.inconsistent).map((r) => r.employee_name),
    bias_flagged_cases: reviews.filter((r) => r.bias_flags.length > 0).map((r) => r.employee_name),
    session_memory: memory.session,
    persisted_memory: memory.persisted,
  };
}

function formatReview(review) {
  return (
    `Employee: ${review.employee_name} (${review.role})\n` +
    `KPI: ${Math.round(review.kpi_percent)}% | Rating: ${review.overall_rating}\n` +
    `Global Avg: ${review.comparative.global_average_kpi}% | Role Avg: ${review.comparative.role_average_kpi}%\n` +
    `Percentile (Global/Role): ${review.comparative.percentile_global}/${review.comparative.percentile_role}\n` +
    `Bias Flags: ${review.bias_flags.length ? review.bias_flags.join(", ") : "None"}\n` +
    `Rewrite Applied: ${review.rewrite_applied ? "Yes" : "No"}\n` +
    `Promotion Recommendation: ${review.promotion_recommendation}\n` +
    `Justification: ${review.promotion_justification}\n` +
    `Policy Failed Criteria: ${review.policy_evaluation.failed_criteria.length ? review.policy_evaluation.failed_criteria.join(", ") : "None"}\n` +
    `Policy Contradiction: ${review.policy_evaluation.contradiction_detected ? "Yes" : "No"}\n` +
    `${review.disagreement.inconsistent ? `Inconsistency Alert: ${review.disagreement.issues.join(" | ")}\n` : "Inconsistency Alert: None\n"}` +
    `Intervention Trigger: ${review.intervention.title}\n` +
    `Tool Trace: ${review.tool_trace.join(" -> ")}\n` +
    `LLM Used: ${review.llm_used ? "Yes" : "No"} | Fallback: ${review.llm_fallback_used ? "Yes" : "No"}\n\n` +
    `Final Review\n${review.rewritten_review}\n`
  );
}

function formatSummary(summary) {
  return (
    `Batch Summary\n` +
    `Processed: ${summary.employees_processed}\n` +
    `Global Avg KPI: ${summary.global_average_kpi}%\n` +
    `Leniency Bias Risk: ${summary.potential_leniency_bias ? "Yes" : "No"}\n` +
    `Leniency Note: ${summary.leniency_reason}\n` +
    `Inconsistent Cases: ${summary.inconsistent_cases.length ? summary.inconsistent_cases.join(", ") : "None"}\n` +
    `Bias Flagged Cases: ${summary.bias_flagged_cases.length ? summary.bias_flagged_cases.join(", ") : "None"}\n` +
    `Top 10%: ${summary.top_10_percent.map((x) => `${x.employee_name} (${Math.round(x.kpi_percent)}%)`).join(", ")}\n` +
    `Bottom 10%: ${summary.bottom_10_percent.map((x) => `${x.employee_name} (${Math.round(x.kpi_percent)}%)`).join(", ")}\n`
  );
}

async function main() {
  loadEnvFile();
  const args = parseArgs(process.argv.slice(2));

  const hasLlmConfig = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_MODEL);
  if (!hasLlmConfig && args.mode !== "local") {
    throw new Error("GROQ_API_KEY and GROQ_MODEL are required for hybrid/llm mode. Use --local-only to skip LLM calls.");
  }

  const options = {
    mode: args.mode,
    useLlm: args.mode !== "local" && hasLlmConfig,
    llmConfig: { timeoutMs: Number.isFinite(args.timeoutMs) ? args.timeoutMs : 30000 },
  };

  const records = loadRecords(args.data);
  const policyDocument = loadPolicyDocument(args.policyFile);
  const datasetContext = initializeDatasetContext(records);
  const selectedRecords = args.employee
    ? datasetContext.enrichedRecords.filter((r) => r.employee_name.toLowerCase() === args.employee.toLowerCase())
    : datasetContext.enrichedRecords;

  const memory = createMemory(args.stateFile, args.noState);
  const context = { datasetContext, options, policyDocument };

  const reviews = [];
  for (const record of selectedRecords) {
    const review = await runAgentOnRecord(record, context);
    reviews.push(review);
    updateMemory(memory, review);
  }

  persistMemory(memory);
  const summary = buildBatchSummary(reviews, datasetContext, memory);

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify({
        mode: options.mode,
        employee_filter: args.employee || null,
        reviews,
        summary,
      }, null, 2)}\n`
    );
    return;
  }

  reviews.forEach((review) => {
    process.stdout.write(`${formatReview(review)}\n`);
    process.stdout.write(`${"-".repeat(90)}\n`);
  });

  process.stdout.write(`\n${formatSummary(summary)}`);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
