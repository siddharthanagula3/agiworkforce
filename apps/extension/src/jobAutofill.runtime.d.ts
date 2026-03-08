import type {
  AutoFillJobApplicationResponse,
  JobApplicationProfile,
  JobAutofillOptions,
} from './types';

export function detectPlatformFromUrl(url: string): 'greenhouse' | 'workday' | 'unknown';

export function runPlatformJobAutofill(
  profile?: JobApplicationProfile,
  options?: JobAutofillOptions,
  timeoutMs?: number,
): Promise<AutoFillJobApplicationResponse>;
