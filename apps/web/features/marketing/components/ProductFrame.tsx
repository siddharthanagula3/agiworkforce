import {
  ChromeWindow,
  DesktopWindow,
  EditorWindow,
  ImageWindow,
  PhoneDevice,
  SidePanelCard,
  TerminalWindow,
  WebWindow,
  type DeviceImage,
  type TerminalLine,
  type TerminalWindowProps,
} from './DeviceMockups';

export type ProductFrameVariant =
  | 'desktop'
  | 'terminal'
  | 'phone'
  | 'browser'
  | 'chrome'
  | 'editor'
  | 'web';

export type ProductFrameImage = DeviceImage;
export type { TerminalLine } from './DeviceMockups';

export interface ProductFrameProps {
  variant: ProductFrameVariant;
  title: string;
  badge?: string;
  image?: ProductFrameImage;
  className?: string;
  routeMode?: 'local' | 'byok' | 'managed';
  session?: readonly TerminalLine[];
  hud?: TerminalWindowProps['hud'];
}

export function ProductFrame({
  variant,
  title,
  badge,
  image,
  className,
  routeMode,
  session,
  hud,
}: ProductFrameProps) {
  if (image) {
    return <ImageWindow title={title} badge={badge} image={image} className={className} />;
  }
  switch (variant) {
    case 'desktop':
      return (
        <DesktopWindow title={title} badge={badge} className={className} routeMode={routeMode} />
      );
    case 'web':
      return <WebWindow title={title} badge={badge} className={className} />;
    case 'terminal':
      return (
        <TerminalWindow
          title={title}
          badge={badge}
          className={className}
          routeMode={routeMode}
          session={session}
          hud={hud}
        />
      );
    case 'chrome':
      return <ChromeWindow badge={badge} className={className} />;
    case 'browser':
      return <SidePanelCard title={title} badge={badge} className={className} />;
    case 'editor':
      return <EditorWindow title={title} badge={badge} className={className} />;
    case 'phone':
      return <PhoneDevice label={`${title} interface`} className={className} />;
  }
}
