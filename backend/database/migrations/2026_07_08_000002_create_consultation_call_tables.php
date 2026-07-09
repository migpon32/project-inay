<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('consultation_calls', function (Blueprint $table) {
            $table->id();
            $table->foreignId('consultation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('initiator_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('receiver_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('status', 24)->default('ringing');
            $table->timestamp('started_at')->nullable();
            $table->timestamp('answered_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index(['consultation_id', 'status', 'updated_at']);
            $table->index(['initiator_user_id', 'status']);
            $table->index(['receiver_user_id', 'status']);
        });

        Schema::create('consultation_call_signals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('consultation_call_id')->constrained('consultation_calls')->cascadeOnDelete();
            $table->foreignId('sender_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('type', 24);
            $table->json('payload');
            $table->timestamps();

            $table->index(['consultation_call_id', 'id']);
            $table->index(['sender_user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('consultation_call_signals');
        Schema::dropIfExists('consultation_calls');
    }
};
