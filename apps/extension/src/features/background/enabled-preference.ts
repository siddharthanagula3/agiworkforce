const READ_ATTEMPTS = 3;
const RETRY_DELAY_MS = 200;

export interface EnabledPreferenceReader {
  read: () => Promise<unknown>;
  onUnreadable: (error: unknown) => void;
  wait?: (ms: number) => Promise<void>;
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readEnabledPreference({
  read,
  onUnreadable,
  wait = defaultWait,
}: EnabledPreferenceReader): Promise<boolean> {
  let failure: unknown;
  for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt += 1) {
    try {
      return (await read()) !== false;
    } catch (error) {
      failure = error;
      if (attempt < READ_ATTEMPTS) await wait(RETRY_DELAY_MS * attempt);
    }
  }
  onUnreadable(failure);
  return false;
}
