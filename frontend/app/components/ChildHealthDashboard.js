"use client";

import { useMemo, useState } from "react";
import axios from "axios";
import {
  AlertTriangle,
  Baby,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  HelpCircle,
  LoaderCircle,
  Plus,
  Ruler,
  Save,
  Scale,
  ShieldCheck,
  Syringe,
  TrendingUp,
  X,
} from "lucide-react";
import ProfilePhotoUploadModal from "./ProfilePhotoUploadModal";
import { getAuthToken } from "../utils/authSession";
import useApiQuery from "../hooks/useApiQuery";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

const authConfig = () => ({
  headers: { Authorization: `Bearer ${getAuthToken()}` },
});

const statusStyles = {
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  upcoming: "border-blue-200 bg-blue-50 text-blue-700",
  overdue: "border-rose-200 bg-rose-50 text-rose-700",
};

const alertStyles = {
  high: "border-rose-200 bg-rose-50 text-rose-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-blue-200 bg-blue-50 text-blue-800",
};

const emptyChildForm = {
  name: "",
  sex: "unspecified",
  birth_date: "",
};

const childProfileGuide = [
  ["Child Name", "Enter the child's full name as written in the birth or health-center record."],
  ["Sex", "Choose Female, Male, or Unspecified if the record does not show it yet."],
  ["Birth Date", "Use the child's actual birthday, not the date you are registering the profile."],
];

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`))
  : "Not recorded";

function GrowthChart({ records = [], metric, color, fill, unit, ageMonths }) {
  const field = metric === "weight" ? "weight_kg" : "height_cm";
  const label = metric === "weight" ? "Weight Progress" : "Height Progress";
  const chartRecords = records
    .filter((record) => record[field] !== null && record[field] !== undefined)
    .slice()
    .sort((left, right) => Number(left.age_months) - Number(right.age_months));
  const width = 560;
  const height = 300;
  const pad = { top: 28, right: 24, bottom: 54, left: 46 };
  const values = chartRecords.map((record) => Number(record[field]));
  const ages = chartRecords.map((record) => Number(record.age_months));
  const oldestAge = Math.max(0, ageMonths || 0, ...ages);
  const ageCeilings = [3, 6, 12, 18, 24, 36, 48, 60];
  const xMax = ageCeilings.find((ceiling) => oldestAge <= ceiling) || Math.ceil(oldestAge / 12) * 12;
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
  const xTicks = [0, Math.round(xMax * 0.25), Math.round(xMax * 0.5), Math.round(xMax * 0.75), xMax]
    .filter((tick, index, all) => all.indexOf(tick) === index);
  const yTicks = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => Number((yMin + (yMax - yMin) * ratio).toFixed(metric === "weight" ? 1 : 0)))
    .filter((tick, index, all) => all.indexOf(tick) === index);
  const gradientId = `${metric}GrowthFill`;

  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <TrendingUp className="h-4 w-4" style={{ color }} />
          <h2 className="min-w-0 text-sm font-extrabold text-slate-950 sm:text-base">{label}</h2>
        </div>
        <span className="text-[10px] font-extrabold uppercase text-slate-400">0–{xMax} months • Unit: {unit}</span>
      </div>

      <div className="inay-chart-frame h-[240px] sm:h-[260px]">
        {chartRecords.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-center">
            <TrendingUp className="h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-extrabold text-slate-700">No growth records yet</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Add a height and weight measurement to begin the chart.</p>
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="block h-full w-full" role="img" aria-label={label}>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={fill} stopOpacity="0.42" />
                <stop offset="100%" stopColor={fill} stopOpacity="0.04" />
              </linearGradient>
            </defs>
            <rect x={pad.left} y={pad.top} width={plotWidth} height={plotHeight} fill="#f8fafc" />
            {yTicks.map((tick) => (
              <g key={`y-${tick}`}>
                <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeDasharray="4 7" />
                <text x={pad.left - 12} y={y(tick) + 4} textAnchor="end" fontSize="11" fontWeight="700" fill="#94a3b8">{tick}</text>
              </g>
            ))}
            {xTicks.map((tick) => (
              <g key={`x-${tick}`}>
                <line x1={x(tick)} x2={x(tick)} y1={pad.top} y2={height - pad.bottom} stroke="#e2e8f0" strokeDasharray="4 7" />
                <text x={x(tick)} y={height - 22} textAnchor="middle" fontSize="11" fontWeight="700" fill="#64748b">{tick}</text>
              </g>
            ))}
            {areaPoints && <polygon points={areaPoints} fill={`url(#${gradientId})`} />}
            {points && <polyline points={points} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
            {chartRecords.map((record) => (
              <g key={`${metric}-${record.id}`}>
                <circle cx={x(Number(record.age_months))} cy={y(Number(record[field]))} r="6" fill="#fff" stroke={color} strokeWidth="4">
                  <title>{`${record[field]} ${unit} at ${record.age_months} month${Number(record.age_months) === 1 ? "" : "s"}${record.date ? ` (${formatDate(record.date)})` : ""}`}</title>
                </circle>
                <text x={x(Number(record.age_months))} y={y(Number(record[field])) - 12} textAnchor="middle" fontSize="10" fontWeight="800" fill={color}>
                  {record[field]} {unit}
                </text>
              </g>
            ))}
            <text x={width / 2} y={height - 2} textAnchor="middle" fontSize="12" fontWeight="800" fill="#94a3b8">AGE (MONTHS)</text>
          </svg>
        )}
      </div>
    </article>
  );
}

