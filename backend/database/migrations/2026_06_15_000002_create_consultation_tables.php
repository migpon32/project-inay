<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('consultations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mother_id')->constrained('mothers')->cascadeOnDelete();
            $table->foreignId('health_worker_id')->constrained('healthcare_workers')->cascadeOnDelete();
            $table->string('topic', 64);
            $table->string('subject');
            $table->string('risk_level', 16)->default('low');
            $table->string('status', 16)->default('open');
            $table->text('outcome')->nullable();
            $table->timestamp('last_message_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('escalated_at')->nullable();
            $table->timestamps();

            $table->index(['health_worker_id', 'status', 'last_message_at']);
            $table->index(['mother_id', 'status', 'last_message_at']);
        });

        Schema::create('consultation_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('consultation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sender_user_id')->constrained('users')->cascadeOnDelete();
            $table->text('body')->nullable();
            $table->string('attachment_path')->nullable();
            $table->string('attachment_name')->nullable();
            $table->string('attachment_type')->nullable();
            $table->unsignedBigInteger('attachment_size')->nullable();
            $table->foreignId('iec_video_id')->nullable()->constrained('iec_videos')->nullOnDelete();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['consultation_id', 'created_at']);
            $table->index(['sender_user_id', 'read_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('consultation_messages');
        Schema::dropIfExists('consultations');
    }
};
