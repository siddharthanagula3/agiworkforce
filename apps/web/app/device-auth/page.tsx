import { redirect } from 'next/navigation';

// The actual device-auth flow lives at /auth/device. This route forwards.
export default function DeviceAuthPage(): never {
  redirect('/auth/device');
}
