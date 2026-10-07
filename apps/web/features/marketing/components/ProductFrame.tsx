import {
  DesktopWindow,
  EditorWindow,
  ImageWindow,
  PhoneDevice,
  SidePanelCard,
  TerminalWindow,
  type RouteMode,
  WebWindow,
  type DeviceImage,
} from './DeviceMockups';

export type ProductFrameVariant = 'desktop' | 'terminal' | 'phone' | 'browser' | 'editor' | 'web';

export type ProductFrameImage = DeviceImage;

interface ProductFrameBaseProps {
  title: string;
  badge?: string;
  image?: ProductFrameImage;
  className?: string;
}

export type ProductFrameProps =
  | (ProductFrameBaseProps & { variant: 'terminal'; routeMode?: RouteMode })
  | (ProductFrameBaseProps & {
      variant: Exclude<ProductFrameVariant, 'terminal'>;
      routeMode?: never;
    });

export function ProductFrame(props: ProductFrameProps) {
  const { title, badge, image, className } = props;
  if (image) {
    return <ImageWindow title={title} badge={badge} image={image} className={className} />;
  }
  switch (props.variant) {
    case 'desktop':
      return <DesktopWindow title={title} badge={badge} className={className} />;
    case 'web':
      return <WebWindow title={title} badge={badge} className={className} />;
    case 'terminal':
      return (
        <TerminalWindow
          title={title}
          badge={badge}
          className={className}
          routeMode={props.routeMode}
        />
      );
    case 'browser':
      return <SidePanelCard title={title} badge={badge} className={className} />;
    case 'editor':
      return <EditorWindow title={title} badge={badge} className={className} />;
    case 'phone':
      return <PhoneDevice className={className} />;
  }
}
