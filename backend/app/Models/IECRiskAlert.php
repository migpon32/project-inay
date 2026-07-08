<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IECRiskAlert extends Model
{
    protected $table = 'iec_risk_alerts';
    
    protected $fillable = [
        'iec_module_id', 'title', 'consequence', 'recommendation', 'severity'
    ];

    public function module(): BelongsTo
    {
        return $this->belongsTo(IECModule::class, 'iec_module_id');
    }
}
