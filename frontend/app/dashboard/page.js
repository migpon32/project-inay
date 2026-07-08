"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Baby,
  BookOpen,
  CalendarCheck,
  Heart,
  ShieldCheck,
} from "lucide-react";
import useCurrentUser from "../hooks/useCurrentUser";

const summaryCards = [
  {
    label: "Learning Progress",
    value: "0 / 10",
    detail: "INAY Kaalaman months completed",
    icon: BookOpen,
    tone: "text-pink-600 bg-pink-50 border-pink-100",
  },
  {
    label: "Next Checkup",
    value: "RHU Visit",
    detail: "Bring records and prescriptions",
    icon: CalendarCheck,
    tone: "text-blue-600 bg-blue-50 border-blue-100",
  },
  {
    label: "Care Status",
    value: "Active",
    detail: "High-risk protocol monitoring",
    icon: ShieldCheck,
    tone: "text-amber-600 bg-amber-50 border-amber-100",
  },
];

const quickActions = [
  {
    title: "Continue INAY Kaalaman",
    text: "Open your prenatal learning hub and complete monthly guides.",
    href: "/inay-kaalaman",
    icon: BookOpen,
  },
  {
    title: "Maternal Monitoring",
    text: "Review maternal health vitals and prenatal notes.",
    href: "/maternal-monitoring",
    icon: Activity,
  },
  {
    title: "Child Health",
    text: "Access child health records and development reminders.",
    href: "/child-health",
    icon: Baby,
  },
];

export default function Dashboard() {
  const { userName } = useCurrentUser();

  return (
    <div className="min-h-screen overflow-x-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">
          <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="grid min-w-0 gap-6 p-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)] md:p-8">
              <div className="min-w-0">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-pink-50 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-pink-600 ring-1 ring-pink-100">
                  <Heart className="h-4 w-4 fill-pink-500 text-pink-500" />
                  MNCH Innovative Maternal Program
                </div>
                <h1 className="max-w-2xl text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl md:text-4xl">
                  Welcome back, {userName}
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                  Your Project INAY workspace keeps learning modules, prenatal reminders,
                  uploaded records, and health service access in one place.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/inay-kaalaman"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-pink-600 px-5 text-sm font-extrabold text-white shadow-sm transition hover:bg-pink-700"
                  >
                    Open INAY Kaalaman
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/maternal-monitoring"
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
                  >
                    View Monitoring
                  </Link>
                </div>
              </div>

              <div className="min-w-0 rounded-3xl border border-pink-100 bg-pink-50 p-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 shadow-lg">
                  <Heart className="h-7 w-7 fill-pink-500 text-pink-500" />
                </div>
                <h2 className="mt-5 text-xl font-extrabold text-slate-950">
                  Project INAY
                </h2>
                <p className="mt-2 text-sm font-bold uppercase tracking-wide text-pink-600">
                  Mother/User Portal
                </p>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  Innovative Nanay Building Strengthening Maternal, Neonatal and Child Health Program
                </p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {summaryCards.map((card) => {
              const Icon = card.icon;

              return (
                <div key={card.label} className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border ${card.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-slate-500">{card.label}</p>
                  <p className="mt-1 text-2xl font-extrabold text-slate-950">{card.value}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{card.detail}</p>
                </div>
              );
            })}
          </section>

          <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
            <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-end">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-pink-600">
                  Quick Access
                </p>
                <h2 className="mt-1 text-2xl font-extrabold text-slate-950">
                  Continue your care workflow
                </h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-slate-500">
                Choose a module from the sidebar or continue from these common actions.
              </p>
            </div>

            <div className="grid min-w-0 gap-4 lg:grid-cols-3">
              {quickActions.map((action) => {
                const Icon = action.icon;

                return (
                  <Link
                    key={action.title}
                    href={action.href}
                    className="group min-w-0 rounded-3xl border border-slate-200 bg-slate-50 p-5 transition hover:border-pink-200 hover:bg-pink-50"
                  >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-pink-600 ring-1 ring-slate-200 group-hover:ring-pink-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-extrabold text-slate-950">{action.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{action.text}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
    </div>
  );
}
