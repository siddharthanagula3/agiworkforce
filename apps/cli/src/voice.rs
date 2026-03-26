//! Voice input module — push-to-talk with Whisper STT.
//!
//! Supports two transcription backends:
//! 1. **OpenAI Whisper API** — used when `OPENAI_API_KEY` is set.
//! 2. **Local `whisper` binary** — used as fallback when the binary is on `$PATH`.
//!
//! Audio is captured from the default input device using `cpal`, recorded as
//! 16 kHz mono PCM, then encoded to WAV via `hound` before transcription.

use anyhow::{bail, Context, Result};
use colored::Colorize;
use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use crossterm::terminal;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::agent::AgentSession;
use crate::config::CliConfig;
use crate::markdown::MarkdownRenderer;
use crate::output;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Sample rate for audio capture (16 kHz — Whisper's native rate).
const SAMPLE_RATE: u32 = 16_000;

/// Maximum recording duration (seconds) to prevent runaway captures.
const MAX_RECORDING_SECS: u64 = 120;

/// Minimum recording duration (milliseconds) to filter out accidental taps.
const MIN_RECORDING_MS: u128 = 300;

/// Supported voice languages (ISO 639-1 codes).
const SUPPORTED_LANGUAGES: &[(&str, &str)] = &[
    ("en", "English"),
    ("es", "Spanish"),
    ("fr", "French"),
    ("de", "German"),
    ("it", "Italian"),
    ("pt", "Portuguese"),
    ("ja", "Japanese"),
    ("ko", "Korean"),
    ("zh", "Chinese"),
    ("ar", "Arabic"),
    ("hi", "Hindi"),
    ("ru", "Russian"),
    ("nl", "Dutch"),
    ("pl", "Polish"),
    ("sv", "Swedish"),
    ("da", "Danish"),
    ("no", "Norwegian"),
    ("fi", "Finnish"),
    ("tr", "Turkish"),
    ("cs", "Czech"),
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Run the interactive voice mode loop.
///
/// Listens for push-to-talk input (SPACE to record, ESC to exit). After each
/// recording, audio is transcribed via Whisper and the resulting text is fed
/// into the agent session as a normal user message.
pub async fn run_voice_mode(
    session: &mut AgentSession,
    config: &CliConfig,
    voice_lang: &str,
) -> Result<()> {
    // Validate language
    if !SUPPORTED_LANGUAGES
        .iter()
        .any(|(code, _)| *code == voice_lang)
    {
        let valid: Vec<&str> = SUPPORTED_LANGUAGES.iter().map(|(c, _)| *c).collect();
        bail!(
            "Unsupported voice language '{}'. Supported: {}",
            voice_lang,
            valid.join(", ")
        );
    }

    // Detect transcription backend
    let backend = detect_backend();
    match &backend {
        TranscriptionBackend::OpenAiApi => {
            eprintln!(
                "  {} Using OpenAI Whisper API (OPENAI_API_KEY detected)",
                "voice:".cyan().bold()
            );
        }
        TranscriptionBackend::LocalBinary(path) => {
            eprintln!(
                "  {} Using local whisper binary: {}",
                "voice:".cyan().bold(),
                path.display()
            );
        }
        TranscriptionBackend::None => {
            output::print_error(
                "No transcription backend available.\n\
                 Set OPENAI_API_KEY for the Whisper API, or install the `whisper` CLI tool.",
            );
            return Ok(());
        }
    }

    // Verify audio device availability
    if let Err(e) = check_audio_device() {
        output::print_error(&format!("Audio device error: {:#}", e));
        eprintln!("  {}", "Voice mode requires a working microphone.".dimmed());
        return Ok(());
    }

    eprintln!();
    eprintln!(
        "  {} Press {} to talk, {} to exit voice mode.",
        "voice:".cyan().bold(),
        "SPACE".bold(),
        "ESC".bold(),
    );
    eprintln!(
        "  {} Language: {} ({})",
        "voice:".cyan().bold(),
        voice_lang,
        language_name(voice_lang),
    );
    eprintln!();

    // Voice session loop
    loop {
        eprint!("{}", "  [SPACE to record, ESC to exit] ".dimmed());
        std::io::stderr().flush().ok();

        // Wait for keypress in raw mode
        match wait_for_key()? {
            VoiceAction::StartRecording => {}
            VoiceAction::Exit => {
                eprintln!();
                output::print_info("Exited voice mode.");
                break;
            }
        }

        // Record audio
        eprintln!();
        let recording = match record_audio()? {
            Some(audio) => audio,
            None => {
                // Recording was too short or cancelled
                eprintln!("  {}", "(recording too short, skipped)".dimmed());
                continue;
            }
        };

        // Transcribe
        let spinner = output::create_spinner("Transcribing...");
        let transcript = transcribe(&backend, &recording, voice_lang).await;
        spinner.finish_and_clear();

        let text = match transcript {
            Ok(t) if t.trim().is_empty() => {
                eprintln!("  {}", "(no speech detected)".dimmed());
                continue;
            }
            Ok(t) => t,
            Err(e) => {
                output::print_error(&format!("Transcription failed: {:#}", e));
                continue;
            }
        };

        // Show transcribed text and ask for confirmation
        eprintln!("  {} {}", "You said:".green().bold(), text.trim());
        eprintln!(
            "  {}",
            "[ENTER to send, 'r' to re-record, ESC to discard]".dimmed()
        );

        match wait_for_confirmation()? {
            Confirmation::Send => {}
            Confirmation::ReRecord => {
                eprintln!("  {}", "(re-recording...)".dimmed());
                continue;
            }
            Confirmation::Discard => {
                eprintln!("  {}", "(discarded)".dimmed());
                continue;
            }
        }

        // Send transcribed text to agent (same as typing it)
        let trimmed = text.trim().to_string();
        eprintln!();

        let spinner = output::create_spinner("Thinking...");
        let md = std::sync::Arc::new(std::sync::Mutex::new(MarkdownRenderer::new()));
        let md_cb = std::sync::Arc::clone(&md);

        let result = session
            .send(
                config,
                &trimmed,
                Box::new(move |chunk| {
                    if let Ok(mut renderer) = md_cb.lock() {
                        output::print_assistant_chunk_formatted(&mut renderer, chunk);
                    }
                }),
            )
            .await;

        spinner.finish_and_clear();

        // Flush remaining markdown buffer
        if let Ok(mut renderer) = md.lock() {
            output::flush_markdown(&mut renderer);
        }

        match result {
            Ok(turn) => {
                output::print_assistant_end();
                if turn.via_subscription {
                    output::print_subscription_cost(turn.input_tokens, turn.output_tokens);
                } else {
                    output::print_cost(&session.model, turn.input_tokens, turn.output_tokens);
                }
            }
            Err(e) => {
                output::print_error(&format!("{:#}", e));
            }
        }

        eprintln!();
    }

    Ok(())
}

/// Check whether a voice language code is valid.
pub fn is_valid_language(lang: &str) -> bool {
    SUPPORTED_LANGUAGES.iter().any(|(code, _)| *code == lang)
}

/// Return the list of supported language codes.
pub fn supported_languages() -> Vec<(&'static str, &'static str)> {
    SUPPORTED_LANGUAGES.to_vec()
}

// ---------------------------------------------------------------------------
// Transcription backend detection
// ---------------------------------------------------------------------------

/// Which transcription backend to use.
enum TranscriptionBackend {
    /// OpenAI Whisper API (requires OPENAI_API_KEY).
    OpenAiApi,
    /// Local `whisper` CLI binary at the given path.
    LocalBinary(PathBuf),
    /// No backend available.
    None,
}

/// Detect the best available transcription backend.
///
/// Priority: OpenAI API (if key set) > local binary > none.
fn detect_backend() -> TranscriptionBackend {
    // Check for OpenAI API key
    if std::env::var("OPENAI_API_KEY").is_ok_and(|k| !k.is_empty()) {
        return TranscriptionBackend::OpenAiApi;
    }

    // Check for local whisper binary
    if let Ok(output) = std::process::Command::new("which").arg("whisper").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return TranscriptionBackend::LocalBinary(PathBuf::from(path));
            }
        }
    }

    // Also check `whisper-cpp` as an alternative
    if let Ok(output) = std::process::Command::new("which")
        .arg("whisper-cpp")
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return TranscriptionBackend::LocalBinary(PathBuf::from(path));
            }
        }
    }

    TranscriptionBackend::None
}

