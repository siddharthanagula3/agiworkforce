import type { Metadata } from 'next';
import { DictationBar } from '@/features/desktop-host';

export const metadata: Metadata = { title: 'Dictation' };

export default function DictatePage() {
  return <DictationBar />;
}
