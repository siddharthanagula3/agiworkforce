import type { VideoInputImages } from '@features/media/services/media-api-service';

export type VideoInputKind = VideoInputImages['kind'];

export function videoInputKindOf(images: VideoInputImages | undefined): VideoInputKind | undefined {
  return images?.kind;
}

export type VideoRetryInputs =
  { ok: true; inputImages: VideoInputImages | undefined } | { ok: false; message: string };

export function resolveVideoRetryInputs(
  originalKind: unknown,
  retained: VideoInputImages | undefined,
): VideoRetryInputs {
  if (originalKind !== 'first_frame' && originalKind !== 'reference') {
    return { ok: true, inputImages: retained };
  }
  if (retained?.kind === originalKind) return { ok: true, inputImages: retained };
  const subject = originalKind === 'first_frame' ? 'first-frame image' : 'reference images';
  return {
    ok: false,
    message: `Video generation could not be repeated because the ${subject} from the original request are no longer available. Attach them again and resend the prompt to start a new generation.`,
  };
}