// ---------------------------------------------------------------------------
// Audio device check
// ---------------------------------------------------------------------------

/// Verify that a default audio input device is available.
fn check_audio_device() -> Result<()> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .context("No default audio input device found")?;

    // Try to get a supported input config to confirm the device works
    let _config = device
        .supported_input_configs()
        .context("Failed to query supported input configs")?
        .next()
        .context("Audio input device has no supported configurations")?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Keyboard input helpers
// ---------------------------------------------------------------------------

/// Action from waiting for initial keypress.
enum VoiceAction {
    StartRecording,
    Exit,
}

/// Confirmation action after showing transcribed text.
enum Confirmation {
    Send,
    ReRecord,
    Discard,
}

/// Wait for the user to press SPACE (start recording) or ESC (exit).
fn wait_for_key() -> Result<VoiceAction> {
    terminal::enable_raw_mode().context("Failed to enable raw terminal mode")?;

    let result = loop {
        if event::poll(Duration::from_millis(100))? {
            if let Event::Key(key_event) = event::read()? {
                if key_event.kind != KeyEventKind::Press {
                    continue;
                }
                match key_event.code {
                    KeyCode::Char(' ') => break Ok(VoiceAction::StartRecording),
                    KeyCode::Esc => break Ok(VoiceAction::Exit),
                    _ => {}
                }
            }
        }
    };

    terminal::disable_raw_mode().context("Failed to disable raw terminal mode")?;
    result
}

