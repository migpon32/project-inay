<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IECInfographic extends Model
{
    protected $table = 'iec_infographics';
    
    protected $fillable = [
        'iec_module_id', 'title', 'file_path', 'file_size', 'format'
    ];

    public function module(): BelongsTo
    {
        return $this->belongsTo(IECModule::class, 'iec_module_id');
    }
}
