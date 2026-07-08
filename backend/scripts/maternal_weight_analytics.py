#!/usr/bin/env python3
"""Calculate maternal weight analytics from JSON supplied by Laravel."""

from __future__ import annotations

import json
import sys
from typing import Any


def number(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def calculate(payload: dict[str, Any]) -> dict[str, Any]:
    pre_weight = number(payload.get("pre_pregnancy_weight_kg"))
    target_min = number(payload.get("target_gain_min_kg"), 11.0)
    target_max = number(payload.get("target_gain_max_kg"), 16.0)
    raw_logs = payload.get("weight_logs") or []
    logs: list[dict[str, Any]] = []

    for sequence, raw_log in enumerate(raw_logs):
        if not isinstance(raw_log, dict):
            continue

        try:
            week = int(raw_log["pregnancy_week"])
            weight = float(raw_log["weight_kg"])
        except (KeyError, TypeError, ValueError):
            continue

        log = dict(raw_log)
        log["pregnancy_week"] = week
        log["weight_kg"] = weight
        log["_sequence"] = sequence
        logs.append(log)

    logs.sort(
        key=lambda log: (
            str(log.get("recorded_at") or log.get("date") or ""),
            int(log.get("id") or 0),
            log["_sequence"],
        )
    )

    latest_by_week: dict[int, dict[str, Any]] = {}

    for log in logs:
        latest_by_week[log["pregnancy_week"]] = log

    trend = [latest_by_week[week] for week in sorted(latest_by_week)]

    for log in trend:
        log.pop("_sequence", None)

    current_weight = logs[-1]["weight_kg"] if logs else None
    total_gain = round(current_weight - pre_weight, 1) if current_weight is not None else None
    average_weekly_change = None
    latest_change = None

    if len(trend) >= 2:
        first = trend[0]
        last = trend[-1]
        week_span = last["pregnancy_week"] - first["pregnancy_week"]

        if week_span > 0:
            average_weekly_change = round(
                (last["weight_kg"] - first["weight_kg"]) / week_span,
                2,
            )

        latest_change = round(last["weight_kg"] - trend[-2]["weight_kg"], 2)

    if total_gain is None:
        status = "Not logged"
    elif target_min <= total_gain <= target_max:
        status = "Optimal"
    else:
        status = "Needs review"

    return {
        "weight_trend": trend,
        "weight_summary": {
            "pre_pregnancy_weight_kg": pre_weight,
            "current_weight_kg": current_weight,
            "total_gain_kg": total_gain,
            "target_gain_min_kg": target_min,
            "target_gain_max_kg": target_max,
            "status": status,
        },
        "analytics": {
            "engine": "python",
            "raw_log_count": len(logs),
            "trend_point_count": len(trend),
            "duplicate_week_log_count": len(logs) - len(trend),
            "average_weekly_change_kg": average_weekly_change,
            "latest_change_kg": latest_change,
        },
    }


def main() -> None:
    payload = json.load(sys.stdin)
    json.dump(calculate(payload), sys.stdout, separators=(",", ":"))


if __name__ == "__main__":
    main()
