import type { TextElement } from './TextElement';

export type UserMessageEvent = {
  message: string;
  images: Array<string> | null;
  local_images: Array<string>;
  text_elements: Array<TextElement>;
};
