import { runPlatformJobAutofill as runPlatformJobAutofillRuntime } from './jobAutofill.runtime.js';
import type {
  AutoFillJobApplicationResponse,
  JobApplicationProfile,
  JobAutofillOptions,
} from './types';

const DEFAULT_TIMEOUT_MS = 120_000;

export async function runPlatformJobAutofill(
  profile: JobApplicationProfile = {},
  options: JobAutofillOptions = {},
): Promise<AutoFillJobApplicationResponse> {
  return runPlatformJobAutofillRuntime(profile, options, DEFAULT_TIMEOUT_MS);
}
