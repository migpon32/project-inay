<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mothers', function (Blueprint $table) {
            $table->index(['user_id', 'risk_rating'], 'mothers_user_risk_idx');
            $table->index('next_scheduled_visit', 'mothers_next_visit_idx');
        });

        Schema::table('iec_modules', function (Blueprint $table) {
            $table->index(['is_active', 'month_number'], 'iec_modules_active_month_idx');
        });

        Schema::table('iec_videos', function (Blueprint $table) {
            $table->index(['iec_module_id', 'created_at'], 'iec_videos_module_created_idx');
        });

        Schema::table('user_iec_progress', function (Blueprint $table) {
            $table->index(['user_id', 'iec_module_id'], 'user_iec_progress_user_module_idx');
        });

        Schema::table('user_checkup_records', function (Blueprint $table) {
            $table->index(['user_id', 'iec_module_id', 'record_type'], 'user_checkup_records_user_module_type_idx');
        });

        Schema::table('consultation_messages', function (Blueprint $table) {
            $table->index(['consultation_id', 'read_at', 'sender_user_id'], 'consultation_messages_thread_read_sender_idx');
        });
    }

    public function down(): void
    {
        Schema::table('consultation_messages', function (Blueprint $table) {
            $table->dropIndex('consultation_messages_thread_read_sender_idx');
        });

        Schema::table('user_checkup_records', function (Blueprint $table) {
            $table->dropIndex('user_checkup_records_user_module_type_idx');
        });

        Schema::table('user_iec_progress', function (Blueprint $table) {
            $table->dropIndex('user_iec_progress_user_module_idx');
        });

        Schema::table('iec_videos', function (Blueprint $table) {
            $table->dropIndex('iec_videos_module_created_idx');
        });

        Schema::table('iec_modules', function (Blueprint $table) {
            $table->dropIndex('iec_modules_active_month_idx');
        });

        Schema::table('mothers', function (Blueprint $table) {
            $table->dropIndex('mothers_user_risk_idx');
            $table->dropIndex('mothers_next_visit_idx');
        });
    }
};
