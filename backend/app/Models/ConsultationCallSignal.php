<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ConsultationCallSignal extends Model
{
    protected $fillable = [
        'consultation_call_id',
        'sender_user_id',
        'type',
        'payload',
    ];

    protected $casts = [
        'payload' => 'array',
    ];

    public function call(): BelongsTo
    {
        return $this->belongsTo(ConsultationCall::class, 'consultation_call_id');
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_user_id');
    }
}
