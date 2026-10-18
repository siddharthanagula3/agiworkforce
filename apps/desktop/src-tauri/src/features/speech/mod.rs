mod artifact_registry;
pub mod barge_in;
pub mod dictation;
pub mod local_stt;
pub mod local_tts;
mod piper_bundle;
pub mod tts;
pub mod vad;
pub mod wake;

pub use barge_in::{BargeInConfig, BargeInDetector, BargeInEvent, BargeInHandle};
pub use local_stt::{
    TranscriptionConfig, TranscriptionResult, TranscriptionSegment, WhisperLocal, WhisperModelInfo,
    WhisperModelSize,
};
pub use local_tts::{
    PiperLocal, PiperQuality, PiperVoiceDefinitions, SynthesisConfig, SynthesisResult,
    VoiceInfo as PiperVoiceInfo,
};
pub use tts::{
    create_tts_provider, AudioFormat, AudioOutput, ElevenLabsTts, SystemTts, TextToSpeech,
    TtsConfig, TtsInterruptReason, TtsPlaybackEvent, TtsPlayer, TtsProvider,
};
pub use vad::{AudioResampler, VadMode, VadModelManager, VAD_CHUNK_SIZE, VAD_SAMPLE_RATE};
#[cfg(feature = "vad")]
pub use vad::{SharedVad, WebRtcVad};
pub use wake::{is_vad_available, VoiceWake, WakeWordConfig, WakeWordEvent};
