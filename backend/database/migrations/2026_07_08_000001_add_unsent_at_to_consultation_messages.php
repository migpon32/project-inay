<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('consultation_messages', function (Blueprint $table) {
            $table->timestamp('unsent_at')->nullable()->after('read_at');
        });
    }

    public function down(): void
    {
        Schema::table('consultation_messages', function (Blueprint $table) {
            $table->dropColumn('unsent_at');
        });
    }
};
