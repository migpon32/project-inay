<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique('users_email_unique');
        });

        $this->splitSharedPortalUsers();

        Schema::table('users', function (Blueprint $table) {
            $table->unique(['email', 'role'], 'users_email_role_unique');
        });

        Schema::table('consultation_messages', function (Blueprint $table) {
            $table->string('sender_role', 32)->nullable()->after('sender_user_id');
            $table->foreignId('receiver_user_id')
                ->nullable()
                ->after('sender_role')
                ->constrained('users')
                ->nullOnDelete();
            $table->string('receiver_role', 32)->nullable()->after('receiver_user_id');

            $table->index(['sender_user_id', 'sender_role', 'created_at'], 'consultation_messages_sender_identity_idx');
            $table->index(['receiver_user_id', 'receiver_role', 'created_at'], 'consultation_messages_receiver_identity_idx');
        });

        $this->backfillMessageIdentities();
    }

    public function down(): void
    {
        Schema::table('consultation_messages', function (Blueprint $table) {
            $table->dropIndex('consultation_messages_sender_identity_idx');
            $table->dropIndex('consultation_messages_receiver_identity_idx');
            $table->dropConstrainedForeignId('receiver_user_id');
            $table->dropColumn(['sender_role', 'receiver_role']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique('users_email_role_unique');
            $table->unique('email', 'users_email_unique');
        });
    }

    private function splitSharedPortalUsers(): void
    {
        $now = now();

        $sharedUsers = DB::table('users')
            ->join('mothers', 'mothers.user_id', '=', 'users.id')
            ->join('healthcare_workers', 'healthcare_workers.user_id', '=', 'users.id')
            ->select([
                'users.id',
                'users.name',
                'users.email',
                'users.email_verified_at',
                'users.password',
                'users.role',
                'mothers.id as mother_id',
                'healthcare_workers.id as worker_id',
            ])
            ->orderBy('users.id')
            ->get();

        foreach ($sharedUsers as $user) {
            if ($user->role === 'health_worker') {
                $newMotherUserId = DB::table('users')->insertGetId([
                    'name' => $user->name,
                    'email' => $user->email,
                    'email_verified_at' => $user->email_verified_at,
                    'password' => $user->password,
                    'role' => 'mother',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                DB::table('mothers')
                    ->where('id', $user->mother_id)
                    ->update([
                        'user_id' => $newMotherUserId,
                        'updated_at' => $now,
                    ]);

                continue;
            }

            $newWorkerUserId = DB::table('users')->insertGetId([
                'name' => $user->name,
                'email' => $user->email,
                'email_verified_at' => $user->email_verified_at,
                'password' => $user->password,
                'role' => 'health_worker',
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            DB::table('healthcare_workers')
                ->where('id', $user->worker_id)
                ->update([
                    'user_id' => $newWorkerUserId,
                    'updated_at' => $now,
                ]);
        }
    }

    private function backfillMessageIdentities(): void
    {
        $messages = DB::table('consultation_messages')
            ->join('consultations', 'consultations.id', '=', 'consultation_messages.consultation_id')
            ->join('mothers', 'mothers.id', '=', 'consultations.mother_id')
            ->join('healthcare_workers', 'healthcare_workers.id', '=', 'consultations.health_worker_id')
            ->leftJoin('users', 'users.id', '=', 'consultation_messages.sender_user_id')
            ->select([
                'consultation_messages.id',
                'consultation_messages.sender_user_id',
                'mothers.user_id as mother_user_id',
                'healthcare_workers.user_id as worker_user_id',
                'users.role as user_role',
            ])
            ->orderBy('consultation_messages.id')
            ->get();

        foreach ($messages as $message) {
            $senderRole = $message->user_role;
            $receiverUserId = null;
            $receiverRole = null;

            if ((int) $message->sender_user_id === (int) $message->mother_user_id) {
                $senderRole = 'mother';
                $receiverUserId = $message->worker_user_id;
                $receiverRole = 'health_worker';
            } elseif ((int) $message->sender_user_id === (int) $message->worker_user_id) {
                $senderRole = 'health_worker';
                $receiverUserId = $message->mother_user_id;
                $receiverRole = 'mother';
            }

            DB::table('consultation_messages')
                ->where('id', $message->id)
                ->update([
                    'sender_role' => $senderRole,
                    'receiver_user_id' => $receiverUserId,
                    'receiver_role' => $receiverRole,
                ]);
        }
    }
};
