"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  MessageCircle,
  MessageSquare,
  Mic,
  MoreVertical,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Smile,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { getActivePortal, getAuthToken, getStoredUser } from "../utils/authSession";
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
  "Please monitor your symptoms and message us again if anything worsens.",
  "Please visit the nearest health center today for an in-person assessment.",
  "Continue your prescribed medicine as directed unless your clinician advises otherwise.",
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
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
];

const riskStyles = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-red-200 bg-red-50 text-red-700",
};

const riskLabels = {
  low: "Low Risk",
  medium: "Moderate Risk",
  high: "High Risk",
};

const authConfig = () => ({
  headers: { Authorization: `Bearer ${getAuthToken()}` },
});

const TelehealthIncomingCallListener = dynamic(() => import("./TelehealthIncomingCallListener"), {
  ssr: false,
});

const initials = (name = "IN") => name
  .split(" ")
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join("") || "IN";

const formatTime = (value) => {
  if (!value) return "";

  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
};

const formatFileSize = (bytes = 0) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${bytes} B`;
};

const messageTimeValue = (message) => new Date(message.created_at || 0).getTime();

const sortMessages = (messages = []) => [...messages].sort((a, b) => {
  const aTime = messageTimeValue(a);
  const bTime = messageTimeValue(b);

  if (aTime !== bTime) return aTime - bTime;

  return String(a.id).localeCompare(String(b.id));
});

const mergeMessagesById = (current = [], incoming = []) => {
  const byId = new Map();

  [...current, ...incoming].forEach((message) => {
    if (message?.id !== undefined && message?.id !== null) {
      byId.set(String(message.id), message);
    }
  });

  return sortMessages([...byId.values()]);
};

const replaceOptimisticMessage = (messages = [], tempId, serverMessage) => {
  const withoutTemp = messages.filter((message) => String(message.id) !== String(tempId));
  return mergeMessagesById(withoutTemp, [serverMessage]);
};

const apiErrorMessage = (error, fallback) => {
  const fieldErrors = error.response?.data?.errors;
  const firstFieldError = fieldErrors && Object.values(fieldErrors).flat().find(Boolean);
  return firstFieldError || error.response?.data?.message || fallback;
};

const videoCallUrl = ({ mode, consultationId, callId, name, status }) => {
  const params = new URLSearchParams({
    mode,
    consultationId: String(consultationId || ""),
  });

  if (callId) params.set("callId", String(callId));
  if (name) params.set("name", name);
  if (status) params.set("status", status);

  return `/consultation/video-call?${params.toString()}`;
};

const pregnancyStageLabel = (mother) => {
  if (!mother) return "Mother";

  if (mother.pregnancy_status === "postpartum") {
    return mother.postpartum_week ? `${mother.postpartum_week} Weeks Postpartum` : "Postpartum";
  }

  if (mother.pregnancy_week) return `${mother.pregnancy_week} Weeks Pregnant`;
  if (mother.pregnancy_month) return `Month ${mother.pregnancy_month} Pregnancy`;

  return "Mother";
};

const workerRoleLabel = (worker) => worker?.position_title || worker?.profession || "Program Staff";

const presenceLabel = (lastActivity) => {
  if (!lastActivity) return "Offline";

  const minutes = (Date.now() - new Date(lastActivity).getTime()) / 60000;
  if (minutes <= 15) return "Online";
  if (minutes <= 60) return `Last seen ${Math.max(1, Math.round(minutes))} min ago`;

  return "Offline";
};

const attachmentLimit = (file) => file?.type?.startsWith("video/")
  ? VIDEO_ATTACHMENT_LIMIT
  : STANDARD_ATTACHMENT_LIMIT;

const attachmentPreviewText = (message) => {
  if (message?.body) return message.body;
  if (message?.attachment?.name) return message.attachment.name;
  if (message?.iec_resource?.title) return message.iec_resource.title;

  return "No messages yet";
};

function Avatar({ name, photoUrl, active = false, size = "md" }) {
  const sizeClass = size === "lg" ? "h-12 w-12" : "h-11 w-11";

  return (
    <div className={`relative shrink-0 ${sizeClass}`}>
      <div className={`flex ${sizeClass} items-center justify-center overflow-hidden rounded-full bg-pink-50 text-sm font-extrabold text-pink-600 ring-1 ring-pink-100`}>
        {photoUrl ? (
          <div
            role="img"
            aria-label={name || "Profile photo"}
            className="h-full w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${photoUrl})` }}
          />
        ) : (
          initials(name)
        )}
      </div>
      <span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${active ? "bg-emerald-500" : "bg-slate-300"}`} />
    </div>
  );
}

function SecureAttachment({ attachment, own }) {
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
    }).catch(() => {
      if (active) setObjectUrl("");
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      if (generatedUrl) URL.revokeObjectURL(generatedUrl);
    };
  }, [attachment.url]);

  if (loading) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs font-bold">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        Loading attachment
      </div>
    );
  }

  if (!objectUrl) {
    return <p className="mt-2 text-xs font-bold text-red-600">Attachment unavailable</p>;
  }

  const isImage = attachment.type?.startsWith("image/");
  const isVideo = attachment.type?.startsWith("video/");
  const isAudio = attachment.type?.startsWith("audio/");

  if (isImage) {
    return (
      <a href={objectUrl} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-xl border border-black/10 bg-white">
        <div className="relative h-52 w-full">
          <Image src={objectUrl} alt={attachment.name || "Attached image"} fill unoptimized className="object-contain" />
        </div>
        <span className="block truncate px-3 py-2 text-xs font-bold text-slate-700">{attachment.name}</span>
      </a>
    );
  }

  if (isVideo) {
    return (
      <div className="mt-2 overflow-hidden rounded-xl border border-black/10 bg-black">
        <video controls preload="metadata" className="max-h-72 w-full bg-black">
          <source src={objectUrl} type={attachment.type} />
        </video>
        <a href={objectUrl} download={attachment.name} className="block truncate bg-white px-3 py-2 text-xs font-bold text-slate-700">
          {attachment.name}
        </a>
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className="mt-2 rounded-xl border border-black/10 bg-white p-3">
        <audio controls preload="metadata" className="w-full">
          <source src={objectUrl} type={attachment.type} />
        </audio>
        <a href={objectUrl} download={attachment.name} className="mt-2 block truncate text-xs font-bold text-slate-700">
          {attachment.name}
        </a>
      </div>
    );
  }

  return (
    <a
      href={objectUrl}
      download={attachment.name}
      className={`mt-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${
        own ? "border-white/20 bg-white/10 text-white" : "border-slate-200 bg-white text-slate-700"
      }`}
    >
      <FileText className="h-4 w-4" />
      <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
    </a>
  );
}

function ConversationListSkeleton() {
  return (
    <div className="space-y-2 p-3" aria-label="Loading conversations">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="flex animate-pulse gap-3 rounded-2xl p-3">
          <div className="h-11 w-11 shrink-0 rounded-full bg-slate-100" />
          <div className="min-w-0 flex-1">
            <div className="h-4 w-32 rounded bg-slate-100" />
            <div className="mt-2 h-3 w-24 rounded bg-slate-100" />
            <div className="mt-3 h-4 w-full rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading messages">
      {[0, 1, 2].map((item) => (
        <div key={item} className={`flex ${item % 2 ? "justify-end" : "justify-start"}`}>
          <div className="h-20 w-[70%] animate-pulse rounded-2xl bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export default function ConsultationWorkspace({ mode }) {
  const isWorker = mode === "worker";
  const [isClientReady, setIsClientReady] = useState(false);
  const [currentUserId] = useState(() => {
    if (typeof window === "undefined") return null;
    return getStoredUser()?.id || null;
  });
  const [currentUserRole] = useState(() => {
    if (typeof window === "undefined") return isWorker ? "health_worker" : "mother";
    return getActivePortal() || getStoredUser()?.role || (isWorker ? "health_worker" : "mother");
  });
  const [selectedContactKey, setSelectedContactKey] = useState("");
  const [selected, setSelected] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [assignedMothers, setAssignedMothers] = useState([]);
  const [resources, setResources] = useState([]);
  const [search, setSearch] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [attachmentError, setAttachmentError] = useState("");
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState("");
  const [selectedIecId, setSelectedIecId] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [notice, setNotice] = useState(null);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [callLoading, setCallLoading] = useState(false);
  const [newForm, setNewForm] = useState({
    health_worker_id: "",
    topic: "Pregnancy",
    subject: "",
    initial_message: "",
  });
  const fileInputRef = useRef(null);
  const messageInputRef = useRef(null);
  const messageEndRef = useRef(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsClientReady(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const conversationsQuery = useApiQuery(isClientReady ? "/consultations" : null, {
    refreshInterval: 4000,
    dedupingInterval: 2000,
  });

  const conversations = useMemo(() => conversationsQuery.data?.consultations || [], [conversationsQuery.data]);
  const loadingList = !isClientReady || (conversationsQuery.isLoading && conversations.length === 0);

  const contactItems = useMemo(() => {
    const contacts = new Map();

    conversations.forEach((conversation) => {
      const person = isWorker ? conversation.mother : conversation.health_worker;
      if (!person?.id) return;

      const key = `${isWorker ? "mother" : "worker"}-${person.id}`;
      contacts.set(key, {
        key,
        kind: isWorker ? "mother" : "worker",
        conversationId: conversation.id,
        person,
        title: person.name,
        subtitle: isWorker ? pregnancyStageLabel(person) : workerRoleLabel(person),
        lastMessage: conversation.last_message,
        timestamp: conversation.last_message_at || conversation.created_at,
        unreadCount: conversation.unread_count || 0,
        risk: conversation.risk_level || person.risk_rating || "low",
        statusText: presenceLabel(conversation.last_message_at || conversation.created_at),
      });
    });

    if (isWorker) {
      assignedMothers.forEach((mother) => {
        const key = `mother-${mother.id}`;
        if (contacts.has(key)) return;

        contacts.set(key, {
          key,
          kind: "mother",
          conversationId: null,
          person: mother,
          title: mother.name,
          subtitle: pregnancyStageLabel(mother),
          lastMessage: null,
          timestamp: mother.registered_at,
          unreadCount: 0,
          risk: mother.risk_rating || "low",
          statusText: "Offline",
        });
      });
    } else {
      workers.forEach((worker) => {
        const key = `worker-${worker.id}`;
        if (contacts.has(key)) return;

        contacts.set(key, {
          key,
          kind: "worker",
          conversationId: null,
          person: worker,
          title: worker.name,
          subtitle: workerRoleLabel(worker),
          lastMessage: null,
          timestamp: null,
          unreadCount: 0,
          risk: "low",
          statusText: worker.verification_status === "verified" ? "Online" : "Offline",
        });
      });
    }

    const term = search.trim().toLowerCase();
    const items = [...contacts.values()].filter((item) => {
      if (!term) return true;

      return item.title?.toLowerCase().includes(term)
        || item.subtitle?.toLowerCase().includes(term)
        || attachmentPreviewText(item.lastMessage).toLowerCase().includes(term);
    });

    return items.sort((a, b) => {
      if (isWorker && a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;

      const aTime = new Date(a.timestamp || 0).getTime();
      const bTime = new Date(b.timestamp || 0).getTime();
      if (aTime !== bTime) return bTime - aTime;

      return a.title.localeCompare(b.title);
    });
  }, [assignedMothers, conversations, isWorker, search, workers]);

  const selectedContact = useMemo(() => {
    return contactItems.find((item) => item.key === selectedContactKey) || contactItems[0] || null;
  }, [contactItems, selectedContactKey]);

  const selectedId = selectedContact?.conversationId || null;

  const selectedQuery = useApiQuery(isClientReady && selectedId ? `/consultations/${selectedId}` : null, {
    refreshInterval: 2500,
    dedupingInterval: 1200,
  });

  useEffect(() => {
    if (selectedContactKey || contactItems.length === 0) return undefined;

    const timer = window.setTimeout(() => {
      setSelectedContactKey(contactItems[0].key);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [contactItems, selectedContactKey]);

  useEffect(() => {
    const consultation = selectedQuery.data?.consultation;
    if (!consultation) {
      if (!selectedId) {
        const timer = window.setTimeout(() => setSelected(null), 0);
        return () => window.clearTimeout(timer);
      }
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setSelected((current) => ({
        ...consultation,
        messages: current?.id === consultation.id
          ? mergeMessagesById(current.messages || [], consultation.messages || []).filter((message) => !message.pending)
          : sortMessages(consultation.messages || []),
      }));
      setLoadingChat(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [selectedId, selectedQuery.data]);

  useEffect(() => {
    if (!isClientReady) return undefined;

    if (isWorker) {
      axios.get(`${API_BASE_URL}/health-worker/casefiles`, authConfig())
        .then((response) => setAssignedMothers(response.data.mothers || []))
        .catch(() => setAssignedMothers([]));

      axios.get(`${API_BASE_URL}/consultations/iec-resources`, authConfig())
        .then((response) => setResources(response.data.resources || []))
        .catch(() => setResources([]));

      return;
    }

    axios.get(`${API_BASE_URL}/consultations/workers`, authConfig())
      .then((response) => setWorkers(response.data.workers || []))
      .catch(() => setWorkers([]));
  }, [isClientReady, isWorker]);

  useEffect(() => {
    let objectUrl = "";

    if (!attachment || (!attachment.type?.startsWith("image/") && !attachment.type?.startsWith("video/"))) {
      const timer = window.setTimeout(() => setAttachmentPreviewUrl(""), 0);
      return () => window.clearTimeout(timer);
    }

    objectUrl = URL.createObjectURL(attachment);
    const timer = window.setTimeout(() => setAttachmentPreviewUrl(objectUrl), 0);

    return () => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
    };
  }, [attachment]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [selected?.messages?.length, selectedId]);

  useEffect(() => {
    const input = messageInputRef.current;
    if (!input) return;

    input.style.height = "44px";
    input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
  }, [messageBody]);

  const viewerRole = selected?.viewer_role || currentUserRole || (isWorker ? "health_worker" : "mother");
  const viewerId = selected?.viewer_user_id || currentUserId;

  const isOwnMessage = useCallback((message) => {
    if (typeof message.is_mine === "boolean") return message.is_mine;

    const senderId = message.sender_user_id || message.sender_id;

    return Number(senderId) === Number(viewerId)
      && (!message.sender_role || !viewerRole || message.sender_role === viewerRole);
  }, [viewerId, viewerRole]);

  const loadConversation = useCallback(async (id, silent = false) => {
    if (!id) return;
    if (!silent) setLoadingChat(true);

    try {
      const response = await axios.get(`${API_BASE_URL}/consultations/${id}`, authConfig());
      const consultation = response.data.consultation;
      setSelected((current) => ({
        ...consultation,
        messages: current?.id === id
          ? mergeMessagesById(current.messages || [], consultation.messages || []).filter((message) => !message.pending)
          : sortMessages(consultation.messages || []),
      }));
      mutateApiCache(`/consultations/${id}`, response.data, { revalidate: false });
    } catch (error) {
      if (!silent) setNotice({ type: "error", text: error.response?.data?.message || "Unable to open this conversation." });
    } finally {
      if (!silent) setLoadingChat(false);
    }
  }, []);

  const selectContact = (item) => {
    setSelectedContactKey(item.key);
    setMobileChatOpen(true);
    setAttachment(null);
    setAttachmentError("");
    setMessageBody("");
    setSelectedIecId("");
    if (item.conversationId) {
      void loadConversation(item.conversationId);
    }
  };

  const openNewConsultation = (worker = null) => {
    setNewForm({
      health_worker_id: worker?.id ? String(worker.id) : "",
      topic: "Pregnancy",
      subject: "",
      initial_message: "",
    });
    setIsNewOpen(true);
  };

  const handleAttachmentChange = (file) => {
    setAttachmentError("");

    if (!file) {
      setAttachment(null);
      return;
    }

    if (!acceptedAttachmentTypes.includes(file.type)) {
      setAttachment(null);
      setAttachmentError("Only images, PDF, video, and audio files are allowed.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const limit = attachmentLimit(file);
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

  const loadOlderMessages = async () => {
    if (!selectedId || loadingOlder || !selected?.message_page?.has_older || !selected.message_page.oldest_id) return;

    setLoadingOlder(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/consultations/${selectedId}/messages?before_id=${selected.message_page.oldest_id}`,
        authConfig()
      );
      setSelected((current) => current?.id === selectedId
        ? {
          ...current,
          messages: mergeMessagesById(response.data.messages || [], current.messages || []),
          message_page: response.data.meta || current.message_page,
        }
        : current);
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.message || "Unable to load older messages." });
    } finally {
      setLoadingOlder(false);
    }
  };

  const sendMessage = async () => {
    if (!selectedId || sending || (!messageBody.trim() && !attachment && !selectedIecId)) return;

    const trimmedBody = messageBody.trim();
    const queuedAttachment = attachment;
    const queuedIecId = selectedIecId;
    const tempId = `pending-${Date.now()}`;
    const receiver = viewerRole === "mother" ? selected?.health_worker : selected?.mother;
    const optimisticMessage = {
      id: tempId,
      sender_id: viewerId,
      sender_user_id: viewerId,
      sender_role: viewerRole,
      receiver_id: receiver?.user_id || null,
      receiver_user_id: receiver?.user_id || null,
      receiver_role: viewerRole === "mother" ? "health_worker" : "mother",
      sender_name: "You",
      is_mine: true,
      body: trimmedBody,
      attachment: null,
      pending_attachment: queuedAttachment ? {
        name: queuedAttachment.name,
        type: queuedAttachment.type,
        size: queuedAttachment.size,
      } : null,
      iec_resource: queuedIecId ? { id: queuedIecId, title: "IEC material", category: "Resource" } : null,
      created_at: new Date().toISOString(),
      read_at: null,
      pending: true,
    };

    const formData = new FormData();
    if (trimmedBody) formData.append("body", trimmedBody);
    if (queuedAttachment) formData.append("attachment", queuedAttachment);
    if (queuedIecId) formData.append("iec_video_id", queuedIecId);

    setSending(true);
    setMessageBody("");
    clearAttachment();
    setSelectedIecId("");
    setSelected((current) => current?.id === selectedId
      ? {
        ...current,
        last_message: optimisticMessage,
        last_message_at: optimisticMessage.created_at,
        messages: mergeMessagesById(current.messages || [], [optimisticMessage]),
      }
      : current);

    try {
      const response = await axios.post(`${API_BASE_URL}/consultations/${selectedId}/messages`, formData, authConfig());
      const sentMessage = response.data.consultation_message;
      if (sentMessage) {
        setSelected((current) => current?.id === selectedId
          ? {
            ...current,
            last_message: sentMessage,
            last_message_at: sentMessage.created_at,
            messages: replaceOptimisticMessage(current.messages || [], tempId, sentMessage),
          }
          : current);
      }
      mutateApiCache("/consultations");
      void loadConversation(selectedId, true);
    } catch (error) {
      setSelected((current) => current?.id === selectedId
        ? {
          ...current,
          messages: (current.messages || []).filter((message) => String(message.id) !== tempId),
        }
        : current);
      setMessageBody(trimmedBody);
      if (queuedAttachment) setAttachment(queuedAttachment);
      if (queuedIecId) setSelectedIecId(queuedIecId);
      setNotice({ type: "error", text: apiErrorMessage(error, "Unable to send the message.") });
    } finally {
      setSending(false);
    }
  };

  const createConsultation = async (event) => {
    event.preventDefault();

    try {
      const payload = {
        ...newForm,
        health_worker_id: Number(newForm.health_worker_id),
      };
      const response = await axios.post(`${API_BASE_URL}/consultations`, payload, authConfig());
      setIsNewOpen(false);
      setNotice({ type: "success", text: response.data.message || "Consultation started." });
      setSelectedContactKey(`worker-${payload.health_worker_id}`);
      setMobileChatOpen(true);
      setNewForm({ health_worker_id: "", topic: "Pregnancy", subject: "", initial_message: "" });
      mutateApiCache("/consultations");
      if (response.data.consultation?.id) void loadConversation(response.data.consultation.id);
    } catch (error) {
      setNotice({ type: "error", text: apiErrorMessage(error, "Unable to start the consultation.") });
    }
  };

  const counterpart = selected
    ? (isWorker ? selected.mother : selected.health_worker)
    : selectedContact?.person || null;
  const headerSubtitle = isWorker
    ? `Mother • ${pregnancyStageLabel(counterpart)} • ${selectedContact?.statusText || "Offline"}`
    : `${workerRoleLabel(counterpart)} • ${selectedContact?.statusText || "Offline"}`;
  const canSend = Boolean(selectedId);

  const handleVoiceCall = () => {
    if (!counterpart?.phone) {
      setNotice({ type: "error", text: "No phone number provided." });
      return;
    }

    window.location.href = `tel:${counterpart.phone}`;
  };

  const handleSms = () => {
    if (!counterpart?.phone) {
      setNotice({ type: "error", text: "No phone number provided." });
      return;
    }

    window.location.href = `sms:${counterpart.phone}`;
  };

  const startVideoCall = async () => {
    if (!selectedId) {
      setNotice({ type: "error", text: "Start or select a consultation before calling." });
      return;
    }

    if (callLoading) return;

    const counterpartName = counterpart?.name || selectedContact?.title || "Project INAY user";
    const startingUrl = videoCallUrl({
      mode: "caller",
      consultationId: selectedId,
      name: counterpartName,
      status: "starting",
    });

    const callWindow = window.open(startingUrl, "_blank", "width=1180,height=820");

    setCallLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/consultations/${selectedId}/calls`, {}, authConfig());
      const call = response.data.call;

      if (!call?.id) {
        throw new Error("Unable to create a video call session.");
      }

      const callUrl = videoCallUrl({
        mode: "caller",
        consultationId: selectedId,
        callId: call.id,
        name: call.other_user?.name || counterpartName,
      });

      if (callWindow && !callWindow.closed) {
        callWindow.location.href = callUrl;
      } else {
        window.open(callUrl, "_blank", "width=1180,height=820");
      }
    } catch (error) {
      if (callWindow && !callWindow.closed) callWindow.close();
      setNotice({ type: "error", text: apiErrorMessage(error, "Unable to start video call.") });
    } finally {
      setCallLoading(false);
    }
  };

  const handleVideoCallBusyChange = useCallback((isBusy) => {
    setCallLoading(isBusy);
  }, []);

  const handleVideoCallNotice = useCallback((nextNotice) => {
    setNotice(nextNotice);
  }, []);

  const applyTemplate = (template) => {
    setMessageBody((current) => current ? `${current}\n${template}` : template);
    messageInputRef.current?.focus();
  };

  return (
    <main className="flex h-[calc(100vh-68px)] min-h-[620px] min-w-0 flex-col overflow-hidden bg-[#f7f9fc] text-slate-950">
      <section className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">
              {isWorker ? "Program Staff Portal" : "Mother Portal"}
            </p>
            <h1 className="mt-1 truncate text-xl font-extrabold text-slate-950 sm:text-2xl">
              {isWorker ? "Program Staff Consultation" : "Consultation"}
            </h1>
            <p className="mt-1 hidden text-sm font-semibold text-slate-500 sm:block">
              {isWorker ? "Respond to assigned mothers in one secure chat workspace." : "Message your assigned Program Staff in one secure care conversation."}
            </p>
          </div>

          {!isWorker && (
            <button
              type="button"
              onClick={() => openNewConsultation()}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-pink-600 px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-pink-700"
            >
              <Plus className="h-4 w-4" />
              New Consultation
            </button>
          )}
        </div>
      </section>

      {notice && (
        <div className={`mx-4 mt-3 flex shrink-0 items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 text-sm font-bold sm:mx-6 ${
          notice.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-red-200 bg-red-50 text-red-700"
        }`}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mx-auto grid min-h-0 w-full max-w-[1500px] flex-1 gap-0 p-3 sm:p-4 md:grid-cols-[340px_minmax(0,1fr)]">
        <aside className={`${mobileChatOpen ? "hidden" : "flex"} min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm md:flex md:rounded-r-none`}>
          <div className="border-b border-slate-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
                {isWorker ? "Mothers" : "Program Staff"}
              </p>
              <span className="rounded-full bg-pink-50 px-2.5 py-1 text-[10px] font-extrabold text-pink-600">
                {contactItems.length}
              </span>
            </div>
            <label className="relative mt-3 block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search conversation"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold outline-none transition focus:border-pink-400 focus:bg-white focus:ring-4 focus:ring-pink-100"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loadingList ? (
              <ConversationListSkeleton />
            ) : contactItems.length === 0 ? (
              <div className="flex h-full min-h-60 flex-col items-center justify-center px-6 text-center">
                <MessageCircle className="h-10 w-10 text-slate-300" />
                <p className="mt-3 font-extrabold text-slate-900">No contacts yet</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {isWorker ? "Assigned mothers will appear here." : "Assigned Program Staff will appear here."}
                </p>
              </div>
            ) : contactItems.map((item) => {
              const active = selectedContact?.key === item.key;
              const online = item.statusText === "Online";
              const preview = attachmentPreviewText(item.lastMessage);

              return (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => {
                    if (!item.conversationId && !isWorker) {
                      openNewConsultation(item.person);
                      return;
                    }
                    selectContact(item);
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                    active ? "bg-pink-50 ring-1 ring-pink-100" : "hover:bg-slate-50"
                  }`}
                >
                  <Avatar name={item.title} photoUrl={item.person?.profile_photo_url} active={online} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-slate-950">{item.title}</p>
                        <div className="mt-0.5 flex min-w-0 items-center gap-2">
                          <span className="truncate text-[11px] font-bold text-slate-500">{item.subtitle}</span>
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${online ? "bg-emerald-500" : "bg-slate-300"}`} />
                          <span className="truncate text-[10px] font-bold text-slate-400">{item.statusText}</span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] font-bold text-slate-400">{formatTime(item.timestamp)}</span>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      {isWorker && (
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase ${riskStyles[item.risk] || riskStyles.low}`}>
                          {riskLabels[item.risk] || "Low Risk"}
                        </span>
                      )}
                      <p className={`min-w-0 flex-1 truncate text-xs ${item.unreadCount > 0 ? "font-extrabold text-slate-950" : "font-semibold text-slate-500"}`}>
                        {preview}
                      </p>
                    </div>
                  </div>
                  {item.unreadCount > 0 ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-pink-600 px-1 text-[10px] font-extrabold text-white">
                      {item.unreadCount > 99 ? "99+" : item.unreadCount}
                    </span>
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 md:hidden" />
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <section className={`${mobileChatOpen ? "flex" : "hidden"} min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm md:flex md:rounded-l-none`}>
          {!selectedContact ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <UserRound className="h-12 w-12 text-slate-300" />
              <h2 className="mt-4 text-lg font-extrabold text-slate-900">Select a conversation</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Choose a contact to open the secure consultation thread.</p>
            </div>
          ) : (
            <>
              <header className="flex min-h-[76px] shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <button type="button" onClick={() => setMobileChatOpen(false)} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 md:hidden" aria-label="Back to contacts">
                    <ChevronRight className="h-5 w-5 rotate-180" />
                  </button>
                  <Avatar name={counterpart?.name || selectedContact.title} photoUrl={counterpart?.profile_photo_url} active={(selectedContact?.statusText || "") === "Online"} size="lg" />
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-extrabold text-slate-950">{counterpart?.name || selectedContact.title}</h2>
                    <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{headerSubtitle}</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" onClick={handleVoiceCall} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-pink-600 transition hover:bg-pink-50" aria-label="Voice Call" title="Voice Call">
                    <Phone className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => void startVideoCall()} disabled={callLoading} className="flex h-9 w-9 items-center justify-center rounded-full border border-blue-200 text-blue-600 transition hover:bg-blue-50 disabled:opacity-60" aria-label="Video Call" title="Video Call">
                    {callLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                  </button>
                  <button type="button" onClick={handleSms} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-700 transition hover:bg-slate-50" aria-label="SMS" title="SMS">
                    <MessageSquare className="h-4 w-4" />
                  </button>
                  <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50" aria-label="More options" title="More options">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f9fc] px-4 py-5 sm:px-6">
                <div className="mx-auto max-w-3xl space-y-4">
                  {!canSend ? (
                    <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white px-6 text-center">
                      <MessageCircle className="h-10 w-10 text-pink-300" />
                      <h3 className="mt-3 text-base font-extrabold text-slate-900">No conversation started yet</h3>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {isWorker ? "The consultation thread will appear when this mother starts a message." : "Start a consultation to send your first message."}
                      </p>
                      {!isWorker && (
                        <button
                          type="button"
                          onClick={() => openNewConsultation(selectedContact.person)}
                          className="mt-4 rounded-2xl bg-pink-600 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-pink-700"
                        >
                          Start Consultation
                        </button>
                      )}
                    </div>
                  ) : loadingChat && !selected?.messages ? (
                    <ChatSkeleton />
                  ) : (
                    <>
                      {selected?.message_page?.has_older && (
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() => void loadOlderMessages()}
                            disabled={loadingOlder}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-extrabold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                          >
                            {loadingOlder && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                            Load older messages
                          </button>
                        </div>
                      )}

                      {(selected?.messages || []).length === 0 ? (
                        <div className="flex min-h-64 flex-col items-center justify-center text-center">
                          <MessageCircle className="h-10 w-10 text-slate-300" />
                          <h3 className="mt-3 text-base font-extrabold text-slate-900">No messages yet</h3>
                          <p className="mt-1 text-sm font-semibold text-slate-500">Send the first message to begin this consultation.</p>
                        </div>
                      ) : (selected?.messages || []).map((message) => {
                        const own = isOwnMessage(message);

                        return (
                          <div key={message.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[88%] rounded-3xl px-4 py-3 shadow-sm sm:max-w-[72%] ${
                              own
                                ? "rounded-br-md bg-pink-600 text-white"
                                : "rounded-bl-md border border-slate-200 bg-white text-slate-900"
                            }`}>
                              {!own && <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{message.sender_name}</p>}
                              {message.body && <p className="whitespace-pre-wrap text-sm font-medium leading-6">{message.body}</p>}
                              {message.attachment && <SecureAttachment attachment={message.attachment} own={own} />}
                              {message.pending_attachment && (
                                <div className={`mt-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${
                                  own ? "border-white/20 bg-white/10 text-white" : "border-slate-200 bg-slate-50 text-slate-700"
                                }`}>
                                  {message.pending_attachment.type?.startsWith("video/") ? <Video className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
                                  <span className="min-w-0 flex-1 truncate">{message.pending_attachment.name}</span>
                                  <LoaderCircle className="h-4 w-4 animate-spin" />
                                </div>
                              )}
                              {message.iec_resource && (
                                <a href={message.iec_resource.url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-3 rounded-xl border border-black/10 bg-white p-3 text-slate-800">
                                  <BookOpen className="h-5 w-5 shrink-0 text-pink-600" />
                                  <span className="min-w-0">
                                    <span className="block truncate text-xs font-extrabold">{message.iec_resource.title}</span>
                                    <span className="text-[10px] font-bold text-slate-500">{message.iec_resource.category} • {message.iec_resource.duration_minutes} min</span>
                                  </span>
                                </a>
                              )}
                              <div className={`mt-2 flex items-center justify-end gap-1 text-[10px] font-bold ${own ? "text-pink-100" : "text-slate-400"}`}>
                                {message.pending ? "Sending" : formatTime(message.created_at)}
                                {own && !message.pending && (message.read_at ? <CheckCheck className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                  {messageBody.trim() && canSend && (
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-pink-500" />
                      You are typing
                    </div>
                  )}
                  <div ref={messageEndRef} />
                </div>
              </div>

              <footer className="shrink-0 border-t border-slate-100 bg-white p-3">
                {isWorker && canSend && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => applyTemplate(quickTemplates[0])} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50">
                      Quick Reply
                    </button>
                    <button type="button" onClick={() => applyTemplate(quickTemplates[1])} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50">
                      Medical Template
                    </button>
                    {resources.length > 0 && (
                      <select
                        value={selectedIecId}
                        onChange={(event) => setSelectedIecId(event.target.value)}
                        className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 outline-none transition hover:bg-slate-50"
                        aria-label="IEC Material"
                      >
                        <option value="">IEC Material</option>
                        {resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.title}</option>)}
                      </select>
                    )}
                  </div>
                )}

                {(attachment || selectedIecId) && (
                  <div className="mb-3 flex flex-wrap gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-2">
                    {attachment && (
                      <div className="relative flex min-w-0 max-w-full items-center gap-3 rounded-2xl bg-white p-2 pr-9 shadow-sm">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                          {attachmentPreviewUrl && attachment.type?.startsWith("image/") ? (
                            <div
                              role="img"
                              aria-label={attachment.name}
                              className="h-full w-full bg-cover bg-center"
                              style={{ backgroundImage: `url(${attachmentPreviewUrl})` }}
                            />
                          ) : attachmentPreviewUrl && attachment.type?.startsWith("video/") ? (
                            <video src={attachmentPreviewUrl} muted preload="metadata" className="h-full w-full object-cover" />
                          ) : attachment.type?.startsWith("audio/") ? (
                            <Mic className="h-6 w-6 text-pink-600" />
                          ) : attachment.type?.startsWith("image/") ? (
                            <ImageIcon className="h-6 w-6 text-pink-600" />
                          ) : (
                            <FileText className="h-6 w-6 text-pink-600" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-extrabold text-slate-800">{attachment.name}</p>
                          <p className="text-[10px] font-bold text-slate-400">{formatFileSize(attachment.size)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={clearAttachment}
                          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm"
                          aria-label="Remove attachment"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {selectedIecId && (
                      <span className="inline-flex items-center gap-2 rounded-2xl bg-pink-50 px-3 py-2 text-xs font-bold text-pink-700">
                        <BookOpen className="h-3.5 w-3.5" /> IEC material attached
                        <button type="button" onClick={() => setSelectedIecId("")} aria-label="Remove IEC material">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4,audio/x-m4a"
                    onChange={(event) => handleAttachmentChange(event.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!canSend}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    aria-label="Add attachment"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                  <div className="min-w-0 flex-1 rounded-3xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-pink-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-pink-100">
                    <textarea
                      ref={messageInputRef}
                      value={messageBody}
                      onChange={(event) => setMessageBody(event.target.value.slice(0, CHAT_MESSAGE_LIMIT))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendMessage();
                        }
                      }}
                      rows={1}
                      maxLength={CHAT_MESSAGE_LIMIT}
                      disabled={!canSend}
                      placeholder={canSend ? "Type a message..." : "No active conversation yet"}
                      className="max-h-36 min-h-7 w-full resize-none bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                    />
                    <div className={`mt-1 flex items-center justify-between gap-3 text-[10px] font-bold ${attachmentError ? "text-red-600" : "text-slate-400"}`}>
                      <span className="truncate">{attachmentError}</span>
                      <span>{messageBody.length}/{CHAT_MESSAGE_LIMIT}</span>
                    </div>
                  </div>
                  <button type="button" className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-50 sm:flex" aria-label="Emoji">
                    <Smile className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendMessage()}
                    disabled={!canSend || sending || (!messageBody.trim() && !attachment && !selectedIecId)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pink-600 text-white shadow-sm transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300"
                    aria-label="Send message"
                  >
                    {sending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      {isNewOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/65 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsNewOpen(false); }}>
          <form onSubmit={createConsultation} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-pink-600">Consultation</p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-950">Start a Consultation</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Send your concern to assigned Program Staff.</p>
              </div>
              <button type="button" onClick={() => setIsNewOpen(false)} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            {workers.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                No Program Staff is assigned to your casefile yet.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-extrabold uppercase text-slate-600">Program Staff</span>
                  <select
                    required
                    value={newForm.health_worker_id}
                    onChange={(event) => setNewForm({ ...newForm, health_worker_id: event.target.value })}
                    className="h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold outline-none transition focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
                  >
                    <option value="">Select assigned staff</option>
                    {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name} - {workerRoleLabel(worker)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-extrabold uppercase text-slate-600">Topic</span>
                  <select
                    value={newForm.topic}
                    onChange={(event) => setNewForm({ ...newForm, topic: event.target.value })}
                    className="h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold outline-none transition focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
                  >
                    {topics.map((topic) => <option key={topic}>{topic}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-extrabold uppercase text-slate-600">Subject</span>
                  <input
                    required
                    maxLength={255}
                    value={newForm.subject}
                    onChange={(event) => setNewForm({ ...newForm, subject: event.target.value })}
                    placeholder="Briefly describe your concern"
                    className="h-11 w-full rounded-2xl border border-slate-300 px-3 text-sm font-semibold outline-none transition focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-extrabold uppercase text-slate-600">Message</span>
                  <textarea
                    required
                    maxLength={5000}
                    rows={5}
                    value={newForm.initial_message}
                    onChange={(event) => setNewForm({ ...newForm, initial_message: event.target.value })}
                    placeholder="Describe your question or symptoms..."
                    className="w-full resize-none rounded-2xl border border-slate-300 p-3 text-sm font-semibold outline-none transition focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
                  />
                </label>
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setIsNewOpen(false)} className="h-11 rounded-2xl border border-slate-300 px-5 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50">
                    Cancel
                  </button>
                  <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-pink-600 px-5 text-sm font-extrabold text-white transition hover:bg-pink-700">
                    <Send className="h-4 w-4" />
                    Send Consultation
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}

      {isClientReady && (
        <TelehealthIncomingCallListener
          onBusyChange={handleVideoCallBusyChange}
          onNotice={handleVideoCallNotice}
        />
      )}
    </main>
  );
}
