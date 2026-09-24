const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export const PICTURE_NEEDLE = {
  camera: 'FIXTURECAMERA',
  pixels: 'FIXTUREPIXELS',
} as const;

function ascii(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) out.push(text.charCodeAt(i));
  return out;
}

function u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

export function onePixelPng(name = 'pixel.png'): File {
  const bytes = Uint8Array.from(atob(ONE_PIXEL_PNG), (char) => char.charCodeAt(0));
  return new File([bytes], name, { type: 'image/png' });
}

/** A JPEG whose Exif names the camera, places it at 37N and says it is on its side. */
export function jpegWithLocationBytes(orientation = 6): Uint8Array<ArrayBuffer> {
  const camera = [...ascii(PICTURE_NEEDLE.camera), 0];
  const cameraAt = 8 + 2 + 3 * 12 + 4;
  const gpsAt = cameraAt + camera.length;
  const tiff = [
    ...ascii('MM'),
    ...u16(0x2a),
    ...u32(8),
    ...u16(3),
    ...u16(0x010f),
    ...u16(2),
    ...u32(camera.length),
    ...u32(cameraAt),
    ...u16(0x0112),
    ...u16(3),
    ...u32(1),
    ...u16(orientation),
    0,
    0,
    ...u16(0x8825),
    ...u16(4),
    ...u32(1),
    ...u32(gpsAt),
    ...u32(0),
    ...camera,
    ...u16(1),
    ...u16(0x0001),
    ...u16(2),
    ...u32(2),
    ...ascii('N'),
    0,
    0,
    0,
    ...u32(0),
  ];
  const exif = [...ascii('Exif'), 0, 0, ...tiff];
  const scan = [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00];
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe1,
    ...u16(exif.length + 2),
    ...exif,
    0xff,
    0xdb,
    ...u16(5),
    0x00,
    0x10,
    0x11,
    0xff,
    0xda,
    ...u16(scan.length + 2),
    ...scan,
    ...ascii(PICTURE_NEEDLE.pixels),
    0xff,
    0xd9,
  ]);
}

export function jpegWithLocation(name = 'beach.jpg', orientation = 6): File {
  return new File([jpegWithLocationBytes(orientation)], name, { type: 'image/jpeg' });
}

export function includesText(bytes: Uint8Array, text: string): boolean {
  const needle = ascii(text);
  outer: for (let i = 0; i + needle.length <= bytes.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

export function bytesOf(file: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(file);
  });
}
