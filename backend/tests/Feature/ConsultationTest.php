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
            ->assertJsonPath('consultation.viewer_user_id', $motherUser->id)
            ->assertJsonPath('consultation.viewer_role', 'mother')
            ->assertJsonPath('consultation.mother.name', 'Maria Santos')
            ->assertJsonPath('consultation.health_worker.name', 'Nurse Linda Reyes');

        $consultationId = $response->json('consultation.id');

        $this->postJson("/api/consultations/{$consultationId}/messages", [
            'body' => 'It happens mostly when I stand up.',
        ])->assertCreated()
            ->assertJsonPath('message', 'Message sent.')
            ->assertJsonPath('consultation_message.sender_role', 'mother')
            ->assertJsonPath('consultation_message.receiver_user_id', $worker->user_id)
            ->assertJsonPath('consultation_message.receiver_role', 'health_worker');

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
            ->assertJsonPath('consultation.viewer_user_id', $workerUser->id)
            ->assertJsonPath('consultation.viewer_role', 'health_worker')
            ->assertJsonPath('consultation.messages.0.body', 'Good morning, I feel dizzy.')
            ->assertJsonPath('consultation.messages.0.sender_id', $motherUser->id)
            ->assertJsonPath('consultation.messages.0.sender_user_id', $motherUser->id)
            ->assertJsonPath('consultation.messages.0.is_mine', false)
            ->assertJsonPath('consultation.unread_count', 0);

        $this->assertNotNull($message->fresh()->read_at);
    }

    public function test_message_ownership_is_viewer_specific_for_alignment(): void
    {
        [$motherUser, $mother] = $this->createMother();
        [$workerUser, $worker] = $this->createWorker();
        $motherUser->update(['email' => 'same.portal.email@example.com']);
        $mother->update(['email' => 'same.portal.email@example.com']);
        $workerUser->update(['email' => 'same.portal.email@example.com']);
        $worker->update(['email' => 'same.portal.email@example.com']);
        $motherUser->update(['name' => 'Project INAY User']);
        $workerUser->update(['name' => 'Project INAY User']);
        $worker->mothers()->attach($mother->id);
        $consultation = Consultation::create([
            'mother_id' => $mother->id,
            'health_worker_id' => $worker->id,
            'topic' => 'Pregnancy',
            'subject' => 'Alignment check',
            'last_message_at' => now(),
        ]);
        $consultation->messages()->create([
            'sender_user_id' => $motherUser->id,
            'sender_role' => 'mother',
            'receiver_user_id' => $workerUser->id,
            'receiver_role' => 'health_worker',
            'body' => 'Mother message',
        ]);
        $consultation->messages()->create([
            'sender_user_id' => $workerUser->id,
            'sender_role' => 'health_worker',
            'receiver_user_id' => $motherUser->id,
            'receiver_role' => 'mother',
            'body' => 'Program Staff message',
        ]);

        Sanctum::actingAs($motherUser, ['mother']);

        $this->getJson("/api/consultations/{$consultation->id}")
            ->assertOk()
            ->assertJsonPath('consultation.messages.0.is_mine', true)
            ->assertJsonPath('consultation.messages.0.sender_role', 'mother')
            ->assertJsonPath('consultation.messages.0.sender_name', 'Project INAY User')
            ->assertJsonPath('consultation.messages.1.is_mine', false)
            ->assertJsonPath('consultation.messages.1.sender_role', 'health_worker')
            ->assertJsonPath('consultation.messages.1.sender_name', 'Project INAY User');

        Sanctum::actingAs($workerUser, ['health_worker']);

        $this->getJson("/api/consultations/{$consultation->id}")
            ->assertOk()
            ->assertJsonPath('consultation.messages.0.is_mine', false)
            ->assertJsonPath('consultation.messages.0.sender_name', 'Project INAY User')
            ->assertJsonPath('consultation.messages.1.is_mine', true)
            ->assertJsonPath('consultation.messages.1.receiver_role', 'mother')
            ->assertJsonPath('consultation.messages.1.sender_name', 'Project INAY User');
    }

    public function test_consultation_loads_latest_messages_first_and_fetches_older_page(): void
    {
        [$motherUser, $mother] = $this->createMother();
        [, $worker] = $this->createWorker();
        $worker->mothers()->attach($mother->id);
        $consultation = Consultation::create([
            'mother_id' => $mother->id,
            'health_worker_id' => $worker->id,
            'topic' => 'Pregnancy',
            'subject' => 'Long thread',
            'last_message_at' => now(),
        ]);

        foreach (range(1, 45) as $index) {
            $consultation->messages()->create([
                'sender_user_id' => $motherUser->id,
                'body' => "Message {$index}",
                'created_at' => now()->addSeconds($index),
                'updated_at' => now()->addSeconds($index),
            ]);
        }

        Sanctum::actingAs($motherUser, ['mother']);

        $response = $this->getJson("/api/consultations/{$consultation->id}")
            ->assertOk()
            ->assertJsonCount(30, 'consultation.messages')
            ->assertJsonPath('consultation.messages.0.body', 'Message 16')
            ->assertJsonPath('consultation.messages.29.body', 'Message 45')
            ->assertJsonPath('consultation.message_page.has_older', true);

        $oldestId = $response->json('consultation.message_page.oldest_id');

        $this->getJson("/api/consultations/{$consultation->id}/messages?before_id={$oldestId}")
            ->assertOk()
            ->assertJsonCount(15, 'messages')
            ->assertJsonPath('messages.0.body', 'Message 1')
            ->assertJsonPath('messages.14.body', 'Message 15')
            ->assertJsonPath('meta.has_older', false);
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

    public function test_sender_can_unsend_message_without_deleting_conversation(): void
    {
        Storage::fake('local');
        [$motherUser, $mother] = $this->createMother();
        [$workerUser, $worker] = $this->createWorker();
        $worker->mothers()->attach($mother->id);
        $consultation = Consultation::create([
            'mother_id' => $mother->id,
            'health_worker_id' => $worker->id,
            'topic' => 'Prenatal Care',
            'subject' => 'Medicine question',
            'last_message_at' => now(),
        ]);

        Sanctum::actingAs($workerUser, ['health_worker']);

        $messageId = $this->post("/api/consultations/{$consultation->id}/messages", [
            'body' => 'Please review this private note.',
            'attachment' => UploadedFile::fake()->create('private-note.pdf', 12, 'application/pdf'),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->json('consultation_message.id');
        $message = $consultation->messages()->findOrFail($messageId);

        Sanctum::actingAs($motherUser, ['mother']);

        $this->patchJson("/api/consultations/{$consultation->id}/messages/{$messageId}/unsend")
            ->assertForbidden()
            ->assertJsonPath('message', 'You can only unsend your own messages.');

        Sanctum::actingAs($workerUser, ['health_worker']);

        $response = $this->patchJson("/api/consultations/{$consultation->id}/messages/{$messageId}/unsend")
            ->assertOk()
            ->assertJsonPath('message', 'Message unsent.')
            ->assertJsonPath('consultation_message.id', $messageId)
            ->assertJsonPath('consultation_message.body', 'This message was unsent.')
            ->assertJsonPath('consultation_message.attachment', null);

        $this->assertNotNull($response->json('consultation_message.unsent_at'));

        $this->assertDatabaseCount('consultations', 1);
        $this->assertDatabaseCount('consultation_messages', 1);
        $this->assertDatabaseHas('consultation_messages', [
            'id' => $messageId,
            'body' => 'This message was unsent.',
            'attachment_path' => null,
        ]);
        Storage::disk('local')->assertMissing($message->attachment_path);
    }

    public function test_consultation_video_call_signaling_between_participants(): void
    {
        [$motherUser, $mother] = $this->createMother();
        [$workerUser, $worker] = $this->createWorker();
        $worker->mothers()->attach($mother->id);
        $consultation = Consultation::create([
            'mother_id' => $mother->id,
            'health_worker_id' => $worker->id,
            'topic' => 'Prenatal Care',
            'subject' => 'Video check-in',
            'last_message_at' => now(),
        ]);

        Sanctum::actingAs($workerUser, ['health_worker']);

        $callId = $this->postJson("/api/consultations/{$consultation->id}/calls")
            ->assertCreated()
            ->assertJsonPath('call.status', 'ringing')
            ->assertJsonPath('call.caller_role', 'health_worker')
            ->assertJsonPath('call.receiver_role', 'mother')
            ->assertJsonPath('call.is_initiator', true)
            ->assertJsonStructure(['call' => ['call_id', 'conversation_id', 'created_at']])
            ->json('call.id');

        $this->postJson("/api/consultations/{$consultation->id}/calls/{$callId}/signals", [
            'type' => 'offer',
            'payload' => ['type' => 'offer', 'sdp' => 'fake-offer'],
        ])->assertCreated()
            ->assertJsonPath('signal.type', 'offer');

        Sanctum::actingAs($motherUser, ['mother']);

        $this->getJson("/api/consultations/{$consultation->id}/calls/active")
            ->assertOk()
            ->assertJsonPath('call.id', $callId)
            ->assertJsonPath('call.is_initiator', false);

        $this->getJson('/api/consultations/calls/active')
            ->assertOk()
            ->assertJsonPath('call.id', $callId)
            ->assertJsonPath('call.consultation_id', $consultation->id)
            ->assertJsonPath('call.is_initiator', false);

        $this->postJson("/api/consultations/{$consultation->id}/calls/{$callId}/accept")
            ->assertOk()
            ->assertJsonPath('call.status', 'accepted');

        $this->getJson("/api/consultations/{$consultation->id}/calls/{$callId}/signals")
            ->assertOk()
            ->assertJsonCount(1, 'signals')
            ->assertJsonPath('signals.0.type', 'offer')
            ->assertJsonPath('signals.0.payload.sdp', 'fake-offer');

        $this->postJson("/api/consultations/{$consultation->id}/calls/{$callId}/signals", [
            'type' => 'answer',
            'payload' => ['type' => 'answer', 'sdp' => 'fake-answer'],
        ])->assertCreated()
            ->assertJsonPath('signal.type', 'answer');

        Sanctum::actingAs($workerUser, ['health_worker']);

        $this->getJson("/api/consultations/{$consultation->id}/calls/{$callId}/signals")
            ->assertOk()
            ->assertJsonCount(1, 'signals')
            ->assertJsonPath('signals.0.type', 'answer')
            ->assertJsonPath('signals.0.payload.sdp', 'fake-answer');

        $this->postJson("/api/consultations/{$consultation->id}/calls/{$callId}/end")
            ->assertOk()
            ->assertJsonPath('call.status', 'ended');

        $this->assertDatabaseCount('consultation_calls', 1);
        $this->assertDatabaseCount('consultation_call_signals', 2);
    }

    public function test_receiver_can_decline_incoming_video_call_and_initiator_sees_declined_status(): void
    {
        [$motherUser, $mother] = $this->createMother();
        [$workerUser, $worker] = $this->createWorker();
        $worker->mothers()->attach($mother->id);
        $consultation = Consultation::create([
            'mother_id' => $mother->id,
            'health_worker_id' => $worker->id,
            'topic' => 'Prenatal Care',
            'subject' => 'Urgent video check',
            'last_message_at' => now(),
        ]);

        Sanctum::actingAs($workerUser, ['health_worker']);

        $callId = $this->postJson("/api/consultations/{$consultation->id}/calls")
            ->assertCreated()
            ->assertJsonPath('call.status', 'ringing')
            ->json('call.id');

        Sanctum::actingAs($motherUser, ['mother']);

        $this->getJson('/api/consultations/calls/active')
            ->assertOk()
            ->assertJsonPath('call.id', $callId)
            ->assertJsonPath('call.other_user.name', 'Nurse Linda Reyes');

        $this->postJson("/api/consultations/{$consultation->id}/calls/{$callId}/end")
            ->assertOk()
            ->assertJsonPath('message', 'Video call declined.')
            ->assertJsonPath('call.status', 'declined');

        Sanctum::actingAs($workerUser, ['health_worker']);

        $this->getJson("/api/consultations/{$consultation->id}/calls/{$callId}/signals")
            ->assertOk()
            ->assertJsonPath('call.status', 'declined');
    }

    public function test_initiator_can_cancel_ringing_video_call_and_receiver_sees_cancelled_status(): void
    {
        [$motherUser, $mother] = $this->createMother();
        [$workerUser, $worker] = $this->createWorker();
        $worker->mothers()->attach($mother->id);
        $consultation = Consultation::create([
            'mother_id' => $mother->id,
            'health_worker_id' => $worker->id,
            'topic' => 'Prenatal Care',
            'subject' => 'Cancelled video check',
            'last_message_at' => now(),
        ]);

        Sanctum::actingAs($workerUser, ['health_worker']);

        $callId = $this->postJson("/api/consultations/{$consultation->id}/calls")
            ->assertCreated()
            ->assertJsonPath('call.status', 'ringing')
            ->json('call.id');

        Sanctum::actingAs($motherUser, ['mother']);

        $this->getJson('/api/consultations/calls/active')
            ->assertOk()
            ->assertJsonPath('call.id', $callId)
            ->assertJsonPath('call.status', 'ringing');

        Sanctum::actingAs($workerUser, ['health_worker']);

        $this->postJson("/api/consultations/{$consultation->id}/calls/{$callId}/end")
            ->assertOk()
            ->assertJsonPath('message', 'Video call cancelled.')
            ->assertJsonPath('call.status', 'cancelled');

        Sanctum::actingAs($motherUser, ['mother']);

        $this->getJson("/api/consultations/{$consultation->id}/calls/{$callId}/signals")
            ->assertOk()
            ->assertJsonPath('call.status', 'cancelled');

        $this->getJson('/api/consultations/calls/active')
            ->assertOk()
            ->assertJsonPath('call', null);
    }

    public function test_late_video_call_signal_after_terminal_status_is_ignored(): void
    {
        [$motherUser, $mother] = $this->createMother();
        [$workerUser, $worker] = $this->createWorker();
        $worker->mothers()->attach($mother->id);
        $consultation = Consultation::create([
            'mother_id' => $mother->id,
            'health_worker_id' => $worker->id,
            'topic' => 'Prenatal Care',
            'subject' => 'Late ICE candidate',
            'last_message_at' => now(),
        ]);

        Sanctum::actingAs($workerUser, ['health_worker']);

        $callId = $this->postJson("/api/consultations/{$consultation->id}/calls")
            ->assertCreated()
            ->json('call.id');

        $this->postJson("/api/consultations/{$consultation->id}/calls/{$callId}/end")
            ->assertOk()
            ->assertJsonPath('call.status', 'cancelled');

        $this->postJson("/api/consultations/{$consultation->id}/calls/{$callId}/signals", [
            'type' => 'ice',
            'payload' => ['candidate' => 'candidate:late', 'sdpMid' => '0', 'sdpMLineIndex' => 0],
        ])->assertOk()
            ->assertJsonPath('ignored', true)
            ->assertJsonPath('call.status', 'cancelled');

        $this->assertDatabaseCount('consultation_call_signals', 0);
    }

    public function test_receiver_cannot_accept_cancelled_video_call(): void
    {
        [$motherUser, $mother] = $this->createMother();
        [$workerUser, $worker] = $this->createWorker();
        $worker->mothers()->attach($mother->id);
        $consultation = Consultation::create([
            'mother_id' => $mother->id,
            'health_worker_id' => $worker->id,
            'topic' => 'Prenatal Care',
            'subject' => 'Stale accept',
            'last_message_at' => now(),
        ]);

        Sanctum::actingAs($workerUser, ['health_worker']);

        $callId = $this->postJson("/api/consultations/{$consultation->id}/calls")
            ->assertCreated()
            ->json('call.id');

        $this->postJson("/api/consultations/{$consultation->id}/calls/{$callId}/end")
            ->assertOk()
            ->assertJsonPath('call.status', 'cancelled');

        Sanctum::actingAs($motherUser, ['mother']);

        $this->postJson("/api/consultations/{$consultation->id}/calls/{$callId}/accept")
            ->assertStatus(409)
            ->assertJsonPath('message', 'This video call is no longer available.')
            ->assertJsonPath('call.status', 'cancelled');
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
