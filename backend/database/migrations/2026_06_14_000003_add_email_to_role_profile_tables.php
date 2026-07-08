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
            $table->string('email')->nullable()->after('user_id');
        });

        Schema::table('healthcare_workers', function (Blueprint $table) {
            $table->string('email')->nullable()->after('user_id');
        });

        DB::table('mothers')
            ->orderBy('id')
            ->each(function ($mother) {
                DB::table('mothers')
                    ->where('id', $mother->id)
                    ->update([
                        'email' => DB::table('users')
                            ->where('id', $mother->user_id)
                            ->value('email'),
                    ]);
            });

        DB::table('healthcare_workers')
            ->orderBy('id')
            ->each(function ($worker) {
                DB::table('healthcare_workers')
                    ->where('id', $worker->id)
                    ->update([
                        'email' => DB::table('users')
                            ->where('id', $worker->user_id)
                            ->value('email'),
                    ]);
            });

        Schema::table('mothers', function (Blueprint $table) {
            $table->unique('email');
        });

        Schema::table('healthcare_workers', function (Blueprint $table) {
            $table->unique('email');
        });
    }

    public function down(): void
    {
        Schema::table('mothers', function (Blueprint $table) {
            $table->dropUnique('mothers_email_unique');
            $table->dropColumn('email');
        });

        Schema::table('healthcare_workers', function (Blueprint $table) {
            $table->dropUnique('healthcare_workers_email_unique');
            $table->dropColumn('email');
        });
    }
};
