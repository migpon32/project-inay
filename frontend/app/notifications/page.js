"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Baby,
  Bell,
  CalendarDays,
  CheckCircle2,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import useMaternalPushNotifications from "../hooks/useMaternalPushNotifications";
import useApiQuery from "../hooks/useApiQuery";

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

const compactText = (value, fallback) => {
  const text = String(value || "").trim();
  if (!text) return fallback;

  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
};

const messagePreview = (message) => {
  if (!message) return "Program Staff sent an update.";
  if (message.body) return compactText(message.body, "Program Staff sent an update.");
  if (message.iec_resource?.title) return `Shared IEC resource: ${message.iec_resource.title}`;
  if (message.attachment?.name) return `Sent attachment: ${message.attachment.name}`;

  return "Program Staff sent an update.";
};

const maternalEntrySummary = (entry) => {
  if (!entry) return "";

  return [
    entry.blood_pressure ? `BP ${entry.blood_pressure}` : null,
    entry.blood_sugar_mgdl !== null && entry.blood_sugar_mgdl !== undefined ? `Blood sugar ${entry.blood_sugar_mgdl} mg/dL` : null,
    entry.hemoglobin_gdl !== null && entry.hemoglobin_gdl !== undefined ? `Hemoglobin ${entry.hemoglobin_gdl} g/dL` : null,
    entry.weight_kg !== null && entry.weight_kg !== undefined ? `Weight ${entry.weight_kg} kg` : null,
  ].filter(Boolean).join(", ");
};

const toneStyles = {
  high: "border-rose-200 bg-rose-50 text-rose-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-blue-200 bg-blue-50 text-blue-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  neutral: "border-slate-200 bg-white text-slate-800",
};

