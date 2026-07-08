<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

        $user = User::firstOrCreate(
            ['email' => 'test@example.com'],
            [
                'name' => 'Test User',
                'password' => Hash::make('password'),
                'role' => 'mother',
            ]
        );

        if ($user->role === 'health_worker') {
            $user->healthcareWorker()->firstOrCreate([], [
                'email' => $user->email,
                'profession' => 'nurse',
                'verification_status' => 'pending',
            ]);
        } else {
            $user->mother()->firstOrCreate([], [
                'email' => $user->email,
                'pregnancy_status' => 'not_provided',
            ]);
        }

        $this->call(IECModuleSeeder::class);
    }
}
