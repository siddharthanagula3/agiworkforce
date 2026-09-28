const OBJECT_URL_RELEASE_DELAY_MS = 1000;

export function downloadTextFile(text: string, fileName: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_RELEASE_DELAY_MS);
}
