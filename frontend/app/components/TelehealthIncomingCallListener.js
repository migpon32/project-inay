"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { LoaderCircle, PhoneOff, Video } from "lucide-react";
import { getAuthToken } from "../utils/authSession";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";
const INCOMING_CALL_POLL_INTERVAL_MS = 1200;

const authConfig = () => ({
  headers: { Authorization: `Bearer ${getAuthToken()}` },
});

const getCallId = (call) => call?.call_id || call?.id || null;
const getConsultationId = (call) => call?.conversation_id || call?.consultation_id || null;

const videoCallUrl = ({ mode, consultationId, callId, name }) => {
  const params = new URLSearchParams({
    mode,
    consultationId: String(consultationId || ""),
    callId: String(callId || ""),
  });

  if (name) params.set("name", name);

  return `/consultation/video-call?${params.toString()}`;
};

function Spinner() {
  return <LoaderCircle className="h-4 w-4 animate-spin" />;
}

function openVideoCallWindow(url) {
  const callWindow = window.open(url, "_blank", "width=1180,height=820");
  if (!callWindow) {
    window.location.href = url;
  }
}

function TelehealthIncomingCallListener({ onBusyChange, onNotice }) {
  const [incomingCall, setIncomingCall] = useState(null);
  const [busy, setBusy] = useState(false);
  const activeCallIdRef = useRef(null);
  const suppressedCallIdsRef = useRef(new Set());

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const closeIncomingCall = useCallback((callId) => {
    if (callId) suppressedCallIdsRef.current.add(callId);
    activeCallIdRef.current = null;
    setIncomingCall(null);
  }, []);

  const endCallOnServer = useCallback(async (call) => {
    const consultationId = getConsultationId(call);
    const callId = getCallId(call);
    if (!consultationId || !callId) return null;

    try {
      const response = await axios.post(
        `${API_BASE_URL}/consultations/${consultationId}/calls/${callId}/end`,
        {},
        authConfig()
      );
      return response.data.call || null;
    } catch {
      return null;
    }
  }, []);

  const acceptIncomingCall = useCallback(async () => {
    if (!incomingCall || busy) return;

    const callId = getCallId(incomingCall);
    const consultationId = getConsultationId(incomingCall);
    if (!callId || !consultationId) return;

    setBusy(true);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/consultations/${consultationId}/calls/${callId}/accept`,
        {},
        authConfig()
      );
      const call = response.data.call;

      if (!call || ["ended", "declined", "missed", "cancelled"].includes(call.status)) {
        closeIncomingCall(callId);
        onNotice?.({ type: "error", text: "This video call is no longer available." });
        return;
      }

      closeIncomingCall(callId);
      openVideoCallWindow(videoCallUrl({
        mode: "receiver",
        consultationId,
        callId,
        name: call.other_user?.name || incomingCall.other_user?.name || "Project INAY user",
      }));
    } catch (error) {
      closeIncomingCall(callId);
      onNotice?.({
        type: "error",
        text: error.response?.data?.message || "Unable to accept video call.",
      });
    } finally {
      setBusy(false);
    }
  }, [busy, closeIncomingCall, incomingCall, onNotice]);

  const declineIncomingCall = useCallback(async () => {
    if (!incomingCall || busy) return;

    const call = incomingCall;
    const callId = getCallId(call);
    setBusy(true);
    closeIncomingCall(callId);
    await endCallOnServer(call);
    onNotice?.({ type: "success", text: "Video call declined." });
    setBusy(false);
  }, [busy, closeIncomingCall, endCallOnServer, incomingCall, onNotice]);

  useEffect(() => {
    let cancelled = false;

    const pollIncomingCall = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/consultations/calls/active`, authConfig());
        const call = response.data.call;

        if (cancelled) return;

        if (!call) {
          activeCallIdRef.current = null;
          setIncomingCall(null);
          return;
        }

        const callId = getCallId(call);
        if (!callId || call.status !== "ringing" || call.is_initiator || suppressedCallIdsRef.current.has(callId)) {
          return;
        }

        if (activeCallIdRef.current === callId) {
          setIncomingCall(call);
          return;
        }

        if (activeCallIdRef.current) return;

        activeCallIdRef.current = callId;
        setIncomingCall(call);
      } catch {
        // Incoming-call polling must never interrupt the chat screen.
      }
    };

    void pollIncomingCall();
    const interval = window.setInterval(pollIncomingCall, INCOMING_CALL_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!incomingCall) return null;

  const callerName = incomingCall.other_user?.name || "Program Staff";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4">
      <section className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-pink-50 text-pink-600 shadow-sm">
          <Video className="h-7 w-7" />
        </div>
        <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.14em] text-pink-600">Incoming video call</p>
        <h2 className="mt-2 text-xl font-extrabold text-slate-950">{callerName}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">wants to start a secure telehealth consultation.</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void declineIncomingCall()}
            disabled={busy}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <PhoneOff className="h-4 w-4" />
            Decline
          </button>
          <button
            type="button"
            onClick={() => void acceptIncomingCall()}
            disabled={busy}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-pink-600 text-sm font-extrabold text-white shadow-sm transition hover:bg-pink-700 disabled:bg-pink-300"
          >
            {busy ? <Spinner /> : <Video className="h-4 w-4" />}
            Accept
          </button>
        </div>
      </section>
    </div>
  );
}

export default memo(TelehealthIncomingCallListener);
