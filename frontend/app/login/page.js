"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Heart, Lock, Shield } from "lucide-react";
import { setAuthSession } from "../utils/authSession";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";
const LOGIN_TIMEOUT_MS = 20000;

export default function Login() {
  const router = useRouter();

  const [form, setForm] = useState({
    email: "",
    password: "",
    portal: "mother",
  });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    router.prefetch("/dashboard");
    router.prefetch("/health-worker");
  }, [router]);

  const loginUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");

    try {
      const res = await axios.post(`${API_BASE_URL}/login`, form, { timeout: LOGIN_TIMEOUT_MS });

      setAuthSession({
        token: res.data.token,
        user: res.data.user,
        activePortal: res.data.active_portal,
      });

      const targetPath = res.data.active_portal === "health_worker" ? "/health-worker" : "/dashboard";
      setLoading(false);
      router.replace(targetPath);
    } catch (error) {
      setErrorMessage(error.code === "ECONNABORTED"
        ? "Login is taking longer than expected. Please check if the local API server is running, then try again."
        : error.response?.data?.message || "Unable to connect to server.");
      setLoading(false);
    }
  };

  return (
    <main className="inay-readable-entry min-h-screen bg-[#fafafa] px-4 py-10 text-slate-900">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 shadow-lg">
          <Heart className="h-7 w-7 fill-pink-500 text-pink-500" />
        </div>

        <div className="mb-7 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">
            Project INAY
          </h1>
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-pink-600">
            MNCH Innovative Maternal Program
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Innovative Nanay Building Strengthening Maternal, Neonatal and Child Health Program
          </p>
        </div>

        <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-md md:p-8">
          <div className="mb-6 text-center">
            <h2 className="font-extrabold text-slate-950">
              Mag-login sa platform
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Pumili ng tungkulin (Role-based Portal)
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setForm({ ...form, portal: "mother" })}
              className={`flex min-h-20 flex-col items-center justify-center rounded-2xl px-3 py-4 transition ${
                form.portal === "mother"
                  ? "border-2 border-pink-500 bg-pink-50 text-pink-600"
                  : "border border-slate-200 bg-white text-slate-500 hover:border-pink-200"
              }`}
            >
              <Heart className="mb-2 h-5 w-5" />
              <span className="text-xs font-bold">Mother/User Portal</span>
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, portal: "health_worker" })}
              className={`flex min-h-20 flex-col items-center justify-center rounded-2xl px-3 py-4 transition ${
                form.portal === "health_worker"
                  ? "border-2 border-pink-500 bg-pink-50 text-pink-600"
                  : "border border-slate-200 bg-white text-slate-500 hover:border-pink-200"
              }`}
            >
              <Shield className="mb-2 h-5 w-5" />
              <span className="text-xs font-medium">Program Staff</span>
            </button>
          </div>

          <form onSubmit={loginUser} className="space-y-4">
            {errorMessage && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {errorMessage}
              </div>
            )}

            <div>
              <label className="mb-2 block text-xs font-extrabold uppercase text-slate-600">
                Email Address
              </label>
              <input
                type="email"
                placeholder="maria.santos@inayhealth.org"
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-extrabold uppercase text-slate-600">
                Password
              </label>
              <input
                type="password"
                placeholder="Password"
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-pink-600 px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300"
            >
              <Lock className="h-4 w-4" />
              {loading
                ? "Nagla-login..."
                : form.portal === "health_worker"
                  ? "Login as Program Staff"
                  : "Login as Mother/User"}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-5 text-center">
            <p className="text-sm font-bold text-pink-600">
              Wala pang account?{" "}
              <Link href="/register" className="hover:text-pink-700 hover:underline">
                Mag-register
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
