"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { CalendarDays, Droplets, Heart, LocateFixed, Lock, MapPin, Phone, Shield, UserPlus } from "lucide-react";
import { getNearestFacility } from "../data/healthFacilities";
import { SAN_PABLO_BARANGAYS } from "../data/sanPabloBarangays";
import { setAuthSession } from "../utils/authSession";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";
const LOCATION_STORAGE_KEY = "inay_user_location";
const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];

export default function Register() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "mother",
    barangay: "",
    age: "",
    phone: "",
    blood_type: "",
    pregnancy_status: "not_provided",
    pregnancy_month: "",
  });
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [locationMessage, setLocationMessage] = useState("");

  const nearestFacility = userLocation ? getNearestFacility(userLocation) : null;

  const selectRole = (role) => {
    setForm((current) => ({
      ...current,
      role,
      barangay: role === "mother" ? current.barangay : "",
      age: role === "mother" ? current.age : "",
      phone: role === "mother" ? current.phone : "",
      blood_type: role === "mother" ? current.blood_type : "",
      pregnancy_status: role === "mother" ? current.pregnancy_status : "not_provided",
      pregnancy_month: role === "mother" ? current.pregnancy_month : "",
    }));
    setFieldErrors({});
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      setLocationMessage("Location is not supported on this device or browser.");
      return;
    }

    setLocationStatus("locating");
    setLocationMessage("Requesting your live location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
          capturedAt: new Date().toISOString(),
        };

        localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(nextLocation));
        setUserLocation(nextLocation);
        setLocationStatus("ready");
        setLocationMessage("Location saved on this device for nearby Health Services.");
      },
      (error) => {
        setLocationStatus("error");
        setLocationMessage(error.message || "Unable to get your location. Please allow location access.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  const registerUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFieldErrors({});

    try {
      const payload = {
        ...form,
        pregnancy_month: form.role === "mother" && form.pregnancy_status === "pregnant"
          ? form.pregnancy_month
          : null,
        location: form.role === "mother" ? userLocation : null,
      };

      const response = await axios.post(`${API_BASE_URL}/register`, {
        ...payload,
      });

      setAuthSession({
        token: response.data.token,
        user: response.data.user,
        activePortal: response.data.active_portal,
      });

      router.push(form.role === "health_worker" ? "/health-worker" : "/dashboard");
    } catch (error) {
      const validationErrors = error.response?.data?.errors || {};
      const visibleErrorFields = [
        "email",
        "password",
        "barangay",
        "age",
        "phone",
        "blood_type",
        "pregnancy_status",
        "pregnancy_month",
      ];
      const nextFieldErrors = Object.fromEntries(
        Object.entries(validationErrors)
          .filter(([field]) => visibleErrorFields.includes(field))
          .map(([field, messages]) => [field, messages?.[0]])
      );

      if (Object.keys(nextFieldErrors).length > 0) {
        setFieldErrors(nextFieldErrors);
      } else {
        const firstError = Object.values(validationErrors).flat()[0];
        alert(firstError || error.response?.data?.message || "Registration failed.");
      }
    } finally {
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
              Mag-sign up sa platform
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Pumili ng tungkulin (Role-based Portal)
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => selectRole("mother")}
              className={`flex min-h-20 flex-col items-center justify-center rounded-2xl px-3 py-4 transition ${
                form.role === "mother"
                  ? "border-2 border-pink-500 bg-pink-50 text-pink-600"
                  : "border border-slate-200 bg-white text-slate-500 hover:border-pink-200"
              }`}
            >
              <Heart className="mb-2 h-5 w-5" />
              <span className="text-xs font-bold">Mother/User Portal</span>
            </button>
            <button
              type="button"
              onClick={() => selectRole("health_worker")}
              className={`flex min-h-20 flex-col items-center justify-center rounded-2xl px-3 py-4 transition ${
                form.role === "health_worker"
                  ? "border-2 border-pink-500 bg-pink-50 text-pink-600"
                  : "border border-slate-200 bg-white text-slate-500 hover:border-pink-200"
              }`}
            >
              <Shield className="mb-2 h-5 w-5" />
              <span className="text-xs font-medium">Program Staff</span>
            </button>
          </div>

          <form onSubmit={registerUser} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-extrabold uppercase text-slate-600">
                Buong Pangalan (Full Name)
              </label>
              <input
                type="text"
                placeholder="e.g. Juan dela Cruz"
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-extrabold uppercase text-slate-600">
                Email Address
              </label>
              <input
                type="email"
                placeholder="maria.santos@inayhealth.org"
                className={`h-12 w-full rounded-xl border bg-white px-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                  fieldErrors.email
                    ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                    : "border-slate-300 focus:border-pink-500 focus:ring-pink-100"
                }`}
                value={form.email}
                onChange={(e) => {
                  setForm({ ...form, email: e.target.value });
                  setFieldErrors((current) => ({ ...current, email: undefined }));
                }}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "register-email-error" : undefined}
                required
              />
              {fieldErrors.email && (
                <p id="register-email-error" className="mt-2 text-sm font-bold text-red-600">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-xs font-extrabold uppercase text-slate-600">
                Password
              </label>
              <input
                type="password"
                placeholder="Password"
                className={`h-12 w-full rounded-xl border bg-white px-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                  fieldErrors.password
                    ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                    : "border-slate-300 focus:border-pink-500 focus:ring-pink-100"
                }`}
                value={form.password}
                onChange={(e) => {
                  setForm({ ...form, password: e.target.value });
                  setFieldErrors((current) => ({ ...current, password: undefined }));
                }}
                minLength={8}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? "register-password-error" : undefined}
                required
              />
              {fieldErrors.password && (
                <p id="register-password-error" className="mt-2 text-sm font-bold text-red-600">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {form.role === "mother" && (
              <>
                <div>
                  <label className="mb-2 block text-xs font-extrabold uppercase text-slate-600">
                    Barangay (San Pablo City, Laguna)
                  </label>
                  <select
                    className={`h-12 w-full rounded-xl border bg-white px-4 text-sm font-medium text-slate-900 outline-none transition focus:ring-4 ${
                      fieldErrors.barangay
                        ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                        : "border-slate-300 focus:border-pink-500 focus:ring-pink-100"
                    }`}
                    value={form.barangay}
                    onChange={(e) => {
                      setForm({ ...form, barangay: e.target.value });
                      setFieldErrors((current) => ({ ...current, barangay: undefined }));
                    }}
                    aria-invalid={Boolean(fieldErrors.barangay)}
                    aria-describedby={fieldErrors.barangay ? "register-barangay-error" : undefined}
                    required
                  >
                    <option value="">Pumili ng barangay</option>
                    {SAN_PABLO_BARANGAYS.map((barangay) => (
                      <option key={barangay} value={barangay}>
                        {barangay}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.barangay && (
                    <p id="register-barangay-error" className="mt-2 text-sm font-bold text-red-600">
                      {fieldErrors.barangay}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase text-slate-600">
                    <Phone className="h-4 w-4 text-pink-600" />
                    Contact Number
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    pattern="^([+]63|0)9[0-9]{9}$"
                    placeholder="e.g. 09171234567"
                    className={`h-12 w-full rounded-xl border bg-white px-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                      fieldErrors.phone
                        ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                        : "border-slate-300 focus:border-pink-500 focus:ring-pink-100"
                    }`}
                    value={form.phone}
                    onChange={(e) => {
                      setForm({ ...form, phone: e.target.value });
                      setFieldErrors((current) => ({ ...current, phone: undefined }));
                    }}
                    aria-invalid={Boolean(fieldErrors.phone)}
                    aria-describedby={fieldErrors.phone ? "register-phone-error" : undefined}
                    required
                  />
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Use PH mobile format: 09XXXXXXXXX or +639XXXXXXXXX.
                  </p>
                  {fieldErrors.phone && (
                    <p id="register-phone-error" className="mt-2 text-sm font-bold text-red-600">
                      {fieldErrors.phone}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase text-slate-600">
                      <CalendarDays className="h-4 w-4 text-pink-600" />
                      Age
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="60"
                      placeholder="e.g. 28"
                      className={`h-12 w-full rounded-xl border bg-white px-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                        fieldErrors.age
                          ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                          : "border-slate-300 focus:border-pink-500 focus:ring-pink-100"
                      }`}
                      value={form.age}
                      onChange={(e) => {
                        setForm({ ...form, age: e.target.value });
                        setFieldErrors((current) => ({ ...current, age: undefined }));
                      }}
                      aria-invalid={Boolean(fieldErrors.age)}
                      aria-describedby={fieldErrors.age ? "register-age-error" : undefined}
                      required
                    />
                    {fieldErrors.age && (
                      <p id="register-age-error" className="mt-2 text-sm font-bold text-red-600">
                        {fieldErrors.age}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase text-slate-600">
                      <Droplets className="h-4 w-4 text-pink-600" />
                      Blood Type
                    </label>
                    <select
                      className={`h-12 w-full rounded-xl border bg-white px-4 text-sm font-medium text-slate-900 outline-none transition focus:ring-4 ${
                        fieldErrors.blood_type
                          ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                          : "border-slate-300 focus:border-pink-500 focus:ring-pink-100"
                      }`}
                      value={form.blood_type}
                      onChange={(e) => {
                        setForm({ ...form, blood_type: e.target.value });
                        setFieldErrors((current) => ({ ...current, blood_type: undefined }));
                      }}
                      aria-invalid={Boolean(fieldErrors.blood_type)}
                      aria-describedby={fieldErrors.blood_type ? "register-blood-type-error" : undefined}
                      required
                    >
                      <option value="">Pumili ng blood type</option>
                      {BLOOD_TYPES.map((bloodType) => (
                        <option key={bloodType} value={bloodType}>
                          {bloodType}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.blood_type && (
                      <p id="register-blood-type-error" className="mt-2 text-sm font-bold text-red-600">
                        {fieldErrors.blood_type}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-extrabold uppercase text-slate-600">
                      Pregnancy Status
                    </label>
                    <select
                      className={`h-12 w-full rounded-xl border bg-white px-4 text-sm font-medium text-slate-900 outline-none transition focus:ring-4 ${
                        fieldErrors.pregnancy_status
                          ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                          : "border-slate-300 focus:border-pink-500 focus:ring-pink-100"
                      }`}
                      value={form.pregnancy_status}
                      onChange={(e) => {
                        const nextStatus = e.target.value;
                        setForm({
                          ...form,
                          pregnancy_status: nextStatus,
                          pregnancy_month: nextStatus === "pregnant" ? form.pregnancy_month : "",
                        });
                        setFieldErrors((current) => ({
                          ...current,
                          pregnancy_status: undefined,
                          pregnancy_month: undefined,
                        }));
                      }}
                      aria-invalid={Boolean(fieldErrors.pregnancy_status)}
                      aria-describedby={fieldErrors.pregnancy_status ? "register-pregnancy-status-error" : undefined}
                      required
                    >
                      <option value="not_provided">Not pregnant</option>
                      <option value="pregnant">Pregnant</option>
                      <option value="postpartum">Postpartum</option>
                    </select>
                    {fieldErrors.pregnancy_status && (
                      <p id="register-pregnancy-status-error" className="mt-2 text-sm font-bold text-red-600">
                        {fieldErrors.pregnancy_status}
                      </p>
                    )}
                  </div>

                  {form.pregnancy_status === "pregnant" && (
                    <div>
                      <label className="mb-2 block text-xs font-extrabold uppercase text-slate-600">
                        Months Pregnant
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        placeholder="e.g. 8"
                        className={`h-12 w-full rounded-xl border bg-white px-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                          fieldErrors.pregnancy_month
                            ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                            : "border-slate-300 focus:border-pink-500 focus:ring-pink-100"
                        }`}
                        value={form.pregnancy_month}
                        onChange={(e) => {
                          setForm({ ...form, pregnancy_month: e.target.value });
                          setFieldErrors((current) => ({ ...current, pregnancy_month: undefined }));
                        }}
                        aria-invalid={Boolean(fieldErrors.pregnancy_month)}
                        aria-describedby={fieldErrors.pregnancy_month ? "register-pregnancy-month-error" : undefined}
                        required
                      />
                      {fieldErrors.pregnancy_month && (
                        <p id="register-pregnancy-month-error" className="mt-2 text-sm font-bold text-red-600">
                          {fieldErrors.pregnancy_month}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
                        <MapPin className="h-4 w-4 text-pink-600" />
                        Location for Health Services
                      </p>
                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                        Optional: use live location to guide you to nearby listed hospitals and clinics.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={requestLocation}
                      disabled={locationStatus === "locating"}
                      className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-pink-600 px-4 text-sm font-extrabold text-white transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300"
                    >
                      <LocateFixed className="h-4 w-4" />
                      {locationStatus === "locating" ? "Locating..." : "Use Location"}
                    </button>
                  </div>

                  {locationMessage && (
                    <p className={`mt-3 text-xs font-bold leading-5 ${
                      locationStatus === "error" ? "text-red-600" : "text-emerald-700"
                    }`}>
                      {locationMessage}
                    </p>
                  )}

                  {nearestFacility && (
                    <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                      Nearest listed facility:{" "}
                      <span className="text-pink-600">{nearestFacility.name}</span>
                    </p>
                  )}
                </div>
              </>
            )}

            <label className="flex items-start gap-3 rounded-xl border border-pink-100 bg-pink-50/70 p-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={acceptedPrivacy}
                onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-pink-600 accent-pink-600 focus:ring-pink-500"
                required
              />
              <span>
                I have read and agree to the{" "}
                <Link
                  href="/privacy-policy"
                  className="font-extrabold text-pink-600 underline decoration-pink-300 underline-offset-4 hover:text-pink-700"
                >
                  Privacy Policy
                </Link>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !acceptedPrivacy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-pink-600 px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300"
            >
              {loading ? (
                <>
                  <Lock className="h-4 w-4" />
                  Nagre-register...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  {form.role === "health_worker"
                    ? "Register / Add Program Staff Portal"
                    : "Register / Add Mother Portal"}
                </>
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-5 text-center">
            <p className="text-sm font-bold text-pink-600">
              Mayroon nang account?{" "}
              <Link href="/login" className="hover:text-pink-700 hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
