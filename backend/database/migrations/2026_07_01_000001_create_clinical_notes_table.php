<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinical_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mother_id')->constrained('mothers')->cascadeOnDelete();
            $table->foreignId('author_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('body');
            $table->timestamps();

            $table->index(['mother_id', 'created_at']);
            $table->index(['author_user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinical_notes');
    }
};
