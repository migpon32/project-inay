"use client";

import { useMemo } from "react";
import { getActivePortal, getAuthToken } from "../utils/authSession";
import useApiQuery from "./useApiQuery";

const riskStatusConfig = {
  high: {
    label: "High-risk protocol active",
    profileLabel: "High-risk protocol active",
    description: "Latest maternal vitals need urgent monitoring.",
    chipClass: "border-red-100 bg-red-50 text-red-700",
    iconClass: "text-red-500",
    profileCardClass: "border-red-100 bg-red-50",
  },
  medium: {
    label: "Monitoring review active",
    profileLabel: "Moderate-risk monitoring",
    description: "Some indicators need closer monitoring.",
    chipClass: "border-amber-100 bg-amber-50 text-amber-700",
    iconClass: "text-amber-500",
    profileCardClass: "border-amber-100 bg-amber-50",
  },
  low: {
    label: "Maternal indicators stable",
    profileLabel: "Low-risk monitoring stable",
    description: "Latest maternal vitals are within healthy thresholds.",
    chipClass: "border-emerald-100 bg-emerald-50 text-emerald-700",
    iconClass: "text-emerald-500",
    profileCardClass: "border-emerald-100 bg-emerald-50",
  },
  syncing: {
    label: "Monitoring status syncing",
    profileLabel: "Monitoring status syncing",
    description: "Checking the latest maternal monitoring record.",
    chipClass: "border-slate-200 bg-slate-50 text-slate-600",
    iconClass: "text-slate-400",
    profileCardClass: "border-slate-200 bg-slate-50",
  },
};

export default function useMaternalRiskStatus() {
  const shouldLoad = Boolean(getAuthToken()) && getActivePortal() !== "health_worker";
  const { data, error } = useApiQuery(shouldLoad ? "/maternal-monitoring/status" : null, {
    refreshInterval: 10000,
    dedupingInterval: 5000,
  });

  return useMemo(() => {
    const riskLevel = error ? "syncing" : data?.risk_level || "syncing";
    const config = riskStatusConfig[riskLevel] || riskStatusConfig.syncing;

    return {
      ...config,
      riskLevel,
      latestEntryId: data?.latest_entry_id ?? null,
    };
  }, [data, error]);
}
