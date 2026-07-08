<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        DB::table('health_worker_mothers')
            ->orderBy('id')
            ->each(function ($assignment) use ($now) {
                $exists = DB::table('consultations')
                    ->where('health_worker_id', $assignment->health_worker_id)
                    ->where('mother_id', $assignment->mother_id)
                    ->exists();

                if (!$exists) {
                    DB::table('consultations')->insert([
                        'health_worker_id' => $assignment->health_worker_id,
                        'mother_id' => $assignment->mother_id,
                        'topic' => 'General Care',
                        'subject' => 'Maternal care consultation',
                        'risk_level' => 'low',
                        'status' => 'open',
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            });
    }

    public function down(): void
    {
        DB::table('consultations')
            ->where('topic', 'General Care')
            ->where('subject', 'Maternal care consultation')
            ->whereNull('last_message_at')
            ->whereNotExists(function ($query) {
                $query->selectRaw('1')
                    ->from('consultation_messages')
                    ->whereColumn('consultation_messages.consultation_id', 'consultations.id');
            })
            ->delete();
    }
};
