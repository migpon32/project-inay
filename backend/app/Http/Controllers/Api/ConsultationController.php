<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Consultation;
use App\Models\ConsultationMessage;
use App\Models\HealthcareWorker;
use App\Models\IECVideo;
use App\Models\Mother;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ConsultationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        [$role, $profile] = $this->actor($request);
        $userId = $request->user()->id;
        $perPage = min(max((int) $request->query('per_page', 30), 1), 50);

        $query = Consultation::query()
            ->with([
                'mother.user:id,name,email',
                'healthWorker.user:id,name,email',
                'latestMessage.sender:id,name',
            ])
            ->withCount([
                'messages as unread_count' => fn (Builder $query) => $query
                    ->where('sender_user_id', '!=', $userId)
                    ->whereNull('read_at'),
            ]);

        if ($role === 'health_worker') {
            $query->where('health_worker_id', $profile->id);
        } else {
            $query->where('mother_id', $profile->id);
        }

        $paginator = $query
            ->orderByRaw('CASE WHEN last_message_at IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('last_message_at')
            ->orderByDesc('created_at')
            ->paginate($perPage);

        $consultations = $paginator->getCollection()
            ->map(fn (Consultation $consultation) => $this->consultationData($consultation))
            ->values();

        return response()->json([
            'consultations' => $consultations,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        [$role, $profile] = $this->actor($request);

        $count = ConsultationMessage::query()
            ->where('sender_user_id', '!=', $request->user()->id)
            ->whereNull('read_at')
            ->whereHas('consultation', function (Builder $query) use ($role, $profile) {
                $column = $role === 'health_worker' ? 'health_worker_id' : 'mother_id';
                $query->where($column, $profile->id);
            })
            ->count();

        return response()->json(['unread_count' => $count]);
    }

    public function workers(Request $request): JsonResponse
    {
        [$role, $mother] = $this->actor($request);
        abort_unless($role === 'mother', 403, 'Mother portal access is required.');

        $workers = $mother->healthcareWorkers()
            ->with('user:id,name,email')
            ->orderBy('healthcare_workers.created_at')
            ->get()
            ->map(fn (HealthcareWorker $worker) => [
                'id' => $worker->id,
                'name' => $worker->user?->name ?? 'Program Staff',
                'profession' => $worker->profession,
                'facility_name' => $worker->facility_name,
                'position_title' => $worker->position_title,
                'verification_status' => $worker->verification_status,
            ]);

        return response()->json(['workers' => $workers]);
    }

    public function store(Request $request): JsonResponse
    {
        [$role, $mother] = $this->actor($request);
        abort_unless($role === 'mother', 403, 'Mother portal access is required.');

        $validated = $request->validate([
            'health_worker_id' => ['required', 'integer', 'exists:healthcare_workers,id'],
            'topic' => ['required', 'string', 'max:64'],
            'subject' => ['required', 'string', 'max:255'],
            'initial_message' => ['required', 'string', 'max:5000'],
        ]);

        abort_unless(
            $mother->healthcareWorkers()->whereKey($validated['health_worker_id'])->exists(),
            422,
            'You can only start a consultation with Program Staff assigned to your casefile.'
        );

        $riskLevel = $this->detectedRisk($validated['initial_message']);

        $consultation = DB::transaction(function () use ($validated, $mother, $request, $riskLevel) {
            $consultation = Consultation::create([
                'mother_id' => $mother->id,
                'health_worker_id' => $validated['health_worker_id'],
                'topic' => $validated['topic'],
                'subject' => $validated['subject'],
                'risk_level' => $riskLevel,
                'status' => 'open',
                'last_message_at' => now(),
            ]);

            $consultation->messages()->create([
                'sender_user_id' => $request->user()->id,
                'body' => $validated['initial_message'],
            ]);

            return $consultation;
        });

        return response()->json([
            'message' => 'Consultation sent successfully.',
            'consultation' => $this->loadedConsultation($consultation, $request->user()->id),
        ], 201);
    }

    public function show(Request $request, Consultation $consultation): JsonResponse
    {
        $this->authorizeParticipant($request, $consultation);

        $consultation->messages()
            ->where('sender_user_id', '!=', $request->user()->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json([
            'consultation' => $this->loadedConsultation($consultation, $request->user()->id, true),
        ]);
    }

    public function sendMessage(Request $request, Consultation $consultation): JsonResponse
    {
        [$role] = $this->authorizeParticipant($request, $consultation);

        if ($consultation->status === 'resolved') {
            return response()->json([
                'message' => 'This consultation is resolved. Reopen it before sending another message.',
            ], 422);
        }

        $validated = $request->validate([
            'body' => ['nullable', 'string', 'max:1000'],
            'attachment' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,pdf,mp4,mov,webm', 'max:30720'],
            'iec_video_id' => ['nullable', 'integer', 'exists:iec_videos,id'],
        ]);

        if ($request->hasFile('attachment')) {
            $file = $request->file('attachment');
            $isVideo = str_starts_with((string) $file->getMimeType(), 'video/');
            $maxSize = $isVideo ? 25 * 1024 * 1024 : 10 * 1024 * 1024;

            if ($file->getSize() > $maxSize) {
                return response()->json([
                    'message' => $isVideo
                        ? 'Video attachments must be 25 MB or smaller.'
                        : 'Photo, image, and document attachments must be 10 MB or smaller.',
                    'errors' => [
                        'attachment' => [$isVideo
                            ? 'Video attachments must be 25 MB or smaller.'
                            : 'Photo, image, and document attachments must be 10 MB or smaller.'],
                    ],
                ], 422);
            }
        }

        if (blank($validated['body'] ?? null) && !$request->hasFile('attachment') && empty($validated['iec_video_id'])) {
            return response()->json([
                'message' => 'Enter a message or attach a file or IEC resource.',
                'errors' => ['body' => ['Enter a message or attach a file or IEC resource.']],
            ], 422);
        }

        if (!empty($validated['iec_video_id']) && $role !== 'health_worker') {
            return response()->json([
                'message' => 'Only Program Staff can attach IEC resources.',
            ], 403);
        }

        $attachment = [];
        if ($request->hasFile('attachment')) {
            $file = $request->file('attachment');
            $attachment = [
                'attachment_path' => $file->store('consultation-attachments', 'local'),
                'attachment_name' => $file->getClientOriginalName(),
                'attachment_type' => $file->getMimeType(),
                'attachment_size' => $file->getSize(),
            ];
        }

        $message = DB::transaction(function () use ($consultation, $request, $validated, $attachment) {
            $message = $consultation->messages()->create([
                'sender_user_id' => $request->user()->id,
                'body' => $validated['body'] ?? null,
                'iec_video_id' => $validated['iec_video_id'] ?? null,
                ...$attachment,
            ]);

            $updates = ['last_message_at' => now()];
            if ($this->detectedRisk($validated['body'] ?? '') === 'high') {
                $updates['risk_level'] = 'high';
            }
            $consultation->update($updates);

            return $message;
        });

        $message->load(['sender:id,name', 'iecVideo:id,title,video_url,duration_minutes,category']);

        return response()->json([
            'message' => 'Message sent.',
            'consultation_message' => $this->messageData($message),
        ], 201);
    }

    public function update(Request $request, Consultation $consultation): JsonResponse
    {
        [$role] = $this->authorizeParticipant($request, $consultation);

        $validated = $request->validate([
            'risk_level' => ['sometimes', 'in:low,medium,high'],
            'status' => ['sometimes', 'in:open,resolved,escalated'],
            'outcome' => ['nullable', 'string', 'max:5000'],
        ]);

        if ($role === 'mother') {
            $allowed = array_keys($validated) === ['status'] && $validated['status'] === 'resolved';
            abort_unless($allowed, 403, 'Mothers can only mark their consultation as resolved.');
        }

        if (($validated['status'] ?? null) === 'resolved') {
            $validated['resolved_at'] = now();
        } elseif (($validated['status'] ?? null) === 'escalated') {
            $validated['escalated_at'] = now();
            $validated['risk_level'] = 'high';
        } elseif (($validated['status'] ?? null) === 'open') {
            $validated['resolved_at'] = null;
            $validated['escalated_at'] = null;
        }

        $consultation->update($validated);

        return response()->json([
            'message' => 'Consultation updated successfully.',
            'consultation' => $this->loadedConsultation($consultation, $request->user()->id),
        ]);
    }

    public function attachment(Request $request, ConsultationMessage $message)
    {
        $this->authorizeParticipant($request, $message->consultation);
        abort_unless($message->attachment_path, 404, 'Attachment not found.');
        abort_unless(Storage::disk('local')->exists($message->attachment_path), 404, 'Attachment not found.');

        return Storage::disk('local')->response(
            $message->attachment_path,
            $message->attachment_name,
            ['Content-Type' => $message->attachment_type]
        );
    }

    public function iecResources(Request $request): JsonResponse
    {
        [$role] = $this->actor($request);
        abort_unless($role === 'health_worker', 403, 'Program staff access is required.');

        $resources = IECVideo::query()
            ->with('module:id,month_number,title')
            ->latest()
            ->limit(50)
            ->get(['id', 'iec_module_id', 'title', 'video_url', 'duration_minutes', 'category'])
            ->map(fn (IECVideo $video) => [
                'id' => $video->id,
                'title' => $video->title,
                'url' => $video->video_url,
                'duration_minutes' => $video->duration_minutes,
                'category' => $video->category,
                'month_number' => $video->module?->month_number,
            ]);

        return response()->json(['resources' => $resources]);
    }

    private function actor(Request $request): array
    {
        $user = $request->user()->loadMissing(['mother', 'healthcareWorker']);

        if ($user->healthcareWorker && $user->tokenCan('health_worker')) {
            return ['health_worker', $user->healthcareWorker];
        }

        if ($user->mother && $user->tokenCan('mother')) {
            return ['mother', $user->mother];
        }

        abort(403, 'A valid Project INAY portal is required.');
    }

    private function authorizeParticipant(Request $request, Consultation $consultation): array
    {
        [$role, $profile] = $this->actor($request);
        $isParticipant = $role === 'health_worker'
            ? $consultation->health_worker_id === $profile->id
            : $consultation->mother_id === $profile->id;

        abort_unless($isParticipant, 403, 'You do not have access to this consultation.');

        return [$role, $profile];
    }

    private function loadedConsultation(Consultation $consultation, int $userId, bool $withMessages = false): array
    {
        $relations = [
            'mother.user:id,name,email',
            'healthWorker.user:id,name,email',
            'latestMessage.sender:id,name',
        ];

        $consultation->load($relations);
        if ($withMessages) {
            $messages = $consultation->messages()
                ->with([
                    'sender:id,name',
                    'iecVideo:id,title,video_url,duration_minutes,category',
                ])
                ->latest()
                ->limit(100)
                ->get()
                ->sortBy('created_at')
                ->values();

            $consultation->setRelation('messages', $messages);
        }
        $consultation->loadCount([
            'messages as unread_count' => fn (Builder $query) => $query
                ->where('sender_user_id', '!=', $userId)
                ->whereNull('read_at'),
        ]);

        return $this->consultationData($consultation, $withMessages);
    }

    private function consultationData(Consultation $consultation, bool $withMessages = false): array
    {
        $data = [
            'id' => $consultation->id,
            'topic' => $consultation->topic,
            'subject' => $consultation->subject,
            'risk_level' => $consultation->risk_level,
            'status' => $consultation->status,
            'outcome' => $consultation->outcome,
            'unread_count' => (int) ($consultation->unread_count ?? 0),
            'last_message_at' => $consultation->last_message_at?->toIso8601String(),
            'created_at' => $consultation->created_at?->toIso8601String(),
            'resolved_at' => $consultation->resolved_at?->toIso8601String(),
            'escalated_at' => $consultation->escalated_at?->toIso8601String(),
            'mother' => $this->motherData($consultation->mother),
            'health_worker' => $this->workerData($consultation->healthWorker),
            'last_message' => $consultation->latestMessage
                ? $this->messageData($consultation->latestMessage)
                : null,
        ];

        if ($withMessages) {
            $data['messages'] = $consultation->messages
                ->sortBy('created_at')
                ->values()
                ->map(fn (ConsultationMessage $message) => $this->messageData($message));
        }

        return $data;
    }

    private function motherData(?Mother $mother): ?array
    {
        if (!$mother) {
            return null;
        }

        return [
            'id' => $mother->id,
            'name' => $mother->user?->name ?? 'Registered Mother',
            'email' => $mother->email ?? $mother->user?->email,
            'phone' => $mother->phone,
            'address' => $mother->address,
            'age' => $mother->birth_date?->age,
            'blood_type' => $mother->blood_type,
            'pregnancy_status' => $mother->pregnancy_status,
            'pregnancy_week' => $mother->pregnancy_week,
            'postpartum_week' => $mother->postpartum_week,
            'due_date' => $mother->due_date?->toDateString(),
            'next_scheduled_visit' => $mother->next_scheduled_visit?->toDateString(),
            'last_weight_kg' => $mother->last_weight_kg !== null ? (float) $mother->last_weight_kg : null,
            'risk_rating' => $mother->risk_rating,
            'co_monitoring_person' => $mother->co_monitoring_person,
        ];
    }

    private function workerData(?HealthcareWorker $worker): ?array
    {
        if (!$worker) {
            return null;
        }

        return [
            'id' => $worker->id,
            'name' => $worker->user?->name ?? 'Program Staff',
            'profession' => $worker->profession,
            'facility_name' => $worker->facility_name,
            'position_title' => $worker->position_title,
        ];
    }

    private function messageData(ConsultationMessage $message): array
    {
        return [
            'id' => $message->id,
            'sender_user_id' => $message->sender_user_id,
            'sender_name' => $message->sender?->name ?? 'Project INAY User',
            'body' => $message->body,
            'attachment' => $message->attachment_path ? [
                'url' => "/api/consultations/messages/{$message->id}/attachment",
                'name' => $message->attachment_name,
                'type' => $message->attachment_type,
                'size' => $message->attachment_size,
            ] : null,
            'iec_resource' => $message->iecVideo ? [
                'id' => $message->iecVideo->id,
                'title' => $message->iecVideo->title,
                'url' => $message->iecVideo->video_url,
                'duration_minutes' => $message->iecVideo->duration_minutes,
                'category' => $message->iecVideo->category,
            ] : null,
            'read_at' => $message->read_at?->toIso8601String(),
            'created_at' => $message->created_at?->toIso8601String(),
        ];
    }

    private function detectedRisk(string $message): string
    {
        $normalized = mb_strtolower($message);
        $dangerPhrases = [
            'severe bleeding',
            'heavy bleeding',
            'difficulty breathing',
            'cannot breathe',
            'chest pain',
            'seizure',
            'unconscious',
            'no fetal movement',
            'baby is not moving',
        ];

        foreach ($dangerPhrases as $phrase) {
            if (str_contains($normalized, $phrase)) {
                return 'high';
            }
        }

        return 'low';
    }
}
