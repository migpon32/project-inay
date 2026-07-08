<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ChildProfile extends Model
{
    protected $table = 'children';

    protected $fillable = [
        'mother_id',
        'name',
        'sex',
        'birth_date',
        'birth_weight_kg',
        'birth_height_cm',
        'notes',
        'profile_photo_path',
    ];

    protected $casts = [
        'birth_date' => 'date',
        'birth_weight_kg' => 'decimal:2',
        'birth_height_cm' => 'decimal:2',
    ];

    public function mother(): BelongsTo
    {
        return $this->belongsTo(Mother::class);
    }

    public function growthRecords(): HasMany
    {
        return $this->hasMany(ChildGrowthRecord::class, 'child_id');
    }

    public function latestGrowthRecord(): HasOne
    {
        return $this->hasOne(ChildGrowthRecord::class, 'child_id')->latestOfMany('age_month');
    }

    public function immunizations(): HasMany
    {
        return $this->hasMany(ChildImmunization::class, 'child_id');
    }
}
