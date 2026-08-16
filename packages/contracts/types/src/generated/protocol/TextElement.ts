import type { ByteRange } from './ByteRange';

export type TextElement = {
  byte_range: ByteRange;
  placeholder: string | null;
};
