// app/inay-kaalaman/page.js

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  Activity,
  AlertTriangle,
  Baby,
  BookOpen,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FileCheck,
  FileText,
  Image as ImageIcon,
  Play,
  ShieldCheck,
  Upload,
  Video,
} from "lucide-react";
import { getAuthToken, getStoredUser } from "../utils/authSession";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";
const LEARNING_CACHE_VERSION = "2026-07-fast-learning";
const REQUIRED_RECORD_TYPES = ["checkup", "prescription"];
const DEFAULT_CHECKLIST = {
  videos_watched: [],
  medical_tasks: [],
  uploads_done: false,
  read_done: false,
  archived_videos: [],
};

const fallbackModules = Array.from({ length: 10 }, (_, index) => {
  const monthNumber = index + 1;
  const weekStart = Math.max(1, (monthNumber - 1) * 4 + 1);
  const weekEnd = monthNumber === 10 ? 40 : monthNumber * 4;

  return {
    id: `fallback-${monthNumber}`,
    month_number: monthNumber,
    title: `Pregnancy Month ${monthNumber}`,
    week_range: `Weeks ${weekStart}-${weekEnd}`,
    is_completed: false,
    videos: [],
    risk_alerts: [],
    infographics: [],
    checklist_items: DEFAULT_CHECKLIST,
    document_requirements: { checkup: false, prescription: false },
    uploaded_records_count: 0,
  };
});

const cacheKeyForUser = () => {
  const user = getStoredUser();
  return `project_inay_learning_hub:${LEARNING_CACHE_VERSION}:${user?.id || "guest"}`;
};

const readLearningCache = () => {
  if (typeof window === "undefined") return null;

  try {
    return JSON.parse(sessionStorage.getItem(cacheKeyForUser()) || "null");
  } catch {
    return null;
  }
};

const writeLearningCache = (value) => {
  if (typeof window === "undefined") return;

  sessionStorage.setItem(cacheKeyForUser(), JSON.stringify(value));
};

const trimesterSections = [
  {
    key: "1st Trimester",
    eyebrow: "Months 1-3",
    title: "1st Trimester",
    monthsLabel: "Months 1-3",
    months: [1, 2, 3],
  },
  {
    key: "2nd Trimester",
    eyebrow: "Months 4-6",
    title: "2nd Trimester",
    monthsLabel: "Months 4-6",
    months: [4, 5, 6],
  },
  {
    key: "3rd Trimester",
    eyebrow: "Months 7-10",
    title: "3rd Trimester",
    monthsLabel: "Months 7-10",
    months: [7, 8, 9, 10],
  },
];

const recordTypeOptions = [
  { value: "checkup", label: "Checkup Records" },
  { value: "prescription", label: "Prescription / RX Slip" },
  { value: "lab_result", label: "Laboratory Result" },
  { value: "ultrasound", label: "Ultrasound Result" },
];

const normalizeIdList = (items) => {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
};

const getChecklist = (module) => {
  return module?.checklist_items && typeof module.checklist_items === "object"
    ? module.checklist_items
    : {};
};

const getWatchedVideos = (module) => {
  const checklist = getChecklist(module);

  return normalizeIdList(module?.watched_videos ?? checklist.videos_watched);
};

const splitVideosByArchive = (videos = [], archivedVideoIds = []) => {
  const latestByCategory = new Map();

  videos.forEach((video) => {
    const category = video.category || "General";
    const current = latestByCategory.get(category);
    const videoDate = new Date(video.created_at || 0).getTime();
    const currentDate = current ? new Date(current.created_at || 0).getTime() : -1;

    if (!current || videoDate > currentDate || (videoDate === currentDate && Number(video.id) > Number(current.id))) {
      latestByCategory.set(category, video);
    }
  });

  return videos.reduce((groups, video) => {
    const category = video.category || "General";
    const latestVideo = latestByCategory.get(category);
    const isManuallyArchived = archivedVideoIds.includes(Number(video.id));
    const isOlderUpload = latestVideo && Number(latestVideo.id) !== Number(video.id);
    const groupName = isManuallyArchived || isOlderUpload ? "archivedVideos" : "activeVideos";

    groups[groupName].push(video);
    return groups;
  }, { activeVideos: [], archivedVideos: [] });
};

const getRecordLabel = (recordType) => {
  return recordTypeOptions.find((option) => option.value === recordType)?.label || recordType.replace(/_/g, " ");
};

const getRequiredDocumentCount = (module) => {
  const status = module?.document_requirements || {};

  return REQUIRED_RECORD_TYPES.filter((recordType) => Boolean(status[recordType])).length;
};

const getMedicalTasks = (monthNumber, hasRecordType, isCompleted) => [
  {
    key: "checkup",
    title: monthNumber >= 7
      ? "Prenatal checkup and blood pressure mapping"
      : "Routine prenatal checkup and vital signs",
    timing: monthNumber >= 7 ? `Immediately at month ${monthNumber}` : `Within month ${monthNumber}`,
    importance: monthNumber >= 7
      ? "Critical for late-stage fetal monitoring and preeclampsia screening."
      : "Confirms maternal health, fetal growth, and early warning signs.",
    complete: isCompleted || hasRecordType("checkup"),
  },
  {
    key: "prescription",
    title: "Supplement prescription or refill record",
    timing: "Bring your latest prescription",
    importance: "Helps your Program Staff confirm iron, folic acid, calcium, or other needed medicine.",
    complete: isCompleted || hasRecordType("prescription"),
  },
];

