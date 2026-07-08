<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GrowthRecordAudit extends Model
{
    protected $fillable = [
        'growth_record_id',
        'child_id',
        'healthcare_worker_id',
        'recorded_by_user_id',
        'healthcare_worker_name',
        'age_month',
        'previous_weight',
        'new_weight',
        'previous_height',
        'new_height',
        'recorded_at',
    ];

    protected $casts = [
        'age_month' => 'integer',
        'previous_weight' => 'decimal:2',
        'new_weight' => 'decimal:2',
        'previous_height' => 'decimal:2',
        'new_height' => 'decimal:2',
        'recorded_at' => 'datetime',
    ];

    public function growthRecord(): BelongsTo
    {
        return $this->belongsTo(ChildGrowthRecord::class, 'growth_record_id');
    }

    public function child(): BelongsTo
    {
        return $this->belongsTo(ChildProfile::class, 'child_id');
    }

    public function healthcareWorker(): BelongsTo
    {
        return $this->belongsTo(HealthcareWorker::class);
    }
}
