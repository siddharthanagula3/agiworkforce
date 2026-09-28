async function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  if (typeof FileReader === 'undefined') {
    throw new Error('This surface cannot read the selected file.');
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The selected file could not be read.'));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('The selected file returned invalid bytes.'));
    };
    reader.readAsArrayBuffer(blob);
  });
}

export async function sha256HexOfBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await readBlobBytes(blob));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
