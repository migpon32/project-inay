"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Baby,
  CalendarDays,
  FileBarChart,
  Grid2X2,
  Info,
  LogOut,
  Menu,
  MessageSquare,
  Users,
  X,
} from "lucide-react";
import useCurrentUser from "../hooks/useCurrentUser";
import useConsultationUnread from "../hooks/useConsultationUnread";
import { clearAuthSession, getAuthToken } from "../utils/authSession";

const navigationItems = [
  { label: "Monitor Desk", icon: Grid2X2, href: "/health-worker" },
  { label: "Mothers Casefiles", icon: Users, href: "/health-worker/mothers" },
  { label: "Neonatal & Vaccines", icon: Baby, href: "/health-worker/neonatal-vaccines" },
  { label: "Clinic Schedule", icon: CalendarDays, href: "/health-worker/clinic-schedule" },
  { label: "Telehealth Messages", icon: MessageSquare, href: "/health-worker/messages" },
  { label: "Dynamic Reports", icon: FileBarChart, href: "/health-worker/reports" },
];

export default function HealthWorkerShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, userName, initials } = useCurrentUser();
  const consultationUnread = useConsultationUnread();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const token = getAuthToken();

    if (!token) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    const hasHealthcareWorkerProfile = user?.healthcare_worker || user?.healthcareWorker;
    const profileDataLoaded = user && (
      Object.prototype.hasOwnProperty.call(user, "healthcare_worker")
      || Object.prototype.hasOwnProperty.call(user, "healthcareWorker")
    );

    if (profileDataLoaded && !hasHealthcareWorkerProfile) {
      router.replace("/dashboard");
    }
  }, [router, user]);

  const logout = () => {
    clearAuthSession();
    router.push("/login");
  };

  return (
    <div className="inay-readable-workspace min-h-screen overflow-x-hidden bg-[#f7f9fc] text-slate-950">
      <header className="fixed inset-x-0 top-0 z-40 h-[68px] border-b border-pink-100 bg-white">
        <div className="flex h-full min-w-0 items-center justify-between gap-3 px-4 md:gap-4 md:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-lg p-2 text-pink-600 transition hover:bg-pink-50 md:hidden"
              aria-label="Open program staff navigation"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-pink-100 bg-pink-50">
              <Info className="h-5 w-5 text-pink-600" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold tracking-tight text-slate-950">INAY Health</p>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-pink-600">
                Program Staff Portal
              </p>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2 md:gap-4">
            <div className="hidden text-right sm:block">
              <p className="max-w-[34vw] truncate text-sm font-extrabold text-slate-950 lg:max-w-none">{userName}</p>
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-pink-600">
                Program Staff
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-600 text-xs font-extrabold text-white shadow-sm">
              {initials}
            </div>
            <button
              type="button"
              onClick={logout}
              className="hidden items-center gap-2 rounded-xl border border-pink-200 px-4 py-2 text-xs font-extrabold text-pink-600 transition hover:bg-pink-50 sm:inline-flex"
            >
              <LogOut className="h-4 w-4" />
              Log Out Portal
            </button>
          </div>
        </div>
      </header>

      {isSidebarOpen && (
        <button
          type="button"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          aria-label="Close program staff navigation"
        />
      )}

      <aside className={`fixed bottom-0 left-0 top-[68px] z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:translate-x-0 ${
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <div className="flex items-center justify-between px-5 pb-4 pt-6">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-400">
            Program Staff Command
          </p>
          <Grid2X2 className="h-4 w-4 text-pink-600" />
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-50 md:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          <ul className="space-y-1.5">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.href
                ? pathname === item.href || (item.href !== "/health-worker" && pathname.startsWith(`${item.href}/`))
                : false;
              const itemClassName = `flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold transition ${
                isActive
                  ? "border border-pink-100 bg-pink-50 text-pink-600"
                  : "text-slate-700 hover:bg-slate-50 hover:text-pink-600"
              }`;

              return (
                <li key={item.label}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      onClick={() => setIsSidebarOpen(false)}
                      className={itemClassName}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                      {item.label === "Telehealth Messages" && consultationUnread > 0 && (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-pink-600 px-1 text-[10px] font-extrabold text-white">
                          {consultationUnread > 99 ? "99+" : consultationUnread}
                        </span>
                      )}
                    </Link>
                  ) : (
                    <button type="button" className={itemClassName}>
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="space-y-3 border-t border-slate-100 p-4">
          <div className="rounded-xl border border-pink-100 bg-pink-50/70 p-3">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-pink-600">
              Program Staff Access
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
              Secure clinical portal
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-extrabold text-red-600 transition hover:bg-red-100 sm:hidden"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      <main className="min-h-screen min-w-0 overflow-x-hidden pt-[68px] md:ml-64" aria-label="Program staff workspace">
        {children}
      </main>
    </div>
  );
}
