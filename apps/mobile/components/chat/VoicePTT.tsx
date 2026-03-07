import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Pressable, View, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Mic } from 'lucide-react-native';
import { colors } from '@/lib/theme';

/**
 * VoicePTT — Push-to-talk mic button with Deepgram direct transcription.
 *
 * Usage:
 *   <VoicePTT onTranscript={(text) => setInput(prev => prev + text)} deepgramApiKey={key} />
 *
 * States:
 *   idle        — blue mic icon, press-and-hold to record
 *   recording   — red mic with pulsing ring, release to transcribe
 *   transcribing — spinner while waiting for Deepgram response
 *
 * If no deepgramApiKey is provided the component falls back to the raw
 * audio URI text ("[voice input]") so the parent is always called.
 */

type PTTState = 'idle' | 'recording' | 'transcribing';

export interface VoicePTTProps {
  /** Called with the transcribed text when transcription completes. */
  onTranscript: (text: string) => void;
  /** Deepgram API key. If omitted, falls back to a placeholder string. */
  deepgramApiKey?: string;
  /** Disable the button entirely (e.g., while streaming). */
  disabled?: boolean;
}

const DEEPGRAM_ENDPOINT = 'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true';

/** Send audio file to Deepgram pre-recorded API and return transcript text. */
async function transcribeWithDeepgram(uri: string, apiKey: string): Promise<string> {
  const formData = new FormData();
  // React Native FormData accepts { uri, type, name } for file blobs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formData.append('audio', { uri, type: 'audio/m4a', name: 'recording.m4a' } as any);

  const response = await fetch(DEEPGRAM_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      // Do NOT set Content-Type — let fetch set the multipart boundary.
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Deepgram error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    results?: {
      channels?: Array<{
        alternatives?: Array<{ transcript?: string }>;
      }>;
    };
  };

  return data?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? '';
}

export function VoicePTT({ onTranscript, deepgramApiKey, disabled }: VoicePTTProps) {
  const [pttState, setPTTState] = useState<PTTState>('idle');

  // Animated scale for the pulsing ring while recording (Animated API, no Reanimated dep needed)
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Hold a ref to the active Recording so we can stop it on press-out
  const recordingRef = useRef<Audio.Recording | null>(null);

  // ---------------------------------------------------------------------------
  // Pulse animation helpers
  // ---------------------------------------------------------------------------
  const startPulse = useCallback(() => {
    pulseAnim.setValue(1);
    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
      ]),
    );
    pulseLoopRef.current.start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseLoopRef.current?.stop();
    Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  }, [pulseAnim]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      pulseLoopRef.current?.stop();
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Recording lifecycle
  // ---------------------------------------------------------------------------
  const handlePressIn = useCallback(async () => {
    if (disabled || pttState !== 'idle') return;

    try {
      // Haptic feedback on start
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Request microphone permission
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[VoicePTT] Microphone permission denied');
        return;
      }

      // Prepare audio session for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Start recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setPTTState('recording');
      startPulse();
    } catch (err) {
      console.error('[VoicePTT] Failed to start recording:', err);
      setPTTState('idle');
    }
  }, [disabled, pttState, startPulse]);

  const handlePressOut = useCallback(async () => {
    if (pttState !== 'recording') return;

    stopPulse();
    setPTTState('transcribing');

    const recording = recordingRef.current;
    recordingRef.current = null;

    if (!recording) {
      setPTTState('idle');
      return;
    }

    try {
      await recording.stopAndUnloadAsync();
      // Restore audio mode to playback
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

      const uri = recording.getURI();
      if (!uri) {
        throw new Error('No recording URI returned');
      }

      let transcript = '';
      if (deepgramApiKey) {
        transcript = await transcribeWithDeepgram(uri, deepgramApiKey);
      } else {
        // No API key — fall back to placeholder so onTranscript is always called
        transcript = '[voice input]';
      }

      if (transcript) {
        onTranscript(transcript);
      }
    } catch (err) {
      console.error('[VoicePTT] Transcription failed:', err);
      // Attempt to restore audio mode even on failure
      try {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      } catch {
        // ignore
      }
    } finally {
      setPTTState('idle');
    }
  }, [pttState, deepgramApiKey, onTranscript, stopPulse]);

  // ---------------------------------------------------------------------------
  // Derived display values
  // ---------------------------------------------------------------------------
  const isDisabled = disabled || pttState === 'transcribing';

  const micColor =
    pttState === 'recording'
      ? colors.agentError // red while recording
      : pttState === 'transcribing'
        ? colors.teal // teal during processing
        : colors.agentActive; // blue/active in idle

  return (
    <View style={styles.container} accessibilityLabel="Voice push-to-talk">
      {/* Pulsing ring — only rendered while recording */}
      {pttState === 'recording' && (
        <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
      )}

      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        style={[
          styles.button,
          pttState === 'recording' && styles.buttonRecording,
          isDisabled && styles.buttonDisabled,
        ]}
        accessibilityLabel={
          pttState === 'recording'
            ? 'Release to transcribe'
            : pttState === 'transcribing'
              ? 'Transcribing…'
              : 'Hold to record voice input'
        }
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: pttState === 'transcribing' }}
      >
        {pttState === 'transcribing' ? (
          <ActivityIndicator size="small" color={colors.teal} />
        ) : (
          <Mic size={18} color={micColor} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.agentError,
    opacity: 0.35,
  },
  button: {
    padding: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  buttonRecording: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
