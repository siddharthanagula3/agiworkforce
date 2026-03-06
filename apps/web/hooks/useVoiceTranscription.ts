// Stub for desktop voice transcription hook
export function useVoiceTranscription(_opts?: any) {
  return {
    isRecording: false,
    isTranscribing: false,
    isSupported: false,
    isListening: false,
    transcript: '',
    interimTranscript: '',
    error: null as string | null,
    availableLocalWhisper: [] as string[],
    toggleRecording: async () => {},
    startListening: () => {},
    stopListening: () => {},
    clearTranscript: () => {},
  };
}

export default useVoiceTranscription;