export default function InayKaalaman() {
  const router = useRouter();
  const [modules, setModules] = useState(fallbackModules);
  const [totalMonths, setTotalMonths] = useState(10);
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [currentModule, setCurrentModule] = useState(null);
  const [uploadedRecords, setUploadedRecords] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [certificate, setCertificate] = useState(null);
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST);
  const [isMonthOpen, setIsMonthOpen] = useState(true);
  const [uploadRecordType, setUploadRecordType] = useState("checkup");
  const [selectedUploadFile, setSelectedUploadFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [activeTrimesterIndex, setActiveTrimesterIndex] = useState(null);
  const trimesterCarouselRef = useRef(null);
  const trimesterScrollTimeoutRef = useRef(null);
  const selectedMonthRef = useRef(selectedMonth);
  const uploadedRecordsRef = useRef(uploadedRecords);

  const token = getAuthToken();
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const normalizeChecklist = (module, records = []) => {
    const savedChecklist = getChecklist(module);

    return {
      ...DEFAULT_CHECKLIST,
      ...savedChecklist,
      videos_watched: normalizeIdList(module?.watched_videos ?? savedChecklist.videos_watched),
      medical_tasks: Array.isArray(savedChecklist.medical_tasks) ? savedChecklist.medical_tasks : [],
      uploads_done: records.length > 0 || Boolean(savedChecklist.uploads_done),
      read_done: Boolean(savedChecklist.read_done || module?.is_completed),
      archived_videos: normalizeIdList(savedChecklist.archived_videos),
    };
  };

  const isVideoWatched = (videoId) => {
    return normalizeIdList(checklist.videos_watched).includes(Number(videoId));
  };

  const hasRecordType = useCallback((recordType) => {
    return uploadedRecords.some((record) => record.record_type === recordType);
  }, [uploadedRecords]);

  const requiredDocumentsUploaded = () => {
    return REQUIRED_RECORD_TYPES.every((recordType) => hasRecordType(recordType));
  };

  const allRequirementsMet = () => {
    if (!currentModule) return false;

    const { activeVideos: requirementVideos } = splitVideosByArchive(
      currentModule.videos || [],
      normalizeIdList(checklist.archived_videos)
    );
    const requiredVideos = requirementVideos.filter((video) => video.is_required !== false);
    const allVideosWatched = requiredVideos.every((video) => isVideoWatched(video.id));

    return allVideosWatched && requiredDocumentsUploaded();
  };

  const currentArchivedVideoIds = useMemo(() => normalizeIdList(checklist.archived_videos), [checklist.archived_videos]);
  const { activeVideos } = useMemo(() => {
    return splitVideosByArchive(currentModule?.videos || [], currentArchivedVideoIds);
  }, [currentModule, currentArchivedVideoIds]);
  const currentRequiredVideos = activeVideos.filter((video) => video.is_required !== false);
  const watchedRequiredVideos = currentRequiredVideos.filter((video) => isVideoWatched(video.id));

  const scrollTrimesterCardIntoView = useCallback((index, behavior = "smooth") => {
    const carousel = trimesterCarouselRef.current;

    if (!carousel || typeof window === "undefined" || window.innerWidth >= 768) {
      return;
    }

    carousel.children[index]?.scrollIntoView({
      behavior,
      block: "nearest",
      inline: "center",
    });
  }, []);

  const selectMonth = useCallback((monthNumber, options = {}) => {
    const trimesterIndex = trimesterSections.findIndex((section) => section.months.includes(monthNumber));

    if (trimesterIndex >= 0) {
      setActiveTrimesterIndex(trimesterIndex);
    }

    setSelectedMonth(monthNumber);
    setIsMonthOpen(true);

    if (trimesterIndex >= 0 && options.scroll !== false) {
      scrollTrimesterCardIntoView(trimesterIndex);
    }
  }, [scrollTrimesterCardIntoView]);

  const currentTrimester = useMemo(() => {
    return trimesterSections.find((section) => section.months.includes(selectedMonth))
      || trimesterSections[0];
  }, [selectedMonth]);

  const completedMonths = useMemo(() => modules.filter((module) => module.is_completed).length, [modules]);

  const trimesterCards = useMemo(() => {
    return trimesterSections.map((section) => {
      const groupModules = modules.filter((module) => section.months.includes(module.month_number));
      const fallbackTotal = section.months.length;
      const readCount = groupModules.filter((module) => {
        if (module.id === currentModule?.id) {
          return checklist.read_done || module.is_completed;
        }

        return Boolean(getChecklist(module).read_done || module.is_completed);
      }).length;
      const videoStats = groupModules.reduce((stats, module) => {
        const moduleChecklist = module.id === currentModule?.id ? checklist : getChecklist(module);
        const archivedVideoIds = normalizeIdList(moduleChecklist.archived_videos);
        const watchedVideoIds = module.id === currentModule?.id
          ? normalizeIdList(checklist.videos_watched)
          : getWatchedVideos(module);
        const { activeVideos: moduleActiveVideos } = splitVideosByArchive(module.videos || [], archivedVideoIds);

        return {
          total: stats.total + moduleActiveVideos.length,
          watched: stats.watched + moduleActiveVideos.filter((video) => watchedVideoIds.includes(Number(video.id))).length,
        };
      }, { total: 0, watched: 0 });
      const taskTotal = Math.max(groupModules.length || fallbackTotal, 1) * REQUIRED_RECORD_TYPES.length;
      const taskDone = groupModules.reduce((total, module) => {
        if (module.id === currentModule?.id) {
          return total + REQUIRED_RECORD_TYPES.filter((type) => hasRecordType(type)).length;
        }

        const documentCount = getRequiredDocumentCount(module);

        if (documentCount > 0) return total + documentCount;
        if (module.is_completed) return total + REQUIRED_RECORD_TYPES.length;
        if (getChecklist(module).uploads_done) return total + 1;

        return total;
      }, 0);
      const hasSubmittedRecords = groupModules.some((module) => {
        if (module.id === currentModule?.id) {
          return uploadedRecords.length > 0 || module.is_completed;
        }

        return getRequiredDocumentCount(module) > 0 || Number(module.uploaded_records_count || 0) > 0 || module.is_completed;
      });

      return {
        ...section,
        isActive: section.months.includes(selectedMonth),
        readText: `${hasSubmittedRecords ? readCount : 0}/${groupModules.length || fallbackTotal}`,
        videoText: `${hasSubmittedRecords ? videoStats.watched : 0}/${videoStats.total}`,
        taskText: `${hasSubmittedRecords ? taskDone : 0}/${taskTotal}`,
      };
    });
  }, [modules, selectedMonth, currentModule, checklist, uploadedRecords, hasRecordType]);

  const currentTrimesterIndex = useMemo(() => {
    const index = trimesterSections.findIndex((section) => section.months.includes(selectedMonth));

    return index >= 0 ? index : 0;
  }, [selectedMonth]);

  const displayedTrimesterIndex = activeTrimesterIndex ?? currentTrimesterIndex;

  const handleTrimesterCarouselScroll = useCallback(() => {
    const carousel = trimesterCarouselRef.current;

    if (!carousel || typeof window === "undefined" || window.innerWidth >= 768) {
      return;
    }

    const cards = Array.from(carousel.children);
    const nextIndex = cards.reduce((closestIndex, card, index) => {
      const carouselCenter = carousel.scrollLeft + (carousel.clientWidth / 2);
      const currentCardCenter = card.offsetLeft + (card.clientWidth / 2);
      const closestCardCenter = cards[closestIndex].offsetLeft + (cards[closestIndex].clientWidth / 2);
      const currentDistance = Math.abs(currentCardCenter - carouselCenter);
      const closestDistance = Math.abs(closestCardCenter - carouselCenter);

      return currentDistance < closestDistance ? index : closestIndex;
    }, 0);

    setActiveTrimesterIndex(nextIndex);

    if (trimesterScrollTimeoutRef.current) {
      window.clearTimeout(trimesterScrollTimeoutRef.current);
    }

    trimesterScrollTimeoutRef.current = window.setTimeout(() => {
      const card = trimesterCards[nextIndex];

      if (card && !card.months.includes(selectedMonth)) {
        selectMonth(card.months[0], { scroll: false });
      }
    }, 140);
  }, [selectMonth, selectedMonth, trimesterCards]);

  const selectTrimesterCard = (index) => {
    const card = trimesterCards[index];

    if (!card) return;

    selectMonth(card.months[0]);
  };

  useEffect(() => {
    selectedMonthRef.current = selectedMonth;
  }, [selectedMonth]);

  useEffect(() => {
    uploadedRecordsRef.current = uploadedRecords;
  }, [uploadedRecords]);

  useEffect(() => {
    return () => {
      if (trimesterScrollTimeoutRef.current) {
        window.clearTimeout(trimesterScrollTimeoutRef.current);
      }
    };
  }, []);

  const visibleTrimesterModules = useMemo(() => {
    return modules
      .filter((module) => currentTrimester.months.includes(module.month_number))
      .sort((a, b) => a.month_number - b.month_number);
  }, [modules, currentTrimester]);

  const hasRealModules = useMemo(() => (
    modules.some((module) => typeof module.id !== "string" || !module.id.startsWith("fallback-"))
  ), [modules]);

  const dailyIntakeItems = useMemo(() => {
    return currentModule?.daily_intake && typeof currentModule.daily_intake === "object"
      ? Object.entries(currentModule.daily_intake)
      : [];
  }, [currentModule]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const cached = readLearningCache();
      if (!cached) return;

      if (Array.isArray(cached.modules) && cached.modules.length > 0) setModules(cached.modules);
      if (cached.totalMonths) setTotalMonths(cached.totalMonths);
      if (cached.selectedMonth) setSelectedMonth(cached.selectedMonth);
      if (cached.currentModule) setCurrentModule(cached.currentModule);
      if (Array.isArray(cached.uploadedRecords)) setUploadedRecords(cached.uploadedRecords);
      if (cached.checklist) setChecklist(cached.checklist);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hasRealModules && !currentModule) return;

    writeLearningCache({
      modules,
      totalMonths,
      selectedMonth,
      currentModule,
      uploadedRecords,
      checklist,
    });
  }, [checklist, currentModule, hasRealModules, modules, selectedMonth, totalMonths, uploadedRecords]);

  const fetchModules = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/iec/modules`, {
        headers: authHeaders,
      });
      setErrorMessage("");
      const fetchedModules = Array.isArray(res.data.modules) ? res.data.modules : [];
      setModules(fetchedModules);
      setTotalMonths(res.data.total_months || fetchedModules.length || 10);

      if (fetchedModules.length > 0) {
        const nextMonth = fetchedModules.some((module) => module.month_number === selectedMonth)
          ? selectedMonth
          : fetchedModules[0].month_number;
        const nextModule = fetchedModules.find((module) => module.month_number === nextMonth);
        setSelectedMonth(nextMonth);
        if (nextModule) {
          setCurrentModule((previous) => previous?.month_number === nextMonth ? previous : nextModule);
          setChecklist((previous) => previous?.read_done || previous?.videos_watched?.length
            ? previous
            : normalizeChecklist(nextModule, uploadedRecords));
        }
      }
    } catch (error) {
      setErrorMessage(error.response?.data?.message || "Unable to load IEC modules.");
    }
  };

  const fetchModule = async (month) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/iec/module/${month}`, {
        headers: authHeaders,
      });
      const records = Array.isArray(res.data.uploaded_records) ? res.data.uploaded_records : [];
      setErrorMessage("");
      setCertificate(null);
      setCurrentModule(res.data.module);
      setUploadedRecords(records);
      setChecklist(normalizeChecklist(res.data.module, records));
    } catch (error) {
      setCurrentModule(null);
      setUploadedRecords([]);
      setChecklist(DEFAULT_CHECKLIST);
      setErrorMessage(error.response?.data?.message || "Unable to load this IEC module.");
    }
  };

  const markMonthRead = async () => {
    if (!currentModule) return;

    const nextChecklist = {
      ...checklist,
      read_done: true,
    };

    setChecklist(nextChecklist);

    try {
      await axios.post(
        `${API_BASE_URL}/iec/module/${currentModule.id}/checklist`,
        { checklist_items: nextChecklist },
        { headers: authHeaders }
      );
      fetchModules();
    } catch (error) {
      setChecklist((previous) => ({ ...previous, read_done: false }));
      alert(error.response?.data?.message || "Unable to mark this guide as read.");
    }
  };

  const markVideoWatched = async (videoId) => {
    try {
      await axios.post(
        `${API_BASE_URL}/iec/module/${currentModule.id}/video-watched`,
        { video_id: videoId },
        { headers: authHeaders }
      );

      setChecklist((previous) => ({
        ...previous,
        videos_watched: Array.from(new Set([...(previous.videos_watched || []), Number(videoId)])),
      }));

      fetchModules();
      fetchModule(selectedMonth);
    } catch (error) {
      alert(error.response?.data?.message || "Unable to mark this video as watched.");
    }
  };

  const uploadSelectedRecord = async () => {
    if (!currentModule) return;

    if (!selectedUploadFile) {
      alert("Please choose a document before uploading.");
      return;
    }

    const formData = new FormData();
    formData.append("record_type", uploadRecordType);
    formData.append("file", selectedUploadFile);
    formData.append("record_date", new Date().toISOString().split("T")[0]);

    try {
      const res = await axios.post(
        `${API_BASE_URL}/iec/module/${currentModule.id}/upload-record`,
        formData,
        {
          headers: {
            ...authHeaders,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      const nextRecords = [...uploadedRecords, res.data.record];
      setUploadedRecords(nextRecords);
      setChecklist((previous) => ({
        ...previous,
        uploads_done: true,
      }));
      setSelectedUploadFile(null);
      setFileInputKey((key) => key + 1);
      fetchModules();
      alert("Record uploaded successfully!");
    } catch (error) {
      alert(error.response?.data?.message || "Upload failed. Please try again.");
    }
  };

  const generateCertificate = async () => {
    try {
      const res = await axios.post(
        `${API_BASE_URL}/iec/module/${currentModule.id}/generate-certificate`,
        {},
        { headers: authHeaders }
      );

      setCertificate(res.data.certificate);
      setCurrentModule((previous) => previous ? {
        ...previous,
        is_completed: true,
        completed_at: new Date().toISOString(),
      } : previous);
      fetchModules();
      alert("Certificate generated successfully!");
    } catch (error) {
      alert(error.response?.data?.message || "Complete all requirements first.");
    }
  };

  const completeModule = async () => {
    try {
      await axios.post(
        `${API_BASE_URL}/iec/module/${currentModule.id}/complete`,
        {},
        { headers: authHeaders }
      );

      alert(`Month ${selectedMonth} completed!`);
      fetchModules();
      fetchModule(selectedMonth);
    } catch (error) {
      alert(error.response?.data?.message || "Unable to complete this month yet.");
    }
  };

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    let ignore = false;

    axios.get(`${API_BASE_URL}/iec/modules`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (ignore) return;

        const fetchedModules = Array.isArray(res.data.modules) ? res.data.modules : [];
        setErrorMessage("");
        setModules(fetchedModules);
        setTotalMonths(res.data.total_months || fetchedModules.length || 10);

        if (fetchedModules.length > 0) {
          const nextMonth = fetchedModules.some((module) => module.month_number === selectedMonthRef.current)
            ? selectedMonthRef.current
            : fetchedModules[0].month_number;
          const nextModule = fetchedModules.find((module) => module.month_number === nextMonth);

          setSelectedMonth(nextMonth);
          if (nextModule) {
            setCurrentModule((previous) => previous?.month_number === nextMonth ? previous : nextModule);
            setChecklist((previous) => previous?.read_done || previous?.videos_watched?.length
              ? previous
              : normalizeChecklist(nextModule, uploadedRecordsRef.current));
          }
        }
      })
      .catch((error) => {
        if (ignore) return;

        setErrorMessage(error.response?.data?.message || "Unable to load IEC modules.");
      })
      .finally(() => {});

    return () => {
      ignore = true;
    };
  }, [router, token]);

  useEffect(() => {
    if (!token || !selectedMonth) return;

    let ignore = false;

    axios.get(`${API_BASE_URL}/iec/module/${selectedMonth}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (ignore) return;

        const records = Array.isArray(res.data.uploaded_records) ? res.data.uploaded_records : [];
        setErrorMessage("");
        setCertificate(null);
        setCurrentModule(res.data.module);
        setUploadedRecords(records);
        setChecklist(normalizeChecklist(res.data.module, records));
      })
      .catch((error) => {
        if (ignore) return;

        setCurrentModule(null);
        setUploadedRecords([]);
        setChecklist(DEFAULT_CHECKLIST);
        setErrorMessage(error.response?.data?.message || "Unable to load this IEC module.");
      })
      .finally(() => {});

    return () => {
      ignore = true;
    };
  }, [selectedMonth, token]);

  return (
    <div className="bg-white px-4 py-7 text-slate-950 md:px-8 md:py-9">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="overflow-hidden rounded-2xl bg-slate-950 p-5 text-white shadow-lg md:p-7">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="max-w-3xl">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  <h1 className="text-xl font-extrabold tracking-tight md:text-2xl">
                    INAY Kaalaman (IEC Learning Hub)
                  </h1>
                </div>
                <p className="mt-3 text-sm font-medium leading-6 text-slate-200">
                  Ang iyong gabay bawat buwan ng pagbubuntis. Alamin ang pagbabago sa iyong katawan,
                  paglaki ni baby, wastong nutrisyon, at mga mahalagang paalala upang mapanatili silang ligtas.
                </p>
              </div>

              <div className="rounded-xl border border-white/15 bg-white/10 px-5 py-4 shadow-inner">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-slate-300">
                  Current Month Focus
                </p>
                <p className="mt-1 text-lg font-extrabold">
                  Month {currentModule?.month_number || selectedMonth}
                  {currentModule?.week_range ? ` (${currentModule.week_range})` : ""}
                </p>
                <p className="mt-2 text-xs font-bold text-slate-300">
                  Completed {completedMonths}/{totalMonths} months
                </p>
              </div>
            </div>
          </section>

          {errorMessage && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {errorMessage}
            </div>
          )}

          <section className="-mx-4 md:mx-0">
            <div
              ref={trimesterCarouselRef}
              onScroll={handleTrimesterCarouselScroll}
              className="inay-scrollbar-hidden flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto scroll-smooth px-[7vw] pb-2 md:grid md:snap-none md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0"
            >
              {trimesterCards.map((card, index) => {
                const isDisplayed = displayedTrimesterIndex === index;
                const isHighlighted = card.isActive || isDisplayed;

                return (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => selectTrimesterCard(index)}
                    className={`flex min-h-64 min-w-[86%] snap-center flex-col rounded-2xl border bg-white p-5 text-left shadow-sm transition duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md md:min-w-0 ${
                      isHighlighted ? "border-pink-500 ring-2 ring-pink-100" : "border-slate-200"
                    }`}
                  >
                    <div className="flex flex-col items-center text-center">
                      <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${
                        isHighlighted ? "bg-pink-100 text-pink-700" : "bg-slate-100 text-slate-500"
                      }`}>
                        {card.eyebrow}
                      </span>
                      <h2 className="mt-3 text-lg font-extrabold text-slate-950">{card.title}</h2>
                      <p className="text-xs font-bold text-slate-400">Trimester learning progress</p>
                    </div>

                    <div className="mt-6 flex flex-1 flex-col justify-end space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                        <span className="flex items-center gap-2 font-semibold text-slate-600">
                          <BookOpen className="h-4 w-4 text-blue-500" />
                          Nabasa (Read)
                        </span>
                        <span className="font-extrabold text-slate-950">{card.readText}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                        <span className="flex items-center gap-2 font-semibold text-slate-600">
                          <Video className="h-4 w-4 text-pink-500" />
                          Napanood (Videos)
                        </span>
                        <span className="font-extrabold text-slate-950">{card.videoText}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                        <span className="flex items-center gap-2 font-semibold text-slate-600">
                          <ClipboardCheck className="h-4 w-4 text-orange-500" />
                          Medical Tasks
                        </span>
                        <span className="font-extrabold text-slate-950">{card.taskText}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex justify-center gap-2 md:hidden" aria-label="Trimester carousel pages">
              {trimesterCards.map((card, index) => (
                <button
                  key={`${card.key}-dot`}
                  type="button"
                  onClick={() => selectTrimesterCard(index)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    displayedTrimesterIndex === index ? "w-7 bg-pink-600" : "w-2.5 bg-slate-300"
                  }`}
                  aria-label={`Show ${card.title}`}
                  aria-current={displayedTrimesterIndex === index ? "true" : undefined}
                />
              ))}
            </div>
          </section>

          {visibleTrimesterModules.length > 0 && (
            <section className="space-y-4">
              {visibleTrimesterModules.map((module) => {
                const isSelectedModule = module.month_number === selectedMonth;
                const hasSelectedDetails = currentModule?.month_number === selectedMonth;

                if (!isSelectedModule || !hasSelectedDetails) {
                  return (
                    <button
                      key={module.id || module.month_number}
                      type="button"
                      onClick={() => selectMonth(module.month_number)}
                      className={`flex w-full items-center justify-between gap-4 rounded-2xl border bg-white px-5 py-4 text-left shadow-sm transition hover:border-pink-200 hover:bg-pink-50 ${
                        isSelectedModule ? "border-pink-300 ring-2 ring-pink-100" : "border-slate-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`rounded-xl px-5 py-2 text-sm font-extrabold ${
                          isSelectedModule ? "bg-pink-100 text-pink-700" : "bg-slate-100 text-slate-600"
                        }`}>
                          Month {module.month_number}
                        </span>
                        <div>
                          <p className="font-extrabold text-slate-950">
                            {module.title} <span className="text-sm text-slate-500">({module.week_range})</span>
                          </p>
                          <p className={`mt-1 text-xs font-extrabold ${
                            isSelectedModule ? "text-pink-600" : module.is_completed ? "text-emerald-600" : "text-slate-400"
                          }`}>
                            {isSelectedModule ? "Loading month details..." : module.is_completed ? "Completed" : "Tap to open"}
                          </p>
                        </div>
                      </div>
                      <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
                    </button>
                  );
                }

                return (
                  <section
                    key={currentModule.id || currentModule.month_number}
                    className="overflow-hidden rounded-3xl border-2 border-pink-500 bg-white shadow-sm"
                  >
                <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50 px-5 py-5 md:flex-row md:items-center md:justify-between md:px-7">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-pink-600 px-5 py-2 text-xs font-extrabold text-white shadow-sm">
                      Month {currentModule.month_number}
                    </span>
                    <div>
                      <h2 className="text-lg font-extrabold text-slate-950 md:text-xl">
                        {currentModule.title} <span className="text-sm font-bold text-slate-500">({currentModule.week_range})</span>
                      </h2>
                      <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-pink-600">
                        Ikaw ay nandito - kasalukuyang buwan
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsMonthOpen((isOpen) => !isOpen)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-pink-600"
                    aria-label="Toggle month details"
                  >
                    {isMonthOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </button>
                </div>

                {isMonthOpen && (
                  <div className="space-y-7 p-5 md:p-7">
                    <div className="grid gap-4 md:grid-cols-2">
                      <article className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                        <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase text-pink-600">
                          <Baby className="h-4 w-4" />
                          Paglaki ni Baby (Baby Development)
                        </h3>
                        <p className="mt-3 text-sm font-medium leading-6 text-slate-700">
                          {currentModule.baby_development}
                        </p>
                      </article>

                      <article className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                        <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase text-blue-700">
                          <Activity className="h-4 w-4" />
                          Maternal Changes (Pagbabago sa Katawan)
                        </h3>
                        <p className="mt-3 text-sm font-medium leading-6 text-slate-700">
                          {currentModule.mother_changes}
                        </p>
                      </article>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">
                          Inaasahang Sintomas Noong Buwang Ito
                        </h3>
                        <p className="mt-3 text-sm font-medium leading-6 text-slate-700">
                          {currentModule.expected_symptoms || "No symptoms listed for this month."}
                        </p>
                      </div>

                      <div>
                        <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">
                          Gabay sa Wastong Nutrisyon (Nutritional Guidance)
                        </h3>
                        <p className="mt-3 text-sm font-medium leading-6 text-slate-700">
                          {currentModule.nutritional_guidance}
                        </p>
                        {dailyIntakeItems.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {dailyIntakeItems.map(([key, value]) => (
                              <span
                                key={key}
                                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700"
                              >
                                {key.replace(/_/g, " ")}: {value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-pink-100 bg-pink-50/50 p-4">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                            <BookOpen className="h-5 w-5 text-emerald-600" />
                          </div>
                          <div>
                            <p className="font-extrabold text-slate-950">
                              Gabay sa Pagbabasa para sa Buwan {currentModule.month_number}
                            </p>
                            <p className="text-sm font-medium text-slate-500">
                              I-marka bilang nabasa kapag tapos mo nang suriin ang babasahin sa buwang ito.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={markMonthRead}
                          disabled={checklist.read_done}
                          className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-extrabold transition ${
                            checklist.read_done
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-950 text-white hover:bg-pink-600"
                          }`}
                        >
                          <CheckCircle className="h-4 w-4" />
                          {checklist.read_done ? "Nabasa Na" : "Mark as Read"}
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-6">
                      <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-slate-950">
                        <Video className="h-4 w-4 text-pink-600" />
                        Mga Kakabit na Video at Edukasyon ng Barangay
                      </h3>
                      {activeVideos.length > 0 ? (
                        <div className="grid gap-4 md:grid-cols-3">
                          {activeVideos.map((video) => {
                            const watched = isVideoWatched(video.id);

                            return (
                              <article
                                key={video.id}
                                className={`flex min-h-32 flex-col justify-between rounded-xl border p-4 shadow-sm ${
                                  watched ? "border-slate-200 bg-slate-100/70" : "border-slate-200 bg-white"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-100 text-pink-600">
                                    <Play className="h-4 w-4 fill-current" />
                                  </div>
                                  {watched ? (
                                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-700">
                                      Napanood Na
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => markVideoWatched(video.id)}
                                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700 transition hover:bg-pink-50 hover:text-pink-600"
                                    >
                                      Mark as Watched
                                    </button>
                                  )}
                                </div>

                                <h4 className="mt-4 text-base font-extrabold leading-6 text-slate-950">
                                  {video.title}
                                </h4>

                                <div className="mt-4 flex items-end justify-between gap-3">
                                  <p className="text-xs font-extrabold uppercase tracking-widest text-pink-600">
                                    {video.category}
                                  </p>
                                  <p className="shrink-0 text-xs font-bold text-slate-400">
                                    {video.duration_minutes} min
                                  </p>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                          No active videos are available for this month yet.
                        </p>
                      )}

                      <div className="mt-5 flex justify-center">
                        <button
                          type="button"
                          onClick={() => router.push(`/inay-kaalaman/videos?month=${currentModule.month_number}`)}
                          className="inline-flex min-w-40 items-center justify-center rounded-full bg-pink-500 px-8 py-3 text-sm font-extrabold text-white shadow-md transition hover:bg-pink-600"
                        >
                          More Videos
                        </button>
                      </div>

                      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-2">
                          <div>
                            <h4 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-slate-950">
                              <FileCheck className="h-4 w-4 text-pink-600" />
                              Documentation Status
                            </h4>
                            <p className="mt-1 text-sm font-medium text-slate-500">
                              This shows read, video, and uploaded record progress for this month.
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-4">
                          <div className={`rounded-xl border p-3 ${
                            checklist.read_done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"
                          }`}>
                            <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Reading</p>
                            <p className={`mt-1 text-sm font-extrabold ${
                              checklist.read_done ? "text-emerald-700" : "text-slate-500"
                            }`}>
                              {checklist.read_done ? "Done" : "Pending"}
                            </p>
                          </div>

                          <div className={`rounded-xl border p-3 ${
                            watchedRequiredVideos.length === currentRequiredVideos.length && currentRequiredVideos.length > 0
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-slate-200 bg-slate-50"
                          }`}>
                            <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Videos</p>
                            <p className="mt-1 text-sm font-extrabold text-slate-700">
                              {watchedRequiredVideos.length}/{currentRequiredVideos.length}
                            </p>
                          </div>

                          {REQUIRED_RECORD_TYPES.map((recordType) => {
                            const uploaded = hasRecordType(recordType);

                            return (
                              <div
                                key={recordType}
                                className={`rounded-xl border p-3 ${
                                  uploaded ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
                                }`}
                              >
                                <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                                  {recordType === "checkup" ? "Checkup" : "Prescription"}
                                </p>
                                <p className={`mt-1 text-sm font-extrabold ${
                                  uploaded ? "text-emerald-700" : "text-amber-700"
                                }`}>
                                  {uploaded ? "Uploaded" : "Needed"}
                                </p>
                              </div>
                            );
                          })}

                        </div>
                      </div>
                    </div>

                    {currentModule.risk_alerts?.length > 0 && (
                      <div className="border-t border-slate-100 pt-6">
                        <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-slate-950">
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                          Importanteng Babala at Panganib (Risk Alerts & Consequences)
                        </h3>
                        <div className="space-y-3">
                          {currentModule.risk_alerts.map((alert) => (
                            <article
                              key={alert.id || alert.title}
                              className="rounded-xl border border-red-200 bg-red-50/40 p-4"
                            >
                              <div className="flex gap-3">
                                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100">
                                  <AlertTriangle className="h-4 w-4 text-red-600" />
                                </div>
                                <div>
                                  <h4 className="font-extrabold text-red-700">{alert.title}</h4>
                                  <p className="mt-1 text-sm font-medium leading-6 text-slate-700">
                                    <span className="font-extrabold text-red-700">Consequence:</span> {alert.consequence}
                                  </p>
                                  <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
                                    <span className="font-extrabold">Rekomendasyon:</span> {alert.recommendation}
                                  </p>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-6 border-t border-slate-100 pt-6 md:grid-cols-2">
                      <div>
                        <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-slate-950">
                          <ClipboardCheck className="h-4 w-4 text-pink-600" />
                          Mga Bakuna at Medical Tasks Ngayong Buwan
                        </h3>
                        <div className="space-y-3">
                          {getMedicalTasks(currentModule.month_number, hasRecordType, currentModule.is_completed).map((task) => (
                            <article
                              key={task.key}
                              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                            >
                              <div className="flex gap-3">
                                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                                  task.complete ? "bg-emerald-500 text-white" : "bg-white text-slate-400 ring-1 ring-slate-200"
                                }`}>
                                  {task.complete ? <CheckCircle className="h-4 w-4" /> : <FileCheck className="h-4 w-4" />}
                                </span>
                                <div>
                                  <h4 className={`text-sm font-extrabold ${
                                    task.complete ? "text-slate-400 line-through" : "text-slate-800"
                                  }`}>
                                    {task.title}
                                  </h4>
                                  <p className="mt-1 text-xs font-extrabold text-pink-600">
                                    Timing: {task.timing}
                                  </p>
                                  <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                                    Importance: {task.importance}
                                  </p>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-slate-950">
                          <ImageIcon className="h-4 w-4 text-blue-600" />
                          Impormasyong Infographics
                        </h3>
                        <div className="space-y-3">
                          {currentModule.infographics?.length > 0 ? (
                            currentModule.infographics.map((infographic) => (
                              <article
                                key={infographic.id || infographic.title}
                                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-pink-50">
                                    <FileText className="h-5 w-5 text-pink-600" />
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-pink-600">
                                      Maternal Care
                                    </p>
                                    <h4 className="text-sm font-extrabold text-slate-950">{infographic.title}</h4>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => infographic.file_path && window.open(infographic.file_path, "_blank")}
                                  className="text-sm font-extrabold text-pink-600 transition hover:text-pink-700"
                                >
                                  Suriin -&gt;
                                </button>
                              </article>
                            ))
                          ) : (
                            <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                              No infographics are available for this month yet.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-6">
                      <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-slate-950">
                        <Upload className="h-4 w-4 text-purple-600" />
                        Upload Prenatal Records & Receipts
                      </h3>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_0.95fr] lg:items-end">
                          <label className="block">
                            <span className="mb-2 block text-xs font-extrabold text-slate-500">Type of Record</span>
                            <select
                              value={uploadRecordType}
                              onChange={(event) => setUploadRecordType(event.target.value)}
                              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none transition focus:border-pink-400 focus:ring-4 focus:ring-pink-100"
                            >
                              {recordTypeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <span className="mb-2 block text-xs font-extrabold text-slate-500">Select Document</span>
                            <input
                              key={fileInputKey}
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(event) => setSelectedUploadFile(event.target.files?.[0] || null)}
                              className="block h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-pink-50 file:px-3 file:py-2 file:text-xs file:font-extrabold file:text-pink-600 focus:outline-none focus:ring-4 focus:ring-pink-100"
                            />
                          </label>

                          <button
                            type="button"
                            onClick={uploadSelectedRecord}
                            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-pink-600 px-5 text-sm font-extrabold text-white shadow-sm transition hover:bg-pink-700 focus:outline-none focus:ring-4 focus:ring-pink-100"
                          >
                            <Upload className="h-4 w-4" />
                            I-upload sa Records
                          </button>
                        </div>

                        {uploadedRecords.length > 0 && (
                          <div className="mt-4 grid gap-2 md:grid-cols-2">
                            {uploadedRecords.map((record) => (
                              <div
                                key={`${record.id}-${record.original_filename}`}
                                className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-white px-3 py-2"
                              >
                                <div>
                                  <p className="text-xs font-extrabold uppercase text-emerald-700">
                                    {getRecordLabel(record.record_type)}
                                  </p>
                                  <p className="max-w-[18rem] truncate text-xs font-semibold text-slate-500">
                                    {record.original_filename}
                                  </p>
                                </div>
                                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                      <div className="flex gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                        <div>
                          <h3 className="text-sm font-extrabold uppercase tracking-wide text-amber-700">
                            Program Staff Notes (Payo ng Barangay Midwife)
                          </h3>
                          <p className="mt-2 text-sm font-medium italic leading-6 text-slate-700">
                            Great job. Your upcoming checkups are scheduled every 2 weeks starting this month.
                            Keep practicing regular deep-breathing exercises.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className={`rounded-xl border p-4 ${
                      allRequirementsMet()
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-slate-200 bg-slate-50"
                    }`}>
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-3">
                          <ShieldCheck className={`h-8 w-8 ${
                            allRequirementsMet() ? "text-emerald-600" : "text-slate-400"
                          }`} />
                          <div>
                            <p className="font-extrabold text-slate-950">
                              {allRequirementsMet() ? "Ready for Month Completion" : "Complete the month requirements"}
                            </p>
                            <p className="text-sm font-medium text-slate-600">
                              Watch all videos and upload both checkup record and prescription.
                            </p>
                          </div>
                        </div>
                        {allRequirementsMet() && (
                          <div className="flex flex-col gap-2 sm:flex-row">
                            {!currentModule.is_completed && (
                              <button
                                type="button"
                                onClick={completeModule}
                                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-emerald-700"
                              >
                                Complete Month
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={generateCertificate}
                              className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-pink-600"
                            >
                              Generate Certificate
                            </button>
                          </div>
                        )}
                      </div>
                      {certificate && (
                        <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-bold text-emerald-700">
                          Certificate generated: {certificate.certificate_number}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                  </section>
                );
              })}
            </section>
          )}
        </div>
    </div>
  );
}
