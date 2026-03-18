<div align="center">

<br/>

# 🧩 HR Agentic Suite
### *Agentic AI Platform for Performance Intelligence*

**Performance reviews. Bias detection. Talent risk. Workload rebalancing. All autonomous.**

<br/>

![Agentic AI](https://img.shields.io/badge/Agentic_AI-6366F1?style=for-the-badge&logoColor=white)
![Bias Detection](https://img.shields.io/badge/Bias_Detection-DC2626?style=for-the-badge&logoColor=white)
![Talent Risk](https://img.shields.io/badge/Talent_Guardian-F59E0B?style=for-the-badge&logoColor=white)
![LLM Powered](https://img.shields.io/badge/LLM_+_Fallbacks-10B981?style=for-the-badge&logoColor=white)
![Dark Mode](https://img.shields.io/badge/Dark_Mode_UI-0F172A?style=for-the-badge&logoColor=white)

<br/>

</div>

---

## ⚙️ Setup

**1. Configure environment**
```bash
cp .env.example .env
```
```env
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=your_groq_model
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB=your_database_name
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM="HR Agentic Suite"
GOOGLE_CLIENT_ID=your_google_oauth_web_client_id
# Optional:
# GROQ_API_URL=https://api.groq.com/openai/v1/chat/completions
```

**2. Install & run**
```bash
npm install
npm run app
```

**3. Open in browser**
```
http://localhost:5602/
```

---

## 🌟 Full Feature List

### 🔐 Authentication & Access Control

A complete, production-ready auth layer — supporting both traditional and passwordless flows with a zero-friction guest mode for instant exploration.

- **Email/Password Auth** — MongoDB-backed signup and login with secure session handling
- **Google Sign-In** — Passwordless OAuth with server-side token verification; gracefully handles email conflicts: *"Account with this Gmail exists, please login or reset password"*
- **Forgot Password Flow** — SMTP-based reset link delivered to the user's inbox, with secure token validation
- **Guest Login** — Bypasses MongoDB entirely; lands directly on the dashboard using default quarterly JSONs. Guest mode never writes to the database — safe, isolated, and instant

---

### 📂 Data Ingestion & Quarterly CRUD

The engine runs on structured quarterly data — upload once, and the entire analytics pipeline activates automatically.

- **Quarterly JSON Upload** — Upload Q1–Q4 files for a selected year (2025); year selection is enforced to prevent mismatched data
- **Full CRUD Per Quarter** — Create, update, and delete individual quarterly files; deletion prompts confirmation and re-gates dashboard access until all 4 quarters are present (for registered users)
- **Auto-Built Hierarchy** — Manager and employee dropdowns are constructed automatically from uploaded JSON structure — no manual configuration needed

---

### 📊 Core Performance Review Engine

A rigorous, policy-aware review system that combines quantitative KPI signals with qualitative LLM reasoning — and never silently fails.

- **KPI Scoring Rubric** — Quantitative and qualitative signals combined into a structured annual rating
- **Structured Review Output** — Achievements, strengths, development areas, and final rating per employee
- **Bias Detection (Rule-Based + LLM)** — Explicit term flags, contradiction detection, and pattern-level bias surfacing across manager reviews
- **Promotion Recommendation** — Justified recommendation with a tailored development plan per candidate
- **Policy-Aware Reasoning** — All LLM decisions are grounded in `policy.txt` promotion and evaluation rules
- **Deterministic Fallbacks** — LLM JSON output includes repair attempts; if LLM fails, a rule-based fallback fires automatically — zero silent failures

---

### 👔 Manager & Employee Analytics

Deep-dive analytics that go beyond individual reviews — surfacing systemic patterns, calibration gaps, and predictive risk signals across your entire org.

- **Manager Pattern Analysis** — Per-manager bias report identifying rating tendencies, language patterns, and review inconsistencies
- **Manager Calibration Summary** — Cross-manager calibration view across all 5 managers — who rates hard, who rates easy, and where misalignment exists
- **Risk / Success Matrix** — Table-rendered dialog showing each employee's risk and success trajectory across quarters
- **Predictive Signals Snapshot** — Force multipliers, organizational disconnects, and critical SRS (Synthetic Resilience Score) risk flags surfaced as actionable signals

---

### 🔬 Internal AI Audit *(LLM-Driven)*

A one-click diagnostic engine that goes beneath surface-level metrics to identify hidden burnout, silent blockers, and manager blind spots before they become attrition.

- **Synthetic Resilience Score (SRS)** — Computed from sentiment, collaboration patterns, and manager positivity signals
- **Exhaustion Index (EI)** — Sustainability score that flags employees trending toward burnout before KPIs degrade
- **Diagnostic State Classification** — Classifies each employee's current state (thriving, at-risk, critical, stagnating)
- **Silent Blocker Inference** — LLM identifies hidden organizational friction not visible in performance data
- **Manager Blindspot Detection** — Flags cases where manager positivity is high but employee resilience is declining — a common early attrition signal
- **One-Click Generation** — Full audit generated instantly per selected employee

---

### 🛡️ Talent Guardian *(Autonomous Risk Agent)*

An always-on risk agent that detects flight risk, burnout trajectory, and critical SRS conditions — then autonomously generates a complete intervention package.

- **Yearly Burnout Model** — Tracks KPI vs sentiment divergence with lag effect to model burnout trajectory across quarters
- **Critical SRS Risk Detection** — Flags employees where KPI > 90 but SRS < 4 — high performers silently deteriorating
- **Auto-Generated Intervention Package** per at-risk employee:
  - 📧 Manager email draft
  - 🗣️ Stay interview script
  - 🗓️ 30-day roadmap
  - ⚖️ Workload change recommendations
  - 🔔 Q1 follow-up reminder
- **Stay Interview Flow** — Gmail draft generation + calendar invite links; stay interview is **manager + employee only**
- **Buffer Meet Scheduling** — HR + manager pre-meet scheduled 48–72 hours *before* the stay interview for alignment

---

### ⚖️ Workload Rebalancing & Impact Simulation

A safety-gated simulation engine that identifies who is overloaded, who can absorb work, and how to redistribute — without creating new burnout risks.

- **Sender Eligibility Gating** — Employee must clear EI and risk thresholds before rebalancing is triggered
- **Peer Scanning with Safety Filters** — Strict role and department matching; peers are scored on SRS + skill match
- **Anti-Overload Sponge Limit** — Peers cannot be reused across audits; prevents inadvertently overloading absorbers
- **Hybrid Offloading Logic** — Splits technical vs admin tasks when no single peer can absorb the full load
- **External Contractor Recommendation** — Triggered automatically if no safe internal peers exist
- **LLM Summary + Deterministic Fallback** — Every rebalancing output is explained in plain language; fallback fires if LLM is unavailable

---

### 🧠 Agentic Council *(Multi-Persona LLM)*

Three specialized AI personas that debate, challenge, and synthesize — eliminating generic outputs and forcing genuinely balanced recommendations.

| Persona | Role |
|---|---|
| 😈 **Cynic** | Risk agent — challenges optimistic assumptions, surfaces worst-case signals |
| 🌱 **Optimist** | Growth agent — identifies potential, frames development opportunities |
| 🎯 **Orchestrator** | Final synthesis — weighs both perspectives and produces the actionable recommendation |

---

### 📈 Visualization & UX

A dark-mode analytics dashboard with 15+ purpose-built charts — every graph includes a 1–2 line inference explanation so insights are never left to interpretation.

**Core Analytics**
- KPI bar chart with quarterly trend overlay
- Sentiment and collaboration trend lines
- Scissors Area (KPI vs SRS divergence)
- Skill Web (radar)
- Bias Distribution chart
- Collaboration Chord diagram

**Longitudinal Velocity Module**
- Phase Plane burnout vector
- Skill stagnation overflow bullet graph
- Calibration X-cross slope graph
- Blast radius dependency bubble map

**Workload Analytics**
- Risk Quadrant
- Scissors Trend (KPI vs SRS)
- Manager calibration dial
- Team heatmap
- Workload flow (Sankey)
- Match radar
- Peer capacity gauge *(dialog)*
- Capacity stack *(dialog)*

> All graphs support **zoom dialogs** — click to expand, click outside to close.

---

### 📄 Reporting & Exports

- **Auto-Generated Dashboard Report** — Print-friendly HTML report covering the full employee analytics view
- **Stay Interview Integration** — Report link embedded directly in the stay interview workflow for manager context

---

### 🔒 Reliability & Safeguards

- LLM JSON parsing with multi-attempt repair before fallback
- Reduced prompt payload mode for dashboard stability
- Local-only and LLM-only modes for the agent engine
- Guest mode fully isolated — never touches MongoDB

---

## 🗺️ Key APIs

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/signup` | Register new account |
| `POST` | `/api/auth/login` | Email/password login |
| `POST` | `/api/auth/logout` | End session |
| `GET` | `/api/auth/me` | Get current user |
| `POST` | `/api/auth/guest` | Guest login (no DB) |
| `POST` | `/api/auth/forgot-password` | Send reset email |
| `POST` | `/api/auth/reset-password` | Confirm new password |
| `GET` | `/api/auth/google-config` | Fetch OAuth client config |
| `POST` | `/api/auth/google` | Google Sign-In verification |

### Data & Reports
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/reports/upload` | Upload quarterly JSON |
| `GET` | `/api/reports/status` | Check upload status |
| `GET` | `/api/reports/list` | List uploaded quarters |
| `DELETE` | `/api/reports/:quarter` | Delete a quarter |
| `GET` | `/api/hierarchy` | Get org hierarchy |

### Analysis & Agents
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/analyze-performance` | Run performance review engine |
| `POST` | `/api/investigation-audit` | Run internal AI audit |
| `POST` | `/api/workload-rebalance` | Run workload simulation |
| `GET` | `/api/talent-guardian` | Get talent risk overview |
| `GET` | `/api/talent-guardian/package` | Get full intervention package |
| `GET` | `/api/talent-guardian/gmail-draft` | Generate Gmail draft |
| `GET` | `/api/talent-guardian/schedule` | Generate calendar schedule |
| `GET` | `/api/dashboard-report` | Export dashboard report |

---

## 🗂️ Project Structure
```
hr-agentic-suite/
│
├── scripts/
│   └── app-server.js          # Main server — auth, upload, analysis, workload, guardian
│
├── src/
│   └── hr_review_agent.js     # LLM review engine + deterministic fallback logic
│
├── frontend/
│   ├── auth.html              # Login, signup, Google OAuth, password reset UI
│   ├── auth.js                # Auth flow logic + Google Sign-In handler
│   ├── upload.html            # Quarterly JSON upload and management UI
│   ├── upload.js              # Upload, CRUD, and hierarchy construction logic
│   ├── index.html             # Main dashboard — analytics, charts, dialogs
│   ├── app.js                 # Dashboard UI logic + all visualization rendering
│   ├── workload.html          # Workload rebalancing simulation page
│   └── workload.js            # Workload engine logic + peer scoring + visuals
│
├── policy.txt                 # Promotion and evaluation policy rules (LLM context)
├── Q1.json – Q4.json          # Quarterly sample datasets
└── .env                       # Environment configuration
```

---

<div align="center">

<br/>

*Built with* **HR Agentic Suite** — *because every talent decision deserves more than a gut feeling.*

<br/>

</div>
