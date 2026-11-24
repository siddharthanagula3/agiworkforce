import {
  DICTATION_MIME_TYPES,
  MAX_DICTATION_BYTES,
  MAX_DICTATION_MS,
} from '../protocol/dictationLimits';

export interface DictationCapture {
  finish(): void;
  cancel(): void;
}

export async function startDictationCapture(
  onAudio: (mimeType: string, base64: string) => void,
  onError: (message: string) => void,
): Promise<DictationCapture> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('Microphone recording is unavailable in this editor.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const release = () => stream.getTracks().forEach((track) => track.stop());
  try {
    const mimeType = DICTATION_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('This editor cannot record a supported audio format.');
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    let bytes = 0;
    let cancelled = false;
    const stop = () => {
      clearTimeout(timer);
      if (recorder.state !== 'inactive') recorder.stop();
    };
    const cancel = () => {
      cancelled = true;
      stop();
      release();
    };
    recorder.ondataavailable = ({ data }) => {
      if (cancelled) return;
      bytes += data.size;
      if (bytes > MAX_DICTATION_BYTES) {
        cancel();
        onError('The recording was too large. Try a shorter message.');
      } else if (data.size) {
        chunks.push(data);
      }
    };
    recorder.onerror = () => {
      cancel();
      onError('The microphone recording failed.');
    };
    recorder.onstop = () => {
      clearTimeout(timer);
      release();
      if (cancelled) return;
      if (!bytes) {
        onError('No audio was recorded.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (!cancelled && typeof reader.result === 'string') {
          onAudio(mimeType, reader.result.split(',', 2)[1] ?? '');
        }
      };
      reader.onerror = () => {
        if (!cancelled) onError('Could not read the recording.');
      };
      reader.readAsDataURL(new Blob(chunks, { type: mimeType }));
    };
    recorder.start(250);
    const timer = setTimeout(stop, MAX_DICTATION_MS);
    return { finish: stop, cancel };
  } catch (error) {
    release();
    throw error;
  }
}
