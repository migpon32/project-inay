<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

class MaternalAnalyticsService
{
    public function analyze(
        array $weightLogs,
        float $prePregnancyWeight,
        float $targetGainMin = 11,
        float $targetGainMax = 16,
    ): array {
        $cacheKey = 'maternal-weight-analytics:v1:' . hash('sha256', json_encode([
            'weight_logs' => $weightLogs,
            'pre_pregnancy_weight_kg' => $prePregnancyWeight,
            'target_gain_min_kg' => $targetGainMin,
            'target_gain_max_kg' => $targetGainMax,
        ], JSON_THROW_ON_ERROR));
        $cached = Cache::get($cacheKey);

        if (is_array($cached)) {
            $cached['analytics']['cached'] = true;

            return $cached;
        }

        try {
            $result = $this->runPython(
                $weightLogs,
                $prePregnancyWeight,
                $targetGainMin,
                $targetGainMax,
            );
            $result['analytics']['cached'] = false;
            Cache::put(
                $cacheKey,
                $result,
                now()->addHours((int) config('services.python_analytics.cache_hours', 24)),
            );

            return $result;
        } catch (Throwable $exception) {
            Log::warning('Python maternal analytics failed; using PHP fallback.', [
                'message' => $exception->getMessage(),
            ]);

            $result = $this->fallback(
                $weightLogs,
                $prePregnancyWeight,
                $targetGainMin,
                $targetGainMax,
            );
            $result['analytics']['cached'] = false;
            Cache::put(
                $cacheKey,
                $result,
                now()->addSeconds((int) config('services.python_analytics.fallback_cache_seconds', 60)),
            );

            return $result;
        }
    }

    private function runPython(
        array $weightLogs,
        float $prePregnancyWeight,
        float $targetGainMin,
        float $targetGainMax,
    ): array {
        $command = [
            (string) config('services.python_analytics.binary', 'python'),
            (string) config('services.python_analytics.maternal_script'),
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
            throw new RuntimeException('Unable to start the Python analytics process.');
        }

        $payload = json_encode([
            'pre_pregnancy_weight_kg' => $prePregnancyWeight,
            'target_gain_min_kg' => $targetGainMin,
            'target_gain_max_kg' => $targetGainMax,
            'weight_logs' => $weightLogs,
        ], JSON_THROW_ON_ERROR);

        fwrite($pipes[0], $payload);
        fclose($pipes[0]);
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);

        $stdout = '';
        $stderr = '';
        $exitCode = null;
        $deadline = microtime(true) + (float) config('services.python_analytics.timeout_seconds', 5);

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
                throw new RuntimeException('Python maternal analytics timed out.');
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
            throw new RuntimeException(trim($stderr) ?: 'Python maternal analytics exited unsuccessfully.');
        }

        $result = json_decode(trim($stdout), true, 512, JSON_THROW_ON_ERROR);

        if (
            !is_array($result)
            || !isset($result['weight_trend'], $result['weight_summary'], $result['analytics'])
        ) {
            throw new RuntimeException('Python maternal analytics returned an invalid response.');
        }

        return $result;
    }

    private function fallback(
        array $weightLogs,
        float $prePregnancyWeight,
        float $targetGainMin,
        float $targetGainMax,
    ): array {
        usort($weightLogs, fn (array $left, array $right) => [
            $left['recorded_at'] ?? $left['date'] ?? '',
            $left['id'] ?? 0,
        ] <=> [
            $right['recorded_at'] ?? $right['date'] ?? '',
            $right['id'] ?? 0,
        ]);

        $latestByWeek = [];

        foreach ($weightLogs as $log) {
            $latestByWeek[(int) $log['pregnancy_week']] = $log;
        }

        ksort($latestByWeek);
        $weightTrend = array_values($latestByWeek);
        $currentWeight = $weightLogs === []
            ? null
            : (float) $weightLogs[array_key_last($weightLogs)]['weight_kg'];
        $totalGain = $currentWeight === null
            ? null
            : round($currentWeight - $prePregnancyWeight, 1);
        $averageWeeklyChange = null;
        $latestChange = null;

        if (count($weightTrend) >= 2) {
            $first = $weightTrend[0];
            $last = $weightTrend[array_key_last($weightTrend)];
            $weekSpan = (int) $last['pregnancy_week'] - (int) $first['pregnancy_week'];

            if ($weekSpan > 0) {
                $averageWeeklyChange = round(
                    ((float) $last['weight_kg'] - (float) $first['weight_kg']) / $weekSpan,
                    2,
                );
            }

            $previous = $weightTrend[count($weightTrend) - 2];
            $latestChange = round((float) $last['weight_kg'] - (float) $previous['weight_kg'], 2);
        }

        return [
            'weight_trend' => $weightTrend,
            'weight_summary' => [
                'pre_pregnancy_weight_kg' => $prePregnancyWeight,
                'current_weight_kg' => $currentWeight,
                'total_gain_kg' => $totalGain,
                'target_gain_min_kg' => $targetGainMin,
                'target_gain_max_kg' => $targetGainMax,
                'status' => $totalGain === null
                    ? 'Not logged'
                    : ($totalGain >= $targetGainMin && $totalGain <= $targetGainMax
                        ? 'Optimal'
                        : 'Needs review'),
            ],
            'analytics' => [
                'engine' => 'php_fallback',
                'raw_log_count' => count($weightLogs),
                'trend_point_count' => count($weightTrend),
                'duplicate_week_log_count' => count($weightLogs) - count($weightTrend),
                'average_weekly_change_kg' => $averageWeeklyChange,
                'latest_change_kg' => $latestChange,
            ],
        ];
    }
}
