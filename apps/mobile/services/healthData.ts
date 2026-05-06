/**
 * Health Data Bridge Service
 *
 * Reads health data from HxF app's backend health context cache.
 * HxF (iOS native) pushes HealthKit data to /api/health-context.
 * AGI Workforce reads it via GET /api/health-context.
 *
 * When HxF is not installed or health data unavailable,
 * degrades gracefully to empty state.
 */

import { Platform } from 'react-native';
import { api } from './api';
import { supabase } from './supabase';

export type HealthPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export interface HealthSummary {
  steps: number | null;
  caloriesBurned: number | null;
  activeMinutes: number | null;
  heartRate: number | null;
  restingHeartRate: number | null;
  heartRateVariability: number | null;
  sleepHours: number | null;
  weight: number | null;
  bodyFatPercentage: number | null;
  vo2Max: number | null;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  bloodGlucose: number | null;
  lastUpdated: string | null;
}

interface HealthSnapshotResponse {
  success: boolean;
  snapshot?: {
    steps?: number;
    calories?: number;
    exerciseMinutes?: number;
    heartRate?: number;
    restingHR?: number;
    hrv?: number;
    sleepLastNight?: number;
    weight?: number;
    bodyFat?: number;
    vo2Max?: number;
    bloodPressure?: string;
    bloodGlucose?: number;
    timestamp?: string;
  };
}

let cachedSummary: HealthSummary | null = null;
let lastFetchTime = 0;
/** User ID for cache scope — prevents returning stale data after user switch. */
let cachedUserId: string | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Audit fix F8 (2026-05-05): /api/health-context does not exist in apps/web
// or api-gateway — no backend implementation found. Gate all calls behind
// EXPO_PUBLIC_FEATURE_HEALTH_CONTEXT (default false/off) until the endpoint
// is implemented or the feature is officially removed.
// TODO: decide whether to implement GET /api/health-context or remove this service.
const HEALTH_CONTEXT_ENABLED = process.env.EXPO_PUBLIC_FEATURE_HEALTH_CONTEXT === '1';

export async function getHealthPermissionStatus(): Promise<HealthPermissionStatus> {
  if (!HEALTH_CONTEXT_ENABLED) return 'unavailable';
  // Health data is available if the HxF backend has a snapshot for this user
  try {
    const data = await api.get<HealthSnapshotResponse>('/api/health-context');
    return data.success && data.snapshot ? 'granted' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function requestHealthPermission(): Promise<boolean> {
  // No permission to request — depends on HxF app being installed
  // Return true if data is available
  const status = await getHealthPermissionStatus();
  return status === 'granted';
}

export async function getHealthSummary(): Promise<HealthSummary | null> {
  if (!HEALTH_CONTEXT_ENABLED) return null;
  // Invalidate cache if user changed (multi-user privacy)
  const { data: sessionData } = await supabase.auth.getSession();
  const currentUserId = sessionData.session?.user?.id ?? null;
  if (currentUserId !== cachedUserId) {
    cachedSummary = null;
    lastFetchTime = 0;
    cachedUserId = currentUserId;
  }

  // Use cache if fresh
  if (cachedSummary && Date.now() - lastFetchTime < CACHE_TTL) {
    return cachedSummary;
  }

  try {
    const data = await api.get<HealthSnapshotResponse>('/api/health-context');
    if (!data.success || !data.snapshot) return null;

    const s = data.snapshot;
    // Parse blood pressure "120/80" format
    let systolic: number | null = null;
    let diastolic: number | null = null;
    if (s.bloodPressure) {
      const parts = s.bloodPressure.split('/');
      const rawSys = parts[0] ? parseFloat(parts[0]) : NaN;
      const rawDia = parts[1] ? parseFloat(parts[1]) : NaN;
      systolic = Number.isFinite(rawSys) ? rawSys : null;
      diastolic = Number.isFinite(rawDia) ? rawDia : null;
    }

    cachedSummary = {
      steps: s.steps ?? null,
      caloriesBurned: s.calories ?? null,
      activeMinutes: s.exerciseMinutes ?? null,
      heartRate: s.heartRate ?? null,
      restingHeartRate: s.restingHR ?? null,
      heartRateVariability: s.hrv ?? null,
      sleepHours: s.sleepLastNight ?? null,
      weight: s.weight ?? null,
      bodyFatPercentage: s.bodyFat ?? null,
      vo2Max: s.vo2Max ?? null,
      bloodPressureSystolic: systolic,
      bloodPressureDiastolic: diastolic,
      bloodGlucose: s.bloodGlucose ?? null,
      lastUpdated: s.timestamp ?? null,
    };
    lastFetchTime = Date.now();
    return cachedSummary;
  } catch {
    return cachedSummary; // Return stale cache on error, or null
  }
}

export function isHealthAvailable(): boolean {
  // Available on iOS (via HxF bridge) — not yet on Android
  return Platform.OS === 'ios';
}

/**
 * Format health summary as context string for AI chat injection.
 * Returns empty string if no health data available.
 */
export async function getHealthContext(): Promise<string> {
  const summary = await getHealthSummary();
  if (!summary) return '';

  const lines: string[] = ['User health data (from connected health app):'];
  if (summary.steps != null) lines.push(`- Steps today: ${summary.steps.toLocaleString()}`);
  if (summary.caloriesBurned != null)
    lines.push(`- Calories burned: ${Math.round(summary.caloriesBurned)} kcal`);
  if (summary.activeMinutes != null) lines.push(`- Active minutes: ${summary.activeMinutes}`);
  if (summary.heartRate != null) lines.push(`- Heart rate: ${summary.heartRate} BPM`);
  if (summary.restingHeartRate != null)
    lines.push(`- Resting heart rate: ${summary.restingHeartRate} BPM`);
  if (summary.sleepHours != null)
    lines.push(`- Sleep last night: ${summary.sleepHours.toFixed(1)} hours`);
  if (summary.weight != null) lines.push(`- Weight: ${summary.weight} kg`);
  if (summary.vo2Max != null) lines.push(`- VO2 Max: ${summary.vo2Max}`);
  if (summary.bloodPressureSystolic != null && summary.bloodPressureDiastolic != null) {
    lines.push(
      `- Blood pressure: ${summary.bloodPressureSystolic}/${summary.bloodPressureDiastolic}`,
    );
  }
  if (summary.bloodGlucose != null) lines.push(`- Blood glucose: ${summary.bloodGlucose} mg/dL`);
  if (summary.lastUpdated)
    lines.push(`(Last updated: ${new Date(summary.lastUpdated).toLocaleTimeString()})`);

  return lines.length > 1 ? lines.join('\n') : '';
}
