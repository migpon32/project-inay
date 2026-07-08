<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('growth_records')) {
            Schema::create('growth_records', function (Blueprint $table) {
                $table->id();
                $table->foreignId('child_id')->constrained('children')->cascadeOnDelete();
                $table->unsignedSmallInteger('age_month');
                $table->decimal('weight', 5, 2);
                $table->decimal('height', 5, 2);
                $table->foreignId('recorded_by')->nullable()->constrained('healthcare_workers')->nullOnDelete();
                $table->timestamp('recorded_at');
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->unique(['child_id', 'age_month']);
                $table->index(['child_id', 'recorded_at']);
            });

            if (Schema::hasTable('child_growth_records')) {
                DB::table('child_growth_records')
                    ->orderBy('recorded_at')
                    ->orderBy('id')
                    ->get()
                    ->each(function (object $record): void {
                        $workerId = $record->recorded_by_user_id
                            ? DB::table('healthcare_workers')->where('user_id', $record->recorded_by_user_id)->value('id')
                            : null;

                        DB::table('growth_records')->updateOrInsert(
                            [
                                'child_id' => $record->child_id,
                                'age_month' => $record->age_months,
                            ],
                            [
                                'weight' => $record->weight_kg,
                                'height' => $record->height_cm,
                                'recorded_by' => $workerId,
                                'recorded_at' => $record->recorded_at,
                                'notes' => $record->notes,
                                'created_at' => $record->created_at,
                                'updated_at' => $record->updated_at,
                            ],
                        );
                    });
            }
        }

        if (!Schema::hasTable('growth_record_audits')) {
            Schema::create('growth_record_audits', function (Blueprint $table) {
                $table->id();
                $table->foreignId('growth_record_id')->nullable()->constrained('growth_records')->nullOnDelete();
                $table->foreignId('child_id')->constrained('children')->cascadeOnDelete();
                $table->foreignId('healthcare_worker_id')->nullable()->constrained('healthcare_workers')->nullOnDelete();
                $table->foreignId('recorded_by_user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('healthcare_worker_name')->nullable();
                $table->unsignedSmallInteger('age_month');
                $table->decimal('previous_weight', 5, 2)->nullable();
                $table->decimal('new_weight', 5, 2);
                $table->decimal('previous_height', 5, 2)->nullable();
                $table->decimal('new_height', 5, 2);
                $table->timestamp('recorded_at');
                $table->timestamps();

                $table->index(['child_id', 'recorded_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('growth_record_audits');
        Schema::dropIfExists('growth_records');
    }
};
