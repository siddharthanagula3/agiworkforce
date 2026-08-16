import { redirect } from 'next/navigation';

export default function DeviceAuthPage(): never {
  redirect('/auth/device');
}
