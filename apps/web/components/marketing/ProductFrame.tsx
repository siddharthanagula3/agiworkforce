import {
  DesktopWindow,
  EditorWindow,
  ImageWindow,
  PhoneDevice,
  SidePanelCard,
  TerminalWindow,
  WebWindow,
  type DeviceImage,
} from './DeviceMockups';

/**
 * ProductFrame · variant-keyed façade over the canonical DeviceMockups
 * system. Every variant renders at its device's one fixed geometry (see
 * DEVICE_GEOMETRY) so the same surface looks identical on every page.
 * When a real screenshot exists, pass `image` and it renders inside the
 * shared window chrome instead (the image's own proportions apply).
 */

export type ProductFrameVariant = 'desktop' | 'terminal' | 'phone' | 'browser' | 'editor' | 'web';

export type ProductFrameImage = DeviceImage;

export interface ProductFrameProps {
  variant: ProductFrameVariant;
  /** Title shown in the frame chrome (e.g. "AGI Desktop", "agi · zsh"). */
  title: string;
  /** Mono status label rendered in the chrome right corner (e.g. "Local"). */
  badge?: string;
  /** Real screenshot; replaces the scene when provided. */
  image?: ProductFrameImage;
  className?: string;
}

export function ProductFrame({ variant, title, badge, image, className }: ProductFrameProps) {
  if (image) {
    return <ImageWindow title={title} badge={badge} image={image} className={className} />;
  }
  switch (variant) {
    case 'desktop':
      return <DesktopWindow title={title} badge={badge} className={className} />;
    case 'web':
      return <WebWindow title={title} badge={badge} className={className} />;
    case 'terminal':
      return <TerminalWindow title={title} badge={badge} className={className} />;
    case 'browser':
      return <SidePanelCard title={title} badge={badge} className={className} />;
    case 'editor':
      return <EditorWindow title={title} badge={badge} className={className} />;
    case 'phone':
      return <PhoneDevice label={`${title} interface`} className={className} />;
  }
}
