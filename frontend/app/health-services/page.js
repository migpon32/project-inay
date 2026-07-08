"use client";

import { memo, useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Clock,
  Filter,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  Shield,
  Star,
} from "lucide-react";
import {
  facilityCategories,
  getDirectionsUrl,
  getDistanceKm,
  healthFacilities,
  helpDeskItems,
} from "../data/healthFacilities";

const LOCATION_STORAGE_KEY = "inay_user_location";
const LOCATION_CHANGED_EVENT = "inay-location-changed";

const subscribeToSavedLocation = (onStoreChange) => {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(LOCATION_CHANGED_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(LOCATION_CHANGED_EVENT, onStoreChange);
  };
};

const getSavedLocationSnapshot = () => {
  if (typeof window === "undefined") return "";

  return localStorage.getItem(LOCATION_STORAGE_KEY) || "";
};

const getServerLocationSnapshot = () => "";

const parseSavedLocation = (locationJson) => {
  if (!locationJson) return null;

  try {
    return JSON.parse(locationJson);
  } catch {
    if (typeof window !== "undefined") localStorage.removeItem(LOCATION_STORAGE_KEY);
    return null;
  }
};

const saveLocation = (location) => {
  if (typeof window === "undefined") return null;

  localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
  window.dispatchEvent(new Event(LOCATION_CHANGED_EVENT));
};

