import { ChromeWindow, EditorWindow, PhoneDevice } from './DeviceMockups';

export function MobileMockup() {
  return <PhoneDevice />;
}

export function VSCodeMockup() {
  return <EditorWindow />;
}

export function ChromeMockup() {
  return <ChromeWindow />;
}
