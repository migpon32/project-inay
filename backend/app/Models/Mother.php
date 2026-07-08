<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Mother extends Model
{
    protected $fillable = [
        'user_id',
        'email',
        'birth_date',
        'phone',
        'address',
        'barangay',
        'pre_pregnancy_weight_kg',
        'previous_deliveries',
        'blood_type',
        'pregnancy_status',
        'pregnancy_month',
        'pregnancy_week',
        'postpartum_week',
        'due_date',
        'next_scheduled_visit',
        'last_weight_kg',
        'risk_rating',
        'co_monitoring_person',
        'profile_photo_path',
        'latitude',
        'longitude',
        'location_accuracy',
        'location_captured_at',
    ];

    protected $casts = [
        'birth_date' => 'date',
        'pre_pregnancy_weight_kg' => 'decimal:2',
        'previous_deliveries' => 'integer',
        'pregnancy_month' => 'integer',
        'pregnancy_week' => 'integer',
        'postpartum_week' => 'integer',
        'due_date' => 'date',
        'next_scheduled_visit' => 'date',
        'last_weight_kg' => 'decimal:2',
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
        'location_accuracy' => 'integer',
        'location_captured_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function healthcareWorkers(): BelongsToMany
    {
        return $this->belongsToMany(
            HealthcareWorker::class,
            'health_worker_mothers',
            'mother_id',
            'health_worker_id'
        )->withTimestamps();
    }

    public function consultations(): HasMany
    {
        return $this->hasMany(Consultation::class);
    }

    public function monitoringEntries(): HasMany
    {
        return $this->hasMany(MaternalMonitoringEntry::class);
    }

    public function clinicalNotes(): HasMany
    {
        return $this->hasMany(ClinicalNote::class);
    }

    public function latestMonitoringEntry(): HasOne
    {
        return $this->hasOne(MaternalMonitoringEntry::class)->latestOfMany('recorded_at');
    }

    public function children(): HasMany
    {
        return $this->hasMany(ChildProfile::class);
    }
}
