"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import {
  AlertTriangle,
  Baby,
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  Phone,
  Plus,
  Ruler,
  Save,
  Scale,
  Search,
  ShieldCheck,
  Syringe,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";
import HealthWorkerShell from "../../components/HealthWorkerShell";
import { getAuthToken } from "../../utils/authSession";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

const emptyChildForm = {
  name: "",
  sex: "unspecified",
  birth_date: "",
  birth_weight_kg: "",
  birth_height_cm: "",
  current_weight_kg: "",
  current_height_cm: "",
};

const emptyProgressForm = {
  age_month: "",
  weight: "",
  height: "",
  notes: "",
};

const riskStyles = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-rose-200 bg-rose-50 text-rose-700",
};

const statusStyles = {
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  upcoming: "border-blue-200 bg-blue-50 text-blue-700",
  overdue: "border-rose-200 bg-rose-50 text-rose-700",
};

const authConfig = () => ({
  headers: { Authorization: `Bearer ${getAuthToken()}` },
});

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`))
  : "Not scheduled";

const todayValue = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date()).map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
};

const numericOrBlank = (value) => (value === null || value === undefined ? "" : value);

const growthAgeOptions = Array.from({ length: 61 }, (_, month) => month);

const statusBadge = (status) => {
  if (!status) return "border-slate-200 bg-slate-50 text-slate-600";
  if (status.severity === "high") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status.severity === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status.status === "normal") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
};

const growthStatusLabel = (status) => status?.label || "No Growth Record";

const motherStatusLabel = (mother) => {
  if (!mother) return "No status";

  if (mother.pregnancy_status === "pregnant") {
    if (mother.pregnancy_week) return `Pregnant (Pregnancy Week ${mother.pregnancy_week})`;
    if (mother.pregnancy_month) return `Pregnant (${mother.pregnancy_month} month${mother.pregnancy_month === 1 ? "" : "s"})`;
    return "Pregnant";
  }

  if (mother.pregnancy_status === "postpartum") {
    return mother.postpartum_week ? `Postpartum Week ${mother.postpartum_week}` : "Postpartum";
  }

  return "Not pregnant";
};

const sexLabel = (value) => {
  if (value === "male") return "Male";
  if (value === "female") return "Female";
  return "Unspecified";
};

const vaccineSummary = (child) => {
  const immunizations = child?.immunizations || [];
  const total = immunizations.length;
  const completed = child?.immunization_summary?.completed
    ?? immunizations.filter((item) => item.status === "completed").length;
  const overdue = child?.immunization_summary?.overdue
    ?? immunizations.filter((item) => item.status === "overdue").length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, overdue, total, percentage };
};

function Notice({ notice, onClose }) {
  if (!notice) return null;

  return (
    <div className={`mb-5 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-bold ${
      notice.type === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-rose-200 bg-rose-50 text-rose-800"
    }`}>
      <span>{notice.text}</span>
      <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-white/70" aria-label="Dismiss notice">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function MotherRosterButton({ mother, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left transition ${
        active
          ? "border-pink-300 bg-pink-50 ring-2 ring-pink-100"
          : "border-slate-200 bg-white hover:border-pink-200 hover:bg-pink-50/40"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-pink-100 bg-pink-50 text-sm font-extrabold text-pink-600">
          {mother.initials || "M"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-slate-950">{mother.name}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {mother.age ? `${mother.age} y/o` : "Age N/A"} - {mother.blood_type || "Blood N/A"}
          </p>
          <p className="mt-1 truncate text-xs font-bold text-pink-600">{motherStatusLabel(mother)}</p>
        </div>
      </div>
    </button>
  );
}

function MotherSponsorCard({ mother }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-pink-100 bg-pink-50 text-lg font-extrabold text-pink-600">
            {mother.initials || "M"}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-pink-600">
                Maternal Case Sponsor
              </p>
              <span className={`rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase ${riskStyles[mother.risk_rating] || riskStyles.low}`}>
                {(mother.risk_rating || "low").replace("_", " ")} risk case
              </span>
            </div>
            <h1 className="mt-1 truncate text-xl font-extrabold text-slate-950">
              {mother.name} <span className="text-sm text-slate-500">(Mother ID: {mother.patient_id})</span>
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {mother.phone ? (
            <a
              href={`tel:${mother.phone}`}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-pink-200 hover:bg-pink-50 hover:text-pink-600"
              aria-label={`Call ${mother.name}`}
            >
              <Phone className="h-4 w-4" />
            </a>
          ) : null}
          <Link
            href={`/health-worker/mothers/${mother.id}`}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-pink-200 px-4 text-xs font-extrabold uppercase text-pink-600 transition hover:bg-pink-50"
          >
            <ClipboardList className="h-4 w-4" />
            Open Maternal Case File
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Sponsor Demographics</p>
          <p className="mt-1 text-sm font-extrabold text-slate-800">
            {mother.age ? `${mother.age} y/o` : "Age not provided"} - Blood Type {mother.blood_type || "N/A"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Delivery / Cohort Status</p>
          <p className="mt-1 text-sm font-extrabold text-slate-800">{motherStatusLabel(mother)}</p>
        </div>
        <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Next Scheduled Visit</p>
          <p className="mt-1 text-sm font-extrabold text-slate-800">{formatDate(mother.next_scheduled_visit)}</p>
        </div>
        <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Hotline Center & Location</p>
          <p className="mt-1 truncate text-sm font-extrabold text-slate-800">
            {mother.address || mother.barangay || "Location not provided"}
          </p>
        </div>
      </div>
    </section>
  );
}

function GrowthChart({ records = [], metric, color, fill, unit, ageMonths }) {
  const field = metric === "weight" ? "weight_kg" : "height_cm";
  const label = metric === "weight" ? "Weight Progress" : "Height Progress";
  const chartRecords = records
    .filter((record) => record[field] !== null && record[field] !== undefined)
    .slice()
    .sort((left, right) => Number(left.age_months) - Number(right.age_months));
  const width = 520;
  const height = 230;
  const pad = { top: 24, right: 20, bottom: 42, left: 42 };
  const values = chartRecords.map((record) => Number(record[field]));
  const ages = chartRecords.map((record) => Number(record.age_months));
  const oldestAge = Math.max(0, ageMonths || 0, ...ages);
  const ageCeilings = [3, 6, 12, 18, 24, 36, 48, 60];
  const xMax = ageCeilings.find((ceiling) => oldestAge <= ceiling) || 60;
  const minimumValue = values.length > 0 ? Math.min(...values) : 0;
  const maximumValue = values.length > 0 ? Math.max(...values) : metric === "weight" ? 10 : 80;
  const valueSpan = Math.max(0, maximumValue - minimumValue);
  const padding = metric === "weight" ? Math.max(1, valueSpan * 0.25) : Math.max(3, valueSpan * 0.25);
  const yMin = Math.max(0, Math.floor(minimumValue - padding));
  const yMax = Math.max(yMin + 1, Math.ceil(maximumValue + padding));
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const x = (age) => pad.left + (age / xMax) * plotWidth;
  const y = (value) => pad.top + (1 - ((value - yMin) / Math.max(1, yMax - yMin))) * plotHeight;
  const points = chartRecords.map((record) => `${x(Number(record.age_months))},${y(Number(record[field]))}`).join(" ");
  const areaPoints = points
    ? `${pad.left},${height - pad.bottom} ${points} ${x(chartRecords.at(-1)?.age_months || 0)},${height - pad.bottom}`
    : "";
  const xTicks = [0, Math.round(xMax / 2), xMax].filter((tick, index, all) => all.indexOf(tick) === index);
  const yTicks = [0, 0.5, 1].map((ratio) => Number((yMin + (yMax - yMin) * ratio).toFixed(metric === "weight" ? 1 : 0)));
  const gradientId = `worker-${metric}-growth-fill`;

  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-extrabold text-slate-950">
          <TrendingUp className="h-4 w-4" style={{ color }} />
          {label}
        </h3>
        <span className="text-[10px] font-extrabold uppercase text-slate-400">Unit: {unit}</span>
      </div>

      <div className="inay-chart-frame h-56">
        {chartRecords.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm font-extrabold text-slate-500">
            No growth points yet
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="block h-full w-full" role="img" aria-label={label}>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={fill} stopOpacity="0.4" />
                <stop offset="100%" stopColor={fill} stopOpacity="0.05" />
              </linearGradient>
            </defs>
            <rect x={pad.left} y={pad.top} width={plotWidth} height={plotHeight} fill="#f8fafc" />
            {yTicks.map((tick) => (
              <g key={`y-${tick}`}>
                <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeDasharray="4 7" />
                <text x={pad.left - 10} y={y(tick) + 4} textAnchor="end" fontSize="10" fontWeight="700" fill="#94a3b8">{tick}</text>
              </g>
            ))}
            {xTicks.map((tick) => (
              <g key={`x-${tick}`}>
                <line x1={x(tick)} x2={x(tick)} y1={pad.top} y2={height - pad.bottom} stroke="#e2e8f0" strokeDasharray="4 7" />
                <text x={x(tick)} y={height - 16} textAnchor="middle" fontSize="10" fontWeight="700" fill="#64748b">{tick}</text>
              </g>
            ))}
            {areaPoints && <polygon points={areaPoints} fill={`url(#${gradientId})`} />}
            {points && <polyline points={points} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />}
            {chartRecords.map((record) => (
              <circle key={`${metric}-${record.id}`} cx={x(Number(record.age_months))} cy={y(Number(record[field]))} r="5" fill="#fff" stroke={color} strokeWidth="3">
                <title>{`${record[field]} ${unit} at ${record.age_months} month${Number(record.age_months) === 1 ? "" : "s"}`}</title>
              </circle>
            ))}
            <text x={width / 2} y={height - 1} textAnchor="middle" fontSize="11" fontWeight="800" fill="#94a3b8">AGE (MONTHS)</text>
          </svg>
        )}
      </div>
    </article>
  );
}

