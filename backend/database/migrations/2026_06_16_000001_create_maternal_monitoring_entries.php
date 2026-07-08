<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mothers', function (Blueprint $table) {
            $table->string('barangay')->nullable()->after('address');
            $table->decimal('pre_pregnancy_weight_kg', 5, 2)->nullable()->after('barangay');
            $table->unsignedTinyInteger('previous_deliveries')->nullable()->after('pre_pregnancy_weight_kg');
        });

        Schema::create('maternal_monitoring_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mother_id')->constrained('mothers')->cascadeOnDelete();
            $table->foreignId('recorded_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedTinyInteger('pregnancy_week');
            $table->unsignedSmallInteger('systolic_bp')->nullable();
            $table->unsignedSmallInteger('diastolic_bp')->nullable();
            $table->decimal('blood_sugar_mgdl', 6, 2)->nullable();
            $table->decimal('body_temperature_c', 4, 1)->nullable();
            $table->unsignedSmallInteger('heart_rate')->nullable();
            $table->decimal('weight_kg', 5, 2)->nullable();
            $table->decimal('hemoglobin_gdl', 4, 1)->nullable();
            $table->string('risk_level', 16)->default('low');
            $table->text('notes')->nullable();
            $table->timestamp('recorded_at');
            $table->timestamps();

            $table->index(['mother_id', 'recorded_at']);
            $table->index(['risk_level', 'recorded_at']);
        });

        $now = now();

        DB::table('mothers')
            ->orderBy('id')
            ->each(function ($mother) use ($now) {
                DB::table('mothers')
                    ->where('id', $mother->id)
                    ->update([
                        'pre_pregnancy_weight_kg' => $mother->pre_pregnancy_weight_kg ?? 62,
                        'barangay' => $mother->barangay ?? 'San Lucas',
                    ]);

                DB::table('maternal_monitoring_entries')->insert([
                    'mother_id' => $mother->id,
                    'recorded_by_user_id' => $mother->user_id,
                    'pregnancy_week' => $mother->pregnancy_week ?? (($mother->pregnancy_month ?? 8) * 4),
                    'systolic_bp' => 120,
                    'diastolic_bp' => 80,
                    'blood_sugar_mgdl' => 95,
                    'body_temperature_c' => 36.7,
                    'heart_rate' => 86,
                    'weight_kg' => $mother->last_weight_kg ?? 74,
                    'hemoglobin_gdl' => 12.5,
                    'risk_level' => $mother->risk_rating ?? 'low',
                    'notes' => 'Initial maternal monitoring baseline.',
                    'recorded_at' => $now,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('maternal_monitoring_entries');

        Schema::table('mothers', function (Blueprint $table) {
            $table->dropColumn([
                'barangay',
                'pre_pregnancy_weight_kg',
                'previous_deliveries',
            ]);
        });
    }
};
