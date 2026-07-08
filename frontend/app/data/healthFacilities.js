export const facilityCategories = [
  { key: "government_hospital", label: "Government Hospital" },
  { key: "private_hospital", label: "Private Hospital" },
  { key: "maternity_clinic", label: "Maternity Clinic" },
  { key: "lying_in_clinic", label: "Lying-In Clinic" },
  { key: "birthing_center", label: "Birthing Center" },
  { key: "obgyn_clinic", label: "Women's Health / OB-GYN Clinic" },
];

export const healthFacilities = [
  {
    id: "community-general-hospital-san-pablo",
    name: "Community General Hospital of San Pablo City",
    categoryKey: "private_hospital",
    category: "Private Hospital",
    accreditation: "Local hospital",
    rating: 4.5,
    reviews: 42,
    address: "San Pablo City, Laguna",
    hotline: "Call facility to confirm",
    tel: "",
    hours: "Emergency availability may vary. Call before going.",
    latitude: 14.0696,
    longitude: 121.3256,
    mapsQuery: "Community General Hospital of San Pablo City, San Pablo City, Laguna",
    maternalServices: [
      "Emergency Care",
      "General Consultation",
      "OB-GYN Referral",
      "Pediatrics Referral",
    ],
  },
  {
    id: "san-pablo-colleges-medical-center",
    name: "San Pablo Colleges Medical Center",
    categoryKey: "private_hospital",
    category: "Private Hospital",
    accreditation: "Hospital / Medical center",
    rating: 4.3,
    reviews: 35,
    address: "San Pablo City, Laguna",
    hotline: "Call facility to confirm",
    tel: "",
    hours: "Hospital hours may vary by department.",
    latitude: 14.0668,
    longitude: 121.3269,
    mapsQuery: "San Pablo Colleges Medical Center, San Pablo City, Laguna",
    maternalServices: [
      "Emergency Room",
      "OB-GYN Services",
      "Pediatrics",
      "Diagnostic Services",
    ],
  },
  {
    id: "san-pablo-city-doctors-hospital",
    name: "San Pablo City Doctors' Hospital",
    categoryKey: "private_hospital",
    category: "Private Hospital",
    accreditation: "Hospital",
    rating: 4.4,
    reviews: 29,
    address: "San Pablo City, Laguna",
    hotline: "Call facility to confirm",
    tel: "",
    hours: "Hospital hours may vary by department.",
    latitude: 14.0719,
    longitude: 121.3234,
    mapsQuery: "San Pablo City Doctors' Hospital, San Pablo City, Laguna",
    maternalServices: [
      "Emergency Care",
      "OB-GYN Consultation",
      "Delivery Referral",
      "Pediatrics",
    ],
  },
  {
    id: "san-pablo-city-general-hospital",
    name: "San Pablo City General Hospital",
    categoryKey: "government_hospital",
    category: "Government Hospital",
    accreditation: "City hospital",
    rating: 4.2,
    reviews: 24,
    address: "San Pablo City, Laguna",
    hotline: "Call facility to confirm",
    tel: "",
    hours: "Emergency availability may vary. Call before going.",
    latitude: 14.075,
    longitude: 121.3198,
    mapsQuery: "San Pablo City General Hospital, San Pablo City, Laguna",
    maternalServices: [
      "Emergency Care",
      "Maternal Referral",
      "General Medicine",
      "Public Health Desk",
    ],
  },
  {
    id: "san-pablo-city-district-hospital",
    name: "San Pablo City District Hospital",
    categoryKey: "government_hospital",
    category: "Government Hospital",
    accreditation: "District hospital",
    rating: 4.1,
    reviews: 21,
    address: "San Pablo City, Laguna",
    hotline: "Call facility to confirm",
    tel: "",
    hours: "Emergency availability may vary. Call before going.",
    latitude: 14.0619,
    longitude: 121.3199,
    mapsQuery: "San Pablo City District Hospital, San Pablo City, Laguna",
    maternalServices: [
      "Emergency Care",
      "Outpatient Consultation",
      "Maternal Referral",
      "Pediatrics Referral",
    ],
  },
  {
    id: "sts-francis-and-paul-general-hospital",
    name: "Sts. Francis and Paul General Hospital",
    categoryKey: "private_hospital",
    category: "Private Hospital",
    accreditation: "Hospital",
    rating: 4.2,
    reviews: 26,
    address: "San Pablo City, Laguna",
    hotline: "Call facility to confirm",
    tel: "",
    hours: "Hospital hours may vary by department.",
    latitude: 14.0674,
    longitude: 121.3312,
    mapsQuery: "Sts Francis and Paul General Hospital, San Pablo City, Laguna",
    maternalServices: [
      "Emergency Care",
      "General Consultation",
      "OB-GYN Referral",
      "Diagnostic Services",
    ],
  },
];

export const helpDeskItems = [
  {
    title: "Local Triage Office",
    detail: "Barangay San Lucas Hall (Health Unit annex), San Pablo, Laguna",
    tone: "pink",
  },
  {
    title: "Midwife Hotline",
    detail: "(049) 521-8890",
    subdetail: "Assigned: Midwife Corazon Santos (Mon-Sat 8am-5pm)",
    tone: "emerald",
  },
  {
    title: "Immunization Day",
    detail: "Every Wednesday (Walk-in free)",
    tone: "amber",
  },
];

export function getDistanceKm(origin, destination) {
  if (!origin || !destination) return null;

  const earthRadiusKm = 6371;
  const latDistance = toRadians(destination.latitude - origin.latitude);
  const lngDistance = toRadians(destination.longitude - origin.longitude);
  const originLat = toRadians(origin.latitude);
  const destinationLat = toRadians(destination.latitude);

  const haversine =
    Math.sin(latDistance / 2) * Math.sin(latDistance / 2) +
    Math.cos(originLat) *
      Math.cos(destinationLat) *
      Math.sin(lngDistance / 2) *
      Math.sin(lngDistance / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function getNearestFacility(location) {
  if (!location) return null;

  return [...healthFacilities].sort((first, second) => (
    getDistanceKm(location, first) - getDistanceKm(location, second)
  ))[0];
}

export function getDirectionsUrl(facility, location) {
  const destination = encodeURIComponent(facility.mapsQuery || `${facility.latitude},${facility.longitude}`);
  const origin = location ? `&origin=${location.latitude},${location.longitude}` : "";

  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${destination}&travelmode=driving`;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}
