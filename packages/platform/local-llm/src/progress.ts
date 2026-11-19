export const DOWNLOAD_PROGRESS_STEP = 0.01;

// A model download reports every chunk it writes, tens of thousands of times for a
// gigabyte file. Passing each one on re-rendered the caller's screen per chunk and
// left the JavaScript thread minutes behind the bytes.
export function reportProgressBySteps(
  onProgress: (fraction: number) => void,
  step: number = DOWNLOAD_PROGRESS_STEP,
): (fraction: number) => void {
  let shown = Number.NEGATIVE_INFINITY;
  return (fraction) => {
    if (!Number.isFinite(fraction)) return;
    const complete = fraction >= 1;
    if (complete ? shown >= 1 : fraction - shown < step) return;
    shown = fraction;
    onProgress(fraction);
  };
}
