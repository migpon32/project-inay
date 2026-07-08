<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('children', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mother_id')->constrained('mothers')->cascadeOnDelete();
            $table->string('name');
            $table->string('sex', 16)->default('unspecified');
            $table->date('birth_date');
            $table->decimal('birth_weight_kg', 5, 2)->nullable();
            $table->decimal('birth_height_cm', 5, 2)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['mother_id', 'birth_date']);
        });

        Schema::create('child_growth_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('child_id')->constrained('children')->cascadeOnDelete();
            $table->unsignedSmallInteger('age_months');
            $table->decimal('weight_kg', 5, 2);
            $table->decimal('height_cm', 5, 2);
            $table->timestamp('recorded_at');
            $table->foreignId('recorded_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['child_id', 'age_months', 'recorded_at']);
        });

        Schema::create('child_immunizations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('child_id')->constrained('children')->cascadeOnDelete();
            $table->string('vaccine_key');
            $table->string('vaccine_name');
            $table->string('dose_label')->nullable();
            $table->unsignedSmallInteger('scheduled_for_age_days');
            $table->date('scheduled_at');
            $table->date('vaccinated_at')->nullable();
            $table->string('purpose');
            $table->string('side_effects')->nullable();
            $table->foreignId('recorded_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['child_id', 'vaccine_key']);
            $table->index(['child_id', 'scheduled_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('child_immunizations');
        Schema::dropIfExists('child_growth_records');
        Schema::dropIfExists('children');
    }
};
