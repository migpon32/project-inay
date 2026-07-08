<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserIECProgress extends Model
{
    protected $table = 'user_iec_progress';
    
    protected $fillable = [
        'user_id', 'iec_module_id', 'is_completed', 'completed_at',
        'watched_videos', 'checklist_items'
    ];

    protected $casts = [
        'is_completed' => 'boolean',
        'completed_at' => 'datetime',
        'watched_videos' => 'array',
        'checklist_items' => 'array',
    ];

    public function module(): BelongsTo
    {
        return $this->belongsTo(IECModule::class, 'iec_module_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
