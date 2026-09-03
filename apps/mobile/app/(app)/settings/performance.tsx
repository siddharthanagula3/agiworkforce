import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, ActivityIndicator, AccessibilityInfo, Platform } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Cpu,
  Zap,
  Thermometer,
  PlayCircle,
  BarChart2,
  Timer,
  MemoryStick,
  type LucideIcon,
} from 'lucide-react-native';
import Svg, { Polyline, Line, Text as SvgText, Circle } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useThemeColors } from '@/src/ui/theme';
import { useModelStore } from '@/src/features/model-picker/store';
import { storage } from '@/lib/mmkv';
import {
  getCapabilities,
  getDefaultModel as getDefaultLocalModel,
  getModelById as getLocalModelById,
} from '@agiworkforce/local-llm';
import type { DeviceCapabilities } from '@agiworkforce/local-llm';
import {
  getThermalState,
  getRollingStats,
  getPerfEventsLastDays,
  runBenchmark,
  type ThermalState,
  type BackendName,
  type PerfEvent,
  type BenchmarkResult,
} from '@/services/performanceMonitor';

export const PERF_THERMAL_PAUSE_KEY = 'perf-pause-at-thermal-v1';
export const PERF_BATTERY_PAUSE_KEY = 'perf-pause-at-battery-v1';
export const PERF_CHIP_SHOW_KEY = 'perf-show-chip-v1';

function readBool(key: string, def: boolean): boolean {
  const v = storage.getString(key);
  if (v === undefined || v === null) return def;
  return v === 'true';
}

function writeBool(key: string, v: boolean): void {
  storage.set(key, v ? 'true' : 'false');
}

type TierNum = 1 | 2 | 3;

function tier1FetchingNote(caps: DeviceCapabilities): string | null {
  if (caps.tier1Status === 'downloadable' || caps.tier1Status === 'downloading') {
    return 'AICore is fetching its on-device model in the background, this device will move to Tier 1 automatically once it finishes.';
  }
  return null;
}

function tierLabel(caps: DeviceCapabilities): {
  tier: TierNum;
  label: string;
  description: string;
  fetchingNote: string | null;
} {
  if (caps.tier1Available) {
    return {
      tier: 1,
      label: 'Tier 1',
      description:
        caps.tier1Runtime === 'foundation_models'
          ? 'Apple Foundation Models, OS-resident, fastest, lowest energy'
          : 'Google on-device AI, AICore, current generation is Gemma-based',
      fetchingNote: null,
    };
  }
  if (caps.tier2Available) {
    return {
      tier: 2,
      label: 'Tier 2',
      description: 'ExecuTorch, hardware-accelerated, needs ≥3.5 GB RAM',
      fetchingNote: tier1FetchingNote(caps),
    };
  }
  return {
    tier: 3,
    label: 'Tier 3',
    description: 'llama.rn, universal fallback, CPU-only inference',
    fetchingNote: tier1FetchingNote(caps),
  };
}

function backendDisplayName(runtime: string): string {
  switch (runtime) {
    case 'foundation_models':
    case 'apple-foundation-models':
      return 'Apple FM';
    case 'aicore':
      return 'AICore';
    case 'executorch':
      return 'ExecuTorch';
    case 'llama_rn':
    case 'llama-rn':
      return 'llama.rn';
    case 'litert-lm':
      return 'LiteRT';
    default:
      return String(runtime);
  }
}

function platformDisplayName(os: string): string {
  if (os === 'ios') return 'iOS';
  if (os === 'android') return 'Android';
  return os.charAt(0).toUpperCase() + os.slice(1);
}

type ThermalColor = { dot: string; label: string; text: string };

function thermalColor(
  state: ThermalState,
  teal: string,
  warning: string,
  error: string,
): ThermalColor {
  switch (state) {
    case 'nominal':
    case 'fair':
      return {
        dot: teal,
        label: state === 'nominal' ? 'Normal' : 'Fair',
        text: 'All systems nominal',
      };
    case 'serious':
      return { dot: warning, label: 'Warm', text: 'Performance may be limited' };
    case 'critical':
      return { dot: error, label: 'Hot', text: 'Inference paused by OS' };
  }
}

interface MiniChartProps {
  data: number[];
  width: number;
  height: number;
  color: string;
  gridColor: string;
  unit: string;
  accessibilityLabel: string;
}

