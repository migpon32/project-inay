<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{{ $casefile['profile']['patient_id'] }} Casefile</title>
    <style>
        body { color: #0f172a; font-family: DejaVu Sans, Arial, sans-serif; font-size: 12px; line-height: 1.45; }
        h1, h2, h3 { margin: 0; }
        h1 { font-size: 22px; }
        h2 { border-bottom: 1px solid #e2e8f0; font-size: 15px; margin-top: 22px; padding-bottom: 6px; }
        table { border-collapse: collapse; margin-top: 10px; width: 100%; }
        th, td { border: 1px solid #e2e8f0; padding: 7px; text-align: left; vertical-align: top; }
        th { background: #f8fafc; color: #475569; font-size: 10px; text-transform: uppercase; }
        .muted { color: #64748b; }
        .badge { border-radius: 4px; display: inline-block; font-size: 10px; font-weight: bold; padding: 3px 6px; text-transform: uppercase; }
        .low { background: #dcfce7; color: #047857; }
        .medium { background: #fef3c7; color: #b45309; }
        .high { background: #fee2e2; color: #b91c1c; }
        .grid { display: table; margin-top: 12px; width: 100%; }
        .row { display: table-row; }
        .cell { display: table-cell; padding: 4px 10px 4px 0; width: 33%; }
        .label { color: #64748b; font-size: 10px; font-weight: bold; text-transform: uppercase; }
        .value { font-weight: bold; }
    </style>
</head>
<body>
    <p class="muted">Generated {{ $generatedAt }} by {{ $workerName }}</p>
    <h1>{{ $casefile['profile']['name'] }}</h1>
    <p>
        <strong>{{ $casefile['profile']['patient_id'] }}</strong>
        <span class="badge {{ $casefile['profile']['risk_level'] }}">{{ $casefile['profile']['risk_label'] }}</span>
    </p>

    <div class="grid">
        <div class="row">
            <div class="cell"><div class="label">Age</div><div class="value">{{ $casefile['profile']['age'] ?? 'Not provided' }}</div></div>
            <div class="cell"><div class="label">Contact</div><div class="value">{{ $casefile['profile']['phone'] ?? 'Not provided' }}</div></div>
            <div class="cell"><div class="label">Blood Type</div><div class="value">{{ $casefile['profile']['blood_type'] ?? 'Not provided' }}</div></div>
        </div>
        <div class="row">
            <div class="cell"><div class="label">Status</div><div class="value">{{ $casefile['profile']['pregnancy_status_label'] }}</div></div>
            <div class="cell"><div class="label">Trimester</div><div class="value">{{ $casefile['profile']['current_trimester'] }}</div></div>
            <div class="cell"><div class="label">Due Date</div><div class="value">{{ $casefile['profile']['due_date'] ?? 'Not provided' }}</div></div>
        </div>
    </div>

    <h2>Monitoring Records</h2>
    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Week</th>
                <th>Weight</th>
                <th>Blood Pressure</th>
                <th>Temperature</th>
                <th>Heart Rate</th>
                <th>Blood Sugar</th>
                <th>Risk</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($casefile['monitoring_records'] as $record)
                <tr>
                    <td>{{ $record['monitoring_date'] ?? 'N/A' }}</td>
                    <td>{{ $record['gestational_week'] ?? 'N/A' }}</td>
                    <td>{{ $record['weight_kg'] ? $record['weight_kg'] . ' kg' : 'N/A' }}</td>
                    <td>{{ $record['blood_pressure'] ?? 'N/A' }}</td>
                    <td>{{ $record['temperature_c'] ? $record['temperature_c'] . ' C' : 'N/A' }}</td>
                    <td>{{ $record['heart_rate'] ?? 'N/A' }}</td>
                    <td>{{ $record['blood_sugar_mgdl'] ? $record['blood_sugar_mgdl'] . ' mg/dL' : 'N/A' }}</td>
                    <td>{{ $record['risk_label'] }}</td>
                </tr>
            @empty
                <tr><td colspan="8">No monitoring records yet.</td></tr>
            @endforelse
        </tbody>
    </table>

    <h2>Clinical Notes</h2>
    <table>
        <thead>
            <tr>
                <th>Author</th>
                <th>Date</th>
                <th>Note</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($casefile['clinical_notes'] as $note)
                <tr>
                    <td>{{ $note['author'] }}</td>
                    <td>{{ $note['created_at'] }}</td>
                    <td>{{ $note['body'] }}</td>
                </tr>
            @empty
                <tr><td colspan="3">No clinical notes yet.</td></tr>
            @endforelse
        </tbody>
    </table>
</body>
</html>
