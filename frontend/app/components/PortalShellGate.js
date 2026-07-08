"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import AppShell from "./AppShell";

const motherPortalRoutes = [
  "/dashboard",
  "/maternal-monitoring",
  "/child-health",
  "/notifications",
  "/clinic-schedule",
  "/inay-kaalaman",
  "/health-services",
  "/consultation",
];

export default function PortalShellGate({ children }) {
  const pathname = usePathname();
  const usesMotherShell = useMemo(() => {
    return motherPortalRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  }, [pathname]);

  if (!usesMotherShell) {
    return children;
  }

  return <AppShell>{children}</AppShell>;
}
