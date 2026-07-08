"use client";

import useSWR, { mutate as mutateApiCache, preload } from "swr";
import api from "../../lib/axios";
import { getAuthToken } from "../utils/authSession";

export const apiFetcher = async (url) => {
  if (!url || !getAuthToken()) return null;

  const response = await api.get(url);
  return response.data;
};

export const apiMutation = async (url, payload, config = {}) => {
  const response = await api.post(url, payload, config);
  return response.data;
};

export const prefetchApi = (url) => {
  if (!url || !getAuthToken()) return Promise.resolve(null);
  return preload(url, apiFetcher);
};

export { mutateApiCache };

export default function useApiQuery(key, options = {}) {
  const token = typeof window === "undefined" ? null : getAuthToken();
  const normalizedKey = token && key ? key : null;

  return useSWR(normalizedKey, apiFetcher, {
    dedupingInterval: 10000,
    errorRetryCount: 1,
    keepPreviousData: true,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    shouldRetryOnError: false,
    ...options,
  });
}