function MiniChart({
  data,
  width,
  height,
  color,
  gridColor,
  unit,
  accessibilityLabel,
}: MiniChartProps) {
  const PAD_L = 32;
  const PAD_R = 8;
  const PAD_T = 8;
  const PAD_B = 20;
  const chartW = width - PAD_L - PAD_R;
  const chartH = height - PAD_T - PAD_B;

  const { min, max, points } = useMemo(() => {
    if (data.length === 0) {
      return { min: 0, max: 1, points: '' };
    }
    const nonZero = data.filter((v) => v > 0);
    const mn = nonZero.length > 0 ? Math.min(...nonZero) * 0.9 : 0;
    const mx = Math.max(...data) * 1.1 || 1;
    const step = data.length > 1 ? chartW / (data.length - 1) : chartW;
    const pts = data
      .map((v, i) => {
        const x = PAD_L + i * step;
        const y = PAD_T + chartH - ((v - mn) / (mx - mn)) * chartH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return { min: mn, max: mx, points: pts };
  }, [data, chartW, chartH]);

  const gridY = [0, 0.5, 1].map((f) => PAD_T + chartH * (1 - f));
  const gridLabels = [0, 0.5, 1].map((f) => {
    const v = min + f * (max - min);
    return v < 10 ? v.toFixed(1) : Math.round(v).toString();
  });

  return (
    <Svg
      width={width}
      height={height}
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
    >
      {/* Grid lines */}
      {gridY.map((y, i) => (
        <Line
          key={i}
          x1={PAD_L}
          y1={y}
          x2={width - PAD_R}
          y2={y}
          stroke={gridColor}
          strokeWidth={0.5}
          strokeDasharray="3,3"
        />
      ))}

      {/* Y-axis labels */}
      {gridLabels.map((label, i) => (
        <SvgText
          key={i}
          x={PAD_L - 4}
          y={gridY[i]! + 4}
          fontSize={9}
          fill={gridColor}
          textAnchor="end"
        >
          {label}
        </SvgText>
      ))}

      {/* Unit label */}
      <SvgText x={PAD_L} y={height - 2} fontSize={9} fill={gridColor} textAnchor="start">
        {unit}
      </SvgText>

      {/* Data line */}
      {data.length > 1 && <Polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />}

      {/* Data dots */}
      {data.length > 0 &&
        data.map((v, i) => {
          const step = data.length > 1 ? chartW / (data.length - 1) : chartW;
          const x = PAD_L + i * step;
          const y = PAD_T + chartH - ((v - min) / (max - min || 1)) * chartH;
          return <Circle key={i} cx={x} cy={y} r={2.5} fill={color} />;
        })}
    </Svg>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  sublabel,
  value,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const c = useThemeColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
      <Icon size={16} color={c.textSecondary} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, color: c.textPrimary }}>{label}</Text>
        {sublabel ? (
          <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 1 }}>{sublabel}</Text>
        ) : null}
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  const c = useThemeColors();
  return (
    <View
      style={{
        alignItems: 'center',
        flex: 1,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: c.surfaceOverlay,
      }}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={{ fontSize: 18, fontWeight: '700', color }}>{value}</Text>
      <Text style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

export default function PerformanceScreen() {
  const c = useThemeColors();
  const router = useRouter();

  const [pauseAtThermal, setPauseAtThermal] = useState(() =>
    readBool(PERF_THERMAL_PAUSE_KEY, true),
  );
  const [pauseAtBattery, setPauseAtBattery] = useState(() =>
    readBool(PERF_BATTERY_PAUSE_KEY, true),
  );
  const [showPerfChip, setShowPerfChip] = useState(() => readBool(PERF_CHIP_SHOW_KEY, true));

  const [caps, setCaps] = useState<DeviceCapabilities | null>(null);

  const selectedModelId = useModelStore((s) => s.selectedModel);

  const [rollingStats, setRollingStats] = useState(() => getRollingStats());

  const [toksEvents, setToksEvents] = useState<PerfEvent[]>([]);
  const [ttftEvents, setTtftEvents] = useState<PerfEvent[]>([]);

  const [thermalState, setThermalState] = useState<ThermalState>('nominal');
  const thermalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [lastBenchmark, setLastBenchmark] = useState<BenchmarkResult | null>(null);

  const [chartWidth, setChartWidth] = useState(280);

  useEffect(() => {
    getCapabilities()
      .then(setCaps)
      .catch(() => undefined);

    const events = getPerfEventsLastDays(7);
    setToksEvents(events);
    setTtftEvents(events);
    setRollingStats(getRollingStats());
    setThermalState(getThermalState());

    thermalTimerRef.current = setInterval(() => {
      setThermalState(getThermalState());
    }, 10_000);

    return () => {
      if (thermalTimerRef.current !== null) {
        clearInterval(thermalTimerRef.current);
      }
    };
  }, []);

  const handleBack = useCallback(() => {
    router.navigate('/(app)/settings/general' as Parameters<typeof router.navigate>[0]);
  }, [router]);

  const handleThermalPause = useCallback((v: boolean) => {
    setPauseAtThermal(v);
    writeBool(PERF_THERMAL_PAUSE_KEY, v);
  }, []);

  const handleBatteryPause = useCallback((v: boolean) => {
    setPauseAtBattery(v);
    writeBool(PERF_BATTERY_PAUSE_KEY, v);
  }, []);

  const handleChipToggle = useCallback((v: boolean) => {
    setShowPerfChip(v);
    writeBool(PERF_CHIP_SHOW_KEY, v);
  }, []);

  const handleBenchmark = useCallback(async () => {
    if (isBenchmarking) return;
    setIsBenchmarking(true);

    AccessibilityInfo.announceForAccessibility('Running benchmark. Please wait.');

    try {
      const activeModelId = selectedModelId ?? getDefaultLocalModel().id;
      const localModel = getLocalModelById(activeModelId);
      const backend: BackendName = caps?.tier1Runtime ?? 'llama_rn';

      const { localGenerate } = await import('@agiworkforce/local-llm');

      const result = await runBenchmark({
        modelId: localModel?.id ?? activeModelId,
        backend,
        generate: async ({ prompt, onToken }) => {
          let tokenCount = 0;
          await localGenerate(localModel?.id ?? activeModelId, {
            modelId: localModel?.id ?? activeModelId,
            prompt,
            onToken: (tok) => {
              onToken(tok);
              tokenCount += 1;
            },
          });
          return { text: '', tokenCount };
        },
      });

      setLastBenchmark(result);

      const events = getPerfEventsLastDays(7);
      setToksEvents(events);
      setTtftEvents(events);
      setRollingStats(getRollingStats());

      AccessibilityInfo.announceForAccessibility(
        `Benchmark complete: ${Math.round(result.tokensPerSecond)} tokens per second, ` +
          `${result.firstTokenLatencyMs} ms first token latency.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      AccessibilityInfo.announceForAccessibility(`Benchmark failed: ${msg}`);
    } finally {
      setIsBenchmarking(false);
    }
  }, [isBenchmarking, selectedModelId, caps]);

  const toksData = useMemo(() => toksEvents.map((e) => e.tokensPerSecond), [toksEvents]);
  const ttftData = useMemo(() => ttftEvents.map((e) => e.firstTokenLatencyMs), [ttftEvents]);

  const tierInfo = useMemo(() => {
    if (!caps) return null;
    return tierLabel(caps);
  }, [caps]);

  const activeLocalModel = useMemo(() => {
    if (!selectedModelId) return null;
    return getLocalModelById(selectedModelId) ?? null;
  }, [selectedModelId]);

  const tIndicator = useMemo(
    () => thermalColor(thermalState, c.teal, c.agentWarning, c.agentError),
    [thermalState, c.teal, c.agentWarning, c.agentError],
  );
  const fallbackOsVersion = `${platformDisplayName(Platform.OS)} ${String(Platform.Version)}`;
  const displayedOsVersion = caps?.osVersion?.trim() || fallbackOsVersion;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          height: 48,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        <Pressable
          onPress={handleBack}
          style={{ padding: 8, borderRadius: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={c.textSecondary} />
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '600', color: c.textPrimary, marginLeft: 8 }}>
          Performance
        </Text>

        {/* Live thermal dot in header */}
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            accessible
            accessibilityLabel={`Thermal state: ${tIndicator.label}`}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: tIndicator.dot,
              }}
            />
            <Text style={{ fontSize: 12, color: tIndicator.dot }}>{tIndicator.label}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ---------------------------------------------------------------- */}
        {/* 1. Device Tier Card */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Cpu size={16} color={c.teal} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary }}>
              Device Tier
            </Text>
          </View>

          {caps === null ? (
            <ActivityIndicator size="small" color={c.teal} />
          ) : tierInfo ? (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 20,
                    backgroundColor:
                      tierInfo.tier === 1
                        ? c.teal
                        : tierInfo.tier === 2
                          ? c.agentWarning
                          : c.textMuted,
                  }}
                  accessibilityLabel={`Device tier: ${tierInfo.label}`}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.white }}>
                    {tierInfo.label}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color: c.textSecondary, flex: 1 }}>
                  {tierInfo.description}
                </Text>
              </View>

              {tierInfo.fetchingNote ? (
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}
                >
                  <ActivityIndicator size="small" color={c.teal} />
                  <Text
                    style={{ fontSize: 12, color: c.textMuted, flex: 1 }}
                    accessibilityLabel={tierInfo.fetchingNote}
                  >
                    {tierInfo.fetchingNote}
                  </Text>
                </View>
              ) : null}

              <Separator />

              <View style={{ gap: 6, marginTop: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, color: c.textMuted }}>RAM</Text>
                  <Text style={{ fontSize: 13, color: c.textPrimary }}>
                    {caps.totalRAMMB > 0
                      ? `${(caps.totalRAMMB / 1024).toFixed(1)} GB`
                      : 'Unavailable'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, color: c.textMuted }}>OS Version</Text>
                  <Text style={{ fontSize: 13, color: c.textPrimary }}>{displayedOsVersion}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, color: c.textMuted }}>Thermal</Text>
                  <Text style={{ fontSize: 13, color: tIndicator.dot }}>
                    {tIndicator.label}, {tIndicator.text}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, color: c.textMuted }}>Capabilities</Text>
                  <Text style={{ fontSize: 13, color: c.textPrimary }}>
                    {[
                      caps.tier1Available
                        ? tierInfo.tier === 1 && caps.tier1Runtime === 'foundation_models'
                          ? 'Apple FM'
                          : 'AICore'
                        : null,
                      caps.tier2Available ? 'ExecuTorch' : null,
                      'llama.rn',
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </Text>
                </View>
              </View>
            </>
          ) : null}
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* 2. Loaded Model Card */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Zap size={16} color={c.teal} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary }}>
              Active Model
            </Text>
          </View>

          {activeLocalModel ? (
            <>
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}
              >
                <Text style={{ fontSize: 14, color: c.textPrimary, fontWeight: '600' }}>
                  {activeLocalModel.displayName}
                </Text>
                <Text style={{ fontSize: 12, color: c.textMuted }}>
                  {activeLocalModel.fileSizeBytes === 0
                    ? 'System managed'
                    : `${(activeLocalModel.fileSizeBytes / 1_073_741_824).toFixed(1)} GB`}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: c.textMuted, marginBottom: 12 }}>
                {activeLocalModel.supportedRuntimes.map(backendDisplayName).join(' · ')}
                {' · '}
                {activeLocalModel.paramCountB > 0
                  ? `${activeLocalModel.paramCountB}B params`
                  : 'Device-managed model'}
              </Text>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <StatChip
                  label="avg tok/s"
                  value={
                    rollingStats.sampleCount > 0
                      ? Math.round(rollingStats.avgToksPerSecond).toString()
                      : '--'
                  }
                  color={c.teal}
                />
                <StatChip
                  label="avg TTFT"
                  value={
                    rollingStats.sampleCount > 0
                      ? `${Math.round(rollingStats.avgFirstTokenLatencyMs)}ms`
                      : '--'
                  }
                  color={c.terraCotta}
                />
                <StatChip
                  label="mem peak"
                  value={
                    rollingStats.peakMemoryMB > 0
                      ? `${Math.round(rollingStats.peakMemoryMB)}MB`
                      : '--'
                  }
                  color={c.textSecondary}
                />
              </View>

              {rollingStats.sampleCount > 0 && (
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 8 }}>
                  Rolling average over last {rollingStats.sampleCount} inferences
                </Text>
              )}
            </>
          ) : (
            <Text style={{ fontSize: 14, color: c.textMuted }}>
              No local model loaded. Download a model to see performance stats.
            </Text>
          )}

          {lastBenchmark && (
            <>
              <Separator />
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 10, marginBottom: 6 }}>
                Last benchmark result
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <StatChip
                  label="tok/s"
                  value={Math.round(lastBenchmark.tokensPerSecond).toString()}
                  color={c.teal}
                />
                <StatChip
                  label="TTFT"
                  value={`${lastBenchmark.firstTokenLatencyMs}ms`}
                  color={c.terraCotta}
                />
                <StatChip
                  label="thermal"
                  value={lastBenchmark.thermalState}
                  color={
                    thermalColor(lastBenchmark.thermalState, c.teal, c.agentWarning, c.agentError)
                      .dot
                  }
                />
              </View>
            </>
          )}
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* 3. Tok/s chart */}
        {/* ---------------------------------------------------------------- */}
        {toksData.length > 0 && (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <BarChart2 size={16} color={c.teal} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary }}>
                Tok/s, Last 7 Days
              </Text>
              <Text style={{ fontSize: 12, color: c.textMuted, marginLeft: 'auto' }}>
                {toksData.length} events
              </Text>
            </View>

            <View
              onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
              style={{ height: 100 }}
            >
              <MiniChart
                data={toksData}
                width={chartWidth}
                height={100}
                color={c.teal}
                gridColor={c.textMuted}
                unit="t/s"
                accessibilityLabel={`Tokens per second over the last 7 days. ${toksData.length} data points. Most recent: ${Math.round(toksData[toksData.length - 1] ?? 0)} t/s.`}
              />
            </View>
          </Card>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* 4. TTFT chart */}
        {/* ---------------------------------------------------------------- */}
        {ttftData.length > 0 && (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Timer size={16} color={c.terraCotta} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary }}>
                First-Token Latency, Last 7 Days
              </Text>
            </View>

            <View style={{ height: 100 }}>
              <MiniChart
                data={ttftData}
                width={chartWidth}
                height={100}
                color={c.terraCotta}
                gridColor={c.textMuted}
                unit="ms"
                accessibilityLabel={`First-token latency over the last 7 days. ${ttftData.length} data points. Most recent: ${Math.round(ttftData[ttftData.length - 1] ?? 0)} ms.`}
              />
            </View>
          </Card>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* 5. Benchmark CTA */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <PlayCircle size={16} color={c.teal} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary }}>
              Benchmark This Device
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 12 }}>
            Runs a standardized 60-token prompt against the loaded model. Result is stored for
            comparison across sessions.
          </Text>
          <Pressable
            onPress={handleBenchmark}
            disabled={isBenchmarking}
            style={({ pressed }) => ({
              backgroundColor: isBenchmarking ? c.surfaceOverlay : c.teal,
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
            accessibilityLabel="Run Benchmark"
            accessibilityRole="button"
            accessibilityState={{ disabled: isBenchmarking }}
          >
            {isBenchmarking ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>
                  Benchmarking…
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Run Benchmark</Text>
            )}
          </Pressable>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* 6. Thermal-state detail */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Thermometer size={16} color={tIndicator.dot} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary }}>
              Thermal State
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: tIndicator.dot,
              }}
              accessible
              accessibilityLabel={`Current thermal state: ${tIndicator.label}`}
            />
            <View>
              <Text style={{ fontSize: 14, color: tIndicator.dot, fontWeight: '600' }}>
                {tIndicator.label}
              </Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>{tIndicator.text}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
            {(['nominal', 'fair', 'serious', 'critical'] as ThermalState[]).map((s) => {
              const info = thermalColor(s, c.teal, c.agentWarning, c.agentError);
              const isActive = s === thermalState;
              return (
                <View
                  key={s}
                  style={{
                    flex: 1,
                    paddingVertical: 6,
                    borderRadius: 6,
                    backgroundColor: isActive ? info.dot + '33' : c.surfaceOverlay,
                    borderWidth: isActive ? 1 : 0,
                    borderColor: info.dot,
                    alignItems: 'center',
                  }}
                  accessibilityLabel={s}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      color: isActive ? info.dot : c.textMuted,
                      fontWeight: isActive ? '700' : '400',
                    }}
                  >
                    {info.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* 7. Settings toggles */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <Text
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 0,
              fontWeight: '600',
              color: c.textMuted,
              marginBottom: 8,
            }}
          >
            Inference Settings
          </Text>

          <ToggleRow
            icon={Thermometer}
            label="Pause at serious thermal"
            sublabel="Suspends inference when device is warm to protect battery"
            value={pauseAtThermal}
            onChange={handleThermalPause}
          />

          <Separator />

          <ToggleRow
            icon={MemoryStick}
            label="Pause at 15% battery"
            sublabel="Resumes automatically when charging"
            value={pauseAtBattery}
            onChange={handleBatteryPause}
          />

          <Separator />

          <ToggleRow
            icon={BarChart2}
            label="Show performance chip in chat"
            sublabel="Shows tok/s and TTFT under each assistant response"
            value={showPerfChip}
            onChange={handleChipToggle}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