/// Wait for confirmation after transcription: ENTER to send, 'r' to re-record, ESC to discard.
fn wait_for_confirmation() -> Result<Confirmation> {
    terminal::enable_raw_mode().context("Failed to enable raw terminal mode")?;

    let result = loop {
        if event::poll(Duration::from_millis(100))? {
            if let Event::Key(key_event) = event::read()? {
                if key_event.kind != KeyEventKind::Press {
                    continue;
                }
                match key_event.code {
                    KeyCode::Enter => break Ok(Confirmation::Send),
                    KeyCode::Char('r') | KeyCode::Char('R') => break Ok(Confirmation::ReRecord),
                    KeyCode::Esc => break Ok(Confirmation::Discard),
                    _ => {}
                }
            }
        }
    };

    terminal::disable_raw_mode().context("Failed to disable raw terminal mode")?;
    result
}

// ---------------------------------------------------------------------------
// Audio recording
// ---------------------------------------------------------------------------

/// Recorded audio data (raw PCM samples).
struct AudioRecording {
    /// 16-bit PCM samples at SAMPLE_RATE Hz, mono.
    samples: Vec<i16>,
}

/// Record audio from the default input device until SPACE is released or ESC is pressed.
///
/// Returns `None` if the recording was too short (< MIN_RECORDING_MS).
fn record_audio() -> Result<Option<AudioRecording>> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .context("No default audio input device")?;

    // Find a config close to our desired format (16kHz mono)
    let desired_config = cpal::StreamConfig {
        channels: 1,
        sample_rate: cpal::SampleRate(SAMPLE_RATE),
        buffer_size: cpal::BufferSize::Default,
    };

    // Check if the device supports our desired config; if not, use a supported one and resample
    let supported = device
        .supported_input_configs()
        .context("Failed to query input configs")?;

    let mut best_config = None;
    for cfg_range in supported {
        if cfg_range.channels() == 1
            && cfg_range.min_sample_rate().0 <= SAMPLE_RATE
            && cfg_range.max_sample_rate().0 >= SAMPLE_RATE
        {
            best_config = Some(desired_config.clone());
            break;
        }
    }

    let stream_config = match best_config {
        Some(cfg) => cfg,
        None => {
            // Fallback: use whatever the device provides, we will resample later
            let default_cfg = device.default_input_config().map_err(|e| {
                anyhow::anyhow!(
                    "Audio device has no default input config ({}). \
                     Try specifying an input device explicitly.",
                    e
                )
            })?;
            cpal::StreamConfig {
                channels: default_cfg.channels(),
                sample_rate: default_cfg.sample_rate(),
                buffer_size: cpal::BufferSize::Default,
            }
        }
    };

    let actual_sample_rate = stream_config.sample_rate.0;
    let actual_channels = stream_config.channels;

    let samples: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let samples_writer = Arc::clone(&samples);
    let recording_active = Arc::new(AtomicBool::new(true));

    let err_flag = Arc::new(AtomicBool::new(false));
    let err_flag_cb = Arc::clone(&err_flag);

    let stream = device
        .build_input_stream(
            &stream_config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if let Ok(mut buf) = samples_writer.lock() {
                    buf.extend_from_slice(data);
                }
            },
            move |err| {
                eprintln!("  {}", format!("Audio stream error: {}", err).red());
                err_flag_cb.store(true, Ordering::Relaxed);
            },
            None,
        )
        .context("Failed to build audio input stream")?;

    stream.play().context("Failed to start audio capture")?;

    let start = Instant::now();

    // Show recording indicator
    eprint!(
        "  {} {} ",
        "REC".on_red().white().bold(),
        "(release SPACE to stop)".dimmed()
    );
    std::io::stderr().flush().ok();

    // Wait for SPACE release or ESC or timeout
    terminal::enable_raw_mode().context("Failed to enable raw mode for recording")?;

    let cancelled = loop {
        if start.elapsed() > Duration::from_secs(MAX_RECORDING_SECS) {
            eprintln!();
            eprintln!(
                "  {}",
                format!("(max recording time {}s reached)", MAX_RECORDING_SECS).yellow()
            );
            break false;
        }

        if event::poll(Duration::from_millis(50))? {
            if let Event::Key(key_event) = event::read()? {
                match (key_event.code, key_event.kind) {
                    // SPACE release → stop recording
                    (KeyCode::Char(' '), KeyEventKind::Release) => {
                        break false;
                    }
                    // ESC → cancel
                    (KeyCode::Esc, KeyEventKind::Press) => {
                        break true;
                    }
                    // Any other SPACE press while recording → also treat as stop
                    // This handles terminals that don't emit Release events
                    (KeyCode::Char(' '), KeyEventKind::Press) => {
                        // Second press = toggle off
                        break false;
                    }
                    _ => {}
                }
            }
        }

        // Animated recording indicator
        let elapsed_secs = start.elapsed().as_secs();
        eprint!(
            "\r  {} {} {}s ",
            "REC".on_red().white().bold(),
            "(release SPACE to stop)".dimmed(),
            elapsed_secs,
        );
        std::io::stderr().flush().ok();
    };

    terminal::disable_raw_mode().context("Failed to disable raw mode after recording")?;

    // Stop the stream
    recording_active.store(false, Ordering::Relaxed);
    drop(stream);

    eprintln!();

    if cancelled {
        eprintln!("  {}", "(recording cancelled)".dimmed());
        return Ok(None);
    }

    let duration_ms = start.elapsed().as_millis();
    if duration_ms < MIN_RECORDING_MS {
        return Ok(None);
    }

    if err_flag.load(Ordering::Relaxed) {
        bail!("Audio stream encountered errors during recording");
    }

    // Extract and convert samples
    let raw_samples = samples
        .lock()
        .map_err(|_| anyhow::anyhow!("Failed to lock audio buffer"))?
        .clone();

    if raw_samples.is_empty() {
        return Ok(None);
    }

    // Convert to mono if needed
    let mono_samples: Vec<f32> = if actual_channels > 1 {
        raw_samples
            .chunks(actual_channels as usize)
            .map(|chunk| {
                let sum: f32 = chunk.iter().sum();
                sum / chunk.len() as f32
            })
            .collect()
    } else {
        raw_samples
    };

    // Resample to SAMPLE_RATE if needed
    let resampled = if actual_sample_rate != SAMPLE_RATE {
        resample(&mono_samples, actual_sample_rate, SAMPLE_RATE)
    } else {
        mono_samples
    };

    // Convert f32 -> i16
    let pcm_samples: Vec<i16> = resampled
        .iter()
        .map(|&s| {
            let clamped = s.clamp(-1.0, 1.0);
            (clamped * i16::MAX as f32) as i16
        })
        .collect();

    eprintln!(
        "  {} {:.1}s recorded ({} samples)",
        "voice:".cyan().bold(),
        duration_ms as f64 / 1000.0,
        pcm_samples.len(),
    );

    Ok(Some(AudioRecording {
        samples: pcm_samples,
    }))
}

