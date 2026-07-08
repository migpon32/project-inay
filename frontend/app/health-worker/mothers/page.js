"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  Check,
  Info,
  LoaderCircle,
  MapPin,
  Phone,
  Search,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import HealthWorkerShell from "../../components/HealthWorkerShell";
import { getAuthToken } from "../../utils/authSession";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

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

const formatDate = (value) => {
  if (!value) return "Not scheduled";

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
};

const statusLabel = (mother) => {
  if (mother.pregnancy_status === "postpartum") {
    return mother.postpartum_week
      ? `${mother.postpartum_week} Weeks Postpartum`
      : "Postpartum";
  }

  if (mother.pregnancy_status === "pregnant") {
    return mother.pregnancy_week
      ? `Pregnancy Week ${mother.pregnancy_week}`
      : "Pregnant";
  }

  return "Not provided";
};

const authConfig = () => ({
  headers: { Authorization: `Bearer ${getAuthToken()}` },
});

export default function MothersCasefilesPage() {
  const router = useRouter();
  const [casefiles, setCasefiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageSearch, setPageSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [registeredMothers, setRegisteredMothers] = useState([]);
  const [modalSearch, setModalSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);

  const loadCasefiles = useCallback(async () => {
    setLoading(true);

    try {
      const response = await axios.get(`${API_BASE_URL}/health-worker/casefiles`, authConfig());
      setCasefiles(response.data.mothers || []);
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.message || "Unable to load Mothers Casefiles.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCasefiles();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadCasefiles]);

  useEffect(() => {
    if (!isAddOpen) return undefined;

    const timer = window.setTimeout(async () => {
      setSearching(true);

      try {
        const response = await axios.get(`${API_BASE_URL}/health-worker/casefiles/search`, {
          ...authConfig(),
          params: { q: modalSearch },
        });
        setRegisteredMothers(response.data.mothers || []);
      } catch (error) {
        setNotice({
          type: "error",
          text: error.response?.data?.message || "Unable to search registered mothers.",
        });
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [isAddOpen, modalSearch]);

  useEffect(() => {
    if (!isAddOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setIsAddOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isAddOpen]);

  const filteredCasefiles = useMemo(() => {
    const search = pageSearch.trim().toLowerCase();

    return casefiles.filter((mother) => {
      const matchesSearch = !search
        || mother.name.toLowerCase().includes(search)
        || mother.phone?.toLowerCase().includes(search);
      const matchesStatus = statusFilter === "all" || mother.pregnancy_status === statusFilter;
      const matchesRisk = riskFilter === "all" || mother.risk_rating === riskFilter;

      return matchesSearch && matchesStatus && matchesRisk;
    });
  }, [casefiles, pageSearch, riskFilter, statusFilter]);

  const openAddModal = () => {
    setModalSearch("");
    setSelectedIds([]);
    setRegisteredMothers([]);
    setIsAddOpen(true);
  };

  const closeAddModal = () => {
    if (submitting) return;
    setIsAddOpen(false);
    setSelectedIds([]);
  };

  const toggleMother = (mother) => {
    if (mother.already_in_casefiles) return;

    setSelectedIds((current) => current.includes(mother.id)
      ? current.filter((id) => id !== mother.id)
      : [...current, mother.id]);
  };

  const addSelectedMothers = async () => {
    if (selectedIds.length === 0) return;

    setSubmitting(true);

    try {
      const response = await axios.post(
        `${API_BASE_URL}/health-worker/casefiles`,
        { mother_ids: selectedIds },
        authConfig(),
      );
      setNotice({ type: "success", text: response.data.message });
      setIsAddOpen(false);
      setSelectedIds([]);
      await loadCasefiles();
    } catch (error) {
      const duplicate = error.response?.status === 409;
      setNotice({
        type: "error",
        text: duplicate
          ? "This patient is already in your casefiles."
          : error.response?.data?.message || "Unable to add the selected patients.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <HealthWorkerShell>
      <div className="mx-auto min-h-screen w-full max-w-[1500px] overflow-x-hidden px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <div className="border-b border-slate-300 pb-5">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">
            Barangay Cohort <span className="px-2 text-slate-300">•</span>
            <span className="text-pink-600">My Patients</span>
          </p>
          <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold text-slate-950 sm:text-2xl">Laguna Maternal Patient Register</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Triage and manage registered mothers according to risk level and clinical timeline.
              </p>
            </div>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-pink-600 px-5 text-sm font-extrabold text-white shadow-sm transition hover:bg-pink-700 focus:outline-none focus:ring-4 focus:ring-pink-100 sm:w-auto"
            >
              <UserPlus className="h-4 w-4" />
              Add Another Patient
            </button>
          </div>
        </div>

        {notice && (
          <div className={`mt-5 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-bold ${
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

        <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={pageSearch}
              onChange={(event) => setPageSearch(event.target.value)}
              placeholder="Search patients by name or phone..."
              className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
          >
            <option value="all">All Delivery Statuses</option>
            <option value="pregnant">Pregnant</option>
            <option value="postpartum">Postpartum</option>
            <option value="not_provided">Not provided</option>
          </select>
          <select
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value)}
            className="h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
          >
            <option value="all">All Risk Ratings</option>
            <option value="low">Low Risk</option>
            <option value="medium">Medium Risk</option>
            <option value="high">High Risk</option>
          </select>
        </div>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center text-slate-500">
            <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
            Loading patient casefiles...
          </div>
        ) : filteredCasefiles.length === 0 ? (
          <div className="mt-6 flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 text-center">
            <Users className="h-10 w-10 text-pink-300" />
            <h2 className="mt-4 text-lg font-extrabold text-slate-900">No patient casefiles found</h2>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              Add a registered mother to your list or change the active filters.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-pink-700"
            >
              <UserPlus className="h-4 w-4" />
              Add Patient
            </button>
          </div>
        ) : (
          <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
            {filteredCasefiles.map((mother) => (
              <article key={mother.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-pink-100 bg-pink-50 text-sm font-extrabold text-pink-600">
                      {mother.initials || "M"}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-extrabold text-slate-950">{mother.name}</h2>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">
                        {mother.age ? `${mother.age} years old` : "Age not provided"} • {mother.blood_type || "Blood type not provided"}
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase ${
                    riskStyles[mother.risk_rating] || riskStyles.low
                  }`}>
                    {riskLabels[mother.risk_rating] || "Low Risk"}
                  </span>
                </div>

                <dl className="mt-5 space-y-3 border-y border-slate-100 py-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="font-semibold text-slate-400">Current Status:</dt>
                    <dd className="text-right font-extrabold text-pink-600">{statusLabel(mother)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="font-semibold text-slate-400">Next Scheduled Visit:</dt>
                    <dd className="text-right font-extrabold text-slate-800">{formatDate(mother.next_scheduled_visit)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="font-semibold text-slate-400">Last Weight Logged:</dt>
                    <dd className="text-right font-extrabold text-slate-800">
                      {mother.last_weight_kg ? `${mother.last_weight_kg} kg` : "Not logged"}
                    </dd>
                  </div>
                </dl>

                {mother.co_monitoring_person && (
                  <div className="mt-3 flex items-center gap-2 rounded-md border border-pink-100 bg-pink-50/70 px-3 py-2 text-xs font-extrabold uppercase text-slate-500">
                    <UserRound className="h-4 w-4 text-amber-500" />
                    Co-monitoring: {mother.co_monitoring_person}
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/health-worker/mothers/${mother.id}`)}
                    className="h-10 flex-1 rounded-lg bg-pink-600 px-4 text-sm font-extrabold text-white transition hover:bg-pink-700"
                  >
                    View Detail Record
                  </button>
                  {mother.phone ? (
                    <a
                      href={`tel:${mother.phone}`}
                      className="flex h-10 w-11 items-center justify-center rounded-lg border border-slate-200 text-pink-600 transition hover:border-pink-200 hover:bg-pink-50"
                      aria-label={`Call ${mother.name}`}
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="flex h-10 w-11 cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 text-slate-300"
                      aria-label="No phone number available"
                    >
                      <Phone className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {isAddOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAddModal();
          }}
        >
          <section className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
              <div>
                <div className="flex items-center gap-3">
                  <UserPlus className="h-7 w-7 text-emerald-600" />
                  <h2 className="text-xl font-extrabold text-slate-900 sm:text-2xl">Add Patient to My List</h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Search and select registered mothers to add to your patient list
                </p>
              </div>
              <button
                type="button"
                onClick={closeAddModal}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close add patient modal"
              >
                <X className="h-6 w-6" />
              </button>
            </header>

            <div className="px-5 sm:px-7">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={modalSearch}
                  onChange={(event) => setModalSearch(event.target.value)}
                  placeholder="Search by name or phone number..."
                  autoFocus
                  className="h-14 w-full rounded-lg border border-slate-200 bg-slate-50 pl-12 pr-4 text-base font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
                />
              </label>

              <div className="mt-4 flex gap-3 border-l-4 border-blue-500 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
                <p>
                  <strong>How it works:</strong> These are mothers who have already registered in the system. Search for a patient and select them to add to your patient list.
                </p>
              </div>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto border-y border-slate-200 px-5 py-4 sm:px-7">
              {searching ? (
                <div className="flex min-h-52 items-center justify-center text-sm font-bold text-slate-500">
                  <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
                  Searching registered mothers...
                </div>
              ) : registeredMothers.length === 0 ? (
                <div className="flex min-h-52 flex-col items-center justify-center text-center">
                  <Users className="h-9 w-9 text-slate-300" />
                  <p className="mt-3 font-extrabold text-slate-700">No registered mothers found</p>
                  <p className="mt-1 text-sm text-slate-500">Try a different name, phone number, or address.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {registeredMothers.map((mother) => {
                    const selected = selectedIds.includes(mother.id);
                    const disabled = mother.already_in_casefiles;

                    return (
                      <button
                        type="button"
                        key={mother.id}
                        disabled={disabled}
                        onClick={() => toggleMother(mother)}
                        className={`relative w-full rounded-lg border p-4 text-left transition sm:p-5 ${
                          disabled
                            ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-65"
                            : selected
                              ? "border-pink-500 bg-pink-50/50 ring-2 ring-pink-100"
                              : "border-slate-200 bg-white hover:border-pink-300 hover:bg-pink-50/30"
                        }`}
                      >
                        <div className="flex gap-4 pr-10">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pink-600 text-base font-extrabold text-white">
                            {mother.initials || "M"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-extrabold text-slate-900">{mother.name}</h3>
                              {disabled && (
                                <span className="rounded bg-slate-200 px-2 py-1 text-xs font-bold text-slate-500">
                                  Already in your list
                                </span>
                              )}
                            </div>
                            <div className="mt-2 grid gap-x-6 gap-y-2 text-sm text-slate-600 sm:grid-cols-2">
                              <p className="flex items-center gap-2">
                                <UserRound className="h-4 w-4 shrink-0" />
                                {mother.age ? `${mother.age} years old` : "Age not provided"}
                              </p>
                              <p className="flex items-center gap-2">
                                <Phone className="h-4 w-4 shrink-0" />
                                {mother.phone || "Phone not provided"}
                              </p>
                              <p className="flex items-center gap-2 sm:col-span-2">
                                <MapPin className="h-4 w-4 shrink-0" />
                                {mother.address || "Address not provided"}
                              </p>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                              <span className="font-bold text-pink-600">{statusLabel(mother)}</span>
                              <span><strong>Due:</strong> {formatDate(mother.due_date)}</span>
                              <span><strong>Blood:</strong> {mother.blood_type || "Not provided"}</span>
                              <span><strong>Registered:</strong> {formatDate(mother.registered_at)}</span>
                            </div>
                          </div>
                        </div>
                        <span className={`absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-md border ${
                          selected
                            ? "border-pink-600 bg-pink-600 text-white"
                            : "border-slate-300 bg-white text-transparent"
                        }`} aria-hidden="true">
                          <Check className="h-4 w-4" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <footer className="flex flex-col-reverse items-stretch justify-between gap-3 bg-white px-5 py-4 sm:flex-row sm:items-center sm:px-7">
              <p className="text-sm font-bold text-slate-500">
                {selectedIds.length} patient{selectedIds.length === 1 ? "" : "s"} selected
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="h-11 flex-1 rounded-lg border border-slate-300 px-5 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50 sm:flex-none"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addSelectedMothers}
                  disabled={selectedIds.length === 0 || submitting}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-pink-600 px-5 text-sm font-extrabold text-white transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300 sm:flex-none"
                >
                  {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  Add Selected Patients
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

    </HealthWorkerShell>
  );
}
