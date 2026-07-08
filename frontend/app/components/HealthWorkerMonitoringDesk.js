"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Activity,
  AlertTriangle,
  Download,
  Eye,
  FileBarChart,
  HeartPulse,
  LoaderCircle,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Stethoscope,
  X,
} from "lucide-react";
import { getAuthToken } from "../utils/authSession";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

const authConfig = (extra = {}) => ({
  ...extra,
  headers: {
    Authorization: `Bearer ${getAuthToken()}`,
    ...(extra.headers || {}),
  },
});

const riskClasses = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-red-200 bg-red-50 text-red-700",
};

const riskLabels = {
  low: "Low Risk",
  medium: "Moderate Risk",
  high: "High Risk",
};

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value))
  : "Not provided";

function StatCard({ label, value, detail, icon: Icon, tone }) {
  return (
    <article className={`rounded-lg border p-5 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] opacity-80">{label}</p>
          <p className="mt-2 text-3xl font-extrabold">{value}</p>
          <p className="mt-1 text-xs font-semibold opacity-80">{detail}</p>
        </div>
        <Icon className="h-5 w-5 opacity-80" />
      </div>
    </article>
  );
}

export default function HealthWorkerMonitoringDesk({ reportMode = false }) {
  const [data, setData] = useState({ stats: {}, mothers: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [risk, setRisk] = useState("all");
  const [selectedMother, setSelectedMother] = useState(null);
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [entryForm, setEntryForm] = useState({
    pregnancy_week: 32,
    systolic_bp: 120,
    diastolic_bp: 80,
    blood_sugar_mgdl: 95,
    weight_kg: 74,
    hemoglobin_gdl: 12.5,
    body_temperature_c: 36.7,
    heart_rate: 86,
    notes: "",
  });

  const loadDesk = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);

    try {
      const response = await axios.get(`${API_BASE_URL}/health-worker/maternal-monitoring`, {
        ...authConfig(),
        params: { q: search, risk },
      });
      setData(response.data);
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.message || "Unable to load maternal monitoring desk." });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [risk, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDesk(), 250);
    const interval = window.setInterval(() => void loadDesk(true), 6000);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [loadDesk]);

  const openMother = async (mother) => {
    setSelectedMother(mother);
    const latest = mother.latest_entry || {};
    setEntryForm({
      pregnancy_week: latest.pregnancy_week || mother.pregnancy_week || 32,
      systolic_bp: latest.systolic_bp || 120,
      diastolic_bp: latest.diastolic_bp || 80,
      blood_sugar_mgdl: latest.blood_sugar_mgdl || 95,
      weight_kg: latest.weight_kg || 74,
      hemoglobin_gdl: latest.hemoglobin_gdl || 12.5,
      body_temperature_c: latest.body_temperature_c || 36.7,
      heart_rate: latest.heart_rate || 86,
      notes: "",
    });

    try {
      const response = await axios.get(`${API_BASE_URL}/health-worker/maternal-monitoring/${mother.id}`, authConfig());
      setSelectedSummary(response.data);
    } catch {
      setSelectedSummary(null);
    }
  };

  const saveEntry = async (event) => {
    event.preventDefault();
    if (!selectedMother) return;
    setSaving(true);

    try {
      const response = await axios.post(
        `${API_BASE_URL}/health-worker/maternal-monitoring/${selectedMother.id}/entries`,
        entryForm,
        authConfig(),
      );
      setNotice({ type: "success", text: response.data.message });
      await loadDesk(true);
      await openMother(selectedMother);
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.message || "Unable to save monitoring entry." });
    } finally {
      setSaving(false);
    }
  };

  const exportPdf = async () => {
    setExporting(true);

    try {
      const response = await axios.get(`${API_BASE_URL}/health-worker/maternal-monitoring/export-pdf`, authConfig({ responseType: "blob" }));
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "project-inay-maternal-monitoring-report.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.message || "Unable to export report." });
    } finally {
      setExporting(false);
    }
  };

  const tableMothers = useMemo(() => data.mothers || [], [data.mothers]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7f9fc] px-4 py-5 text-slate-950 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <header className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-900 pb-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">
              Barangay Cohort <span className="px-2 text-slate-300">•</span>
              <span className="text-pink-600">{reportMode ? "Reports" : "Monitor Desk"}</span>
            </p>
            <h1 className="mt-3 text-2xl font-extrabold text-slate-950">
              {reportMode ? "Regional Clinical Surveillance Reports Desks" : "Maternal Monitoring Desk"}
            </h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Cross-analyze patient files, maternal risk indices, and longitudinal monitoring charts.
            </p>
          </div>
          <button
            type="button"
            onClick={exportPdf}
            disabled={exporting}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-extrabold text-white hover:bg-slate-800 disabled:bg-slate-400"
          >
            {exporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export Report PDF
          </button>
        </header>

        {notice && (
          <div className={`mb-5 flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-bold ${notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="High Risk Alerts" value={data.stats?.high_risk_mothers || 0} detail="Requires active triage follow-ups" icon={AlertTriangle} tone="border-red-200 bg-red-50 text-red-700" />
          <StatCard label="Moderate Risk Monitoring" value={data.stats?.moderate_risk_mothers || 0} detail="Under strict observation window" icon={Activity} tone="border-amber-200 bg-amber-50 text-amber-700" />
          <StatCard label="Low Risk Safe Cohort" value={data.stats?.low_risk_mothers || 0} detail="Stable prenatal parameters" icon={ShieldCheck} tone="border-emerald-200 bg-emerald-50 text-emerald-700" />
          <StatCard label="Mean Blood Sugar" value={`${data.stats?.average_blood_sugar_mgdl || 0}`} detail="mg/dL cohort benchmark" icon={HeartPulse} tone="border-slate-900 bg-white text-slate-800" />
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search patient ID, name, age, or barangay..."
                className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 text-sm outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
              />
            </label>
            <select value={risk} onChange={(event) => setRisk(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-extrabold outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100">
              <option value="all">All Risk Classes</option>
              <option value="low">Low Risk</option>
              <option value="medium">Moderate Risk</option>
              <option value="high">High Risk</option>
            </select>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex h-72 items-center justify-center text-slate-500">
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading monitoring registry...
            </div>
          ) : tableMothers.length === 0 ? (
            <div className="flex h-72 flex-col items-center justify-center text-center">
              <Stethoscope className="h-10 w-10 text-slate-300" />
              <p className="mt-3 font-extrabold text-slate-800">No mothers in this monitoring list</p>
              <p className="mt-1 text-sm text-slate-500">Add mothers in Mothers Casefiles first, then they will appear here.</p>
            </div>
          ) : (
            <div className="inay-scroll-x">
              <table className="min-w-[1050px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Patient Code / Full Name</th>
                    <th className="px-4 py-3">Age</th>
                    <th className="px-4 py-3">Week</th>
                    <th className="px-4 py-3">Blood Pressure</th>
                    <th className="px-4 py-3">Blood Sugar</th>
                    <th className="px-4 py-3">Weight</th>
                    <th className="px-4 py-3">Hemoglobin</th>
                    <th className="px-4 py-3">Barangay</th>
                    <th className="px-4 py-3">Risk</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tableMothers.map((mother) => {
                    const latest = mother.latest_entry || {};
                    return (
                      <tr key={mother.id} className="hover:bg-pink-50/30">
                        <td className="px-4 py-4">
                          <p className="font-extrabold text-slate-950">{mother.name}</p>
                          <p className="text-xs font-bold text-slate-400">{mother.patient_code}</p>
                        </td>
                        <td className="px-4 py-4 font-bold">{mother.age || "N/A"} y/o</td>
                        <td className="px-4 py-4 font-bold">Week {mother.pregnancy_week || latest.pregnancy_week || "N/A"}</td>
                        <td className="px-4 py-4 font-extrabold">{latest.blood_pressure || "N/A"} mmHg</td>
                        <td className="px-4 py-4 font-extrabold">{latest.blood_sugar_mgdl || "N/A"} mg/dL</td>
                        <td className="px-4 py-4 font-extrabold">{latest.weight_kg || "N/A"} kg</td>
                        <td className="px-4 py-4 font-extrabold">{latest.hemoglobin_gdl || "N/A"} g/dL</td>
                        <td className="px-4 py-4 font-semibold text-slate-600">{mother.barangay || "Unassigned"}</td>
                        <td className="px-4 py-4">
                          <span className={`rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase ${riskClasses[mother.risk_level]}`}>
                            {riskLabels[mother.risk_level]}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <button type="button" onClick={() => openMother(mother)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-pink-600 px-3 text-xs font-extrabold text-white hover:bg-pink-700">
                            <Eye className="h-3.5 w-3.5" /> View / Update
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedMother && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-slate-950/55" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedMother(null); }}>
          <aside className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl">
            <header className="sticky top-0 z-10 border-b border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-pink-600">{selectedMother.patient_code}</p>
                  <h2 className="mt-1 text-xl font-extrabold">{selectedMother.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{selectedMother.barangay || "No barangay"} • Week {selectedMother.pregnancy_week || "N/A"}</p>
                </div>
                <button type="button" onClick={() => setSelectedMother(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close drawer"><X className="h-5 w-5" /></button>
              </div>
            </header>

            <div className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold text-slate-400">Address</p><p className="mt-1 font-bold">{selectedMother.address || "Not provided"}</p></div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold text-slate-400">Contact</p><p className="mt-1 font-bold">{selectedMother.phone || "Not provided"}</p></div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold text-slate-400">Due Date</p><p className="mt-1 font-bold">{formatDate(selectedMother.due_date)}</p></div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold text-slate-400">Previous Deliveries</p><p className="mt-1 font-bold">{selectedMother.previous_deliveries ?? "Not recorded"}</p></div>
              </div>

              <div className={`rounded-lg border p-4 ${riskClasses[selectedMother.risk_level]}`}>
                <p className="text-[10px] font-extrabold uppercase tracking-wide">AI Risk Assessment</p>
                <p className="mt-1 text-2xl font-extrabold">{riskLabels[selectedMother.risk_level]}</p>
                <p className="mt-2 text-sm font-semibold">Classification updates automatically after each monitoring entry.</p>
              </div>

              <form onSubmit={saveEntry} className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-4 flex items-center gap-2 font-extrabold"><Plus className="h-4 w-4 text-pink-600" /> Add Monitoring Entry</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["pregnancy_week", "Pregnancy Week"],
                    ["weight_kg", "Weight (kg)"],
                    ["systolic_bp", "Systolic BP"],
                    ["diastolic_bp", "Diastolic BP"],
                    ["blood_sugar_mgdl", "Blood Sugar (mg/dL)"],
                    ["hemoglobin_gdl", "Hemoglobin (g/dL)"],
                    ["body_temperature_c", "Temperature (C)"],
                    ["heart_rate", "Heart Rate"],
                  ].map(([key, label]) => (
                    <label key={key} className="text-sm font-extrabold uppercase text-slate-600">
                      {label}
                      <input
                        type="number"
                        step={key.includes("weight") || key.includes("sugar") || key.includes("hemoglobin") || key.includes("temperature") ? "0.1" : "1"}
                        value={entryForm[key]}
                        onChange={(event) => setEntryForm({ ...entryForm, [key]: event.target.value })}
                        className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
                      />
                    </label>
                  ))}
                  <label className="text-sm font-extrabold uppercase text-slate-600 sm:col-span-2">
                    Notes
                    <textarea value={entryForm.notes} onChange={(event) => setEntryForm({ ...entryForm, notes: event.target.value })} rows={3} className="mt-1.5 w-full resize-none rounded-lg border border-slate-300 p-3 text-sm normal-case outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100" />
                  </label>
                </div>
                <button type="submit" disabled={saving} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 text-sm font-extrabold text-white hover:bg-pink-700 disabled:bg-pink-300">
                  {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Monitoring Entry
                </button>
              </form>

              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-extrabold"><FileBarChart className="h-4 w-4 text-pink-600" /> Recent Weight Logs</h3>
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {selectedSummary?.summary?.weight_logs?.slice().reverse().map((log) => (
                    <div key={log.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-semibold text-slate-500">Week {log.pregnancy_week}</span>
                      <span className="font-extrabold">{log.weight_kg} kg</span>
                    </div>
                  )) || <p className="text-sm text-slate-500">No logs yet.</p>}
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
