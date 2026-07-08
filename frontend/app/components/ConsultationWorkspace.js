"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  Circle,
  FileText,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  ShieldAlert,
  Stethoscope,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { getAuthToken, getStoredUser } from "../utils/authSession";
import useApiQuery, { mutateApiCache } from "../hooks/useApiQuery";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";
const BACKEND_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "");

const topics = [
  "Pregnancy",
  "Postpartum Care",
  "Newborn Care",
  "Vaccinations",
  "Nutrition",
  "Family Planning",
  "Prenatal Records",
  "Other",
];

const quickTemplates = [
  "Please stay hydrated, rest, and monitor whether the symptoms become more frequent or severe.",
  "Please visit the nearest health center today for an in-person assessment.",
  "Continue taking your prescribed medicine as directed. Do not change the dose without consulting your healthcare provider.",
  "Please monitor fetal movement and seek urgent care if movement decreases significantly.",
];

const CHAT_MESSAGE_LIMIT = 1000;
const STANDARD_ATTACHMENT_LIMIT = 10 * 1024 * 1024;
const VIDEO_ATTACHMENT_LIMIT = 25 * 1024 * 1024;
const acceptedAttachmentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

const riskStyles = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-red-200 bg-red-50 text-red-700",
};

const riskLabels = {
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
};

const initials = (name = "IN") => name
  .split(" ")
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join("") || "IN";

const formatTime = (value) => value
  ? new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(new Date(value))
  : "";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value))
  : "Not provided";

const isVideoAttachment = (attachment) => attachment?.type?.startsWith("video/");

const attachmentSizeLimit = (file) => file?.type?.startsWith("video/")
  ? VIDEO_ATTACHMENT_LIMIT
  : STANDARD_ATTACHMENT_LIMIT;

