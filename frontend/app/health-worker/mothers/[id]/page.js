"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardList,
  Clock3,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  HeartPulse,
  LoaderCircle,
  MapPin,
  NotebookPen,
  Phone,
  Printer,
  Save,
  Scale,
  ShieldCheck,
  Stethoscope,
  Syringe,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";
import HealthWorkerShell from "../../../components/HealthWorkerShell";
import { getAuthToken } from "../../../utils/authSession";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

const authConfig = (extra = {}) => ({
  ...extra,
  headers: {
    Authorization: `Bearer ${getAuthToken()}`,
    ...(extra.headers || {}),
  },
});

const riskStyles = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-red-200 bg-red-50 text-red-700",
};

const riskAccent = {
  low: "bg-emerald-600",
  medium: "bg-amber-500",
  high: "bg-red-600",
};

const timelineStyles = {
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  current: "border-pink-200 bg-pink-50 text-pink-700 ring-4 ring-pink-100",
  future: "border-slate-200 bg-white text-slate-400",
};

const monitorFilters = [
  { label: "All", value: "all" },
  { label: "First Trimester", value: "first" },
  { label: "Second Trimester", value: "second" },
  { label: "Third Trimester", value: "third" },
  { label: "Postpartum", value: "postpartum" },
];

const vitalEntryFields = [
  ["pregnancy_week", "Pregnancy Week", "number"],
  ["weight_kg", "Weight (kg)", "number"],
  ["systolic_bp", "Systolic BP", "number"],
  ["diastolic_bp", "Diastolic BP", "number"],
  ["blood_sugar_mgdl", "Blood Sugar (mg/dL)", "number"],
  ["hemoglobin_gdl", "Hemoglobin (g/dL)", "number"],
  ["body_temperature_c", "Temperature (C)", "number"],
  ["heart_rate", "Heart Rate", "number"],
];

const learningCategoryOrder = [
  "first_trimester",
  "second_trimester",
  "third_trimester",
  "child_health",
];

const parseDate = (value) => {
  if (!value) return null;
  return new Date(String(value).includes("T") ? value : `${value}T00:00:00`);
};

const formatDate = (value) => {
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return "Not provided";

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const formatDateTime = (value) => {
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return "Not provided";

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const metric = (value, suffix = "") => (value || value === 0 ? `${value}${suffix}` : "Not recorded");

const blankableValue = (value) => (value || value === 0 ? value : "");

const vitalStatusStyles = {
  normal: "border-emerald-200 bg-emerald-50 text-emerald-700",
  review: "border-amber-200 bg-amber-50 text-amber-700",
  missing: "border-slate-200 bg-slate-50 text-slate-500",
};

const vitalStatusLabels = {
  normal: "Normal",
  review: "Review",
  missing: "Pending",
};

const numericValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const classifyBloodPressure = (record) => {
  const systolic = numericValue(record?.systolic_bp);
  const diastolic = numericValue(record?.diastolic_bp);
  if (systolic === null || diastolic === null) return "missing";
  return systolic >= 140 || diastolic >= 90 || systolic < 90 || diastolic < 60 ? "review" : "normal";
};

const classifyBloodSugar = (value) => {
  const sugar = numericValue(value);
  if (sugar === null) return "missing";
  return sugar >= 140 || sugar < 70 ? "review" : "normal";
};

const classifyHemoglobin = (value) => {
  const hemoglobin = numericValue(value);
  if (hemoglobin === null) return "missing";
  return hemoglobin < 11 ? "review" : "normal";
};

const classifyWeight = (value) => (numericValue(value) === null ? "missing" : "normal");

function ProgressBar({ value, tone = "bg-pink-600" }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${tone} transition-all duration-500`} style={{ width: `${safeValue}%` }} />
    </div>
  );
}

function SectionHeader({ eyebrow, title, detail, action }) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        {eyebrow && (
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-pink-600">{eyebrow}</p>
        )}
        <h2 className="mt-1 text-lg font-extrabold text-slate-950">{title}</h2>
        {detail && <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, detail, tone, progress }) {
  return (
    <article className={`rounded-lg border p-4 shadow-sm ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] opacity-80">{label}</p>
          <p className="mt-2 truncate text-2xl font-extrabold">{value}</p>
          <p className="mt-1 text-xs font-semibold leading-5 opacity-80">{detail}</p>
        </div>
        <Icon className="h-5 w-5 shrink-0 opacity-80" />
      </div>
      {progress !== undefined && (
        <div className="mt-4">
          <ProgressBar value={progress} tone="bg-current" />
        </div>
      )}
    </article>
  );
}

