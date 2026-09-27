'use client';

import { VoiceSection } from '@/features/settings/sections/VoiceSection';

export default function VoiceSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-gutter-compact py-10 sm:px-gutter-regular md:px-gutter-wide">
      <VoiceSection />
    </div>
  );
}
