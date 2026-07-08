<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserCheckupRecord extends Model
{
    protected $table = 'user_checkup_records';
    
    protected $fillable = [
        'user_id', 'iec_module_id', 'record_type', 'file_path',
        'original_filename', 'notes', 'record_date', 'is_verified',
        'verified_at', 'verified_by'
    ];

    protected $casts = [
        'record_date' => 'datetime',
        'is_verified' => 'boolean',
        'verified_at' => 'datetime',
    ];

    public function module(): BelongsTo
    {
        return $this->belongsTo(IECModule::class, 'iec_module_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