function NotificationCard({ item }) {
  const Icon = item.icon;

  return (
    <article className={`rounded-lg border p-4 shadow-sm ${toneStyles[item.tone] || toneStyles.neutral}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/70 bg-white/70">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-extrabold">{item.title}</h2>
            <span className="rounded-md border border-white/70 bg-white/70 px-2 py-1 text-[10px] font-extrabold uppercase">
              {item.label}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 opacity-90">{item.message}</p>
          {item.detail && <p className="mt-2 text-xs font-bold opacity-70">{item.detail}</p>}
          {item.href && (
            <Link href={item.href} className="mt-3 inline-flex text-xs font-extrabold uppercase hover:underline">
              Open
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function SummaryPill({ label, value, tone }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${tone}`}>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function PushNotificationPanel({ pushState, notice, onToggle }) {
  const isBlocked = pushState.permission === "denied";
  const isUnavailable = !pushState.isSupported;
  const disabled = isBlocked || isUnavailable;
  const tone = pushState.enabled
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : isBlocked
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-blue-200 bg-blue-50 text-blue-800";
  const label = pushState.enabled
    ? "Enabled"
    : isBlocked
      ? "Blocked"
      : isUnavailable
        ? "Unavailable"
        : "Off";
  const detail = pushState.enabled
    ? "Maternal monitoring alerts can appear as browser notifications."
    : isBlocked
      ? "Notifications are blocked in browser settings."
      : isUnavailable
        ? "This browser does not support notifications."
        : "Maternal monitoring alerts are ready to enable.";
  const buttonText = pushState.enabled ? "Turn Off" : "Enable Push";

  return (
    <section className={`rounded-lg border p-4 shadow-sm ${tone}`}>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/70 bg-white/70">
            <Bell className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-extrabold">Maternal Push Notifications</h2>
              <span className="rounded-md border border-white/70 bg-white/70 px-2 py-1 text-[10px] font-extrabold uppercase">
                {label}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 opacity-90">{detail}</p>
            {notice && <p className="mt-2 text-xs font-extrabold opacity-80">{notice}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {buttonText}
        </button>
      </div>
    </section>
  );
}

export default function NotificationsPage() {
  const [pushNotice, setPushNotice] = useState("");
  const maternalPush = useMaternalPushNotifications();
  const userQuery = useApiQuery("/user", { dedupingInterval: 30000 });
  const monitoringQuery = useApiQuery("/maternal-monitoring/me", { refreshInterval: 15000, dedupingInterval: 5000 });
  const childQuery = useApiQuery("/child-health/children", { refreshInterval: 60000, dedupingInterval: 10000 });
  const consultationQuery = useApiQuery("/consultations", { refreshInterval: 10000, dedupingInterval: 5000 });
  const unreadQuery = useApiQuery("/consultations/unread-count", { refreshInterval: 10000, dedupingInterval: 5000 });

  const payload = useMemo(() => ({
    user: userQuery.data,
    monitoring: monitoringQuery.data,
    childHealth: childQuery.data,
    consultations: consultationQuery.data?.consultations || [],
    unreadCount: unreadQuery.data?.unread_count || 0,
  }), [childQuery.data, consultationQuery.data, monitoringQuery.data, unreadQuery.data, userQuery.data]);

  const hasAnyPayload = Boolean(
    payload.user
    || payload.monitoring
    || payload.childHealth
    || consultationQuery.data
    || unreadQuery.data
  );
  const loading = !hasAnyPayload && (
    userQuery.isLoading
    || monitoringQuery.isLoading
    || childQuery.isLoading
    || consultationQuery.isLoading
    || unreadQuery.isLoading
  );

  const notifications = useMemo(() => {
    const items = [];
    const mother = payload.user?.mother;
    const userId = payload.user?.id;
    const nextVisit = dateKey(mother?.next_scheduled_visit);
    const today = todayValue();

    if (nextVisit) {
      const isOverdue = nextVisit < today;
      const isToday = nextVisit === today;
      items.push({
        id: "clinic-schedule",
        title: isOverdue ? "Schedule reminder needs follow-up" : isToday ? "Clinic visit today" : "Schedule reminder from Program Staff",
        label: "Schedule",
        message: `Next clinic visit: ${formatDate(nextVisit)}.`,
        detail: isOverdue
          ? "This scheduled date has passed. Message Program Staff for the next clinic date."
          : isToday
            ? "Your scheduled clinic visit is today."
            : "Program Staff set this next clinic visit for your care plan.",
        tone: isOverdue ? "high" : isToday ? "medium" : "low",
        icon: CalendarDays,
        href: "/clinic-schedule",
      });
    } else {
      items.push({
        id: "clinic-unscheduled",
        title: "No clinic visit scheduled",
        label: "Schedule",
        message: "Program Staff has not set a next clinic visit yet.",
        tone: "neutral",
        icon: CalendarDays,
        href: "/clinic-schedule",
      });
    }

    const staffMessageItems = (payload.consultations || [])
      .filter((consultation) => consultation.unread_count > 0)
      .filter((consultation) => consultation.last_message?.sender_user_id !== userId)
      .slice(0, 4);

    staffMessageItems.forEach((consultation) => {
      const senderName = consultation.last_message?.sender_name || consultation.health_worker?.name || "Program Staff";
      items.push({
        id: `staff-message-${consultation.last_message?.id || consultation.id}`,
        title: `${senderName} sent an update`,
        label: "Message",
        message: messagePreview(consultation.last_message),
        detail: `${consultation.subject || "Consultation"} - ${consultation.unread_count} unread`,
        tone: consultation.risk_level === "high" ? "high" : "medium",
        icon: MessageCircle,
        href: "/consultation",
      });
    });

    const detailedUnreadCount = staffMessageItems.reduce((total, consultation) => total + (consultation.unread_count || 0), 0);
    const remainingUnreadCount = Math.max(payload.unreadCount - detailedUnreadCount, 0);

    if (remainingUnreadCount > 0) {
      items.push({
        id: "consultation-unread",
        title: "Unread consultation message",
        label: "Consultation",
        message: `${remainingUnreadCount} unread message${remainingUnreadCount === 1 ? "" : "s"} from your consultation thread.`,
        tone: "medium",
        icon: MessageCircle,
        href: "/consultation",
      });
    }

    const riskLevel = payload.monitoring?.profile?.risk_level || "low";
    const latestEntry = payload.monitoring?.summary?.latest || payload.monitoring?.profile?.latest_entry;
    const latestFromStaff = latestEntry?.recorded_by_user_id && latestEntry.recorded_by_user_id !== userId;

    if (latestFromStaff) {
      const entrySummary = maternalEntrySummary(latestEntry);
      const staffName = latestEntry.recorded_by || "Program Staff";
      items.push({
        id: `maternal-update-${latestEntry.id}`,
        title: riskLevel === "high" ? "Maternal warning from Program Staff" : riskLevel === "medium" ? "Maternal monitoring warning" : "Maternal monitoring update",
        label: riskLevel === "high" || riskLevel === "medium" ? "Warning" : "Update",
        message: compactText(latestEntry.notes, entrySummary || `${staffName} updated your maternal monitoring record.`),
        detail: `Recorded by ${staffName}${latestEntry.recorded_at ? ` on ${formatDate(latestEntry.recorded_at)}` : ""}`,
        tone: riskLevel === "high" ? "high" : riskLevel === "medium" ? "medium" : "success",
        icon: Activity,
        href: "/maternal-monitoring",
      });
    }

    if (riskLevel === "high" || riskLevel === "medium") {
      items.push({
        id: "maternal-risk",
        title: riskLevel === "high" ? "High-risk monitoring active" : "Monitoring review active",
        label: "Maternal",
        message: riskLevel === "high"
          ? "Latest maternal indicators need urgent Program Staff coordination."
          : "Some maternal indicators need closer monitoring.",
        tone: riskLevel === "high" ? "high" : "medium",
        icon: Activity,
        href: "/maternal-monitoring",
      });
    }

    (payload.monitoring?.summary?.recommendations || []).slice(0, 2).forEach((message, index) => {
      items.push({
        id: `recommendation-${index}`,
        title: "Maternal care reminder",
        label: "Reminder",
        message,
        tone: riskLevel === "low" ? "success" : "medium",
        icon: ShieldCheck,
        href: "/maternal-monitoring",
      });
    });

    (payload.childHealth?.children || []).forEach((child) => {
      (child.alerts || []).forEach((alert, index) => {
        items.push({
          id: `child-${child.id}-${index}`,
          title: alert.title,
          label: child.name,
          message: alert.message,
          tone: alert.severity === "high" ? "high" : alert.severity === "medium" ? "medium" : "low",
          icon: Baby,
          href: "/child-health",
        });
      });
    });

    if (items.length === 0) {
      items.push({
        id: "all-clear",
        title: "No active notifications",
        label: "Stable",
        message: "No urgent reminders are active right now.",
        tone: "success",
        icon: CheckCircle2,
        href: "/dashboard",
      });
    }

    return items;
  }, [payload]);

  const urgentCount = notifications.filter((item) => item.tone === "high").length;
  const reminderCount = notifications.filter((item) => item.tone === "medium" || item.tone === "low").length;

  const handlePushToggle = useCallback(async () => {
    setPushNotice("");

    if (maternalPush.enabled) {
      maternalPush.disable();
      setPushNotice("Maternal push notifications turned off.");
      return;
    }

    try {
      const result = await maternalPush.enable();
      if (result.ok) {
        setPushNotice("Maternal push notifications enabled.");
      } else if (result.reason === "unsupported") {
        setPushNotice("Browser notifications are unavailable on this device.");
      } else {
        setPushNotice("Notifications are blocked in browser settings.");
      }
    } catch {
      setPushNotice("Unable to update browser notification permission.");
    }
  }, [maternalPush]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#fbfbfc] px-4 py-5 text-slate-950 sm:px-6 sm:py-6 lg:px-8">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <header className="border-b border-pink-100 pb-5">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-pink-600">Mother Portal / Notifications</p>
            <h1 className="mt-2 text-2xl font-extrabold text-slate-950">Notifications</h1>
          </header>

          <PushNotificationPanel pushState={maternalPush} notice={pushNotice} onToggle={handlePushToggle} />

          {loading ? (
            <NotificationsSkeleton />
          ) : (
            <>
              <section className="grid min-w-0 gap-3 sm:grid-cols-3">
                <SummaryPill label="Total" value={notifications.length} tone="border-slate-200 bg-white text-slate-800" />
                <SummaryPill label="Urgent" value={urgentCount} tone="border-rose-200 bg-rose-50 text-rose-800" />
                <SummaryPill label="Reminders" value={reminderCount} tone="border-blue-200 bg-blue-50 text-blue-800" />
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">
                  <Bell className="h-4 w-4 text-pink-600" />
                  Care Updates
                </div>
                {notifications.map((item) => (
                  <NotificationCard key={item.id} item={item} />
                ))}
              </section>
            </>
          )}
        </div>
    </div>
  );
}

function NotificationsSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading notifications">
      <section className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="h-3 w-20 rounded bg-slate-100" />
            <div className="mt-4 h-8 w-12 rounded bg-slate-100" />
          </div>
        ))}
      </section>
      {[0, 1, 2].map((item) => (
        <article key={item} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex gap-3">
            <div className="h-10 w-10 rounded-lg bg-slate-100" />
            <div className="min-w-0 flex-1">
              <div className="h-4 w-48 max-w-full rounded bg-slate-100" />
              <div className="mt-3 h-3 w-full rounded bg-slate-100" />
              <div className="mt-2 h-3 w-2/3 rounded bg-slate-100" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
