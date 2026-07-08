<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mothers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('pregnancy_status')->default('not_provided');
            $table->unsignedTinyInteger('pregnancy_month')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->unsignedInteger('location_accuracy')->nullable();
            $table->timestamp('location_captured_at')->nullable();
            $table->timestamps();
        });

        Schema::create('healthcare_workers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('profession')->default('nurse');
            $table->string('license_number')->nullable()->unique();
            $table->string('facility_name')->nullable();
            $table->string('position_title')->nullable();
            $table->string('verification_status')->default('pending');
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();
        });

        $now = now();

        DB::table('users')
            ->where('role', 'health_worker')
            ->orderBy('id')
            ->each(function ($user) use ($now) {
                DB::table('healthcare_workers')->insert([
                    'user_id' => $user->id,
                    'profession' => 'nurse',
                    'verification_status' => 'pending',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            });

        DB::table('users')
            ->where('role', '!=', 'health_worker')
            ->orderBy('id')
            ->each(function ($user) use ($now) {
                DB::table('mothers')->insert([
                    'user_id' => $user->id,
                    'pregnancy_status' => 'not_provided',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('healthcare_workers');
        Schema::dropIfExists('mothers');
    }
};
