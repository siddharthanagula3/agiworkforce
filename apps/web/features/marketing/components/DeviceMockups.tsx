import './legacy-landing.css';
import './motion/motion.css';
import './mockup-presentation.css';
import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';
import {
  ChromeAppPreview,
  DesktopAppPreview,
  EditorAppPreview,
  PhoneAppPreview,
  SidePanelPreview,
  TerminalAppPreview,
  WebAppPreview,
  type TerminalRouteMode,
} from './app-preview/AppPreviews';

export type DeviceType = 'desktop' | 'web' | 'chrome' | 'editor' | 'terminal' | 'panel' | 'phone';

export const DEVICE_GEOMETRY: Record<DeviceType, { width: number; height: number }> = {
  desktop: { width: 720, height: 480 },
  web: { width: 720, height: 450 },
  chrome: { width: 720, height: 480 },
  editor: { width: 720, height: 450 },
  terminal: { width: 640, height: 400 },
  panel: { width: 400, height: 520 },
  phone: { width: 270, height: 585 },
};

export type RouteMode = TerminalRouteMode;

export interface DeviceWindowProps {
  title?: string;
  badge?: string;
  className?: string;
}

export interface TerminalWindowProps extends DeviceWindowProps {
  routeMode?: RouteMode;
}

function deviceStyle(type: DeviceType): CSSProperties {
  const { width, height } = DEVICE_GEOMETRY[type];
  return { '--dev-w': width, '--dev-h': height } as CSSProperties;
}

function DeviceRoot({
  type,
  label,
  className,
  children,
}: {
  type: DeviceType;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const { width, height } = DEVICE_GEOMETRY[type];
  return (
    <figure
      className={['agi-dev', `agi-dev--${type}`, className].filter(Boolean).join(' ')}
      style={deviceStyle(type)}
      data-device={type}
      data-geometry={`${width}x${height}`}
      aria-label={label}
    >
      <div className="agi-dev-shell">{children}</div>
    </figure>
  );
}

function WindowBar({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="agi-dev-bar" aria-hidden="true">
      <span className="agi-dev-lights">
        <i />
        <i />
        <i />
      </span>
      <span className="agi-dev-title">{title}</span>
      {badge ? <span className="agi-dev-badge">{badge}</span> : null}
    </div>
  );
}

export function DesktopWindow({ className }: DeviceWindowProps) {
  return <DesktopAppPreview className={className} />;
}

export function WebWindow({ className }: DeviceWindowProps) {
  return <WebAppPreview className={className} />;
}

export function ChromeWindow({ className }: DeviceWindowProps) {
  return <ChromeAppPreview className={className} />;
}

export function SidePanelCard({ className }: DeviceWindowProps) {
  return <SidePanelPreview className={className} />;
}

export function EditorWindow({ className }: DeviceWindowProps) {
  return <EditorAppPreview className={className} />;
}

export function TerminalWindow({ className, routeMode }: TerminalWindowProps) {
  return <TerminalAppPreview className={className} routeMode={routeMode} />;
}

export function PhoneDevice({ label, className }: { label?: string; className?: string }) {
  return <PhoneAppPreview label={label} className={className} />;
}

export function AppWindow({
  title,
  badge,
  label,
  type = 'web',
  className,
  children,
}: {
  title: string;
  badge?: string;
  label: string;
  type?: DeviceType;
  className?: string;
  children: ReactNode;
}) {
  return (
    <DeviceRoot type={type} label={label} className={className}>
      <WindowBar title={title} badge={badge} />
      <div className="agi-dev-body agi-sc" aria-hidden="true">
        {children}
      </div>
    </DeviceRoot>
  );
}

export interface DeviceImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export function ImageWindow({
  title,
  badge,
  image,
  className,
}: {
  title: string;
  badge?: string;
  image: DeviceImage;
  className?: string;
}) {
  return (
    <figure
      className={['agi-dev', 'agi-dev--image', className].filter(Boolean).join(' ')}
      style={deviceStyle('desktop')}
      data-device="image"
    >
      <div className="agi-dev-shell">
        <WindowBar title={title} badge={badge} />
        <Image
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes="(min-width: 960px) 50vw, 100vw"
          className="agi-dev-image"
        />
      </div>
    </figure>
  );
}