/// Simple linear resampling from one sample rate to another.
fn resample(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate || samples.is_empty() {
        return samples.to_vec();
    }

    let ratio = from_rate as f64 / to_rate as f64;
    let new_len = (samples.len() as f64 / ratio) as usize;
    let mut output = Vec::with_capacity(new_len);

    for i in 0..new_len {
        let src_idx = i as f64 * ratio;
        let idx_floor = src_idx.floor() as usize;
        let idx_ceil = (idx_floor + 1).min(samples.len() - 1);
        let frac = (src_idx - idx_floor as f64) as f32;

        let interpolated = samples[idx_floor] * (1.0 - frac) + samples[idx_ceil] * frac;
        output.push(interpolated);
    }

    output
}

// ---------------------------------------------------------------------------
// WAV encoding
// ---------------------------------------------------------------------------

/// Encode PCM samples to a WAV file in a temporary location.
fn encode_wav(recording: &AudioRecording) -> Result<PathBuf> {
    let tmp_dir = std::env::temp_dir();
    let wav_path = tmp_dir.join(format!(
        "agiworkforce_voice_{}.wav",
        uuid::Uuid::new_v4()
    ));

    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer =
        hound::WavWriter::create(&wav_path, spec).context("Failed to create WAV file")?;

    for &sample in &recording.samples {
        writer
            .write_sample(sample)
            .context("Failed to write WAV sample")?;
    }

    writer.finalize().context("Failed to finalize WAV file")?;

    Ok(wav_path)
}

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

