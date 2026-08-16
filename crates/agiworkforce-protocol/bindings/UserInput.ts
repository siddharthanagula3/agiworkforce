import type { TextElement } from './TextElement';

export type UserInput =
  | {
      type: 'text';
      text: string;
      text_elements: Array<TextElement>;
    }
  | { type: 'image'; image_url: string }
  | { type: 'local_image'; path: string }
  | { type: 'skill'; name: string; path: string }
  | { type: 'mention'; name: string; path: string };
