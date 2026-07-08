"use client";

import useApiQuery from "./useApiQuery";

export default function useConsultationUnread() {
  const { data } = useApiQuery("/consultations/unread-count", {
    refreshInterval: 10000,
    dedupingInterval: 5000,
  });

  return data?.unread_count || 0;
}