const formatFileSize = (bytes = 0) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${bytes} B`;
};

const authConfig = () => ({
  headers: { Authorization: `Bearer ${getAuthToken()}` },
});

function SecureAttachment({ attachment }) {
  const [objectUrl, setObjectUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let generatedUrl = "";

    axios.get(`${BACKEND_BASE_URL}${attachment.url}`, {
      ...authConfig(),
      responseType: "blob",
    }).then((response) => {
      if (!active) return;
      generatedUrl = URL.createObjectURL(response.data);
      setObjectUrl(generatedUrl);
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      if (generatedUrl) URL.revokeObjectURL(generatedUrl);
    };
  }, [attachment.url]);

  if (loading) {
    return <div className="mt-2 flex items-center gap-2 text-xs"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading attachment...</div>;
  }

  if (!objectUrl) {
    return <p className="mt-2 text-xs font-bold text-red-600">Attachment unavailable</p>;
  }

  const isImage = attachment.type?.startsWith("image/");
  const isVideo = isVideoAttachment(attachment);

  if (isImage) {
    return (
    <a href={objectUrl} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-lg border border-black/10 bg-white/80">
      <div className="relative h-52 w-full">
        <Image src={objectUrl} alt={attachment.name} fill unoptimized className="object-contain" />
      </div>
      <span className="block truncate px-3 py-2 text-xs font-bold text-slate-700">{attachment.name}</span>
    </a>
    );
  }

  if (isVideo) {
    return (
      <div className="mt-2 overflow-hidden rounded-lg border border-black/10 bg-black">
        <video controls preload="metadata" className="max-h-72 w-full bg-black">
          <source src={objectUrl} type={attachment.type} />
        </video>
        <a href={objectUrl} download={attachment.name} className="block truncate bg-white/90 px-3 py-2 text-xs font-bold text-slate-700">
          {attachment.name}
        </a>
      </div>
    );
  }

  return (
    <a href={objectUrl} download={attachment.name} className="mt-2 flex items-center gap-2 rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-xs font-bold text-slate-700">
      <FileText className="h-4 w-4" />
      <span className="truncate">{attachment.name}</span>
    </a>
  );
}

function ConversationListSkeleton() {
  return (
    <div className="divide-y divide-slate-100" aria-label="Loading consultations">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="flex animate-pulse gap-3 px-4 py-4">
          <div className="h-11 w-11 shrink-0 rounded-full bg-slate-100" />
          <div className="min-w-0 flex-1">
            <div className="h-4 w-32 rounded bg-slate-100" />
            <div className="mt-3 h-3 w-20 rounded bg-slate-100" />
            <div className="mt-3 h-4 w-full rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatMessagesSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4" aria-label="Loading conversation">
      {[0, 1, 2].map((item) => (
        <div key={item} className={`flex ${item % 2 ? "justify-end" : "justify-start"}`}>
          <div className="h-24 w-[72%] animate-pulse rounded-lg bg-slate-100 shadow-sm" />
        </div>
      ))}
    </div>
  );
}

export default function ConsultationWorkspace({ mode }) {
  const isWorker = mode === "worker";
  const [currentUserId] = useState(() => {
    if (typeof window === "undefined") return null;
    return getStoredUser()?.id || null;
  });
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [search, setSearch] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [attachmentError, setAttachmentError] = useState("");
  const [selectedIecId, setSelectedIecId] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [resources, setResources] = useState([]);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [newForm, setNewForm] = useState({
    health_worker_id: "",
    topic: "Pregnancy",
    subject: "",
    initial_message: "",
  });
  const fileInputRef = useRef(null);
  const messageInputRef = useRef(null);
  const messageEndRef = useRef(null);
  const conversationsQuery = useApiQuery("/consultations", {
    refreshInterval: 10000,
    dedupingInterval: 5000,
  });
  const selectedQuery = useApiQuery(selectedId ? `/consultations/${selectedId}` : null, {
    refreshInterval: 7000,
    dedupingInterval: 3000,
  });

  useEffect(() => {
    const items = conversationsQuery.data?.consultations;
    if (!items) return;

    const timer = window.setTimeout(() => {
      setConversations(items);
      setSelectedId((current) => current || items[0]?.id || null);
      setLoadingList(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [conversationsQuery.data]);

  useEffect(() => {
    const consultation = selectedQuery.data?.consultation;
    if (!consultation) return;

    const timer = window.setTimeout(() => {
      setSelected(consultation);
      setOutcome(consultation.outcome || "");
      setConversations((current) => current.map((item) => item.id === consultation.id
        ? { ...item, ...consultation, unread_count: 0 }
        : item));
      setLoadingChat(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [selectedQuery.data]);

  const loadConversations = useCallback(async (silent = false) => {
    if (!silent && conversations.length === 0) setLoadingList(true);

    try {
      const response = await axios.get(`${API_BASE_URL}/consultations`, authConfig());
      const items = response.data.consultations || [];
      setConversations(items);
      setSelectedId((current) => current || items[0]?.id || null);
      mutateApiCache("/consultations", response.data, { revalidate: false });
    } catch (error) {
      if (!silent) {
        setNotice({ type: "error", text: error.response?.data?.message || "Unable to load consultations." });
      }
    } finally {
      if (!silent) setLoadingList(false);
    }
  }, [conversations.length]);

  const loadConversation = useCallback(async (id, silent = false) => {
    if (!id) return;
    if (!silent && !selected) setLoadingChat(true);

    try {
      const response = await axios.get(`${API_BASE_URL}/consultations/${id}`, authConfig());
      const consultation = response.data.consultation;
      setSelected(consultation);
      setOutcome(consultation.outcome || "");
      setConversations((current) => current.map((item) => item.id === id
        ? { ...item, ...consultation, unread_count: 0 }
        : item));
      mutateApiCache(`/consultations/${id}`, response.data, { revalidate: false });
    } catch (error) {
      if (!silent) {
        setNotice({ type: "error", text: error.response?.data?.message || "Unable to open this consultation." });
      }
    } finally {
      if (!silent) setLoadingChat(false);
    }
  }, [selected]);

  useEffect(() => {
    const refreshConversationsWhenVisible = () => {
      if (document.visibilityState === "visible") void loadConversations(true);
    };
    const initial = window.setTimeout(() => void loadConversations(), 0);
    const interval = window.setInterval(refreshConversationsWhenVisible, 10000);
    window.addEventListener("focus", refreshConversationsWhenVisible);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshConversationsWhenVisible);
    };
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const refreshSelectedWhenVisible = () => {
      if (document.visibilityState === "visible") void loadConversation(selectedId, true);
    };
    const initial = window.setTimeout(() => void loadConversation(selectedId), 0);
    const interval = window.setInterval(refreshSelectedWhenVisible, 7000);
    window.addEventListener("focus", refreshSelectedWhenVisible);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshSelectedWhenVisible);
    };
  }, [loadConversation, selectedId]);

  useEffect(() => {
    if (isWorker) {
      axios.get(`${API_BASE_URL}/consultations/iec-resources`, authConfig())
        .then((response) => setResources(response.data.resources || []))
        .catch(() => setResources([]));
      return;
    }

    axios.get(`${API_BASE_URL}/consultations/workers`, authConfig())
      .then((response) => setWorkers(response.data.workers || []))
      .catch(() => setWorkers([]));
  }, [isWorker]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [selected?.messages?.length]);

  useEffect(() => {
    const input = messageInputRef.current;
    if (!input) return;

    input.style.height = "44px";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [messageBody]);

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();

    return conversations.filter((conversation) => {
      const person = isWorker ? conversation.mother?.name : conversation.health_worker?.name;
      return !term
        || person?.toLowerCase().includes(term)
        || conversation.subject.toLowerCase().includes(term)
        || conversation.topic.toLowerCase().includes(term);
    });
  }, [conversations, isWorker, search]);

  const chooseConversation = (id) => {
    setSelectedId(id);
    setMobileChatOpen(true);
  };

  const handleMessageBodyChange = (value) => {
    setMessageBody(value.slice(0, CHAT_MESSAGE_LIMIT));
  };

  const handleAttachmentChange = (file) => {
    setAttachmentError("");

    if (!file) {
      setAttachment(null);
      return;
    }

    if (!acceptedAttachmentTypes.includes(file.type)) {
      setAttachment(null);
      setAttachmentError("Only JPG, PNG, WebP, PDF, MP4, MOV, and WebM files are allowed.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const limit = attachmentSizeLimit(file);
    if (file.size > limit) {
      setAttachment(null);
      setAttachmentError(`${file.type.startsWith("video/") ? "Video" : "Attachment"} must be ${formatFileSize(limit)} or smaller.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setAttachment(file);
  };

  const clearAttachment = () => {
    setAttachment(null);
    setAttachmentError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const sendMessage = async () => {
    if (!selectedId || sending || (!messageBody.trim() && !attachment && !selectedIecId)) return;
    if (messageBody.length > CHAT_MESSAGE_LIMIT) return;
    const formData = new FormData();
    if (messageBody.trim()) formData.append("body", messageBody.trim());
    if (attachment) formData.append("attachment", attachment);
    if (selectedIecId) formData.append("iec_video_id", selectedIecId);
    setSending(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/consultations/${selectedId}/messages`, formData, authConfig());
      const sentMessage = response.data.consultation_message;
      setMessageBody("");
      clearAttachment();
      setSelectedIecId("");
      if (sentMessage) {
        setSelected((current) => current?.id === selectedId
          ? {
            ...current,
            last_message: sentMessage,
            last_message_at: sentMessage.created_at,
            messages: [...(current.messages || []), sentMessage],
          }
          : current);
        setConversations((current) => current.map((item) => item.id === selectedId
          ? {
            ...item,
            last_message: sentMessage,
            last_message_at: sentMessage.created_at,
            unread_count: 0,
          }
          : item));
      }
      void loadConversation(selectedId, true);
      void loadConversations(true);
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.message || "Unable to send the message." });
    } finally {
      setSending(false);
    }
  };

  const createConsultation = async (event) => {
    event.preventDefault();

    try {
      const response = await axios.post(`${API_BASE_URL}/consultations`, {
        ...newForm,
        health_worker_id: Number(newForm.health_worker_id),
      }, authConfig());
      setIsNewOpen(false);
      setNewForm({ health_worker_id: "", topic: "Pregnancy", subject: "", initial_message: "" });
      setNotice({ type: "success", text: response.data.message });
      await loadConversations(true);
      setSelectedId(response.data.consultation.id);
      setMobileChatOpen(true);
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.message || "Unable to start the consultation." });
    }
  };

  const updateConsultation = async (updates, successText) => {
    if (!selectedId) return;

    try {
      const response = await axios.patch(`${API_BASE_URL}/consultations/${selectedId}`, updates, authConfig());
      setSelected(response.data.consultation);
      setOutcome(response.data.consultation.outcome || "");
      setNotice({ type: "success", text: successText || response.data.message });
      await loadConversations(true);
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.message || "Unable to update the consultation." });
    }
  };

  const counterpart = selected
    ? (isWorker ? selected.mother : selected.health_worker)
    : null;

  return (
    <div className="flex h-[calc(100vh-73px)] min-h-[620px] min-w-0 flex-col overflow-x-hidden bg-[#f7f9fc]">
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1500px] items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">
              {isWorker ? "Barangay Cohort • Consultations" : "Project INAY • Consultation"}
            </p>
            <h1 className="mt-2 text-lg font-extrabold text-slate-950 sm:text-2xl">
              {isWorker ? "Telehealth Program Staff Chat Queues" : "Consult Your Program Staff"}
            </h1>
            <p className="mt-1 hidden text-sm text-slate-500 sm:block">
              {isWorker
                ? "Reply directly, apply clinical templates, and record outcomes."
                : "Send questions and keep your care conversations in one secure history."}
            </p>
          </div>
          {!isWorker && (
            <button
              type="button"
              onClick={() => setIsNewOpen(true)}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-pink-600 px-4 text-sm font-extrabold text-white hover:bg-pink-700"
            >
              <Plus className="h-4 w-4" /> New Consultation
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className={`mx-4 mt-3 flex shrink-0 items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm font-bold sm:mx-6 ${
          notice.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-red-200 bg-red-50 text-red-700"
        }`}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className={`mx-auto grid min-h-0 w-full max-w-[1500px] flex-1 gap-0 p-3 sm:p-4 ${
        isWorker ? "md:grid-cols-[310px_minmax(0,1fr)] xl:grid-cols-[310px_minmax(0,1fr)_290px]" : "md:grid-cols-[320px_minmax(0,1fr)]"
      }`}>
        <aside className={`${mobileChatOpen ? "hidden" : "flex"} min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white md:flex md:rounded-r-none`}>
          <div className="border-b border-slate-200 p-4">
            <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400">
              {isWorker ? "Midwife Communications Queue" : "Consultation History"}
            </p>
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search conversations..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingList ? (
              <ConversationListSkeleton />
            ) : filteredConversations.length === 0 ? (
              <div className="flex h-full min-h-56 flex-col items-center justify-center px-6 text-center">
                <MessageCircle className="h-9 w-9 text-slate-300" />
                <p className="mt-3 font-extrabold text-slate-800">No consultations yet</p>
                <p className="mt-1 text-sm text-slate-500">{isWorker ? "Incoming patient messages will appear here." : "Start a consultation with your assigned Program Staff."}</p>
              </div>
            ) : filteredConversations.map((conversation) => {
              const person = isWorker ? conversation.mother : conversation.health_worker;
              const active = selectedId === conversation.id;

              return (
                <button
                  type="button"
                  key={conversation.id}
                  onClick={() => chooseConversation(conversation.id)}
                  className={`flex w-full gap-3 border-b border-slate-100 px-4 py-4 text-left transition ${active ? "bg-pink-50" : "hover:bg-slate-50"}`}
                >
                  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-pink-100 bg-pink-50 text-sm font-extrabold text-pink-600">
                    {initials(person?.name)}
                    <Circle className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 fill-emerald-500 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-extrabold text-slate-900">{person?.name}</p>
                      <span className="shrink-0 text-[10px] font-bold text-slate-400">{formatTime(conversation.last_message_at)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`rounded border px-1.5 py-0.5 text-[9px] font-extrabold uppercase ${riskStyles[conversation.risk_level]}`}>
                        {riskLabels[conversation.risk_level]}
                      </span>
                      {conversation.status === "resolved" && <span className="text-[10px] font-bold text-emerald-600">Resolved</span>}
                      {conversation.status === "escalated" && <span className="text-[10px] font-bold text-red-600">Escalated</span>}
                    </div>
                    <p className={`mt-2 truncate text-sm ${conversation.unread_count > 0 ? "font-extrabold text-slate-900" : "text-slate-500"}`}>
                      {conversation.last_message?.body || conversation.last_message?.attachment?.name || conversation.subject}
                    </p>
                  </div>
                  {conversation.unread_count > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-pink-600 px-1 text-[10px] font-extrabold text-white">{conversation.unread_count}</span>
                  )}
                  <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-slate-300 md:hidden" />
                </button>
              );
            })}
          </div>
        </aside>

        <section className={`${mobileChatOpen ? "flex" : "hidden"} min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white md:flex md:rounded-l-none ${isWorker ? "xl:rounded-r-none" : ""}`}>
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <Stethoscope className="h-12 w-12 text-pink-300" />
              <h2 className="mt-4 text-lg font-extrabold text-slate-900">Select a consultation</h2>
              <p className="mt-1 text-sm text-slate-500">Choose a conversation from the list to view its history.</p>
            </div>
          ) : (
            <>
              <header className="flex min-h-[72px] shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <button type="button" onClick={() => setMobileChatOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Back to conversations">
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-50 text-sm font-extrabold text-pink-600">{initials(counterpart?.name)}</div>
                  <div className="min-w-0">
                    <h2 className="truncate font-extrabold text-slate-950">{counterpart?.name}</h2>
                    <p className="truncate text-xs font-semibold text-slate-500">{selected.topic} • {selected.subject}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`hidden rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase sm:inline ${riskStyles[selected.risk_level]}`}>{riskLabels[selected.risk_level]}</span>
                  {counterpart?.phone && (
                    <a href={`tel:${counterpart.phone}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-pink-600 hover:bg-pink-50" aria-label={`Call ${counterpart.name}`}><Phone className="h-4 w-4" /></a>
                  )}
                </div>
              </header>

              {selected.risk_level === "high" && (
                <div className="flex shrink-0 items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-700">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  High-risk concern. For severe or worsening symptoms, contact emergency services or proceed to the nearest facility.
                </div>
              )}

              {isWorker && (
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
                  <select
                    value={selected.risk_level}
                    onChange={(event) => void updateConsultation({ risk_level: event.target.value }, "Risk rating updated.")}
                    className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-extrabold text-slate-700"
                    aria-label="Risk rating"
                  >
                    <option value="low">Low Risk</option>
                    <option value="medium">Medium Risk</option>
                    <option value="high">High Risk</option>
                  </select>
                  <button type="button" onClick={() => void updateConsultation({ status: "escalated", outcome }, "Case escalated for clinic assessment.")} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-extrabold text-red-700 hover:bg-red-100">
                    <AlertTriangle className="h-3.5 w-3.5" /> Escalate
                  </button>
                  <button type="button" onClick={() => void updateConsultation({ status: selected.status === "resolved" ? "open" : "resolved", outcome }, selected.status === "resolved" ? "Consultation reopened." : "Consultation resolved.")} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-700 hover:bg-emerald-100">
                    <Check className="h-3.5 w-3.5" /> {selected.status === "resolved" ? "Reopen" : "Resolve"}
                  </button>
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8fafc] px-4 py-5 sm:px-6">
                <div className="mx-auto max-w-3xl space-y-4">
                  {loadingChat && !selected.messages ? (
                    <ChatMessagesSkeleton />
                  ) : selected.messages?.map((message) => {
                    const own = Number(message.sender_user_id) === Number(currentUserId);

                    return (
                      <div key={message.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[88%] rounded-lg px-4 py-3 shadow-sm sm:max-w-[72%] ${
                          own ? "bg-pink-600 text-white" : "border border-slate-200 bg-white text-slate-800"
                        }`}>
                          <p className={`mb-1 text-[10px] font-extrabold uppercase ${own ? "text-pink-100" : "text-slate-400"}`}>{message.sender_name}</p>
                          {message.body && <p className="whitespace-pre-wrap text-sm font-medium leading-6">{message.body}</p>}
                          {message.attachment && <SecureAttachment attachment={message.attachment} />}
                          {message.iec_resource && (
                            <a href={message.iec_resource.url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-3 rounded-lg border border-black/10 bg-white/90 p-3 text-slate-800">
                              <BookOpen className="h-5 w-5 shrink-0 text-pink-600" />
                              <span className="min-w-0"><span className="block truncate text-xs font-extrabold">{message.iec_resource.title}</span><span className="text-[10px] text-slate-500">{message.iec_resource.category} • {message.iec_resource.duration_minutes} min</span></span>
                            </a>
                          )}
                          <div className={`mt-2 flex items-center justify-end gap-1 text-[10px] font-bold ${own ? "text-pink-100" : "text-slate-400"}`}>
                            {formatTime(message.created_at)}
                            {own && (message.read_at ? <CheckCheck className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messageEndRef} />
                </div>
              </div>

              {isWorker && selected.status !== "resolved" && (
                <div className="inay-scroll-x flex shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-2">
                  {quickTemplates.map((template, index) => (
                    <button key={template} type="button" onClick={() => handleMessageBodyChange(template)} className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-pink-300 hover:bg-pink-50">
                      Template {index + 1}
                    </button>
                  ))}
                </div>
              )}

              <footer className="shrink-0 border-t border-slate-200 bg-white p-3">
                {selected.status === "resolved" && !isWorker ? (
                  <div className="rounded-lg bg-emerald-50 px-4 py-3 text-center text-sm font-bold text-emerald-700">This consultation has been resolved.</div>
                ) : selected.status === "resolved" ? (
                  <p className="text-center text-sm font-bold text-slate-500">Reopen this consultation to send another message.</p>
                ) : (
                  <>
                    {(attachment || selectedIecId) && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {attachment && (
                          <span className="inline-flex max-w-full items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
                            {attachment.type?.startsWith("video/") ? <Video className="h-3.5 w-3.5 shrink-0" /> : <Paperclip className="h-3.5 w-3.5 shrink-0" />}
                            <span className="truncate">{attachment.name}</span>
                            <span className="shrink-0 text-slate-400">{formatFileSize(attachment.size)}</span>
                            <button type="button" onClick={clearAttachment} aria-label="Remove attachment"><X className="h-3.5 w-3.5" /></button>
                          </span>
                        )}
                        {selectedIecId && <span className="inline-flex items-center gap-2 rounded-md bg-pink-50 px-3 py-1.5 text-xs font-bold text-pink-700"><BookOpen className="h-3.5 w-3.5" />IEC material attached<button type="button" onClick={() => setSelectedIecId("")}><X className="h-3.5 w-3.5" /></button></span>}
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/quicktime,video/webm" onChange={(event) => handleAttachmentChange(event.target.files?.[0] || null)} className="hidden" />
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50" aria-label="Attach photo, document, or video"><Paperclip className="h-5 w-5" /></button>
                      {isWorker && resources.length > 0 && (
                        <select value={selectedIecId} onChange={(event) => setSelectedIecId(event.target.value)} className="h-11 max-w-36 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700" aria-label="Attach IEC material">
                          <option value="">IEC material</option>
                          {resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.title}</option>)}
                        </select>
                      )}
                      <div className="min-w-0 flex-1">
                        <textarea
                          ref={messageInputRef}
                          value={messageBody}
                          onChange={(event) => handleMessageBodyChange(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void sendMessage();
                            }
                          }}
                          rows={1}
                          maxLength={CHAT_MESSAGE_LIMIT}
                          placeholder={isWorker ? "Type official medical advice..." : "Type your health concern..."}
                          className="max-h-40 min-h-11 w-full resize-none overflow-y-auto rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
                        />
                        <div className={`mt-1 flex items-center justify-between gap-3 text-[10px] font-bold ${attachmentError ? "text-red-600" : "text-slate-400"}`}>
                          <span className="truncate">{attachmentError}</span>
                          <span className={messageBody.length > CHAT_MESSAGE_LIMIT * 0.9 ? "text-amber-600" : "text-slate-400"}>{messageBody.length}/{CHAT_MESSAGE_LIMIT}</span>
                        </div>
                      </div>
                      <button type="button" onClick={() => void sendMessage()} disabled={sending || (!messageBody.trim() && !attachment && !selectedIecId)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-pink-600 text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300" aria-label="Send message">
                        {sending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                      </button>
                    </div>
                  </>
                )}
                {!isWorker && selected.status !== "resolved" && (
                  <button type="button" onClick={() => void updateConsultation({ status: "resolved" }, "Consultation marked as resolved.")} className="mt-2 text-xs font-extrabold text-emerald-700 hover:underline">Mark consultation as resolved</button>
                )}
              </footer>
            </>
          )}
        </section>

        {isWorker && (
          <aside className="hidden min-h-0 overflow-y-auto rounded-r-lg border border-l-0 border-slate-200 bg-white p-5 xl:block">
            {selected?.mother ? (
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Maternal Record</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pink-50 font-extrabold text-pink-600">{initials(selected.mother.name)}</div>
                  <div><h3 className="font-extrabold text-slate-900">{selected.mother.name}</h3><p className="text-xs text-slate-500">{selected.mother.phone || "No phone provided"}</p></div>
                </div>
                <dl className="mt-5 space-y-4 border-y border-slate-200 py-5 text-sm">
                  <div><dt className="font-bold text-slate-400">Current Status</dt><dd className="mt-1 font-extrabold text-pink-600">{selected.mother.pregnancy_status === "postpartum" ? `${selected.mother.postpartum_week || ""} Weeks Postpartum` : selected.mother.pregnancy_week ? `Pregnancy Week ${selected.mother.pregnancy_week}` : "Not provided"}</dd></div>
                  <div><dt className="font-bold text-slate-400">Blood Type</dt><dd className="mt-1 font-extrabold text-slate-800">{selected.mother.blood_type || "Not provided"}</dd></div>
                  <div><dt className="font-bold text-slate-400">Due Date</dt><dd className="mt-1 font-extrabold text-slate-800">{formatDate(selected.mother.due_date)}</dd></div>
                  <div><dt className="font-bold text-slate-400">Next Visit</dt><dd className="mt-1 font-extrabold text-slate-800">{formatDate(selected.mother.next_scheduled_visit)}</dd></div>
                  <div><dt className="font-bold text-slate-400">Last Weight</dt><dd className="mt-1 font-extrabold text-slate-800">{selected.mother.last_weight_kg ? `${selected.mother.last_weight_kg} kg` : "Not logged"}</dd></div>
                  <div><dt className="font-bold text-slate-400">Address</dt><dd className="mt-1 flex gap-1 font-semibold text-slate-700"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pink-500" />{selected.mother.address || "Not provided"}</dd></div>
                </dl>
                <label className="mt-5 block text-xs font-extrabold uppercase text-slate-500">Consultation Outcome</label>
                <textarea value={outcome} onChange={(event) => setOutcome(event.target.value)} rows={5} placeholder="Document advice, referral, or follow-up outcome..." className="mt-2 w-full resize-none rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100" />
                <button type="button" onClick={() => void updateConsultation({ outcome }, "Consultation outcome saved.")} className="mt-3 h-10 w-full rounded-lg bg-slate-900 text-sm font-extrabold text-white hover:bg-slate-800">Save Outcome</button>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center"><UserRound className="h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-500">Patient details appear here.</p></div>
            )}
          </aside>
        )}
      </div>

      {isNewOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/65 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsNewOpen(false); }}>
          <form onSubmit={createConsultation} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-xl font-extrabold text-slate-950">Start a Consultation</h2><p className="mt-1 text-sm text-slate-500">Send your concern to Program Staff assigned to your casefile.</p></div>
              <button type="button" onClick={() => setIsNewOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            {workers.length === 0 ? (
              <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">No Program Staff is assigned to your casefile yet. Ask your health center to add you to Mothers Casefiles under Program Staff.</div>
            ) : (
              <div className="mt-6 space-y-4">
                <label className="block"><span className="mb-2 block text-xs font-extrabold uppercase text-slate-600">Program Staff</span><select required value={newForm.health_worker_id} onChange={(event) => setNewForm({ ...newForm, health_worker_id: event.target.value })} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold outline-none focus:border-pink-500"><option value="">Select assigned staff</option>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name} - {worker.profession}</option>)}</select></label>
                <label className="block"><span className="mb-2 block text-xs font-extrabold uppercase text-slate-600">Topic</span><select value={newForm.topic} onChange={(event) => setNewForm({ ...newForm, topic: event.target.value })} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold outline-none focus:border-pink-500">{topics.map((topic) => <option key={topic}>{topic}</option>)}</select></label>
                <label className="block"><span className="mb-2 block text-xs font-extrabold uppercase text-slate-600">Subject</span><input required maxLength={255} value={newForm.subject} onChange={(event) => setNewForm({ ...newForm, subject: event.target.value })} placeholder="Briefly describe your concern" className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100" /></label>
                <label className="block"><span className="mb-2 block text-xs font-extrabold uppercase text-slate-600">Message</span><textarea required maxLength={5000} rows={5} value={newForm.initial_message} onChange={(event) => setNewForm({ ...newForm, initial_message: event.target.value })} placeholder="Describe your symptoms or question with relevant details..." className="w-full resize-none rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100" /></label>
                <div className="flex justify-end gap-3"><button type="button" onClick={() => setIsNewOpen(false)} className="h-11 rounded-lg border border-slate-300 px-5 text-sm font-extrabold text-slate-700">Cancel</button><button type="submit" className="inline-flex h-11 items-center gap-2 rounded-lg bg-pink-600 px-5 text-sm font-extrabold text-white hover:bg-pink-700"><Send className="h-4 w-4" /> Send Consultation</button></div>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
