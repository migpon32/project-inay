<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ChildHealthController;
use App\Http\Controllers\Api\ConsultationController;
use App\Http\Controllers\Api\HealthWorkerCasefilesController;
use App\Http\Controllers\Api\HealthServicesController;
use App\Http\Controllers\Api\IECController;
use App\Http\Controllers\Api\MaternalMonitoringController;
use Illuminate\Http\Request;

// Public routes
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::get('/test', fn() => response()->json(['message' => 'API Working']));

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', function (Request $request) {
        $user = $request->user();
        $user->load([
            'mother:id,user_id,email,birth_date,phone,address,barangay,pre_pregnancy_weight_kg,previous_deliveries,blood_type,pregnancy_status,pregnancy_month,pregnancy_week,postpartum_week,due_date,next_scheduled_visit,last_weight_kg,risk_rating,co_monitoring_person,profile_photo_path,latitude,longitude,location_accuracy,location_captured_at',
            'healthcareWorker:id,user_id,email,profession,license_number,facility_name,position_title,verification_status,verified_at',
        ]);

        if ($user->mother?->profile_photo_path) {
            $user->mother->setAttribute(
                'profile_photo_url',
                $request->getSchemeAndHttpHost() . '/storage/' . ltrim($user->mother->profile_photo_path, '/')
            );
        }

        return response()->json($user);
    });
    Route::post('/mother/profile-photo', [AuthController::class, 'updateMotherProfilePhoto']);

    // IEC Routes
    Route::controller(IECController::class)->prefix('iec')->group(function () {
        Route::get('/modules', 'getModules');
        Route::get('/module/{monthNumber}', 'getModule');
        Route::post('/module/{moduleId}/video-watched', 'markVideoWatched');
        Route::post('/module/{moduleId}/checklist', 'updateChecklist');
        Route::post('/module/{moduleId}/complete', 'completeModule');
        Route::post('/module/{moduleId}/upload-record', 'uploadRecord');
        Route::post('/module/{moduleId}/generate-certificate', 'generateCertificate');
        Route::get('/certificates', 'getUserCertificates');
        Route::get('/certificate/{certificateId}/download', 'downloadCertificate');
    });

    Route::controller(HealthWorkerCasefilesController::class)
        ->prefix('health-worker/casefiles')
        ->group(function () {
            Route::get('/', 'index');
            Route::get('/search', 'search');
            Route::get('/{mother}', 'show');
            Route::patch('/{mother}', 'update');
            Route::patch('/{mother}/schedule-visit', 'scheduleVisit');
            Route::get('/{mother}/export-pdf', 'exportPdf');
            Route::post('/{mother}/notes', 'storeNote');
            Route::patch('/{mother}/notes/{note}', 'updateNote');
            Route::post('/', 'store');
            Route::delete('/{mother}', 'destroy');
        });

    Route::controller(ConsultationController::class)
        ->prefix('consultations')
        ->group(function () {
            Route::get('/', 'index');
            Route::get('/unread-count', 'unreadCount');
            Route::get('/workers', 'workers');
            Route::get('/iec-resources', 'iecResources');
            Route::get('/messages/{message}/attachment', 'attachment');
            Route::post('/', 'store');
            Route::get('/{consultation}', 'show');
            Route::post('/{consultation}/messages', 'sendMessage');
            Route::patch('/{consultation}', 'update');
        });

    Route::controller(MaternalMonitoringController::class)
        ->prefix('maternal-monitoring')
        ->group(function () {
            Route::get('/status', 'status');
            Route::get('/me', 'me');
            Route::post('/entries', 'storeOwnEntry');
        });

    Route::controller(ChildHealthController::class)
        ->prefix('child-health')
        ->group(function () {
            Route::get('/children', 'index');
            Route::post('/children', 'storeChild');
            Route::post('/children/{child}/profile-photo', 'updateOwnChildPhoto');
        });

    Route::controller(ChildHealthController::class)->group(function () {
        Route::get('/children/{child}/growth', 'showGrowthRecords');
        Route::post('/children/{child}/growth', 'storeGrowthRecord');
        Route::put('/growth-records/{record}', 'updateGrowthRecord');
    });

    Route::get('/health-services/nearby', [HealthServicesController::class, 'nearby']);

    Route::controller(MaternalMonitoringController::class)
        ->prefix('health-worker/maternal-monitoring')
        ->group(function () {
            Route::get('/', 'desk');
            Route::get('/export-pdf', 'exportPdf');
            Route::get('/{mother}', 'showMother');
            Route::post('/{mother}/entries', 'storeMotherEntry');
        });

    Route::controller(ChildHealthController::class)
        ->prefix('health-worker/child-health')
        ->group(function () {
            Route::get('/{mother}', 'showMotherChildren');
            Route::post('/{mother}/children', 'storeChildForMother');
            Route::post('/children/{child}/profile-photo', 'updateWorkerChildPhoto');
            Route::post('/children/{child}/growth-records', 'storeWorkerGrowthRecord');
            Route::patch('/children/{child}/immunizations/{immunization}', 'updateWorkerImmunization');
        });
});
