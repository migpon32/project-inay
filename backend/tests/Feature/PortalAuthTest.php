<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class PortalAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_one_account_can_have_mother_and_healthcare_worker_profiles(): void
    {
        $motherRegistration = $this->postJson('/api/register', [
            'name' => 'Nurse Mother',
            'email' => 'nurse.mother@example.com',
            'password' => 'password123',
            'role' => 'mother',
        ]);

        $motherRegistration
            ->assertCreated()
            ->assertJsonPath('active_portal', 'mother')
            ->assertJsonPath('user.mother.pregnancy_status', 'not_provided')
            ->assertJsonPath('user.healthcare_worker', null);

        $workerRegistration = $this->postJson('/api/register', [
            'name' => 'Nurse Mother',
            'email' => 'nurse.mother@example.com',
            'password' => 'password123',
            'role' => 'health_worker',
        ]);

        $workerRegistration
            ->assertCreated()
            ->assertJsonPath('active_portal', 'health_worker')
            ->assertJsonPath('user.mother.pregnancy_status', 'not_provided')
            ->assertJsonPath('user.healthcare_worker.profession', 'nurse');

        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('mothers', 1);
        $this->assertDatabaseCount('healthcare_workers', 1);
        $this->assertDatabaseHas('mothers', [
            'email' => 'nurse.mother@example.com',
        ]);
        $this->assertDatabaseHas('healthcare_workers', [
            'email' => 'nurse.mother@example.com',
        ]);

        $this->postJson('/api/login', [
            'email' => 'nurse.mother@example.com',
            'password' => 'password123',
            'portal' => 'mother',
        ])->assertOk()->assertJsonPath('active_portal', 'mother');

        $this->postJson('/api/login', [
            'email' => 'nurse.mother@example.com',
            'password' => 'password123',
            'portal' => 'health_worker',
        ])->assertOk()->assertJsonPath('active_portal', 'health_worker');
    }

    public function test_existing_email_requires_the_current_password_to_add_a_portal(): void
    {
        $this->postJson('/api/register', [
            'name' => 'Existing Mother',
            'email' => 'existing@example.com',
            'password' => 'password123',
            'role' => 'mother',
        ])->assertCreated();

        $this->postJson('/api/register', [
            'name' => 'Existing Mother',
            'email' => 'existing@example.com',
            'password' => 'wrong-password',
            'role' => 'health_worker',
        ])->assertStatus(422)
            ->assertJsonPath(
                'message',
                'This email already has an account. Enter its current password to add another portal.'
            );

        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('mothers', 1);
        $this->assertDatabaseCount('healthcare_workers', 0);
    }

    public function test_login_rejects_a_portal_not_connected_to_the_account(): void
    {
        $this->postJson('/api/register', [
            'name' => 'Mother Only',
            'email' => 'mother.only@example.com',
            'password' => 'password123',
            'role' => 'mother',
        ])->assertCreated();

        $this->postJson('/api/login', [
            'email' => 'mother.only@example.com',
            'password' => 'password123',
            'portal' => 'health_worker',
        ])->assertForbidden()
            ->assertJsonPath(
                'message',
                'No Program Staff portal is connected to this account. Register with this email and password to add it.'
            );
    }

    public function test_mother_registration_stores_only_san_pablo_barangays(): void
    {
        $this->postJson('/api/register', [
            'name' => 'Barangay Mother',
            'email' => 'barangay.mother@example.com',
            'password' => 'password123',
            'role' => 'mother',
            'barangay' => 'San Lucas 1 (Malinaw)',
        ])->assertCreated()
            ->assertJsonPath('user.mother.barangay', 'San Lucas 1 (Malinaw)');

        $this->assertDatabaseHas('mothers', [
            'email' => 'barangay.mother@example.com',
            'barangay' => 'San Lucas 1 (Malinaw)',
        ]);

        $this->postJson('/api/register', [
            'name' => 'Outside Mother',
            'email' => 'outside.mother@example.com',
            'password' => 'password123',
            'role' => 'mother',
            'barangay' => 'Calamba',
        ])->assertUnprocessable()
            ->assertJsonPath('errors.barangay.0', 'Barangay must be within San Pablo City, Laguna.');
    }

    public function test_mother_registration_stores_health_profile_details(): void
    {
        Carbon::setTestNow('2026-07-05 10:00:00');

        try {
            $this->postJson('/api/register', [
                'name' => 'Profile Mother',
                'email' => 'profile.mother@example.com',
                'password' => 'password123',
                'role' => 'mother',
                'barangay' => 'San Lucas 1 (Malinaw)',
                'age' => 28,
                'phone' => '09171234567',
                'blood_type' => 'O+',
                'pregnancy_status' => 'pregnant',
                'pregnancy_month' => 8,
            ])->assertCreated()
                ->assertJsonPath('user.mother.blood_type', 'O+')
                ->assertJsonPath('user.mother.pregnancy_status', 'pregnant')
                ->assertJsonPath('user.mother.pregnancy_month', 8)
                ->assertJsonPath('user.mother.pregnancy_week', 32);

            $this->assertDatabaseHas('mothers', [
                'email' => 'profile.mother@example.com',
                'birth_date' => '1998-07-05 00:00:00',
                'phone' => '09171234567',
                'blood_type' => 'O+',
                'pregnancy_status' => 'pregnant',
                'pregnancy_month' => 8,
                'pregnancy_week' => 32,
            ]);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_mother_contact_number_must_be_a_philippine_mobile_number(): void
    {
        $this->postJson('/api/register', [
            'name' => 'Invalid Phone Mother',
            'email' => 'invalid.phone.mother@example.com',
            'password' => 'password123',
            'role' => 'mother',
            'barangay' => 'San Lucas 1 (Malinaw)',
            'phone' => '12345',
        ])->assertUnprocessable()
            ->assertJsonPath(
                'errors.phone.0',
                'Contact number must be a Philippine mobile number like 09171234567 or +639171234567.'
            );
    }

    public function test_mother_email_must_be_unique_only_in_the_mothers_table(): void
    {
        $payload = [
            'name' => 'Mother Duplicate',
            'email' => 'duplicate.mother@example.com',
            'password' => 'password123',
            'role' => 'mother',
        ];

        $this->postJson('/api/register', $payload)->assertCreated();

        $this->postJson('/api/register', $payload)
            ->assertUnprocessable()
            ->assertJsonPath('errors.email.0', 'Email has already been used.');

        $this->assertDatabaseCount('mothers', 1);
        $this->assertDatabaseCount('healthcare_workers', 0);
    }

    public function test_healthcare_worker_email_must_be_unique_only_in_the_workers_table(): void
    {
        $payload = [
            'name' => 'Worker Duplicate',
            'email' => 'duplicate.worker@example.com',
            'password' => 'password123',
            'role' => 'health_worker',
        ];

        $this->postJson('/api/register', $payload)->assertCreated();

        $this->postJson('/api/register', $payload)
            ->assertUnprocessable()
            ->assertJsonPath('errors.email.0', 'Email has already been used.');

        $this->assertDatabaseCount('mothers', 0);
        $this->assertDatabaseCount('healthcare_workers', 1);
    }
}
