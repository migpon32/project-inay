<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>Project INAY Maternal Monitoring Report</title>
    <style>
        body { font-family: DejaVu Sans, sans-serif; color: #0f172a; font-size: 11px; }
        h1 { margin: 0 0 4px; font-size: 20px; }
        .meta { color: #64748b; margin-bottom: 18px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #fff1f2; color: #be123c; text-align: left; font-size: 9px; text-transform: uppercase; }
        th, td { border: 1px solid #e2e8f0; padding: 7px; }
        .high { color: #dc2626; font-weight: bold; }
        .medium { color: #d97706; font-weight: bold; }
        .low { color: #059669; font-weight: bold; }
    </style>
</head>
<body>
    <h1>Project INAY Maternal Monitoring Report</h1>
    <div class="meta">Generated {{ $generatedAt }} by {{ $workerName }}</div>
    <table>
        <thead>
            <tr>
                <th>Patient</th>
                <th>Week</th>
                <th>Blood Pressure</th>
                <th>Blood Sugar</th>
                <th>Weight</th>
                <th>Hemoglobin</th>
                <th>Barangay</th>
                <th>Risk</th>
            </tr>
        </thead>
        <tbody>
            @foreach ($mothers as $mother)
                <tr>
                    <td>{{ $mother['patient_code'] }}<br>{{ $mother['name'] }}</td>
                    <td>{{ $mother['pregnancy_week'] ?? 'N/A' }}</td>
                    <td>{{ $mother['latest_entry']['blood_pressure'] ?? 'N/A' }}</td>
                    <td>{{ $mother['latest_entry']['blood_sugar_mgdl'] ?? 'N/A' }} mg/dL</td>
                    <td>{{ $mother['latest_entry']['weight_kg'] ?? 'N/A' }} kg</td>
                    <td>{{ $mother['latest_entry']['hemoglobin_gdl'] ?? 'N/A' }} g/dL</td>
                    <td>{{ $mother['barangay'] ?? 'N/A' }}</td>
                    <td class="{{ $mother['risk_level'] }}">{{ strtoupper($mother['risk_level']) }} RISK</td>
                </tr>
            @endforeach
        </tbody>
    </table>
</body>
</html>
