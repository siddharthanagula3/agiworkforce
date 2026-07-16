import { ChromeWindow, EditorWindow, PhoneDevice } from './DeviceMockups';

/**
 * SurfaceMockups · named surface visuals for the landing page, backed by
 * the canonical DeviceMockups system (one fixed geometry per device type,
 * identical wherever it appears).
 */

export function MobileMockup() {
  return <PhoneDevice />;
}

export function VSCodeMockup() {
  return <EditorWindow />;
}

export function ChromeMockup() {
  return <ChromeWindow />;
}
