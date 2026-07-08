<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasMany;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    public function mother(): HasOne
    {
        return $this->hasOne(Mother::class);
    }

    public function healthcareWorker(): HasOne
    {
        return $this->hasOne(HealthcareWorker::class);
    }

    public function consultationMessages(): HasMany
    {
        return $this->hasMany(ConsultationMessage::class, 'sender_user_id');
    }
}
