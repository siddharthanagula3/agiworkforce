import type {
  AutoFillJobApplicationResponse,
  JobApplicationProfile,
  JobAutofillOptions,
} from './types';

export function runPlatformJobAutofill(
  profile?: JobApplicationProfile,
  options?: JobAutofillOptions,
  timeoutMs?: number,
): Promise<AutoFillJobApplicationResponse>;
