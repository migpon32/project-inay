<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class AuthController extends Controller
{
    private const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];

    public function register(Request $request)
    {
        $emailTable = $request->input('role') === 'health_worker'
            ? 'healthcare_workers'
            : 'mothers';
        $sanPabloBarangays = config('san_pablo.barangays', []);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => [
                'required',
                'email',
                'max:255',
                Rule::unique($emailTable, 'email'),
            ],
            'password' => ['required', 'string', 'min:8'],
            'role' => ['required', 'in:mother,health_worker'],
            'age' => [
                'exclude_unless:role,mother',
                'nullable',
                'integer',
                'min:10',
                'max:60',
            ],
            'phone' => [
                'exclude_unless:role,mother',
                'nullable',
                'string',
                'max:20',
                'regex:/^(?:\+63|0)9\d{9}$/',
            ],
            'blood_type' => [
                'exclude_unless:role,mother',
                'nullable',
                'string',
                Rule::in(self::BLOOD_TYPES),
            ],
            'pregnancy_status' => [
                'exclude_unless:role,mother',
                'nullable',
                'in:pregnant,postpartum,not_provided',
            ],
            'pregnancy_month' => [
                'exclude_unless:role,mother',
                'nullable',
                'required_if:pregnancy_status,pregnant',
                'integer',
                'min:1',
                'max:10',
            ],
            'barangay' => [
                'exclude_unless:role,mother',
                'nullable',
                'string',
                Rule::in($sanPabloBarangays),
            ],
            'location' => ['nullable', 'array'],
            'location.latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'location.longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'location.accuracy' => ['nullable', 'integer', 'min:0'],
            'location.capturedAt' => ['nullable', 'date'],
        ], [
            'email.unique' => 'Email has already been used.',
            'barangay.in' => 'Barangay must be within San Pablo City, Laguna.',
            'phone.regex' => 'Contact number must be a Philippine mobile number like 09171234567 or +639171234567.',
            'blood_type.in' => 'Blood type must be one of the listed options.',
            'pregnancy_month.required_if' => 'Pregnancy month is required when the mother is pregnant.',
        ]);

        $existingUser = User::where('email', $validated['email'])->first();

        if ($existingUser && !Hash::check($validated['password'], $existingUser->password)) {
            return response()->json([
                'message' => 'This email already has an account. Enter its current password to add another portal.',
            ], 422);
        }

        [$user, $profileCreated, $userCreated] = DB::transaction(function () use ($validated, $existingUser) {
            $userCreated = !$existingUser;
            $profileCreated = false;
            $user = $existingUser ?: User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
                'role' => $validated['role'],
            ]);

            if ($validated['role'] === 'health_worker') {
                if (!$user->healthcareWorker()->exists()) {
                    $user->healthcareWorker()->create([
                        'email' => $validated['email'],
                        'profession' => 'nurse',
                        'verification_status' => 'pending',
                    ]);
                    $profileCreated = true;
                }
            } else {
                $location = $validated['location'] ?? [];
                $pregnancyStatus = $validated['pregnancy_status'] ?? 'not_provided';
                $pregnancyMonth = $pregnancyStatus === 'pregnant'
                    ? ($validated['pregnancy_month'] ?? null)
                    : null;

                if (!$user->mother()->exists()) {
                    $user->mother()->create([
                        'email' => $validated['email'],
                        'birth_date' => isset($validated['age'])
                            ? Carbon::now('Asia/Manila')->subYears((int) $validated['age'])->toDateString()
                            : null,
                        'phone' => $validated['phone'] ?? null,
                        'blood_type' => $validated['blood_type'] ?? null,
                        'pregnancy_status' => $pregnancyStatus,
                        'pregnancy_month' => $pregnancyMonth,
                        'pregnancy_week' => $pregnancyMonth ? ((int) $pregnancyMonth * 4) : null,
                        'barangay' => $validated['barangay'] ?? null,
                        'latitude' => $location['latitude'] ?? null,
                        'longitude' => $location['longitude'] ?? null,
                        'location_accuracy' => $location['accuracy'] ?? null,
                        'location_captured_at' => isset($location['capturedAt'])
                            ? Carbon::parse($location['capturedAt'])
                            : null,
                    ]);
                    $profileCreated = true;
                }
            }

            return [$user, $profileCreated, $userCreated];
        });

        $user->load(['mother', 'healthcareWorker']);

        $token = $user
            ->createToken('auth_token', [$validated['role']])
            ->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $user,
            'active_portal' => $validated['role'],
            'profile_created' => $profileCreated,
            'message' => $profileCreated
                ? 'Portal added successfully.'
                : 'This portal is already connected to your account.',
        ], $userCreated || $profileCreated ? 201 : 200);
    }

    public function login(Request $request)
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'portal' => ['required', 'in:mother,health_worker'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (!$user || !Hash::check(
            $validated['password'],
            $user->password
        )) {
            return response()->json([
                'message' => 'Invalid Credentials'
            ], 401);
        }

        $hasPortal = $validated['portal'] === 'health_worker'
            ? $user->healthcareWorker()->exists()
            : $user->mother()->exists();

        if (!$hasPortal) {
            $portalName = $validated['portal'] === 'health_worker'
                ? 'Program Staff'
                : 'Mother/User';

            return response()->json([
                'message' => "No {$portalName} portal is connected to this account. Register with this email and password to add it.",
            ], 403);
        }

        $token = $user
            ->createToken('auth_token', [$validated['portal']])
            ->plainTextToken;

        $user->load($validated['portal'] === 'health_worker' ? 'healthcareWorker' : 'mother');

        return response()->json([
            'token' => $token,
            'user' => $user,
            'active_portal' => $validated['portal'],
        ]);
    }

    public function updateMotherProfilePhoto(Request $request)
    {
        $mother = $request->user()?->mother;
        abort_unless($mother, 403, 'Mother portal access is required.');

        $validated = $request->validate([
            'photo' => ['required', 'image', 'mimes:jpg,jpeg,png', 'max:4096'],
        ]);

        if ($mother->profile_photo_path) {
            Storage::disk('public')->delete($mother->profile_photo_path);
        }

        $mother->update([
            'profile_photo_path' => $validated['photo']->store('profile-photos/mothers', 'public'),
        ]);

        $user = $request->user()->fresh(['mother', 'healthcareWorker']);
        if ($user->mother) {
            $user->mother->setAttribute('profile_photo_url', $this->publicFileUrl($request, $user->mother->profile_photo_path));
        }

        return response()->json([
            'message' => 'Mother profile photo updated successfully.',
            'user' => $user,
        ]);
    }

    private function publicFileUrl(Request $request, ?string $path): ?string
    {
        if (!$path) {
            return null;
        }

        return $request->getSchemeAndHttpHost() . '/storage/' . ltrim($path, '/');
    }
}
