<?php

namespace Tests\Feature;

use App\Models\ClinicalNote;
use App\Models\HealthcareWorker;
use App\Models\IECModule;
use App\Models\IECVideo;
use App\Models\MaternalMonitoringEntry;
use App\Models\Mother;
use App\Models\User;
use App\Models\UserCheckupRecord;
use App\Models\UserIECProgress;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HealthWorkerCasefilesTest extends TestCase
{
    use RefreshDatabase;

    public function test_health_worker_can_search_registered_mothers_and_see_assignment_status(): void
    {
        [$workerUser, $worker] = $this->createWorker();
        $maria = $this->createMother('Maria Santos', 'maria@example.com', [
            'phone' => '+63 912 345 6789',
            'address' => '1234 Rizal Avenue, Manila',
        ]);
        $this->createMother('Isabel Cruz', 'isabel@example.com', [
            'phone' => '+63 918 234 5678',
            'address' => 'Quezon City',
        ]);
        $worker->mothers()->attach($maria->id);

        Sanctum::actingAs($workerUser);

        $this->getJson('/api/health-worker/casefiles/search?q=Rizal')
            ->assertOk()
            ->assertJsonCount(1, 'mothers')
            ->assertJsonPath('mothers.0.name', 'Maria Santos')
            ->assertJsonPath('mothers.0.already_in_casefiles', true);

        $this->getJson('/api/health-worker/casefiles/search?q=Isabel')
            ->assertOk()
            ->assertJsonPath('mothers.0.phone', '+63 918 234 5678')
            ->assertJsonPath('mothers.0.already_in_casefiles', false);
    }

    public function test_health_worker_can_add_multiple_mothers_without_duplicates(): void
    {
        [$workerUser, $worker] = $this->createWorker();
        $first = $this->createMother('First Mother', 'first@example.com');
        $second = $this->createMother('Second Mother', 'second@example.com');

        Sanctum::actingAs($workerUser);

        $this->postJson('/api/health-worker/casefiles', [
            'mother_ids' => [$first->id, $second->id],
        ])->assertCreated()
            ->assertJsonPath('message', 'Patient added to Mothers Casefiles successfully.');

        $this->assertDatabaseHas('health_worker_mothers', [
            'health_worker_id' => $worker->id,
            'mother_id' => $first->id,
        ]);
        $this->assertDatabaseCount('health_worker_mothers', 2);
        $this->assertDatabaseHas('consultations', [
            'health_worker_id' => $worker->id,
            'mother_id' => $first->id,
            'subject' => 'Maternal care consultation',
        ]);
        $this->assertDatabaseHas('consultations', [
            'health_worker_id' => $worker->id,
            'mother_id' => $second->id,
            'subject' => 'Maternal care consultation',
        ]);
        $this->assertDatabaseCount('consultations', 2);

        $this->postJson('/api/health-worker/casefiles', [
            'mother_ids' => [$first->id],
        ])->assertStatus(409)
            ->assertJsonPath('message', 'This mother is already in your casefiles.');

        $this->assertDatabaseCount('health_worker_mothers', 2);
        $this->assertDatabaseCount('consultations', 2);
    }

    public function test_health_worker_can_list_and_remove_a_casefile(): void
    {
        [$workerUser, $worker] = $this->createWorker();
        $mother = $this->createMother('Casefile Mother', 'casefile@example.com', [
            'pregnancy_status' => 'pregnant',
            'pregnancy_week' => 32,
            'blood_type' => 'O+',
            'risk_rating' => 'medium',
        ]);
        $worker->mothers()->attach($mother->id);

        Sanctum::actingAs($workerUser);

        $this->getJson('/api/health-worker/casefiles')
            ->assertOk()
            ->assertJsonCount(1, 'mothers')
            ->assertJsonPath('mothers.0.pregnancy_week', 32)
            ->assertJsonPath('mothers.0.risk_rating', 'medium');

        $this->deleteJson("/api/health-worker/casefiles/{$mother->id}")
            ->assertOk()
            ->assertJsonPath('message', 'Patient removed from Mothers Casefiles successfully.');

        $this->assertDatabaseCount('health_worker_mothers', 0);
    }

    public function test_health_worker_can_view_detailed_casefile_for_assigned_mother(): void
    {
        [$workerUser, $worker] = $this->createWorker();
        $mother = $this->createMother('Detailed Mother', 'detailed@example.com', [
            'phone' => '+63 912 111 2222',
            'address' => 'San Pablo City',
            'birth_date' => now()->subYears(29)->toDateString(),
            'pregnancy_status' => 'pregnant',
            'pregnancy_week' => 18,
            'blood_type' => 'A+',
            'risk_rating' => 'low',
            'next_scheduled_visit' => now()->addWeek()->toDateString(),
        ]);
        $worker->mothers()->attach($mother->id);

        MaternalMonitoringEntry::create([
            'mother_id' => $mother->id,
            'recorded_by_user_id' => $workerUser->id,
            'pregnancy_week' => 18,
            'systolic_bp' => 122,
            'diastolic_bp' => 78,
            'blood_sugar_mgdl' => 98,
            'body_temperature_c' => 36.8,
            'heart_rate' => 84,
            'weight_kg' => 67.5,
            'risk_level' => 'low',
            'notes' => 'Stable vitals.',
            'recorded_at' => now(),
        ]);

        $module = IECModule::create([
            'trimester' => '2nd Trimester',
            'month_number' => 5,
            'title' => 'Feeling Baby Move',
            'week_range' => 'Weeks 17-20',
            'baby_development' => 'Baby movement begins.',
            'mother_changes' => 'Weight gain becomes visible.',
            'nutritional_guidance' => 'Eat iron-rich food.',
            'is_active' => true,
            'sort_order' => 5,
        ]);
        $video = IECVideo::create([
            'iec_module_id' => $module->id,
            'title' => 'Movement Guide',
            'video_url' => 'https://example.test/video',
            'duration_minutes' => 4,
            'category' => 'Prenatal Care',
            'is_required' => true,
        ]);
        UserIECProgress::create([
            'user_id' => $mother->user_id,
            'iec_module_id' => $module->id,
            'watched_videos' => [$video->id],
            'checklist_items' => [],
            'is_completed' => true,
            'completed_at' => now(),
        ]);
        UserCheckupRecord::create([
            'user_id' => $mother->user_id,
            'iec_module_id' => $module->id,
            'record_type' => 'lab_result',
            'file_path' => 'checkup_records/lab.pdf',
            'original_filename' => 'lab.pdf',
            'record_date' => now(),
        ]);
        ClinicalNote::create([
            'mother_id' => $mother->id,
            'author_user_id' => $workerUser->id,
            'body' => 'Continue routine prenatal care.',
        ]);

        Sanctum::actingAs($workerUser);

        $this->getJson("/api/health-worker/casefiles/{$mother->id}")
            ->assertOk()
            ->assertJsonPath('profile.name', 'Detailed Mother')
            ->assertJsonPath('profile.patient_id', 'MAT-RHU-' . str_pad((string) $mother->id, 3, '0', STR_PAD_LEFT))
            ->assertJsonPath('profile.current_trimester', 'Second Trimester')
            ->assertJsonPath('monitoring_records.0.blood_pressure', '122/78')
            ->assertJsonPath('medical_documents.items.0.type', 'lab_result')
            ->assertJsonPath('clinical_notes.0.body', 'Continue routine prenatal care.')
            ->assertJsonPath('learning_progress.categories.second_trimester.modules.0.is_completed', true);
    }

    public function test_health_worker_can_create_and_update_clinical_notes(): void
    {
        [$workerUser, $worker] = $this->createWorker();
        $mother = $this->createMother('Notes Mother', 'notes@example.com');
        $worker->mothers()->attach($mother->id);

        Sanctum::actingAs($workerUser);

        $noteId = $this->postJson("/api/health-worker/casefiles/{$mother->id}/notes", [
            'body' => 'Initial note for follow-up.',
        ])->assertCreated()
            ->assertJsonPath('message', 'Clinical note saved successfully.')
            ->json('note.id');

        $this->patchJson("/api/health-worker/casefiles/{$mother->id}/notes/{$noteId}", [
            'body' => 'Updated note after phone call.',
        ])->assertOk()
            ->assertJsonPath('note.body', 'Updated note after phone call.');

        $this->assertDatabaseHas('clinical_notes', [
            'id' => $noteId,
            'mother_id' => $mother->id,
            'body' => 'Updated note after phone call.',
        ]);
    }

    public function test_health_worker_cannot_view_casefile_for_unassigned_mother(): void
    {
        [$workerUser] = $this->createWorker();
        $mother = $this->createMother('Unassigned Mother', 'unassigned@example.com');

        Sanctum::actingAs($workerUser);

        $this->getJson("/api/health-worker/casefiles/{$mother->id}")
            ->assertForbidden()
            ->assertJsonPath('message', 'This mother is not in your casefiles.');
    }

    public function test_mother_account_cannot_access_health_worker_casefiles(): void
    {
        $motherUser = User::factory()->create([
            'email' => 'mother.only@example.com',
        ]);
        $this->createMotherProfile($motherUser);

        Sanctum::actingAs($motherUser);

        $this->getJson('/api/health-worker/casefiles')
            ->assertForbidden()
            ->assertJsonPath('message', 'Program staff access is required.');
    }

    private function createWorker(): array
    {
        $user = User::factory()->create([
            'name' => 'Nurse Linda Reyes',
            'email' => 'linda@example.com',
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

    private function createMother(string $name, string $email, array $attributes = []): Mother
    {
        $user = User::factory()->create([
            'name' => $name,
            'email' => $email,
            'role' => 'mother',
        ]);

        return $this->createMotherProfile($user, $attributes);
    }

    private function createMotherProfile(User $user, array $attributes = []): Mother
    {
        return Mother::create([
            'user_id' => $user->id,
            'email' => $user->email,
            'pregnancy_status' => 'not_provided',
            ...$attributes,
        ]);
    }
}
