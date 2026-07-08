<?php

namespace Tests\Feature;

use App\Models\HealthcareWorker;
use App\Models\Mother;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MaternalMonitoringTest extends TestCase
{
    use RefreshDatabase;

    public function test_mother_can_view_read_only_monitoring_records(): void
    {
        [$motherUser] = $this->createMother();

        Sanctum::actingAs($motherUser, ['mother']);

        $statusResponse = $this->getJson('/api/maternal-monitoring/status')
            ->assertOk()
            ->assertJsonPath('risk_level', 'low');
        $this->assertArrayNotHasKey('summary', $statusResponse->json());

        $this->getJson('/api/maternal-monitoring/me')
            ->assertOk()
            ->assertJsonPath('profile.name', 'Maria Santos')
            ->assertJsonPath('summary.latest.blood_pressure', '120/80')
            ->assertJsonPath('summary.blood_pressure_logs.0.blood_pressure', '120/80')
            ->assertJsonPath('summary.blood_pressure_logs.0.status', 'Normal');

        $this->postJson('/api/maternal-monitoring/entries', [
            'pregnancy_week' => 34,
            'systolic_bp' => 122,
            'diastolic_bp' => 78,
            'blood_sugar_mgdl' => 96,
            'weight_kg' => 75.5,
            'hemoglobin_gdl' => 12.6,
            'body_temperature_c' => 36.8,
            'heart_rate' => 82,
        ])->assertForbidden()
            ->assertJsonPath('message', 'Program Staff manages maternal vitals and weight records.');

        $this->assertDatabaseCount('maternal_monitoring_entries', 1);
    }

    public function test_program_staff_entries_feed_mother_weight_analytics(): void
    {
        [$motherUser, $mother] = $this->createMother();
        [$workerUser, $worker] = $this->createWorker();
        $worker->mothers()->attach($mother->id);

        Sanctum::actingAs($motherUser, ['mother']);

        $this->getJson('/api/maternal-monitoring/me')->assertOk();

        Sanctum::actingAs($workerUser, ['health_worker']);

        $this->postJson("/api/health-worker/maternal-monitoring/{$mother->id}/entries", [
            'pregnancy_week' => 34,
            'systolic_bp' => 122,
            'diastolic_bp' => 78,
            'blood_sugar_mgdl' => 96,
            'weight_kg' => 75.5,
            'hemoglobin_gdl' => 12.6,
            'body_temperature_c' => 36.8,
            'heart_rate' => 82,
        ])->assertCreated()
            ->assertJsonPath('entry.pregnancy_week', 34)
            ->assertJsonPath('entry.risk_level', 'low');

        $this->postJson("/api/health-worker/maternal-monitoring/{$mother->id}/entries", [
            'pregnancy_week' => 34,
            'weight_kg' => 76,
        ])->assertCreated();

        Sanctum::actingAs($motherUser, ['mother']);

        $this->getJson('/api/maternal-monitoring/me')
            ->assertOk()
            ->assertJsonCount(3, 'summary.weight_logs')
            ->assertJsonCount(2, 'summary.weight_trend')
            ->assertJsonCount(2, 'summary.blood_pressure_logs')
            ->assertJsonPath('summary.weight_trend.1.pregnancy_week', 34)
            ->assertJsonPath('summary.weight_trend.1.weight_kg', 76)
            ->assertJsonPath('summary.blood_pressure_trend.1.systolic', 122)
            ->assertJsonPath('summary.blood_pressure_trend.1.diastolic', 78)
            ->assertJsonPath('summary.blood_pressure_trend.1.status', 'Normal')
            ->assertJsonPath('summary.weight_analytics.engine', 'python')
            ->assertJsonPath('summary.weight_analytics.cached', true)
            ->assertJsonPath('summary.weight_analytics.raw_log_count', 3)
            ->assertJsonPath('summary.weight_analytics.trend_point_count', 2)
            ->assertJsonPath('summary.weight_analytics.duplicate_week_log_count', 1);

        $this->assertDatabaseCount('maternal_monitoring_entries', 3);
        $this->assertDatabaseHas('maternal_monitoring_entries', [
            'pregnancy_week' => 34,
            'risk_level' => 'low',
        ]);
    }

    public function test_program_staff_update_syncs_to_mother_dashboard_and_risk(): void
    {
        [$motherUser, $mother] = $this->createMother();
        [$workerUser, $worker] = $this->createWorker();
        $worker->mothers()->attach($mother->id);

        Sanctum::actingAs($workerUser, ['health_worker']);

        $this->postJson("/api/health-worker/maternal-monitoring/{$mother->id}/entries", [
            'pregnancy_week' => 35,
            'systolic_bp' => 145,
            'diastolic_bp' => 92,
            'blood_sugar_mgdl' => 145,
            'weight_kg' => 82,
            'hemoglobin_gdl' => 10.8,
            'body_temperature_c' => 37.1,
            'heart_rate' => 88,
            'notes' => 'Elevated vitals; needs clinic follow-up.',
        ])->assertCreated()
            ->assertJsonPath('entry.risk_level', 'high');

        $this->getJson('/api/health-worker/maternal-monitoring')
            ->assertOk()
            ->assertJsonPath('stats.high_risk_mothers', 1)
            ->assertJsonPath('mothers.0.risk_level', 'high');

        Sanctum::actingAs($motherUser, ['mother']);

        $this->getJson('/api/maternal-monitoring/me')
            ->assertOk()
            ->assertJsonPath('profile.risk_level', 'high')
            ->assertJsonPath('summary.latest.blood_pressure', '145/92')
            ->assertJsonPath('summary.blood_pressure_trend.0.status', 'High Blood Pressure (Stage 1)')
            ->assertJsonPath('summary.latest.recorded_by', 'Nurse Linda Reyes');
    }

    public function test_program_staff_cannot_update_a_mother_outside_casefiles(): void
    {
        [, $mother] = $this->createMother();
        [$workerUser] = $this->createWorker();

        Sanctum::actingAs($workerUser, ['health_worker']);

        $this->postJson("/api/health-worker/maternal-monitoring/{$mother->id}/entries", [
            'pregnancy_week' => 30,
            'weight_kg' => 70,
        ])->assertForbidden()
            ->assertJsonPath('message', 'This mother is not in your casefiles.');
    }

    private function createMother(): array
    {
        $user = User::factory()->create([
            'name' => 'Maria Santos',
            'email' => 'maria.monitor@example.com',
            'role' => 'mother',
        ]);
        $mother = Mother::create([
            'user_id' => $user->id,
            'email' => $user->email,
            'phone' => '+63 912 345 6789',
            'address' => '1234 Rizal Avenue',
            'barangay' => 'San Lucas',
            'birth_date' => now()->subYears(28)->toDateString(),
            'pregnancy_status' => 'pregnant',
            'pregnancy_week' => 32,
            'pregnancy_month' => 8,
            'pre_pregnancy_weight_kg' => 62,
            'risk_rating' => 'low',
        ]);

        return [$user, $mother];
    }

    private function createWorker(): array
    {
        $user = User::factory()->create([
            'name' => 'Nurse Linda Reyes',
            'email' => 'linda.monitor@example.com',
            'role' => 'health_worker',
        ]);
        $worker = HealthcareWorker::create([
            'user_id' => $user->id,
            'email' => $user->email,
            'profession' => 'nurse',
            'verification_status' => 'verified',
        ]);

        return [$user, $worker];
    }
}
