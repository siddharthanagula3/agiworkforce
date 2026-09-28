#!/usr/bin/env node
/**
 * Record the short sample each voice plays from Play sample in voice settings.
 *
 * A voice the speech endpoint offers is rendered through it. A voice only the
 * Live API offers is recorded from one scripted Live session that is told to
 * say the sample line and nothing else. The models come from the compiled
 * registry's voice_speech and voice_live slots and the voices from the lists
 * the product uses, so nothing here names a model or a voice.
 *
 * The files and their manifest land in apps/web/public/voice-samples and are
 * served as static assets, so playing a sample costs nothing per play.
 *
 * Run once from the repository root with the server key, listen to the files,
 * then commit apps/web/public/voice-samples:
 *
 *   OPENAI_API_KEY=<server key> node scripts/generate-voice-samples.mjs
 *
 * Name voices after the command to record only those again.
 */

import { Buffer } from 'node:buffer';
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { LIVE_VOICES } from '../apps/web/features/chat/lib/live-voices.ts';
import {
  VOICE_SAMPLE_DIRECTORY,
  VOICE_SAMPLE_MANIFEST_FILE,
} from '../apps/web/features/chat/lib/voice-samples.ts';
import { SPEECH_VOICES } from '../apps/web/lib/voice/speech-voices.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REGISTRY_JSON = path.join(REPO_ROOT, 'packages/ai/model-registry/generated/registry.json');
const OUTPUT_DIR = path.join(REPO_ROOT, 'apps/web/public', VOICE_SAMPLE_DIRECTORY);
const MANIFEST_PATH = path.join(OUTPUT_DIR, VOICE_SAMPLE_MANIFEST_FILE);
const DEFAULT_OPENAI_ROOT = 'https://api.openai.com/v1';
const USAGE =
  'Usage: OPENAI_API_KEY=<server key> node scripts/generate-voice-samples.mjs [voice ...]';

const SAMPLE_LINES = {
  English: (name) => `Hi, I'm ${name}. This is how I'll sound when we talk in voice mode.`,
  Portuguese: (name) =>
    `Oi, meu nome é ${name}. É assim que vou soar quando a gente conversar no modo de voz.`,
};

const LIVE_SAMPLE_RATE = 24_000;
const INPUT_FRAME_MS = 100;
const SPEECH_SETTLE_MS = 2_000;
const SPEECH_START_TIMEOUT_MS = 30_000;
const CLOSE_TIMEOUT_MS = 15_000;
const SILENCE_THRESHOLD = 328;
const EDGE_PADDING_MS = 150;

function slotModel(registry, slot) {
  const key = registry.policies?.auto?.slots?.[slot]?.modelKey;
  const identity = key ? registry.models?.[key]?.identity : undefined;
  if (!identity?.providerModelId || identity.provider !== 'openai') {
    throw new Error(`The registry's ${slot} slot does not resolve to an OpenAI model.`);
  }
  return identity.providerModelId;
}

function sampleLine(voice) {
  const language = voice.lang.split(',')[0].trim();
  const line = SAMPLE_LINES[language];
  if (!line) {
    throw new Error(`No sample line is written in ${language}. Add one to SAMPLE_LINES.`);
  }
  return { language, text: line(voice.name) };
}

