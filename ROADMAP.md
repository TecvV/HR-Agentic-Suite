# Agentic AI Development Roadmap

## Phase 1 - Dummy Dataset (Complete)
- Created `data/employees.csv` with 30 entries.
- Fields: employee name, role, KPI score, peer feedback, manager notes.

## Phase 2 - Evaluation Rubric Tool (Complete)
- Implemented KPI parser and scoring rubric in `src/hr_review_agent.js`:
  - KPI >= 110 -> Exceeds Expectations
  - KPI 90-109 -> Meets Expectations
  - KPI < 90 -> Needs Improvement

## Phase 3 - Review Drafting Agent (Complete)
- Structured sections generated for each employee:
  - Achievement Summary
  - Strengths
  - Development Areas
  - Overall Rating

## Phase 4 - Bias Detection Tool (Complete)
- Keyword-based detector implemented for biased/non-performance terms.
- Flags are attached to each draft review.

## Phase 5 - Rewrite Agent (Complete)
- Rewrites drafted content into neutral, KPI-aligned, outcome-focused language.
- Includes a short bias handling note when flags are present.

## Phase 6 - Promotion Recommendation Agent (Complete)
- Produces one of:
  - Promotion Ready
  - Needs 6-month development
  - Not recommended
- Adds an explicit justification paragraph.

## Current Flow
1. Load employee records
2. Score KPI
3. Draft review
4. Detect bias
5. Rewrite objectively
6. Generate promotion recommendation
7. Output text or JSON

## Next Extensions
- Replace keyword bias checker with LLM evaluator + confidence score.
- Add manager calibration analytics by team/department.
- Add web UI for HRBP usage and approval workflow.
- Persist review history for quarter-over-quarter tracking.
- Add unit tests and benchmark scenarios.
