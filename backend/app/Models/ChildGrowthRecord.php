<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChildGrowthRecord extends Model
{
    protected $table = 'growth_records';

    protected $fillable = [
        'age_month',
        'weight',
        'height',
        'recorded_at',
        'recorded_by',
        'notes',
    ];

    protected $casts = [
        'age_month' => 'integer',
        'weight' => 'decimal:2',
        'height' => 'decimal:2',
        'recorded_at' => 'datetime',
    ];

    public function getAgeMonthsAttribute(): int
    {
        return (int) $this->age_month;
    }

    public function getWeightKgAttribute(): string
    {
        return $this->weight;
    }

    public function getHeightCmAttribute(): string
    {
        return $this->height;
    }

    public function child(): BelongsTo
    {
        return $this->belongsTo(ChildProfile::class, 'child_id');
    }

    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(HealthcareWorker::class, 'recorded_by');
    }
}
