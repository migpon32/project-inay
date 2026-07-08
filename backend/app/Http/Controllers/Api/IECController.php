<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\IECModule;
use App\Models\UserIECProgress;
use App\Models\UserCheckupRecord;
use App\Models\UserPrenatalCertificate;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Carbon\Carbon;

class IECController extends Controller
{
    // Get all modules with user progress
    public function getModules()
    {
        $user = auth()->user();

        return response()->json(Cache::remember(
            "iec:modules:user:{$user->id}",
            now()->addSeconds(60),
            function () use ($user) {
                $modules = IECModule::with(['videos', 'riskAlerts', 'infographics'])
                    ->where('is_active', true)
                    ->orderBy('month_number')
                    ->get();
                $moduleIds = $modules->pluck('id');
                $progressByModule = UserIECProgress::where('user_id', $user->id)
                    ->whereIn('iec_module_id', $moduleIds)
                    ->get()
                    ->keyBy('iec_module_id');
                $recordsByModule = UserCheckupRecord::where('user_id', $user->id)
                    ->whereIn('iec_module_id', $moduleIds)
                    ->get(['iec_module_id', 'record_type'])
                    ->groupBy('iec_module_id');

                $modules = $modules
                    ->map(function ($module) use ($progressByModule, $recordsByModule) {
                        $progress = $progressByModule->get($module->id);
                        $records = $recordsByModule->get($module->id, collect());
                        $uploadedTypes = $records
                            ->whereIn('record_type', ['checkup', 'prescription'])
                            ->pluck('record_type')
                            ->unique()
                            ->all();

                        $module->is_completed = $progress ? $progress->is_completed : false;
                        $module->completed_at = $progress ? $progress->completed_at : null;
                        $module->watched_videos = $progress ? ($progress->watched_videos ?? []) : [];
                        $module->checklist_items = $progress ? ($progress->checklist_items ?? $this->defaultChecklist()) : $this->defaultChecklist();
                        $module->document_requirements = [
                            'checkup' => in_array('checkup', $uploadedTypes, true),
                            'prescription' => in_array('prescription', $uploadedTypes, true),
                        ];
                        $module->uploaded_records_count = $records->count();

                        return $module;
                    });

                $completedCount = UserIECProgress::where('user_id', $user->id)
                    ->where('is_completed', true)
                    ->whereHas('module', fn ($query) => $query->where('is_active', true))
                    ->count();

                return [
                    'modules' => $modules,
                    'completed_months' => $completedCount,
                    'total_months' => 10,
                ];
            }
        ));
    }
    
    // Get single module details
    public function getModule($monthNumber)
    {
        $user = auth()->user();

        return response()->json(Cache::remember(
            "iec:module:user:{$user->id}:month:{$monthNumber}",
            now()->addSeconds(60),
            function () use ($user, $monthNumber) {
                $module = IECModule::with(['videos', 'riskAlerts', 'infographics'])
                    ->where('is_active', true)
                    ->where('month_number', $monthNumber)
                    ->firstOrFail();

                $progress = UserIECProgress::where('user_id', $user->id)
                    ->where('iec_module_id', $module->id)
                    ->first();

                $module->is_completed = $progress ? $progress->is_completed : false;
                $module->completed_at = $progress ? $progress->completed_at : null;
                $module->watched_videos = $progress ? ($progress->watched_videos ?? []) : [];
                $module->checklist_items = $progress ? ($progress->checklist_items ?? $this->defaultChecklist()) : $this->defaultChecklist();
                $module->document_requirements = $this->documentRequirementStatus($user->id, $module->id);
                $module->uploaded_records_count = UserCheckupRecord::where('user_id', $user->id)
                    ->where('iec_module_id', $module->id)
                    ->count();

                $records = UserCheckupRecord::where('user_id', $user->id)
                    ->where('iec_module_id', $module->id)
                    ->latest()
                    ->get([
                        'id',
                        'user_id',
                        'iec_module_id',
                        'record_type',
                        'file_path',
                        'original_filename',
                        'notes',
                        'record_date',
                        'is_verified',
                        'verified_at',
                        'created_at',
                    ]);

                return [
                    'module' => $module,
                    'uploaded_records' => $records,
                ];
            }
        ));
    }
    
