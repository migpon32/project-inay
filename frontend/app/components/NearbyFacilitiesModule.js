"use client";

import { memo, useMemo, useState } from "react";
import {
  Building2,
  Clock,
  Filter,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  Route,
  Shield,
  Star,
} from "lucide-react";
import useApiQuery from "../hooks/useApiQuery";

const LOCATION_STORAGE_KEY = "inay_user_location";

const readSavedLocation = () => {
  if (typeof window === "undefined") return null;

  try {
    return JSON.parse(localStorage.getItem(LOCATION_STORAGE_KEY) || "null");
  } catch {
    localStorage.removeItem(LOCATION_STORAGE_KEY);
    return null;
  }
};

const formatDistance = (facility) => {
  if (facility.distance_km === null || facility.distance_km === undefined) return "Distance unavailable";

  return `${Number(facility.distance_km).toFixed(1)} km${facility.distance_source === "estimated" ? " est." : ""}`;
};

function NearbyFacilitiesModule({ userName }) {
  const savedLocation = readSavedLocation();
  const [userLocation, setUserLocation] = useState(savedLocation);
  const [locationStatus, setLocationStatus] = useState(savedLocation ? "ready" : "idle");
  const [locationMessage, setLocationMessage] = useState(savedLocation ? "Using the saved GPS location from this device." : "");
  const [activeType, setActiveType] = useState("all");
  const queryKey = userLocation
    ? `/health-services/nearby?latitude=${encodeURIComponent(userLocation.latitude)}&longitude=${encodeURIComponent(userLocation.longitude)}`
    : null;
  const { data, error, isLoading, isValidating, mutate } = useApiQuery(queryKey, {
    dedupingInterval: 30 * 60 * 1000,
    keepPreviousData: true,
    revalidateOnFocus: false,
  });

  const facilityTypes = data?.facility_types || [];
  const visibleGroups = useMemo(() => {
    const groups = data?.groups || [];
    if (activeType === "all") return groups;

    return groups.filter((group) => group.key === activeType);
  }, [activeType, data?.groups]);
  const visibleCount = visibleGroups.reduce((count, group) => count + (group.facilities?.length || 0), 0);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      setLocationMessage("Location is not supported on this device or browser.");
      return;
    }

    setLocationStatus("locating");
    setLocationMessage("Requesting your live GPS location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          accuracy: Math.round(position.coords.accuracy),
          capturedAt: new Date().toISOString(),
        };

        localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(nextLocation));
        setUserLocation(nextLocation);
        setLocationStatus("ready");
        setLocationMessage("Live GPS location enabled. Searching nearby maternal and child health facilities.");
        setActiveType("all");
      },
      (locationError) => {
        setLocationStatus("error");
        setLocationMessage(locationError.message || "Unable to get your location. Please allow location access.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-pink-100 bg-pink-50 p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-pink-600">
              <LocateFixed className="h-4 w-4" />
              GPS Facility Search
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {locationMessage || `Enable GPS to rank facilities near ${userName} by driving distance.`}
            </p>
            {data?.meta?.warning && (
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                {data.meta.warning}
              </p>
            )}
            {error && (
              <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">
                Unable to refresh nearby facilities. Showing cached results if available.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={requestLocation}
              disabled={locationStatus === "locating"}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-pink-600 px-5 text-sm font-extrabold text-white shadow-sm transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300"
            >
              <LocateFixed className="h-4 w-4" />
              {locationStatus === "locating" ? "Finding location..." : "Use My Location"}
            </button>
            {userLocation && (
              <button
                type="button"
                onClick={() => void mutate()}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-pink-200 bg-white px-4 text-sm font-extrabold text-pink-600 transition hover:bg-pink-50"
              >
                <RefreshCw className={`h-4 w-4 ${isValidating ? "animate-spin" : ""}`} />
                Refresh
              </button>
            )}
          </div>
        </div>
      </section>

      {userLocation && (
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                <Filter className="h-4 w-4 text-pink-600" />
                Facility Filters
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {isLoading && !data ? "Searching free map data..." : `${visibleCount} nearby result${visibleCount === 1 ? "" : "s"}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterChip label="All" active={activeType === "all"} onClick={() => setActiveType("all")} />
              {facilityTypes.map((type) => (
                <FilterChip
                  key={type.key}
                  label={type.label}
                  active={activeType === type.key}
                  onClick={() => setActiveType(type.key)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {!userLocation ? (
        <EmptyLocationCard />
      ) : isLoading && !data ? (
        <FacilityResultsSkeleton />
      ) : visibleGroups.length === 0 ? (
        <NoResultsCard activeType={activeType} />
      ) : (
        <div className="space-y-6">
          {visibleGroups.map((group) => (
            <section key={group.key} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-slate-950">{group.label}</h2>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-extrabold text-slate-500">
                  {group.count} found
                </span>
              </div>
              <div className="space-y-4">
                {group.facilities.map((facility) => (
                  <FacilityCard key={`${facility.facility_type_key}-${facility.id}`} facility={facility} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 rounded-full border px-4 text-xs font-extrabold transition ${
        active
          ? "border-pink-600 bg-pink-600 text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-600 hover:border-pink-200 hover:bg-pink-50 hover:text-pink-600"
      }`}
    >
      {label}
    </button>
  );
}

const FacilityCard = memo(function FacilityCard({ facility }) {
  const statusTone = facility.operating_status?.startsWith("Open")
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : facility.operating_status === "Closed"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-pink-600 ring-1 ring-pink-100">
            <Building2 className="h-4 w-4" />
            {facility.facility_type}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-blue-700 ring-1 ring-blue-100">
            <Route className="h-4 w-4" />
            {formatDistance(facility)}
          </span>
          <span className={`rounded-full border px-3 py-1 text-xs font-extrabold uppercase ${statusTone}`}>
            {facility.operating_status}
          </span>
        </div>

        <h3 className="mt-4 text-2xl font-extrabold leading-tight text-slate-950">{facility.name}</h3>
        <p className="mt-2 flex items-start gap-2 text-sm font-semibold leading-6 text-slate-500">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pink-600" />
          {facility.address}
        </p>

        <div className="mt-5 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoTile icon={Clock} label="Travel Time" value={facility.travel_time_text || "Unavailable"} tone="text-emerald-600" />
          <InfoTile icon={Star} label="Rating" value={facility.rating ? `${facility.rating} (${facility.user_rating_count || 0})` : "No rating"} tone="text-orange-500" />
          <InfoTile icon={Phone} label="Phone" value={facility.phone || "Not available"} tone="text-pink-600" />
          <InfoTile icon={Shield} label="Distance Source" value={distanceSourceLabel(facility.distance_source)} tone="text-blue-600" />
        </div>

        <div className="mt-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-400">
            Maternal & Child Health Services
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(facility.services || []).map((service) => (
              <span
                key={service}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
              >
                <Shield className="h-4 w-4 text-slate-400" />
                {service}
              </span>
            ))}
          </div>
          {facility.service_note && (
            <p className="mt-3 text-xs font-bold text-slate-500">{facility.service_note}</p>
          )}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <a
            href={facility.navigation_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-pink-600 text-sm font-extrabold text-white transition hover:bg-pink-700"
          >
            <Navigation className="h-4 w-4" />
            Navigate
          </a>
          {facility.phone ? (
            <a
              href={`tel:${facility.phone}`}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
            >
              <Phone className="h-4 w-4 text-slate-400" />
              Call
            </a>
          ) : (
            <a
              href={facility.google_maps_url || facility.navigation_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
            >
              <Phone className="h-4 w-4 text-slate-400" />
              View Contact
            </a>
          )}
        </div>
      </div>
    </article>
  );
});

function InfoTile({ icon: Icon, label, value, tone }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${tone}`} />
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{label}</p>
      </div>
      <p className="mt-1 break-words text-sm font-extrabold text-slate-950">{value}</p>
    </div>
  );
}

function distanceSourceLabel(source) {
  if (source === "google_routes") return "Google Routes";
  if (source === "osrm") return "OpenStreetMap route";
  return "Estimated";
}

function EmptyLocationCard() {
  return (
    <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <LocateFixed className="mx-auto h-10 w-10 text-pink-300" />
      <h2 className="mt-4 text-lg font-extrabold text-slate-950">GPS location needed</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm font-semibold leading-6 text-slate-500">
        The nearby care list appears after location permission is granted.
      </p>
    </section>
  );
}

function NoResultsCard({ activeType }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <Building2 className="mx-auto h-10 w-10 text-slate-300" />
      <h2 className="mt-4 text-lg font-extrabold text-slate-950">No facilities found</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm font-semibold leading-6 text-slate-500">
        No {activeType === "all" ? "nearby facility" : "facility"} matched this filter in the current search radius.
      </p>
    </section>
  );
}

function FacilityResultsSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading nearby facilities">
      {[0, 1, 2].map((item) => (
        <article key={item} className="h-72 animate-pulse rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex gap-2">
            <div className="h-7 w-32 rounded-full bg-slate-100" />
            <div className="h-7 w-24 rounded-full bg-slate-100" />
          </div>
          <div className="mt-5 h-8 w-2/3 rounded bg-slate-100" />
          <div className="mt-4 h-4 w-full rounded bg-slate-100" />
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((tile) => (
              <div key={tile} className="h-16 rounded-2xl bg-slate-100" />
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

export default memo(NearbyFacilitiesModule);
