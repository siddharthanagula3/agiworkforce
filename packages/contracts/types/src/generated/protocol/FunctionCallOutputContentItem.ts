import type { ImageDetail } from './ImageDetail';

export type FunctionCallOutputContentItem =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail?: ImageDetail };
