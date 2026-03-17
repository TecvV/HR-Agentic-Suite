"""AI Performance Review Writer + Bias Checker Agent

A local, testable agentic pipeline that:
1) Scores KPI performance
2) Drafts structured performance reviews
3) Detects biased language
4) Rewrites reviews into neutral, KPI-aligned language
5) Generates promotion recommendations
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Tuple


BIAS_KEYWORDS = {
    "aggressive": "Use behavior-specific language tied to outcomes.",
    "emotional": "Describe observable work behavior, not personality traits.",
    "bossy": "Use neutral collaboration and leadership wording.",
    "supportive": "Ensure this term is tied to concrete business impact.",
    "young": "Avoid age-based descriptors in performance evaluations.",
    "mature": "Avoid age-coded terms; use role-relevant evidence.",
}


@dataclass
class EmployeeRecord:
    employee_name: str
    role: str
    kpi_score_raw: str
    peer_feedback: str
    manager_notes: str


@dataclass
class ReviewOutput:
    employee_name: str
    role: str
    kpi_percent: float
    overall_rating: str
    achievement_summary: str
    strengths: str
    development_areas: str
    drafted_review: str
    bias_flags: List[str]
    rewritten_review: str
    promotion_recommendation: str
    promotion_justification: str


def parse_kpi_percent(raw: str) -> float:
    match = re.search(r"(\d+(?:\.\d+)?)\s*%", raw)
    if not match:
        raise ValueError(f"Could not parse KPI percent from: {raw}")
    return float(match.group(1))


def evaluate_kpi(kpi_percent: float) -> str:
    if kpi_percent >= 110:
        return "Exceeds Expectations"
    if kpi_percent >= 90:
        return "Meets Expectations"
    return "Needs Improvement"


def draft_review(record: EmployeeRecord, kpi_percent: float, rating: str) -> Dict[str, str]:
    achievement_summary = (
        f"{record.employee_name} delivered {kpi_percent:.0f}% of KPI target in the current review cycle, "
        f"which is rated as {rating}."
    )
    strengths = f"Peer feedback highlights: {record.peer_feedback}."
    development_areas = f"Manager observation: {record.manager_notes}."

    drafted = (
        f"Achievement Summary: {achievement_summary}\n"
        f"Strengths: {strengths}\n"
        f"Development Areas: {development_areas}\n"
        f"Overall Rating: {rating}"
    )

    return {
        "achievement_summary": achievement_summary,
        "strengths": strengths,
        "development_areas": development_areas,
        "drafted_review": drafted,
    }


def detect_bias(text: str) -> List[str]:
    lowered = text.lower()
    flags = [term for term in BIAS_KEYWORDS if re.search(rf"\b{re.escape(term)}\b", lowered)]
    return flags


def rewrite_review(record: EmployeeRecord, kpi_percent: float, rating: str, draft_parts: Dict[str, str], flags: List[str]) -> str:
    bias_note = ""
    if flags:
        guidance = "; ".join(BIAS_KEYWORDS[f] for f in flags)
        bias_note = f"Bias handling applied: {guidance}. "

    rewritten = (
        f"Achievement Summary: {record.employee_name} achieved {kpi_percent:.0f}% against KPI targets, "
        f"resulting in a {rating} assessment based on measurable performance.\n"
        f"Strengths: {record.peer_feedback}.\n"
        f"Development Areas: {record.manager_notes}.\n"
        f"Overall Rating: {rating}.\n"
        f"{bias_note}Review language is aligned to outcomes, evidence, and role expectations."
    )
    return rewritten.strip()


def promotion_recommendation(kpi_percent: float, rating: str, manager_notes: str) -> Tuple[str, str]:
    notes_lower = manager_notes.lower()
    severe_gap_markers = ["needs", "improve", "should"]
    has_gaps = any(m in notes_lower for m in severe_gap_markers)

    if rating == "Exceeds Expectations" and not has_gaps:
        decision = "Promotion Ready"
        reason = (
            "Sustained KPI overachievement and strong feedback indicate readiness for expanded scope "
            "with limited risk."
        )
    elif rating in {"Exceeds Expectations", "Meets Expectations"}:
        decision = "Needs 6-month development"
        reason = (
            "Performance is solid, but targeted development in noted areas is recommended before "
            "promotion evaluation."
        )
    else:
        decision = "Not recommended"
        reason = (
            "Current KPI results and development gaps do not yet support promotion."
        )

    return decision, reason


def process_record(record: EmployeeRecord) -> ReviewOutput:
    kpi_percent = parse_kpi_percent(record.kpi_score_raw)
    rating = evaluate_kpi(kpi_percent)

    draft_parts = draft_review(record, kpi_percent, rating)
    flags = detect_bias(draft_parts["drafted_review"])
    rewritten = rewrite_review(record, kpi_percent, rating, draft_parts, flags)
    recommendation, recommendation_reason = promotion_recommendation(
        kpi_percent, rating, record.manager_notes
    )

    return ReviewOutput(
        employee_name=record.employee_name,
        role=record.role,
        kpi_percent=kpi_percent,
        overall_rating=rating,
        achievement_summary=draft_parts["achievement_summary"],
        strengths=draft_parts["strengths"],
        development_areas=draft_parts["development_areas"],
        drafted_review=draft_parts["drafted_review"],
        bias_flags=flags,
        rewritten_review=rewritten,
        promotion_recommendation=recommendation,
        promotion_justification=recommendation_reason,
    )


def load_records(csv_path: Path) -> List[EmployeeRecord]:
    rows: List[EmployeeRecord] = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(
                EmployeeRecord(
                    employee_name=row["Employee Name"],
                    role=row["Role"],
                    kpi_score_raw=row["KPI Score"],
                    peer_feedback=row["Peer Feedback"],
                    manager_notes=row["Manager Notes"],
                )
            )
    return rows


def format_report(review: ReviewOutput) -> str:
    return (
        f"Employee: {review.employee_name} ({review.role})\n"
        f"KPI: {review.kpi_percent:.0f}%\n"
        f"Overall Rating: {review.overall_rating}\n"
        f"Bias Flags: {', '.join(review.bias_flags) if review.bias_flags else 'None'}\n"
        f"Promotion Recommendation: {review.promotion_recommendation}\n"
        f"Justification: {review.promotion_justification}\n\n"
        f"Final Review\n{review.rewritten_review}\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="AI Performance Review Writer + Bias Checker Agent")
    parser.add_argument("--data", default="data/employees.csv", help="Path to employee CSV")
    parser.add_argument("--employee", default=None, help="Filter by exact employee name")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    args = parser.parse_args()

    records = load_records(Path(args.data))
    if args.employee:
        records = [r for r in records if r.employee_name.lower() == args.employee.lower()]

    reviews = [process_record(r) for r in records]

    if args.json:
        print(json.dumps([asdict(r) for r in reviews], indent=2))
        return

    for review in reviews:
        print(format_report(review))
        print("-" * 80)


if __name__ == "__main__":
    main()
