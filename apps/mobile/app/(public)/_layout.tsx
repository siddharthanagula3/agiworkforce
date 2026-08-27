import { Slot } from 'expo-router';

export { default as ErrorBoundary } from './error';

export default function PublicLayout() {
  return <Slot />;
}
