"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { getActivePortal, getAuthToken } from "../utils/authSession";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";
const ENABLED_KEY = "project_inay_maternal_push_enabled";
const ALERT_HISTORY_KEY = "project_inay_maternal_push_alert_history";
const SETTINGS_EVENT = "project-inay:maternal-push-settings";

const authConfig = () => ({
  headers: { Authorization: `Bearer ${getAuthToken()}` },
});

const getPermission = () => {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return window.Notification.permission;
};

const isEnabled = () => {
  if (typeof window === "undefined") return false;

  return getPermission() === "granted" && localStorage.getItem(ENABLED_KEY) === "enabled";
};

const emitSettingsChange = () => {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(SETTINGS_EVENT));
};

const readAlertHistory = () => {
  try {
    const value = JSON.parse(localStorage.getItem(ALERT_HISTORY_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const hasAlert = (key) => readAlertHistory().includes(key);

const rememberAlert = (key) => {
  const nextHistory = [key, ...readAlertHistory().filter((item) => item !== key)].slice(0, 60);
  localStorage.setItem(ALERT_HISTORY_KEY, JSON.stringify(nextHistory));
};

const compactText = (value, fallback) => {
  const text = String(value || "").trim();
  if (!text) return fallback;

  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
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

const formatDate = (value) => {
  const date = parseDate(value);
  if (!date) return "Not scheduled";

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
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

const notify = ({ key, title, body, tag, href }, settings = {}) => {
  if (!key || hasAlert(key)) return;

  settings.onEvent?.({ key, title, body, href });

  if (settings.enabled && settings.permission === "granted") {
    const notification = new window.Notification(title, {
      body,
      tag,
      renotify: true,
    });

    notification.onclick = () => {
      window.focus();
      if (href) window.location.assign(href);
      notification.close();
    };
  }

  rememberAlert(key);
};

export default function useMaternalPushNotifications(maternalRiskStatus = null, options = {}) {
  const [permission, setPermission] = useState("default");
  const [enabled, setEnabled] = useState(false);
  const watchPortalEvents = options.watchPortalEvents ?? Boolean(maternalRiskStatus);
  const pollMs = options.pollMs || 1500;
  const onEvent = options.onEvent;

  const refreshSettings = useCallback(() => {
    setPermission(getPermission());
    setEnabled(isEnabled());
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(refreshSettings, 0);

    const handleSettingsChange = () => refreshSettings();

    window.addEventListener("storage", handleSettingsChange);
    window.addEventListener("focus", handleSettingsChange);
    window.addEventListener(SETTINGS_EVENT, handleSettingsChange);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", handleSettingsChange);
      window.removeEventListener("focus", handleSettingsChange);
      window.removeEventListener(SETTINGS_EVENT, handleSettingsChange);
    };
  }, [refreshSettings]);

  useEffect(() => {
    if (watchPortalEvents || !enabled || permission !== "granted" || !maternalRiskStatus) return;

    const riskLevel = maternalRiskStatus.riskLevel;
    if (riskLevel !== "high" && riskLevel !== "medium") return;

    notify({
      key: `maternal-entry:${maternalRiskStatus.latestEntryId || "profile"}:${riskLevel}`,
      title: riskLevel === "high" ? "Project INAY: High-risk maternal alert" : "Project INAY: Maternal monitoring review",
      body: riskLevel === "high"
        ? "Latest maternal indicators need urgent Program Staff coordination."
        : "Some maternal indicators need closer monitoring.",
      tag: `project-inay-maternal-${riskLevel}`,
      href: "/maternal-monitoring",
    }, { enabled, onEvent, permission });
  }, [enabled, maternalRiskStatus, onEvent, permission, watchPortalEvents]);

  useEffect(() => {
    if (!watchPortalEvents) return;

    let active = true;

    const loadPortalEvents = async () => {
      const token = getAuthToken();
      const activePortal = getActivePortal();
      if (!token || activePortal === "health_worker") return;

      const [userResult, monitoringResult, consultationResult] = await Promise.allSettled([
        axios.get(`${API_BASE_URL}/user`, authConfig()),
        axios.get(`${API_BASE_URL}/maternal-monitoring/me`, authConfig()),
        axios.get(`${API_BASE_URL}/consultations`, authConfig()),
      ]);

      if (!active) return;

      const user = userResult.status === "fulfilled" ? userResult.value.data : null;
      const userId = user?.id;
      const monitoring = monitoringResult.status === "fulfilled" ? monitoringResult.value.data : null;
      const consultations = consultationResult.status === "fulfilled" ? consultationResult.value.data.consultations || [] : [];
      const nextVisit = dateKey(user?.mother?.next_scheduled_visit);

      if (nextVisit) {
        const today = todayValue();
        notify({
          key: `schedule:${nextVisit}`,
          title: nextVisit < today ? "Project INAY: Schedule follow-up needed" : nextVisit === today ? "Project INAY: Clinic visit today" : "Project INAY: Clinic schedule reminder",
          body: `Next clinic visit: ${formatDate(nextVisit)}.`,
          tag: "project-inay-clinic-schedule",
          href: "/clinic-schedule",
        }, { enabled, onEvent, permission });
      }

      consultations
        .filter((consultation) => consultation.unread_count > 0)
        .filter((consultation) => consultation.last_message?.sender_user_id !== userId)
        .slice(0, 4)
        .forEach((consultation) => {
          const message = consultation.last_message;
          const senderName = message?.sender_name || consultation.health_worker?.name || "Program Staff";

          notify({
            key: `message:${message?.id || consultation.id}`,
            title: `${senderName} sent an update`,
            body: messagePreview(message),
            tag: `project-inay-message-${consultation.id}`,
            href: "/consultation",
          }, { enabled, onEvent, permission });
        });

      const latestEntry = monitoring?.summary?.latest || monitoring?.profile?.latest_entry;
      const latestFromStaff = latestEntry?.recorded_by_user_id && latestEntry.recorded_by_user_id !== userId;

      if (latestFromStaff) {
        const riskLevel = latestEntry.risk_level || monitoring?.profile?.risk_level || "low";
        const staffName = latestEntry.recorded_by || "Program Staff";

        notify({
          key: `maternal-entry:${latestEntry.id}:${riskLevel}`,
          title: riskLevel === "high" ? "Project INAY: Maternal warning" : riskLevel === "medium" ? "Project INAY: Maternal monitoring review" : "Project INAY: Maternal monitoring update",
          body: compactText(latestEntry.notes, maternalEntrySummary(latestEntry) || `${staffName} updated your maternal monitoring record.`),
          tag: `project-inay-maternal-entry-${latestEntry.id}`,
          href: "/maternal-monitoring",
        }, { enabled, onEvent, permission });
      }
    };

    const timer = window.setTimeout(() => void loadPortalEvents(), 0);
    const interval = window.setInterval(loadPortalEvents, pollMs);

    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [enabled, onEvent, permission, pollMs, watchPortalEvents]);

  const enable = useCallback(async () => {
    if (getPermission() === "unsupported") {
      refreshSettings();
      return { ok: false, reason: "unsupported" };
    }

    let nextPermission = getPermission();

    if (nextPermission === "default") {
      nextPermission = await window.Notification.requestPermission();
    }

    if (nextPermission === "granted") {
      localStorage.setItem(ENABLED_KEY, "enabled");
      refreshSettings();
      emitSettingsChange();
      return { ok: true };
    }

    localStorage.setItem(ENABLED_KEY, "disabled");
    refreshSettings();
    emitSettingsChange();
    return { ok: false, reason: nextPermission };
  }, [refreshSettings]);

  const disable = useCallback(() => {
    localStorage.setItem(ENABLED_KEY, "disabled");
    refreshSettings();
    emitSettingsChange();
  }, [refreshSettings]);

  return {
    enabled,
    permission,
    isSupported: permission !== "unsupported",
    enable,
    disable,
  };
}
