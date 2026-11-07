import { createContext, useContext, type ReactElement } from 'react';
import { GatedImage } from './ImageTrust';

export interface AnswerImageProps {
  src: string;
  alt: string;
  className?: string;
}

export type AnswerImageRenderer = (image: AnswerImageProps) => ReactElement | undefined;

export const AnswerImageRendererContext = createContext<AnswerImageRenderer | undefined>(undefined);

export function AnswerImage(image: AnswerImageProps) {
  const render = useContext(AnswerImageRendererContext);
  return render?.(image) ?? <GatedImage {...image} />;
}
