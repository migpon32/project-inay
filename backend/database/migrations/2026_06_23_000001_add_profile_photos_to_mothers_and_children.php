<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mothers', function (Blueprint $table) {
            $table->string('profile_photo_path')->nullable()->after('co_monitoring_person');
        });

        Schema::table('children', function (Blueprint $table) {
            $table->string('profile_photo_path')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('children', function (Blueprint $table) {
            $table->dropColumn('profile_photo_path');
        });

        Schema::table('mothers', function (Blueprint $table) {
            $table->dropColumn('profile_photo_path');
        });
    }
};
