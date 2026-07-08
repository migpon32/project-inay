<?php

namespace Tests\Feature;

use App\Models\ChildImmunization;
use App\Models\ChildProfile;
use App\Models\HealthcareWorker;
use App\Models\Mother;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ChildHealthTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_mother_can_register_child_and_read_worker_growth_and_immunization_schedule(): void
    {
        Carbon::setTestNow('2026-06-22 08:00:00');
        [$motherUser] = $this->createMother();

        Sanctum::actingAs($motherUser, ['mother']);

        $childResponse = $this->postJson('/api/child-health/children', [
            'name' => 'Juan Santos',
            'sex' => 'male',
            'birth_date' => '2024-03-12',
        ])->assertCreated()
            ->assertJsonPath('child.name', 'Juan Santos')
            ->assertJsonPath('child.current_weight_kg', null)
            ->assertJsonPath('child.current_height_cm', null);

        $this->assertDatabaseHas('children', [
            'name' => 'Juan Santos',
        ]);

        $this->assertDatabaseCount('growth_records', 0);

        $payload = $this->getJson('/api/child-health/children')
            ->assertOk()
            ->assertJsonPath('summary.children_count', 1)
            ->assertJsonCount(0, 'children.0.growth_records')
            ->assertJsonCount(0, 'children.0.growth_trend')
            ->assertJsonPath('children.0.growth_analytics.engine', 'python')
            ->assertJsonPath('children.0.growth_analytics.cached', true)
            ->assertJsonPath('children.0.growth_analytics.raw_record_count', 0)
            ->assertJsonPath('children.0.growth_analytics.trend_point_count', 0)
            ->assertJsonPath('children.0.growth_analytics.duplicate_age_record_count', 0)
            ->json();

        $this->assertDatabaseCount('growth_records', 0);
        $this->assertSame('2 years 3 months', $payload['children'][0]['age_label']);
        $this->assertGreaterThan(0, $payload['children'][0]['immunization_summary']['overdue']);
        $this->assertGreaterThan(0, count($payload['children'][0]['immunizations']));
    }

    public function test_program_staff_can_record_assigned_child_immunization_completion(): void
    {
        Carbon::setTestNow('2026-06-22 08:00:00');
        [$motherUser, $mother] = $this->createMother();
        [$workerUser, $worker] = $this->createWorker();
        $worker->mothers()->attach($mother->id);

        Sanctum::actingAs($motherUser, ['mother']);

        $child = $this->postJson('/api/child-health/children', [
            'name' => 'Luis Santos',
            'sex' => 'male',
            'birth_date' => '2026-05-01',
        ])->assertCreated()
            ->json('child');

        $firstOverdue = collect($child['immunizations'])->firstWhere('status', 'overdue');
        $this->assertNotNull($firstOverdue);

        $this->patchJson(
            "/api/child-health/children/{$child['id']}/immunizations/{$firstOverdue['id']}",
            [
                'completed' => true,
                'vaccinated_at' => '2026-06-20',
            ]
        )->assertNotFound();

        Sanctum::actingAs($workerUser, ['health_worker']);

        $this->patchJson(
            "/api/health-worker/child-health/children/{$child['id']}/immunizations/{$firstOverdue['id']}",
            [
                'completed' => true,
                'vaccinated_at' => '2026-06-20',
            ]
        )->assertOk()
            ->assertJsonPath('immunization.status', 'completed')
            ->assertJsonPath('immunization.vaccinated_at', '2026-06-20');

        $recordedImmunization = ChildImmunization::findOrFail($firstOverdue['id']);

        $this->assertSame($workerUser->id, $recordedImmunization->recorded_by_user_id);
        $this->assertSame('2026-06-20', $recordedImmunization->vaccinated_at->toDateString());
    }

    public function test_growth_alerts_are_generated_when_measurements_are_outside_age_ranges(): void
    {
        Carbon::setTestNow('2026-06-22 08:00:00');
        [$motherUser, $mother] = $this->createMother();
        [$workerUser, $worker] = $this->createWorker();
        $worker->mothers()->attach($mother->id);

        Sanctum::actingAs($motherUser, ['mother']);

        $child = $this->postJson('/api/child-health/children', [
            'name' => 'Ana Santos',
            'sex' => 'female',
            'birth_date' => '2025-06-22',
        ])->assertCreated()
            ->json('child');

        Sanctum::actingAs($workerUser, ['health_worker']);

        $this->postJson("/api/children/{$child['id']}/growth", [
            'age_month' => 12,
            'weight' => 5.0,
            'height' => 65.0,
        ])->assertCreated()
            ->assertJsonPath('child.growth_status.weight.status', 'severely_underweight')
            ->assertJsonPath('child.growth_status.height.status', 'stunted');

        Sanctum::actingAs($motherUser, ['mother']);

        $payload = $this->getJson('/api/child-health/children')->assertOk()->json();
        $alertTitles = collect($payload['children'][0]['alerts'])->pluck('title')->all();

        $this->assertContains('Weight needs review', $alertTitles);
        $this->assertContains('Height needs review', $alertTitles);
    }

    public function test_manila_today_is_accepted_when_utc_is_still_the_previous_day(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-24 16:30:00', 'UTC'));
        [, $mother] = $this->createMother();
        [$workerUser, $worker] = $this->createWorker();
        $worker->mothers()->attach($mother->id);
        $child = ChildProfile::create([
            'mother_id' => $mother->id,
            'name' => 'James Reid',
            'sex' => 'male',
            'birth_date' => '2026-05-06',
        ]);

        Sanctum::actingAs($workerUser, ['health_worker']);

        $this->postJson("/api/children/{$child->id}/growth", [
            'age_month' => 2,
            'weight' => 7.2,
            'height' => 32,
        ])->assertCreated()
            ->assertJsonPath('record.date', '2026-06-25')
            ->assertJsonPath('child.current_weight_kg', 7.2)
            ->assertJsonPath('child.current_height_cm', 32);

        $this->assertDatabaseHas('growth_records', [
            'child_id' => $child->id,
            'age_month' => 2,
            'weight' => 7.2,
            'height' => 32,
        ]);
    }

    public function test_mother_can_upload_child_profile_photo(): void
    {
        Storage::fake('public');
        [$motherUser, $mother] = $this->createMother();
        $child = ChildProfile::create([
            'mother_id' => $mother->id,
            'name' => 'James Reid',
            'sex' => 'male',
            'birth_date' => '2026-05-06',
        ]);

        Sanctum::actingAs($motherUser, ['mother']);

        $payload = $this->post("/api/child-health/children/{$child->id}/profile-photo", [
            'photo' => $this->fakeProfilePhoto('baby-profile.png'),
        ])->assertOk()
            ->assertJsonPath('message', 'Child profile photo updated successfully.')
            ->json();

        $child->refresh();

        $this->assertNotNull($child->profile_photo_path);
        Storage::disk('public')->assertExists($child->profile_photo_path);
        $this->assertStringContainsString('/storage/profile-photos/children/', $payload['child']['profile_photo_url']);
    }

    public function test_mother_can_upload_own_profile_photo(): void
    {
        Storage::fake('public');
        [$motherUser, $mother] = $this->createMother();

        Sanctum::actingAs($motherUser, ['mother']);

        $payload = $this->post('/api/mother/profile-photo', [
            'photo' => $this->fakeProfilePhoto('mother-profile.png'),
        ])->assertOk()
            ->assertJsonPath('message', 'Mother profile photo updated successfully.')
            ->json();

        $mother->refresh();

        $this->assertNotNull($mother->profile_photo_path);
        Storage::disk('public')->assertExists($mother->profile_photo_path);
        $this->assertStringContainsString('/storage/profile-photos/mothers/', $payload['user']['mother']['profile_photo_url']);

        $this->getJson('/api/user')
            ->assertOk()
            ->assertJsonPath('mother.profile_photo_url', $payload['user']['mother']['profile_photo_url']);
    }

    public function test_profile_photo_upload_rejects_unsupported_formats_and_oversized_images(): void
    {
        Storage::fake('public');
        [$motherUser] = $this->createMother();

        Sanctum::actingAs($motherUser, ['mother']);

        $this->postJson('/api/mother/profile-photo', [
            'photo' => $this->fakeGifPhoto('mother-profile.gif'),
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('photo');

        $this->postJson('/api/mother/profile-photo', [
            'photo' => $this->fakeOversizedProfilePhoto('mother-profile.png'),
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('photo');
    }

    public function test_health_worker_can_update_assigned_child_growth(): void
    {
        Carbon::setTestNow('2026-06-22 08:00:00');
        [$motherUser, $mother] = $this->createMother();
        [$workerUser, $worker] = $this->createWorker();
        $worker->mothers()->attach($mother->id);

        $child = ChildProfile::create([
            'mother_id' => $mother->id,
            'name' => 'Luis Santos',
            'sex' => 'male',
            'birth_date' => '2024-06-22',
        ]);

        Sanctum::actingAs($motherUser, ['mother']);

        $this->postJson("/api/child-health/children/{$child->id}/growth-records", [
            'age_month' => 24,
            'weight' => 12.2,
            'height' => 86.0,
            'notes' => 'Barangay health center monthly check.',
        ])->assertNotFound();

        Sanctum::actingAs($workerUser, ['health_worker']);

        $this->postJson("/api/children/{$child->id}/growth", [
            'age_month' => 24,
            'weight' => 12.2,
            'height' => 86.0,
            'notes' => 'Barangay health center monthly check.',
        ])->assertCreated()
            ->assertJsonPath('child.current_weight_kg', 12.2)
            ->assertJsonPath('child.current_height_cm', 86);

        $duplicate = $this->postJson("/api/children/{$child->id}/growth", [
            'age_month' => 24,
            'weight' => 12.8,
            'height' => 87.0,
        ])->assertStatus(409)
            ->assertJsonPath('duplicate', true)
            ->json('existing_record');

        $this->putJson("/api/growth-records/{$duplicate['id']}", [
            'age_month' => 24,
            'weight' => 12.8,
            'height' => 87.0,
        ])->assertOk()
            ->assertJsonPath('child.current_weight_kg', 12.8)
            ->assertJsonPath('child.current_height_cm', 87)
            ->assertJsonPath('record.recorded_by.name', 'Nurse Linda Reyes');

        $this->assertDatabaseHas('growth_record_audits', [
            'child_id' => $child->id,
            'healthcare_worker_id' => $worker->id,
            'previous_weight' => 12.2,
            'new_weight' => 12.8,
            'previous_height' => 86.0,
            'new_height' => 87.0,
        ]);

        Sanctum::actingAs($motherUser, ['mother']);

        $this->getJson('/api/child-health/children')
            ->assertOk()
            ->assertJsonPath('children.0.current_weight_kg', 12.8)
            ->assertJsonPath('children.0.current_height_cm', 87)
            ->assertJsonCount(1, 'children.0.growth_records');

        $this->getJson("/api/children/{$child->id}/growth")
            ->assertOk()
            ->assertJsonCount(1, 'growth_records')
            ->assertJsonPath('growth_records.0.weight_kg', 12.8);
    }

    public function test_health_worker_cannot_update_child_outside_casefiles(): void
    {
        [, $mother] = $this->createMother();
        [$workerUser] = $this->createWorker();
        $child = ChildProfile::create([
            'mother_id' => $mother->id,
            'name' => 'Mia Santos',
            'sex' => 'female',
            'birth_date' => '2024-06-22',
        ]);

        Sanctum::actingAs($workerUser, ['health_worker']);

        $this->postJson("/api/health-worker/child-health/children/{$child->id}/growth-records", [
            'age_month' => 24,
            'weight' => 11.5,
            'height' => 84.0,
        ])->assertForbidden()
            ->assertJsonPath('message', 'This mother is not in your casefiles.');
    }

    private function createMother(): array
    {
        $user = User::factory()->create([
            'name' => 'Maria Santos',
            'email' => 'maria.child@example.com',
            'role' => 'mother',
        ]);
        $mother = Mother::create([
            'user_id' => $user->id,
            'email' => $user->email,
            'phone' => '+63 912 345 6789',
            'address' => '1234 Rizal Avenue',
            'barangay' => 'San Lucas',
            'birth_date' => now()->subYears(28)->toDateString(),
            'pregnancy_status' => 'postpartum',
            'risk_rating' => 'low',
        ]);

        return [$user, $mother];
    }

    private function fakeProfilePhoto(string $name): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'project-inay-photo');
        file_put_contents(
            $path,
            base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=')
        );

        return new UploadedFile($path, $name, 'image/png', UPLOAD_ERR_OK, true);
    }

    private function fakeGifPhoto(string $name): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'project-inay-gif');
        file_put_contents(
            $path,
            base64_decode('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==')
        );

        return new UploadedFile($path, $name, 'image/gif', UPLOAD_ERR_OK, true);
    }

    private function fakeOversizedProfilePhoto(string $name): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'project-inay-large-photo');
        file_put_contents(
            $path,
            base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=')
                . str_repeat("\0", (4 * 1024 * 1024) + 1)
        );

        return new UploadedFile($path, $name, 'image/png', UPLOAD_ERR_OK, true);
    }

    private function createWorker(): array
    {
        $user = User::factory()->create([
            'name' => 'Nurse Linda Reyes',
            'email' => 'linda.child@example.com',
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
