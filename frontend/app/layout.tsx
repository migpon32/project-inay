import type { Metadata } from "next";
import "./globals.css";
import ClientProviders from "./components/ClientProviders";
import PortalShellGate from "./components/PortalShellGate";

export const metadata: Metadata = {
  title: "Project INAY",
  description: "Maternal, neonatal, and child health platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ClientProviders>
          <PortalShellGate>{children}</PortalShellGate>
        </ClientProviders>
      </body>
    </html>
  );
}
