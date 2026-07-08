<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HealthcareWorker;
use App\Models\MaternalMonitoringEntry;
use App\Models\Mother;
use App\Services\MaternalAnalyticsService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class MaternalMonitoringController extends Controller
{
    public function __construct(
        private readonly MaternalAnalyticsService $analytics,
    ) {
    }

    public function me(Request $request): JsonResponse
    {
        $mother = $this->currentMother($request);
        $this->ensureBaselineEntry($mother, $request->user()->id);
        $cacheKey = "maternal-monitoring:me:{$mother->id}";

        return response()->json(Cache::remember($cacheKey, now()->addSeconds(30), fn () => [
            'profile' => $this->motherProfile($mother->fresh(['user', 'latestMonitoringEntry.recordedBy:id,name,role'])),
            'summary' => $this->summaryForMother($mother),
        ]));
    }

    public function status(Request $request): JsonResponse
    {
        $mother = $this->currentMother($request);
        $this->ensureBaselineEntry($mother, $request->user()->id);
        $cacheKey = "maternal-monitoring:status:{$mother->id}";

        return response()->json(Cache::remember($cacheKey, now()->addSeconds(10), function () use ($mother) {
            $latest = $mother->latestMonitoringEntry()->first();

            return [
                'risk_level' => $latest?->risk_level ?? $mother->risk_rating ?? 'low',
                'latest_entry_id' => $latest?->id,
            ];
        }));
    }

    public function storeOwnEntry(Request $request): JsonResponse
    {
        $this->currentMother($request);

        abort(403, 'Program Staff manages maternal vitals and weight records.');
    }

    public function desk(Request $request): JsonResponse
    {
        $worker = $this->currentWorker($request);
        $search = trim((string) $request->query('q', ''));
        $risk = $request->query('risk', 'all');

        $mothers = $worker->mothers()
            ->with(['user:id,name,email', 'latestMonitoringEntry'])
            ->get()
            ->map(function (Mother $mother) use ($request) {
                $this->ensureBaselineEntry($mother, $request->user()->id);
                return $this->motherProfile($mother->fresh(['user', 'latestMonitoringEntry']));
            })
            ->when($search !== '', function ($items) use ($search) {
                $needle = mb_strtolower($search);

                return $items->filter(function ($mother) use ($needle) {
                    return str_contains(mb_strtolower($mother['name'] ?? ''), $needle)
                        || str_contains(mb_strtolower($mother['patient_code'] ?? ''), $needle)
                        || str_contains(mb_strtolower($mother['barangay'] ?? ''), $needle)
                        || str_contains((string) ($mother['pregnancy_week'] ?? ''), $needle)
                        || str_contains((string) ($mother['age'] ?? ''), $needle);
                })->values();
            })
            ->when(in_array($risk, ['low', 'medium', 'high'], true), fn ($items) => $items
                ->filter(fn ($mother) => $mother['risk_level'] === $risk)
                ->values());

        $stats = [
            'high_risk_mothers' => $mothers->where('risk_level', 'high')->count(),
            'moderate_risk_mothers' => $mothers->where('risk_level', 'medium')->count(),
            'low_risk_mothers' => $mothers->where('risk_level', 'low')->count(),
            'average_blood_sugar_mgdl' => round($mothers->avg(fn ($mother) => $mother['latest_entry']['blood_sugar_mgdl'] ?? 0), 2),
            'active_mothers' => $mothers->count(),
        ];

        return response()->json([
            'stats' => $stats,
            'mothers' => $mothers,
        ]);
    }

    public function showMother(Request $request, Mother $mother): JsonResponse
    {
        $this->authorizeAssignedMother($request, $mother);
        $this->ensureBaselineEntry($mother, $request->user()->id);

        return response()->json([
            'profile' => $this->motherProfile($mother->fresh(['user', 'latestMonitoringEntry'])),
            'summary' => $this->summaryForMother($mother),
        ]);
    }

    public function storeMotherEntry(Request $request, Mother $mother): JsonResponse
    {
        $this->authorizeAssignedMother($request, $mother);
        $entry = $this->createEntry($request, $mother);
        $this->forgetMotherMonitoringCache($mother);

        return response()->json([
            'message' => 'Monitoring entry saved successfully.',
            'entry' => $this->entryData($entry),
            'summary' => $this->summaryForMother($mother),
        ], 201);
    }

    public function exportPdf(Request $request)
    {
        $worker = $this->currentWorker($request);
        $mothers = $worker->mothers()
            ->with(['user:id,name,email', 'latestMonitoringEntry'])
            ->get()
            ->map(fn (Mother $mother) => $this->motherProfile($mother));

        $pdf = Pdf::loadView('reports.maternal-monitoring', [
            'mothers' => $mothers,
            'generatedAt' => now()->format('F d, Y h:i A'),
            'workerName' => $worker->user?->name ?? 'Program Staff',
        ]);

        return $pdf->download('project-inay-maternal-monitoring-report.pdf');
    }

    private function createEntry(Request $request, Mother $mother): MaternalMonitoringEntry
    {
        $validated = $request->validate([
            'pregnancy_week' => ['required', 'integer', 'min:1', 'max:42'],
            'systolic_bp' => ['nullable', 'integer', 'min:60', 'max:220'],
            'diastolic_bp' => ['nullable', 'integer', 'min:40', 'max:140'],
            'blood_sugar_mgdl' => ['nullable', 'numeric', 'min:40', 'max:400'],
            'body_temperature_c' => ['nullable', 'numeric', 'min:34', 'max:43'],
            'heart_rate' => ['nullable', 'integer', 'min:40', 'max:180'],
            'weight_kg' => ['nullable', 'numeric', 'min:30', 'max:200'],
            'hemoglobin_gdl' => ['nullable', 'numeric', 'min:4', 'max:20'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'recorded_at' => ['nullable', 'date'],
        ]);

        $riskLevel = $this->classifyRisk($validated, $mother);

        return DB::transaction(function () use ($validated, $riskLevel, $mother, $request) {
            $entry = $mother->monitoringEntries()->create([
                ...$validated,
                'blood_sugar_mgdl' => $validated['blood_sugar_mgdl'] ?? null,
                'body_temperature_c' => $validated['body_temperature_c'] ?? null,
                'hemoglobin_gdl' => $validated['hemoglobin_gdl'] ?? null,
                'risk_level' => $riskLevel,
                'recorded_by_user_id' => $request->user()->id,
                'recorded_at' => $validated['recorded_at'] ?? now(),
            ]);

            $mother->update([
                'pregnancy_week' => $validated['pregnancy_week'],
                'pregnancy_month' => (int) ceil($validated['pregnancy_week'] / 4),
                'last_weight_kg' => $validated['weight_kg'] ?? $mother->last_weight_kg,
                'risk_rating' => $riskLevel,
            ]);

            return $entry;
        });
    }

    private function summaryForMother(Mother $mother): array
    {
        $mother = $mother->fresh([
            'user',
            'latestMonitoringEntry.recordedBy:id,name,role',
            'monitoringEntries' => fn ($query) => $query
                ->select([
                    'id',
                    'mother_id',
                    'recorded_by_user_id',
                    'pregnancy_week',
                    'systolic_bp',
                    'diastolic_bp',
                    'blood_sugar_mgdl',
                    'body_temperature_c',
                    'heart_rate',
                    'weight_kg',
                    'hemoglobin_gdl',
                    'risk_level',
                    'notes',
                    'recorded_at',
                ])
                ->latest('recorded_at')
                ->latest('id')
                ->limit(60),
        ]);
        $entries = $mother->monitoringEntries
            ->sortBy([
                ['recorded_at', 'asc'],
                ['id', 'asc'],
            ])
            ->values();
        $latest = $mother->latestMonitoringEntry;
        $prePregnancyWeight = (float) ($mother->pre_pregnancy_weight_kg ?? 62);
        $weightLogs = $entries
            ->filter(fn ($entry) => $entry->weight_kg !== null)
            ->values()
            ->map(fn (MaternalMonitoringEntry $entry) => [
                'id' => $entry->id,
                'date' => $entry->recorded_at?->toDateString(),
                'recorded_at' => $entry->recorded_at?->toIso8601String(),
                'pregnancy_week' => $entry->pregnancy_week,
                'weight_kg' => (float) $entry->weight_kg,
                'notes' => $entry->notes,
            ]);
        $bloodPressureLogs = $entries
            ->filter(fn ($entry) => $entry->systolic_bp !== null && $entry->diastolic_bp !== null)
            ->values()
            ->map(function (MaternalMonitoringEntry $entry) {
                $status = $this->bloodPressureStatus($entry->systolic_bp, $entry->diastolic_bp);

                return [
                    'id' => $entry->id,
                    'date' => $entry->recorded_at?->toDateString(),
                    'recorded_at' => $entry->recorded_at?->toIso8601String(),
                    'pregnancy_week' => $entry->pregnancy_week,
                    'systolic' => $entry->systolic_bp,
                    'diastolic' => $entry->diastolic_bp,
                    'blood_pressure' => "{$entry->systolic_bp}/{$entry->diastolic_bp}",
                    'status' => $status['label'],
                    'status_key' => $status['key'],
                    'severity' => $status['severity'],
                ];
            });
        $weightAnalytics = $this->analytics->analyze(
            $weightLogs->all(),
            $prePregnancyWeight,
        );

        return [
            'latest' => $latest ? $this->entryData($latest) : null,
            'weight_logs' => $weightLogs,
            'weight_trend' => $weightAnalytics['weight_trend'],
            'weight_summary' => $weightAnalytics['weight_summary'],
            'weight_analytics' => $weightAnalytics['analytics'],
            'blood_pressure_logs' => $bloodPressureLogs,
            'blood_pressure_trend' => $bloodPressureLogs,
            'recommendations' => $this->recommendations($latest, $mother),
            'guidelines' => [
                ['title' => 'Blood Pressure', 'optimal' => '< 120/80 mmHg', 'warning' => '>= 140/90 mmHg'],
                ['title' => 'Blood Sugar', 'optimal' => '< 95 mg/dL fasting', 'warning' => 'Post-meal must stay < 140 mg/dL'],
                ['title' => 'Hemoglobin', 'optimal' => '> 11.5 g/dL', 'warning' => 'Anemia risk below 11 g/dL'],
                ['title' => 'Weight Gain', 'optimal' => '11 - 16 kg total gain', 'warning' => 'Review if outside recommended range'],
            ],
        ];
    }

    private function entryData(MaternalMonitoringEntry $entry): array
    {
        $entry->loadMissing('recordedBy:id,name,role');

        return [
            'id' => $entry->id,
            'recorded_by_user_id' => $entry->recorded_by_user_id,
            'recorded_by' => $entry->recordedBy?->name ?? 'Program Staff',
            'recorded_by_role' => $entry->recordedBy?->role,
            'pregnancy_week' => $entry->pregnancy_week,
            'systolic_bp' => $entry->systolic_bp,
            'diastolic_bp' => $entry->diastolic_bp,
            'blood_pressure' => $entry->systolic_bp && $entry->diastolic_bp
                ? "{$entry->systolic_bp}/{$entry->diastolic_bp}"
                : null,
            'blood_sugar_mgdl' => $entry->blood_sugar_mgdl !== null ? (float) $entry->blood_sugar_mgdl : null,
            'body_temperature_c' => $entry->body_temperature_c !== null ? (float) $entry->body_temperature_c : null,
            'heart_rate' => $entry->heart_rate,
            'weight_kg' => $entry->weight_kg !== null ? (float) $entry->weight_kg : null,
            'hemoglobin_gdl' => $entry->hemoglobin_gdl !== null ? (float) $entry->hemoglobin_gdl : null,
            'risk_level' => $entry->risk_level,
            'notes' => $entry->notes,
            'recorded_at' => $entry->recorded_at?->toIso8601String(),
        ];
    }

    private function bloodPressureStatus(int $systolic, int $diastolic): array
    {
        if ($systolic >= 180 || $diastolic >= 120) {
            return [
                'key' => 'crisis',
                'label' => 'Hypertensive Crisis',
                'severity' => 'high',
            ];
        }

        if ($systolic >= 160 || $diastolic >= 100) {
            return [
                'key' => 'stage_2',
                'label' => 'High Blood Pressure (Stage 2)',
                'severity' => 'high',
            ];
        }

        if ($systolic >= 140 || $diastolic >= 90) {
            return [
                'key' => 'stage_1',
                'label' => 'High Blood Pressure (Stage 1)',
                'severity' => 'medium',
            ];
        }

        if ($systolic >= 130 || $diastolic >= 85) {
            return [
                'key' => 'elevated',
                'label' => 'Elevated',
                'severity' => 'medium',
            ];
        }

        return [
            'key' => 'normal',
            'label' => 'Normal',
            'severity' => 'low',
        ];
    }

    private function motherProfile(Mother $mother): array
    {
        $latest = $mother->latestMonitoringEntry;

        return [
            'id' => $mother->id,
            'patient_code' => 'MAT-RHU-' . str_pad((string) $mother->id, 3, '0', STR_PAD_LEFT),
            'name' => $mother->user?->name ?? 'Registered Mother',
            'email' => $mother->email ?? $mother->user?->email,
            'profile_photo_url' => $this->publicFileUrl($mother->profile_photo_path),
            'age' => $mother->birth_date?->age,
            'phone' => $mother->phone,
            'address' => $mother->address,
            'barangay' => $mother->barangay,
            'blood_type' => $mother->blood_type,
            'due_date' => $mother->due_date?->toDateString(),
            'pregnancy_week' => $latest?->pregnancy_week ?? $mother->pregnancy_week,
            'pregnancy_month' => $mother->pregnancy_month,
            'previous_deliveries' => $mother->previous_deliveries,
            'pre_pregnancy_weight_kg' => $mother->pre_pregnancy_weight_kg !== null ? (float) $mother->pre_pregnancy_weight_kg : null,
            'risk_level' => $latest?->risk_level ?? $mother->risk_rating ?? 'low',
            'latest_entry' => $latest ? $this->entryData($latest) : null,
        ];
    }

    private function publicFileUrl(?string $path): ?string
    {
        if (!$path) {
            return null;
        }

        return request()->getSchemeAndHttpHost() . '/storage/' . ltrim($path, '/');
    }

    private function classifyRisk(array $entry, Mother $mother): string
    {
        $systolic = $entry['systolic_bp'] ?? null;
        $diastolic = $entry['diastolic_bp'] ?? null;
        $sugar = $entry['blood_sugar_mgdl'] ?? null;
        $hemoglobin = $entry['hemoglobin_gdl'] ?? null;
        $temperature = $entry['body_temperature_c'] ?? null;
        $heartRate = $entry['heart_rate'] ?? null;
        $weight = $entry['weight_kg'] ?? null;
        $prePregnancyWeight = (float) ($mother->pre_pregnancy_weight_kg ?? 62);
        $gain = $weight !== null ? (float) $weight - $prePregnancyWeight : null;

        if (
            ($systolic !== null && $systolic >= 140)
            || ($diastolic !== null && $diastolic >= 90)
            || ($systolic !== null && $systolic < 90)
            || ($diastolic !== null && $diastolic < 60)
            || ($sugar !== null && $sugar >= 140)
            || ($hemoglobin !== null && $hemoglobin < 11)
            || ($temperature !== null && $temperature >= 38)
            || ($heartRate !== null && $heartRate >= 120)
        ) {
            return 'high';
        }

        if (
            ($systolic !== null && $systolic >= 130)
            || ($diastolic !== null && $diastolic >= 85)
            || ($sugar !== null && $sugar > 120)
            || ($hemoglobin !== null && $hemoglobin < 11.5)
            || ($gain !== null && ($gain < 7 || $gain > 16))
        ) {
            return 'medium';
        }

        return 'low';
    }

    private function recommendations(?MaternalMonitoringEntry $entry, Mother $mother): array
    {
        if (!$entry) {
            return ['Log your first maternal monitoring entry to activate trend recommendations.'];
        }

        if ($entry->risk_level === 'high') {
            return [
                'Warning signs detected. Contact your Program Staff immediately.',
                'Prepare your prenatal record and proceed to the nearest health center if symptoms worsen.',
            ];
        }

        if ($entry->risk_level === 'medium') {
            return [
                'Some values need closer monitoring. Coordinate your next vital signs check with Program Staff.',
                'Keep hydration, prenatal vitamins, and your next scheduled checkup on track.',
            ];
        }

        return [
            'All maternal indicators are within healthy pregnancy thresholds.',
            'Continue taking prenatal vitamins and maintain healthy hydration.',
            'Attend your next prenatal checkup and keep weight logs updated.',
        ];
    }

    private function ensureBaselineEntry(Mother $mother, ?int $userId = null): void
    {
        if ($mother->monitoringEntries()->exists()) {
            return;
        }

        $data = [
            'pregnancy_week' => $mother->pregnancy_week ?? 32,
            'systolic_bp' => 120,
            'diastolic_bp' => 80,
            'blood_sugar_mgdl' => 95,
            'body_temperature_c' => 36.7,
            'heart_rate' => 86,
            'weight_kg' => $mother->last_weight_kg ?? 74,
            'hemoglobin_gdl' => 12.5,
            'notes' => 'Initial maternal monitoring baseline.',
        ];

        $mother->monitoringEntries()->create([
            ...$data,
            'recorded_by_user_id' => $userId ?? $mother->user_id,
            'risk_level' => $this->classifyRisk($data, $mother),
            'recorded_at' => now(),
        ]);
    }

    private function forgetMotherMonitoringCache(Mother $mother): void
    {
        Cache::forget("maternal-monitoring:me:{$mother->id}");
        Cache::forget("maternal-monitoring:status:{$mother->id}");
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