/// Transcribe an audio recording using the detected backend.
async fn transcribe(
    backend: &TranscriptionBackend,
    recording: &AudioRecording,
    language: &str,
) -> Result<String> {
    // First encode to WAV
    let wav_path = encode_wav(recording)?;

    let result = match backend {
        TranscriptionBackend::OpenAiApi => transcribe_openai_api(&wav_path, language).await,
        TranscriptionBackend::LocalBinary(binary_path) => {
            transcribe_local(&wav_path, binary_path, language).await
        }
        TranscriptionBackend::None => {
            bail!("No transcription backend available")
        }
    };

    // Clean up temp WAV file
    if let Err(e) = std::fs::remove_file(&wav_path) {
        eprintln!("[voice] Failed to clean up temp file {}: {}", wav_path.display(), e);
    }

    result
}

/// Transcribe using the OpenAI Whisper API.
async fn transcribe_openai_api(wav_path: &std::path::Path, language: &str) -> Result<String> {
    let api_key = std::env::var("OPENAI_API_KEY").context("OPENAI_API_KEY not set")?;

    let file_bytes = std::fs::read(wav_path).context("Failed to read WAV file for upload")?;

    let file_name = wav_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("audio.wav")
        .to_string();

    let file_part = reqwest::multipart::Part::bytes(file_bytes)
        .file_name(file_name)
        .mime_str("audio/wav")
        .context("Failed to create multipart file part")?;

    let form = reqwest::multipart::Form::new()
        .part("file", file_part)
        .text("model", "whisper-1")
        .text("language", language.to_string())
        .text("response_format", "text");

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .context("Failed to send request to Whisper API")?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        bail!(
            "Whisper API returned {} — {}",
            status,
            body.chars().take(200).collect::<String>()
        );
    }

    let text = response
        .text()
        .await
        .context("Failed to read Whisper API response")?;

    Ok(text.trim().to_string())
}

/// Transcribe using a local whisper binary (whisper or whisper-cpp).
async fn transcribe_local(
    wav_path: &std::path::Path,
    binary_path: &std::path::Path,
    language: &str,
) -> Result<String> {
    let output = tokio::process::Command::new(binary_path.as_os_str())
        .arg(wav_path.to_string_lossy().as_ref())
        .arg("--language")
        .arg(language)
        .arg("--output-format")
        .arg("txt")
        .arg("--output_dir")
        .arg(
            wav_path
                .parent()
                .unwrap_or_else(|| std::path::Path::new("/tmp")),
        )
        .output()
        .await
        .context("Failed to execute local whisper binary")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!(
            "Local whisper failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            stderr.chars().take(300).collect::<String>()
        );
    }

    // The local whisper binary writes output to a .txt file next to the .wav
    let txt_path = wav_path.with_extension("txt");
    if txt_path.exists() {
        let text =
            std::fs::read_to_string(&txt_path).context("Failed to read whisper output file")?;
        if let Err(e) = std::fs::remove_file(&txt_path) {
            eprintln!("[voice] Failed to clean up temp file {}: {}", txt_path.display(), e);
        }
        Ok(text.trim().to_string())
    } else {
        // Some versions write to stdout instead
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.trim().to_string())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Get the human-readable name for a language code.
fn language_name(code: &str) -> &'static str {
    SUPPORTED_LANGUAGES
        .iter()
        .find(|(c, _)| *c == code)
        .map(|(_, name)| *name)
        .unwrap_or("Unknown")
}

// cpal re-export for the check function
use cpal::traits::{DeviceTrait, HostTrait};
