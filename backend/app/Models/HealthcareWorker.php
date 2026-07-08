<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class HealthcareWorker extends Model
{
    protected $fillable = [
        'user_id',
        'email',
        'profession',
        'license_number',
        'facility_name',
        'position_title',
        'verification_status',
        'verified_at',
    ];

    protected $casts = [
        'verified_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function mothers(): BelongsToMany
    {
        return $this->belongsToMany(
            Mother::class,
            'health_worker_mothers',
            'health_worker_id',
            'mother_id'
        )->withTimestamps();
    }

    public function consultations(): HasMany
    {
        return $this->hasMany(Consultation::class);
    }
}