function VitalSignCard({ icon: Icon, title, value, unit, status, range, tone }) {
  return (
    <article className="rounded-lg border border-slate-300 bg-white p-2.5">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${tone}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{title}</p>
            <p className="mt-1 text-lg font-extrabold leading-none text-slate-950">
              {value}
              {unit && <span className="ml-1.5 text-xs font-extrabold text-slate-500">{unit}</span>}
            </p>
          </div>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase ${vitalStatusStyles[status] || vitalStatusStyles.missing}`}>
          {vitalStatusLabels[status] || "Pending"}
        </span>
      </div>
      <div className="mt-3 border-t border-slate-200 pt-2.5">
        <div className="flex flex-col justify-between gap-1 text-[11px] sm:flex-row sm:items-center">
          <span className="font-extrabold text-slate-500">Healthy Range:</span>
          <span className="font-extrabold text-slate-950">{range}</span>
        </div>
      </div>
    </article>
  );
}

function TrendChart({ title, data, series, emptyLabel, ySuffix = "", minPadding = 1 }) {
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
                  {point.week ? `Wk ${point.week}` : formatDate(point.date)}
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
                  <title>{`${item.label}: ${coords.value}${ySuffix} on ${formatDate(point.date)}`}</title>
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

function Modal({ title, children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-extrabold text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close dialog">
            <X className="h-5 w-5" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export default function MotherDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const motherId = params?.id;
  const [casefile, setCasefile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [monitorFilter, setMonitorFilter] = useState("all");
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteBody, setEditingNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isVitalsOpen, setIsVitalsOpen] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingVitals, setSavingVitals] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    address: "",
    blood_type: "",
    pregnancy_status: "not_provided",
    pregnancy_week: "",
    postpartum_week: "",
    due_date: "",
    next_scheduled_visit: "",
    risk_rating: "low",
    co_monitoring_person: "",
  });
  const [vitalsForm, setVitalsForm] = useState({
    pregnancy_week: "",
    weight_kg: "",
    systolic_bp: "",
    diastolic_bp: "",
    blood_sugar_mgdl: "",
    hemoglobin_gdl: "",
    body_temperature_c: "",
    heart_rate: "",
    notes: "",
  });

  const loadCasefile = useCallback(async (silent = false) => {
    if (!motherId) return;
    if (!silent) setLoading(true);

    try {
      const response = await axios.get(`${API_BASE_URL}/health-worker/casefiles/${motherId}`, authConfig());
      setCasefile(response.data);
      setNotice(null);
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.message || "Unable to load this mother casefile.",
      });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [motherId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCasefile();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadCasefile]);

  const profile = casefile?.profile || {};
  const overview = casefile?.overview || {};
  const statistics = casefile?.statistics || {};
  const learning = casefile?.learning_progress || {};
  const medicalDocuments = casefile?.medical_documents || { expected_types: [], items: [] };
  const clinicalNotes = casefile?.clinical_notes || [];
  const activityTimeline = casefile?.activity_timeline || [];
  const monitoringRecords = casefile?.monitoring_records || [];
  const latestMonitoringRecord = monitoringRecords[monitoringRecords.length - 1] || {};
  const weightTrend = (statistics.weight_trend || statistics.weight_progression || []).map((point) => ({
    ...point,
    week: point.week ?? point.pregnancy_week,
    value: point.value ?? point.weight_kg,
  }));
  const bloodPressureTrend = (statistics.blood_pressure_trend || statistics.blood_pressure_trends || []).map((point) => ({
    ...point,
    week: point.week ?? point.pregnancy_week,
  }));
  const vitalSigns = [
    {
      title: "Blood Pressure",
      icon: HeartPulse,
      value: latestMonitoringRecord.blood_pressure || "N/A",
      unit: latestMonitoringRecord.blood_pressure ? "mmHg" : "",
      status: classifyBloodPressure(latestMonitoringRecord),
      range: "Target below 140/90 mmHg",
      tone: "border-pink-100 bg-pink-50 text-pink-600",
    },
    {
      title: "Blood Sugar",
      icon: Activity,
      value: latestMonitoringRecord.blood_sugar_mgdl || latestMonitoringRecord.blood_sugar_mgdl === 0 ? latestMonitoringRecord.blood_sugar_mgdl : "N/A",
      unit: latestMonitoringRecord.blood_sugar_mgdl || latestMonitoringRecord.blood_sugar_mgdl === 0 ? "mg/dL" : "",
      status: classifyBloodSugar(latestMonitoringRecord.blood_sugar_mgdl),
      range: "70 - 140 mg/dL",
      tone: "border-pink-100 bg-pink-50 text-pink-600",
    },
    {
      title: "Weight",
      icon: Scale,
      value: latestMonitoringRecord.weight_kg || latestMonitoringRecord.weight_kg === 0 ? latestMonitoringRecord.weight_kg : "N/A",
      unit: latestMonitoringRecord.weight_kg || latestMonitoringRecord.weight_kg === 0 ? "kg" : "",
      status: classifyWeight(latestMonitoringRecord.weight_kg),
      range: profile.pregnancy_status === "postpartum" ? "Track postpartum recovery" : "Review gain against baseline",
      tone: "border-emerald-100 bg-emerald-50 text-emerald-600",
    },
    {
      title: "Hemoglobin",
      icon: Eye,
      value: latestMonitoringRecord.hemoglobin_gdl || latestMonitoringRecord.hemoglobin_gdl === 0 ? latestMonitoringRecord.hemoglobin_gdl : "N/A",
      unit: latestMonitoringRecord.hemoglobin_gdl || latestMonitoringRecord.hemoglobin_gdl === 0 ? "g/dL" : "",
      status: classifyHemoglobin(latestMonitoringRecord.hemoglobin_gdl),
      range: "11.0 g/dL and above",
      tone: "border-blue-100 bg-blue-50 text-blue-600",
    },
  ];
  const allVitalsNormal = vitalSigns.every((vital) => vital.status === "normal");
  const detailTabs = [
    { value: "overview", label: "Overview", count: null },
    { value: "monitoring", label: "Monitoring", count: monitoringRecords.length },
    { value: "learning", label: "Learning", count: learning.completed_modules || 0 },
    { value: "documents", label: "Documents", count: medicalDocuments.items?.length || 0 },
    { value: "notes", label: "Notes", count: clinicalNotes.length },
  ];

  const filteredMonitoringRecords = useMemo(() => {
    const records = casefile?.monitoring_records || [];
    if (monitorFilter === "all") return records;
    if (monitorFilter === "postpartum") {
      return profile.pregnancy_status === "postpartum" ? records : [];
    }

    return records.filter((record) => record.trimester === monitorFilter);
  }, [casefile?.monitoring_records, monitorFilter, profile.pregnancy_status]);

  const documentsByType = useMemo(() => {
    return (medicalDocuments.items || []).reduce((groups, document) => {
      groups[document.type] = groups[document.type] || [];
      groups[document.type].push(document);
      return groups;
    }, {});
  }, [medicalDocuments.items]);

  const openEdit = () => {
    setEditForm({
      name: profile.name || "",
      phone: profile.phone || "",
      address: profile.address || "",
      blood_type: profile.blood_type || "",
      pregnancy_status: profile.pregnancy_status || "not_provided",
      pregnancy_week: profile.pregnancy_week || "",
      postpartum_week: profile.postpartum_week || "",
      due_date: profile.due_date || "",
      next_scheduled_visit: profile.next_scheduled_visit || "",
      risk_rating: profile.risk_level || "low",
      co_monitoring_person: profile.co_monitoring_person || "",
    });
    setIsEditOpen(true);
  };

  const saveInformation = async (event) => {
    event.preventDefault();
    setSavingInfo(true);

    try {
      const response = await axios.patch(
        `${API_BASE_URL}/health-worker/casefiles/${motherId}`,
        editForm,
        authConfig(),
      );
      setCasefile(response.data.casefile);
      setNotice({ type: "success", text: response.data.message });
      setIsEditOpen(false);
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.message || "Unable to update mother information." });
    } finally {
      setSavingInfo(false);
    }
  };

  const openSchedule = () => {
    setScheduleDate(profile.next_scheduled_visit || "");
    setIsScheduleOpen(true);
  };

  const openVitals = () => {
    setVitalsForm({
      pregnancy_week: blankableValue(latestMonitoringRecord.gestational_week || profile.pregnancy_week || ""),
      weight_kg: blankableValue(latestMonitoringRecord.weight_kg),
      systolic_bp: blankableValue(latestMonitoringRecord.systolic_bp),
      diastolic_bp: blankableValue(latestMonitoringRecord.diastolic_bp),
      blood_sugar_mgdl: blankableValue(latestMonitoringRecord.blood_sugar_mgdl),
      hemoglobin_gdl: blankableValue(latestMonitoringRecord.hemoglobin_gdl),
      body_temperature_c: blankableValue(latestMonitoringRecord.temperature_c),
      heart_rate: blankableValue(latestMonitoringRecord.heart_rate),
      notes: "",
    });
    setIsVitalsOpen(true);
  };

  const saveSchedule = async (event) => {
    event.preventDefault();
    setSavingInfo(true);

    try {
      const response = await axios.patch(
        `${API_BASE_URL}/health-worker/casefiles/${motherId}/schedule-visit`,
        { next_scheduled_visit: scheduleDate },
        authConfig(),
      );
      setCasefile(response.data.casefile);
      setNotice({ type: "success", text: response.data.message });
      setIsScheduleOpen(false);
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.message || "Unable to schedule this visit." });
    } finally {
      setSavingInfo(false);
    }
  };

  const saveVitals = async (event) => {
    event.preventDefault();
    setSavingVitals(true);

    const payload = Object.fromEntries(
      Object.entries(vitalsForm).map(([key, value]) => [
        key,
        key === "pregnancy_week" || key === "notes" ? value : (value === "" ? null : value),
      ]),
    );

    try {
      const response = await axios.post(
        `${API_BASE_URL}/health-worker/maternal-monitoring/${motherId}/entries`,
        payload,
        authConfig(),
      );
      setNotice({ type: "success", text: response.data.message || "Maternal vitals updated successfully." });
      setIsVitalsOpen(false);
      await loadCasefile(true);
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.message || "Unable to update maternal vitals." });
    } finally {
      setSavingVitals(false);
    }
  };

  const saveNote = async (event) => {
    event.preventDefault();
    if (!noteDraft.trim()) return;
    setSavingNote(true);

    try {
      const response = await axios.post(
        `${API_BASE_URL}/health-worker/casefiles/${motherId}/notes`,
        { body: noteDraft.trim() },
        authConfig(),
      );
      setNoteDraft("");
      setNotice({ type: "success", text: response.data.message });
      await loadCasefile(true);
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.message || "Unable to save clinical note." });
    } finally {
      setSavingNote(false);
    }
  };

  const saveEditedNote = async (noteId) => {
    if (!editingNoteBody.trim()) return;
    setSavingNote(true);

    try {
      const response = await axios.patch(
        `${API_BASE_URL}/health-worker/casefiles/${motherId}/notes/${noteId}`,
        { body: editingNoteBody.trim() },
        authConfig(),
      );
      setNotice({ type: "success", text: response.data.message });
      setEditingNoteId(null);
      setEditingNoteBody("");
      await loadCasefile(true);
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.message || "Unable to update clinical note." });
    } finally {
      setSavingNote(false);
    }
  };

  const exportPdf = async () => {
    setExporting(true);

    try {
      const response = await axios.get(
        `${API_BASE_URL}/health-worker/casefiles/${motherId}/export-pdf`,
        authConfig({ responseType: "blob" }),
      );
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${profile.patient_id || "mother"}-casefile.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.message || "Unable to export the casefile PDF." });
    } finally {
      setExporting(false);
    }
  };

  const printDocument = (documentItem) => {
    if (!documentItem.file_url) return;
    window.open(documentItem.file_url, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return (
      <HealthWorkerShell>
        <div className="flex min-h-screen items-center justify-center bg-[#f7f9fc] text-slate-500">
          <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
          Loading mother detail record...
        </div>
      </HealthWorkerShell>
    );
  }

  return (
    <HealthWorkerShell>
      <div className="min-h-screen overflow-x-hidden bg-[#f7f9fc] px-4 py-5 text-slate-950 sm:px-6 sm:py-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1500px] space-y-6">
          <header className="flex flex-col justify-between gap-4 border-b border-slate-300 pb-5 lg:flex-row lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
                <Link href="/health-worker/mothers" className="inline-flex items-center gap-1 text-pink-600 hover:text-pink-700">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Mothers Casefiles
                </Link>
                <ChevronRight className="h-3.5 w-3.5" />
                <span>{profile.patient_id || "Detail Record"}</span>
              </div>
              <h1 className="mt-3 text-xl font-extrabold text-slate-950">Mother Care Summary</h1>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                A simplified view of clinical status, care progress, and patient records.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/health-worker/mothers")}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 transition hover:border-pink-200 hover:text-pink-600"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Casefiles
            </button>
          </header>

          {notice && (
            <div className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-bold ${
              notice.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}>
              <span>{notice.text}</span>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {!casefile ? (
            <section className="flex min-h-96 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-center">
              <AlertTriangle className="h-10 w-10 text-red-400" />
              <h2 className="mt-4 text-lg font-extrabold text-slate-900">Casefile unavailable</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">This record could not be loaded for the current Program Staff account.</p>
            </section>
          ) : (
            <>
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
                    {profile.profile_photo_url ? (
                      <div
                        aria-label={`${profile.name} profile`}
                        className="h-24 w-24 shrink-0 rounded-full border-4 border-pink-100 bg-cover bg-center"
                        role="img"
                        style={{ backgroundImage: `url(${profile.profile_photo_url})` }}
                      />
                    ) : (
                      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-4 border-pink-100 bg-pink-600 text-2xl font-extrabold text-white">
                        {profile.initials || "M"}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-xl font-extrabold text-slate-950">{profile.name}</h2>
                        <span className={`rounded-md border px-2.5 py-1 text-[10px] font-extrabold uppercase ${riskStyles[profile.risk_level] || riskStyles.low}`}>
                          {profile.risk_label || "Low Risk"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-extrabold text-pink-600">{profile.patient_id}</p>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-slate-500">
                        <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4" />{profile.phone || "No contact number"}</span>
                        <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{profile.address || "No address recorded"}</span>
                        <span className="inline-flex items-center gap-1.5"><UserRound className="h-4 w-4" />{profile.assigned_health_worker || "Unassigned"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 xl:max-w-[520px]">
                    <button type="button" onClick={openEdit} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 transition hover:border-pink-200 hover:bg-pink-50 hover:text-pink-600">
                      <Edit3 className="h-4 w-4" />
                      Edit Information
                    </button>
                    <button type="button" onClick={openSchedule} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 transition hover:border-pink-200 hover:bg-pink-50 hover:text-pink-600">
                      <CalendarPlus className="h-4 w-4" />
                      Schedule Visit
                    </button>
                    <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 transition hover:border-pink-200 hover:bg-pink-50 hover:text-pink-600">
                      <Printer className="h-4 w-4" />
                      Print Record
                    </button>
                    <button type="button" onClick={exportPdf} disabled={exporting} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-extrabold text-white transition hover:bg-slate-800 disabled:bg-slate-400">
                      {exporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Export PDF
                    </button>
                  </div>
                </div>

                <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Age", profile.age ? `${profile.age} years old` : "Not provided"],
                    ["Blood Type", profile.blood_type || "Not provided"],
                    ["Pregnancy Status", profile.pregnancy_status_label || "Not provided"],
                    ["Current Trimester", profile.current_trimester || "Not provided"],
                    ["Estimated Due Date", formatDate(profile.due_date)],
                    ["Next Appointment", formatDate(profile.next_scheduled_visit)],
                    ["Previous Deliveries", profile.previous_deliveries ?? "Not recorded"],
                    ["Co-monitoring", profile.co_monitoring_person || "Not provided"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">{label}</dt>
                      <dd className="mt-1 text-sm font-extrabold text-slate-900">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard icon={HeartPulse} label="Care Status" value={overview.current_pregnancy_status || "Not provided"} detail={overview.current_trimester || "Trimester not provided"} tone="border-pink-200 bg-pink-50 text-pink-700" />
                <SummaryCard icon={ShieldCheck} label="Risk Assessment" value={overview.risk_assessment?.label || "Low Risk"} detail="Updated by monitoring records" tone={riskStyles[overview.risk_assessment?.level] || riskStyles.low} />
                <SummaryCard icon={Clock3} label="Next Appointment" value={formatDate(overview.next_scheduled_appointment)} detail="Scheduled prenatal follow-up" tone="border-slate-200 bg-white text-slate-800" />
                <SummaryCard icon={Activity} label="Care Completion" value={`${overview.maternal_care_completion_percentage || 0}%`} detail="Monitoring, documents, and learning" tone="border-emerald-200 bg-emerald-50 text-emerald-700" progress={overview.maternal_care_completion_percentage || 0} />
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                <div className="grid gap-2 sm:grid-cols-5">
                  {detailTabs.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setActiveTab(tab.value)}
                      className={`flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-extrabold transition ${
                        activeTab === tab.value
                          ? "bg-pink-600 text-white shadow-sm"
                          : "text-slate-600 hover:bg-pink-50 hover:text-pink-600"
                      }`}
                    >
                      <span>{tab.label}</span>
                      {tab.count !== null && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                          activeTab === tab.value ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {activeTab === "monitoring" && (
              <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <SectionHeader
                  eyebrow="Patient Monitoring"
                  title="Maternal Monitoring Records"
                  detail="Chronological clinical records from the database."
                  action={(
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={openVitals} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-pink-600 px-3 text-[11px] font-extrabold text-white transition hover:bg-pink-700">
                        <Stethoscope className="h-3.5 w-3.5" />
                        Update Vitals
                      </button>
                      <div className="flex flex-wrap gap-1.5">
                        {monitorFilters.map((filter) => (
                          <button
                            key={filter.value}
                            type="button"
                            onClick={() => setMonitorFilter(filter.value)}
                            className={`h-8 rounded-lg border px-2.5 text-[11px] font-extrabold transition ${
                              monitorFilter === filter.value
                                ? "border-pink-500 bg-pink-600 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:border-pink-200 hover:text-pink-600"
                            }`}
                          >
                            {filter.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                />

                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
                  {filteredMonitoringRecords.length === 0 ? (
                    <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-center">
                      <Stethoscope className="h-8 w-8 text-slate-300" />
                      <p className="mt-3 text-sm font-extrabold text-slate-700">No monitoring records in this filter</p>
                    </div>
                  ) : (
                    <div className="max-h-[440px] space-y-2 overflow-y-auto pr-1">
                      {filteredMonitoringRecords.map((record) => (
                        <article key={record.id} className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm transition hover:border-pink-100 hover:bg-pink-50/20">
                          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                            <div className="min-w-0">
                              <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{formatDate(record.monitoring_date)}</p>
                              <h3 className="mt-0.5 text-sm font-extrabold text-slate-950">Gestational Week {record.gestational_week}</h3>
                              <p className="mt-0.5 text-[11px] font-bold text-slate-500">Recorded by {record.recorded_by}</p>
                            </div>
                            <span className={`w-fit shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase ${riskStyles[record.risk_level] || riskStyles.low}`}>
                              {record.risk_label}
                            </span>
                          </div>

                          <div className="mt-2.5 grid gap-1.5 sm:grid-cols-3 xl:grid-cols-6">
                            <div className="rounded-md bg-slate-50 px-2.5 py-2"><p className="text-[10px] font-bold text-slate-400">Weight</p><p className="mt-0.5 text-sm font-extrabold">{metric(record.weight_kg, " kg")}</p></div>
                            <div className="rounded-md bg-slate-50 px-2.5 py-2"><p className="text-[10px] font-bold text-slate-400">Blood Pressure</p><p className="mt-0.5 text-sm font-extrabold">{record.blood_pressure || "Not recorded"}</p></div>
                            <div className="rounded-md bg-slate-50 px-2.5 py-2"><p className="text-[10px] font-bold text-slate-400">Temperature</p><p className="mt-0.5 text-sm font-extrabold">{metric(record.temperature_c, " C")}</p></div>
                            <div className="rounded-md bg-slate-50 px-2.5 py-2"><p className="text-[10px] font-bold text-slate-400">Heart Rate</p><p className="mt-0.5 text-sm font-extrabold">{metric(record.heart_rate, " bpm")}</p></div>
                            <div className="rounded-md bg-slate-50 px-2.5 py-2"><p className="text-[10px] font-bold text-slate-400">Blood Sugar</p><p className="mt-0.5 text-sm font-extrabold">{metric(record.blood_sugar_mgdl, " mg/dL")}</p></div>
                            <div className="rounded-md bg-slate-50 px-2.5 py-2"><p className="text-[10px] font-bold text-slate-400">Hemoglobin</p><p className="mt-0.5 text-sm font-extrabold">{metric(record.hemoglobin_gdl, " g/dL")}</p></div>
                          </div>

                          <div className="mt-2.5 grid gap-1.5 lg:grid-cols-2">
                            <div className="rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5">
                              <p className="text-[10px] font-extrabold uppercase text-slate-400">Reported Symptoms</p>
                              <p className="mt-0.5 max-h-14 overflow-y-auto pr-1 text-xs font-semibold leading-5 text-slate-700">
                                {record.reported_symptoms?.length ? record.reported_symptoms.join(", ") : "No symptoms reported"}
                              </p>
                            </div>
                            <div className="rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5">
                              <p className="text-[10px] font-extrabold uppercase text-slate-400">Program Staff Notes</p>
                              <p className="mt-0.5 max-h-14 overflow-y-auto pr-1 text-xs font-semibold leading-5 text-slate-700">{record.notes || "No notes recorded"}</p>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </section>
              )}

              {activeTab === "overview" && (
              <section className="space-y-5">
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-950">Maternal Vital Signs</h2>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        Latest pregnancy threshold indicators for {profile.name || "this patient"}
                      </p>
                    </div>
                    <button type="button" onClick={openVitals} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 text-xs font-extrabold text-white transition hover:bg-pink-700">
                      <Stethoscope className="h-3.5 w-3.5" />
                      Update Vitals
                    </button>
                  </div>
                  <div className="mt-3 border-t border-slate-900 pt-3">
                    <div className="grid gap-3 lg:grid-cols-2">
                      {vitalSigns.map((vital) => (
                        <VitalSignCard key={vital.title} {...vital} />
                      ))}
                    </div>
                  </div>
                  <div className={`mt-3 flex items-center gap-3 rounded-lg border px-3 py-2.5 text-xs font-extrabold ${
                    allVitalsNormal
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}>
                    <Stethoscope className="h-5 w-5 shrink-0" />
                    <span>
                      {allVitalsNormal
                        ? "All available maternal indicators are within healthy pregnancy thresholds."
                        : "One or more maternal indicators needs review or an updated monitoring entry."}
                    </span>
                  </div>
                </div>

                <SectionHeader
                  eyebrow="Statistics"
                  title="Maternal Health Progress"
                  detail="Charts and indicators update from stored monitoring records and uploaded documents."
                />
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {(statistics.summary_cards || []).map((card) => (
                    <SummaryCard
                      key={card.label}
                      icon={card.label.includes("Missed") ? AlertTriangle : ClipboardList}
                      label={card.label}
                      value={card.value}
                      detail={card.detail}
                      progress={card.percentage}
                      tone="border-slate-200 bg-white text-slate-800"
                    />
                  ))}
                </div>
                <div className="grid min-w-0 gap-5 xl:grid-cols-2">
                  <TrendChart
                    title="Weight Progression"
                    data={weightTrend}
                    emptyLabel="No weight records available"
                    ySuffix=" kg"
                    minPadding={2}
                    series={[{ key: "value", label: "Weight (kg)", color: "#db2777" }]}
                  />
                  <TrendChart
                    title="Blood Pressure Trends"
                    data={bloodPressureTrend}
                    emptyLabel="No blood pressure records available"
                    minPadding={8}
                    series={[
                      { key: "systolic", label: "Systolic", color: "#dc2626" },
                      { key: "diastolic", label: "Diastolic", color: "#2563eb" },
                    ]}
                  />
                </div>
              </section>
              )}

              {activeTab === "learning" && (
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <SectionHeader
                  eyebrow="INAY Kaalaman"
                  title="Learning Progress"
                  detail={`${learning.completed_modules || 0}/${learning.total_modules || 0} modules completed`}
                  action={(
                    <div className="w-full max-w-xs">
                      <div className="flex items-center justify-between text-xs font-extrabold text-slate-500">
                        <span>Overall Progress</span>
                        <span>{learning.overall_percentage || 0}%</span>
                      </div>
                      <div className="mt-2"><ProgressBar value={learning.overall_percentage || 0} /></div>
                    </div>
                  )}
                />

                <div className="mt-5 space-y-5">
                  {learningCategoryOrder.map((categoryKey) => {
                    const category = learning.categories?.[categoryKey];
                    if (!category) return null;

                    return (
                      <div key={categoryKey}>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                          <div>
                            <h3 className="font-extrabold text-slate-950">{category.label}</h3>
                            <p className="text-xs font-bold text-slate-500">{category.completed_modules}/{category.total_modules} modules completed</p>
                          </div>
                          <span className="text-sm font-extrabold text-pink-600">{category.progress_percentage}%</span>
                        </div>

                        {category.modules.length === 0 ? (
                          <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-400">
                            No modules assigned in this category yet.
                          </div>
                        ) : (
                          <div className="mt-3 grid gap-3 xl:grid-cols-2">
                            {category.modules.map((module) => (
                              <article key={module.id} className="rounded-lg border border-slate-200 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">{module.week_range}</p>
                                    <h4 className="mt-1 font-extrabold text-slate-950">{module.title}</h4>
                                  </div>
                                  {module.is_completed ? (
                                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                                  ) : (
                                    <Clock3 className="h-5 w-5 shrink-0 text-amber-500" />
                                  )}
                                </div>
                                <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                                  <p><span className="font-bold text-slate-400">Status:</span> <span className="font-extrabold">{module.is_completed ? "Completed" : "In Progress"}</span></p>
                                  <p><span className="font-bold text-slate-400">Current:</span> <span className="font-extrabold">{module.current_lesson}</span></p>
                                  <p><span className="font-bold text-slate-400">Completed:</span> <span className="font-extrabold">{module.completed_lessons}</span></p>
                                  <p><span className="font-bold text-slate-400">Remaining:</span> <span className="font-extrabold">{module.remaining_lessons}</span></p>
                                  <p className="sm:col-span-2"><span className="font-bold text-slate-400">Last Viewed:</span> <span className="font-extrabold">{module.last_viewed_lesson || "Not viewed yet"}</span></p>
                                </div>
                                <div className="mt-4">
                                  <div className="mb-2 flex items-center justify-between text-xs font-extrabold text-slate-500">
                                    <span>Module Progress</span>
                                    <span>{module.progress_percentage}%</span>
                                  </div>
                                  <ProgressBar value={module.progress_percentage} />
                                </div>
                                <div className="mt-4 space-y-2">
                                  {module.lessons.map((lesson) => (
                                    <div key={lesson.id} className="flex items-center gap-2 text-sm font-bold text-slate-600">
                                      {lesson.is_completed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
                                      <span>{lesson.title}</span>
                                    </div>
                                  ))}
                                </div>
                              </article>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
              )}

              {activeTab === "overview" && (
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <SectionHeader
                  eyebrow="Pregnancy Timeline"
                  title="Care Journey"
                  detail="Registration, trimester progression, delivery, and postpartum milestones."
                />
                <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {(casefile.pregnancy_timeline || []).map((milestone) => (
                    <li key={milestone.key} className={`rounded-lg border p-3 ${timelineStyles[milestone.status] || timelineStyles.future}`}>
                      <div className="flex items-center justify-between">
                        <span className={`h-2.5 w-2.5 rounded-full ${milestone.status === "future" ? "bg-slate-300" : "bg-current"}`} />
                        <span className="text-[9px] font-extrabold uppercase">{milestone.status}</span>
                      </div>
                      <h3 className="mt-3 text-sm font-extrabold">{milestone.label}</h3>
                      <p className="mt-1 text-[11px] font-semibold opacity-80">{milestone.caption}</p>
                      {milestone.date && <p className="mt-2 text-[11px] font-extrabold">{formatDate(milestone.date)}</p>}
                    </li>
                  ))}
                </ol>
              </section>
              )}

              {activeTab === "documents" && (
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <SectionHeader
                  eyebrow="Medical Documents"
                  title="Uploaded Records"
                  detail="Laboratory results, ultrasound reports, prescriptions, referrals, health book, and vaccination records."
                />
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {(medicalDocuments.expected_types || []).map((type) => {
                    const docs = documentsByType[type.type] || [];

                    return (
                      <article key={type.type} className="rounded-lg border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-50 text-pink-600">
                              {type.type === "vaccination" ? <Syringe className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                            </div>
                            <div>
                              <h3 className="font-extrabold text-slate-950">{type.label}</h3>
                              <p className="text-xs font-bold text-slate-500">{type.count} uploaded</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2">
                          {docs.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm font-bold text-slate-400">
                              No document uploaded
                            </div>
                          ) : docs.map((documentItem) => (
                            <div key={documentItem.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                              <p className="font-extrabold text-slate-900">{documentItem.filename}</p>
                              <p className="mt-1 text-xs font-semibold text-slate-500">{formatDate(documentItem.record_date)} {documentItem.module_title ? `- ${documentItem.module_title}` : ""}</p>
                              {documentItem.notes && <p className="mt-2 text-sm font-semibold text-slate-600">{documentItem.notes}</p>}
                              <div className="mt-3 flex flex-wrap gap-2">
                                <a href={documentItem.file_url || "#"} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 hover:text-pink-600">
                                  <Eye className="h-3.5 w-3.5" />
                                  View
                                </a>
                                <button type="button" onClick={() => printDocument(documentItem)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 hover:text-pink-600">
                                  <Printer className="h-3.5 w-3.5" />
                                  Print
                                </button>
                                <a href={documentItem.file_url || "#"} download className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 hover:text-pink-600">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Download
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
              )}

              {activeTab === "notes" && (
              <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <SectionHeader eyebrow="Clinical Notes" title="Create Patient Note" detail="Notes are stored with author and timestamp." />
                  <form onSubmit={saveNote} className="mt-4">
                    <textarea
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      rows={7}
                      placeholder="Write clinical observation, instruction, or follow-up note..."
                      className="w-full resize-none rounded-lg border border-slate-300 bg-white p-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
                    />
                    <button type="submit" disabled={savingNote || !noteDraft.trim()} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-pink-600 px-5 text-sm font-extrabold text-white transition hover:bg-pink-700 disabled:bg-pink-300">
                      {savingNote ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Clinical Note
                    </button>
                  </form>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <SectionHeader eyebrow="Clinical Notes" title="Review Notes" detail={`${clinicalNotes.length} note${clinicalNotes.length === 1 ? "" : "s"} recorded`} />
                  <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
                    {clinicalNotes.length === 0 ? (
                      <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center">
                        <NotebookPen className="h-9 w-9 text-slate-300" />
                        <p className="mt-3 text-sm font-extrabold text-slate-700">No clinical notes yet</p>
                      </div>
                    ) : clinicalNotes.map((note) => (
                      <article key={note.id} className="rounded-lg border border-slate-200 p-4">
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                          <div>
                            <p className="font-extrabold text-slate-950">{note.author}</p>
                            <p className="text-xs font-bold text-slate-500">{formatDateTime(note.created_at)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNoteId(note.id);
                              setEditingNoteBody(note.body);
                            }}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-extrabold text-slate-600 hover:text-pink-600"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        </div>
                        {editingNoteId === note.id ? (
                          <div className="mt-3">
                            <textarea
                              value={editingNoteBody}
                              onChange={(event) => setEditingNoteBody(event.target.value)}
                              rows={4}
                              className="w-full resize-none rounded-lg border border-slate-300 p-3 text-sm font-semibold outline-none focus:border-pink-500"
                            />
                            <div className="mt-2 flex gap-2">
                              <button type="button" onClick={() => saveEditedNote(note.id)} disabled={savingNote} className="inline-flex h-9 items-center gap-2 rounded-lg bg-pink-600 px-4 text-xs font-extrabold text-white hover:bg-pink-700 disabled:bg-pink-300">
                                <Save className="h-3.5 w-3.5" />
                                Save
                              </button>
                              <button type="button" onClick={() => setEditingNoteId(null)} className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-extrabold text-slate-600 hover:bg-slate-50">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">{note.body}</p>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              </section>
              )}

              {activeTab === "overview" && (
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <SectionHeader
                  eyebrow="Activity Timeline"
                  title="Patient Activity"
                  detail="Registration, checkups, monitoring, learning, consultation, scheduling, and risk updates."
                />
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
                  {activityTimeline.length === 0 ? (
                    <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm font-bold text-slate-400">
                      No patient activity recorded yet.
                    </div>
                  ) : (
                    <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                      {activityTimeline.map((activity) => (
                        <article key={activity.id} className="flex gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                          <div className="flex flex-col items-center pt-1">
                            <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${riskAccent[activity.type === "risk_update" ? profile.risk_level : "low"] || "bg-pink-600"}`} />
                            <div className="mt-1 h-full w-px min-h-8 bg-slate-100" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-extrabold text-slate-950">{activity.title}</h3>
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[9px] font-extrabold uppercase text-slate-500">
                                {activity.type.replaceAll("_", " ")}
                              </span>
                            </div>
                            <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{activity.description}</p>
                            <p className="mt-1 text-[11px] font-bold text-slate-400">{formatDateTime(activity.date)}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </section>
              )}
            </>
          )}
        </div>
      </div>

      {isEditOpen && (
        <Modal title="Edit Mother Information" onClose={() => setIsEditOpen(false)}>
          <form onSubmit={saveInformation} className="grid gap-4 px-5 py-5 sm:grid-cols-2">
            {[
              ["name", "Full Name", "text"],
              ["phone", "Contact Number", "text"],
              ["blood_type", "Blood Type", "text"],
              ["pregnancy_week", "Pregnancy Week", "number"],
              ["postpartum_week", "Postpartum Week", "number"],
              ["due_date", "Estimated Due Date", "date"],
              ["next_scheduled_visit", "Next Scheduled Visit", "date"],
              ["co_monitoring_person", "Co-monitoring Person", "text"],
            ].map(([key, label, type]) => (
              <label key={key} className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                {label}
                <input
                  type={type}
                  value={editForm[key]}
                  onChange={(event) => setEditForm({ ...editForm, [key]: event.target.value })}
                  className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
                />
              </label>
            ))}
            <label className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Pregnancy Status
              <select value={editForm.pregnancy_status} onChange={(event) => setEditForm({ ...editForm, pregnancy_status: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold outline-none focus:border-pink-500">
                <option value="not_provided">Not provided</option>
                <option value="pregnant">Pregnant</option>
                <option value="postpartum">Postpartum</option>
              </select>
            </label>
            <label className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Risk Rating
              <select value={editForm.risk_rating} onChange={(event) => setEditForm({ ...editForm, risk_rating: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold outline-none focus:border-pink-500">
                <option value="low">Low Risk</option>
                <option value="medium">Moderate Risk</option>
                <option value="high">High Risk</option>
              </select>
            </label>
            <label className="text-xs font-extrabold uppercase tracking-wide text-slate-500 sm:col-span-2">
              Address
              <textarea value={editForm.address} onChange={(event) => setEditForm({ ...editForm, address: event.target.value })} rows={3} className="mt-1 w-full resize-none rounded-lg border border-slate-300 p-3 text-sm font-bold outline-none focus:border-pink-500" />
            </label>
            <footer className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:col-span-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setIsEditOpen(false)} className="h-11 rounded-lg border border-slate-300 px-5 text-sm font-extrabold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={savingInfo} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-pink-600 px-5 text-sm font-extrabold text-white hover:bg-pink-700 disabled:bg-pink-300">
                {savingInfo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Information
              </button>
            </footer>
          </form>
        </Modal>
      )}

      {isScheduleOpen && (
        <Modal title="Schedule Visit" onClose={() => setIsScheduleOpen(false)}>
          <form onSubmit={saveSchedule} className="px-5 py-5">
            <label className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Next Scheduled Visit
              <input
                type="date"
                required
                value={scheduleDate}
                onChange={(event) => setScheduleDate(event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
              />
            </label>
            <footer className="mt-5 flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setIsScheduleOpen(false)} className="h-11 rounded-lg border border-slate-300 px-5 text-sm font-extrabold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={savingInfo} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-pink-600 px-5 text-sm font-extrabold text-white hover:bg-pink-700 disabled:bg-pink-300">
                {savingInfo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                Save Schedule
              </button>
            </footer>
          </form>
        </Modal>
      )}

      {isVitalsOpen && (
        <Modal title="Update Maternal Vitals" onClose={() => setIsVitalsOpen(false)}>
          <form onSubmit={saveVitals} className="px-5 py-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {vitalEntryFields.map(([key, label, type]) => (
                <label key={key} className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  {label}
                  <input
                    type={type}
                    required={key === "pregnancy_week"}
                    min={key === "pregnancy_week" ? 1 : undefined}
                    max={key === "pregnancy_week" ? 42 : undefined}
                    step={key.includes("weight") || key.includes("sugar") || key.includes("hemoglobin") || key.includes("temperature") ? "0.1" : "1"}
                    value={vitalsForm[key]}
                    onChange={(event) => setVitalsForm({ ...vitalsForm, [key]: event.target.value })}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
                  />
                </label>
              ))}
              <label className="text-xs font-extrabold uppercase tracking-wide text-slate-500 sm:col-span-2">
                Program Staff Notes
                <textarea
                  value={vitalsForm.notes}
                  onChange={(event) => setVitalsForm({ ...vitalsForm, notes: event.target.value })}
                  rows={3}
                  placeholder="Document symptoms, advice, referral, or follow-up instructions..."
                  className="mt-1 w-full resize-none rounded-lg border border-slate-300 p-3 text-sm font-semibold normal-case outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
                />
              </label>
            </div>
            <footer className="mt-5 flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setIsVitalsOpen(false)} className="h-11 rounded-lg border border-slate-300 px-5 text-sm font-extrabold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={savingVitals} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-pink-600 px-5 text-sm font-extrabold text-white hover:bg-pink-700 disabled:bg-pink-300">
                {savingVitals ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Vitals
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </HealthWorkerShell>
  );
}
