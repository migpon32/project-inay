"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  Bell,
  CalendarDays,
  CheckCircle2,
  Eye,
  HeartPulse,
  History,
  Scale,
  Search,
  Stethoscope,
  TrendingUp,
  X,
} from "lucide-react";
import useCurrentUser from "../hooks/useCurrentUser";
import useApiQuery from "../hooks/useApiQuery";

const riskClasses = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-red-200 bg-red-50 text-red-700",
};

const riskLabels = {
  low: "Low Risk",
  medium: "Moderate Risk",
  high: "High Risk",
};

const emptySubscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

const statusClasses = {
  normal: "border-emerald-200 bg-emerald-50 text-emerald-700",
  within: "border-emerald-200 bg-emerald-50 text-emerald-700",
  elevated: "border-amber-200 bg-amber-50 text-amber-700",
  below: "border-amber-200 bg-amber-50 text-amber-700",
  stage_1: "border-orange-200 bg-orange-50 text-orange-700",
  above: "border-red-200 bg-red-50 text-red-700",
  stage_2: "border-red-200 bg-red-50 text-red-700",
  crisis: "border-red-300 bg-red-50 text-red-800",
  review: "border-amber-200 bg-amber-50 text-amber-700",
  pending: "border-slate-200 bg-slate-50 text-slate-500",
};

const formatDate = (value) => {
  if (!value) return "Not recorded";
  const date = new Date(String(value).includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Not recorded";

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const formatNumber = (value, digits = 1) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "N/A";
  return new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: digits,
    minimumFractionDigits: Number.isInteger(number) ? 0 : digits,
  }).format(number);
};

const metricValue = (value, unit = "", digits = 1) => {
  const formatted = formatNumber(value, digits);
  return formatted === "N/A" ? formatted : `${formatted}${unit ? ` ${unit}` : ""}`;
};

const bloodPressureStatus = (systolic, diastolic) => {
  const sys = Number(systolic);
  const dia = Number(diastolic);

  if (!Number.isFinite(sys) || !Number.isFinite(dia)) {
    return { key: "pending", label: "Pending", className: statusClasses.pending };
  }

  if (sys >= 180 || dia >= 120) {
    return { key: "crisis", label: "Hypertensive Crisis", className: statusClasses.crisis };
  }

  if (sys >= 160 || dia >= 100) {
    return { key: "stage_2", label: "High Blood Pressure (Stage 2)", className: statusClasses.stage_2 };
  }

  if (sys >= 140 || dia >= 90) {
    return { key: "stage_1", label: "High Blood Pressure (Stage 1)", className: statusClasses.stage_1 };
  }

  if (sys >= 130 || dia >= 85) {
    return { key: "elevated", label: "Elevated", className: statusClasses.elevated };
  }

  return { key: "normal", label: "Normal", className: statusClasses.normal };
};

const weightStatus = (summary) => {
  const gain = Number(summary?.total_gain_kg);
  const targetMin = Number(summary?.target_gain_min_kg ?? 11);
  const targetMax = Number(summary?.target_gain_max_kg ?? 16);

  if (!Number.isFinite(gain)) {
    return {
      key: "pending",
      label: "Pending",
      className: statusClasses.pending,
      bar: "bg-slate-400",
    };
  }

  if (gain < targetMin) {
    return {
      key: "below",
      label: "Below recommended range",
      className: statusClasses.below,
      bar: "bg-amber-500",
    };
  }

  if (gain > targetMax) {
    return {
      key: "above",
      label: "Above recommended range",
      className: statusClasses.above,
      bar: "bg-red-600",
    };
  }

  return {
    key: "within",
    label: "Within recommended range",
    className: statusClasses.within,
    bar: "bg-emerald-600",
  };
};

const compactWeightStatusLabel = (status) => ({
  within: "Within Range",
  below: "Below Range",
  above: "Above Range",
  pending: "Pending",
}[status.key] || status.label);

