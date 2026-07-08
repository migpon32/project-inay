#!/usr/bin/env python3
"""Calculate child weight and height trends from Laravel-provided JSON."""

from __future__ import annotations

import json
import sys
from typing import Any


def calculate(payload: dict[str, Any]) -> dict[str, Any]:
    raw_records = payload.get("growth_records") or []
    records: list[dict[str, Any]] = []

    for sequence, raw_record in enumerate(raw_records):
        if not isinstance(raw_record, dict):
            continue

        try:
            age_months = int(raw_record["age_months"])
            weight_kg = float(raw_record["weight_kg"])
            height_cm = float(raw_record["height_cm"])
        except (KeyError, TypeError, ValueError):
            continue

        record = dict(raw_record)
        record["age_months"] = age_months
        record["weight_kg"] = weight_kg
        record["height_cm"] = height_cm
        record["_sequence"] = sequence
        records.append(record)

    records.sort(
        key=lambda record: (
            str(record.get("recorded_at") or record.get("date") or ""),
            int(record.get("id") or 0),
            record["_sequence"],
        )
    )

    latest_by_age: dict[int, dict[str, Any]] = {}

    for record in records:
        latest_by_age[record["age_months"]] = record

    trend = [latest_by_age[age] for age in sorted(latest_by_age)]

    for record in trend:
        record.pop("_sequence", None)

    average_weight_change = None
    average_height_change = None
    latest_weight_change = None
    latest_height_change = None

    if len(trend) >= 2:
        first = trend[0]
        last = trend[-1]
        month_span = last["age_months"] - first["age_months"]

        if month_span > 0:
            average_weight_change = round(
                (last["weight_kg"] - first["weight_kg"]) / month_span,
                2,
            )
            average_height_change = round(
                (last["height_cm"] - first["height_cm"]) / month_span,
                2,
            )

        latest_weight_change = round(last["weight_kg"] - trend[-2]["weight_kg"], 2)
        latest_height_change = round(last["height_cm"] - trend[-2]["height_cm"], 2)

    return {
        "growth_trend": trend,
        "analytics": {
            "engine": "python",
            "raw_record_count": len(records),
            "trend_point_count": len(trend),
            "duplicate_age_record_count": len(records) - len(trend),
            "average_weight_change_kg_per_month": average_weight_change,
            "average_height_change_cm_per_month": average_height_change,
            "latest_weight_change_kg": latest_weight_change,
            "latest_height_change_cm": latest_height_change,
        },
    }


def main() -> None:
    json.dump(calculate(json.load(sys.stdin)), sys.stdout, separators=(",", ":"))


if __name__ == "__main__":
    main()
