<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IECVideo extends Model
{
    protected $table = 'iec_videos';
    
    protected $fillable = [
        'iec_module_id', 'title', 'description', 'video_url',
        'thumbnail_url', 'duration_minutes', 'category', 'is_required'
    ];

    protected $casts = [
        'is_required' => 'boolean',
    ];

    public function module(): BelongsTo
    {
        return $this->belongsTo(IECModule::class, 'iec_module_id');
    }
}
