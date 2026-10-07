import './legacy-landing.css';
import './motion/motion.css';
import './mockup-presentation.css';
import {
  ChromeAppPreview,
  DesktopAppPreview,
  EditorAppPreview,
  PhoneAppPreview,
  SidePanelPreview,
  TerminalAppPreview,
  WebAppPreview,
  type TerminalRouteMode,
  type TerminalView,
} from './app-preview/AppPreviews';
import { ImageScenePreview, type SceneImage } from './app-preview/WorkScenePreviews';

export type RouteMode = TerminalRouteMode;

export type DeviceImage = SceneImage;

export interface DeviceWindowProps {
  title?: string;
  badge?: string;
  className?: string;
}

export interface TerminalWindowProps extends DeviceWindowProps {
  routeMode?: RouteMode;
  view?: TerminalView;
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

export function TerminalWindow({ className, routeMode, view }: TerminalWindowProps) {
  return <TerminalAppPreview className={className} routeMode={routeMode} view={view} />;
}

export function PhoneDevice({ label, className }: { label?: string; className?: string }) {
  return <PhoneAppPreview label={label} className={className} />;
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
  return <ImageScenePreview title={title} badge={badge} image={image} className={className} />;
}