async function recordWithSpeech({ root, apiKey, model, voice, text }) {
  const response = await fetch(`${root}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, voice, input: text, response_format: 'mp3' }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(`The speech endpoint answered ${response.status}: ${detail}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function liveSessionUrl(root) {
  const url = new URL(`${root}/live/sessions`);
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  return url.toString();
}

function recordWithLive({ root, apiKey, model, voice, language, text }) {
  const silentFrame = Buffer.alloc((LIVE_SAMPLE_RATE * 2 * INPUT_FRAME_MS) / 1000).toString(
    'base64',
  );
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(liveSessionUrl(root), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const chunks = [];
    let transcript = '';
    let microphone = null;
    let settleTimer = null;
    let closing = false;
    let done = false;
    let deadline = setTimeout(
      () => finish(new Error('The session did not start.')),
      SPEECH_START_TIMEOUT_MS,
    );

    const send = (event) => socket.send(JSON.stringify(event));

    const finish = (error) => {
      if (done) return;
      done = true;
      clearInterval(microphone);
      clearTimeout(settleTimer);
      clearTimeout(deadline);
      if (socket.readyState === WebSocket.OPEN) socket.close();
      if (error) reject(error);
      else resolve({ pcm: Buffer.concat(chunks), transcript: transcript.trim() });
    };

    const close = () => {
      if (closing) return;
      closing = true;
      clearInterval(microphone);
      clearTimeout(settleTimer);
      clearTimeout(deadline);
      send({ type: 'session.close', event_id: 'sample_close' });
      deadline = setTimeout(() => {
        console.warn(
          `${voice}: the session did not confirm its close; keeping the audio received.`,
        );
        finish();
      }, CLOSE_TIMEOUT_MS);
    };

    socket.addEventListener('open', () => {
      send({
        type: 'session.start',
        event_id: 'sample_start',
        session: {
          model,
          instructions:
            'You are recording a short sample of your voice. When you are given a line, say it word for word, once, in a warm and natural tone. Say nothing before or after it.',
          audio: {
            format: { type: 'audio/pcm', rate: LIVE_SAMPLE_RATE },
            output: { voice },
          },
        },
      });
    });

    socket.addEventListener('message', (message) => {
      let event;
      try {
        event = JSON.parse(String(message.data));
      } catch {
        finish(new Error(`The session sent a message that is not JSON: ${String(message.data)}`));
        return;
      }
      switch (event.type) {
        case 'session.started':
          clearTimeout(deadline);
          microphone = setInterval(
            () => send({ type: 'session.input_audio.append', audio: silentFrame }),
            INPUT_FRAME_MS,
          );
          send({
            type: 'session.instructions.append',
            event_id: 'sample_line',
            delegation_id: null,
            content: `Speak now, in ${language}. Say exactly this and nothing else: "${text}" Then stop and listen.`,
          });
          deadline = setTimeout(() => {
            if (chunks.length > 0) close();
            else finish(new Error('The session produced no audio.'));
          }, SPEECH_START_TIMEOUT_MS);
          break;
        case 'session.output_audio.delta':
          if (closing || typeof event.delta !== 'string') break;
          chunks.push(Buffer.from(event.delta, 'base64'));
          clearTimeout(settleTimer);
          settleTimer = setTimeout(close, SPEECH_SETTLE_MS);
          break;
        case 'session.output_transcript.delta':
          if (typeof event.delta === 'string') transcript += event.delta;
          break;
        case 'session.closed':
          finish();
          break;
        case 'error':
          finish(new Error(`The session reported an error: ${JSON.stringify(event)}`));
          break;
        default:
          break;
      }
    });

    socket.addEventListener('error', (event) => {
      finish(new Error(`The Live API connection failed: ${event.message ?? 'no detail'}`));
    });

    socket.addEventListener('close', (event) => {
      if (closing && chunks.length > 0) finish();
      else finish(new Error(`The Live API closed the connection (${event.code} ${event.reason})`));
    });
  });
}

function trimSilence(pcm) {
  const even = pcm.subarray(0, pcm.length - (pcm.length % 2));
  const samples = even.length / 2;
  let first = -1;
  let last = -1;
  for (let index = 0; index < samples; index += 1) {
    if (Math.abs(even.readInt16LE(index * 2)) > SILENCE_THRESHOLD) {
      if (first < 0) first = index;
      last = index;
    }
  }
  if (first < 0) return null;
  const padding = Math.round((LIVE_SAMPLE_RATE * EDGE_PADDING_MS) / 1000);
  const start = Math.max(0, first - padding);
  const end = Math.min(samples, last + padding + 1);
  return even.subarray(start * 2, end * 2);
}

function wavFile(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(LIVE_SAMPLE_RATE, 24);
  header.writeUInt32LE(LIVE_SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function comparable(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function readManifest() {
  try {
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    return parsed?.samples && typeof parsed.samples === 'object' ? { ...parsed.samples } : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function replaceSample(voice, file, bytes) {
  for (const existing of fs.readdirSync(OUTPUT_DIR)) {
    if (existing !== file && path.parse(existing).name === voice) {
      fs.rmSync(path.join(OUTPUT_DIR, existing));
    }
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, file), bytes);
}

async function main() {
  const requested = process.argv.slice(2);
  if (requested.includes('--help') || requested.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(`OPENAI_API_KEY is not set.\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  const known = new Set(LIVE_VOICES.map((voice) => voice.voiceURI));
  const unknown = requested.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    console.error(`Not a voice in voice settings: ${unknown.join(', ')}.\n${USAGE}`);
    process.exitCode = 1;
    return;
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_JSON, 'utf8'));
  const speechModel = slotModel(registry, 'voice_speech');
  const liveModel = slotModel(registry, 'voice_live');
  const root = (process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_ROOT).replace(/\/+$/, '');
  const voices =
    requested.length > 0
      ? LIVE_VOICES.filter((voice) => requested.includes(voice.voiceURI))
      : LIVE_VOICES;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const samples = readManifest();
  const failed = [];
  const toCheck = [];

  for (const voice of voices) {
    const name = voice.voiceURI;
    try {
      const { language, text } = sampleLine(voice);
      if (SPEECH_VOICES.includes(name)) {
        const bytes = await recordWithSpeech({
          root,
          apiKey,
          model: speechModel,
          voice: name,
          text,
        });
        replaceSample(name, `${name}.mp3`, bytes);
        samples[name] = `${name}.mp3`;
        console.log(`${name}: ${name}.mp3 from the speech endpoint (${speechModel})`);
        continue;
      }
      const { pcm, transcript } = await recordWithLive({
        root,
        apiKey,
        model: liveModel,
        voice: name,
        language,
        text,
      });
      const speech = trimSilence(pcm);
      if (!speech) throw new Error('The session returned only silence.');
      replaceSample(name, `${name}.wav`, wavFile(speech));
      samples[name] = `${name}.wav`;
      const seconds = (speech.length / 2 / LIVE_SAMPLE_RATE).toFixed(1);
      console.log(`${name}: ${name}.wav from a Live session (${liveModel}), ${seconds}s`);
      if (comparable(transcript) !== comparable(text)) {
        toCheck.push(name);
        console.warn(`${name}: said "${transcript || '(no transcript)'}" for "${text}"`);
      }
    } catch (error) {
      failed.push(name);
      console.error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const manifest = Object.fromEntries(
    LIVE_VOICES.filter(
      (voice) =>
        typeof samples[voice.voiceURI] === 'string' &&
        fs.existsSync(path.join(OUTPUT_DIR, samples[voice.voiceURI])),
    ).map((voice) => [voice.voiceURI, samples[voice.voiceURI]]),
  );
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify({ samples: manifest }, null, 2)}\n`);
  console.log(
    `Wrote ${path.relative(REPO_ROOT, MANIFEST_PATH)} with ${Object.keys(manifest).length} of ${LIVE_VOICES.length} voices.`,
  );

  const redo = [...new Set([...failed, ...toCheck])];
  if (toCheck.length > 0) {
    console.warn(`Listen to ${toCheck.join(', ')}: the transcript differs from the sample line.`);
  }
  if (redo.length > 0) {
    console.warn(
      `To record them again: OPENAI_API_KEY=<server key> node scripts/generate-voice-samples.mjs ${redo.join(' ')}`,
    );
  }
  if (failed.length > 0) process.exitCode = 1;
}

await main();
