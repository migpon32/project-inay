<?php

namespace Tests\Feature;

use App\Models\Consultation;
use App\Models\HealthcareWorker;
use App\Models\Mother;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConsultationTest extends TestCase
{
    use RefreshDatabase;

    public function test_mother_can_start_and_message_an_assigned_health_worker(): void
    {
        [$motherUser, $mother] = $this->createMother();
        [, $worker] = $this->createWorker();
        $worker->mothers()->attach($mother->id);

        Sanctum::actingAs($motherUser, ['mother']);

        $response = $this->postJson('/api/consultations', [
            'health_worker_id' => $worker->id,
            'topic' => 'Pregnancy',
            'subject' => 'Second trimester dizziness',
            'initial_message' => 'Is mild dizziness normal during my second trimester?',
        ])->assertCreated()
            ->assertJsonPath('message', 'Consultation sent successfully.')
            ->assertJsonPath('consultation.mother.name', 'Maria Santos')
            ->assertJsonPath('consultation.health_worker.name', 'Nurse Linda Reyes');

        $consultationId = $response->json('consultation.id');

        $this->postJson("/api/consultations/{$consultationId}/messages", [
            'body' => 'It happens mostly when I stand up.',
        ])->assertCreated()->assertJsonPath('message', 'Message sent.');

        $this->assertDatabaseCount('consultation_messages', 2);
    }

    public function test_mother_cannot_start_a_consultation_with_an_unassigned_worker(): void
    {
        [$motherUser] = $this->createMother();
        [, $worker] = $this->createWorker();

        Sanctum::actingAs($motherUser, ['mother']);

        $this->postJson('/api/consultations', [
            'health_worker_id' => $worker->id,
            'topic' => 'Nutrition',
            'subject' => 'Food question',
            'initial_message' => 'What foods should I prioritize?',
        ])->assertStatus(422)
            ->assertJsonPath(
                'message',
                'You can only start a consultation with Program Staff assigned to your casefile.'
            );
    }

    public function test_health_worker_receives_unread_message_and_read_receipt_updates(): void
    {
        [$motherUser, $mother] = $this->createMother();
        [$workerUser, $worker] = $this->createWorker();
        $worker->mothers()->attach($mother->id);
        $consultation = Consultation::create([
            'mother_id' => $mother->id,
            'health_worker_id' => $worker->id,
            'topic' => 'Pregnancy',
            'subject' => 'Dizziness',
            'last_message_at' => now(),
        ]);
        $message = $consultation->messages()->create([
            'sender_user_id' => $motherUser->id,
            'body' => 'Good morning, I feel dizzy.',
        ]);

        Sanctum::actingAs($workerUser, ['health_worker']);

        $this->getJson('/api/consultations/unread-count')
            ->assertOk()
            ->assertJsonPath('unread_count', 1);

        $this->getJson("/api/consultations/{$consultation->id}")
            ->assertOk()
            ->assertJsonPath('consultation.messages.0.body', 'Good morning, I feel dizzy.')
            ->assertJsonPath('consultation.unread_count', 0);

        $this->assertNotNull($message->fresh()->read_at);
    }

    public function test_health_worker_can_reply_with_attachment_and_escalate_case(): void
    {
        Storage::fake('local');
        [$motherUser, $mother] = $this->createMother();
        [$workerUser, $worker] = $this->createWorker();
        $worker->mothers()->attach($mother->id);
        $consultation = Consultation::create([
            'mother_id' => $mother->id,
            'health_worker_id' => $worker->id,
            'topic' => 'Prenatal Care',
            'subject' => 'Record review',
            'last_message_at' => now(),
        ]);
        $consultation->messages()->create([
            'sender_user_id' => $motherUser->id,
            'body' => 'Please review my prenatal record.',
        ]);

        Sanctum::actingAs($workerUser, ['health_worker']);

        $this->post("/api/consultations/{$consultation->id}/messages", [
            'body' => 'I received the record.',
            'attachment' => UploadedFile::fake()->create('guidance.pdf', 32, 'application/pdf'),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('consultation_message.attachment.name', 'guidance.pdf');

        $this->patchJson("/api/consultations/{$consultation->id}", [
            'status' => 'escalated',
            'outcome' => 'Referred to the clinic for same-day assessment.',
        ])->assertOk()
            ->assertJsonPath('consultation.status', 'escalated')
            ->assertJsonPath('consultation.risk_level', 'high');

        $this->assertDatabaseHas('consultations', [
            'id' => $consultation->id,
            'status' => 'escalated',
            'risk_level' => 'high',
        ]);
    }

    public function test_consultation_message_accepts_limited_video_attachment(): void
    {
        Storage::fake('local');
        [$motherUser, $mother] = $this->createMother();
        [$workerUser, $worker] = $this->createWorker();
        $worker->mothers()->attach($mother->id);
        $consultation = Consultation::create([
            'mother_id' => $mother->id,
            'health_worker_id' => $worker->id,
            'topic' => 'Prenatal Care',
            'subject' => 'Video guidance',
            'last_message_at' => now(),
        ]);

        Sanctum::actingAs($workerUser, ['health_worker']);

        $this->post("/api/consultations/{$consultation->id}/messages", [
            'body' => 'Please watch this short guidance video.',
            'attachment' => UploadedFile::fake()->create('guidance.mp4', 1024, 'video/mp4'),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('consultation_message.attachment.name', 'guidance.mp4')
            ->assertJsonPath('consultation_message.attachment.type', 'video/mp4');

        Sanctum::actingAs($motherUser, ['mother']);

        $this->post("/api/consultations/{$consultation->id}/messages", [
            'attachment' => UploadedFile::fake()->create('too-large.mp4', 26001, 'video/mp4'),
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Video attachments must be 25 MB or smaller.');
    }

    public function test_non_participant_cannot_view_a_consultation(): void
    {
        [, $mother] = $this->createMother();
        [, $worker] = $this->createWorker();
        $otherUser = User::factory()->create(['email' => 'other@example.com']);
        $otherMother = Mother::create([
            'user_id' => $otherUser->id,
            'email' => $otherUser->email,
            'pregnancy_status' => 'pregnant',
        ]);
        $consultation = Consultation::create([
            'mother_id' => $mother->id,
            'health_worker_id' => $worker->id,
            'topic' => 'Pregnancy',
            'subject' => 'Private consultation',
        ]);

        Sanctum::actingAs($otherUser, ['mother']);

        $this->getJson("/api/consultations/{$consultation->id}")
            ->assertForbidden()
            ->assertJsonPath('message', 'You do not have access to this consultation.');

        $this->assertNotNull($otherMother);
    }

    private function createMother(): array
    {
        $user = User::factory()->create([
            'name' => 'Maria Santos',
            'email' => 'maria@example.com',
            'role' => 'mother',
        ]);
        $mother = Mother::create([
            'user_id' => $user->id,
            'email' => $user->email,
            'phone' => '+63 912 345 6789',
            'pregnancy_status' => 'pregnant',
            'pregnancy_week' => 24,
            'risk_rating' => 'low',
        ]);

        return [$user, $mother];
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
}