function MetricTile({ icon: Icon, label, value, unit, tone }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${tone}`} />
        <p className="text-[10px] font-extrabold uppercase text-slate-400">{label}</p>
      </div>
      <p className="mt-2 break-words text-lg font-extrabold text-slate-950">
        {value ?? "N/A"} <span className={`text-xs font-extrabold ${tone}`}>{value ? unit : ""}</span>
      </p>
    </div>
  );
}

function Notice({ notice, onClose }) {
  if (!notice) return null;

  return (
    <div className={`mb-5 flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-bold ${notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
      <span>{notice.text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss notice" className="rounded-md p-1 hover:bg-white/70">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ChildAvatar({ child, uploading = false, onPickPhoto }) {
  return (
    <div className="relative h-16 w-16 shrink-0">
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-violet-600 text-2xl font-extrabold text-white shadow-sm">
        {child.profile_photo_url ? (
          <div
            role="img"
            aria-label={`${child.name} profile`}
            className="h-full w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${child.profile_photo_url})` }}
          />
        ) : (
          child.initials
        )}
      </div>
      <button
        type="button"
        onClick={onPickPhoto}
        disabled={uploading}
        className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-pink-600 text-white shadow-sm hover:bg-pink-700 disabled:bg-pink-300"
        aria-label={`Add profile photo for ${child.name}`}
        title={`Add profile photo for ${child.name}`}
      >
        {uploading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function FieldGuide({ title, items }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left text-sm font-extrabold text-blue-800"
        aria-expanded={isOpen}
      >
        <span className="inline-flex items-center gap-2">
          <HelpCircle className="h-4 w-4" />
          {title}
        </span>
        <span className="rounded-md bg-white px-2 py-1 text-[10px] font-extrabold uppercase text-blue-700">
          {isOpen ? "Hide" : "Show"}
        </span>
      </button>

      {isOpen && (
        <div className="mt-3 grid gap-2 border-t border-blue-100 pt-3 sm:grid-cols-2">
          {items.map(([label, text]) => (
            <div key={label} className="rounded-lg bg-white p-3 ring-1 ring-blue-100">
              <p className="text-xs font-extrabold uppercase text-blue-700">{label}</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-4 py-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <h2 className="text-lg font-extrabold text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close modal">
            <X className="h-5 w-5" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export default function ChildHealthDashboard() {
  const { data: cachedData, error, isLoading, isValidating, mutate } = useApiQuery("/child-health/children", {
    fallbackData: { children: [], summary: {} },
    refreshInterval: 10000,
    dedupingInterval: 5000,
  });
  const data = cachedData || { children: [], summary: {} };
  const [selectedChildId, setSelectedChildId] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoUploadingId, setPhotoUploadingId] = useState(null);
  const [photoEditorChildId, setPhotoEditorChildId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [childForm, setChildForm] = useState(emptyChildForm);

  const children = useMemo(() => data.children || [], [data.children]);
  const selectedChild = children.find((child) => String(child.id) === String(selectedChildId)) || children[0] || null;
  const growthAnalytics = selectedChild?.growth_analytics;

  const saveChild = async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      const payload = Object.fromEntries(
        Object.entries(childForm).map(([key, value]) => [key, value === "" ? null : value]),
      );
      const response = await axios.post(`${API_BASE_URL}/child-health/children`, payload, authConfig());
      const nextChild = response.data.child;
      setNotice({ type: "success", text: response.data.message });
      setChildForm(emptyChildForm);
      setIsAddOpen(false);
      setSelectedChildId(nextChild.id);
      await mutate((current) => {
        const currentData = current || data;
        const currentChildren = currentData.children || [];
        const nextChildren = [
          nextChild,
          ...currentChildren.filter((child) => String(child.id) !== String(nextChild.id)),
        ];

        return {
          ...currentData,
          children: nextChildren,
          summary: {
            ...(currentData.summary || {}),
            children_count: nextChildren.length,
          },
        };
      }, { revalidate: false });
      void mutate();
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.message || "Unable to register child profile." });
    } finally {
      setSaving(false);
    }
  };

  const uploadChildPhoto = async (file) => {
    const photoChild = children.find((child) => String(child.id) === String(photoEditorChildId));
    if (!photoChild) throw new Error("The selected baby profile is no longer available.");

    const formData = new FormData();
    formData.append("photo", file);
    setPhotoUploadingId(photoChild.id);

    try {
      const response = await axios.post(`${API_BASE_URL}/child-health/children/${photoChild.id}/profile-photo`, formData, authConfig());
      const updatedChild = response.data.child;
      setNotice({ type: "success", text: response.data.message });
      setSelectedChildId(updatedChild.id);
      await mutate((current) => {
        const currentData = current || data;

        return {
          ...currentData,
          children: (currentData.children || []).map((child) => (
            String(child.id) === String(updatedChild.id) ? updatedChild : child
          )),
        };
      }, { revalidate: false });
      void mutate();
    } finally {
      setPhotoUploadingId(null);
    }
  };

  const updateChildField = (key, value) => {
    setChildForm((current) => ({ ...current, [key]: value }));
  };

  if (isLoading && children.length === 0) {
    return <ChildHealthSkeleton />;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#fbfbfc] px-4 py-5 text-slate-950 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <header className="mb-6 flex flex-col justify-between gap-4 border-b border-pink-100 pb-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-[10px] font-extrabold uppercase text-pink-600">Mother Portal / Pediatric Care</p>
            <h1 className="mt-2 text-2xl font-extrabold text-slate-950">Child Health Monitoring</h1>
            <p className="mt-1 text-sm text-slate-500">Track children&apos;s growth, immunization status, and health alerts in one workspace.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {children.length > 0 && (
              <label className="flex flex-col gap-1 text-xs font-extrabold uppercase text-slate-400 sm:flex-row sm:items-center sm:gap-2">
                Active Patient Profile:
                <select
                  value={selectedChild?.id || ""}
                  onChange={(event) => setSelectedChildId(event.target.value)}
                  className="h-11 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-extrabold normal-case text-slate-900 shadow-sm outline-none focus:border-pink-500 sm:min-w-72"
                >
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>{child.name} ({child.age_label})</option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-pink-600 px-5 text-sm font-extrabold text-white shadow-sm hover:bg-pink-700"
            >
              <Plus className="h-4 w-4" /> Add Child
            </button>
          </div>
        </header>

        <Notice
          notice={notice || (error ? { type: "error", text: "Unable to refresh child health records. Showing the latest available data." } : null)}
          onClose={() => setNotice(null)}
        />

        {isValidating && children.length > 0 && (
          <p className="mb-4 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-extrabold uppercase text-slate-400">
            Updating in background
          </p>
        )}

        {!selectedChild ? (
          <section className="flex min-h-[55vh] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <Baby className="h-12 w-12 text-pink-300" />
            <h2 className="mt-4 text-xl font-extrabold text-slate-950">No registered children yet</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Register a child profile to begin monthly growth tracking and immunization monitoring.</p>
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-pink-600 px-5 text-sm font-extrabold text-white hover:bg-pink-700"
            >
              <Plus className="h-4 w-4" /> Add Child
            </button>
          </section>
        ) : (
          <div className="space-y-6">
            <section className="min-w-0 rounded-lg border border-slate-900 bg-white p-4 shadow-sm sm:p-5">
              <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,auto)] lg:items-center">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <ChildAvatar
                    child={selectedChild}
                    uploading={String(photoUploadingId) === String(selectedChild.id)}
                    onPickPhoto={() => setPhotoEditorChildId(selectedChild.id)}
                  />
                  <div>
                    <h2 className="text-2xl font-extrabold text-slate-950">{selectedChild.name}</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500">Monthly Pediatric Wellness Checklist</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedChild.alerts?.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-extrabold text-rose-700">
                          <AlertTriangle className="h-3.5 w-3.5" /> {selectedChild.alerts.length} active alert{selectedChild.alerts.length === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">
                          <ShieldCheck className="h-3.5 w-3.5" /> No active alerts
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-700">
                        <CalendarCheck className="h-3.5 w-3.5" /> {selectedChild.immunization_summary.completed} vaccines completed
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricTile icon={Baby} label="Age" value={selectedChild.age_label} unit="" tone="text-slate-700" />
                  <MetricTile icon={CalendarDays} label="Birth Date" value={formatDate(selectedChild.birth_date)} unit="" tone="text-blue-600" />
                  <MetricTile icon={Scale} label="Weight" value={selectedChild.current_weight_kg} unit="kg" tone="text-pink-600" />
                  <MetricTile icon={Ruler} label="Height" value={selectedChild.current_height_cm} unit="cm" tone="text-violet-600" />
                </div>
              </div>

              <div className="mt-5 flex flex-col justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
                <p className="text-xs font-bold text-slate-500">
                  Last measurement: <span className="font-extrabold text-slate-800">{formatDate(selectedChild.latest_recorded_at)}</span>
                </p>
              </div>
            </section>

            {selectedChild.alerts?.length > 0 && (
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {selectedChild.alerts.map((alert, index) => (
                  <article key={`${alert.type}-${index}`} className={`rounded-lg border p-4 ${alertStyles[alert.severity] || alertStyles.medium}`}>
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                      <div>
                        <h3 className="font-extrabold">{alert.title}</h3>
                        <p className="mt-1 text-sm font-semibold leading-6 opacity-90">{alert.message}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            )}

            <section className="grid min-w-0 gap-6 xl:grid-cols-2">
              <GrowthChart
                records={selectedChild.growth_trend || selectedChild.growth_records}
                metric="weight"
                unit="kg"
                color="#2563eb"
                fill="#93c5fd"
                ageMonths={selectedChild.age_months}
              />
              <GrowthChart
                records={selectedChild.growth_trend || selectedChild.growth_records}
                metric="height"
                unit="cm"
                color="#7c3aed"
                fill="#c4b5fd"
                ageMonths={selectedChild.age_months}
              />
            </section>

            <section className="flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs font-bold text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span title="The Python growth analytics script runs securely on the server after measurements are saved.">
                {growthAnalytics?.engine === "python" ? "Python growth analytics active" : "Growth analytics fallback active"}
              </span>
              <span>
                Weight: {growthAnalytics?.average_weight_change_kg_per_month == null
                  ? "more monthly data needed"
                  : `${growthAnalytics.average_weight_change_kg_per_month >= 0 ? "+" : ""}${growthAnalytics.average_weight_change_kg_per_month} kg/month`}
                {" • "}
                Height: {growthAnalytics?.average_height_change_cm_per_month == null
                  ? "more monthly data needed"
                  : `${growthAnalytics.average_height_change_cm_per_month >= 0 ? "+" : ""}${growthAnalytics.average_height_change_cm_per_month} cm/month`}
              </span>
            </section>

            <section className="rounded-lg border border-slate-900 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-600">
                    <Syringe className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-950">Immunization Schedule</h2>
                    <p className="text-xs font-semibold text-slate-500">Program staff-recorded vaccine status for {selectedChild.name}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-extrabold">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">{selectedChild.immunization_summary.completed} completed</span>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700">{selectedChild.immunization_summary.upcoming} upcoming</span>
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700">{selectedChild.immunization_summary.overdue} overdue</span>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {selectedChild.immunizations.map((immunization) => (
                  <article
                    key={immunization.id}
                    className={`rounded-lg border p-4 ${immunization.status === "overdue" ? "border-rose-200 bg-rose-50/40" : "border-slate-200 bg-slate-50"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${statusStyles[immunization.status]}`}>
                          {immunization.status === "completed" ? <CheckCircle2 className="h-4 w-4" /> : <Syringe className="h-4 w-4" />}
                        </div>
                        <div>
                          <h3 className="font-extrabold text-slate-950">{immunization.vaccine_name}</h3>
                          <p className="mt-1 text-xs font-bold text-slate-500">{immunization.dose_label} / Due {formatDate(immunization.scheduled_at)}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase ${statusStyles[immunization.status]}`}>
                        {immunization.status}
                      </span>
                    </div>

                    <dl className="mt-4 space-y-2 text-sm leading-6">
                      <div>
                        <dt className="font-extrabold text-slate-500">Vaccination Date</dt>
                        <dd className="font-semibold text-slate-800">{formatDate(immunization.vaccinated_at)}</dd>
                      </div>
                      <div>
                        <dt className="font-extrabold text-slate-500">Purpose</dt>
                        <dd className="text-slate-700">{immunization.purpose}</dd>
                      </div>
                      <div>
                        <dt className="font-extrabold text-pink-600">Possible Side Effects</dt>
                        <dd className="text-slate-700">{immunization.side_effects}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      {isAddOpen && (
        <Modal title="Add Child" onClose={() => setIsAddOpen(false)}>
          <form onSubmit={saveChild} className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldGuide title="What to put in each child profile field" items={childProfileGuide} />
            </div>
            <label className="text-xs font-extrabold uppercase text-slate-500 sm:col-span-2">
              Child Name
              <input
                required
                value={childForm.name}
                onChange={(event) => updateChildField("name", event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-pink-500"
              />
            </label>
            <label className="text-xs font-extrabold uppercase text-slate-500">
              Sex
              <select
                value={childForm.sex}
                onChange={(event) => updateChildField("sex", event.target.value)}
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
                value={childForm.birth_date}
                onChange={(event) => updateChildField("birth_date", event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-pink-500"
              />
            </label>
            <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:col-span-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setIsAddOpen(false)} className="h-11 rounded-lg border border-slate-200 px-5 text-sm font-extrabold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-pink-600 px-5 text-sm font-extrabold text-white hover:bg-pink-700 disabled:bg-pink-300">
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Child
              </button>
            </div>
          </form>
        </Modal>
      )}

      {photoEditorChildId && (
        <ProfilePhotoUploadModal
          title="Upload Baby Profile Photo"
          subjectName={children.find((child) => String(child.id) === String(photoEditorChildId))?.name || "Baby"}
          accent="violet"
          onClose={() => setPhotoEditorChildId(null)}
          onSave={uploadChildPhoto}
          onUploadError={(message) => setNotice({ type: "error", text: message })}
        />
      )}
    </div>
  );
}

function ChildHealthSkeleton() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#fbfbfc] px-4 py-6 text-slate-950 sm:px-6 lg:px-8" aria-label="Loading child health">
      <div className="mx-auto w-full max-w-[1500px]">
        <header className="mb-6 flex flex-col justify-between gap-4 border-b border-pink-100 pb-5 lg:flex-row lg:items-end">
          <div>
            <div className="h-3 w-40 animate-pulse rounded bg-slate-100" />
            <div className="mt-4 h-7 w-72 max-w-full animate-pulse rounded bg-slate-100" />
            <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-slate-100" />
          </div>
          <div className="h-11 w-36 animate-pulse rounded-lg bg-slate-100" />
        </header>
        <div className="space-y-6">
          <section className="h-48 animate-pulse rounded-lg border border-slate-900 bg-white p-5 shadow-sm" />
          <section className="grid min-w-0 gap-6 xl:grid-cols-2">
            <div className="h-80 animate-pulse rounded-lg border border-slate-200 bg-white shadow-sm" />
            <div className="h-80 animate-pulse rounded-lg border border-slate-200 bg-white shadow-sm" />
          </section>
          <section className="h-96 animate-pulse rounded-lg border border-slate-900 bg-white shadow-sm" />
        </div>
      </div>
    </div>
  );
}
