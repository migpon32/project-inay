<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Consultation extends Model
{
    protected $fillable = [
        'mother_id',
        'health_worker_id',
        'topic',
        'subject',
        'risk_level',
        'status',
        'outcome',
        'last_message_at',
        'resolved_at',
        'escalated_at',
    ];

    protected $casts = [
        'last_message_at' => 'datetime',
        'resolved_at' => 'datetime',
        'escalated_at' => 'datetime',
    ];

    public function mother(): BelongsTo
    {
        return $this->belongsTo(Mother::class);
    }

    public function healthWorker(): BelongsTo
    {
        return $this->belongsTo(HealthcareWorker::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(ConsultationMessage::class);
    }

    public function latestMessage(): HasOne
    {
        return $this->hasOne(ConsultationMessage::class)->latestOfMany();
    }
}
