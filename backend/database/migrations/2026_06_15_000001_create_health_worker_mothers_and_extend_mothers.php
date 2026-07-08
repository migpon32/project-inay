<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mothers', function (Blueprint $table) {
            $table->date('birth_date')->nullable()->after('email');
            $table->string('phone')->nullable()->after('birth_date');
            $table->text('address')->nullable()->after('phone');
            $table->string('blood_type', 8)->nullable()->after('address');
            $table->unsignedTinyInteger('pregnancy_week')->nullable()->after('pregnancy_month');
            $table->unsignedTinyInteger('postpartum_week')->nullable()->after('pregnancy_week');
            $table->date('due_date')->nullable()->after('postpartum_week');
            $table->date('next_scheduled_visit')->nullable()->after('due_date');
            $table->decimal('last_weight_kg', 5, 2)->nullable()->after('next_scheduled_visit');
            $table->string('risk_rating', 16)->default('low')->after('last_weight_kg');
            $table->string('co_monitoring_person')->nullable()->after('risk_rating');
        });

        Schema::create('health_worker_mothers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('health_worker_id')
                ->constrained('healthcare_workers')
                ->cascadeOnDelete();
            $table->foreignId('mother_id')
                ->constrained('mothers')
                ->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['health_worker_id', 'mother_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('health_worker_mothers');

        Schema::table('mothers', function (Blueprint $table) {
            $table->dropColumn([
                'birth_date',
                'phone',
                'address',
                'blood_type',
                'pregnancy_week',
                'postpartum_week',
                'due_date',
                'next_scheduled_visit',
                'last_weight_kg',
                'risk_rating',
                'co_monitoring_person',
            ]);
        });
    }
};