const recordDateValue = (record) => {
  const rawDate = record?.date || record?.recorded_at;
  if (!rawDate) return 0;
  const date = new Date(String(rawDate).includes("T") ? rawDate : `${rawDate}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const getVitalStatus = (key, latest, weightSummary) => {
  if (!latest) return { label: "Pending", className: statusClasses.pending };

  if (key === "bp") {
    return bloodPressureStatus(latest.systolic_bp, latest.diastolic_bp);
  }

  if (key === "sugar") {
    if (latest.blood_sugar_mgdl >= 140) return { label: "Alert", className: statusClasses.stage_2 };
    if (latest.blood_sugar_mgdl > 120) return { label: "Review", className: statusClasses.review };
    return { label: "Normal", className: statusClasses.normal };
  }

  if (key === "weight") {
    return weightStatus(weightSummary);
  }

  if (key === "hemoglobin") {
    if (latest.hemoglobin_gdl < 11) return { label: "Alert", className: statusClasses.stage_2 };
    if (latest.hemoglobin_gdl < 11.5) return { label: "Review", className: statusClasses.review };
    return { label: "Normal", className: statusClasses.normal };
  }

  return { label: "Normal", className: statusClasses.normal };
};

function MetricTile({ icon: Icon, label, value, detail, tone = "border-slate-200 bg-white text-slate-800" }) {
  return (
    <article className={`min-w-0 rounded-lg border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] opacity-70">{label}</p>
          <p className="mt-2 break-words text-xl font-extrabold leading-tight sm:text-2xl">{value}</p>
          {detail && <p className="mt-1 break-words text-xs font-semibold leading-5 opacity-80">{detail}</p>}
        </div>
        <Icon className="h-5 w-5 shrink-0 opacity-80" />
      </div>
    </article>
  );
}

function VitalCard({ icon: Icon, title, value, unit, range, tone, status }) {
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${tone}`}>
            <Icon className="h-5 w-5" />
          </div>
          <p className="min-w-0 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">{title}</p>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase ${status.className}`}>
          {status.label}
        </span>
      </div>
      <p className="mt-4 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-2xl font-extrabold leading-tight text-slate-950 sm:text-3xl">
        <span className="whitespace-nowrap">{value ?? "N/A"}</span>
        {unit && <span className="text-sm font-bold text-slate-500">{unit}</span>}
      </p>
      <div className="mt-5 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
          <span className="font-bold">Healthy Range</span>
          <span className="font-extrabold text-slate-700">{range}</span>
        </div>
      </div>
    </article>
  );
}

