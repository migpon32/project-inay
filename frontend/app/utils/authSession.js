"use client";

const notifyAuthSessionChanged = () => {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event("inay-auth-session"));
};

export const getAuthToken = () => {
  if (typeof window === "undefined") return "";

  return sessionStorage.getItem("token") || localStorage.getItem("token") || "";
};

export const getActivePortal = () => {
  if (typeof window === "undefined") return "";

  return sessionStorage.getItem("active_portal") || localStorage.getItem("active_portal") || "";
};

export const getStoredUser = () => {
  if (typeof window === "undefined") return null;

  try {
    return JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

export const setAuthSession = ({ token, user, activePortal }) => {
  if (typeof window === "undefined") return;

  sessionStorage.setItem("token", token);
  sessionStorage.setItem("user", JSON.stringify(user));
  sessionStorage.setItem("active_portal", activePortal);
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("active_portal");
  notifyAuthSessionChanged();
};

export const updateStoredUser = (user) => {
  if (typeof window === "undefined") return;

  sessionStorage.setItem("user", JSON.stringify(user));
  localStorage.removeItem("user");
  notifyAuthSessionChanged();
};

export const clearAuthSession = () => {
  if (typeof window === "undefined") return;

  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");
  sessionStorage.removeItem("active_portal");
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("active_portal");
  notifyAuthSessionChanged();
};