export default function HealthServices() {
  const locationJson = useSyncExternalStore(subscribeToSavedLocation, getSavedLocationSnapshot, getServerLocationSnapshot);
  const userLocation = useMemo(() => parseSavedLocation(locationJson), [locationJson]);
  const [locationStatus, setLocationStatus] = useState(userLocation ? "ready" : "idle");
  const [locationErrorMessage, setLocationErrorMessage] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const locationMessage = useMemo(() => {
    if (locationStatus === "locating") return "Requesting your live location...";
    if (locationStatus === "error") return locationErrorMessage;
    if (userLocation) return "Live location enabled. Listed maternal healthcare facilities are sorted by estimated straight-line distance.";

    return "Enable GPS to sort the listed maternal healthcare facilities by estimated distance.";
  }, [locationErrorMessage, locationStatus, userLocation]);
  const categoryCounts = useMemo(() => {
    return healthFacilities.reduce((counts, facility) => {
      counts[facility.categoryKey] = (counts[facility.categoryKey] || 0) + 1;
      return counts;
    }, {});
  }, []);
  const facilitiesWithDistance = useMemo(() => {
    return [...healthFacilities]
      .map((facility) => ({
        ...facility,
        distanceKm: userLocation ? getDistanceKm(userLocation, facility) : null,
      }))
      .sort((first, second) => {
        if (first.distanceKm === null || second.distanceKm === null) return 0;

        return first.distanceKm - second.distanceKm;
      });
  }, [userLocation]);
  const nearestFacility = userLocation ? facilitiesWithDistance[0] : null;
  const listedFacilities = useMemo(() => {
    if (activeCategory === "all") return facilitiesWithDistance;

    return facilitiesWithDistance.filter((facility) => facility.categoryKey === activeCategory);
  }, [activeCategory, facilitiesWithDistance]);
  const handleCategorySelect = useCallback((categoryKey) => {
    setActiveCategory(categoryKey);
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      setLocationErrorMessage("Location is not supported on this device or browser.");
      return;
    }

    setLocationStatus("locating");
    setLocationErrorMessage("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          accuracy: Math.round(position.coords.accuracy),
          capturedAt: new Date().toISOString(),
        };

        saveLocation(nextLocation);
        setLocationStatus("ready");
      },
      (error) => {
        setLocationStatus("error");
        setLocationErrorMessage(error.message || "Unable to get your location. Please allow location access.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  }, []);

  return (
    <div className="overflow-x-hidden p-3 sm:p-4 lg:p-6">
      <div className="mx-auto w-full max-w-7xl space-y-4 lg:space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,430px)] lg:items-center">
            <div>
              <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-pink-600 ring-1 ring-pink-100">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                Local Listed Maternal Healthcare Directory
              </div>
              <h1 className="max-w-4xl text-[clamp(1.75rem,3vw,2.75rem)] font-extrabold leading-[1.05] tracking-tight text-slate-950">
                Find Nearby Listed Maternal Healthcare Facilities
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                This page uses Project INAY&apos;s local listed facilities around San Pablo City. It does not
                perform a live Google Maps, OpenStreetMap, or online healthcare facility search.
              </p>
              <div className="mt-4 grid gap-2 text-xs font-bold leading-5 text-slate-600 sm:grid-cols-3">
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  GPS only sorts the listed facilities by estimated straight-line distance.
                </p>
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  Distances are GPS estimates, not real driving distance or traffic time.
                </p>
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  Directions open Google Maps with a normal URL, not a paid Google Maps API.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-pink-100 bg-pink-50 p-4">
              <button
                type="button"
                onClick={requestLocation}
                disabled={locationStatus === "locating"}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-pink-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300 sm:w-auto"
              >
                <LocateFixed className="h-4 w-4" />
                {locationStatus === "locating" ? "Finding Location..." : "Use My Location"}
              </button>
              <p className={`mt-3 text-sm font-bold leading-6 ${
                locationStatus === "error" ? "text-rose-700" : "text-slate-700"
              }`}>
                {locationMessage}
              </p>
              <p className="mt-3 rounded-xl border border-pink-100 bg-white px-3 py-2.5 text-xs font-bold leading-5 text-slate-600">
                Location is used only to sort listed facilities by estimated straight-line distance. This does not search all healthcare facilities online.
              </p>
              {nearestFacility && (
                <p className="mt-3 rounded-xl border border-pink-100 bg-white px-3 py-2.5 text-xs font-extrabold uppercase leading-5 tracking-wide text-pink-600">
                  Nearest Listed Maternal Healthcare Facility: {nearestFacility.name}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
            <div className="min-w-0 sm:min-w-[150px]">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                <Filter className="h-4 w-4 text-pink-600" />
                Facility Categories
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {listedFacilities.length} listed result{listedFacilities.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
              <CategoryFilterChip
                label="All Listed"
                count={healthFacilities.length}
                active={activeCategory === "all"}
                categoryKey="all"
                onSelect={handleCategorySelect}
              />
              {facilityCategories.map((category) => (
                <CategoryFilterChip
                  key={category.key}
                  label={category.label}
                  count={categoryCounts[category.key] || 0}
                  active={activeCategory === category.key}
                  categoryKey={category.key}
                  onSelect={handleCategorySelect}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,330px)]">
          <div className="min-w-0 space-y-4">
            {listedFacilities.length > 0 ? (
              listedFacilities.map((facility) => (
                <FacilityCard
                  key={facility.id}
                  facility={facility}
                  location={userLocation}
                  isNearest={Boolean(userLocation && nearestFacility?.id === facility.id)}
                />
              ))
            ) : (
              <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
                <Building2 className="mx-auto h-9 w-9 text-slate-300" />
                <h2 className="mt-4 text-lg font-extrabold text-slate-950">No local listed facilities in this category</h2>
                <p className="mx-auto mt-2 max-w-lg text-sm font-semibold leading-6 text-slate-500">
                  Project INAY only displays facilities that are manually listed in the local directory.
                </p>
              </section>
            )}
          </div>

          <aside className="min-w-0 space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-base font-extrabold leading-6 text-slate-950 sm:text-lg">
                Barangay San Lucas Maternal HelpDesk
              </h2>
              <div className="mt-4 space-y-3">
                {helpDeskItems.map((item) => (
                  <HelpDeskCard key={item.title} item={item} />
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-slate-950 p-4 text-white shadow-sm sm:p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-pink-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-extrabold">Need immediate OB advice?</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                For severe bleeding, intense abdominal pain, seizures, fainting, or difficulty
                breathing, call emergency services or go to the nearest emergency facility.
              </p>
            </section>
          </aside>
        </section>
      </div>
    </div>
  );
}

const FacilityCard = memo(function FacilityCard({ facility, location, isNearest }) {
  const distanceLabel = facility.distanceKm === null
    ? "Available after GPS"
    : `${facility.distanceKm.toFixed(1)} km estimated`;
  const maternalServices = facility.maternalServices || facility.wards || [];
  const directionsUrl = useMemo(() => getDirectionsUrl(facility, location), [facility, location]);

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-extrabold uppercase leading-5 tracking-wide text-emerald-700 ring-1 ring-emerald-100">
          {facility.category} - {facility.accreditation}
        </span>
        <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-[11px] font-extrabold uppercase leading-5 tracking-wide text-pink-600 ring-1 ring-pink-100">
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          {isNearest ? "Nearest Listed Maternal Healthcare Facility" : "Listed Maternal Healthcare Facility"} ({distanceLabel})
        </span>
        <span className="inline-flex items-center gap-1 rounded-full px-1 py-0.5 text-sm font-extrabold text-orange-500">
          <Star className="h-3.5 w-3.5 fill-orange-500" />
          {facility.rating} ({facility.reviews} Reviews)
        </span>
      </div>

      <h2 className="mt-4 text-[clamp(1.45rem,2.2vw,2rem)] font-extrabold leading-tight text-slate-950">
        {facility.name}
      </h2>
      <p className="mt-2 flex items-start gap-2 text-sm font-bold leading-6 text-slate-500">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pink-600" />
        {facility.address}
      </p>
      <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
        Estimated distance is straight-line GPS distance from {location ? "your saved device location" : "your device after GPS is enabled"}, not real driving distance.
      </p>

      <div className="mt-4 grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2">
        <InfoTile icon={Phone} label="Contact / Hotline" value={facility.hotline} tone="text-pink-600" />
        <InfoTile icon={Clock} label="Hours of Care" value={facility.hours} tone="text-emerald-600" />
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
          Available Maternal Services
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {maternalServices.map((service) => (
            <span
              key={service}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700"
            >
              <Shield className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              {service}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-pink-600 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-pink-700"
        >
          <Navigation className="h-4 w-4" />
          Get Directions
        </a>
        {facility.tel ? (
          <a
            href={`tel:${facility.tel}`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
          >
            <Phone className="h-4 w-4 text-slate-400" />
            Call Facility
          </a>
        ) : (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
          >
            <Phone className="h-4 w-4 text-slate-400" />
            Find Contact
          </a>
        )}
      </div>
      <p className="mt-3 text-xs font-bold leading-5 text-slate-500">
        Directions open Google Maps through a normal browser URL only. No Google Maps API or paid map service is used by Project INAY.
      </p>
    </article>
  );
});

const CategoryFilterChip = memo(function CategoryFilterChip({ label, count, active, categoryKey, onSelect }) {
  const handleClick = useCallback(() => {
    onSelect(categoryKey);
  }, [categoryKey, onSelect]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-extrabold transition ${
        active
          ? "border-pink-600 bg-pink-600 text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-600 hover:border-pink-200 hover:bg-pink-50 hover:text-pink-600"
      }`}
    >
      {label}
      <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${
        active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
      }`}>
        {count}
      </span>
    </button>
  );
});

const InfoTile = memo(function InfoTile({ icon: Icon, label, value, tone }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${tone}`} />
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{label}</p>
      </div>
      <p className="mt-1 break-words text-sm font-extrabold leading-5 text-slate-950">{value}</p>
    </div>
  );
});

const HelpDeskCard = memo(function HelpDeskCard({ item }) {
  const toneClasses = {
    pink: "border-pink-100 bg-pink-50 text-pink-600",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-600",
    amber: "border-amber-100 bg-amber-50 text-amber-600",
  };
  const Icon = item.tone === "amber" ? CalendarDays : item.tone === "emerald" ? Phone : MapPin;

  return (
    <div className={`rounded-xl border p-3.5 ${toneClasses[item.tone]}`}>
      <div className="flex gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <h3 className="text-sm font-extrabold text-slate-950 sm:text-base">{item.title}</h3>
          <p className="mt-1 text-sm font-semibold leading-5 text-slate-600">{item.detail}</p>
          {item.subdetail && (
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">{item.subdetail}</p>
          )}
        </div>
      </div>
    </div>
  );
});