function ChildCard({ child, updatingImmunizationId, onToggleImmunization, onUpdateGrowth }) {
  const summary = vaccineSummary(child);
  const lastSurveillance = child.latest_recorded_at || child.birth_date;
  const hasAlerts = (child.alerts || []).length > 0;
  const growthRecords = child.growth_records || [];
  const chartRecords = child.growth_trend || growthRecords;
  const overallGrowth = child.growth_status?.overall;

  return (
    <article className="min-w-0 border-l-2 border-teal-300 pl-3 sm:pl-4">
      <div className="w-full min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-lg font-extrabold text-amber-600">
              {child.initials || "CH"}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold text-slate-950">{child.name}</h2>
                <span className="rounded-md bg-cyan-50 px-2 py-1 text-[10px] font-extrabold uppercase text-cyan-700">
                  {sexLabel(child.sex)}
                </span>
              </div>
              <p className="mt-1 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-400">
                {child.age_label} - Registered child
              </p>
              <span className={`mt-2 inline-flex w-fit rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase ${statusBadge(overallGrowth)}`}>
                {growthStatusLabel(overallGrowth)}
              </span>
            </div>
          </div>

          <span className={`inline-flex w-fit items-center gap-1 rounded-lg border px-3 py-1 text-[10px] font-extrabold uppercase ${
            hasAlerts ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}>
            {hasAlerts ? <AlertTriangle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {hasAlerts ? `${child.alerts.length} alert${child.alerts.length === 1 ? "" : "s"}` : "Normal"}
          </span>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-slate-900 bg-slate-50 px-3 py-3">
            <p className="text-[10px] font-extrabold uppercase text-slate-400">Child Age</p>
            <p className="mt-1 text-base font-extrabold text-slate-950">
              {child.age_label || "N/A"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-900 bg-slate-50 px-3 py-3">
            <p className="text-[10px] font-extrabold uppercase text-slate-400">Current Weight</p>
            <p className="mt-1 text-base font-extrabold text-slate-950">
              {child.current_weight_kg ?? "N/A"} <span className="text-xs">{child.current_weight_kg ? "kg" : ""}</span>
            </p>
          </div>
          <div className="rounded-lg border border-slate-900 bg-slate-50 px-3 py-3">
            <p className="text-[10px] font-extrabold uppercase text-slate-400">Height Index</p>
            <p className="mt-1 text-base font-extrabold text-slate-950">
              {child.current_height_cm ?? "N/A"} <span className="text-xs">{child.current_height_cm ? "cm" : ""}</span>
            </p>
          </div>
          <div className="rounded-lg border border-slate-900 bg-slate-50 px-3 py-3">
            <p className="text-[10px] font-extrabold uppercase text-slate-400">Last Measurement</p>
            <p className="mt-1 text-base font-extrabold text-slate-950">{formatDate(child.latest_recorded_at)}</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border-2 border-teal-300 bg-teal-50 px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="inline-flex w-fit items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-extrabold text-slate-950 shadow-sm">
              <span className="text-teal-700">Last Surveillance</span>
              <span className="text-slate-950">{formatDate(lastSurveillance)}</span>
            </p>
            <button
              type="button"
              onClick={() => onUpdateGrowth(child)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-xs font-extrabold uppercase text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-200 sm:w-fit"
            >
              <TrendingUp className="h-4 w-4" />
              Update Growth
            </button>
          </div>
        </div>

        {hasAlerts && (
          <div className="mt-4 grid gap-2 lg:grid-cols-2">
            {(child.alerts || []).slice(0, 4).map((alert, index) => (
              <div key={`${alert.title}-${index}`} className={`rounded-lg border px-3 py-2 text-xs font-bold ${alert.severity === "high" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                <p className="font-extrabold">{alert.title}</p>
                <p className="mt-1 leading-5 opacity-90">{alert.message}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-2">
          <GrowthChart
            records={chartRecords}
            metric="weight"
            unit="kg"
            color="#2563eb"
            fill="#93c5fd"
            ageMonths={child.age_months}
          />
          <GrowthChart
            records={chartRecords}
            metric="height"
            unit="cm"
            color="#7c3aed"
            fill="#c4b5fd"
            ageMonths={child.age_months}
          />
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-extrabold text-slate-900">Growth History</p>
            <span className="text-[10px] font-extrabold uppercase text-slate-400">{growthRecords.length} record{growthRecords.length === 1 ? "" : "s"}</span>
          </div>
          {growthRecords.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">
              No worker-entered growth check-ins yet.
            </p>
          ) : (
            <div className="inay-scroll-x">
              <table className="min-w-[620px] w-full text-left text-xs">
                <thead className="bg-slate-50 font-extrabold uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Age</th>
                    <th className="px-3 py-2">Weight</th>
                    <th className="px-3 py-2">Height</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {growthRecords.slice().reverse().map((record) => (
                    <tr key={record.id}>
                      <td className="px-3 py-2 font-extrabold text-slate-900">{record.age_months} mo</td>
                      <td className="px-3 py-2 font-bold text-slate-700">{record.weight_kg} kg</td>
                      <td className="px-3 py-2 font-bold text-slate-700">{record.height_cm} cm</td>
                      <td className="px-3 py-2 font-bold text-slate-500">{formatDate(record.date)}</td>
                      <td className="px-3 py-2 font-bold text-slate-500">{record.recorded_by?.name || "Program staff"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
              <Syringe className="h-4 w-4 text-blue-600" />
              Vaccine Surveillance
            </p>
            <p className="text-xs font-extrabold text-slate-600">
              {summary.completed}/{summary.total} complete - {summary.percentage}%
            </p>
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-teal-600"
              style={{ width: `${summary.percentage}%` }}
            />
          </div>
        </div>

        <div className="mt-3 grid max-h-[390px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 2xl:grid-cols-3">
          {(child.immunizations || []).map((immunization) => {
            const completed = immunization.status === "completed";
            const updating = updatingImmunizationId === immunization.id;

            return (
              <button
                key={immunization.id}
                type="button"
                onClick={() => onToggleImmunization(child, immunization)}
                disabled={updating}
                aria-pressed={completed}
                className={`flex min-h-9 items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs font-extrabold transition ${
                  completed
                    ? "border-slate-900 bg-white text-slate-900"
                    : immunization.status === "overdue"
                      ? "border-rose-300 bg-rose-50 text-rose-700"
                      : "border-slate-300 bg-white text-slate-500 hover:border-blue-300 hover:text-blue-700"
                } disabled:cursor-wait disabled:opacity-70`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  completed ? "border-blue-600 bg-blue-600 text-white" : "border-slate-400 bg-white"
                }`}>
                  {updating ? <LoaderCircle className="h-3 w-3 animate-spin" /> : completed ? <CheckCircle2 className="h-3 w-3" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{immunization.vaccine_name}</span>
                  <span className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[9px] uppercase ${statusStyles[immunization.status] || statusStyles.upcoming}`}>
                    {immunization.dose_label} - {immunization.status}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {summary.overdue > 0 && (
          <p className="mt-3 text-xs font-extrabold text-rose-600">
            {summary.overdue} overdue vaccine{summary.overdue === 1 ? "" : "s"} need follow-up.
          </p>
        )}
      </div>
    </article>
  );
}

function GrowthProgressModal({
  child,
  form,
  error,
  errors,
  duplicateRecord,
  saving,
  onChange,
  onClose,
  onSubmit,
  onUpdateExisting,
}) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-950">
              <TrendingUp className="h-4 w-4 text-violet-600" />
              Update Growth Record
            </h2>
            <p className="mt-1 text-xs font-bold text-slate-500">{child.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed"
            aria-label="Close growth progress modal"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={onSubmit} className="grid gap-4 p-5 sm:grid-cols-2">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 sm:col-span-2">
              {error}
            </div>
          )}

          <label className="text-xs font-extrabold uppercase text-slate-500 sm:col-span-2">
            Select Age (Months)
            <select
              value={form.age_month}
              onChange={(event) => onChange("age_month", event.target.value)}
              className={`mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-violet-500 ${errors.age_month ? "border-rose-300" : "border-slate-300"}`}
            >
              <option value="">Choose age</option>
              {growthAgeOptions.map((month) => (
                <option key={month} value={month}>{month} Month{month === 1 ? "" : "s"}</option>
              ))}
            </select>
            {errors.age_month && <span className="mt-1 block text-[11px] font-bold normal-case text-rose-600">{errors.age_month}</span>}
          </label>

          <label className="text-xs font-extrabold uppercase text-slate-500">
            <span className="flex items-center gap-2">
              <Scale className="h-3.5 w-3.5 text-teal-600" />
              Weight (kg)
            </span>
            <input
              type="number"
              step="0.1"
              min="0"
              value={form.weight}
              onChange={(event) => onChange("weight", event.target.value)}
              placeholder="e.g. 10.5"
              className={`mt-1 h-11 w-full rounded-lg border px-3 text-sm font-bold normal-case text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-500 ${errors.weight ? "border-rose-300" : "border-slate-300"}`}
            />
            {errors.weight && <span className="mt-1 block text-[11px] font-bold normal-case text-rose-600">{errors.weight}</span>}
          </label>

          <label className="text-xs font-extrabold uppercase text-slate-500">
            <span className="flex items-center gap-2">
              <Ruler className="h-3.5 w-3.5 text-teal-600" />
              Height (cm)
            </span>
            <input
              type="number"
              step="0.1"
              min="0"
              value={form.height}
              onChange={(event) => onChange("height", event.target.value)}
              placeholder="e.g. 80"
              className={`mt-1 h-11 w-full rounded-lg border px-3 text-sm font-bold normal-case text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-500 ${errors.height ? "border-rose-300" : "border-slate-300"}`}
            />
            {errors.height && <span className="mt-1 block text-[11px] font-bold normal-case text-rose-600">{errors.height}</span>}
          </label>

          <label className="text-xs font-extrabold uppercase text-slate-500 sm:col-span-2">
            Notes
            <textarea
              value={form.notes}
              onChange={(event) => onChange("notes", event.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-slate-300 p-3 text-sm font-semibold normal-case text-slate-900 outline-none focus:border-teal-500"
            />
          </label>

          {duplicateRecord && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 sm:col-span-2">
              Age {duplicateRecord.age_months} months already has {duplicateRecord.weight_kg} kg and {duplicateRecord.height_cm} cm. Updating will replace that age-month record and create an audit trail.
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:col-span-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-11 rounded-lg border border-slate-200 px-5 text-sm font-extrabold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            {duplicateRecord && (
              <button
                type="button"
                onClick={onUpdateExisting}
                disabled={saving}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-500 px-5 text-sm font-extrabold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-300"
              >
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Update Existing
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-violet-600 px-5 text-sm font-extrabold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-300"
            >
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
              Apply Growth Check-in
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AddChildModal({ mother, form, saving, onChange, onClose, onSubmit }) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">Onboard Infant</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">{mother.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed"
            aria-label="Close infant onboarding modal"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={onSubmit} className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="text-xs font-extrabold uppercase text-slate-500 sm:col-span-2">
            Child Name
            <input
              required
              value={form.name}
              onChange={(event) => onChange("name", event.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-pink-500"
            />
          </label>

          <label className="text-xs font-extrabold uppercase text-slate-500">
            Sex
            <select
              value={form.sex}
              onChange={(event) => onChange("sex", event.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-pink-500"
            >
              <option value="unspecified">Unspecified</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </label>

          <label className="text-xs font-extrabold uppercase text-slate-500">
            Birth Date
            <input
              required
              type="date"
              value={form.birth_date}
              onChange={(event) => onChange("birth_date", event.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-pink-500"
            />
          </label>

          {[
            ["birth_weight_kg", "Birth Weight (kg)", Scale],
            ["birth_height_cm", "Birth Height (cm)", Ruler],
            ["current_weight_kg", "Current Weight (kg)", Scale],
            ["current_height_cm", "Current Height (cm)", Ruler],
          ].map(([key, label, Icon]) => (
            <label key={key} className="text-xs font-extrabold uppercase text-slate-500">
              <span className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-pink-600" />
                {label}
              </span>
              <input
                type="number"
                step="0.1"
                value={form[key]}
                onChange={(event) => onChange(key, event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-pink-500"
              />
            </label>
          ))}

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:col-span-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-11 rounded-lg border border-slate-200 px-5 text-sm font-extrabold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-pink-600 px-5 text-sm font-extrabold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300"
            >
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Infant
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function NeonatalVaccinesPage() {
  const [mothers, setMothers] = useState([]);
  const [motherSearch, setMotherSearch] = useState("");
  const [selectedMotherId, setSelectedMotherId] = useState("");
  const [selectedChildId, setSelectedChildId] = useState("");
  const [childData, setChildData] = useState({ children: [], summary: {} });
  const [loadingMothers, setLoadingMothers] = useState(true);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [notice, setNotice] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [savingChild, setSavingChild] = useState(false);
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [progressError, setProgressError] = useState("");
  const [progressErrors, setProgressErrors] = useState({});
  const [duplicateRecord, setDuplicateRecord] = useState(null);
  const [progressChild, setProgressChild] = useState(null);
  const [progressForm, setProgressForm] = useState(emptyProgressForm);
  const [updatingImmunizationId, setUpdatingImmunizationId] = useState(null);
  const [childForm, setChildForm] = useState(emptyChildForm);

  const loadMothers = useCallback(async () => {
    setLoadingMothers(true);

    try {
      const response = await axios.get(`${API_BASE_URL}/health-worker/casefiles`, authConfig());
      const nextMothers = response.data.mothers || [];
      setMothers(nextMothers);
      setSelectedMotherId((current) => {
        if (current && nextMothers.some((mother) => String(mother.id) === String(current))) {
          return current;
        }

        return nextMothers[0]?.id || "";
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.message || "Unable to load assigned mothers.",
      });
    } finally {
      setLoadingMothers(false);
    }
  }, []);

  const loadChildren = useCallback(async (motherId, silent = false, preferredChildId = null) => {
    if (!motherId) {
      setChildData({ children: [], summary: {} });
      setSelectedChildId("");
      return;
    }

    if (!silent) setLoadingChildren(true);

    try {
      const response = await axios.get(`${API_BASE_URL}/health-worker/child-health/${motherId}`, authConfig());
      setChildData(response.data);
      const nextChildren = response.data.children || [];
      setSelectedChildId((current) => {
        const nextSelectedId = preferredChildId || current;

        if (nextSelectedId && nextChildren.some((child) => String(child.id) === String(nextSelectedId))) {
          return nextSelectedId;
        }

        return nextChildren[0]?.id || "";
      });
    } catch (error) {
      setChildData({ children: [], summary: {} });
      setSelectedChildId("");
      setNotice({
        type: "error",
        text: error.response?.data?.message || "Unable to load linked child records.",
      });
    } finally {
      if (!silent) setLoadingChildren(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMothers();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadMothers]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadChildren(selectedMotherId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadChildren, selectedMotherId]);

  const selectedMother = useMemo(
    () => mothers.find((mother) => String(mother.id) === String(selectedMotherId)) || null,
    [mothers, selectedMotherId],
  );

  const filteredMothers = useMemo(() => {
    const search = motherSearch.trim().toLowerCase();

    if (!search) return mothers;

    return mothers.filter((mother) => (
      mother.name.toLowerCase().includes(search)
      || mother.patient_id?.toLowerCase().includes(search)
      || mother.phone?.toLowerCase().includes(search)
    ));
  }, [motherSearch, mothers]);

  const children = childData.children || [];
  const selectedChild = children.find((child) => String(child.id) === String(selectedChildId)) || children[0] || null;
  const allImmunizations = children.flatMap((child) => child.immunizations || []);
  const completedVaccines = allImmunizations.filter((item) => item.status === "completed").length;
  const overdueVaccines = allImmunizations.filter((item) => item.status === "overdue").length;
  const activeAlerts = children.reduce((total, child) => total + (child.alerts?.length || 0), 0);

  const updateChildField = (key, value) => {
    setChildForm((current) => ({ ...current, [key]: value }));
  };

  const updateProgressField = (key, value) => {
    setProgressErrors((current) => ({ ...current, [key]: "" }));
    setDuplicateRecord(null);
    setProgressForm((current) => ({ ...current, [key]: value }));
  };

  const replaceChild = (updatedChild) => {
    setChildData((current) => {
      const currentChildren = current.children || [];
      const nextChildren = currentChildren.map((child) => (
        String(child.id) === String(updatedChild.id) ? updatedChild : child
      ));

      return {
        ...current,
        children: nextChildren,
        summary: {
          ...(current.summary || {}),
          active_alerts: nextChildren.reduce((total, child) => total + (child.alerts?.length || 0), 0),
          overdue_vaccines: nextChildren.reduce((total, child) => (
            total + (child.immunizations || []).filter((item) => item.status === "overdue").length
          ), 0),
        },
      };
    });
    setSelectedChildId(updatedChild.id);
  };

  const validateProgressForm = () => {
    const nextErrors = {};
    const age = Number(progressForm.age_month);
    const weight = Number(progressForm.weight);
    const height = Number(progressForm.height);

    if (progressForm.age_month === "") {
      nextErrors.age_month = "Age is required.";
    } else if (!Number.isInteger(age) || age < 0) {
      nextErrors.age_month = "Select a valid age in months.";
    }

    if (progressForm.weight === "") {
      nextErrors.weight = "Weight is required.";
    } else if (!Number.isFinite(weight) || weight <= 0) {
      nextErrors.weight = "Weight must be greater than zero.";
    }

    if (progressForm.height === "") {
      nextErrors.height = "Height is required.";
    } else if (!Number.isFinite(height) || height <= 0) {
      nextErrors.height = "Height must be greater than zero.";
    }

    setProgressErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  };

  const closeProgressModal = () => {
    if (savingProgress) return;

    setIsProgressOpen(false);
    setProgressChild(null);
    setProgressError("");
    setProgressErrors({});
    setDuplicateRecord(null);
    setProgressForm(emptyProgressForm);
  };

  const openProgressModal = (child) => {
    setProgressChild(child);
    setProgressError("");
    setProgressErrors({});
    setDuplicateRecord(null);
    setProgressForm({
      age_month: numericOrBlank(child.age_months),
      weight: numericOrBlank(child.current_weight_kg),
      height: numericOrBlank(child.current_height_cm),
      notes: "",
    });
    setIsProgressOpen(true);
  };

  const saveChild = async (event) => {
    event.preventDefault();
    if (!selectedMotherId) return;

    setSavingChild(true);

    try {
      const payload = Object.fromEntries(
        Object.entries(childForm).map(([key, value]) => [key, value === "" ? null : value]),
      );
      const response = await axios.post(
        `${API_BASE_URL}/health-worker/child-health/${selectedMotherId}/children`,
        payload,
        authConfig(),
      );

      setNotice({ type: "success", text: response.data.message });
      setChildForm(emptyChildForm);
      setIsAddOpen(false);
      await loadChildren(selectedMotherId, true, response.data.child.id);
    } catch (error) {
      const validationMessage = Object.values(error.response?.data?.errors || {}).flat()[0];
      setNotice({
        type: "error",
        text: validationMessage || error.response?.data?.message || "Unable to onboard infant.",
      });
    } finally {
      setSavingChild(false);
    }
  };

  const saveProgress = async (event) => {
    event.preventDefault();
    if (!progressChild || !selectedMotherId) return;
    if (!validateProgressForm()) return;

    setSavingProgress(true);
    setProgressError("");
    setDuplicateRecord(null);

    try {
      const payload = {
        ...progressForm,
        notes: progressForm.notes || null,
      };
      const response = await axios.post(
        `${API_BASE_URL}/children/${progressChild.id}/growth`,
        payload,
        authConfig(),
      );

      setNotice({ type: "success", text: response.data.message });
      setIsProgressOpen(false);
      setProgressChild(null);
      setProgressForm(emptyProgressForm);
      replaceChild(response.data.child);
    } catch (error) {
      const validationMessage = Object.values(error.response?.data?.errors || {}).flat()[0];
      if (error.response?.status === 409 && error.response?.data?.existing_record) {
        setDuplicateRecord(error.response.data.existing_record);
      }
      setProgressError(validationMessage || error.response?.data?.message || "Unable to update growth progress.");
    } finally {
      setSavingProgress(false);
    }
  };

  const updateExistingGrowth = async () => {
    if (!progressChild || !duplicateRecord || !validateProgressForm()) return;

    setSavingProgress(true);
    setProgressError("");

    try {
      const response = await axios.put(
        `${API_BASE_URL}/growth-records/${duplicateRecord.id}`,
        {
          ...progressForm,
          notes: progressForm.notes || null,
        },
        authConfig(),
      );

      setNotice({ type: "success", text: response.data.message });
      setIsProgressOpen(false);
      setProgressChild(null);
      setDuplicateRecord(null);
      setProgressForm(emptyProgressForm);
      replaceChild(response.data.child);
    } catch (error) {
      const validationMessage = Object.values(error.response?.data?.errors || {}).flat()[0];
      setProgressError(validationMessage || error.response?.data?.message || "Unable to update the existing growth record.");
    } finally {
      setSavingProgress(false);
    }
  };

  const toggleImmunization = async (child, immunization) => {
    setUpdatingImmunizationId(immunization.id);

    try {
      const completed = immunization.status !== "completed";
      const response = await axios.patch(
        `${API_BASE_URL}/health-worker/child-health/children/${child.id}/immunizations/${immunization.id}`,
        {
          completed,
          vaccinated_at: completed ? todayValue() : null,
        },
        authConfig(),
      );

      setNotice({ type: "success", text: response.data.message });
      await loadChildren(selectedMotherId, true);
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.message || "Unable to update vaccine record.",
      });
    } finally {
      setUpdatingImmunizationId(null);
    }
  };

  return (
    <HealthWorkerShell>
      <div className="mx-auto min-h-screen w-full max-w-[1500px] overflow-x-hidden px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <header className="border-b border-slate-300 pb-5">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">
            Neonatal Desk <span className="px-2 text-slate-300">-</span>
            <span className="text-pink-600">Vaccine Surveillance</span>
          </p>
          <div className="mt-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-950">Neonatal & Vaccine Command</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Track linked infants, growth signals, and vaccine completion for assigned maternal casefiles.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] font-extrabold uppercase text-slate-400">Linked Infants</p>
                <p className="mt-1 text-xl font-extrabold text-slate-950">{children.length}</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-[10px] font-extrabold uppercase text-emerald-700">Vaccines Done</p>
                <p className="mt-1 text-xl font-extrabold text-emerald-800">{completedVaccines}</p>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
                <p className="text-[10px] font-extrabold uppercase text-rose-700">Follow-Ups</p>
                <p className="mt-1 text-xl font-extrabold text-rose-800">{overdueVaccines + activeAlerts}</p>
              </div>
            </div>
          </div>
        </header>

        <Notice notice={notice} onClose={() => setNotice(null)} />

        <div className="grid min-w-0 gap-5 pt-5 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <aside className="h-fit rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase text-pink-600">Maternal Sponsors</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{mothers.length} assigned casefile{mothers.length === 1 ? "" : "s"}</p>
              </div>
              <UserRound className="h-5 w-5 text-pink-600" />
            </div>

            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={motherSearch}
                onChange={(event) => setMotherSearch(event.target.value)}
                placeholder="Search mother..."
                className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400 focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
              />
            </label>

            <div className="mt-4 max-h-[620px] space-y-2 overflow-y-auto pr-1">
              {loadingMothers ? (
                <div className="flex min-h-48 items-center justify-center text-sm font-bold text-slate-500">
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  Loading mothers...
                </div>
              ) : filteredMothers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                  <p className="text-sm font-extrabold text-slate-700">No mothers found</p>
                </div>
              ) : (
                filteredMothers.map((mother) => (
                  <MotherRosterButton
                    key={mother.id}
                    mother={mother}
                    active={String(mother.id) === String(selectedMotherId)}
                    onClick={() => setSelectedMotherId(mother.id)}
                  />
                ))
              )}
            </div>
          </aside>

          <section className="min-w-0">
            {!selectedMother ? (
              <div className="flex min-h-[520px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
                <Baby className="h-12 w-12 text-pink-300" />
                <h2 className="mt-4 text-xl font-extrabold text-slate-950">No maternal sponsor selected</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Add mothers to casefiles first, then neonatal and vaccine records will appear here.
                </p>
                <Link
                  href="/health-worker/mothers"
                  className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-pink-600 px-5 text-sm font-extrabold text-white hover:bg-pink-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Maternal Sponsor
                </Link>
              </div>
            ) : (
              <div className="space-y-5">
                <MotherSponsorCard mother={selectedMother} />

                <section className="rounded-lg border border-slate-200 bg-white/70 p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.12em] text-teal-700">
                        <Baby className="h-4 w-4" />
                        Linked Child Case Records ({children.length})
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Summary: {childData.summary?.children_count || 0} infant{(childData.summary?.children_count || 0) === 1 ? "" : "s"} - {childData.summary?.overdue_vaccines || 0} overdue vaccine{(childData.summary?.overdue_vaccines || 0) === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                      {children.length > 1 && (
                        <label className="flex min-w-0 flex-col gap-1 text-[10px] font-extrabold uppercase text-slate-400 sm:w-64">
                          Active Infant
                          <select
                            value={selectedChild?.id || ""}
                            onChange={(event) => setSelectedChildId(event.target.value)}
                            className="h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-extrabold normal-case text-slate-900 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                          >
                            {children.map((child) => (
                              <option key={child.id} value={child.id}>
                                {child.name} ({child.age_label})
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsAddOpen(true)}
                        className="inline-flex h-10 min-w-0 max-w-full items-center justify-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-4 text-xs font-extrabold text-teal-700 transition hover:bg-teal-100 sm:max-w-xs"
                      >
                        <Plus className="h-4 w-4 shrink-0" />
                        <span className="truncate">Onboard Infant to {selectedMother.name}</span>
                      </button>
                    </div>
                  </div>

                  {loadingChildren ? (
                    <div className="flex min-h-72 items-center justify-center text-sm font-bold text-slate-500">
                      <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
                      Loading neonatal records...
                    </div>
                  ) : children.length === 0 ? (
                    <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
                      <Baby className="h-11 w-11 text-pink-300" />
                      <h2 className="mt-4 text-lg font-extrabold text-slate-950">No linked child records yet</h2>
                      <button
                        type="button"
                        onClick={() => setIsAddOpen(true)}
                        className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 text-sm font-extrabold text-white hover:bg-pink-700"
                      >
                        <Plus className="h-4 w-4" />
                        Onboard Infant
                      </button>
                    </div>
                  ) : (
                    selectedChild && (
                      <ChildCard
                        child={selectedChild}
                        updatingImmunizationId={updatingImmunizationId}
                        onToggleImmunization={toggleImmunization}
                        onUpdateGrowth={openProgressModal}
                      />
                    )
                  )}
                </section>
              </div>
            )}
          </section>
        </div>
      </div>

      {isAddOpen && selectedMother && (
        <AddChildModal
          mother={selectedMother}
          form={childForm}
          saving={savingChild}
          onChange={updateChildField}
          onClose={() => setIsAddOpen(false)}
          onSubmit={saveChild}
        />
      )}

      {isProgressOpen && progressChild && (
        <GrowthProgressModal
          child={progressChild}
          form={progressForm}
          error={progressError}
          errors={progressErrors}
          duplicateRecord={duplicateRecord}
          saving={savingProgress}
          onChange={updateProgressField}
          onClose={closeProgressModal}
          onSubmit={saveProgress}
          onUpdateExisting={updateExistingGrowth}
        />
      )}
    </HealthWorkerShell>
  );
}
