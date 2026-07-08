"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  Archive,
  ArrowLeft,
  BookOpen,
  CheckCircle,
  Clock,
  Play,
  RotateCcw,
  Video,
} from "lucide-react";
import { getAuthToken } from "../../utils/authSession";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

const normalizeIdList = (items) => {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
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
    const newestVideo = latestByCategory.get(category);
    const isArchived = archivedVideoIds.includes(Number(video.id));
    const isOlderUpload = newestVideo && Number(newestVideo.id) !== Number(video.id);

    groups[isArchived || isOlderUpload ? "archived" : "active"].push(video);
    return groups;
  }, { active: [], archived: [] });
};

export default function VideoLibraryClient({ initialMonth }) {
  const router = useRouter();
  const [module, setModule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const watchedVideoIds = useMemo(() => normalizeIdList(module?.watched_videos), [module?.watched_videos]);
  const archivedVideoIds = useMemo(() => (
    normalizeIdList(module?.checklist_items?.archived_videos)
  ), [module?.checklist_items?.archived_videos]);
  const videoGroups = useMemo(() => (
    splitVideosByArchive(module?.videos || [], archivedVideoIds)
  ), [module?.videos, archivedVideoIds]);

  useEffect(() => {
    let ignore = false;

    window.setTimeout(() => {
      const token = getAuthToken();

      if (!token) {
        router.push("/login");
        return;
      }

      axios.get(`${API_BASE_URL}/iec/module/${initialMonth}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((response) => {
          if (ignore) return;
          setModule(response.data.module);
          setErrorMessage("");
        })
        .catch((error) => {
          if (ignore) return;
          setErrorMessage(error.response?.data?.message || "Unable to load the video library.");
        })
        .finally(() => {
          if (!ignore) setLoading(false);
        });
    }, 0);

    return () => {
      ignore = true;
    };
  }, [initialMonth, router]);

  const markVideoWatched = async (videoId) => {
    const token = getAuthToken();
    if (!token || !module) return;

    try {
      await axios.post(
        `${API_BASE_URL}/iec/module/${module.id}/video-watched`,
        { video_id: videoId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setModule((current) => current ? {
        ...current,
        watched_videos: Array.from(new Set([
          ...normalizeIdList(current.watched_videos),
          Number(videoId),
        ])),
      } : current);
    } catch (error) {
      alert(error.response?.data?.message || "Unable to mark this video as watched.");
    }
  };

  const restoreVideo = async (videoId) => {
    const token = getAuthToken();
    if (!token || !module) return;

    const nextChecklist = {
      ...(module.checklist_items || {}),
      archived_videos: archivedVideoIds.filter((id) => id !== Number(videoId)),
    };

    try {
      await axios.post(
        `${API_BASE_URL}/iec/module/${module.id}/checklist`,
        { checklist_items: nextChecklist },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setModule((current) => current ? {
        ...current,
        checklist_items: nextChecklist,
      } : current);
    } catch (error) {
      alert(error.response?.data?.message || "Unable to restore this video.");
    }
  };

  const openVideo = (videoUrl) => {
    if (videoUrl) window.open(videoUrl, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-white px-4 py-7 md:px-8 md:py-9">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-100" />
          <section className="rounded-2xl border border-slate-200 p-5 shadow-sm">
            <Video className="h-8 w-8 animate-pulse text-pink-300" />
            <div className="mt-5 h-7 w-72 max-w-full animate-pulse rounded bg-slate-100" />
            <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded bg-slate-100" />
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-48 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />
              ))}
            </div>
          </section>
          </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-73px)] bg-white px-4 py-7 md:px-8 md:py-9">
        <div className="mx-auto max-w-6xl">
          <button
            type="button"
            onClick={() => router.push("/inay-kaalaman")}
            className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-extrabold text-slate-600 transition hover:bg-pink-50 hover:text-pink-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to INAY Kaalaman
          </button>

          <header className="mt-4 border-b border-slate-200 pb-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-50">
                <BookOpen className="h-5 w-5 text-pink-600" />
              </div>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-widest text-pink-600">
                  Month {initialMonth} Video Library
                </p>
                <h1 className="mt-1 text-2xl font-extrabold text-slate-950 md:text-3xl">
                  {module?.title || "IEC Educational Videos"}
                </h1>
                <p className="mt-2 text-sm font-medium text-slate-600">
                  {module?.week_range} educational guides and previous video versions.
                </p>
              </div>
            </div>
          </header>

          {errorMessage && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {errorMessage}
            </div>
          )}

          <section className="py-7">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-slate-950">
              <Video className="h-4 w-4 text-pink-600" />
              Current Educational Videos
            </h2>

            {videoGroups.active.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {videoGroups.active.map((video) => {
                  const watched = watchedVideoIds.includes(Number(video.id));

                  return (
                    <article
                      key={video.id}
                      className={`flex min-h-44 flex-col justify-between rounded-xl border p-5 shadow-sm ${
                        watched ? "border-slate-200 bg-slate-100/70" : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => openVideo(video.video_url)}
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-100 text-pink-600 transition hover:bg-pink-200"
                          aria-label={`Open ${video.title}`}
                        >
                          <Play className="h-4 w-4 fill-current" />
                        </button>
                        {watched ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-700">
                            <CheckCircle className="h-3.5 w-3.5" /> Napanood Na
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

                      <h3 className="mt-4 text-base font-extrabold leading-6 text-slate-950">{video.title}</h3>

                      <div className="mt-5 flex items-end justify-between gap-3">
                        <p className="text-xs font-extrabold uppercase tracking-widest text-pink-600">
                          {video.category}
                        </p>
                        <p className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-slate-400">
                          <Clock className="h-3.5 w-3.5" /> {video.duration_minutes} min
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
                No current videos are available for this month.
              </p>
            )}
          </section>

          {videoGroups.archived.length > 0 && (
            <section className="border-t border-slate-200 py-7">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-slate-950">
                <Archive className="h-4 w-4 text-slate-500" />
                Archived Videos
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {videoGroups.archived.map((video) => {
                  const manuallyArchived = archivedVideoIds.includes(Number(video.id));

                  return (
                    <article
                      key={video.id}
                      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <h3 className="font-extrabold text-slate-800">{video.title}</h3>
                        <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                          {video.category} | {video.duration_minutes} min
                        </p>
                      </div>
                      {manuallyArchived ? (
                        <button
                          type="button"
                          onClick={() => restoreVideo(video.id)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600 transition hover:border-pink-200 hover:text-pink-600"
                        >
                          <RotateCcw className="h-4 w-4" /> Restore
                        </button>
                      ) : (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500 ring-1 ring-slate-200">
                          Older version
                        </span>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>
    </div>
  );
}
