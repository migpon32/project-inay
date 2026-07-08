<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class HealthServicesController extends Controller
{
    private const PLACES_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.primaryTypeDisplayName,places.types,places.businessStatus,places.currentOpeningHours,places.rating,places.userRatingCount,places.internationalPhoneNumber,places.nationalPhoneNumber,places.googleMapsUri,places.editorialSummary';
    private const ROUTES_FIELD_MASK = 'routes.distanceMeters,routes.duration,routes.staticDuration';

    private const FACILITY_TYPES = [
        'hospitals' => [
            'label' => 'Hospitals',
            'query' => 'general hospital maternity hospital maternal child health hospital',
            'included_type' => 'hospital',
            'services' => ['Prenatal Checkups', 'Emergency Obstetric Care', 'Cesarean Delivery', 'Postpartum Care', 'Newborn Care', 'NICU', 'Pediatric Care', 'Referral Services'],
        ],
        'lying_in' => [
            'label' => 'Lying-in Clinics',
            'query' => 'lying-in clinic birthing center maternity clinic normal delivery',
            'services' => ['Prenatal Checkups', 'Normal Delivery', 'Postpartum Care', 'Newborn Care', 'Family Planning', 'Referral Services'],
        ],
        'rhu' => [
            'label' => 'Rural Health Units',
            'query' => 'rural health unit RHU maternal child health center',
            'services' => ['Prenatal Checkups', 'Postpartum Care', 'Child Immunization', 'Family Planning', 'Referral Services'],
        ],
        'bhs' => [
            'label' => 'Barangay Health Stations',
            'query' => 'barangay health station BHS maternal child health',
            'services' => ['Prenatal Checkups', 'Postpartum Care', 'Child Immunization', 'Family Planning', 'Referral Services'],
        ],
        'obgyn' => [
            'label' => 'OB-GYN Clinics',
            'query' => 'OB GYN clinic obstetrician gynecologist prenatal ultrasound',
            'included_type' => 'doctor',
            'services' => ['Prenatal Checkups', 'Ultrasound', 'Family Planning', 'Postpartum Care', 'Referral Services'],
        ],
        'pediatric' => [
            'label' => 'Pediatric Clinics',
            'query' => 'pediatric clinic pediatrician child immunization',
            'included_type' => 'doctor',
            'services' => ['Newborn Care', 'Child Immunization', 'Pediatric Care', 'Referral Services'],
        ],
        'diagnostic' => [
            'label' => 'Diagnostic Centers',
            'query' => 'diagnostic center ultrasound laboratory maternal prenatal',
            'services' => ['Ultrasound', 'Laboratory', 'Referral Services'],
        ],
        'pharmacies' => [
            'label' => 'Pharmacies',
            'query' => 'pharmacy drugstore prenatal vitamins medicine',
            'included_type' => 'pharmacy',
            'services' => ['Family Planning', 'Referral Services'],
        ],
    ];

    public function nearby(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'radius' => ['nullable', 'integer', 'min:1000', 'max:50000'],
        ]);

        $latitude = (float) $validated['latitude'];
        $longitude = (float) $validated['longitude'];
        $radius = (int) ($validated['radius'] ?? config('services.health_facilities.radius_meters', 20000));
        $radius = max(1000, min(50000, $radius));
        $provider = $this->activeProvider();
        $cacheKey = sprintf(
            'health-services:nearby:%s:%s:%s:%s',
            $provider,
            number_format($latitude, 4, '.', ''),
            number_format($longitude, 4, '.', ''),
            $radius,
        );
        $minutes = (int) config('services.health_facilities.cache_minutes', 30);

        return response()->json(Cache::remember(
            $cacheKey,
            now()->addMinutes(max(1, $minutes)),
            fn () => $this->buildNearbyPayload($latitude, $longitude, $radius, $provider)
        ));
    }

    private function activeProvider(): string
    {
        $provider = strtolower((string) config('services.health_facilities.provider', 'openstreetmap'));

        return in_array($provider, ['openstreetmap', 'google'], true) ? $provider : 'openstreetmap';
    }

    private function buildNearbyPayload(float $latitude, float $longitude, int $radius, string $provider): array
    {
        $origin = ['latitude' => $latitude, 'longitude' => $longitude];

        if ($provider === 'google') {
            return $this->buildGooglePayload($origin, $radius);
        }

        return $this->buildOpenStreetMapPayload($origin, $radius);
    }

    private function buildOpenStreetMapPayload(array $origin, int $radius): array
    {
        $facilities = $this->searchOpenStreetMap($origin, $radius);

        if ($facilities->isEmpty()) {
            $facilities = $this->fallbackFacilities($origin);

            return $this->payload($facilities, $origin, $radius, 'local_fallback', 'Free OpenStreetMap search did not return nearby facilities. Showing local Project INAY fallback facilities.');
        }

        $facilities = $this->attachOsrmRoutes($facilities, $origin);

        return $this->payload($facilities, $origin, $radius, 'openstreetmap', null);
    }

    private function buildGooglePayload(array $origin, int $radius): array
    {
        $placesKey = config('services.google_maps.places_key');
        $routesKey = config('services.google_maps.routes_key');

        if (!$placesKey) {
            $facilities = $this->fallbackFacilities($origin);

            return $this->payload($facilities, $origin, $radius, 'local_fallback', 'Google provider is selected, but no Google Places API key is configured. Showing local Project INAY fallback facilities.');
        }

        $facilities = $this->searchGooglePlaces($origin, $radius, $placesKey);

        if ($facilities->isEmpty()) {
            $facilities = $this->fallbackFacilities($origin);

            return $this->payload($facilities, $origin, $radius, 'local_fallback', 'Google Places did not return nearby facilities. Showing local Project INAY fallback facilities.');
        }

        $facilities = $this->attachGoogleRoutes($facilities, $origin, $routesKey);

        return $this->payload($facilities, $origin, $radius, 'google_places', null);
    }

    private function searchOpenStreetMap(array $origin, int $radius): Collection
    {
        $endpoint = (string) config('services.health_facilities.overpass_endpoint', 'https://overpass-api.de/api/interpreter');
        $query = $this->openStreetMapFacilityQuery($origin, $radius);
        $response = Http::asForm()
            ->timeout(12)
            ->withHeaders($this->openMapHeaders())
            ->post($endpoint, ['data' => $query]);

        if (!$response->successful()) {
            return collect();
        }

        $seen = [];

        return collect($response->json('elements', []))
            ->map(fn (array $element) => $this->normalizeOpenStreetMapElement($element, $origin))
            ->filter()
            ->reject(function (array $facility) use (&$seen) {
                $dedupeKey = mb_strtolower(trim($facility['name'] . '|' . $facility['latitude'] . '|' . $facility['longitude']));

                if (isset($seen[$dedupeKey])) {
                    return true;
                }

                $seen[$dedupeKey] = true;

                return false;
            })
            ->sortBy(fn (array $facility) => $facility['straight_line_distance_meters'] ?? PHP_INT_MAX)
            ->values()
            ->take(60);
    }

    private function openStreetMapFacilityQuery(array $origin, int $radius): string
    {
        $latitude = $origin['latitude'];
        $longitude = $origin['longitude'];
        $namePattern = 'lying.?in|birthing|maternity|rhu|rural health unit|barangay health station|bhs|health center|health centre|city health office|ob.?gyn|obstetric|gyneco|pediatric|paediatric|diagnostic|laboratory|ultrasound';

        return <<<OVERPASS
[out:json][timeout:25];
(
  nwr["amenity"="hospital"](around:{$radius},{$latitude},{$longitude});
  nwr["healthcare"="hospital"](around:{$radius},{$latitude},{$longitude});
  nwr["amenity"="clinic"](around:{$radius},{$latitude},{$longitude});
  nwr["amenity"="doctors"](around:{$radius},{$latitude},{$longitude});
  nwr["amenity"="pharmacy"](around:{$radius},{$latitude},{$longitude});
  nwr["healthcare"~"clinic|centre|center|doctor|midwife|birthing_center|laboratory|diagnostic|pharmacy"](around:{$radius},{$latitude},{$longitude});
  nwr["healthcare:speciality"~"obstetrics|gynaecology|gynecology|paediatrics|pediatrics|radiology|diagnostic|laboratory",i](around:{$radius},{$latitude},{$longitude});
  nwr["name"~"{$namePattern}",i](around:{$radius},{$latitude},{$longitude});
);
out body center 120;
OVERPASS;
    }

    private function normalizeOpenStreetMapElement(array $element, array $origin): ?array
    {
        $tags = $element['tags'] ?? [];
        $latitude = $element['lat'] ?? $element['center']['lat'] ?? null;
        $longitude = $element['lon'] ?? $element['center']['lon'] ?? null;
        $name = trim((string) ($tags['name'] ?? ''));

        if (!$latitude || !$longitude || $name === '') {
            return null;
        }

        $typeKey = $this->classifyOpenStreetMapFacility($tags);

        if (!$typeKey) {
            return null;
        }

        $services = $this->servicesForTaggedFacility($tags, $typeKey);
        $hasSpecificServiceTags = $this->hasSpecificServiceTags($tags);

        return [
            'id' => $this->openStreetMapId($element),
            'name' => $name,
            'facility_type_key' => $typeKey,
            'facility_type' => self::FACILITY_TYPES[$typeKey]['label'],
            'address' => $this->openStreetMapAddress($tags),
            'latitude' => (float) $latitude,
            'longitude' => (float) $longitude,
            'straight_line_distance_meters' => $this->distanceMeters($origin['latitude'], $origin['longitude'], (float) $latitude, (float) $longitude),
            'driving_distance_meters' => null,
            'distance_km' => null,
            'travel_time_seconds' => null,
            'travel_time_text' => 'Travel time unavailable',
            'distance_source' => 'pending_route',
            'operating_status' => $this->openStreetMapOperatingStatus($tags),
            'rating' => null,
            'user_rating_count' => null,
            'phone' => $tags['contact:phone'] ?? $tags['phone'] ?? $tags['mobile'] ?? null,
            'navigation_url' => $this->openStreetMapDirectionsUrl($origin, ['latitude' => $latitude, 'longitude' => $longitude]),
            'google_maps_url' => null,
            'services' => $services,
            'service_source' => $hasSpecificServiceTags ? 'openstreetmap_tags' : 'facility_type',
            'service_note' => $hasSpecificServiceTags ? null : 'Service information not available.',
            'place_types' => array_values(array_filter([
                $tags['amenity'] ?? null,
                $tags['healthcare'] ?? null,
                $tags['healthcare:speciality'] ?? null,
            ])),
            'source' => 'openstreetmap',
        ];
    }

    private function classifyOpenStreetMapFacility(array $tags): ?string
    {
        $text = mb_strtolower(implode(' ', [
            $tags['name'] ?? '',
            $tags['amenity'] ?? '',
            $tags['healthcare'] ?? '',
            $tags['healthcare:speciality'] ?? '',
            $tags['description'] ?? '',
            $tags['operator'] ?? '',
        ]));

        return match (true) {
            str_contains($text, 'pharmacy') || str_contains($text, 'drugstore') => 'pharmacies',
            str_contains($text, 'diagnostic') || str_contains($text, 'laboratory') || str_contains($text, 'ultrasound') || str_contains($text, 'radiology') => 'diagnostic',
            str_contains($text, 'barangay health station') || preg_match('/\bbhs\b/', $text) === 1 => 'bhs',
            str_contains($text, 'rural health unit') || preg_match('/\brhu\b/', $text) === 1 || str_contains($text, 'city health office') || str_contains($text, 'health center') || str_contains($text, 'health centre') => 'rhu',
            str_contains($text, 'lying-in') || str_contains($text, 'lying in') || str_contains($text, 'birthing') || str_contains($text, 'maternity') || str_contains($text, 'midwife') => 'lying_in',
            str_contains($text, 'ob-gyn') || str_contains($text, 'ob gyn') || str_contains($text, 'obstetric') || str_contains($text, 'gyneco') || str_contains($text, 'gynaeco') => 'obgyn',
            str_contains($text, 'pediatric') || str_contains($text, 'paediatric') => 'pediatric',
            str_contains($text, 'hospital') => 'hospitals',
            default => null,
        };
    }

    private function searchGooglePlaces(array $origin, int $radius, string $placesKey): Collection
    {
        $responses = Http::pool(function (Pool $pool) use ($origin, $radius, $placesKey) {
            return collect(self::FACILITY_TYPES)
                ->map(function (array $spec, string $key) use ($pool, $origin, $radius, $placesKey) {
                    $body = [
                        'textQuery' => $spec['query'],
                        'maxResultCount' => 6,
                        'locationBias' => [
                            'circle' => [
                                'center' => $origin,
                                'radius' => $radius,
                            ],
                        ],
                        'languageCode' => 'en',
                        'regionCode' => 'PH',
                    ];

                    if (isset($spec['included_type'])) {
                        $body['includedType'] = $spec['included_type'];
                    }

                    return $pool
                        ->as($key)
                        ->timeout(6)
                        ->acceptJson()
                        ->withHeaders([
                            'X-Goog-Api-Key' => $placesKey,
                            'X-Goog-FieldMask' => self::PLACES_FIELD_MASK,
                        ])
                        ->post('https://places.googleapis.com/v1/places:searchText', $body);
                })
                ->all();
        });

        $seen = [];
        $facilities = collect();

        foreach (self::FACILITY_TYPES as $key => $spec) {
            $response = $responses[$key] ?? null;

            if (!$response?->successful()) {
                continue;
            }

            foreach ($response->json('places', []) as $place) {
                $placeId = $place['id'] ?? $place['name'] ?? null;
                $location = $place['location'] ?? null;

                if (!$placeId || !$location || isset($seen[$placeId])) {
                    continue;
                }

                $seen[$placeId] = true;
                $facilities->push($this->normalizeGooglePlace($place, $key, $spec, $origin));
            }
        }

        return $facilities
            ->sortBy(fn (array $facility) => $facility['straight_line_distance_meters'] ?? PHP_INT_MAX)
            ->values()
            ->take(48);
    }

    private function normalizeGooglePlace(array $place, string $typeKey, array $spec, array $origin): array
    {
        $location = $place['location'];
        $services = $this->servicesForGooglePlace($place, $typeKey);
        $serviceSource = $this->servicesCameFromGoogle($place, $services) ? 'google' : 'facility_type';

        return [
            'id' => $place['id'] ?? Str::slug(($place['displayName']['text'] ?? 'facility') . '-' . $typeKey),
            'name' => $place['displayName']['text'] ?? 'Healthcare Facility',
            'facility_type_key' => $typeKey,
            'facility_type' => $spec['label'],
            'address' => $place['formattedAddress'] ?? 'Address not available',
            'latitude' => (float) $location['latitude'],
            'longitude' => (float) $location['longitude'],
            'straight_line_distance_meters' => $this->distanceMeters($origin['latitude'], $origin['longitude'], (float) $location['latitude'], (float) $location['longitude']),
            'driving_distance_meters' => null,
            'distance_km' => null,
            'travel_time_seconds' => null,
            'travel_time_text' => 'Travel time unavailable',
            'distance_source' => 'pending_route',
            'operating_status' => $this->operatingStatus($place),
            'rating' => isset($place['rating']) ? (float) $place['rating'] : null,
            'user_rating_count' => isset($place['userRatingCount']) ? (int) $place['userRatingCount'] : null,
            'phone' => $place['internationalPhoneNumber'] ?? $place['nationalPhoneNumber'] ?? null,
            'navigation_url' => $place['googleMapsUri'] ?? $this->googleMapsDirectionsUrl($origin, ['latitude' => $location['latitude'], 'longitude' => $location['longitude']]),
            'google_maps_url' => $place['googleMapsUri'] ?? null,
            'services' => $services,
            'service_source' => $serviceSource,
            'service_note' => $serviceSource === 'google' ? null : 'Service information not available.',
            'place_types' => $place['types'] ?? [],
            'source' => 'google_places',
        ];
    }

    private function attachGoogleRoutes(Collection $facilities, array $origin, ?string $routesKey): Collection
    {
        $routeLimit = (int) config('services.google_maps.health_facility_route_limit', 32);
        $routeLimit = max(1, min(48, $routeLimit));
        $sorted = $facilities
            ->sortBy(fn (array $facility) => $facility['straight_line_distance_meters'] ?? PHP_INT_MAX)
            ->values();

        if (!$routesKey) {
            return $sorted
                ->map(fn (array $facility) => $this->attachEstimatedRoute($facility))
                ->sortBy('driving_distance_meters')
                ->values();
        }

        $routeCandidates = $sorted->take($routeLimit)->values();
        $responses = Http::pool(function (Pool $pool) use ($routeCandidates, $origin, $routesKey) {
            return $routeCandidates
                ->map(fn (array $facility, int $index) => $pool
                    ->as((string) $index)
                    ->timeout(5)
                    ->acceptJson()
                    ->withHeaders([
                        'X-Goog-Api-Key' => $routesKey,
                        'X-Goog-FieldMask' => self::ROUTES_FIELD_MASK,
                    ])
                    ->post('https://routes.googleapis.com/directions/v2:computeRoutes', [
                        'origin' => ['location' => ['latLng' => $origin]],
                        'destination' => ['location' => ['latLng' => [
                            'latitude' => $facility['latitude'],
                            'longitude' => $facility['longitude'],
                        ]]],
                        'travelMode' => 'DRIVE',
                        'routingPreference' => 'TRAFFIC_AWARE',
                        'computeAlternativeRoutes' => false,
                        'languageCode' => 'en',
                        'units' => 'METRIC',
                    ]))
                ->all();
        });

        $routed = $routeCandidates->map(function (array $facility, int $index) use ($responses) {
            $response = $responses[(string) $index] ?? null;
            $route = $response?->successful() ? ($response->json('routes.0') ?? null) : null;

            if (!$route || !isset($route['distanceMeters'])) {
                return $this->attachEstimatedRoute($facility);
            }

            return $this->attachRoute($facility, (int) $route['distanceMeters'], $route['duration'] ?? $route['staticDuration'] ?? null, 'google_routes');
        });

        $remaining = $sorted
            ->slice($routeLimit)
            ->map(fn (array $facility) => $this->attachEstimatedRoute($facility));

        return $routed
            ->merge($remaining)
            ->sortBy('driving_distance_meters')
            ->values();
    }

    private function attachOsrmRoutes(Collection $facilities, array $origin): Collection
    {
        $routeLimit = (int) config('services.health_facilities.route_limit', 24);
        $routeLimit = max(1, min(48, $routeLimit));
        $sorted = $facilities
            ->sortBy(fn (array $facility) => $facility['straight_line_distance_meters'] ?? PHP_INT_MAX)
            ->values();
        $routeCandidates = $sorted->take($routeLimit)->values();

        if ($routeCandidates->isEmpty()) {
            return $sorted;
        }

        $endpoint = rtrim((string) config('services.health_facilities.osrm_endpoint', 'https://router.project-osrm.org'), '/');
        $responses = Http::pool(function (Pool $pool) use ($routeCandidates, $origin, $endpoint) {
            return $routeCandidates
                ->map(function (array $facility, int $index) use ($pool, $origin, $endpoint) {
                    $coordinates = sprintf(
                        '%s,%s;%s,%s',
                        $origin['longitude'],
                        $origin['latitude'],
                        $facility['longitude'],
                        $facility['latitude'],
                    );

                    return $pool
                        ->as((string) $index)
                        ->timeout(5)
                        ->withHeaders($this->openMapHeaders())
                        ->get("{$endpoint}/route/v1/driving/{$coordinates}", [
                            'overview' => 'false',
                            'alternatives' => 'false',
                            'steps' => 'false',
                        ]);
                })
                ->all();
        });

        $routed = $routeCandidates->map(function (array $facility, int $index) use ($responses) {
            $response = $responses[(string) $index] ?? null;
            $route = $response?->successful() ? ($response->json('routes.0') ?? null) : null;

            if (!$route || !isset($route['distance'])) {
                return $this->attachEstimatedRoute($facility);
            }

            return $this->attachRoute($facility, (int) round((float) $route['distance']), (int) round((float) ($route['duration'] ?? 0)), 'osrm');
        });

        $remaining = $sorted
            ->slice($routeLimit)
            ->map(fn (array $facility) => $this->attachEstimatedRoute($facility));

        return $routed
            ->merge($remaining)
            ->sortBy('driving_distance_meters')
            ->values();
    }

    private function attachRoute(array $facility, int $distanceMeters, int|string|null $duration, string $source): array
    {
        $seconds = $this->durationToSeconds($duration);

        return [
            ...$facility,
            'driving_distance_meters' => $distanceMeters,
            'distance_km' => round($distanceMeters / 1000, 1),
            'travel_time_seconds' => $seconds,
            'travel_time_text' => $seconds ? $this->minutesText($seconds) : 'Travel time unavailable',
            'distance_source' => $source,
        ];
    }

    private function attachEstimatedRoute(array $facility): array
    {
        $distanceMeters = (int) round(($facility['straight_line_distance_meters'] ?? 0) * 1.35);
        $seconds = $distanceMeters > 0 ? (int) round(($distanceMeters / 1000) / 28 * 3600) : null;

        return $this->attachRoute($facility, $distanceMeters, $seconds, 'estimated');
    }

    private function payload(Collection $facilities, array $origin, int $radius, string $source, ?string $warning): array
    {
        $facilities = $facilities
            ->sortBy('driving_distance_meters')
            ->values();
        $groups = collect(self::FACILITY_TYPES)
            ->map(fn (array $spec, string $key) => [
                'key' => $key,
                'label' => $spec['label'],
                'count' => $facilities->where('facility_type_key', $key)->count(),
                'facilities' => $facilities->where('facility_type_key', $key)->values(),
            ])
            ->filter(fn (array $group) => $group['count'] > 0)
            ->values();

        return [
            'meta' => [
                'source' => $source,
                'warning' => $warning,
                'radius_meters' => $radius,
                'origin' => $origin,
                'generated_at' => now()->toIso8601String(),
                'cache_minutes' => (int) config('services.health_facilities.cache_minutes', 30),
                'provider' => $this->activeProvider(),
            ],
            'facility_types' => collect(self::FACILITY_TYPES)
                ->map(fn (array $spec, string $key) => ['key' => $key, 'label' => $spec['label']])
                ->values(),
            'groups' => $groups,
            'facilities' => $facilities,
        ];
    }

    private function fallbackFacilities(array $origin): Collection
    {
        $items = [
            [
                'id' => 'community-general-hospital-san-pablo',
                'name' => 'Community General Hospital of San Pablo City',
                'facility_type_key' => 'hospitals',
                'facility_type' => self::FACILITY_TYPES['hospitals']['label'],
                'address' => 'San Pablo City, Laguna',
                'latitude' => 14.0696,
                'longitude' => 121.3256,
                'phone' => null,
                'rating' => 4.5,
                'user_rating_count' => 42,
                'operating_status' => 'Unknown',
                'services' => self::FACILITY_TYPES['hospitals']['services'],
            ],
            [
                'id' => 'sts-francis-and-paul-general-hospital',
                'name' => 'Sts. Francis and Paul General Hospital',
                'facility_type_key' => 'hospitals',
                'facility_type' => self::FACILITY_TYPES['hospitals']['label'],
                'address' => 'San Pablo City, Laguna',
                'latitude' => 14.0674,
                'longitude' => 121.3312,
                'phone' => null,
                'rating' => 4.2,
                'user_rating_count' => 26,
                'operating_status' => 'Unknown',
                'services' => self::FACILITY_TYPES['hospitals']['services'],
            ],
            [
                'id' => 'san-lucas-barangay-health-station',
                'name' => 'Barangay San Lucas Health Station',
                'facility_type_key' => 'bhs',
                'facility_type' => self::FACILITY_TYPES['bhs']['label'],
                'address' => 'Barangay San Lucas, San Pablo City, Laguna',
                'latitude' => 14.0683,
                'longitude' => 121.3256,
                'phone' => '(049) 521-8890',
                'rating' => null,
                'user_rating_count' => null,
                'operating_status' => 'Unknown',
                'services' => self::FACILITY_TYPES['bhs']['services'],
            ],
            [
                'id' => 'san-pablo-city-health-office',
                'name' => 'San Pablo City Health Office / RHU',
                'facility_type_key' => 'rhu',
                'facility_type' => self::FACILITY_TYPES['rhu']['label'],
                'address' => 'San Pablo City, Laguna',
                'latitude' => 14.0689,
                'longitude' => 121.3238,
                'phone' => null,
                'rating' => null,
                'user_rating_count' => null,
                'operating_status' => 'Unknown',
                'services' => self::FACILITY_TYPES['rhu']['services'],
            ],
            [
                'id' => 'san-pablo-diagnostic-laboratory',
                'name' => 'San Pablo Diagnostic and Laboratory Center',
                'facility_type_key' => 'diagnostic',
                'facility_type' => self::FACILITY_TYPES['diagnostic']['label'],
                'address' => 'San Pablo City, Laguna',
                'latitude' => 14.0711,
                'longitude' => 121.3227,
                'phone' => null,
                'rating' => null,
                'user_rating_count' => null,
                'operating_status' => 'Unknown',
                'services' => self::FACILITY_TYPES['diagnostic']['services'],
            ],
            [
                'id' => 'san-pablo-pharmacy-care',
                'name' => 'San Pablo Pharmacy Care',
                'facility_type_key' => 'pharmacies',
                'facility_type' => self::FACILITY_TYPES['pharmacies']['label'],
                'address' => 'San Pablo City, Laguna',
                'latitude' => 14.0667,
                'longitude' => 121.3248,
                'phone' => null,
                'rating' => null,
                'user_rating_count' => null,
                'operating_status' => 'Unknown',
                'services' => self::FACILITY_TYPES['pharmacies']['services'],
            ],
        ];

        return collect($items)
            ->map(function (array $facility) use ($origin) {
                $distanceMeters = $this->distanceMeters($origin['latitude'], $origin['longitude'], $facility['latitude'], $facility['longitude']);

                return $this->attachEstimatedRoute([
                    ...$facility,
                    'straight_line_distance_meters' => $distanceMeters,
                    'google_maps_url' => null,
                    'navigation_url' => $this->openStreetMapDirectionsUrl($origin, $facility),
                    'source' => 'local_fallback',
                    'service_source' => 'local_fallback',
                    'service_note' => null,
                    'place_types' => [],
                ]);
            })
            ->sortBy('driving_distance_meters')
            ->values();
    }

    private function servicesForGooglePlace(array $place, string $typeKey): array
    {
        $text = mb_strtolower(implode(' ', [
            $place['displayName']['text'] ?? '',
            $place['formattedAddress'] ?? '',
            $place['editorialSummary']['text'] ?? '',
            implode(' ', $place['types'] ?? []),
        ]));

        return $this->servicesFromText($text, $typeKey);
    }

    private function servicesForTaggedFacility(array $tags, string $typeKey): array
    {
        $text = mb_strtolower(implode(' ', [
            $tags['name'] ?? '',
            $tags['amenity'] ?? '',
            $tags['healthcare'] ?? '',
            $tags['healthcare:speciality'] ?? '',
            $tags['description'] ?? '',
            $tags['operator'] ?? '',
        ]));

        return $this->servicesFromText($text, $typeKey);
    }

    private function servicesFromText(string $text, string $typeKey): array
    {
        $services = [];
        $patterns = [
            'Prenatal Checkups' => ['prenatal', 'obstetric', 'ob gyn', 'ob-gyn', 'gynecology', 'gynaecology', 'maternity'],
            'Normal Delivery' => ['lying', 'birthing', 'delivery', 'maternity', 'midwife'],
            'Emergency Obstetric Care' => ['emergency', 'hospital'],
            'Cesarean Delivery' => ['cesarean', 'caesarean', 'hospital'],
            'Postpartum Care' => ['postpartum', 'maternity', 'obstetric'],
            'Newborn Care' => ['newborn', 'neonatal', 'maternity', 'pediatric', 'paediatric'],
            'Child Immunization' => ['immunization', 'vaccination', 'vaccine', 'health station', 'pediatric', 'paediatric'],
            'Ultrasound' => ['ultrasound', 'diagnostic', 'imaging', 'radiology'],
            'Laboratory' => ['laboratory', 'lab', 'diagnostic'],
            'Family Planning' => ['family planning', 'health center', 'health centre', 'rhu', 'barangay health'],
            'NICU' => ['nicu', 'neonatal intensive'],
            'Pediatric Care' => ['pediatric', 'paediatric', 'children', 'child'],
            'Referral Services' => ['hospital', 'clinic', 'health', 'medical'],
        ];

        foreach ($patterns as $service => $needles) {
            foreach ($needles as $needle) {
                if (str_contains($text, $needle)) {
                    $services[] = $service;
                    break;
                }
            }
        }

        return array_values(array_unique($services ?: self::FACILITY_TYPES[$typeKey]['services']));
    }

    private function servicesCameFromGoogle(array $place, array $services): bool
    {
        if (!$services) {
            return false;
        }

        $summary = mb_strtolower($place['editorialSummary']['text'] ?? '');

        return $summary !== '' && collect($services)->contains(fn (string $service) => str_contains($summary, mb_strtolower(strtok($service, ' '))));
    }

    private function hasSpecificServiceTags(array $tags): bool
    {
        return collect(array_keys($tags))
            ->contains(fn (string $key) => str_starts_with($key, 'healthcare:speciality') || in_array($key, ['speciality', 'service', 'services', 'description'], true));
    }

    private function operatingStatus(array $place): string
    {
        $businessStatus = $place['businessStatus'] ?? null;

        if ($businessStatus && $businessStatus !== 'OPERATIONAL') {
            return 'Closed';
        }

        $openNow = $place['currentOpeningHours']['openNow'] ?? null;

        return match ($openNow) {
            true => 'Open',
            false => 'Closed',
            default => 'Unknown',
        };
    }

    private function openStreetMapOperatingStatus(array $tags): string
    {
        $openingHours = mb_strtolower((string) ($tags['opening_hours'] ?? ''));

        if ($openingHours === '24/7') {
            return 'Open 24/7';
        }

        if (($tags['disused:amenity'] ?? null) || ($tags['abandoned:amenity'] ?? null) || ($tags['closed'] ?? null) === 'yes') {
            return 'Closed';
        }

        return 'Unknown';
    }

    private function openStreetMapAddress(array $tags): string
    {
        $parts = array_values(array_filter([
            $tags['addr:housenumber'] ?? null,
            $tags['addr:street'] ?? null,
            $tags['addr:barangay'] ?? null,
            $tags['addr:city'] ?? null,
            $tags['addr:province'] ?? null,
        ]));

        if ($parts) {
            return implode(', ', $parts);
        }

        return $tags['addr:full'] ?? $tags['address'] ?? 'Address not available';
    }

    private function openStreetMapId(array $element): string
    {
        return sprintf('osm-%s-%s', $element['type'] ?? 'place', $element['id'] ?? Str::random(8));
    }

    private function openMapHeaders(): array
    {
        return [
            'User-Agent' => sprintf(
                'Project-INAY/%s (%s)',
                config('app.env', 'local'),
                config('app.url', 'http://localhost'),
            ),
            'Accept' => 'application/json',
        ];
    }

    private function googleMapsDirectionsUrl(array $origin, array $destination): string
    {
        return sprintf(
            'https://www.google.com/maps/dir/?api=1&origin=%s,%s&destination=%s,%s&travelmode=driving',
            $origin['latitude'],
            $origin['longitude'],
            $destination['latitude'],
            $destination['longitude'],
        );
    }

    private function openStreetMapDirectionsUrl(array $origin, array $destination): string
    {
        return sprintf(
            'https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=%s%%2C%s%%3B%s%%2C%s',
            $origin['latitude'],
            $origin['longitude'],
            $destination['latitude'],
            $destination['longitude'],
        );
    }

    private function distanceMeters(float $lat1, float $lng1, float $lat2, float $lng2): int
    {
        $earthRadiusMeters = 6371000;
        $latDistance = deg2rad($lat2 - $lat1);
        $lngDistance = deg2rad($lng2 - $lng1);
        $originLat = deg2rad($lat1);
        $destinationLat = deg2rad($lat2);
        $haversine = sin($latDistance / 2) ** 2
            + cos($originLat) * cos($destinationLat) * sin($lngDistance / 2) ** 2;

        return (int) round($earthRadiusMeters * 2 * atan2(sqrt($haversine), sqrt(1 - $haversine)));
    }

    private function durationToSeconds(int|string|null $duration): ?int
    {
        if (is_int($duration)) {
            return $duration > 0 ? $duration : null;
        }

        if (!$duration || !str_ends_with($duration, 's')) {
            return null;
        }

        return (int) round((float) rtrim($duration, 's'));
    }

    private function minutesText(int $seconds): string
    {
        $minutes = max(1, (int) round($seconds / 60));

        return $minutes < 60
            ? "{$minutes} min"
            : sprintf('%d hr %02d min', intdiv($minutes, 60), $minutes % 60);
    }
}
