import type {
  AutoFillJobApplicationResponse,
  JobApplicationProfile,
  JobAutofillOptions,
} from './types';

export function detectPlatformFromUrl(url: string): 'greenhouse' | 'workday' | 'unknown';

export function isFullNameAutofillField(element: Element): boolean;

export function resolveAutofillSelector(
  key: string,
  selectors: readonly string[],
): { element: HTMLElement; selector: string } | null;

export function runPlatformJobAutofill(
  profile?: JobApplicationProfile,
  options?: JobAutofillOptions,
  timeoutMs?: number,
): Promise<AutoFillJobApplicationResponse>;
