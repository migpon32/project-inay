<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'python_analytics' => [
        'binary' => env('PYTHON_BINARY', 'python'),
        'maternal_script' => env('MATERNAL_ANALYTICS_SCRIPT', base_path('scripts/maternal_weight_analytics.py')),
        'child_growth_script' => env('CHILD_GROWTH_ANALYTICS_SCRIPT', base_path('scripts/child_growth_analytics.py')),
        'timeout_seconds' => env('PYTHON_ANALYTICS_TIMEOUT', 2),
        'cache_hours' => env('PYTHON_ANALYTICS_CACHE_HOURS', 24),
        'fallback_cache_seconds' => env('PYTHON_ANALYTICS_FALLBACK_CACHE_SECONDS', 60),
    ],

    'health_facilities' => [
        'provider' => env('HEALTH_FACILITY_PROVIDER', 'openstreetmap'),
        'radius_meters' => env('HEALTH_FACILITY_RADIUS_METERS', 20000),
        'cache_minutes' => env('HEALTH_FACILITY_CACHE_MINUTES', 30),
        'route_limit' => env('HEALTH_FACILITY_ROUTE_LIMIT', 24),
        'overpass_endpoint' => env('HEALTH_FACILITY_OVERPASS_ENDPOINT', 'https://overpass-api.de/api/interpreter'),
        'osrm_endpoint' => env('HEALTH_FACILITY_OSRM_ENDPOINT', 'https://router.project-osrm.org'),
    ],

    'google_maps' => [
        'places_key' => env('GOOGLE_PLACES_API_KEY', env('GOOGLE_MAPS_API_KEY')),
        'routes_key' => env('GOOGLE_ROUTES_API_KEY', env('GOOGLE_MAPS_API_KEY', env('GOOGLE_PLACES_API_KEY'))),
        'health_facility_route_limit' => env('GOOGLE_HEALTH_FACILITY_ROUTE_LIMIT', 32),
    ],

];
