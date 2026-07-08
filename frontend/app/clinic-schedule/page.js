"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  CalendarDays,
  Clock3,
  FileText,
  Hospital,
  MessageCircle,
} from "lucide-react";
import useCurrentUser from "../hooks/useCurrentUser";

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

const formatDate = (value, fallback = "Not scheduled") => {
  const date = parseDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const scheduleState = (date) => {
  if (!date) {
    return {
      label: "Awaiting schedule",
      detail: "Program Staff has not set the next clinic visit yet.",
      tone: "border-slate-200 bg-white text-slate-800",
      accent: "text-slate-500",
    };
  }

  const today = todayValue();
  if (date < today) {
    return {
      label: "Follow-up needed",
      detail: "This scheduled date has passed. Message Program Staff for the next clinic date.",
      tone: "border-rose-200 bg-rose-50 text-rose-800",
      accent: "text-rose-600",
    };
  }

  if (date === today) {
    return {
      label: "Clinic visit today",
      detail: "Your scheduled clinic visit is today.",
      tone: "border-amber-200 bg-amber-50 text-amber-800",
      accent: "text-amber-600",
    };
  }

  return {
    label: "Scheduled",
    detail: "Your next clinic visit is set by Program Staff.",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    accent: "text-emerald-600",
  };
};

export default function ClinicSchedulePage() {
  const { user } = useCurrentUser();

  const mother = user?.mother || {};
  const loading = !user;
  const nextVisit = dateKey(mother.next_scheduled_visit);
  const state = useMemo(() => scheduleState(nextVisit), [nextVisit]);

  return (
    <div className="min-h-screen bg-[#fbfbfc] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="border-b border-pink-100 pb-5">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-pink-600">Mother Portal / Clinic Schedule</p>
            <h1 className="mt-2 text-2xl font-extrabold text-slate-950">Clinic Schedule</h1>
          </header>

          {loading ? (
            <ClinicScheduleSkeleton />
          ) : (
            <>
              <section className={`rounded-lg border p-5 shadow-sm ${state.tone}`}>
                <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="flex min-w-0 gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/70 bg-white/70">
                      <CalendarDays className={`h-6 w-6 ${state.accent}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold uppercase tracking-[0.14em] opacity-75">{state.label}</p>
                      <h2 className="mt-2 text-2xl font-extrabold">{formatDate(nextVisit)}</h2>
                      <p className="mt-2 text-sm font-semibold leading-6 opacity-90">{state.detail}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/70 bg-white/70 px-4 py-3 text-sm font-extrabold">
                    <p className="text-[10px] uppercase tracking-[0.14em] opacity-60">Mother ID</p>
                    <p className="mt-1">{mother.id ? `MAT-RHU-${String(mother.id).padStart(3, "0")}` : "N/A"}</p>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <CalendarCheck className="h-5 w-5 text-pink-600" />
                  <p className="mt-3 text-xs font-extrabold uppercase text-slate-400">Pregnancy Week</p>
                  <p className="mt-1 text-xl font-extrabold text-slate-950">{mother.pregnancy_week || "N/A"}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <Clock3 className="h-5 w-5 text-blue-600" />
                  <p className="mt-3 text-xs font-extrabold uppercase text-slate-400">Due Date</p>
                  <p className="mt-1 text-xl font-extrabold text-slate-950">{formatDate(mother.due_date, "Not provided")}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <FileText className="h-5 w-5 text-emerald-600" />
                  <p className="mt-3 text-xs font-extrabold uppercase text-slate-400">Barangay</p>
                  <p className="mt-1 text-xl font-extrabold text-slate-950">{mother.barangay || "N/A"}</p>
                </div>
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                <Link href="/consultation" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-pink-600 px-5 text-sm font-extrabold text-white hover:bg-pink-700">
                  <MessageCircle className="h-4 w-4" />
                  Message Program Staff
                </Link>
                <Link href="/health-services" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-extrabold text-slate-700 hover:bg-slate-50">
                  <Hospital className="h-4 w-4" />
                  View Health Services
                </Link>
              </section>
            </>
          )}
        </div>
    </div>
  );
}

function ClinicScheduleSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading schedule">
      <div className="h-36 animate-pulse rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-4 w-32 rounded bg-slate-100" />
        <div className="mt-5 h-8 w-72 max-w-full rounded bg-slate-100" />
        <div className="mt-4 h-4 w-full max-w-xl rounded bg-slate-100" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-5 w-5 rounded bg-slate-100" />
            <div className="mt-4 h-3 w-24 rounded bg-slate-100" />
            <div className="mt-3 h-6 w-32 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
