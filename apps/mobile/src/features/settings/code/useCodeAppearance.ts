import { useCodePreferences } from './store';
import { resolveCodeFontFamily, resolveTranscriptFontFamily } from './codeAppearance';

export function useCodeFontFamily(): string {
  const codeFont = useCodePreferences((state) => state.codeFont);
  return resolveCodeFontFamily(codeFont);
}

export function useTranscriptFontFamily(): string | undefined {
  const transcriptFont = useCodePreferences((state) => state.transcriptFont);
  const codeFont = useCodePreferences((state) => state.codeFont);
  return resolveTranscriptFontFamily(transcriptFont, codeFont);
}

export function useShowDiffSigns(): boolean {
  return useCodePreferences((state) => state.showDiffSigns);
}
