"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { getAuthToken, getStoredUser, updateStoredUser as persistStoredUser } from "../utils/authSession";
import useApiQuery, { mutateApiCache } from "./useApiQuery";

const subscribeToAuthSession = (onStoreChange) => {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("storage", onStoreChange);
  window.addEventListener("inay-auth-session", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("inay-auth-session", onStoreChange);
  };
};

const getStoredUserJsonSnapshot = () => {
  if (typeof window === "undefined") return "";

  return sessionStorage.getItem("user") || localStorage.getItem("user") || "";
};

const getAuthTokenSnapshot = () => getAuthToken();
const getServerSnapshot = () => "";

export default function useCurrentUser() {
  const storedUserJson = useSyncExternalStore(subscribeToAuthSession, getStoredUserJsonSnapshot, getServerSnapshot);
  const authToken = useSyncExternalStore(subscribeToAuthSession, getAuthTokenSnapshot, getServerSnapshot);
  const storedUser = useMemo(() => {
    if (!storedUserJson) return null;

    try {
      return JSON.parse(storedUserJson);
    } catch {
      return getStoredUser();
    }
  }, [storedUserJson]);

  const { data, mutate } = useApiQuery(authToken ? "/user" : null, {
    fallbackData: storedUser,
    dedupingInterval: 30000,
    revalidateOnFocus: false,
  });
  const user = data || storedUser;

  const updateStoredUser = useCallback((nextUser) => {
    if (!nextUser) {
      mutate(null, { revalidate: false });
      mutateApiCache("/user", null, { revalidate: false });
      return;
    }

    persistStoredUser(nextUser);
    mutate(nextUser, { revalidate: false });
    mutateApiCache("/user", nextUser, { revalidate: false });
  }, [mutate]);

  const userName = user?.name || "Project INAY User";
  const motherProfilePhotoUrl = user?.mother?.profile_photo_url || null;

  const initials = useMemo(() => {
    return userName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "IN";
  }, [userName]);

  return {
    user,
    userName,
    initials,
    motherProfilePhotoUrl,
    updateStoredUser,
  };
}
