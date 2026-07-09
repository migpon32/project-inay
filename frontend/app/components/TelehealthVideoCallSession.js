"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import {
  Camera,
  CameraOff,
  LoaderCircle,
  Mic,
  MicOff,
  PhoneOff,
  VideoOff,
  X,
} from "lucide-react";
import { getAuthToken } from "../utils/authSession";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";
const CALL_POLL_INTERVAL_MS = 700;
const TERMINAL_STATUSES = new Set(["ended", "declined", "missed", "cancelled"]);

const CALL_STATE = Object.freeze({
  IDLE: "idle",
  DIALING: "dialing",
  INCOMING: "incoming",
  ACCEPTED: "accepted",
  CONNECTED: "connected",
  DECLINED: "declined",
  CANCELLED: "cancelled",
  ENDED: "ended",
  FAILED: "failed",
});

const authConfig = () => ({
  headers: { Authorization: `Bearer ${getAuthToken()}` },
});

const getCallId = (call) => call?.call_id || call?.id || null;
const getConsultationId = (call) => call?.conversation_id || call?.consultation_id || null;

function Spinner() {
  return <LoaderCircle className="h-4 w-4 animate-spin" />;
}

function terminalState(status) {
  if (status === "declined") return CALL_STATE.DECLINED;
  if (status === "cancelled" || status === "missed") return CALL_STATE.CANCELLED;
  return CALL_STATE.ENDED;
}

function terminalMessage(status) {
  if (status === "declined") return "The call was declined.";
  if (status === "cancelled" || status === "missed") return "The call was cancelled.";
  return "The call has ended.";
}

