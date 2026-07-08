<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MaternalMonitoringEntry extends Model
{
    protected $fillable = [
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
    ];

    protected $casts = [
        'pregnancy_week' => 'integer',
        'systolic_bp' => 'integer',
        'diastolic_bp' => 'integer',
        'blood_sugar_mgdl' => 'decimal:2',
        'body_temperature_c' => 'decimal:1',
        'heart_rate' => 'integer',
        'weight_kg' => 'decimal:2',
        'hemoglobin_gdl' => 'decimal:1',
        'recorded_at' => 'datetime',
    ];

    public function mother(): BelongsTo
    {
        return $this->belongsTo(Mother::class);
    }

    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by_user_id');
    }
}
