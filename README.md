# HR Agentic Suite

Agentic AI platform for performance reviews, bias detection, talent risk, and workload rebalancing with an LLM-backed pipeline and rule-based fallbacks.

## Environment Setup
Set in .env:

`env
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=your_groq_model
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB=your_database_name
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=" HR Agentic Suite\
GOOGLE_CLIENT_ID=your_google_oauth_web_client_id
# Optional:
# GROQ_API_URL=https://api.groq.com/openai/v1/chat/completions
`

## Run
`powershell
npm install
npm run app
`
Open:
http://localhost:5602/

## Full Feature List (Current Build)

### Authentication & Access
- Login and signup with MongoDB-backed accounts.
- Google Sign-In (passwordless) with server-side token verification.
- Conflict rule: if an email already exists as a local account, Google login shows: Account with this gmail exists, please login/reset password.
- Forgot password flow with email reset link (SMTP).
- Guest login that bypasses MongoDB and lands directly on the dashboard.
- Guest mode uses default quarterly JSONs and never writes to MongoDB.

### Data Ingestion & CRUD
- Upload 4 quarterly JSON files (Q1–Q4) for 2025, year selection enforced.
- CRUD for quarterly files: create/update/delete per quarter.
- Deletion prompts confirmation and re-gates access until all 4 quarters exist for registered users.
- Hierarchy auto-built from JSONs for manager/employee dropdowns.

### Core Performance Review Engine
- KPI scoring rubric (quantitative + qualitative signals).
- Structured annual review with achievements, strengths, development areas, and rating.
- Bias detection (rule-based + LLM) with explicit term flags and contradictions.
- Promotion recommendation with justification and development plan.
- Policy-aware reasoning using policy.txt.
- LLM JSON output with deterministic fallbacks on failure.

### Manager + Employee Analytics
- Manager pattern analysis and bias report.
- Manager calibration summary across the 5 managers.
- Risk/Success Matrix rendered as a table (dialog view).
- Predictive Signals Snapshot with force multipliers, disconnects, and critical SRS risk.

### Internal AI Audit (LLM-Driven)
- Synthetic Resilience Score (SRS) computed from sentiment, collaboration, and manager positivity.
- Exhaustion Index (EI) computation for sustainability.
- Diagnostic state classification + silent blocker inference.
- Manager blindspot detection if positivity is high but resilience is low.
- One-click generation per selected employee.

### Talent Guardian (Autonomous Risk Agent)
- Yearly burnout model (KPI vs sentiment divergence + lag effect).
- Critical SRS risk detection (KPI > 90 and SRS < 4).
- Auto-generated intervention package per employee:
 - Manager email draft
 - Stay interview script
 - 30-day roadmap
 - Workload changes
 - Q1 follow-up reminder
- Stay interview flow with Gmail draft + calendar links.
- Buffer meet scheduling (HR + manager only) with 48–72 hour gap before stay interview.
- Stay interview is manager + employee only.

### Workload Rebalancing & Impact Simulation
- Separate workload rebalancing page.
- Sender eligibility via EI and risk gates.
- Peer scanning with strict safety filters and role/department matching.
- Weighted peer scoring (SRS + skill match).
- Anti-overload sponge limit (peers cannot be re-used across audits).
- Hybrid offloading logic (split technical vs admin tasks if needed).
- External contractor recommendation if no safe peers exist.
- LLM summary plus deterministic fallback.

### Agentic Council (Multi-Persona LLM)
- Cynic (risk agent), Optimist (growth agent), Orchestrator (final synthesis).
- Prevents generic outputs and forces balanced recommendations.

### Visualization & UX
- Dark-mode dashboard with full analytics layout.
- Graph zoom dialogs (click to open, click outside to close).
- KPI bar chart + sentiment/collaboration trends.
- Scissors Area, Skill Web, Bias Distribution, Collaboration Chord.
- Longitudinal Velocity module:
 - Phase Plane burnout vector
 - Skill stagnation overflow bullet graph
 - Calibration X-cross slope graph
 - Blast radius dependency bubble map
- Workload analytics visuals:
 - Risk Quadrant
 - Scissors Trend (KPI vs SRS)
 - Manager calibration dial
 - Team heatmap
 - Workload flow (Sankey)
 - Match radar
 - Peer capacity gauge (dialog)
 - Capacity stack (dialog)
- Every graph includes a 1–2 line inference explanation.

### Reporting & Exports
- Auto-generated dashboard report (print-friendly HTML).
- Report embedded in stay-interview workflow as a link.

### Reliability & Safeguards
- LLM JSON parsing with repair attempts and deterministic fallback.
- Reduced prompt payload for stability on dashboard.
- Local-only and LLM-only modes for agent engine.

## Key APIs
- POST /api/auth/signup
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- POST /api/auth/guest
- POST /api/auth/forgot-password
- POST /api/auth/reset-password
- GET /api/auth/google-config
- POST /api/auth/google
- POST /api/reports/upload
- GET /api/reports/status
- GET /api/reports/list
- DELETE /api/reports/:quarter
- GET /api/hierarchy
- POST /api/analyze-performance
- POST /api/investigation-audit
- POST /api/workload-rebalance
- GET /api/talent-guardian
- GET /api/talent-guardian/package
- GET /api/talent-guardian/gmail-draft
- GET /api/talent-guardian/schedule
- GET /api/dashboard-report

## Project Structure
- scripts/app-server.js: main server (auth, upload, analysis, workload, guardian).
- rontend/auth.html, rontend/auth.js: auth + Google + reset flow.
- rontend/upload.html, rontend/upload.js: quarterly JSON management.
- rontend/index.html, rontend/app.js: dashboard UI + analytics.
- rontend/workload.html, rontend/workload.js: workload simulation.
- src/hr_review_agent.js: LLM review engine + fallback logic.
- policy.txt: promotion policy rules.
- Q1.JSON–Q4.json: quarterly sample datasets.
