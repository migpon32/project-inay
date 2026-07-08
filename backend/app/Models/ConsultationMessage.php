<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ConsultationMessage extends Model
{
    protected $fillable = [
        'consultation_id',
        'sender_user_id',
        'body',
        'attachment_path',
        'attachment_name',
        'attachment_type',
        'attachment_size',
        'iec_video_id',
        'read_at',
    ];

    protected $casts = [
        'attachment_size' => 'integer',
        'read_at' => 'datetime',
    ];

    public function consultation(): BelongsTo
    {
        return $this->belongsTo(Consultation::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_user_id');
    }

    public function iecVideo(): BelongsTo
    {
        return $this->belongsTo(IECVideo::class);
    }
}
