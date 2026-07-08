<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class IECModule extends Model
{
    protected $table = 'iec_modules';
    
    protected $fillable = [
        'trimester', 'month_number', 'title', 'week_range',
        'baby_development', 'mother_changes', 'expected_symptoms',
        'nutritional_guidance', 'daily_intake', 'is_active', 'sort_order'
    ];

    protected $casts = [
        'daily_intake' => 'array',
        'is_active' => 'boolean',
    ];

    public function videos(): HasMany
    {
        return $this->hasMany(IECVideo::class, 'iec_module_id');
    }

    public function riskAlerts(): HasMany
    {
        return $this->hasMany(IECRiskAlert::class, 'iec_module_id');
    }

    public function infographics(): HasMany
    {
        return $this->hasMany(IECInfographic::class, 'iec_module_id');
    }
}
