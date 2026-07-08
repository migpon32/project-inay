<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChildImmunization extends Model
{
    protected $fillable = [
        'vaccine_key',
        'vaccine_name',
        'dose_label',
        'scheduled_for_age_days',
        'scheduled_at',
        'vaccinated_at',
        'purpose',
        'side_effects',
        'recorded_by_user_id',
        'notes',
    ];

    protected $casts = [
        'scheduled_for_age_days' => 'integer',
        'scheduled_at' => 'date',
        'vaccinated_at' => 'date',
    ];

    public function child(): BelongsTo
    {
        return $this->belongsTo(ChildProfile::class, 'child_id');
    }

    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by_user_id');
    }
}
