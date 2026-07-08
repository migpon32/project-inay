"use client";

import { SWRConfig } from "swr";
import { apiFetcher } from "../hooks/useApiQuery";

export default function ClientProviders({ children }) {
  return (
    <SWRConfig
      value={{
        fetcher: apiFetcher,
        dedupingInterval: 10000,
        errorRetryCount: 1,
        keepPreviousData: true,
        provider: () => new Map(),
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        shouldRetryOnError: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}
