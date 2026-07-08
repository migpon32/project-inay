<?php

namespace Tests\Feature;

use App\Models\Mother;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HealthServicesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
    }

    public function test_nearby_health_services_uses_free_openstreetmap_provider(): void
    {
        [$user] = $this->createMother();
        Sanctum::actingAs($user, ['mother']);
        Config::set('services.health_facilities.provider', 'openstreetmap');
        Config::set('services.health_facilities.route_limit', 4);

        Http::fake([
            'https://overpass-api.de/api/interpreter' => Http::response([
                'elements' => [[
                    'type' => 'node',
                    'id' => 123,
                    'lat' => 14.07,
                    'lon' => 121.33,
                    'tags' => [
                        'name' => 'San Pablo Maternity Hospital',
                        'amenity' => 'hospital',
                        'addr:city' => 'San Pablo City',
                        'addr:province' => 'Laguna',
                        'phone' => '(049) 555-0000',
                        'opening_hours' => '24/7',
                    ],
                ]],
            ], 200),
            'https://router.project-osrm.org/route/v1/driving/*' => Http::response([
                'routes' => [[
                    'distance' => 2800.4,
                    'duration' => 540.2,
                ]],
            ], 200),
        ]);

        $this->getJson('/api/health-services/nearby?latitude=14.0683&longitude=121.3256')
            ->assertOk()
            ->assertJsonPath('meta.source', 'openstreetmap')
            ->assertJsonPath('meta.provider', 'openstreetmap')
            ->assertJsonPath('facilities.0.name', 'San Pablo Maternity Hospital')
            ->assertJsonPath('facilities.0.distance_km', 2.8)
            ->assertJsonPath('facilities.0.travel_time_text', '9 min')
            ->assertJsonPath('facilities.0.distance_source', 'osrm')
            ->assertJsonPath('facilities.0.operating_status', 'Open 24/7')
            ->assertJsonPath('facilities.0.phone', '(049) 555-0000');
    }

    public function test_nearby_health_services_returns_local_fallback_when_free_provider_is_unavailable(): void
    {
        [$user] = $this->createMother();
        Sanctum::actingAs($user, ['mother']);
        Config::set('services.health_facilities.provider', 'openstreetmap');

        Http::fake([
            'https://overpass-api.de/api/interpreter' => Http::response([], 503),
        ]);

        $this->getJson('/api/health-services/nearby?latitude=14.0683&longitude=121.3256')
            ->assertOk()
            ->assertJsonPath('meta.source', 'local_fallback')
            ->assertJsonPath('meta.provider', 'openstreetmap')
            ->assertJsonPath('groups.0.facilities.0.distance_source', 'estimated')
            ->assertJsonStructure([
                'groups' => [
                    '*' => [
                        'key',
                        'label',
                        'count',
                        'facilities' => [
                            '*' => [
                                'name',
                                'facility_type',
                                'address',
                                'distance_km',
                                'travel_time_text',
                                'operating_status',
                                'services',
                                'navigation_url',
                            ],
                        ],
                    ],
                ],
            ]);
    }

    public function test_nearby_health_services_can_still_use_google_provider_when_explicitly_configured(): void
    {
        [$user] = $this->createMother();
        Sanctum::actingAs($user, ['mother']);
        Config::set('services.health_facilities.provider', 'google');
        Config::set('services.google_maps.places_key', 'places-test-key');
        Config::set('services.google_maps.routes_key', 'routes-test-key');

        Http::fake([
            'https://places.googleapis.com/v1/places:searchText' => Http::response([
                'places' => [[
                    'id' => 'google-hospital-1',
                    'displayName' => ['text' => 'Sample Maternity Hospital'],
                    'formattedAddress' => 'San Pablo City, Laguna',
                    'location' => ['latitude' => 14.07, 'longitude' => 121.33],
                    'primaryType' => 'hospital',
                    'primaryTypeDisplayName' => ['text' => 'Hospital'],
                    'types' => ['hospital', 'health'],
                    'businessStatus' => 'OPERATIONAL',
                    'currentOpeningHours' => ['openNow' => true],
                    'rating' => 4.4,
                    'userRatingCount' => 12,
                    'internationalPhoneNumber' => '+63 49 555 0000',
                    'googleMapsUri' => 'https://maps.google.com/?cid=1',
                    'editorialSummary' => ['text' => 'Maternity and pediatric care hospital.'],
                ]],
            ], 200),
            'https://routes.googleapis.com/directions/v2:computeRoutes' => Http::response([
                'routes' => [[
                    'distanceMeters' => 2800,
                    'duration' => '540s',
                ]],
            ], 200),
        ]);

        $this->getJson('/api/health-services/nearby?latitude=14.0683&longitude=121.3256')
            ->assertOk()
            ->assertJsonPath('meta.source', 'google_places')
            ->assertJsonPath('meta.provider', 'google')
            ->assertJsonPath('facilities.0.name', 'Sample Maternity Hospital')
            ->assertJsonPath('facilities.0.distance_km', 2.8)
            ->assertJsonPath('facilities.0.travel_time_text', '9 min')
            ->assertJsonPath('facilities.0.distance_source', 'google_routes')
            ->assertJsonPath('facilities.0.operating_status', 'Open');
    }

    private function createMother(): array
    {
        $user = User::factory()->create([
            'name' => 'Health Services Mother',
            'email' => 'health.services@example.com',
            'role' => 'mother',
        ]);
        $mother = Mother::create([
            'user_id' => $user->id,
            'email' => $user->email,
            'barangay' => 'San Lucas',
            'pregnancy_status' => 'pregnant',
        ]);

        return [$user, $mother];
    }
}
