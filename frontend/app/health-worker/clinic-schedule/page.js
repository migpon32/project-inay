"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import {
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  Clock3,
  LoaderCircle,
  Save,
  Search,
  UserRound,
  X,
} from "lucide-react";
import HealthWorkerShell from "../../components/HealthWorkerShell";
import { getAuthToken } from "../../utils/authSession";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

const authConfig = () => ({
  headers: { Authorization: `Bearer ${getAuthToken()}` },
});

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

const parseDate = (value) => {
  if (!value) return null;

  const date = new Date(String(value).includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateKey = (value) => {
  const date = parseDate(value);
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDate = (value) => {
  const date = parseDate(value);
  if (!date) return "Not scheduled";

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const visitStatus = (date) => {
  const visitDate = dateKey(date);
  if (!visitDate) return "unscheduled";

  const today = todayValue();
  if (visitDate < today) return "overdue";
  if (visitDate === today) return "today";
  return "scheduled";
};

const statusStyles = {
  scheduled: "border-blue-200 bg-blue-50 text-blue-700",
  today: "border-amber-200 bg-amber-50 text-amber-700",
  overdue: "border-rose-200 bg-rose-50 text-rose-700",
  unscheduled: "border-slate-200 bg-slate-50 text-slate-600",
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

function SummaryTile({ icon: Icon, label, value, tone }) {
  return (
    <div className={`min-w-0 rounded-lg border px-4 py-3 ${tone}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em]">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function ScheduleRow({ mother, draftDate, saving, onDateChange, onSave }) {
  const status = visitStatus(mother.next_scheduled_visit);

  return (
    <article className="grid min-w-0 gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto] xl:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-pink-100 bg-pink-50 text-sm font-extrabold text-pink-600">
          {mother.initials || "M"}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-extrabold text-slate-950">{mother.name}</h2>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-extrabold uppercase text-slate-600">
              {mother.patient_id}
            </span>
          </div>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {mother.barangay || mother.address || "Location not provided"}
          </p>
        </div>
      </div>

      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">Current Schedule</p>
        <p className="mt-1 text-sm font-extrabold text-slate-900">{formatDate(mother.next_scheduled_visit)}</p>
        <span className={`mt-2 inline-flex rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase ${statusStyles[status]}`}>
          {status}
        </span>
      </div>

      <form onSubmit={(event) => onSave(event, mother)} className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
          Clinic Date
          <input
            required
            type="date"
            min={todayValue()}
            value={draftDate}
            onChange={(event) => onDateChange(mother.id, event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 text-xs font-extrabold uppercase text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300"
        >
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </form>

      <Link
        href={`/health-worker/mothers/${mother.id}`}
        className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-xs font-extrabold uppercase text-slate-700 hover:border-pink-200 hover:bg-pink-50 hover:text-pink-600"
      >
        Open Case File
      </Link>
    </article>
  );
}

export default function ClinicSchedulePage() {
  const [mothers, setMothers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState("");
  const [scheduleDrafts, setScheduleDrafts] = useState({});
  const [savingMotherId, setSavingMotherId] = useState(null);

  const loadMothers = useCallback(async () => {
    setLoading(true);

    try {
      const response = await axios.get(`${API_BASE_URL}/health-worker/casefiles`, authConfig());
      setMothers(response.data.mothers || []);
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.message || "Unable to load clinic schedules.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMothers();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadMothers]);

  const filteredMothers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = query
      ? mothers.filter((mother) => (
        mother.name.toLowerCase().includes(query)
        || mother.patient_id?.toLowerCase().includes(query)
        || mother.barangay?.toLowerCase().includes(query)
        || mother.phone?.toLowerCase().includes(query)
      ))
      : mothers;

    return rows.slice().sort((left, right) => {
      const leftDate = dateKey(left.next_scheduled_visit) || "9999-12-31";
      const rightDate = dateKey(right.next_scheduled_visit) || "9999-12-31";
      return leftDate.localeCompare(rightDate) || left.name.localeCompare(right.name);
    });
  }, [mothers, search]);

  const summary = useMemo(() => {
    const today = todayValue();

    return {
      scheduled: mothers.filter((mother) => dateKey(mother.next_scheduled_visit)).length,
      dueToday: mothers.filter((mother) => dateKey(mother.next_scheduled_visit) === today).length,
      overdue: mothers.filter((mother) => {
        const visitDate = dateKey(mother.next_scheduled_visit);
        return visitDate && visitDate < today;
      }).length,
      unscheduled: mothers.filter((mother) => !dateKey(mother.next_scheduled_visit)).length,
    };
  }, [mothers]);

  const updateDraft = (motherId, value) => {
    setScheduleDrafts((current) => ({ ...current, [motherId]: value }));
  };

  const saveSchedule = async (event, mother) => {
    event.preventDefault();
    const nextDate = scheduleDrafts[mother.id] ?? mother.next_scheduled_visit ?? "";
    if (!nextDate) return;

    setSavingMotherId(mother.id);

    try {
      const response = await axios.patch(
        `${API_BASE_URL}/health-worker/casefiles/${mother.id}/schedule-visit`,
        { next_scheduled_visit: nextDate },
        authConfig(),
      );
      const savedDate = response.data.casefile?.profile?.next_scheduled_visit || nextDate;

      setMothers((current) => current.map((item) => (
        String(item.id) === String(mother.id)
          ? { ...item, next_scheduled_visit: savedDate }
          : item
      )));
      setScheduleDrafts((current) => ({ ...current, [mother.id]: savedDate }));
      setNotice({ type: "success", text: response.data.message });
    } catch (error) {
      const validationMessage = Object.values(error.response?.data?.errors || {}).flat()[0];
      setNotice({
        type: "error",
        text: validationMessage || error.response?.data?.message || "Unable to save clinic schedule.",
      });
    } finally {
      setSavingMotherId(null);
    }
  };

  return (
    <HealthWorkerShell>
      <div className="mx-auto min-h-screen w-full max-w-[1500px] overflow-x-hidden px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <header className="border-b border-slate-300 pb-5">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">
            Program Staff <span className="px-2 text-slate-300">-</span>
            <span className="text-pink-600">Clinic Schedule</span>
          </p>
          <div className="mt-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold text-slate-950 sm:text-2xl">Clinic Schedule</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Schedule and track upcoming clinic visits for assigned maternal casefiles.
              </p>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryTile icon={CalendarCheck} label="Scheduled" value={summary.scheduled} tone="border-blue-200 bg-blue-50 text-blue-800" />
              <SummaryTile icon={Clock3} label="Today" value={summary.dueToday} tone="border-amber-200 bg-amber-50 text-amber-800" />
              <SummaryTile icon={AlertTriangle} label="Overdue" value={summary.overdue} tone="border-rose-200 bg-rose-50 text-rose-800" />
              <SummaryTile icon={CalendarDays} label="Unscheduled" value={summary.unscheduled} tone="border-slate-200 bg-white text-slate-800" />
            </div>
          </div>
        </header>

        <Notice notice={notice} onClose={() => setNotice(null)} />

        <section className="pt-5">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">
                <UserRound className="h-4 w-4 text-pink-600" />
                Assigned Mothers ({filteredMothers.length})
              </p>
            </div>
            <label className="relative block min-w-0 sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search mother or barangay..."
                className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400 focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
              />
            </label>
          </div>

          {loading ? (
            <div className="flex min-h-72 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-500">
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
              Loading clinic schedule...
            </div>
          ) : filteredMothers.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
              <CalendarDays className="h-11 w-11 text-pink-300" />
              <h2 className="mt-4 text-lg font-extrabold text-slate-950">No clinic schedule records found</h2>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMothers.map((mother) => (
                <ScheduleRow
                  key={mother.id}
                  mother={mother}
                  draftDate={scheduleDrafts[mother.id] ?? mother.next_scheduled_visit ?? ""}
                  saving={String(savingMotherId) === String(mother.id)}
                  onDateChange={updateDraft}
                  onSave={saveSchedule}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </HealthWorkerShell>
  );
}
