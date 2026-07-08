<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserPrenatalCertificate extends Model
{
    protected $table = 'user_prenatal_certificates';
    
    protected $fillable = [
        'user_id', 'iec_module_id', 'certificate_number',
        'file_path', 'issued_at'
    ];

    protected $casts = [
        'issued_at' => 'datetime',
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
