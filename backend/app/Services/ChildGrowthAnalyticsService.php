<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

class ChildGrowthAnalyticsService
{
    public function analyze(array $growthRecords): array
    {
        $cacheKey = 'child-growth-analytics:v1:' . hash(
            'sha256',
            json_encode($growthRecords, JSON_THROW_ON_ERROR),
        );
        $cached = Cache::get($cacheKey);

        if (is_array($cached)) {
            $cached['analytics']['cached'] = true;

            return $cached;
        }

        try {
            $result = $this->runPython($growthRecords);
            $result['analytics']['cached'] = false;
            Cache::put(
                $cacheKey,
                $result,
                now()->addHours((int) config('services.python_analytics.cache_hours', 24)),
            );

            return $result;
        } catch (Throwable $exception) {
            Log::warning('Python child growth analytics failed; using PHP fallback.', [
                'message' => $exception->getMessage(),
            ]);

            $result = $this->fallback($growthRecords);
            $result['analytics']['cached'] = false;
            Cache::put(
                $cacheKey,
                $result,
                now()->addSeconds((int) config('services.python_analytics.fallback_cache_seconds', 60)),
            );

            return $result;
        }
    }

    private function runPython(array $growthRecords): array
    {
        $command = [
            (string) config('services.python_analytics.binary', 'python'),
            (string) config('services.python_analytics.child_growth_script'),
        ];
        $descriptorSpec = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];
        $pipes = [];
        $process = proc_open(
            $command,
            $descriptorSpec,
            $pipes,
            base_path(),
            null,
            ['bypass_shell' => true],
        );

        if (!is_resource($process)) {
            throw new RuntimeException('Unable to start the Python child analytics process.');
        }

        fwrite($pipes[0], json_encode([
            'growth_records' => $growthRecords,
        ], JSON_THROW_ON_ERROR));
        fclose($pipes[0]);
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);

        $stdout = '';
        $stderr = '';
        $exitCode = null;
        $deadline = microtime(true) + (float) config('services.python_analytics.timeout_seconds', 2);

        while (true) {
            $stdout .= stream_get_contents($pipes[1]);
            $stderr .= stream_get_contents($pipes[2]);
            $status = proc_get_status($process);

            if (!$status['running']) {
                $exitCode = $status['exitcode'];
                break;
            }

            if (microtime(true) >= $deadline) {
                proc_terminate($process);
                throw new RuntimeException('Python child growth analytics timed out.');
            }

            usleep(10_000);
        }

        $stdout .= stream_get_contents($pipes[1]);
        $stderr .= stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $closedExitCode = proc_close($process);
        $exitCode = $exitCode >= 0 ? $exitCode : $closedExitCode;

        if ($exitCode !== 0) {
            throw new RuntimeException(trim($stderr) ?: 'Python child growth analytics exited unsuccessfully.');
        }

        $result = json_decode(trim($stdout), true, 512, JSON_THROW_ON_ERROR);

        if (!is_array($result) || !isset($result['growth_trend'], $result['analytics'])) {
            throw new RuntimeException('Python child growth analytics returned an invalid response.');
        }

        return $result;
    }

    private function fallback(array $growthRecords): array
    {
        usort($growthRecords, fn (array $left, array $right) => [
            $left['recorded_at'] ?? $left['date'] ?? '',
            $left['id'] ?? 0,
        ] <=> [
            $right['recorded_at'] ?? $right['date'] ?? '',
            $right['id'] ?? 0,
        ]);

        $latestByAge = [];

        foreach ($growthRecords as $record) {
            $latestByAge[(int) $record['age_months']] = $record;
        }

        ksort($latestByAge);
        $growthTrend = array_values($latestByAge);
        $weightChange = null;
        $heightChange = null;
        $latestWeightChange = null;
        $latestHeightChange = null;

        if (count($growthTrend) >= 2) {
            $first = $growthTrend[0];
            $last = $growthTrend[array_key_last($growthTrend)];
            $monthSpan = (int) $last['age_months'] - (int) $first['age_months'];

            if ($monthSpan > 0) {
                $weightChange = round(
                    ((float) $last['weight_kg'] - (float) $first['weight_kg']) / $monthSpan,
                    2,
                );
                $heightChange = round(
                    ((float) $last['height_cm'] - (float) $first['height_cm']) / $monthSpan,
                    2,
                );
            }

            $previous = $growthTrend[count($growthTrend) - 2];
            $latestWeightChange = round((float) $last['weight_kg'] - (float) $previous['weight_kg'], 2);
            $latestHeightChange = round((float) $last['height_cm'] - (float) $previous['height_cm'], 2);
        }

        return [
            'growth_trend' => $growthTrend,
            'analytics' => [
                'engine' => 'php_fallback',
                'raw_record_count' => count($growthRecords),
                'trend_point_count' => count($growthTrend),
                'duplicate_age_record_count' => count($growthRecords) - count($growthTrend),
                'average_weight_change_kg_per_month' => $weightChange,
                'average_height_change_cm_per_month' => $heightChange,
                'latest_weight_change_kg' => $latestWeightChange,
                'latest_height_change_cm' => $latestHeightChange,
            ],
        ];
    }
}