function SectionHeading({ eyebrow, title, detail, action }) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-pink-600">{eyebrow}</p>
        <h2 className="mt-1 break-words text-xl font-extrabold text-slate-950">{title}</h2>
        {detail && <p className="mt-1 text-sm font-semibold text-slate-500">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

function TrendChart({ title, data = [], series, emptyLabel, ySuffix = "", minPadding = 1 }) {
  const chartData = data || [];
  const width = 640;
  const height = 260;
  const pad = { top: 26, right: 24, bottom: 42, left: 46 };
  const values = chartData.flatMap((point) => series
    .map((item) => Number(point[item.key]))
    .filter((value) => Number.isFinite(value)));
  const hasData = values.length > 0;
  const minimum = hasData ? Math.min(...values) : 0;
  const maximum = hasData ? Math.max(...values) : 1;
  const valuePadding = Math.max(minPadding, (maximum - minimum) * 0.18);
  const yMin = Math.max(0, Math.floor(minimum - valuePadding));
  const yMax = Math.max(yMin + 1, Math.ceil(maximum + valuePadding));
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const x = (index) => chartData.length === 1
    ? pad.left + plotWidth / 2
    : pad.left + (plotWidth * index) / (chartData.length - 1);
  const y = (value) => pad.top + (1 - ((value - yMin) / Math.max(1, yMax - yMin))) * plotHeight;
  const yTicks = [...new Set([0, 0.33, 0.66, 1].map((ratio) => Math.round(yMin + (yMax - yMin) * ratio)))];
  const xStep = Math.max(1, Math.ceil(chartData.length / 5));

  const pointFor = (point, key, index) => {
    const rawValue = Number(point[key]);
    if (!Number.isFinite(rawValue)) return null;

    return { x: x(index), y: y(rawValue), value: rawValue };
  };

  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Trend Chart</p>
          <h3 className="mt-1 text-lg font-extrabold text-slate-950">{title}</h3>
        </div>
        <TrendingUp className="h-5 w-5 text-pink-600" />
      </div>

      {hasData ? (
        <div className="inay-chart-frame mt-5 rounded-lg border border-slate-100 bg-slate-50">
          <svg viewBox={`0 0 ${width} ${height}`} className="block h-56 w-full sm:h-64" role="img" aria-label={title}>
            <rect x={pad.left} y={pad.top} width={plotWidth} height={plotHeight} rx="6" fill="#f8fafc" />
            {yTicks.map((tick) => (
              <g key={`y-${tick}`}>
                <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeDasharray="4 7" />
                <text x={pad.left - 10} y={y(tick) + 4} textAnchor="end" fontSize="10" fontWeight="700" fill="#94a3b8">
                  {tick}{ySuffix}
                </text>
              </g>
            ))}
            <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} stroke="#cbd5e1" />
            <line x1={pad.left} x2={pad.left} y1={pad.top} y2={height - pad.bottom} stroke="#cbd5e1" />
            {chartData.map((point, index) => {
              if (index % xStep !== 0 && index !== chartData.length - 1) return null;

              return (
                <text key={`x-${point.id || index}`} x={x(index)} y={height - 16} textAnchor="middle" fontSize="10" fontWeight="700" fill="#64748b">
                  {point.pregnancy_week ? `Wk ${point.pregnancy_week}` : formatDate(point.date || point.recorded_at)}
                </text>
              );
            })}
            {series.map((item) => {
              const points = chartData
                .map((point, index) => pointFor(point, item.key, index))
                .filter(Boolean)
                .map((point) => `${point.x},${point.y}`)
                .join(" ");

              return (
                <polyline
                  key={item.key}
                  fill="none"
                  points={points}
                  stroke={item.color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="4"
                />
              );
            })}
            {chartData.map((point, index) => series.map((item) => {
              const coords = pointFor(point, item.key, index);
              if (!coords) return null;

              return (
                <g key={`${item.key}-${point.id || index}`} tabIndex={0}>
                  <title>{`${item.label}: ${coords.value}${ySuffix} on ${formatDate(point.date || point.recorded_at)}`}</title>
                  <circle cx={coords.x} cy={coords.y} r="8" fill="transparent" />
                  <circle cx={coords.x} cy={coords.y} r="4.5" fill={item.color} />
                </g>
              );
            }))}
          </svg>
        </div>
      ) : (
        <div className="mt-5 flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm font-bold text-slate-500">
          {emptyLabel}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-3">
        {series.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </article>
  );
}

function ProgressIndicator({ gain, targetMin, targetMax, status }) {
  const safeGain = Math.max(0, Number(gain) || 0);
  const max = Math.max(Number(targetMax) || 16, safeGain, 1);
  const targetMinPosition = Math.min(100, ((Number(targetMin) || 0) / max) * 100);
  const targetMaxPosition = Math.min(100, ((Number(targetMax) || max) / max) * 100);
  const progress = Math.min(100, (safeGain / max) * 100);

  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 text-xs font-extrabold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>Total gain progress</span>
        <span className={`w-fit rounded-md border px-2 py-1 text-[10px] uppercase ${status.className}`}>{status.label}</span>
      </div>
      <div className="relative mt-4 h-3 rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${status.bar} transition-all duration-500`} style={{ width: `${progress}%` }} />
        <span className="absolute -top-1 h-5 w-0.5 rounded-full bg-emerald-500" style={{ left: `${targetMinPosition}%` }} />
        <span className="absolute -top-1 h-5 w-0.5 rounded-full bg-emerald-500" style={{ left: `${targetMaxPosition}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] font-bold text-slate-500 sm:text-[11px]">
        <span>0 kg</span>
        <span className="text-center">{metricValue(targetMin, "kg")} target min</span>
        <span className="text-right">{metricValue(targetMax, "kg")} target max</span>
      </div>
    </div>
  );
}

function WeightHistoryTable({
  logs,
  preWeight,
  targetMin,
  targetMax,
  compact = false,
  emptyLabel = "No weight records are available yet.",
}) {
  return (
    <article className={compact ? "min-w-0" : "min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5"}>
      {!compact && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-900">Weight History</h3>
          <span className="shrink-0 rounded-md bg-pink-50 px-2 py-1 text-[10px] font-extrabold uppercase text-pink-600">
            {logs.length} record{logs.length === 1 ? "" : "s"}
          </span>
        </div>
      )}
      {logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">
          {emptyLabel}
        </div>
      ) : (
        <div className={`${compact ? "max-h-[calc(80vh-18rem)]" : "max-h-[30rem]"} inay-scroll-x overflow-y-auto rounded-lg border border-slate-100`}>
          <table className="min-w-[640px] w-full text-left text-xs sm:min-w-[720px]">
            <thead className="sticky top-0 z-10 bg-slate-50 font-extrabold uppercase text-slate-400">
              <tr>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Pregnancy Week</th>
                <th className="px-3 py-3">Weight</th>
                <th className="px-3 py-3">Total Gain</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => {
                const gain = Number(log.weight_kg) - Number(preWeight || 0);
                const status = weightStatus({
                  total_gain_kg: gain,
                  target_gain_min_kg: targetMin,
                  target_gain_max_kg: targetMax,
                });

                return (
                  <tr key={log.id} className="transition hover:bg-slate-50">
                    <td className="px-3 py-3 font-bold text-slate-700">{formatDate(log.date || log.recorded_at)}</td>
                    <td className="px-3 py-3 font-bold text-slate-700">Week {log.pregnancy_week || "N/A"}</td>
                    <td className="px-3 py-3 font-extrabold text-slate-950">{metricValue(log.weight_kg, "kg")}</td>
                    <td className="px-3 py-3 font-extrabold text-pink-600">{Number.isFinite(gain) ? `${gain >= 0 ? "+" : ""}${formatNumber(gain)} kg` : "N/A"}</td>
                    <td className="px-3 py-3">
                      <span title={status.label} className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase ${status.className}`}>
                        {compactWeightStatusLabel(status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function BloodPressureHistoryTable({
  logs,
  compact = false,
  emptyLabel = "No blood pressure records are available yet.",
}) {
  return (
    <article className={compact ? "min-w-0" : "min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5"}>
      {!compact && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-900">Blood Pressure History</h3>
          <span className="shrink-0 rounded-md bg-blue-50 px-2 py-1 text-[10px] font-extrabold uppercase text-blue-700">
            {logs.length} record{logs.length === 1 ? "" : "s"}
          </span>
        </div>
      )}
      {logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">
          {emptyLabel}
        </div>
      ) : (
        <div className={`${compact ? "max-h-[calc(80vh-18rem)]" : "max-h-[30rem]"} inay-scroll-x overflow-y-auto rounded-lg border border-slate-100`}>
          <table className="min-w-[660px] w-full text-left text-xs sm:min-w-[760px]">
            <thead className="sticky top-0 z-10 bg-slate-50 font-extrabold uppercase text-slate-400">
              <tr>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Systolic</th>
                <th className="px-3 py-3">Diastolic</th>
                <th className="px-3 py-3">Blood Pressure Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => {
                const status = log.status_key
                  ? { label: log.status, className: statusClasses[log.status_key] || statusClasses.pending }
                  : bloodPressureStatus(log.systolic, log.diastolic);

                return (
                  <tr key={log.id} className="transition hover:bg-slate-50">
                    <td className="px-3 py-3 font-bold text-slate-700">{formatDate(log.date || log.recorded_at)}</td>
                    <td className="px-3 py-3 font-extrabold text-red-600">{log.systolic ?? "N/A"} mmHg</td>
                    <td className="px-3 py-3 font-extrabold text-blue-600">{log.diastolic ?? "N/A"} mmHg</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function HistoryButton({ label, count, onClick, tone = "text-pink-600 hover:border-pink-200 hover:bg-pink-50" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-extrabold shadow-sm transition hover:shadow-md focus:outline-none focus:ring-4 focus:ring-pink-100 ${tone}`}
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        <History className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-extrabold uppercase text-slate-500">
        {count} record{count === 1 ? "" : "s"}
      </span>
    </button>
  );
}

function HistoryModal({
  type,
  title,
  description,
  logs,
  preWeight,
  targetMin,
  targetMax,
  onClose,
}) {
  const [query, setQuery] = useState("");
  const [sortDirection, setSortDirection] = useState("desc");
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef(null);

  const requestClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(onClose, 150);
  }, [isClosing, onClose]);

  useEffect(() => () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        requestClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [requestClose]);

  const filteredLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = (log) => {
      if (!normalizedQuery) return true;

      if (type === "weight") {
        const gain = Number(log.weight_kg) - Number(preWeight || 0);
        const status = weightStatus({
          total_gain_kg: gain,
          target_gain_min_kg: targetMin,
          target_gain_max_kg: targetMax,
        });
        const values = [
          formatDate(log.date || log.recorded_at),
          log.date,
          log.recorded_at,
          log.pregnancy_week ? `Week ${log.pregnancy_week}` : "",
          log.weight_kg,
          Number.isFinite(gain) ? `${gain >= 0 ? "+" : ""}${formatNumber(gain)} kg` : "",
          status.label,
          compactWeightStatusLabel(status),
        ];

        return values.some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
      }

      const status = log.status_key
        ? { label: log.status, className: statusClasses[log.status_key] || statusClasses.pending }
        : bloodPressureStatus(log.systolic, log.diastolic);
      const values = [
        formatDate(log.date || log.recorded_at),
        log.date,
        log.recorded_at,
        log.blood_pressure,
        log.systolic,
        log.diastolic,
        status.label,
      ];

      return values.some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
    };

    return (logs || [])
      .filter(matchesQuery)
      .slice()
      .sort((left, right) => {
        const direction = sortDirection === "desc" ? -1 : 1;
        return (recordDateValue(left) - recordDateValue(right)) * direction;
      });
  }, [logs, preWeight, query, sortDirection, targetMax, targetMin, type]);

  const emptyLabel = query.trim()
    ? "No records match your search."
    : type === "weight"
      ? "No weight records are available yet."
      : "No blood pressure records are available yet.";

  return (
    <div
      className={`fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-3 py-5 backdrop-blur-sm sm:px-6 ${isClosing ? "inay-modal-overlay-out" : "inay-modal-overlay-in"}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      role="presentation"
    >
      <section
        className={`flex h-[80vh] w-full max-w-[900px] flex-col rounded-2xl bg-white shadow-2xl ${isClosing ? "inay-modal-panel-out" : "inay-modal-panel-in"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${type}-history-title`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-pink-600">Monitoring History</p>
            <h2 id={`${type}-history-title`} className="mt-1 text-lg font-extrabold text-slate-950 sm:text-xl">{title}</h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-pink-100"
            aria-label={`Close ${title}`}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <label className="relative block min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search date, values, or status..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
              />
            </label>
            <button
              type="button"
              onClick={() => setSortDirection((current) => (current === "desc" ? "asc" : "desc"))}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-extrabold uppercase text-slate-600 transition hover:border-pink-200 hover:text-pink-600 focus:outline-none focus:ring-4 focus:ring-pink-100"
            >
              <ArrowUpDown className="h-4 w-4" />
              {sortDirection === "desc" ? "Newest First" : "Oldest First"}
            </button>
          </div>
          <p className="mt-2 text-[11px] font-bold text-slate-400">
            Showing {filteredLogs.length} of {logs.length} record{logs.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-5">
          {type === "weight" ? (
            <WeightHistoryTable
              logs={filteredLogs}
              preWeight={preWeight}
              targetMin={targetMin}
              targetMax={targetMax}
              compact
              emptyLabel={emptyLabel}
            />
          ) : (
            <BloodPressureHistoryTable logs={filteredLogs} compact emptyLabel={emptyLabel} />
          )}
        </div>
      </section>
    </div>
  );
}

function WeightProgressTracker({ weightLogs, weightTrend, weightSummary, weightAnalytics, onViewHistory }) {
  const status = weightStatus(weightSummary);
  const preWeight = Number(weightSummary?.pre_pregnancy_weight_kg ?? 0);
  const targetMin = Number(weightSummary?.target_gain_min_kg ?? 11);
  const targetMax = Number(weightSummary?.target_gain_max_kg ?? 16);
  const latestLog = weightLogs.at(-1);
  const previousLog = weightLogs.length > 1 ? weightLogs.at(-2) : null;
  const expectedMin = Number.isFinite(preWeight) ? preWeight + targetMin : null;
  const expectedMax = Number.isFinite(preWeight) ? preWeight + targetMax : null;
  const expectedRange = expectedMin === null || expectedMax === null
    ? "N/A"
    : `${formatNumber(expectedMin)}-${formatNumber(expectedMax)} kg`;

  return (
    <section className="h-full min-w-0 space-y-4">
      <SectionHeading
        eyebrow="Weight Progress"
        title="Maternal Weight Progress Tracker"
        detail="Synced from Program Staff monitoring records."
        action={(
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold uppercase text-slate-500">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            View Only
          </span>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        <MetricTile icon={Scale} label="Current Weight" value={metricValue(weightSummary?.current_weight_kg ?? latestLog?.weight_kg, "kg")} detail="Latest recorded weight" tone="border-pink-100 bg-pink-50 text-pink-700" />
        <MetricTile icon={Activity} label="Previous Weight" value={metricValue(previousLog?.weight_kg, "kg")} detail={previousLog ? `Recorded ${formatDate(previousLog.date || previousLog.recorded_at)}` : "Awaiting another record"} tone="border-slate-200 bg-white text-slate-800" />
        <MetricTile icon={TrendingUp} label="Total Gained" value={metricValue(weightSummary?.total_gain_kg, "kg")} detail={`${metricValue(targetMin, "kg")} to ${metricValue(targetMax, "kg")} expected gain`} tone="border-emerald-100 bg-emerald-50 text-emerald-700" />
        <MetricTile icon={CheckCircle2} label="Expected Range" value={expectedRange} detail="Current healthy weight window" tone="border-blue-100 bg-blue-50 text-blue-700" />
        <MetricTile icon={CalendarDays} label="Latest Date" value={formatDate(latestLog?.date || latestLog?.recorded_at)} detail={weightAnalytics?.average_weekly_change_kg == null ? "More data needed" : `${weightAnalytics.average_weekly_change_kg >= 0 ? "+" : ""}${weightAnalytics.average_weekly_change_kg} kg/week`} tone="border-slate-200 bg-white text-slate-800" />
      </div>

      <ProgressIndicator gain={weightSummary?.total_gain_kg} targetMin={targetMin} targetMax={targetMax} status={status} />

      <TrendChart
        title="Weight Progression"
        data={weightTrend}
        emptyLabel="No weight records are available yet."
        ySuffix=" kg"
        minPadding={2}
        series={[{ key: "weight_kg", label: "Weight (kg)", color: "#db2777" }]}
      />

      <HistoryButton
        label="View Weight History"
        count={weightLogs.length}
        onClick={onViewHistory}
        tone="text-pink-600 hover:border-pink-200 hover:bg-pink-50"
      />
    </section>
  );
}

function BloodPressureTrend({ logs, trend, latest, onViewHistory }) {
  const latestLog = logs.at(-1);
  const latestStatus = latestLog?.status_key
    ? { label: latestLog.status, className: statusClasses[latestLog.status_key] || statusClasses.pending }
    : bloodPressureStatus(latest?.systolic_bp, latest?.diastolic_bp);
  const latestReading = latestLog?.blood_pressure || latest?.blood_pressure || "N/A";

  return (
    <section className="h-full min-w-0 space-y-4">
      <SectionHeading
        eyebrow="Blood Pressure Trend"
        title="Blood Pressure Trend"
        detail="Systolic and diastolic readings update from recorded maternal vitals."
      />

      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        <MetricTile icon={HeartPulse} label="Latest Reading" value={latestReading === "N/A" ? latestReading : `${latestReading} mmHg`} detail={formatDate(latestLog?.date || latestLog?.recorded_at || latest?.recorded_at)} tone="border-red-100 bg-red-50 text-red-700" />
        <MetricTile icon={Activity} label="Systolic" value={latestLog?.systolic ? `${latestLog.systolic} mmHg` : metricValue(latest?.systolic_bp, "mmHg", 0)} detail="Upper pressure reading" tone="border-slate-200 bg-white text-slate-800" />
        <article className={`rounded-lg border p-4 shadow-sm ${latestStatus.className}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] opacity-70">Current Status</p>
              <p className="mt-2 text-xl font-extrabold">{latestStatus.label}</p>
              <p className="mt-1 text-xs font-semibold opacity-80">Diastolic {latestLog?.diastolic ?? latest?.diastolic_bp ?? "N/A"} mmHg</p>
            </div>
            {latestStatus.label === "Hypertensive Crisis" ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
          </div>
        </article>
      </div>

      <TrendChart
        title="Blood Pressure Trends"
        data={trend}
        emptyLabel="No blood pressure records are available yet."
        ySuffix=""
        minPadding={8}
        series={[
          { key: "systolic", label: "Systolic", color: "#dc2626" },
          { key: "diastolic", label: "Diastolic", color: "#2563eb" },
        ]}
      />

      <HistoryButton
        label="View Blood Pressure History"
        count={logs.length}
        onClick={onViewHistory}
        tone="text-blue-600 hover:border-blue-200 hover:bg-blue-50"
      />
    </section>
  );
}

export default function MaternalMonitoringDashboard() {
  const { userName } = useCurrentUser();
  const [notice, setNotice] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const hasMounted = useSyncExternalStore(emptySubscribe, clientSnapshot, serverSnapshot);
  const { data, error, isLoading, isValidating } = useApiQuery("/maternal-monitoring/me", {
    refreshInterval: 10000,
    dedupingInterval: 5000,
  });

  const latest = data?.summary?.latest;
  const profile = data?.profile;
  const weightSummary = data?.summary?.weight_summary;
  const weightAnalytics = data?.summary?.weight_analytics;
  const weightLogs = useMemo(() => data?.summary?.weight_logs || [], [data?.summary?.weight_logs]);
  const weightTrend = useMemo(() => data?.summary?.weight_logs || [], [data?.summary?.weight_logs]);
  const bloodPressureLogs = useMemo(() => data?.summary?.blood_pressure_logs || [], [data?.summary?.blood_pressure_logs]);
  const bloodPressureTrend = useMemo(() => data?.summary?.blood_pressure_trend || [], [data?.summary?.blood_pressure_trend]);
  const preWeight = Number(weightSummary?.pre_pregnancy_weight_kg ?? 0);
  const targetMin = Number(weightSummary?.target_gain_min_kg ?? 11);
  const targetMax = Number(weightSummary?.target_gain_max_kg ?? 16);
  if (!hasMounted || (isLoading && !data)) {
    return <MaternalMonitoringSkeleton />;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7f9fc] px-4 py-5 text-slate-950 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1500px] space-y-6">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-300 pb-5 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-xl font-extrabold text-slate-950 sm:text-2xl">Maternal Vitals Overview</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Review weight and blood pressure records updated by Program Staff.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-500">
            <span className="rounded-full border border-pink-100 bg-white px-4 py-2 text-pink-600">
              Week {latest?.pregnancy_week || profile?.pregnancy_week || "N/A"} - Month {Math.ceil((latest?.pregnancy_week || profile?.pregnancy_week || 1) / 4)}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2">
              <Bell className="h-4 w-4 text-pink-500" />
              Synced monitoring
            </span>
          </div>
        </header>

        {(notice || error) && (
          <div className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-bold ${notice?.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
            <span>{notice?.text || "Unable to refresh maternal monitoring records. Showing the latest available data."}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
          </div>
        )}

        {isValidating && data && (
          <p className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-extrabold uppercase text-slate-400">
            Updating in background
          </p>
        )}

        <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col justify-between gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-extrabold">Maternal Vital Signs</h2>
              <p className="text-xs font-semibold text-slate-500">{profile?.name || userName}&apos;s pregnancy threshold indicators</p>
            </div>
            <span className={`inline-flex w-fit rounded-md border px-3 py-1 text-[10px] font-extrabold uppercase ${riskClasses[profile?.risk_level || "low"]}`}>
              {riskLabels[profile?.risk_level || "low"]}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <VitalCard icon={Activity} title="Blood Pressure" value={latest?.blood_pressure} unit="mmHg" range="< 130/85 mmHg" tone="border-pink-100 bg-pink-50 text-pink-600" status={getVitalStatus("bp", latest, weightSummary)} />
            <VitalCard icon={HeartPulse} title="Blood Sugar" value={latest?.blood_sugar_mgdl} unit="mg/dL" range="70 - 140 mg/dL" tone="border-pink-100 bg-white text-pink-600" status={getVitalStatus("sugar", latest, weightSummary)} />
            <VitalCard icon={Scale} title="Weight" value={latest?.weight_kg} unit="kg" range={`Target gain: ${metricValue(weightSummary?.target_gain_min_kg, "kg")} to ${metricValue(weightSummary?.target_gain_max_kg, "kg")}`} tone="border-emerald-100 bg-emerald-50 text-emerald-600" status={getVitalStatus("weight", latest, weightSummary)} />
            <VitalCard icon={Eye} title="Hemoglobin" value={latest?.hemoglobin_gdl} unit="g/dL" range="11.5 g/dL and above" tone="border-blue-100 bg-blue-50 text-blue-600" status={getVitalStatus("hemoglobin", latest, weightSummary)} />
          </div>

          <div className={`mt-4 rounded-lg border px-4 py-3 text-sm font-bold ${riskClasses[profile?.risk_level || "low"]}`}>
            <Stethoscope className="mr-2 inline h-4 w-4" />
            {data?.summary?.recommendations?.[0]}
          </div>
        </section>

        <section className="grid min-w-0 items-stretch gap-6 xl:grid-cols-2" aria-label="Maternal monitoring trends">
          <WeightProgressTracker
            weightLogs={weightLogs}
            weightTrend={weightTrend}
            weightSummary={weightSummary}
            weightAnalytics={weightAnalytics}
            onViewHistory={() => setHistoryModal("weight")}
          />

          <BloodPressureTrend
            logs={bloodPressureLogs}
            trend={bloodPressureTrend}
            latest={latest}
            onViewHistory={() => setHistoryModal("blood-pressure")}
          />
        </section>

        <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <div className="min-w-0 rounded-lg border border-pink-100 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-lg font-extrabold">Pregnancy Risk Indicator</h2>
            <div className={`mt-4 rounded-lg border p-4 ${riskClasses[profile?.risk_level || "low"]}`}>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em]">Risk Level</p>
              <p className="mt-1 text-3xl font-extrabold">{riskLabels[profile?.risk_level || "low"]}</p>
              <p className="mt-3 text-sm font-semibold">{data?.summary?.recommendations?.join(" ")}</p>
            </div>
          </div>

          <div className="min-w-0 rounded-lg border border-pink-100 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-lg font-extrabold">Range Medical Guidelines</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {data?.summary?.guidelines?.map((guide) => (
                <article key={guide.title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-700">{guide.title}</h3>
                  <p className="mt-3 text-sm text-slate-600"><strong>Optimal:</strong> {guide.optimal}</p>
                  <p className="mt-1 text-sm text-slate-600"><strong>Warning:</strong> {guide.warning}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          High-risk pregnancy protocol activates automatically when Program Staff records warning values.
        </div>
      </div>

      {historyModal === "weight" && (
        <HistoryModal
          type="weight"
          title="Weight History"
          description="Complete maternal weight records entered by Program Staff."
          logs={weightLogs}
          preWeight={preWeight}
          targetMin={targetMin}
          targetMax={targetMax}
          onClose={() => setHistoryModal(null)}
        />
      )}

      {historyModal === "blood-pressure" && (
        <HistoryModal
          type="blood-pressure"
          title="Blood Pressure History"
          description="Complete systolic and diastolic readings from recorded maternal vitals."
          logs={bloodPressureLogs}
          onClose={() => setHistoryModal(null)}
        />
      )}
    </div>
  );
}

function MaternalMonitoringSkeleton() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7f9fc] px-4 py-6 text-slate-950 sm:px-6 lg:px-8" aria-label="Loading maternal monitoring">
      <div className="mx-auto w-full max-w-[1500px] space-y-6">
        <header className="border-b border-slate-300 pb-5">
          <div className="h-7 w-72 max-w-full animate-pulse rounded bg-slate-100" />
          <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-slate-100" />
        </header>
        <div className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white shadow-sm" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-lg border border-slate-200 bg-white shadow-sm" />
          ))}
        </div>
        <div className="h-[28rem] animate-pulse rounded-lg border border-slate-200 bg-white shadow-sm" />
        <div className="h-[28rem] animate-pulse rounded-lg border border-slate-200 bg-white shadow-sm" />
      </div>
    </div>
  );
}
