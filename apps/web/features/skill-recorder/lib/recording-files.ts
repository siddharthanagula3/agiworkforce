import type {
  SkillCaptureFrame,
  SkillCaptureRecording,
} from '@agiworkforce/local-runtime-contract';

const FILE_PREFIX = 'recording';
const FILE_EXTENSION = 'jpg';

export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function frameDataUrl(frame: SkillCaptureFrame): string {
  return `data:${frame.mimeType};base64,${frame.imageBase64}`;
}

function frameBytes(frame: SkillCaptureFrame): Uint8Array<ArrayBuffer> {
  const binary = atob(frame.imageBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function recordingFiles(
  recording: SkillCaptureRecording,
  indexes: readonly number[],
): File[] {
  return [...indexes]
    .sort((left, right) => left - right)
    .flatMap((index) => {
      const frame = recording.frames[index];
      if (!frame) return [];
      return [
        new File(
          [frameBytes(frame)],
          `${FILE_PREFIX}-${recording.startedAt}-${index + 1}.${FILE_EXTENSION}`,
          { type: frame.mimeType, lastModified: recording.startedAt + frame.offsetMs },
        ),
      ];
    });
}

/** Evenly spaced picks that always keep the first and the last screenshot. */
export function defaultSelection(frameCount: number, limit: number): number[] {
  const take = Math.min(frameCount, Math.max(0, limit));
  if (take === 0) return [];
  if (take === frameCount) return Array.from({ length: frameCount }, (_, index) => index);
  if (take === 1) return [0];
  const picks = new Set<number>();
  for (let step = 0; step < take; step += 1) {
    picks.add(Math.round((step * (frameCount - 1)) / (take - 1)));
  }
  return [...picks].sort((left, right) => left - right);
}
