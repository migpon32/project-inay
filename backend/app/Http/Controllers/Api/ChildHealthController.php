<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ChildGrowthRecord;
use App\Models\ChildImmunization;
use App\Models\ChildProfile;
use App\Models\GrowthRecordAudit;
use App\Models\HealthcareWorker;
use App\Models\Mother;
use App\Services\ChildGrowthAnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class ChildHealthController extends Controller
{
    public function __construct(
        private readonly ChildGrowthAnalyticsService $growthAnalytics,
    ) {
    }

    private const IMMUNIZATION_SCHEDULE = [
        [
            'key' => 'bcg_birth',
            'name' => 'BCG',
            'dose' => 'Birth dose',
            'days' => 0,
            'purpose' => 'Protects against severe forms of tuberculosis.',
            'side_effects' => 'Small injection-site sore, mild swelling, or a small scar.',
        ],
        [
            'key' => 'hepb_birth',
            'name' => 'Hepatitis B',
            'dose' => 'Birth dose',
            'days' => 0,
            'purpose' => 'Helps prevent Hepatitis B infection.',
            'side_effects' => 'Mild fever, soreness, or tiredness.',
        ],
        [
            'key' => 'penta_1',
            'name' => 'Pentavalent / DPT 1',
            'dose' => 'Dose 1',
            'days' => 42,
            'purpose' => 'Protects against diphtheria, pertussis, tetanus, Hepatitis B, and Hib.',
            'side_effects' => 'Fever, fussiness, or injection-site soreness.',
        ],
        [
            'key' => 'opv_1',
            'name' => 'OPV 1',
            'dose' => 'Dose 1',
            'days' => 42,
            'purpose' => 'Protects against poliovirus.',
            'side_effects' => 'Very rare digestive upset.',
        ],
        [
            'key' => 'pcv_1',
            'name' => 'PCV 1',
            'dose' => 'Dose 1',
            'days' => 42,
            'purpose' => 'Protects against pneumococcal infections.',
            'side_effects' => 'Fever, soreness, or mild appetite changes.',
        ],
        [
            'key' => 'penta_2',
            'name' => 'Pentavalent / DPT 2',
            'dose' => 'Dose 2',
            'days' => 70,
            'purpose' => 'Strengthens immunity from the first dose.',
            'side_effects' => 'Fever, fussiness, or injection-site soreness.',
        ],
        [
            'key' => 'opv_2',
            'name' => 'OPV 2',
            'dose' => 'Dose 2',
            'days' => 70,
            'purpose' => 'Builds continued protection against poliovirus.',
            'side_effects' => 'Very rare digestive upset.',
        ],
        [
            'key' => 'pcv_2',
            'name' => 'PCV 2',
            'dose' => 'Dose 2',
            'days' => 70,
            'purpose' => 'Builds continued pneumococcal protection.',
            'side_effects' => 'Fever, soreness, or mild appetite changes.',
        ],
        [
            'key' => 'penta_3',
            'name' => 'Pentavalent / DPT 3',
            'dose' => 'Dose 3',
            'days' => 98,
            'purpose' => 'Completes the primary pentavalent series.',
            'side_effects' => 'Fever, fussiness, or injection-site soreness.',
        ],
        [
            'key' => 'opv_3',
            'name' => 'OPV 3',
            'dose' => 'Dose 3',
            'days' => 98,
            'purpose' => 'Completes the primary polio series.',
            'side_effects' => 'Very rare digestive upset.',
        ],
        [
            'key' => 'ipv_1',
            'name' => 'IPV',
            'dose' => 'Primary dose',
            'days' => 98,
            'purpose' => 'Adds injectable protection against poliovirus.',
            'side_effects' => 'Mild soreness or fever.',
        ],
        [
            'key' => 'pcv_3',
            'name' => 'PCV 3',
            'dose' => 'Dose 3',
            'days' => 98,
            'purpose' => 'Completes the primary pneumococcal series.',
            'side_effects' => 'Fever, soreness, or mild appetite changes.',
        ],
        [
            'key' => 'mr_1',
            'name' => 'Measles-Rubella',
            'dose' => 'Dose 1',
            'days' => 270,
            'purpose' => 'Protects against measles and rubella infection.',
            'side_effects' => 'Mild fever, rash, or soreness.',
        ],
        [
            'key' => 'mmr_1',
            'name' => 'MMR',
            'dose' => 'Dose 1',
            'days' => 365,
            'purpose' => 'Protects against measles, mumps, and rubella.',
            'side_effects' => 'Mild fever, rash, or soreness.',
        ],
        [
            'key' => 'dpt_booster',
            'name' => 'DPT Booster',
            'dose' => 'Booster',
            'days' => 820,
            'purpose' => 'Extends protection against diphtheria, pertussis, and tetanus.',
            'side_effects' => 'Fever, soreness, or tiredness.',
        ],
        [
            'key' => 'opv_booster',
            'name' => 'OPV Booster',
            'dose' => 'Booster',
            'days' => 820,
            'purpose' => 'Maintains protection against poliovirus.',
            'side_effects' => 'Very rare digestive upset.',
        ],
    ];

    private const GROWTH_BANDS = [
        ['age' => 0, 'weight_min' => 2.5, 'weight_max' => 4.5, 'height_min' => 46.0, 'height_max' => 55.0],
        ['age' => 1, 'weight_min' => 3.2, 'weight_max' => 5.8, 'height_min' => 50.0, 'height_max' => 60.0],
        ['age' => 2, 'weight_min' => 4.0, 'weight_max' => 7.0, 'height_min' => 54.0, 'height_max' => 63.0],
        ['age' => 3, 'weight_min' => 4.7, 'weight_max' => 7.9, 'height_min' => 57.0, 'height_max' => 66.0],
        ['age' => 4, 'weight_min' => 5.3, 'weight_max' => 8.7, 'height_min' => 60.0, 'height_max' => 69.0],
        ['age' => 5, 'weight_min' => 5.8, 'weight_max' => 9.3, 'height_min' => 62.0, 'height_max' => 71.0],
        ['age' => 6, 'weight_min' => 6.2, 'weight_max' => 9.8, 'height_min' => 64.0, 'height_max' => 73.0],
        ['age' => 9, 'weight_min' => 7.0, 'weight_max' => 11.0, 'height_min' => 68.0, 'height_max' => 77.0],
        ['age' => 12, 'weight_min' => 7.5, 'weight_max' => 12.0, 'height_min' => 71.0, 'height_max' => 81.0],
        ['age' => 18, 'weight_min' => 8.5, 'weight_max' => 13.8, 'height_min' => 77.0, 'height_max' => 89.0],
        ['age' => 24, 'weight_min' => 9.5, 'weight_max' => 15.5, 'height_min' => 82.0, 'height_max' => 94.0],
        ['age' => 36, 'weight_min' => 11.0, 'weight_max' => 18.5, 'height_min' => 90.0, 'height_max' => 105.0],
        ['age' => 48, 'weight_min' => 12.5, 'weight_max' => 22.0, 'height_min' => 97.0, 'height_max' => 113.0],
        ['age' => 60, 'weight_min' => 14.0, 'weight_max' => 25.0, 'height_min' => 104.0, 'height_max' => 120.0],
    ];

    public function index(Request $request): JsonResponse
    {
        $mother = $this->currentMother($request);

        return response()->json(Cache::remember(
            "child-health:mother:{$mother->id}",
            now()->addSeconds(30),
            fn () => $this->childrenPayload($mother)
        ));
    }

    public function storeChild(Request $request): JsonResponse
    {
        $mother = $this->currentMother($request);
        $child = $this->createChild($request, $mother);
        $this->forgetChildHealthCache($mother);

        return response()->json([
            'message' => 'Child profile registered successfully.',
            'child' => $this->childData($child),
        ], 201);
    }

    public function updateOwnChildPhoto(Request $request, ChildProfile $child): JsonResponse
    {
        $this->authorizeMotherChild($request, $child);
        $this->updateChildPhotoFromRequest($request, $child);
        $this->forgetChildHealthCache($child->mother_id);

        return response()->json([
            'message' => 'Child profile photo updated successfully.',
            'child' => $this->childData($child->fresh()),
        ]);
    }

    public function showMotherChildren(Request $request, Mother $mother): JsonResponse
    {
        $this->authorizeAssignedMother($request, $mother);

        return response()->json(Cache::remember(
            "child-health:mother:{$mother->id}",
            now()->addSeconds(30),
            fn () => $this->childrenPayload($mother)
        ));
    }

    public function storeChildForMother(Request $request, Mother $mother): JsonResponse
    {
        $worker = $this->authorizeAssignedMother($request, $mother);
        $child = $this->createChild($request, $mother, $worker);
        $this->forgetChildHealthCache($mother);

        return response()->json([
            'message' => 'Child profile registered successfully.',
            'child' => $this->childData($child),
        ], 201);
    }

    public function showGrowthRecords(Request $request, ChildProfile $child): JsonResponse
    {
        $this->authorizeChildGrowthAccess($request, $child);

        return response()->json([
            'child' => $this->childData($child),
            'growth_records' => $this->childGrowthRecords($child),
        ]);
    }

    public function storeGrowthRecord(Request $request, ChildProfile $child): JsonResponse
    {
        $worker = $this->authorizeAssignedChild($request, $child);

        return $this->storeGrowthRecordForWorker($request, $child, $worker);
    }

    public function storeWorkerGrowthRecord(Request $request, ChildProfile $child): JsonResponse
    {
        return $this->storeGrowthRecord($request, $child);
    }

    public function updateGrowthRecord(Request $request, ChildGrowthRecord $record): JsonResponse
    {
        $record->loadMissing('child.mother');
        $child = $record->child;
        $worker = $this->authorizeAssignedChild($request, $child);
        $validated = $this->validatedGrowthPayload($request, $child, $record);

        if ((int) $validated['age_month'] !== (int) $record->age_month) {
            $duplicate = $child->growthRecords()
                ->where('age_month', $validated['age_month'])
                ->where('id', '!=', $record->id)
                ->first();

            if ($duplicate) {
                return $this->duplicateGrowthResponse($child, $duplicate);
            }
        }

        $previousWeight = (float) $record->weight;
        $previousHeight = (float) $record->height;
        $recordedAt = Carbon::now('Asia/Manila');

        DB::transaction(function () use ($record, $child, $worker, $request, $validated, $previousWeight, $previousHeight, $recordedAt): void {
            $record->update([
                'age_month' => $validated['age_month'],
                'weight' => $validated['weight'],
                'height' => $validated['height'],
                'recorded_by' => $worker->id,
                'recorded_at' => $recordedAt,
                'notes' => $validated['notes'] ?? $record->notes,
            ]);

            $this->recordGrowthAudit(
                $record,
                $child,
                $worker,
                $request->user()->id,
                $previousWeight,
                $previousHeight,
                (float) $validated['weight'],
                (float) $validated['height'],
                $recordedAt,
            );
        });

        $this->forgetChildHealthCache($child->mother_id);

        return response()->json([
            'message' => 'Existing growth record updated successfully.',
            'record' => $this->growthRecordData($record->fresh(['recordedBy.user'])),
            'child' => $this->childData($child->fresh()),
        ]);
    }

    public function updateWorkerImmunization(Request $request, ChildProfile $child, ChildImmunization $immunization): JsonResponse
    {
        $this->authorizeAssignedChild($request, $child);
        $this->authorizeChildImmunization($child, $immunization);

        return $this->updateImmunizationFromRequest($request, $child, $immunization);
    }

    public function updateWorkerChildPhoto(Request $request, ChildProfile $child): JsonResponse
    {
        $this->authorizeAssignedChild($request, $child);
        $this->updateChildPhotoFromRequest($request, $child);
        $this->forgetChildHealthCache($child->mother_id);

        return response()->json([
            'message' => 'Child profile photo updated successfully.',
            'child' => $this->childData($child->fresh()),
        ]);
    }

    private function createChild(Request $request, Mother $mother, ?HealthcareWorker $growthRecorder = null): ChildProfile
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'sex' => ['nullable', Rule::in(['female', 'male', 'unspecified'])],
            'birth_date' => ['required', 'date', 'before_or_equal:today'],
            'birth_weight_kg' => ['nullable', 'numeric', 'min:1', 'max:8'],
            'birth_height_cm' => ['nullable', 'numeric', 'min:30', 'max:65'],
            'current_weight_kg' => ['nullable', 'required_with:current_height_cm', 'numeric', 'min:1', 'max:80'],
            'current_height_cm' => ['nullable', 'required_with:current_weight_kg', 'numeric', 'min:30', 'max:160'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        return DB::transaction(function () use ($validated, $mother, $request, $growthRecorder) {
            $child = $mother->children()->create([
                'name' => $validated['name'],
                'sex' => $validated['sex'] ?? 'unspecified',
                'birth_date' => $validated['birth_date'],
                'birth_weight_kg' => $validated['birth_weight_kg'] ?? null,
                'birth_height_cm' => $validated['birth_height_cm'] ?? null,
                'notes' => $validated['notes'] ?? null,
            ]);

            if ($growthRecorder && isset($validated['birth_weight_kg'], $validated['birth_height_cm'])) {
                $this->createGrowthRecord($child, [
                    'age_month' => 0,
                    'weight' => $validated['birth_weight_kg'],
                    'height' => $validated['birth_height_cm'],
                    'recorded_at' => $child->birth_date,
                    'notes' => 'Birth measurement baseline.',
                ], $growthRecorder, $request->user()->id);
            }

            if ($growthRecorder && isset($validated['current_weight_kg'], $validated['current_height_cm'])) {
                $currentAgeMonth = $this->ageMonthsAt($child, Carbon::now('Asia/Manila'));

                if (!$child->growthRecords()->where('age_month', $currentAgeMonth)->exists()) {
                    $this->createGrowthRecord($child, [
                        'age_month' => $currentAgeMonth,
                        'weight' => $validated['current_weight_kg'],
                        'height' => $validated['current_height_cm'],
                        'recorded_at' => Carbon::now('Asia/Manila'),
                        'notes' => 'Current measurement at registration.',
                    ], $growthRecorder, $request->user()->id);
                }
            }

            $this->syncImmunizationSchedule($child);

            return $child;
        });
    }

    private function storeGrowthRecordForWorker(Request $request, ChildProfile $child, HealthcareWorker $worker): JsonResponse
    {
        $validated = $this->validatedGrowthPayload($request, $child);
        $duplicate = $child->growthRecords()
            ->where('age_month', $validated['age_month'])
            ->first();

        if ($duplicate) {
            return $this->duplicateGrowthResponse($child, $duplicate);
        }

        $previous = $child->latestGrowthRecord()->first();
        $recordedAt = Carbon::now('Asia/Manila');

        $record = DB::transaction(function () use ($child, $worker, $request, $validated, $previous, $recordedAt) {
            $record = $this->createGrowthRecord($child, [
                ...$validated,
                'recorded_at' => $recordedAt,
            ], $worker, $request->user()->id);

            $this->recordGrowthAudit(
                $record,
                $child,
                $worker,
                $request->user()->id,
                $previous?->weight !== null ? (float) $previous->weight : null,
                $previous?->height !== null ? (float) $previous->height : null,
                (float) $validated['weight'],
                (float) $validated['height'],
                $recordedAt,
            );

            return $record;
        });

        $this->forgetChildHealthCache($child->mother_id);

        return response()->json([
            'message' => 'Growth check-in saved successfully.',
            'record' => $this->growthRecordData($record->fresh(['recordedBy.user'])),
            'child' => $this->childData($child->fresh()),
        ], 201);
    }

    private function validatedGrowthPayload(Request $request, ChildProfile $child, ?ChildGrowthRecord $record = null): array
    {
        if (!$request->filled('age_month') && $request->filled('age_months')) {
            $request->merge(['age_month' => $request->input('age_months')]);
        }

        if (!$request->filled('age_month') && $request->filled('recorded_at')) {
            $request->merge([
                'age_month' => $this->ageMonthsAt(
                    $child,
                    Carbon::createFromFormat('Y-m-d', $request->input('recorded_at'), 'Asia/Manila')->startOfDay(),
                ),
            ]);
        }

        if (!$request->filled('weight') && $request->filled('weight_kg')) {
            $request->merge(['weight' => $request->input('weight_kg')]);
        }

        if (!$request->filled('height') && $request->filled('height_cm')) {
            $request->merge(['height' => $request->input('height_cm')]);
        }

        return $request->validate([
            'age_month' => ['required', 'integer', 'min:0', 'max:60'],
            'weight' => ['required', 'numeric', 'gt:0', 'max:80'],
            'height' => ['required', 'numeric', 'gt:0', 'max:160'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ], [
            'age_month.required' => 'Select the age in months for this growth check-in.',
            'weight.gt' => 'Weight must be greater than zero.',
            'height.gt' => 'Height must be greater than zero.',
        ]);
    }

    private function createGrowthRecord(ChildProfile $child, array $data, HealthcareWorker $worker, int $userId): ChildGrowthRecord
    {
        $recordedAt = match (true) {
            !isset($data['recorded_at']) => Carbon::now('Asia/Manila'),
            $data['recorded_at'] instanceof \DateTimeInterface => Carbon::instance($data['recorded_at'])
                ->setTimezone('Asia/Manila'),
            default => Carbon::parse($data['recorded_at'], 'Asia/Manila'),
        };

        abort_if(
            $recordedAt->lt($child->birth_date->startOfDay()),
            422,
            'Growth record date cannot be before the child birth date.'
        );

        return $child->growthRecords()->create([
            'age_month' => $data['age_month'],
            'weight' => $data['weight'],
            'height' => $data['height'],
            'recorded_at' => $recordedAt,
            'recorded_by' => $worker->id,
            'notes' => $data['notes'] ?? null,
        ]);
    }

    private function updateImmunizationFromRequest(Request $request, ChildProfile $child, ChildImmunization $immunization): JsonResponse
    {
        $todayInManila = Carbon::now('Asia/Manila')->toDateString();
        $validated = $request->validate([
            'completed' => ['required', 'boolean'],
            'vaccinated_at' => ['nullable', 'date_format:Y-m-d', "before_or_equal:{$todayInManila}"],
            'notes' => ['nullable', 'string', 'max:1000'],
        ], [
            'vaccinated_at.before_or_equal' => 'The vaccination date cannot be after today in Philippine time.',
        ]);

        $immunization->update([
            'vaccinated_at' => $validated['completed']
                ? ($validated['vaccinated_at'] ?? $todayInManila)
                : null,
            'recorded_by_user_id' => $request->user()->id,
            'notes' => $validated['notes'] ?? $immunization->notes,
        ]);
        $this->forgetChildHealthCache($child->mother_id);

        return response()->json([
            'message' => 'Immunization record updated successfully.',
            'immunization' => $this->immunizationData($immunization->fresh()),
            'child' => $this->childData($child),
        ]);
    }

    private function updateChildPhotoFromRequest(Request $request, ChildProfile $child): void
    {
        $validated = $request->validate([
            'photo' => ['required', 'image', 'mimes:jpg,jpeg,png', 'max:4096'],
        ]);

        if ($child->profile_photo_path) {
            Storage::disk('public')->delete($child->profile_photo_path);
        }

        $child->update([
            'profile_photo_path' => $validated['photo']->store('profile-photos/children', 'public'),
        ]);
    }

    private function childrenPayload(Mother $mother): array
    {
        $children = $mother->children()
            ->select([
                'id',
                'mother_id',
                'name',
                'sex',
                'birth_date',
                'birth_weight_kg',
                'birth_height_cm',
                'notes',
                'profile_photo_path',
            ])
            ->with([
                'growthRecords' => fn ($query) => $query
                    ->select([
                        'id',
                        'child_id',
                        'age_month',
                        'weight',
                        'height',
                        'recorded_at',
                        'recorded_by',
                        'notes',
                    ])
                    ->with('recordedBy.user:id,name')
                    ->orderBy('age_month')
                    ->orderBy('recorded_at'),
                'latestGrowthRecord.recordedBy.user:id,name',
                'immunizations' => fn ($query) => $query
                    ->select([
                        'id',
                        'child_id',
                        'vaccine_key',
                        'vaccine_name',
                        'dose_label',
                        'scheduled_for_age_days',
                        'scheduled_at',
                        'vaccinated_at',
                        'purpose',
                        'side_effects',
                        'notes',
                    ])
                    ->orderBy('scheduled_at'),
            ])
            ->orderByDesc('birth_date')
            ->get();

        $childData = $children->map(fn (ChildProfile $child) => $this->childData($child))->values();

        return [
            'children' => $childData,
            'summary' => [
                'children_count' => $childData->count(),
                'overdue_vaccines' => $childData->sum(fn ($child) => collect($child['immunizations'])->where('status', 'overdue')->count()),
                'active_alerts' => $childData->sum(fn ($child) => count($child['alerts'])),
            ],
        ];
    }

    private function childData(ChildProfile $child): array
    {
        $scheduleChanged = $this->syncImmunizationSchedule($child);

        if (
            $scheduleChanged
            || !$child->relationLoaded('growthRecords')
            || !$child->relationLoaded('latestGrowthRecord')
            || !$child->relationLoaded('immunizations')
        ) {
            $child = $child->fresh([
                'growthRecords' => fn ($query) => $query
                    ->with('recordedBy.user:id,name')
                    ->orderBy('age_month')
                    ->orderBy('recorded_at'),
                'latestGrowthRecord.recordedBy.user:id,name',
                'immunizations' => fn ($query) => $query->orderBy('scheduled_at'),
            ]);
        }

        $latest = $child->latestGrowthRecord;
        $calendarAgeMonths = $this->ageMonthsAt($child, Carbon::now('Asia/Manila'));
        $growthAgeMonths = $latest?->age_month ?? $calendarAgeMonths;
        $weightAssessment = $latest
            ? $this->metricAssessment('weight', (float) $latest->weight, $latest->age_month)
            : null;
        $heightAssessment = $latest
            ? $this->metricAssessment('height', (float) $latest->height, $latest->age_month)
            : null;
        $immunizations = $child->immunizations->map(fn (ChildImmunization $immunization) => $this->immunizationData($immunization))->values();
        $growthRecords = $child->growthRecords
            ->map(fn (ChildGrowthRecord $record) => $this->growthRecordData($record))
            ->values();
        $growthAnalytics = $this->growthAnalytics->analyze($growthRecords->all());

        return [
            'id' => $child->id,
            'name' => $child->name,
            'initials' => $this->initials($child->name),
            'profile_photo_url' => $this->publicFileUrl($child->profile_photo_path),
            'sex' => $child->sex,
            'birth_date' => $child->birth_date?->toDateString(),
            'age_months' => $growthAgeMonths,
            'age_month' => $growthAgeMonths,
            'calendar_age_months' => $calendarAgeMonths,
            'calendar_age_label' => $this->ageLabel($calendarAgeMonths),
            'age_label' => $this->ageLabel($growthAgeMonths),
            'current_weight_kg' => $latest?->weight !== null ? (float) $latest->weight : null,
            'current_height_cm' => $latest?->height !== null ? (float) $latest->height : null,
            'latest_recorded_at' => $latest?->recorded_at?->toDateString(),
            'latest_measurement_date' => $latest?->recorded_at?->toDateString(),
            'growth_status' => [
                'weight' => $weightAssessment,
                'height' => $heightAssessment,
                'overall' => $this->overallGrowthStatus($weightAssessment, $heightAssessment),
            ],
            'growth_records' => $growthRecords,
            'growth_trend' => $growthAnalytics['growth_trend'],
            'growth_analytics' => $growthAnalytics['analytics'],
            'immunizations' => $immunizations,
            'immunization_summary' => [
                'completed' => $immunizations->where('status', 'completed')->count(),
                'upcoming' => $immunizations->where('status', 'upcoming')->count(),
                'overdue' => $immunizations->where('status', 'overdue')->count(),
            ],
            'alerts' => $this->alertsForChild($child, $weightAssessment, $heightAssessment, $immunizations, $growthAnalytics['analytics']),
        ];
    }

    private function growthRecordData(ChildGrowthRecord $record): array
    {
        $record->loadMissing('recordedBy.user');
        $ageMonth = (int) $record->age_month;
        $weight = (float) $record->weight;
        $height = (float) $record->height;

        return [
            'id' => $record->id,
            'age_month' => $ageMonth,
            'age_months' => $ageMonth,
            'date' => $record->recorded_at?->toDateString(),
            'recorded_at' => $record->recorded_at?->toIso8601String(),
            'weight' => $weight,
            'height' => $height,
            'weight_kg' => $weight,
            'height_cm' => $height,
            'weight_status' => $this->metricAssessment('weight', $weight, $ageMonth)['status'],
            'height_status' => $this->metricAssessment('height', $height, $ageMonth)['status'],
            'recorded_by' => $record->recordedBy ? [
                'id' => $record->recordedBy->id,
                'name' => $record->recordedBy->user?->name,
            ] : null,
            'notes' => $record->notes,
        ];
    }

    private function immunizationData(ChildImmunization $immunization): array
    {
        $status = $this->immunizationStatus($immunization);

        return [
            'id' => $immunization->id,
            'vaccine_key' => $immunization->vaccine_key,
            'vaccine_name' => $immunization->vaccine_name,
            'dose_label' => $immunization->dose_label,
            'scheduled_for_age_days' => $immunization->scheduled_for_age_days,
            'scheduled_at' => $immunization->scheduled_at?->toDateString(),
            'vaccinated_at' => $immunization->vaccinated_at?->toDateString(),
            'status' => $status,
            'purpose' => $immunization->purpose,
            'side_effects' => $immunization->side_effects,
            'notes' => $immunization->notes,
        ];
    }

    private function syncImmunizationSchedule(ChildProfile $child): bool
    {
        $existing = ($child->relationLoaded('immunizations')
            ? $child->immunizations
            : $child->immunizations()->get())
            ->keyBy('vaccine_key');
        $now = now();
        $rows = [];

        foreach (self::IMMUNIZATION_SCHEDULE as $item) {
            $schedule = [
                'vaccine_name' => $item['name'],
                'dose_label' => $item['dose'],
                'scheduled_for_age_days' => $item['days'],
                'scheduled_at' => $child->birth_date->copy()->addDays($item['days'])->toDateString(),
                'purpose' => $item['purpose'],
                'side_effects' => $item['side_effects'],
            ];
            $immunization = $existing->get($item['key']);

            if ($immunization && collect($schedule)->every(function ($value, $key) use ($immunization) {
                $current = $key === 'scheduled_at'
                    ? $immunization->scheduled_at?->toDateString()
                    : $immunization->{$key};

                return (string) $current === (string) $value;
            })) {
                continue;
            }

            $rows[] = [
                'child_id' => $child->id,
                'vaccine_key' => $item['key'],
                ...$schedule,
                'created_at' => $immunization?->created_at ?? $now,
                'updated_at' => $now,
            ];
        }

        if ($rows !== []) {
            ChildImmunization::upsert(
                $rows,
                ['child_id', 'vaccine_key'],
                [
                    'vaccine_name',
                    'dose_label',
                    'scheduled_for_age_days',
                    'scheduled_at',
                    'purpose',
                    'side_effects',
                    'updated_at',
                ],
            );

            return true;
        }

        return false;
    }

    private function forgetChildHealthCache(Mother|int $mother): void
    {
        $motherId = $mother instanceof Mother ? $mother->id : $mother;

        Cache::forget("child-health:mother:{$motherId}");
    }

    private function duplicateGrowthResponse(ChildProfile $child, ChildGrowthRecord $record): JsonResponse
    {
        return response()->json([
            'message' => 'A growth record already exists for this child and age. Choose update existing to replace that age-month record.',
            'duplicate' => true,
            'existing_record' => $this->growthRecordData($record),
            'child' => $this->childData($child->fresh()),
        ], 409);
    }

    private function childGrowthRecords(ChildProfile $child): array
    {
        $child->loadMissing([
            'growthRecords' => fn ($query) => $query
                ->with('recordedBy.user:id,name')
                ->orderBy('age_month')
                ->orderBy('recorded_at'),
        ]);

        return $child->growthRecords
            ->map(fn (ChildGrowthRecord $record) => $this->growthRecordData($record))
            ->values()
            ->all();
    }

    private function recordGrowthAudit(
        ChildGrowthRecord $record,
        ChildProfile $child,
        HealthcareWorker $worker,
        int $userId,
        ?float $previousWeight,
        ?float $previousHeight,
        float $newWeight,
        float $newHeight,
        Carbon $recordedAt,
    ): void {
        $worker->loadMissing('user:id,name');

        GrowthRecordAudit::create([
            'growth_record_id' => $record->id,
            'child_id' => $child->id,
            'healthcare_worker_id' => $worker->id,
            'recorded_by_user_id' => $userId,
            'healthcare_worker_name' => $worker->user?->name,
            'age_month' => $record->age_month,
            'previous_weight' => $previousWeight,
            'new_weight' => $newWeight,
            'previous_height' => $previousHeight,
            'new_height' => $newHeight,
            'recorded_at' => $recordedAt,
        ]);
    }

    private function alertsForChild(ChildProfile $child, ?array $weightAssessment, ?array $heightAssessment, $immunizations, array $growthAnalytics): array
    {
        $alerts = [];

        foreach ([['Weight', $weightAssessment], ['Height', $heightAssessment]] as [$label, $assessment]) {
            if (!$assessment || $assessment['status'] === 'normal') {
                continue;
            }

            $alerts[] = [
                'type' => 'growth',
                'severity' => $assessment['severity'],
                'title' => "{$label} needs review",
                'message' => "{$child->name}'s {$assessment['metric']} is {$assessment['label']} for age. Coordinate with Program Staff for assessment.",
            ];
        }

        $overallStatus = $this->overallGrowthStatus($weightAssessment, $heightAssessment);

        if (in_array($overallStatus['status'], ['severely_underweight', 'severely_stunted', 'obese'], true)) {
            $alerts[] = [
                'type' => 'growth',
                'severity' => 'high',
                'title' => 'Nutritional intervention recommended',
                'message' => "{$child->name}'s latest growth status needs a priority clinical nutrition review.",
            ];
        }

        if (($growthAnalytics['latest_weight_change_kg'] ?? 0) < 0 || ($growthAnalytics['latest_height_change_cm'] ?? 0) < 0) {
            $alerts[] = [
                'type' => 'growth',
                'severity' => 'medium',
                'title' => 'Growth declining',
                'message' => 'The latest growth trend is lower than the previous recorded point. Please review measurement quality and feeding support.',
            ];
        } elseif (
            ($growthAnalytics['latest_weight_change_kg'] ?? null) !== null
            && ($growthAnalytics['latest_height_change_cm'] ?? null) !== null
            && ($growthAnalytics['latest_weight_change_kg'] ?? 0) > 0
            && ($growthAnalytics['latest_height_change_cm'] ?? 0) > 0
            && $overallStatus['status'] !== 'normal'
        ) {
            $alerts[] = [
                'type' => 'growth',
                'severity' => 'low',
                'title' => 'Growth improving',
                'message' => 'The latest measurements improved from the previous record, but follow-up is still recommended.',
            ];
        }

        $overdueCount = $immunizations->where('status', 'overdue')->count();

        if ($overdueCount > 0) {
            $alerts[] = [
                'type' => 'immunization',
                'severity' => 'high',
                'title' => 'Missed immunization detected',
                'message' => "{$overdueCount} vaccine" . ($overdueCount === 1 ? ' is' : 's are') . ' overdue. Contact your barangay health center for catch-up guidance.',
            ];
        }

        if (!$child->latestGrowthRecord) {
            $alerts[] = [
                'type' => 'growth',
                'severity' => 'medium',
                'title' => 'Growth baseline missing',
                'message' => 'Add a height and weight measurement to activate child growth alerts.',
            ];
        }

        return $alerts;
    }

    private function metricAssessment(string $metric, float $value, int $ageMonths): array
    {
        $range = $this->screeningRange($ageMonths);
        $min = $range["{$metric}_min"];
        $max = $range["{$metric}_max"];
        $status = 'normal';
        $label = 'Normal';
        $severity = 'low';

        if ($metric === 'weight') {
            if ($value < $min * 0.85) {
                $status = 'severely_underweight';
                $label = 'Severely Underweight';
                $severity = 'high';
            } elseif ($value < $min) {
                $status = 'underweight';
                $label = 'Underweight';
                $severity = 'high';
            } elseif ($value > $max * 1.2) {
                $status = 'obese';
                $label = 'Obese';
                $severity = 'high';
            } elseif ($value > $max) {
                $status = 'overweight';
                $label = 'Overweight';
                $severity = 'medium';
            } elseif ($value <= $min * 1.05 || $value >= $max * 0.95) {
                $status = 'needs_monitoring';
                $label = 'Needs Monitoring';
                $severity = 'low';
            }
        } else {
            if ($value < $min * 0.9) {
                $status = 'severely_stunted';
                $label = 'Severely Stunted';
                $severity = 'high';
            } elseif ($value < $min) {
                $status = 'stunted';
                $label = 'Stunted';
                $severity = 'high';
            } elseif ($value <= $min * 1.05 || $value >= $max * 0.98) {
                $status = 'needs_monitoring';
                $label = 'Needs Monitoring';
                $severity = 'low';
            }
        }

        return [
            'metric' => $metric,
            'status' => $status,
            'label' => $label,
            'severity' => $severity,
            'min' => round($min, 1),
            'max' => round($max, 1),
            'unit' => $metric === 'weight' ? 'kg' : 'cm',
        ];
    }

    private function overallGrowthStatus(?array $weightAssessment, ?array $heightAssessment): array
    {
        $priority = [
            'severely_underweight' => 80,
            'severely_stunted' => 80,
            'obese' => 75,
            'underweight' => 70,
            'stunted' => 70,
            'overweight' => 60,
            'needs_monitoring' => 40,
            'normal' => 10,
        ];
        $statuses = collect([$weightAssessment, $heightAssessment])
            ->filter()
            ->sortByDesc(fn (array $assessment) => $priority[$assessment['status']] ?? 0)
            ->values();
        $top = $statuses->first();

        return $top ? [
            'status' => $top['status'],
            'label' => $top['label'],
            'severity' => $top['severity'],
        ] : [
            'status' => 'unknown',
            'label' => 'No Growth Record',
            'severity' => 'medium',
        ];
    }

    private function screeningRange(int $ageMonths): array
    {
        $ageMonths = max(0, min(60, $ageMonths));
        $bands = self::GROWTH_BANDS;

        if ($ageMonths <= $bands[0]['age']) {
            return $bands[0];
        }

        for ($index = 1; $index < count($bands); $index++) {
            $previous = $bands[$index - 1];
            $next = $bands[$index];

            if ($ageMonths > $next['age']) {
                continue;
            }

            $span = max(1, $next['age'] - $previous['age']);
            $ratio = ($ageMonths - $previous['age']) / $span;

            return [
                'age' => $ageMonths,
                'weight_min' => $previous['weight_min'] + (($next['weight_min'] - $previous['weight_min']) * $ratio),
                'weight_max' => $previous['weight_max'] + (($next['weight_max'] - $previous['weight_max']) * $ratio),
                'height_min' => $previous['height_min'] + (($next['height_min'] - $previous['height_min']) * $ratio),
                'height_max' => $previous['height_max'] + (($next['height_max'] - $previous['height_max']) * $ratio),
            ];
        }

        return $bands[array_key_last($bands)];
    }

    private function immunizationStatus(ChildImmunization $immunization): string
    {
        if ($immunization->vaccinated_at) {
            return 'completed';
        }

        return $immunization->scheduled_at->lt(today()) ? 'overdue' : 'upcoming';
    }

    private function ageMonthsAt(ChildProfile $child, Carbon $date): int
    {
        return max(0, (int) floor($child->birth_date->copy()->startOfDay()->diffInMonths($date->copy()->startOfDay())));
    }

    private function ageLabel(int $ageMonths): string
    {
        $years = intdiv($ageMonths, 12);
        $months = $ageMonths % 12;
        $parts = [];

        if ($years > 0) {
            $parts[] = $years . ' year' . ($years === 1 ? '' : 's');
        }

        if ($months > 0 || $years === 0) {
            $parts[] = $months . ' month' . ($months === 1 ? '' : 's');
        }

        return implode(' ', $parts);
    }

    private function initials(string $name): string
    {
        return collect(preg_split('/\s+/', trim($name)))
            ->filter()
            ->take(2)
            ->map(fn (string $part) => mb_strtoupper(mb_substr($part, 0, 1)))
            ->implode('') ?: 'CH';
    }

    private function publicFileUrl(?string $path): ?string
    {
        if (!$path) {
            return null;
        }

        return request()->getSchemeAndHttpHost() . '/storage/' . ltrim($path, '/');
    }

    private function authorizeMotherChild(Request $request, ChildProfile $child): Mother
    {
        $mother = $this->currentMother($request);
        abort_unless((int) $child->mother_id === (int) $mother->id, 403, 'This child profile is not linked to your account.');

        return $mother;
    }

    private function authorizeChildGrowthAccess(Request $request, ChildProfile $child): void
    {
        if ($request->user()?->mother) {
            $this->authorizeMotherChild($request, $child);

            return;
        }

        if ($request->user()?->healthcareWorker) {
            $this->authorizeAssignedChild($request, $child);

            return;
        }

        abort(403, 'Child growth records are not available for this account.');
    }

    private function authorizeAssignedChild(Request $request, ChildProfile $child): HealthcareWorker
    {
        $child->loadMissing('mother');

        return $this->authorizeAssignedMother($request, $child->mother);
    }

    private function authorizeChildImmunization(ChildProfile $child, ChildImmunization $immunization): void
    {
        abort_unless((int) $immunization->child_id === (int) $child->id, 403, 'This immunization record does not belong to the selected child.');
    }

    private function currentMother(Request $request): Mother
    {
        $mother = $request->user()?->mother;
        abort_unless($mother, 403, 'Mother portal access is required.');

        return $mother;
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
}
