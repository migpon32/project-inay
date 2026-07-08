"use client";

import { memo, useCallback, useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Baby,
  Bell,
  BookOpen,
  CalendarDays,
  Heart,
  Hospital,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  X,
} from "lucide-react";
import useCurrentUser from "../hooks/useCurrentUser";
import useConsultationUnread from "../hooks/useConsultationUnread";
import useMaternalRiskStatus from "../hooks/useMaternalRiskStatus";
import useMaternalPushNotifications from "../hooks/useMaternalPushNotifications";
import { prefetchApi } from "../hooks/useApiQuery";
import { clearAuthSession, getAuthToken } from "../utils/authSession";
import ProfilePhotoUploadModal, { ProfilePhotoToast } from "./ProfilePhotoUploadModal";

const navItems = [
  { name: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { name: "Maternal Monitoring", icon: Activity, href: "/maternal-monitoring" },
  { name: "Child Health", icon: Baby, href: "/child-health" },
  { name: "Notifications", icon: Bell, href: "/notifications" },
  { name: "Clinic Schedule", icon: CalendarDays, href: "/clinic-schedule" },
  { name: "INAY Kaalaman", icon: BookOpen, href: "/inay-kaalaman" },
  { name: "Health Services", icon: Hospital, href: "/health-services" },
  { name: "Consultation", icon: MessageCircle, href: "/consultation" },
];

const sidebarApiPrefetches = [
  "/user",
  "/maternal-monitoring/status",
  "/maternal-monitoring/me",
  "/child-health/children",
  "/consultations",
  "/consultations/unread-count",
  "/iec/modules",
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

const MotherAvatar = memo(function MotherAvatar({ photoUrl, initials, editable = false, onPickPhoto, size = "md" }) {
  const isLarge = size === "lg";
  const avatarSize = isLarge ? "h-12 w-12" : "h-9 w-9 md:h-10 md:w-10";
  const plusSize = isLarge ? "h-6 w-6" : "h-5 w-5";
  const plusIconSize = isLarge ? "h-3.5 w-3.5" : "h-3 w-3";

  return (
    <div className={`relative shrink-0 ${avatarSize}`}>
      <div className={`flex ${avatarSize} items-center justify-center overflow-hidden rounded-full bg-pink-50 ring-1 ring-pink-100`}>
        {photoUrl ? (
          <div
            role="img"
            aria-label="Mother profile"
            className="h-full w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${photoUrl})` }}
          />
        ) : (
          <span className="text-sm font-extrabold text-pink-600 md:text-base">{initials}</span>
        )}
      </div>
      {editable && (
        <button
          type="button"
          onClick={onPickPhoto}
          className={`absolute -bottom-1 -right-1 flex ${plusSize} items-center justify-center rounded-full border-2 border-white bg-pink-600 text-white shadow-sm hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-300`}
          aria-label="Manage mother profile photo"
          title="Manage mother profile photo"
        >
          <Plus className={plusIconSize} />
        </button>
      )}
    </div>
  );
});

function AppShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [photoNotice, setPhotoNotice] = useState(null);
  const [liveNotice, setLiveNotice] = useState(null);
  const { userName, initials, motherProfilePhotoUrl, updateStoredUser } = useCurrentUser();
  const consultationUnread = useConsultationUnread();
  const maternalRiskStatus = useMaternalRiskStatus();
  const handleLiveNotice = useCallback((notice) => {
    setLiveNotice(notice);
  }, []);
  useMaternalPushNotifications(maternalRiskStatus, { watchPortalEvents: true, onEvent: handleLiveNotice, pollMs: 15000 });

  useEffect(() => {
    navItems.forEach((item) => router.prefetch(item.href));
  }, [router]);

  useEffect(() => {
    const scheduleIdle = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 700));
    const cancelIdle = window.cancelIdleCallback || window.clearTimeout;
    const idleId = scheduleIdle(() => {
      sidebarApiPrefetches.forEach((endpoint) => {
        void prefetchApi(endpoint);
      });
    });

    return () => cancelIdle(idleId);
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setIsSidebarOpen(!mobile);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((isOpen) => !isOpen);
  }, []);

  const handleLogout = useCallback(() => {
    clearAuthSession();
    router.push("/login");
  }, [router]);

  const uploadMotherPhoto = useCallback(async (file) => {
    const formData = new FormData();
    formData.append("photo", file);
    const response = await axios.post(`${API_BASE_URL}/mother/profile-photo`, formData, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    updateStoredUser(response.data.user);
    setPhotoNotice({ type: "success", text: response.data.message });
  }, [updateStoredUser]);

  useEffect(() => {
    if (!liveNotice) return undefined;

    const timer = window.setTimeout(() => setLiveNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [liveNotice]);

  return (
    <div className="inay-readable-workspace min-h-screen overflow-x-hidden bg-[#fafafa] text-slate-900">
      <header className="fixed left-0 right-0 top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 shadow-sm backdrop-blur md:px-8">
        <div className="flex min-w-0 items-center justify-between gap-3 sm:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="rounded-lg p-2 transition-colors hover:bg-rose-100 md:hidden"
              aria-label="Toggle menu"
              type="button"
            >
              <Menu className="h-6 w-6 text-pink-600" />
            </button>

            <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 shadow-md md:h-11 md:w-11">
                <Heart className="h-5 w-5 fill-pink-500 text-pink-500 md:h-6 md:w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-extrabold tracking-tight text-slate-950 md:text-xl">Project INAY</h1>
                <p className="hidden text-xs font-bold uppercase tracking-wide text-pink-600 sm:block">Maternal & Child Health</p>
              </div>
            </Link>
          </div>

          <div className="flex min-w-0 items-center gap-2 sm:gap-3 md:gap-4">
            <div className={`flex max-w-[48vw] items-center gap-2 rounded-full border px-2 py-1.5 sm:max-w-none md:px-3 ${maternalRiskStatus.chipClass}`} aria-live="polite">
              <AlertTriangle className={`h-3 w-3 md:h-4 md:w-4 ${maternalRiskStatus.iconClass}`} />
              <span className="truncate text-[10px] font-bold md:text-xs">
                {maternalRiskStatus.label}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden text-sm font-bold text-slate-700 sm:inline md:text-base">{userName}</span>
              <MotherAvatar photoUrl={motherProfilePhotoUrl} initials={initials} />
            </div>
          </div>
        </div>
      </header>

      {isSidebarOpen && isMobile && (
        <button
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={toggleSidebar}
          aria-label="Close menu"
          type="button"
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 z-50 flex h-full flex-col border-r border-slate-200 bg-white shadow-xl
          transition-all duration-300 ease-in-out
          ${isSidebarOpen ? "w-72" : "-translate-x-full"}
          md:top-[73px] md:z-20 md:h-[calc(100vh-73px)] md:w-64 md:translate-x-0
        `}
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-5 md:hidden">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900">
              <Heart className="h-5 w-5 fill-pink-500 text-pink-500" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-950">Project INAY</h1>
              <p className="text-xs font-bold uppercase tracking-wide text-pink-600">Maternal & Child Health</p>
            </div>
          </div>
          <button
            onClick={toggleSidebar}
            className="rounded-lg p-2 transition-colors hover:bg-pink-50"
            type="button"
            aria-label="Close menu"
          >
            <X className="h-5 w-5 text-slate-600" />
          </button>
        </div>

        <div className="border-b border-slate-200 p-4">
          <div className={`rounded-2xl border p-3 ${maternalRiskStatus.profileCardClass}`}>
            <div className="flex items-center gap-3">
              <MotherAvatar
                photoUrl={motherProfilePhotoUrl}
                initials={initials}
                editable
                onPickPhoto={() => setIsPhotoModalOpen(true)}
                size="lg"
              />
              <div>
                <p className="font-extrabold text-slate-950">{userName}</p>
                <div className="mt-1 flex items-center gap-1">
                  <AlertTriangle className={`h-3 w-3 ${maternalRiskStatus.iconClass}`} />
                  <span className="text-xs font-bold text-slate-700">{maternalRiskStatus.profileLabel}</span>
                </div>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">
                  {maternalRiskStatus.description}
                </p>
              </div>
            </div>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
          <ul className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    prefetch
                    className={`group flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-200 ${
                      isActive
                        ? "bg-pink-50 text-pink-600 ring-1 ring-pink-100"
                        : "text-slate-600 hover:bg-slate-50 hover:text-pink-600"
                    }`}
                  >
                    <Icon className="h-5 w-5 transition-transform group-hover:scale-110" />
                    <span className="font-medium">{item.name}</span>
                    {(item.name === "Consultation" || item.name === "Notifications") && consultationUnread > 0 && (
                      <span className="ml-auto flex h-6 min-w-6 items-center justify-center rounded-full bg-pink-600 px-1.5 text-[11px] font-extrabold text-white">
                        {consultationUnread > 99 ? "99+" : consultationUnread}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-slate-200 bg-white p-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-600 transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-200"
            type="button"
          >
            <LogOut className="h-5 w-5" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      <main className="min-w-0 overflow-x-hidden pt-[73px] md:ml-64">
        {children}
      </main>

      <ProfilePhotoToast notice={photoNotice} onClose={() => setPhotoNotice(null)} />

      {liveNotice && (
        <div className="fixed bottom-5 right-5 z-[70] w-[min(92vw,360px)] rounded-xl border border-pink-100 bg-white p-4 text-slate-900 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-pink-600">
              <Bell className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold">{liveNotice.title}</p>
              <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-600">{liveNotice.body}</p>
              {liveNotice.href && (
                <Link href={liveNotice.href} onClick={() => setLiveNotice(null)} className="mt-2 inline-flex text-xs font-extrabold uppercase text-pink-600 hover:underline">
                  Open
                </Link>
              )}
            </div>
            <button type="button" onClick={() => setLiveNotice(null)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss notification">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {isPhotoModalOpen && (
        <ProfilePhotoUploadModal
          title="Upload Mother Profile Photo"
          subjectName={userName}
          onClose={() => setIsPhotoModalOpen(false)}
          onSave={uploadMotherPhoto}
          onUploadError={(message) => setPhotoNotice({ type: "error", text: message })}
        />
      )}
    </div>
  );
}

export default memo(AppShell);
