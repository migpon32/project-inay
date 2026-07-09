"use client";

import { Suspense } from "react";
import TelehealthVideoCallSession from "../../components/TelehealthVideoCallSession";

function VideoCallFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-white">
      <div className="rounded-3xl bg-white/10 px-5 py-4 text-sm font-extrabold text-slate-100">
        Preparing secure video call...
      </div>
    </main>
  );
}

export default function ConsultationVideoCallPage() {
  return (
    <Suspense fallback={<VideoCallFallback />}>
      <TelehealthVideoCallSession />
    </Suspense>
  );
}
