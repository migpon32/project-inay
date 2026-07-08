<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ClinicalNote;
use App\Models\Consultation;
use App\Models\HealthcareWorker;
use App\Models\IECModule;
use App\Models\MaternalMonitoringEntry;
use App\Models\Mother;
use App\Models\UserCheckupRecord;
use App\Models\UserIECProgress;
use App\Services\MaternalAnalyticsService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class HealthWorkerCasefilesController extends Controller
{
    public function __construct(
        private readonly MaternalAnalyticsService $analytics,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $worker = $this->currentWorker($request);
        $mothers = $worker->mothers()
            ->with('user:id,name,email')
            ->orderByPivot('created_at', 'desc')
            ->get()
            ->map(fn (Mother $mother) => $this->motherData($mother));

        return response()->json(['mothers' => $mothers]);
    }

    public function search(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
        ]);

        $worker = $this->currentWorker($request);
        $search = trim($validated['q'] ?? '');
        $addedMotherIds = $worker->mothers()->pluck('mothers.id');

        $mothers = Mother::query()
            ->with('user:id,name,email')
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->whereHas('user', function ($userQuery) use ($search) {
                        $userQuery->where('name', 'like', "%{$search}%");
                    })
                        ->orWhere('phone', 'like', "%{$search}%")
                        ->orWhere('address', 'like', "%{$search}%");
                });
            })
            ->latest()
            ->limit(50)
            ->get()
            ->map(function (Mother $mother) use ($addedMotherIds) {
                return [
                    ...$this->motherData($mother),
                    'already_in_casefiles' => $addedMotherIds->contains($mother->id),
                ];
            });

        return response()->json(['mothers' => $mothers]);
    }

    public function show(Request $request, Mother $mother): JsonResponse
    {
        $worker = $this->authorizeAssignedMother($request, $mother);

        return response()->json($this->casefileData($mother, $worker));
    }

    public function update(Request $request, Mother $mother): JsonResponse
    {
        $worker = $this->authorizeAssignedMother($request, $mother);

        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'address' => ['nullable', 'string', 'max:500'],
            'blood_type' => ['nullable', 'string', 'max:10'],
            'pregnancy_status' => ['nullable', 'in:pregnant,postpartum,not_provided'],
            'pregnancy_week' => ['nullable', 'integer', 'min:1', 'max:42'],
            'postpartum_week' => ['nullable', 'integer', 'min:1', 'max:52'],
            'due_date' => ['nullable', 'date'],
            'next_scheduled_visit' => ['nullable', 'date'],
            'risk_rating' => ['nullable', 'in:low,medium,high'],
            'co_monitoring_person' => ['nullable', 'string', 'max:120'],
        ]);

        DB::transaction(function () use ($mother, $validated) {
            if (array_key_exists('name', $validated) && $mother->user) {
                $mother->user->update(['name' => $validated['name']]);
            }

            $motherFields = collect($validated)
                ->except('name')
                ->filter(fn ($value, $key) => array_key_exists($key, $validated))
                ->all();

            if (array_key_exists('pregnancy_week', $motherFields) && $motherFields['pregnancy_week'] !== null) {
                $motherFields['pregnancy_month'] = (int) ceil(((int) $motherFields['pregnancy_week']) / 4);
            }

            $mother->update($motherFields);
        });

        return response()->json([
            'message' => 'Mother information updated successfully.',
            'casefile' => $this->casefileData($mother->fresh(), $worker),
        ]);
    }

    public function scheduleVisit(Request $request, Mother $mother): JsonResponse
    {
        $worker = $this->authorizeAssignedMother($request, $mother);
        $validated = $request->validate([
            'next_scheduled_visit' => ['required', 'date'],
        ]);

        $mother->update([
            'next_scheduled_visit' => $validated['next_scheduled_visit'],
        ]);

        return response()->json([
            'message' => 'Next scheduled visit updated successfully.',
            'casefile' => $this->casefileData($mother->fresh(), $worker),
        ]);
    }

    public function storeNote(Request $request, Mother $mother): JsonResponse
    {
        $this->authorizeAssignedMother($request, $mother);

        $validated = $request->validate([
            'body' => ['required', 'string', 'max:3000'],
        ]);

        $note = $mother->clinicalNotes()->create([
            'author_user_id' => $request->user()->id,
            'body' => $validated['body'],
        ]);

        return response()->json([
            'message' => 'Clinical note saved successfully.',
            'note' => $this->clinicalNoteData($note->load('author:id,name')),
        ], 201);
    }

    public function updateNote(Request $request, Mother $mother, ClinicalNote $note): JsonResponse
    {
        $this->authorizeAssignedMother($request, $mother);
        abort_unless($note->mother_id === $mother->id, 404);

        $validated = $request->validate([
            'body' => ['required', 'string', 'max:3000'],
        ]);

        $note->update([
            'body' => $validated['body'],
        ]);

        return response()->json([
            'message' => 'Clinical note updated successfully.',
            'note' => $this->clinicalNoteData($note->fresh('author:id,name')),
        ]);
    }

    public function exportPdf(Request $request, Mother $mother)
    {
        $worker = $this->authorizeAssignedMother($request, $mother);
        $casefile = $this->casefileData($mother, $worker);

        $pdf = Pdf::loadView('reports.health-worker-casefile', [
            'casefile' => $casefile,
            'generatedAt' => now()->format('F d, Y h:i A'),
            'workerName' => $worker->user?->name ?? 'Program Staff',
        ]);

        return $pdf->download(strtolower($casefile['profile']['patient_id']) . '-casefile.pdf');
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'mother_ids' => ['required', 'array', 'min:1'],
            'mother_ids.*' => ['required', 'integer', 'distinct', 'exists:mothers,id'],
        ]);

        $worker = $this->currentWorker($request);
        $motherIds = collect($validated['mother_ids'])->map(fn ($id) => (int) $id);
        $existingIds = $worker->mothers()
            ->whereIn('mothers.id', $motherIds)
            ->pluck('mothers.id');
        $newIds = $motherIds->diff($existingIds)->values();

        if ($newIds->isEmpty()) {
            return response()->json([
                'message' => 'This mother is already in your casefiles.',
            ], 409);
        }

        $consultationIds = DB::transaction(function () use ($worker, $newIds) {
            $worker->mothers()->syncWithoutDetaching($newIds->all());

            return $newIds->map(function (int $motherId) use ($worker) {
                return Consultation::firstOrCreate(
                    [
                        'health_worker_id' => $worker->id,
                        'mother_id' => $motherId,
                    ],
                    [
                        'topic' => 'General Care',
                        'subject' => 'Maternal care consultation',
                        'risk_level' => 'low',
                        'status' => 'open',
                    ]
                )->id;
            });
        });

        return response()->json([
            'message' => 'Patient added to Mothers Casefiles successfully.',
            'added_mother_ids' => $newIds,
            'consultation_ids' => $consultationIds,
            'already_added_mother_ids' => $existingIds,
        ], 201);
    }

    public function destroy(Request $request, Mother $mother): JsonResponse
    {
        $worker = $this->currentWorker($request);
        $removed = $worker->mothers()->detach($mother->id);

        if ($removed === 0) {
            return response()->json([
                'message' => 'This mother is not in your casefiles.',
            ], 404);
        }

        return response()->json([
            'message' => 'Patient removed from Mothers Casefiles successfully.',
        ]);
    }

    private function currentWorker(Request $request): HealthcareWorker
    {
        $worker = $request->user()?->healthcareWorker;

        abort_unless($worker, 403, 'Program staff access is required.');

        return $worker;
    }

    private function authorizeAssignedMother(Request $request, Mother $mother): HealthcareWorker
    {
        $worker = $this->currentWorker($request);

        abort_unless(
            $worker->mothers()->whereKey($mother->id)->exists(),
            403,
            'This mother is not in your casefiles.'
        );

        return $worker;
    }

    private function casefileData(Mother $mother, HealthcareWorker $worker): array
    {
        $mother = $mother->fresh([
            'user:id,name,email',
            'latestMonitoringEntry',
            'monitoringEntries' => fn ($query) => $query
                ->with('recordedBy:id,name')
                ->orderBy('recorded_at')
                ->orderBy('id'),
            'clinicalNotes' => fn ($query) => $query
                ->with('author:id,name')
                ->latest(),
            'consultations' => fn ($query) => $query
                ->where('health_worker_id', $worker->id)
                ->with([
                    'latestMessage',
                ])
                ->latest(),
        ]);

        $moduleData = $this->learningProgress($mother);
        $documents = $this->medicalDocuments($mother);
        $monitoringRecords = $mother->monitoringEntries
            ->map(fn (MaternalMonitoringEntry $entry) => $this->monitoringRecordData($entry))
            ->values();
        $statistics = $this->statisticsData($mother, $monitoringRecords, $documents, $moduleData['overall_percentage']);

        return [
            'profile' => $this->casefileProfile($mother, $worker),
            'overview' => $this->overviewData($mother, $monitoringRecords, $statistics, $moduleData['overall_percentage']),
            'monitoring_records' => $monitoringRecords,
            'statistics' => $statistics,
            'learning_progress' => $moduleData,
            'pregnancy_timeline' => $this->pregnancyTimeline($mother),
            'medical_documents' => $documents,
            'clinical_notes' => $mother->clinicalNotes
                ->map(fn (ClinicalNote $note) => $this->clinicalNoteData($note))
                ->values(),
            'activity_timeline' => $this->activityTimeline($mother, $monitoringRecords, $documents, $moduleData),
        ];
    }

    private function casefileProfile(Mother $mother, HealthcareWorker $worker): array
    {
        $name = $mother->user?->name ?? 'Registered Mother';
        $latest = $mother->latestMonitoringEntry;
        $week = $latest?->pregnancy_week ?? $mother->pregnancy_week;
        $risk = $latest?->risk_level ?? $mother->risk_rating ?? 'low';

        return [
            'id' => $mother->id,
            'patient_id' => $this->patientCode($mother),
            'name' => $name,
            'initials' => $this->initials($name),
            'email' => $mother->email ?? $mother->user?->email,
            'profile_photo_url' => $this->publicFileUrl($mother->profile_photo_path),
            'age' => $mother->birth_date?->age,
            'phone' => $mother->phone,
            'address' => $mother->address,
            'barangay' => $mother->barangay,
            'blood_type' => $mother->blood_type,
            'pregnancy_status' => $mother->pregnancy_status,
            'pregnancy_status_label' => $this->pregnancyStatusLabel($mother),
            'current_trimester' => $this->trimesterLabel($week, $mother->pregnancy_status),
            'pregnancy_month' => $mother->pregnancy_month,
            'pregnancy_week' => $week,
            'postpartum_week' => $mother->postpartum_week,
            'due_date' => $mother->due_date?->toDateString(),
            'next_scheduled_visit' => $mother->next_scheduled_visit?->toDateString(),
            'assigned_health_worker' => $worker->user?->name ?? 'Assigned Program Staff',
            'risk_level' => $risk,
            'risk_label' => $this->riskLabel($risk),
            'previous_deliveries' => $mother->previous_deliveries,
            'co_monitoring_person' => $mother->co_monitoring_person,
            'registered_at' => $mother->created_at?->toIso8601String(),
        ];
    }

    private function overviewData(Mother $mother, Collection $monitoringRecords, array $statistics, int $learningPercentage): array
    {
        $latest = $monitoringRecords->last();
        $careCompletion = $this->careCompletionPercentage($mother, $monitoringRecords, $statistics, $learningPercentage);

        return [
            'current_pregnancy_status' => $this->pregnancyStatusLabel($mother),
            'current_trimester' => $this->trimesterLabel($latest['gestational_week'] ?? $mother->pregnancy_week, $mother->pregnancy_status),
            'risk_assessment' => [
                'level' => $latest['risk_level'] ?? $mother->risk_rating ?? 'low',
                'label' => $this->riskLabel($latest['risk_level'] ?? $mother->risk_rating ?? 'low'),
            ],
            'next_scheduled_appointment' => $mother->next_scheduled_visit?->toDateString(),
            'maternal_care_completion_percentage' => $careCompletion,
        ];
    }

    private function monitoringRecordData(MaternalMonitoringEntry $entry): array
    {
        return [
            'id' => $entry->id,
            'monitoring_date' => $entry->recorded_at?->toDateString(),
            'monitoring_datetime' => $entry->recorded_at?->toIso8601String(),
            'gestational_week' => $entry->pregnancy_week,
            'trimester' => $this->trimesterKey($entry->pregnancy_week),
            'weight_kg' => $entry->weight_kg !== null ? (float) $entry->weight_kg : null,
            'systolic_bp' => $entry->systolic_bp,
            'diastolic_bp' => $entry->diastolic_bp,
            'blood_pressure' => $entry->systolic_bp && $entry->diastolic_bp
                ? "{$entry->systolic_bp}/{$entry->diastolic_bp}"
                : null,
            'temperature_c' => $entry->body_temperature_c !== null ? (float) $entry->body_temperature_c : null,
            'heart_rate' => $entry->heart_rate,
            'blood_sugar_mgdl' => $entry->blood_sugar_mgdl !== null ? (float) $entry->blood_sugar_mgdl : null,
            'hemoglobin_gdl' => $entry->hemoglobin_gdl !== null ? (float) $entry->hemoglobin_gdl : null,
            'reported_symptoms' => $this->riskIndicators($entry),
            'risk_level' => $entry->risk_level,
            'risk_label' => $this->riskLabel($entry->risk_level),
            'notes' => $entry->notes,
            'recorded_by' => $entry->recordedBy?->name ?? 'Mother self-report',
        ];
    }

    private function statisticsData(Mother $mother, Collection $monitoringRecords, array $documents, int $learningPercentage): array
    {
        $currentWeek = $mother->latestMonitoringEntry?->pregnancy_week ?? $mother->pregnancy_week ?? 1;
        $expectedVisits = max(1, min(10, (int) ceil($currentWeek / 4)));
        $completedVisits = min($monitoringRecords->count(), $expectedVisits);
        $visitCompletion = (int) round(($completedVisits / $expectedVisits) * 100);
        $checkupCount = collect($documents['items'])->where('type', 'checkup')->count();
        $prenatalCheckupCompletion = (int) round((min($checkupCount, $expectedVisits) / $expectedVisits) * 100);
        $vaccinationCount = collect($documents['items'])->where('type', 'vaccination')->count();
        $uploadedDocumentTypes = collect($documents['expected_types'])->where('count', '>', 0)->count();
        $documentCompletion = (int) round(($uploadedDocumentTypes / max(count($documents['expected_types']), 1)) * 100);
        $missedAppointments = $this->missedAppointmentCount($mother, $monitoringRecords);
        $latest = $monitoringRecords->last();

        $prePregnancyWeight = (float) ($mother->pre_pregnancy_weight_kg ?? 62);
        $weightLogs = $monitoringRecords
            ->whereNotNull('weight_kg')
            ->map(fn ($record) => [
                'id' => $record['id'],
                'date' => $record['monitoring_date'],
                'recorded_at' => $record['monitoring_datetime'],
                'pregnancy_week' => $record['gestational_week'],
                'weight_kg' => $record['weight_kg'],
                'notes' => $record['notes'],
            ])
            ->values();
        $weightAnalytics = $this->analytics->analyze($weightLogs->all(), $prePregnancyWeight);
        $weightValues = $weightLogs
            ->map(fn ($record) => [
                'id' => $record['id'] ?? null,
                'date' => $record['date'] ?? null,
                'recorded_at' => $record['recorded_at'] ?? null,
                'week' => $record['pregnancy_week'] ?? null,
                'pregnancy_week' => $record['pregnancy_week'] ?? null,
                'value' => $record['weight_kg'] ?? null,
                'weight_kg' => $record['weight_kg'] ?? null,
            ])
            ->values();

        $bloodPressureValues = $monitoringRecords
            ->filter(fn ($record) => $record['systolic_bp'] !== null && $record['diastolic_bp'] !== null)
            ->map(fn ($record) => [
                'id' => $record['id'],
                'date' => $record['monitoring_date'],
                'recorded_at' => $record['monitoring_datetime'],
                'week' => $record['gestational_week'],
                'pregnancy_week' => $record['gestational_week'],
                'systolic' => $record['systolic_bp'],
                'diastolic' => $record['diastolic_bp'],
                'blood_pressure' => $record['blood_pressure'],
            ])
            ->values();

        return [
            'weight_trend' => $weightValues,
            'weight_progression' => $weightValues,
            'blood_pressure_trend' => $bloodPressureValues,
            'blood_pressure_trends' => $bloodPressureValues,
            'weight_logs' => $weightLogs,
            'weight_summary' => $weightAnalytics['weight_summary'],
            'weight_analytics' => $weightAnalytics['analytics'],
            'prenatal_visit_completion' => [
                'completed' => $completedVisits,
                'expected' => $expectedVisits,
                'percentage' => $visitCompletion,
            ],
            'missed_appointments' => [
                'count' => $missedAppointments,
                'status' => $missedAppointments > 0 ? 'Needs follow-up' : 'On schedule',
            ],
            'vaccination_status' => [
                'uploaded_count' => $vaccinationCount,
                'status' => $vaccinationCount > 0 ? 'Records uploaded' : 'No vaccination record uploaded',
            ],
            'prenatal_checkup_completion' => [
                'completed' => min($checkupCount, $expectedVisits),
                'expected' => $expectedVisits,
                'percentage' => $prenatalCheckupCompletion,
            ],
            'document_completion_percentage' => $documentCompletion,
            'maternal_indicators' => [
                'latest_weight_kg' => $latest['weight_kg'] ?? null,
                'latest_blood_pressure' => $latest['blood_pressure'] ?? null,
                'latest_temperature_c' => $latest['temperature_c'] ?? null,
                'latest_heart_rate' => $latest['heart_rate'] ?? null,
                'latest_blood_sugar_mgdl' => $latest['blood_sugar_mgdl'] ?? null,
                'learning_progress_percentage' => $learningPercentage,
            ],
            'summary_cards' => [
                [
                    'label' => 'Prenatal Visit Completion',
                    'value' => "{$completedVisits}/{$expectedVisits}",
                    'detail' => "{$visitCompletion}% of expected visits logged",
                    'percentage' => $visitCompletion,
                ],
                [
                    'label' => 'Missed Appointments',
                    'value' => (string) $missedAppointments,
                    'detail' => $missedAppointments > 0 ? 'Follow-up required' : 'No missed visit detected',
                    'percentage' => $missedAppointments > 0 ? 35 : 100,
                ],
                [
                    'label' => 'Vaccination Status',
                    'value' => $vaccinationCount > 0 ? 'Uploaded' : 'Pending',
                    'detail' => "{$vaccinationCount} vaccination record(s)",
                    'percentage' => $vaccinationCount > 0 ? 100 : 0,
                ],
                [
                    'label' => 'Prenatal Checkups',
                    'value' => min($checkupCount, $expectedVisits) . "/{$expectedVisits}",
                    'detail' => "{$prenatalCheckupCompletion}% completion from uploaded records",
                    'percentage' => $prenatalCheckupCompletion,
                ],
            ],
        ];
    }

    private function learningProgress(Mother $mother): array
    {
        $modules = IECModule::with('videos')
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('month_number')
            ->get();
        $progressByModule = $mother->user_id
            ? UserIECProgress::where('user_id', $mother->user_id)
                ->whereIn('iec_module_id', $modules->pluck('id'))
                ->get()
                ->keyBy('iec_module_id')
            : collect();

        $categories = collect([
            'first_trimester' => ['label' => 'First Trimester', 'modules' => []],
            'second_trimester' => ['label' => 'Second Trimester', 'modules' => []],
            'third_trimester' => ['label' => 'Third Trimester', 'modules' => []],
            'child_health' => ['label' => 'Child Health', 'modules' => []],
        ]);

        $totalProgress = 0;

        $modules->each(function (IECModule $module) use ($progressByModule, $categories, &$totalProgress) {
            $progress = $progressByModule->get($module->id);
            $watchedIds = collect($progress?->watched_videos ?? [])->map(fn ($id) => (int) $id);
            $videos = $module->videos->values();
            $completedLessons = $videos->whereIn('id', $watchedIds->all())->count();
            $totalLessons = $videos->count();
            $isCompleted = (bool) ($progress?->is_completed);
            $percentage = $totalLessons > 0
                ? (int) round(($completedLessons / $totalLessons) * 100)
                : ($isCompleted ? 100 : 0);
            $percentage = $isCompleted ? 100 : $percentage;
            $lastWatchedId = $watchedIds->last();
            $lastViewed = $lastWatchedId
                ? $videos->firstWhere('id', $lastWatchedId)?->title
                : null;
            $currentLesson = $isCompleted
                ? 'Module completed'
                : ($videos->first(fn ($video) => !$watchedIds->contains((int) $video->id))?->title ?? 'No lesson assigned');

            $moduleData = [
                'id' => $module->id,
                'title' => $module->title,
                'trimester' => $module->trimester,
                'week_range' => $module->week_range,
                'is_completed' => $isCompleted,
                'current_lesson' => $currentLesson,
                'completed_lessons' => $completedLessons,
                'remaining_lessons' => max($totalLessons - $completedLessons, 0),
                'total_lessons' => $totalLessons,
                'last_viewed_lesson' => $lastViewed,
                'progress_percentage' => $percentage,
                'completed_at' => $progress?->completed_at?->toIso8601String(),
                'lessons' => $videos->map(fn ($video) => [
                    'id' => $video->id,
                    'title' => $video->title,
                    'is_completed' => $watchedIds->contains((int) $video->id),
                ])->values(),
            ];

            $categoryKey = $this->learningCategoryKey($module->trimester);
            $category = $categories->get($categoryKey);
            $category['modules'][] = $moduleData;
            $categories->put($categoryKey, $category);
            $totalProgress += $percentage;
        });

        $categories = $categories->map(function ($category) {
            $moduleCount = count($category['modules']);
            $category['progress_percentage'] = $moduleCount > 0
                ? (int) round(collect($category['modules'])->avg('progress_percentage'))
                : 0;
            $category['completed_modules'] = collect($category['modules'])->where('is_completed', true)->count();
            $category['total_modules'] = $moduleCount;

            return $category;
        });

        return [
            'overall_percentage' => $modules->count() > 0 ? (int) round($totalProgress / $modules->count()) : 0,
            'completed_modules' => $categories->sum('completed_modules'),
            'total_modules' => $modules->count(),
            'categories' => $categories,
        ];
    }

    private function medicalDocuments(Mother $mother): array
    {
        $records = $mother->user_id
            ? UserCheckupRecord::with('module:id,title,week_range')
                ->where('user_id', $mother->user_id)
                ->latest('record_date')
                ->get()
            : collect();

        $types = [
            'lab_result' => 'Laboratory Results',
            'ultrasound' => 'Ultrasound Reports',
            'prescription' => 'Prescriptions',
            'referral_letter' => 'Referral Letters',
            'maternal_health_book' => 'Maternal Health Book Records',
            'vaccination' => 'Vaccination Records',
            'checkup' => 'Prenatal Checkup Records',
        ];

        $items = $records->map(fn (UserCheckupRecord $record) => [
            'id' => $record->id,
            'type' => $record->record_type,
            'type_label' => $types[$record->record_type] ?? ucwords(str_replace('_', ' ', $record->record_type)),
            'filename' => $record->original_filename,
            'notes' => $record->notes,
            'record_date' => $record->record_date?->toDateString(),
            'uploaded_at' => $record->created_at?->toIso8601String(),
            'is_verified' => $record->is_verified,
            'module_title' => $record->module?->title,
            'module_week_range' => $record->module?->week_range,
            'file_url' => $this->publicFileUrl($record->file_path),
        ])->values();

        return [
            'expected_types' => collect($types)
                ->map(fn ($label, $key) => [
                    'type' => $key,
                    'label' => $label,
                    'count' => $items->where('type', $key)->count(),
                ])
                ->values(),
            'items' => $items,
        ];
    }

    private function pregnancyTimeline(Mother $mother): array
    {
        $week = $mother->latestMonitoringEntry?->pregnancy_week ?? $mother->pregnancy_week;
        $isPostpartum = $mother->pregnancy_status === 'postpartum';

        return [
            [
                'key' => 'registration',
                'label' => 'Registration',
                'caption' => 'Patient account created',
                'date' => $mother->created_at?->toIso8601String(),
                'status' => 'completed',
            ],
            [
                'key' => 'first_trimester',
                'label' => 'First Trimester',
                'caption' => 'Weeks 1-13',
                'status' => $this->milestoneStatus($week, 1, 13, $isPostpartum),
            ],
            [
                'key' => 'second_trimester',
                'label' => 'Second Trimester',
                'caption' => 'Weeks 14-27',
                'status' => $this->milestoneStatus($week, 14, 27, $isPostpartum),
            ],
            [
                'key' => 'third_trimester',
                'label' => 'Third Trimester',
                'caption' => 'Weeks 28-40',
                'status' => $this->milestoneStatus($week, 28, 40, $isPostpartum),
            ],
            [
                'key' => 'delivery',
                'label' => 'Delivery',
                'caption' => 'Birth plan and delivery',
                'date' => $mother->due_date?->toDateString(),
                'status' => $isPostpartum ? 'completed' : (($week ?? 0) >= 37 ? 'current' : 'future'),
            ],
            [
                'key' => 'postpartum',
                'label' => 'Postpartum Care',
                'caption' => $mother->postpartum_week ? "Week {$mother->postpartum_week}" : 'After delivery follow-up',
                'status' => $isPostpartum ? 'current' : 'future',
            ],
        ];
    }

    private function activityTimeline(Mother $mother, Collection $monitoringRecords, array $documents, array $learningProgress): Collection
    {
        $activities = collect([
            [
                'id' => "registration-{$mother->id}",
                'type' => 'registration',
                'title' => 'Account registration completed',
                'description' => 'Mother profile was added to INAY.',
                'date' => $mother->created_at?->toIso8601String(),
            ],
        ]);

        if ($mother->next_scheduled_visit) {
            $activities->push([
                'id' => "appointment-{$mother->id}",
                'type' => $mother->next_scheduled_visit->isPast() ? 'missed_appointment' : 'appointment',
                'title' => $mother->next_scheduled_visit->isPast() ? 'Missed appointment flagged' : 'Appointment scheduled',
                'description' => 'Next scheduled visit: ' . $mother->next_scheduled_visit->format('M d, Y'),
                'date' => $mother->next_scheduled_visit->toIso8601String(),
            ]);
        }

        $monitoringRecords->each(function ($record) use ($activities) {
            $activities->push([
                'id' => "monitoring-{$record['id']}",
                'type' => 'monitoring',
                'title' => 'Maternal monitoring submitted',
                'description' => "Week {$record['gestational_week']} vitals recorded with {$record['risk_label']} assessment.",
                'date' => $record['monitoring_datetime'],
            ]);

            $activities->push([
                'id' => "risk-{$record['id']}",
                'type' => 'risk_update',
                'title' => 'Risk status updated',
                'description' => "Risk classification set to {$record['risk_label']}.",
                'date' => $record['monitoring_datetime'],
            ]);
        });

        collect($documents['items'])->each(function ($document) use ($activities) {
            $activities->push([
                'id' => "document-{$document['id']}",
                'type' => 'document',
                'title' => "{$document['type_label']} uploaded",
                'description' => $document['filename'],
                'date' => $document['uploaded_at'] ?? $document['record_date'],
            ]);
        });

        collect($learningProgress['categories'])->each(function ($category) use ($activities) {
            collect($category['modules'])->where('is_completed', true)->each(function ($module) use ($activities) {
                $activities->push([
                    'id' => "iec-{$module['id']}",
                    'type' => 'learning',
                    'title' => 'INAY Kaalaman module completed',
                    'description' => $module['title'],
                    'date' => $module['completed_at'],
                ]);
            });
        });

        $mother->consultations->each(function (Consultation $consultation) use ($activities) {
            $activities->push([
                'id' => "consultation-{$consultation->id}",
                'type' => 'consultation',
                'title' => 'Consultation opened',
                'description' => $consultation->subject,
                'date' => $consultation->created_at?->toIso8601String(),
            ]);

            if ($consultation->last_message_at) {
                $activities->push([
                    'id' => "consultation-message-{$consultation->id}",
                    'type' => 'consultation',
                    'title' => 'Consultation message received',
                    'description' => $consultation->latestMessage?->body ?: $consultation->subject,
                    'date' => $consultation->last_message_at->toIso8601String(),
                ]);
            }
        });

        $mother->clinicalNotes->each(function (ClinicalNote $note) use ($activities) {
            $activities->push([
                'id' => "note-{$note->id}",
                'type' => 'clinical_note',
                'title' => 'Clinical note added',
                'description' => str($note->body)->limit(90)->toString(),
                'date' => $note->created_at?->toIso8601String(),
            ]);
        });

        return $activities
            ->filter(fn ($activity) => $activity['date'])
            ->sortByDesc(fn ($activity) => Carbon::parse($activity['date'])->timestamp)
            ->values();
    }

    private function clinicalNoteData(ClinicalNote $note): array
    {
        return [
            'id' => $note->id,
            'body' => $note->body,
            'author' => $note->author?->name ?? 'Program Staff',
            'created_at' => $note->created_at?->toIso8601String(),
            'updated_at' => $note->updated_at?->toIso8601String(),
        ];
    }

    private function motherData(Mother $mother): array
    {
        $name = $mother->user?->name ?? 'Registered Mother';

        return [
            'id' => $mother->id,
            'patient_id' => $this->patientCode($mother),
            'name' => $name,
            'initials' => collect(explode(' ', $name))
                ->filter()
                ->take(2)
                ->map(fn ($part) => mb_strtoupper(mb_substr($part, 0, 1)))
                ->implode(''),
            'email' => $mother->email ?? $mother->user?->email,
            'profile_photo_url' => $this->publicFileUrl($mother->profile_photo_path),
            'age' => $mother->birth_date?->age,
            'phone' => $mother->phone,
            'address' => $mother->address,
            'barangay' => $mother->barangay,
            'blood_type' => $mother->blood_type,
            'pregnancy_status' => $mother->pregnancy_status,
            'pregnancy_month' => $mother->pregnancy_month,
            'pregnancy_week' => $mother->pregnancy_week,
            'postpartum_week' => $mother->postpartum_week,
            'due_date' => $mother->due_date?->toDateString(),
            'next_scheduled_visit' => $mother->next_scheduled_visit?->toDateString(),
            'last_weight_kg' => $mother->last_weight_kg !== null
                ? (float) $mother->last_weight_kg
                : null,
            'risk_rating' => $mother->risk_rating ?: 'low',
            'co_monitoring_person' => $mother->co_monitoring_person,
            'registered_at' => $mother->created_at?->toDateString(),
        ];
    }

    private function patientCode(Mother $mother): string
    {
        return 'MAT-RHU-' . str_pad((string) $mother->id, 3, '0', STR_PAD_LEFT);
    }

    private function initials(string $name): string
    {
        return collect(explode(' ', $name))
            ->filter()
            ->take(2)
            ->map(fn ($part) => mb_strtoupper(mb_substr($part, 0, 1)))
            ->implode('');
    }

    private function pregnancyStatusLabel(Mother $mother): string
    {
        if ($mother->pregnancy_status === 'postpartum') {
            return $mother->postpartum_week
                ? "Postpartum Week {$mother->postpartum_week}"
                : 'Postpartum';
        }

        if ($mother->pregnancy_status === 'pregnant') {
            $week = $mother->latestMonitoringEntry?->pregnancy_week ?? $mother->pregnancy_week;

            return $week ? "Pregnancy Week {$week}" : 'Pregnant';
        }

        return 'Not provided';
    }

    private function trimesterLabel(?int $week, ?string $pregnancyStatus): string
    {
        if ($pregnancyStatus === 'postpartum') {
            return 'Postpartum';
        }

        return match ($this->trimesterKey($week)) {
            'first' => 'First Trimester',
            'second' => 'Second Trimester',
            'third' => 'Third Trimester',
            default => 'Not provided',
        };
    }

    private function trimesterKey(?int $week): string
    {
        if (!$week) {
            return 'unknown';
        }

        if ($week <= 13) {
            return 'first';
        }

        if ($week <= 27) {
            return 'second';
        }

        return 'third';
    }

    private function riskLabel(?string $risk): string
    {
        return match ($risk) {
            'high' => 'High Risk',
            'medium' => 'Moderate Risk',
            default => 'Low Risk',
        };
    }

    private function riskIndicators(MaternalMonitoringEntry $entry): array
    {
        $indicators = [];

        if (($entry->systolic_bp !== null && $entry->systolic_bp >= 140) || ($entry->diastolic_bp !== null && $entry->diastolic_bp >= 90)) {
            $indicators[] = 'Elevated blood pressure';
        }

        if ($entry->blood_sugar_mgdl !== null && (float) $entry->blood_sugar_mgdl >= 140) {
            $indicators[] = 'Elevated blood sugar';
        }

        if ($entry->body_temperature_c !== null && (float) $entry->body_temperature_c >= 38) {
            $indicators[] = 'Fever';
        }

        if ($entry->heart_rate !== null && $entry->heart_rate >= 120) {
            $indicators[] = 'High heart rate';
        }

        if ($entry->hemoglobin_gdl !== null && (float) $entry->hemoglobin_gdl < 11) {
            $indicators[] = 'Possible anemia indicator';
        }

        return $indicators;
    }

    private function careCompletionPercentage(Mother $mother, Collection $monitoringRecords, array $statistics, int $learningPercentage): int
    {
        $visitCompletion = $statistics['prenatal_visit_completion']['percentage'] ?? 0;
        $checkupCompletion = $statistics['prenatal_checkup_completion']['percentage'] ?? 0;
        $documentTypesUploaded = $statistics['document_completion_percentage'] ?? min(100, $monitoringRecords->count() * 10);

        $base = (int) round(($visitCompletion * 0.4) + ($learningPercentage * 0.35) + ($checkupCompletion * 0.15) + ($documentTypesUploaded * 0.1));

        if ($mother->pregnancy_status === 'postpartum') {
            return max($base, 85);
        }

        return min(100, max(0, $base));
    }

    private function missedAppointmentCount(Mother $mother, Collection $monitoringRecords): int
    {
        if (!$mother->next_scheduled_visit || $mother->next_scheduled_visit->isFuture()) {
            return 0;
        }

        $hasFollowUpRecord = $monitoringRecords->contains(function ($record) use ($mother) {
            if (!$record['monitoring_date']) {
                return false;
            }

            return Carbon::parse($record['monitoring_date'])->greaterThanOrEqualTo($mother->next_scheduled_visit);
        });

        return $hasFollowUpRecord ? 0 : 1;
    }

    private function learningCategoryKey(?string $trimester): string
    {
        return match ($trimester) {
            '1st Trimester' => 'first_trimester',
            '2nd Trimester' => 'second_trimester',
            '3rd Trimester' => 'third_trimester',
            'Child Health' => 'child_health',
            default => 'child_health',
        };
    }

    private function milestoneStatus(?int $week, int $startWeek, int $endWeek, bool $isPostpartum): string
    {
        if ($isPostpartum || ($week !== null && $week > $endWeek)) {
            return 'completed';
        }

        if ($week !== null && $week >= $startWeek && $week <= $endWeek) {
            return 'current';
        }

        return 'future';
    }

    private function publicFileUrl(?string $path): ?string
    {
        if (!$path) {
            return null;
        }

        return request()->getSchemeAndHttpHost() . '/storage/' . ltrim($path, '/');
    }
}