    // Mark video as watched
    public function markVideoWatched(Request $request, $moduleId)
    {
        $request->validate([
            'video_id' => 'required|exists:iec_videos,id'
        ]);
        
        $user = auth()->user();
        $module = IECModule::findOrFail($moduleId);

        if (!$module->videos()->whereKey($request->video_id)->exists()) {
            return response()->json([
                'message' => 'This video does not belong to the selected IEC module.'
            ], 422);
        }
        
        $progress = UserIECProgress::firstOrCreate([
            'user_id' => $user->id,
            'iec_module_id' => $moduleId
        ], [
            'watched_videos' => [],
            'checklist_items' => $this->defaultChecklist(),
        ]);
        
        $watchedVideos = $progress->watched_videos ?? [];
        
        if (!in_array($request->video_id, $watchedVideos)) {
            $watchedVideos[] = $request->video_id;
            $progress->watched_videos = $watchedVideos;
            $progress->save();
        }
        $this->forgetUserIecCache($user->id, $module);
        
        return response()->json(['message' => 'Video marked as watched']);
    }
    
    // Update checklist items
    public function updateChecklist(Request $request, $moduleId)
    {
        $request->validate([
            'checklist_items' => 'required|array'
        ]);
        
        $user = auth()->user();
        
        $progress = UserIECProgress::firstOrCreate([
            'user_id' => $user->id,
            'iec_module_id' => $moduleId
        ], [
            'watched_videos' => [],
            'checklist_items' => $this->defaultChecklist(),
        ]);
        
        $progress->checklist_items = array_merge(
            $this->defaultChecklist(),
            $request->checklist_items
        );
        $progress->save();
        $this->forgetUserIecCache($user->id, $moduleId);
        
        return response()->json(['message' => 'Checklist updated']);
    }
    
    // Complete module
    public function completeModule($moduleId)
    {
        $user = auth()->user();
        $module = IECModule::with('videos')->findOrFail($moduleId);
        
        $progress = UserIECProgress::firstOrCreate([
            'user_id' => $user->id,
            'iec_module_id' => $moduleId
        ], [
            'watched_videos' => [],
            'checklist_items' => $this->defaultChecklist(),
        ]);

        $checklistItems = $progress->checklist_items ?? [];
        $archivedVideos = $checklistItems['archived_videos'] ?? [];

        if (!$this->allRequiredVideosWatched($module->videos, $progress->watched_videos ?? [], $archivedVideos)) {
            return response()->json([
                'message' => 'Please watch all required videos before completing this month.'
            ], 400);
        }

        if (!$this->hasRequiredDocuments($user->id, $moduleId)) {
            return response()->json([
                'message' => 'Please upload both a checkup record and prescription before completing this month.'
            ], 400);
        }
        
        $progress->is_completed = true;
        $progress->completed_at = now();
        $progress->save();
        $this->forgetUserIecCache($user->id, $module);
        
        return response()->json(['message' => 'Module completed!']);
    }
    
    // Upload checkup record
    public function uploadRecord(Request $request, $moduleId)
    {
        $request->validate([
            'record_type' => 'required|in:checkup,prescription,lab_result,ultrasound',
            'file' => 'required|file|mimes:pdf,jpg,jpeg,png|max:5120',
            'record_date' => 'required|date'
        ]);
        
        $user = auth()->user();
        $module = IECModule::findOrFail($moduleId);
        
        $file = $request->file('file');
        $filename = time() . '_' . $user->id . '_' . $file->getClientOriginalName();
        $path = $file->storeAs('checkup_records', $filename, 'public');
        
        $record = UserCheckupRecord::create([
            'user_id' => $user->id,
            'iec_module_id' => $moduleId,
            'record_type' => $request->record_type,
            'file_path' => $path,
            'original_filename' => $file->getClientOriginalName(),
            'notes' => $request->notes,
            'record_date' => $request->record_date
        ]);
        $this->forgetUserIecCache($user->id, $module);
        
        return response()->json([
            'message' => 'Record uploaded successfully',
            'record' => $record
        ]);
    }
    
