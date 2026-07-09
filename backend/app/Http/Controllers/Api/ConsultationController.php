<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Consultation;
use App\Models\ConsultationCall;
use App\Models\ConsultationCallSignal;
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
    private const UNSENT_MESSAGE_BODY = 'This message was unsent.';
    private const MESSAGE_PAGE_SIZE = 30;

    public function index(Request $request): JsonResponse
    {
        [$role, $profile] = $this->actor($request);
        $userId = $request->user()->id;
        $perPage = min(max((int) $request->query('per_page', 30), 1), 50);

        $query = Consultation::query()
            ->with([
                'mother.user:id,name,email',
                'healthWorker.user:id,name,email',
                'latestMessage.sender:id,name,role',
            ])
            ->withCount([
                'messages as unread_count' => fn (Builder $query) => $query
                    ->where(fn (Builder $messageQuery) => $this->notOwnedByViewer($messageQuery, $userId, $role))
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
            ->map(fn (Consultation $consultation) => $this->consultationData($consultation, false, $userId, $role))
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
            ->where(fn (Builder $query) => $this->notOwnedByViewer($query, $request->user()->id, $role))
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

            $identity = $this->messageIdentity($consultation, $request->user()->id, 'mother');

            $consultation->messages()->create([
                'sender_user_id' => $request->user()->id,
                'sender_role' => $identity['sender_role'],
                'receiver_user_id' => $identity['receiver_user_id'],
                'receiver_role' => $identity['receiver_role'],
                'body' => $validated['initial_message'],
            ]);

            return $consultation;
        });

        return response()->json([
            'message' => 'Consultation sent successfully.',
            'consultation' => $this->loadedConsultation($consultation, $request->user()->id, false, $role),
        ], 201);
    }

    public function show(Request $request, Consultation $consultation): JsonResponse
    {
        [$role] = $this->authorizeParticipant($request, $consultation);

        $consultation->messages()
            ->where(fn (Builder $query) => $this->notOwnedByViewer($query, $request->user()->id, $role))
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json([
            'consultation' => $this->loadedConsultation($consultation, $request->user()->id, true, $role),
        ]);
    }

    public function messages(Request $request, Consultation $consultation): JsonResponse
    {
        [$role] = $this->authorizeParticipant($request, $consultation);

        $limit = min(max((int) $request->query('limit', self::MESSAGE_PAGE_SIZE), 10), 50);
        $beforeId = (int) $request->query('before_id', 0);

        $query = $consultation->messages()
            ->with([
                'sender:id,name,role',
                'iecVideo:id,title,video_url,duration_minutes,category',
            ]);

        if ($beforeId > 0) {
            $query->where('id', '<', $beforeId);
        }

        $messages = $query
            ->latest('id')
            ->limit($limit + 1)
            ->get();
        $hasOlder = $messages->count() > $limit;
        $pageMessages = $messages
            ->take($limit)
            ->sortBy('id')
            ->values();

        $oldestId = $pageMessages->first()?->id;

        return response()->json([
            'messages' => $pageMessages
                ->map(fn (ConsultationMessage $message) => $this->messageData($message, $request->user()->id, $role))
                ->values(),
            'meta' => [
                'oldest_id' => $oldestId,
                'has_older' => $hasOlder,
                'limit' => $limit,
            ],
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
            'attachment' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,pdf,mp4,mov,webm,mp3,wav,ogg,m4a', 'max:30720'],
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

        $message = DB::transaction(function () use ($consultation, $request, $validated, $attachment, $role) {
            $identity = $this->messageIdentity($consultation, $request->user()->id, $role);

            $message = $consultation->messages()->create([
                'sender_user_id' => $request->user()->id,
                'sender_role' => $identity['sender_role'],
                'receiver_user_id' => $identity['receiver_user_id'],
                'receiver_role' => $identity['receiver_role'],
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

        $message->load(['sender:id,name,role', 'iecVideo:id,title,video_url,duration_minutes,category']);

        return response()->json([
            'message' => 'Message sent.',
            'consultation_message' => $this->messageData($message, $request->user()->id, $role),
        ], 201);
    }

    public function unsendMessage(Request $request, Consultation $consultation, ConsultationMessage $message): JsonResponse
    {
        [$role] = $this->authorizeParticipant($request, $consultation);
        abort_unless(
            $message->consultation_id === $consultation->id,
            404,
            'Message not found in this consultation.'
        );
        abort_unless(
            $this->isMessageOwnedByViewer($message, $request->user()->id, $role),
            403,
            'You can only unsend your own messages.'
        );

        DB::transaction(function () use ($message) {
            if ($message->attachment_path && Storage::disk('local')->exists($message->attachment_path)) {
                Storage::disk('local')->delete($message->attachment_path);
            }

            $message->update([
                'body' => self::UNSENT_MESSAGE_BODY,
                'attachment_path' => null,
                'attachment_name' => null,
                'attachment_type' => null,
                'attachment_size' => null,
                'iec_video_id' => null,
                'unsent_at' => now(),
            ]);
        });

        return response()->json([
            'message' => 'Message unsent.',
            'consultation_message' => $this->messageData($message->fresh([
                'sender:id,name,role',
                'iecVideo:id,title,video_url,duration_minutes,category',
            ]), $request->user()->id, $role),
        ]);
    }

    public function activeCall(Request $request, Consultation $consultation): JsonResponse
    {
        $this->authorizeParticipant($request, $consultation);
        $userId = $request->user()->id;

        $call = $consultation->calls()
            ->whereIn('status', ['ringing', 'accepted'])
            ->where(function (Builder $query) use ($userId) {
                $query->where('initiator_user_id', $userId)
                    ->orWhere('receiver_user_id', $userId);
            })
            ->latest('updated_at')
            ->first();

        return response()->json([
            'call' => $call ? $this->callData($call, $userId) : null,
        ]);
    }

    public function activeAnyCall(Request $request): JsonResponse
    {
        [$role, $profile] = $this->actor($request);
        $userId = $request->user()->id;

        $call = ConsultationCall::query()
            ->with([
                'consultation',
                'initiator:id,name',
                'receiver:id,name',
            ])
            ->whereIn('status', ['ringing', 'accepted'])
            ->where(function (Builder $query) use ($userId) {
                $query->where('initiator_user_id', $userId)
                    ->orWhere('receiver_user_id', $userId);
            })
            ->whereHas('consultation', function (Builder $query) use ($role, $profile) {
                $column = $role === 'health_worker' ? 'health_worker_id' : 'mother_id';
                $query->where($column, $profile->id);
            })
            ->latest('updated_at')
            ->first();

        return response()->json([
            'call' => $call ? $this->callData($call, $userId) : null,
        ]);
    }

    public function startCall(Request $request, Consultation $consultation): JsonResponse
    {
        $this->authorizeParticipant($request, $consultation);
        $consultation->loadMissing(['mother.user:id,name', 'healthWorker.user:id,name']);
        $userId = $request->user()->id;
        $receiverId = $this->callReceiverUserId($consultation, $userId);

        abort_unless($receiverId, 422, 'The other participant is not available for video calls.');

        $call = DB::transaction(function () use ($consultation, $userId, $receiverId) {
            $consultation->calls()
                ->whereIn('status', ['ringing', 'accepted'])
                ->update([
                    'status' => 'ended',
                    'ended_at' => now(),
                ]);

            return $consultation->calls()->create([
                'initiator_user_id' => $userId,
                'receiver_user_id' => $receiverId,
                'status' => 'ringing',
                'started_at' => now(),
            ]);
        });

        return response()->json([
            'message' => 'Video call started.',
            'call' => $this->callData($call, $userId),
        ], 201);
    }

    public function acceptCall(Request $request, Consultation $consultation, ConsultationCall $call): JsonResponse
    {
        $this->authorizeParticipant($request, $consultation);
        $this->authorizeCall($consultation, $call, $request->user()->id);
        abort_unless(
            $call->receiver_user_id === $request->user()->id,
            403,
            'Only the receiving participant can accept this call.'
        );

        if ($call->status === 'ringing') {
            $call->update([
                'status' => 'accepted',
                'answered_at' => now(),
            ]);
        } elseif ($call->status !== 'accepted') {
            return response()->json([
                'message' => 'This video call is no longer available.',
                'call' => $this->callData($call->fresh(), $request->user()->id),
            ], 409);
        }

        return response()->json([
            'message' => 'Video call accepted.',
            'call' => $this->callData($call->fresh(), $request->user()->id),
        ]);
    }

    public function endCall(Request $request, Consultation $consultation, ConsultationCall $call): JsonResponse
    {
        $this->authorizeParticipant($request, $consultation);
        $this->authorizeCall($consultation, $call, $request->user()->id);

        if (!in_array($call->status, ['ended', 'missed', 'declined', 'cancelled'], true)) {
            $nextStatus = 'ended';

            if ($call->status === 'ringing') {
                $nextStatus = $call->receiver_user_id === $request->user()->id
                    ? 'declined'
                    : 'cancelled';
            }

            $call->update([
                'status' => $nextStatus,
                'ended_at' => now(),
            ]);
        }

        $freshCall = $call->fresh();

        $message = match ($freshCall->status) {
            'declined' => 'Video call declined.',
            'cancelled' => 'Video call cancelled.',
            default => 'Video call ended.',
        };

        return response()->json([
            'message' => $message,
            'call' => $this->callData($freshCall, $request->user()->id),
        ]);
    }

    public function storeCallSignal(Request $request, Consultation $consultation, ConsultationCall $call): JsonResponse
    {
        $this->authorizeParticipant($request, $consultation);
        $this->authorizeCall($consultation, $call, $request->user()->id);

        if (in_array($call->status, ['ended', 'declined', 'missed', 'cancelled'], true)) {
            return response()->json([
                'message' => 'This video call has ended.',
                'ignored' => true,
                'call' => $this->callData($call->fresh(), $request->user()->id),
            ]);
        }

        $validated = $request->validate([
            'type' => ['required', 'string', 'in:offer,answer,ice'],
            'payload' => ['required', 'array'],
        ]);

        $signal = $call->signals()->create([
            'sender_user_id' => $request->user()->id,
            'type' => $validated['type'],
            'payload' => $validated['payload'],
        ]);

        $call->touch();

        return response()->json([
            'signal' => $this->signalData($signal),
        ], 201);
    }

    public function callSignals(Request $request, Consultation $consultation, ConsultationCall $call): JsonResponse
    {
        $this->authorizeParticipant($request, $consultation);
        $this->authorizeCall($consultation, $call, $request->user()->id);

        $afterId = max(0, (int) $request->query('after_id', 0));
        $signals = $call->signals()
            ->where('id', '>', $afterId)
            ->where('sender_user_id', '!=', $request->user()->id)
            ->orderBy('id')
            ->limit(50)
            ->get()
            ->map(fn (ConsultationCallSignal $signal) => $this->signalData($signal))
            ->values();

        return response()->json([
            'call' => $this->callData($call->fresh(), $request->user()->id),
            'signals' => $signals,
        ]);
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
            'consultation' => $this->loadedConsultation($consultation, $request->user()->id, false, $role),
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

    private function authorizeCall(Consultation $consultation, ConsultationCall $call, int $userId): void
    {
        abort_unless(
            $call->consultation_id === $consultation->id,
            404,
            'Video call not found for this consultation.'
        );
        abort_unless(
            $call->initiator_user_id === $userId || $call->receiver_user_id === $userId,
            403,
            'You do not have access to this video call.'
        );
    }

    private function callReceiverUserId(Consultation $consultation, int $initiatorUserId): ?int
    {
        $motherUserId = $consultation->mother?->user_id;
        $workerUserId = $consultation->healthWorker?->user_id;

        return match ($initiatorUserId) {
            $motherUserId => $workerUserId,
            $workerUserId => $motherUserId,
            default => null,
        };
    }

    private function callData(ConsultationCall $call, int $viewerId): array
    {
        $call->loadMissing([
            'initiator:id,name',
            'receiver:id,name',
            'consultation.mother:id,user_id',
            'consultation.healthWorker:id,user_id',
        ]);
        $isInitiator = $call->initiator_user_id === $viewerId;
        $otherUser = $isInitiator ? $call->receiver : $call->initiator;
        $motherUserId = $call->consultation?->mother?->user_id;
        $workerUserId = $call->consultation?->healthWorker?->user_id;
        $callerRole = $call->initiator_user_id === $motherUserId ? 'mother' : 'health_worker';
        $receiverRole = $call->receiver_user_id === $motherUserId ? 'mother' : 'health_worker';

        return [
            'id' => $call->id,
            'call_id' => $call->id,
            'consultation_id' => $call->consultation_id,
            'conversation_id' => $call->consultation_id,
            'status' => $call->status,
            'initiator_user_id' => $call->initiator_user_id,
            'receiver_user_id' => $call->receiver_user_id,
            'caller_id' => $call->initiator_user_id,
            'caller_role' => $callerRole,
            'receiver_id' => $call->receiver_user_id,
            'receiver_role' => $receiverRole,
            'is_initiator' => $isInitiator,
            'other_user' => $otherUser ? [
                'id' => $otherUser->id,
                'name' => $otherUser->name,
            ] : null,
            'started_at' => $call->started_at?->toIso8601String(),
            'answered_at' => $call->answered_at?->toIso8601String(),
            'ended_at' => $call->ended_at?->toIso8601String(),
            'created_at' => $call->created_at?->toIso8601String(),
            'updated_at' => $call->updated_at?->toIso8601String(),
        ];
    }

    private function signalData(ConsultationCallSignal $signal): array
    {
        return [
            'id' => $signal->id,
            'sender_user_id' => $signal->sender_user_id,
            'type' => $signal->type,
            'payload' => $signal->payload,
            'created_at' => $signal->created_at?->toIso8601String(),
        ];
    }

    private function loadedConsultation(Consultation $consultation, int $userId, bool $withMessages = false, ?string $viewerRole = null): array
    {
        $relations = [
            'mother.user:id,name,email',
            'healthWorker.user:id,name,email',
            'latestMessage.sender:id,name,role',
        ];

        $consultation->load($relations);
        if ($withMessages) {
            $messages = $consultation->messages()
                ->with([
                    'sender:id,name,role',
                    'iecVideo:id,title,video_url,duration_minutes,category',
                ])
                ->latest('id')
                ->limit(self::MESSAGE_PAGE_SIZE + 1)
                ->get()
                ->sortBy('id')
                ->values();
            $hasOlder = $messages->count() > self::MESSAGE_PAGE_SIZE;
            $messages = $messages->slice($hasOlder ? 1 : 0)->values();

            $consultation->setRelation('messages', $messages);
            $consultation->setAttribute('message_page', [
                'oldest_id' => $messages->first()?->id,
                'has_older' => $hasOlder,
                'limit' => self::MESSAGE_PAGE_SIZE,
            ]);
        }
        $consultation->loadCount([
            'messages as unread_count' => fn (Builder $query) => $query
                ->where(fn (Builder $query) => $this->notOwnedByViewer($query, $userId, $viewerRole))
                ->whereNull('read_at'),
        ]);

        return $this->consultationData($consultation, $withMessages, $userId, $viewerRole);
    }

    private function consultationData(Consultation $consultation, bool $withMessages = false, ?int $viewerUserId = null, ?string $viewerRole = null): array
    {
        $data = [
            'id' => $consultation->id,
            'viewer_user_id' => $viewerUserId,
            'viewer_role' => $viewerRole,
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
                ? $this->messageData($consultation->latestMessage, $viewerUserId, $viewerRole)
                : null,
        ];

        if ($withMessages) {
            $data['messages'] = $consultation->messages
                ->sortBy('created_at')
                ->values()
                ->map(fn (ConsultationMessage $message) => $this->messageData($message, $viewerUserId, $viewerRole));
            $data['message_page'] = $consultation->getAttribute('message_page') ?? [
                'oldest_id' => $consultation->messages->first()?->id,
                'has_older' => false,
                'limit' => self::MESSAGE_PAGE_SIZE,
            ];
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
            'user_id' => $mother->user_id,
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
            'user_id' => $worker->user_id,
            'name' => $worker->user?->name ?? 'Program Staff',
            'profession' => $worker->profession,
            'facility_name' => $worker->facility_name,
            'position_title' => $worker->position_title,
        ];
    }

    private function messageIdentity(Consultation $consultation, int $senderUserId, ?string $senderRole = null): array
    {
        $consultation->loadMissing(['mother:id,user_id', 'healthWorker:id,user_id']);

        $motherUserId = $consultation->mother?->user_id;
        $workerUserId = $consultation->healthWorker?->user_id;

        if ($senderRole === 'mother' || ((int) $senderUserId === (int) $motherUserId && $senderRole !== 'health_worker')) {
            return [
                'sender_role' => 'mother',
                'receiver_user_id' => $workerUserId,
                'receiver_role' => 'health_worker',
            ];
        }

        if ($senderRole === 'health_worker' || (int) $senderUserId === (int) $workerUserId) {
            return [
                'sender_role' => 'health_worker',
                'receiver_user_id' => $motherUserId,
                'receiver_role' => 'mother',
            ];
        }

        return [
            'sender_role' => $senderRole,
            'receiver_user_id' => null,
            'receiver_role' => null,
        ];
    }

    private function inferredSenderRole(ConsultationMessage $message): ?string
    {
        if ($message->sender_role) {
            return $message->sender_role;
        }

        if ($message->sender?->role) {
            return $message->sender->role;
        }

        if ($message->relationLoaded('consultation') && $message->consultation) {
            return $this->messageIdentity($message->consultation, $message->sender_user_id)['sender_role'];
        }

        return null;
    }

    private function isMessageOwnedByViewer(ConsultationMessage $message, ?int $viewerUserId, ?string $viewerRole): bool
    {
        if ($viewerUserId === null || (int) $message->sender_user_id !== (int) $viewerUserId) {
            return false;
        }

        $senderRole = $this->inferredSenderRole($message);

        return $viewerRole === null || $senderRole === null || $senderRole === $viewerRole;
    }

    private function notOwnedByViewer(Builder $query, int $viewerUserId, ?string $viewerRole): Builder
    {
        return $query->where(function (Builder $ownershipQuery) use ($viewerUserId, $viewerRole) {
            $ownershipQuery
                ->where('sender_user_id', '!=', $viewerUserId)
                ->orWhere(function (Builder $roleQuery) use ($viewerRole) {
                    $roleQuery
                        ->whereNotNull('sender_role')
                        ->where('sender_role', '!=', $viewerRole);
                });
        });
    }

    private function messageData(ConsultationMessage $message, ?int $viewerUserId = null, ?string $viewerRole = null): array
    {
        $isUnsent = $message->unsent_at !== null;
        $senderRole = $this->inferredSenderRole($message);

        return [
            'id' => $message->id,
            'sender_id' => $message->sender_user_id,
            'sender_user_id' => $message->sender_user_id,
            'sender_role' => $senderRole,
            'receiver_id' => $message->receiver_user_id,
            'receiver_user_id' => $message->receiver_user_id,
            'receiver_role' => $message->receiver_role,
            'is_mine' => $this->isMessageOwnedByViewer($message, $viewerUserId, $viewerRole),
            'sender_name' => $message->sender?->name ?? 'Project INAY User',
            'body' => $isUnsent ? self::UNSENT_MESSAGE_BODY : $message->body,
            'attachment' => !$isUnsent && $message->attachment_path ? [
                'url' => "/api/consultations/messages/{$message->id}/attachment",
                'name' => $message->attachment_name,
                'type' => $message->attachment_type,
                'size' => $message->attachment_size,
            ] : null,
            'iec_resource' => !$isUnsent && $message->iecVideo ? [
                'id' => $message->iecVideo->id,
                'title' => $message->iecVideo->title,
                'url' => $message->iecVideo->video_url,
                'duration_minutes' => $message->iecVideo->duration_minutes,
                'category' => $message->iecVideo->category,
            ] : null,
            'read_at' => $message->read_at?->toIso8601String(),
            'unsent_at' => $message->unsent_at?->toIso8601String(),
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