function TelehealthVideoCallSession() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");
  const consultationId = searchParams.get("consultationId");
  const callId = searchParams.get("callId");
  const bootStatus = searchParams.get("status");
  const requestedName = searchParams.get("name") || "Project INAY user";

  const [activeCall, setActiveCall] = useState(null);
  const [callState, setCallState] = useState(CALL_STATE.IDLE);
  const [statusText, setStatusText] = useState("Preparing video call...");
  const [callError, setCallError] = useState("");
  const [mediaStarting, setMediaStarting] = useState(false);
  const [hasLocalMedia, setHasLocalMedia] = useState(false);
  const [hasLocalVideo, setHasLocalVideo] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const latestSignalIdRef = useRef(0);
  const processedSignalIdsRef = useRef(new Set());
  const queuedIceCandidatesRef = useRef([]);
  const sentAnswerForOfferIdsRef = useRef(new Set());
  const initializedRef = useRef(false);
  const offerStartedRef = useRef(false);
  const terminalRef = useRef(false);
  const callStateRef = useRef(CALL_STATE.IDLE);
  const activeCallRef = useRef(null);
  const activeCallIdRef = useRef(null);
  const autoCloseTimerRef = useRef(null);

  const peerName = activeCall?.other_user?.name || requestedName;
  const canControlMedia = hasLocalMedia;

  const updateCallState = useCallback((nextState) => {
    callStateRef.current = nextState;
    setCallState(nextState);
  }, []);

  const attachLocalStream = useCallback(() => {
    if (localVideoRef.current && localStreamRef.current && localVideoRef.current.srcObject !== localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, []);

  const attachRemoteStream = useCallback(() => {
    if (remoteVideoRef.current && remoteStreamRef.current && remoteVideoRef.current.srcObject !== remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, []);

  const cleanupMedia = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current = null;
    }

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    setHasLocalVideo(false);
    setHasLocalMedia(false);
    setHasRemoteVideo(false);
    setMicMuted(false);
    setCameraOff(false);
  }, []);

  const scheduleWindowClose = useCallback((delayMs = 1200) => {
    if (autoCloseTimerRef.current) {
      window.clearTimeout(autoCloseTimerRef.current);
    }

    autoCloseTimerRef.current = window.setTimeout(() => {
      window.close();
    }, delayMs);
  }, []);

  const endCallOnServer = useCallback(async (call = activeCallRef.current) => {
    const currentConsultationId = getConsultationId(call) || consultationId;
    const currentCallId = getCallId(call) || callId;
    if (!currentConsultationId || !currentCallId) return null;

    try {
      const response = await axios.post(
        `${API_BASE_URL}/consultations/${currentConsultationId}/calls/${currentCallId}/end`,
        {},
        authConfig()
      );
      return response.data.call || null;
    } catch {
      return null;
    }
  }, [callId, consultationId]);

  const finishCall = useCallback((nextState, message) => {
    terminalRef.current = true;
    cleanupMedia();
    setStatusText(message);
    updateCallState(nextState);

    if ([CALL_STATE.DECLINED, CALL_STATE.CANCELLED, CALL_STATE.ENDED].includes(nextState)) {
      scheduleWindowClose(1000);
    } else if (nextState === CALL_STATE.FAILED) {
      scheduleWindowClose(2500);
    }
  }, [cleanupMedia, scheduleWindowClose, updateCallState]);

  const failCall = useCallback(async (message = "Video call connection failed. Please try again.") => {
    setCallError(message);
    await endCallOnServer();
    finishCall(CALL_STATE.FAILED, message);
  }, [endCallOnServer, finishCall]);

  const sendCallSignal = useCallback(async (call, type, payload) => {
    const currentConsultationId = getConsultationId(call) || consultationId;
    const currentCallId = getCallId(call) || callId;
    if (!currentConsultationId || !currentCallId || terminalRef.current) return;

    try {
      const response = await axios.post(
        `${API_BASE_URL}/consultations/${currentConsultationId}/calls/${currentCallId}/signals`,
        { type, payload },
        authConfig()
      );

      if (response.data?.ignored || TERMINAL_STATUSES.has(response.data?.call?.status)) {
        finishCall(terminalState(response.data?.call?.status), terminalMessage(response.data?.call?.status));
      }
    } catch (error) {
      if ([404, 409, 410, 422].includes(error.response?.status)) {
        finishCall(CALL_STATE.ENDED, "The call has ended.");
        return;
      }

      throw error;
    }
  }, [callId, consultationId, finishCall]);

  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) {
      attachLocalStream();
      return localStreamRef.current;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera and microphone are not available in this browser.");
    }

    setMediaStarting(true);
    setStatusText("Starting camera...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { ideal: 640, max: 960 },
          height: { ideal: 360, max: 540 },
          frameRate: { ideal: 24, max: 30 },
        },
      });

      localStreamRef.current = stream;
      setHasLocalMedia(true);
      setHasLocalVideo(stream.getVideoTracks().some((track) => track.readyState === "live"));
      attachLocalStream();
      return stream;
    } finally {
      setMediaStarting(false);
    }
  }, [attachLocalStream]);

  const createPeerConnection = useCallback(async (call) => {
    if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== "closed") {
      return peerConnectionRef.current;
    }

    const currentCallId = getCallId(call) || callId;
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peer.onicecandidate = (event) => {
      if (!event.candidate || terminalRef.current) return;
      if (activeCallIdRef.current && activeCallIdRef.current !== currentCallId) return;

      void sendCallSignal(call, "ice", event.candidate.toJSON()).catch(() => {});
    };

    peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream || terminalRef.current) return;

      remoteStreamRef.current = stream;
      setHasRemoteVideo(true);
      setStatusText("Connected");
      updateCallState(CALL_STATE.CONNECTED);
      attachRemoteStream();
    };

    peer.onconnectionstatechange = () => {
      if (terminalRef.current) return;

      if (["connected", "completed"].includes(peer.connectionState)) {
        setStatusText("Connected");
        updateCallState(CALL_STATE.CONNECTED);
      } else if (peer.connectionState === "failed") {
        void failCall();
      } else if (peer.connectionState === "disconnected") {
        setStatusText("Reconnecting...");
      }
    };

    const stream = await ensureLocalStream();
    stream.getTracks().forEach((track) => {
      if (!peer.getSenders().some((sender) => sender.track === track)) {
        peer.addTrack(track, stream);
      }
    });

    peerConnectionRef.current = peer;
    return peer;
  }, [attachRemoteStream, callId, ensureLocalStream, failCall, sendCallSignal, updateCallState]);

  const flushQueuedIceCandidates = useCallback(async (peer) => {
    if (!peer.remoteDescription) return;

    const queuedCandidates = [...queuedIceCandidatesRef.current];
    queuedIceCandidatesRef.current = [];

    for (const candidate of queuedCandidates) {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        queuedIceCandidatesRef.current.push(candidate);
      }
    }
  }, []);

  const startCallerOffer = useCallback(async (call) => {
    if (offerStartedRef.current || terminalRef.current) return;

    offerStartedRef.current = true;
    setStatusText("Call accepted. Connecting...");
    updateCallState(CALL_STATE.ACCEPTED);

    const peer = await createPeerConnection(call);
    if (!peer.localDescription && peer.signalingState === "stable") {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendCallSignal(call, "offer", { type: offer.type, sdp: offer.sdp });
    }
  }, [createPeerConnection, sendCallSignal, updateCallState]);

  const handleCallSignal = useCallback(async (signal, call) => {
    if (!signal?.id || processedSignalIdsRef.current.has(signal.id) || terminalRef.current) return;

    processedSignalIdsRef.current.add(signal.id);
    latestSignalIdRef.current = Math.max(latestSignalIdRef.current, signal.id);

    try {
      const peer = await createPeerConnection(call);

      if (signal.type === "offer") {
        if (peer.remoteDescription || peer.signalingState !== "stable") return;

        await peer.setRemoteDescription(new RTCSessionDescription(signal.payload));
        await flushQueuedIceCandidates(peer);

        if (!sentAnswerForOfferIdsRef.current.has(signal.id)) {
          sentAnswerForOfferIdsRef.current.add(signal.id);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await sendCallSignal(call, "answer", { type: answer.type, sdp: answer.sdp });
        }

        if (callStateRef.current !== CALL_STATE.CONNECTED) {
          setStatusText("Connecting...");
          updateCallState(CALL_STATE.ACCEPTED);
        }
        return;
      }

      if (signal.type === "answer") {
        if (peer.remoteDescription) return;

        await peer.setRemoteDescription(new RTCSessionDescription(signal.payload));
        await flushQueuedIceCandidates(peer);

        if (callStateRef.current !== CALL_STATE.CONNECTED) {
          setStatusText("Connecting...");
          updateCallState(CALL_STATE.ACCEPTED);
        }
        return;
      }

      if (signal.type === "ice") {
        if (!peer.remoteDescription) {
          queuedIceCandidatesRef.current.push(signal.payload);
          return;
        }

        await peer.addIceCandidate(new RTCIceCandidate(signal.payload));
      }
    } catch {
      await failCall();
    }
  }, [createPeerConnection, failCall, flushQueuedIceCandidates, sendCallSignal, updateCallState]);

  const pollCall = useCallback(async () => {
    if (!consultationId || !callId || terminalRef.current) return;

    try {
      const response = await axios.get(
        `${API_BASE_URL}/consultations/${consultationId}/calls/${callId}/signals?after_id=${latestSignalIdRef.current}`,
        authConfig()
      );

      const call = response.data.call;
      if (!call) return;

      const currentCallId = getCallId(call);
      if (activeCallIdRef.current && currentCallId && activeCallIdRef.current !== currentCallId) return;

      activeCallRef.current = call;
      activeCallIdRef.current = currentCallId;
      setActiveCall((current) => (
        current && getCallId(current) === getCallId(call) && current.status === call.status ? current : call
      ));

      if (TERMINAL_STATUSES.has(call.status)) {
        finishCall(terminalState(call.status), terminalMessage(call.status));
        return;
      }

      if (call.status === "ringing") {
        setStatusText("Dialing... Waiting for the user to accept.");
        updateCallState(CALL_STATE.DIALING);
        return;
      }

      if (call.status === "accepted") {
        if (mode === "caller") {
          await startCallerOffer(call);
        } else {
          setStatusText("Call accepted. Connecting...");
          updateCallState(CALL_STATE.ACCEPTED);
          await createPeerConnection(call);
        }
      }

      for (const signal of response.data.signals || []) {
        await handleCallSignal(signal, call);
      }
    } catch (error) {
      if ([404, 409, 410, 422].includes(error.response?.status)) {
        finishCall(CALL_STATE.ENDED, "The call has ended.");
        return;
      }

      await failCall(error.response?.data?.message || "Video call connection failed. Please try again.");
    }
  }, [callId, consultationId, createPeerConnection, failCall, finishCall, handleCallSignal, mode, startCallerOffer, updateCallState]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    let initTimer = null;

    if (!consultationId || !["caller", "receiver"].includes(mode || "")) {
      initTimer = window.setTimeout(() => {
        setCallError("Open this screen from the Consultation Video Call button.");
        updateCallState(CALL_STATE.FAILED);
      }, 0);
      return () => window.clearTimeout(initTimer);
    }

    if (!callId && mode === "caller" && bootStatus === "starting") {
      initTimer = window.setTimeout(() => {
        setStatusText("Starting video call...");
        updateCallState(CALL_STATE.DIALING);
      }, 0);
      return () => window.clearTimeout(initTimer);
    }

    if (!callId) {
      initTimer = window.setTimeout(() => {
        setCallError("Open this screen from the Consultation Video Call button.");
        updateCallState(CALL_STATE.FAILED);
      }, 0);
      return () => window.clearTimeout(initTimer);
    }

    activeCallIdRef.current = callId;
    initTimer = window.setTimeout(() => {
      setStatusText(mode === "caller" ? "Dialing..." : "Connecting...");
      updateCallState(mode === "caller" ? CALL_STATE.DIALING : CALL_STATE.ACCEPTED);
      void pollCall();
    }, 0);
    return () => window.clearTimeout(initTimer);
  }, [bootStatus, callId, consultationId, mode, pollCall, updateCallState]);

  useEffect(() => {
    if (!consultationId || !callId || terminalRef.current) return undefined;

    const interval = window.setInterval(() => {
      void pollCall();
    }, CALL_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [callId, consultationId, pollCall]);

  useEffect(() => {
    attachLocalStream();
    attachRemoteStream();
  }, [attachLocalStream, attachRemoteStream, hasLocalVideo, hasRemoteVideo]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanupMedia();
      if (autoCloseTimerRef.current) {
        window.clearTimeout(autoCloseTimerRef.current);
      }
      const token = getAuthToken();
      if (!token || !consultationId || !callId || terminalRef.current) return;

      void fetch(`${API_BASE_URL}/consultations/${consultationId}/calls/${callId}/end`, {
        method: "POST",
        keepalive: true,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (autoCloseTimerRef.current) {
        window.clearTimeout(autoCloseTimerRef.current);
      }
      cleanupMedia();
    };
  }, [callId, cleanupMedia, consultationId]);

  const endCurrentCall = useCallback(async () => {
    await endCallOnServer();
    finishCall(CALL_STATE.ENDED, "Call ended.");
  }, [endCallOnServer, finishCall]);

  const toggleMicrophone = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const nextMuted = !micMuted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMicMuted(nextMuted);
  }, [micMuted]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const nextOff = !cameraOff;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !nextOff;
    });
    setCameraOff(nextOff);
  }, [cameraOff]);

  const displayStatus = useMemo(() => {
    if (callError) return callError;
    if (mediaStarting) return "Starting camera...";
    if (callState === CALL_STATE.CONNECTED || hasRemoteVideo) return "Connected";
    return statusText;
  }, [callError, callState, hasRemoteVideo, mediaStarting, statusText]);

  const showSpinner = !callError && ![CALL_STATE.CONNECTED, CALL_STATE.DECLINED, CALL_STATE.CANCELLED, CALL_STATE.ENDED, CALL_STATE.FAILED].includes(callState);
  const showWaitingRemote = !hasRemoteVideo && ![CALL_STATE.DECLINED, CALL_STATE.CANCELLED, CALL_STATE.ENDED, CALL_STATE.FAILED].includes(callState);

  return (
    <main className="min-h-screen bg-slate-950 p-2 text-white sm:p-4">
      <section className="relative mx-auto flex min-h-[calc(100vh-1rem)] w-full max-w-7xl flex-col overflow-hidden rounded-none bg-slate-950 text-white shadow-2xl sm:min-h-[calc(100vh-2rem)] sm:rounded-3xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-pink-300">Project INAY video call</p>
            <h1 className="mt-1 truncate text-lg font-extrabold sm:text-2xl">{peerName}</h1>
            <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-slate-300">
              {showSpinner && <Spinner />}
              {displayStatus}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void endCurrentCall()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Close video call"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="relative min-h-0 flex-1 bg-slate-900">
          <video ref={remoteVideoRef} autoPlay playsInline className="h-full min-h-[70vh] w-full object-cover" />
          {showWaitingRemote && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-slate-200">
                {showSpinner ? <LoaderCircle className="h-7 w-7 animate-spin" /> : <VideoOff className="h-7 w-7" />}
              </div>
              <p className="rounded-full bg-white/10 px-4 py-2 text-sm font-extrabold text-slate-200">
                {callState === CALL_STATE.DIALING ? "Waiting for the user to accept." : "Waiting for remote video..."}
              </p>
            </div>
          )}

          <div className="absolute bottom-4 right-4 h-32 w-24 overflow-hidden rounded-2xl border border-white/20 bg-slate-800 shadow-2xl sm:h-44 sm:w-36">
            <video ref={localVideoRef} autoPlay muted playsInline className="h-full w-full scale-x-[-1] object-cover" />
            {(!hasLocalVideo || cameraOff) && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90">
                {cameraOff ? <CameraOff className="h-7 w-7 text-slate-300" /> : <VideoOff className="h-7 w-7 text-slate-300" />}
              </div>
            )}
            {micMuted && (
              <div className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white">
                <MicOff className="h-3.5 w-3.5" />
              </div>
            )}
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-center gap-3 border-t border-white/10 p-4">
          <button
            type="button"
            onClick={toggleMicrophone}
            disabled={!canControlMedia}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition disabled:opacity-40 ${
              micMuted ? "bg-red-600 text-white hover:bg-red-700" : "bg-white/10 text-white hover:bg-white/20"
            }`}
            aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {micMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={toggleCamera}
            disabled={!canControlMedia}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition disabled:opacity-40 ${
              cameraOff ? "bg-red-600 text-white hover:bg-red-700" : "bg-white/10 text-white hover:bg-white/20"
            }`}
            aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}
          >
            {cameraOff ? <CameraOff className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => void endCurrentCall()}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition hover:bg-red-700"
            aria-label="End call"
          >
            <PhoneOff className="h-6 w-6" />
          </button>
        </footer>
      </section>
    </main>
  );
}

export default memo(TelehealthVideoCallSession);