    // Generate prenatal certificate
    public function generateCertificate($moduleId)
    {
        $user = auth()->user();

        $module = IECModule::with('videos')->findOrFail($moduleId);

        $progress = UserIECProgress::firstOrCreate([
            'user_id' => $user->id,
            'iec_module_id' => $moduleId
        ], [
            'watched_videos' => [],
            'checklist_items' => $this->defaultChecklist(),
        ]);

        $checklistItems = $progress->checklist_items ?? [];
        $archivedVideos = $checklistItems['archived_videos'] ?? [];

        if (!$this->allRequiredVideosWatched($module->videos, $progress->watched_videos ?? [], $archivedVideos)) {
            return response()->json([
                'message' => 'Please watch all required videos before generating a certificate.'
            ], 400);
        }

        if (!$this->hasRequiredDocuments($user->id, $moduleId)) {
            return response()->json([
                'message' => 'Please upload both a checkup record and prescription before generating a certificate.'
            ], 400);
        }

        if (!$progress->is_completed) {
            $progress->is_completed = true;
            $progress->completed_at = now();
            $progress->save();
        }
        $this->forgetUserIecCache($user->id, $module);
        
        // Check if certificate already exists
        $existingCert = UserPrenatalCertificate::where('user_id', $user->id)
            ->where('iec_module_id', $moduleId)
            ->first();
        
        if ($existingCert) {
            return response()->json([
                'message' => 'Certificate already generated',
                'certificate' => $existingCert
            ]);
        }
        
        // Generate certificate HTML for PDF
        $certNumber = 'PRENATAL-' . date('Y') . '-' . str_pad($user->id, 4, '0', STR_PAD_LEFT) . '-' . $moduleId;
        
        // Store certificate info
        $certificate = UserPrenatalCertificate::create([
            'user_id' => $user->id,
            'iec_module_id' => $moduleId,
            'certificate_number' => $certNumber,
            'file_path' => 'pending_generation',
            'issued_at' => now()
        ]);
        $this->forgetUserIecCache($user->id, $module);
        
        return response()->json([
            'message' => 'Certificate generated successfully',
            'certificate' => [
                'certificate_number' => $certNumber,
                'user_name' => $user->name,
                'module_title' => $module->title,
                'issued_at' => now()->format('F d, Y'),
                'week_range' => $module->week_range
            ]
        ]);
    }
    
    // Download certificate
    public function downloadCertificate($certificateId)
    {
        $certificate = UserPrenatalCertificate::where('user_id', auth()->id())
            ->where('id', $certificateId)
            ->firstOrFail();
        
        return response()->download(storage_path('app/public/' . $certificate->file_path));
    }
    
    // Get user's certificates
    public function getUserCertificates()
    {
        $certificates = UserPrenatalCertificate::where('user_id', auth()->id())
            ->with('module')
            ->get();
        
        return response()->json($certificates);
    }

    private function defaultChecklist(): array
    {
        return [
            'videos_watched' => [],
            'medical_tasks' => [],
            'uploads_done' => false,
            'read_done' => false,
            'archived_videos' => [],
        ];
    }

    private function allRequiredVideosWatched(Collection $videos, array $watchedVideos, array $archivedVideos = []): bool
    {
        $archivedVideoIds = array_map('intval', $archivedVideos);

        $requiredVideoIds = $videos
            ->where('is_required', true)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->reject(fn ($id) => in_array($id, $archivedVideoIds, true))
            ->all();

        $watchedVideoIds = array_map('intval', $watchedVideos);

        return empty(array_diff($requiredVideoIds, $watchedVideoIds));
    }

    private function hasRequiredDocuments(int $userId, int $moduleId): bool
    {
        $status = $this->documentRequirementStatus($userId, $moduleId);

        return $status['checkup'] && $status['prescription'];
    }

    private function documentRequirementStatus(int $userId, int $moduleId): array
    {
        $uploadedTypes = UserCheckupRecord::where('user_id', $userId)
            ->where('iec_module_id', $moduleId)
            ->whereIn('record_type', ['checkup', 'prescription'])
            ->distinct()
            ->pluck('record_type')
            ->all();

        return [
            'checkup' => in_array('checkup', $uploadedTypes, true),
            'prescription' => in_array('prescription', $uploadedTypes, true),
        ];
    }

    private function forgetUserIecCache(int $userId, IECModule|int $module): void
    {
        $monthNumber = $module instanceof IECModule
            ? $module->month_number
            : IECModule::whereKey($module)->value('month_number');

        Cache::forget("iec:modules:user:{$userId}");

        if ($monthNumber) {
            Cache::forget("iec:module:user:{$userId}:month:{$monthNumber}");
        }
    }
}
