<?php
// database/migrations/2026_06_12_000001_create_iec_modules_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Main IEC modules by trimester
        Schema::create('iec_modules', function (Blueprint $table) {
            $table->id();
            $table->string('trimester'); // 1st, 2nd, 3rd
            $table->integer('month_number'); // 1-10
            $table->string('title');
            $table->string('week_range'); // e.g., "Weeks 1-4"
            $table->text('baby_development');
            $table->text('mother_changes');
            $table->text('expected_symptoms')->nullable();
            $table->text('nutritional_guidance');
            $table->json('daily_intake')->nullable(); // {calcium: "1200mg", hydration: "3L"}
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        // Educational videos
        Schema::create('iec_videos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('iec_module_id')->constrained()->onDelete('cascade');
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('video_url'); // YouTube/Vimeo link or local path
            $table->string('thumbnail_url')->nullable();
            $table->integer('duration_minutes'); // in minutes
            $table->string('category'); // e.g., "Prenatal Care", "Nutrition", "Warning Signs"
            $table->boolean('is_required')->default(true);
            $table->timestamps();
        });

        // Risk alerts/warnings
        Schema::create('iec_risk_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('iec_module_id')->constrained()->onDelete('cascade');
            $table->string('title');
            $table->text('consequence');
            $table->text('recommendation');
            $table->string('severity'); // high, medium, low
            $table->timestamps();
        });

        // Infographics
        Schema::create('iec_infographics', function (Blueprint $table) {
            $table->id();
            $table->foreignId('iec_module_id')->constrained()->onDelete('cascade');
            $table->string('title');
            $table->string('file_path');
            $table->string('file_size'); // e.g., "1.4 MB"
            $table->string('format'); // PDF, PNG, etc.
            $table->timestamps();
        });

        // User progress tracking
        Schema::create('user_iec_progress', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->foreignId('iec_module_id')->constrained()->onDelete('cascade');
            $table->boolean('is_completed')->default(false);
            $table->timestamp('completed_at')->nullable();
            $table->json('watched_videos')->nullable(); // Store video IDs watched
            $table->json('checklist_items')->nullable(); // Store checklist completion
            $table->timestamps();
        });

        // Medical checkup records
        Schema::create('user_checkup_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->foreignId('iec_module_id')->constrained()->onDelete('cascade');
            $table->string('record_type'); // checkup, prescription, lab_result, ultrasound
            $table->string('file_path');
            $table->string('original_filename');
            $table->text('notes')->nullable();
            $table->timestamp('record_date');
            $table->boolean('is_verified')->default(false);
            $table->timestamp('verified_at')->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users');
            $table->timestamps();
        });

        // Prenatal certificates
        Schema::create('user_prenatal_certificates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->foreignId('iec_module_id')->constrained()->onDelete('cascade');
            $table->string('certificate_number')->unique();
            $table->string('file_path');
            $table->timestamp('issued_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_prenatal_certificates');
        Schema::dropIfExists('user_checkup_records');
        Schema::dropIfExists('user_iec_progress');
        Schema::dropIfExists('iec_infographics');
        Schema::dropIfExists('iec_risk_alerts');
        Schema::dropIfExists('iec_videos');
        Schema::dropIfExists('iec_modules');
    }
};