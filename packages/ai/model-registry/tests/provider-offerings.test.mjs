import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateProviderOffering } from '../scripts/compile.mjs';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const curation = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'catalog', 'models.curation.json'), 'utf8'),
);
const KEY = 'fixture-offering';
const PROVIDERS = { fixture: {} };

function offering(category, fields = {}) {
  return {
    provider: 'fixture',
    providerModelId: 'fixture-model',
    displayName: 'Fixture model',
    category,
    identityStatus: 'exact',
    ...fields,
  };
}

const chat = (fields = {}) => offering('chat', { quotaProbeProtocol: 'chat', ...fields });
const imageSync = (fields = {}) =>
  offering('image', {
    quotaProbeProtocol: 'image-sync',
    quotaImageSize: '1024*1024',
    ...fields,
  });
const imageAsync = (fields = {}) =>
  offering('image', {
    quotaProbeProtocol: 'image-async',
    quotaImageSize: '1024*1024',
    ...fields,
  });
const sizedVideo = (fields = {}) =>
  offering('video', {
    quotaProbeProtocol: 'video-async',
    quotaVideoSize: '1280*720',
    quotaVideoSeconds: 5,
    ...fields,
  });
const tieredVideo = (fields = {}) =>
  offering('video', {
    quotaProbeProtocol: 'video-async',
    quotaVideoResolution: '720P',
    quotaVideoRatio: '16:9',
    quotaVideoSeconds: 5,
    ...fields,
  });

function without(entry, ...fields) {
  return Object.fromEntries(Object.entries(entry).filter(([field]) => !fields.includes(field)));
}

function accepts(entry) {
  assert.doesNotThrow(() => validateProviderOffering(KEY, entry, PROVIDERS));
}

function refuses(entry, message) {
  assert.throws(() => validateProviderOffering(KEY, entry, PROVIDERS), {
    message: `${KEY}: ${message}`,
  });
}

test('accepts a complete offering of every quota protocol and an unconnected one', () => {
  accepts(offering('audio'));
  accepts(offering('chat', { identityStatus: 'unresolved', providerModelId: null }));
  accepts(chat({ quotaThinkingRequired: true }));
  accepts(chat({ quotaChatImageInput: true }));
  accepts(imageSync());
  accepts(imageSync({ quotaImageSize: '1328*1328', quotaPromptExtendUnsupported: true }));
  accepts(imageAsync({ quotaPromptMaxChars: 500 }));
  accepts(sizedVideo({ quotaVideoDurationFixed: true }));
  accepts(sizedVideo({ quotaVideoShotType: 'single' }));
  accepts(tieredVideo({ quotaPromptExtendUnsupported: true, quotaVideoWatermark: false }));
  for (const resolution of ['480P', '720P', '1080P']) {
    accepts(tieredVideo({ quotaVideoResolution: resolution }));
  }
  for (const ratio of ['16:9', '9:16', '1:1', '4:3', '21:9', '10:1']) {
    accepts(tieredVideo({ quotaVideoRatio: ratio }));
  }
  for (const size of ['832*480', '1280*720', '1080*1920', '100*100']) {
    accepts(sizedVideo({ quotaVideoSize: size }));
  }
  for (const size of ['512*512', '1024*1024', '1328*1328', '1440*1440']) {
    accepts(imageSync({ quotaImageSize: size }));
    accepts(imageAsync({ quotaImageSize: size }));
  }
});

test('accepts every authored provider offering', () => {
  const entries = Object.entries(curation.providerOfferings);
  assert.ok(entries.length > 0);
  for (const [key, entry] of entries) {
    assert.doesNotThrow(() => validateProviderOffering(key, entry, curation.providers), key);
  }
});

test('refuses an offering field the catalogue does not model', () => {
  refuses(sizedVideo({ quotaVideoSecond: 5 }), 'unknown offering field quotaVideoSecond');
  refuses(offering('chat', { notes: 'free text' }), 'unknown offering field notes');
});

test('refuses a quota protocol on an offering whose identity is not exact', () => {
  refuses(
    chat({ identityStatus: 'unresolved', providerModelId: null }),
    'invalid quota probe protocol',
  );
});

test('refuses a quota protocol outside the vocabulary', () => {
  refuses(offering('image', { quotaProbeProtocol: 'image-edit' }), 'invalid quota probe protocol');
  refuses(offering('chat', { quotaProbeProtocol: 'toString' }), 'invalid quota probe protocol');
});

test('refuses a quota protocol that is not a string', () => {
  for (const protocol of [['video-async'], ['image-async'], ['image-sync'], ['chat']]) {
    const category = { 'video-async': 'video', chat: 'chat' }[protocol[0]] ?? 'image';
    refuses(offering(category, { quotaProbeProtocol: protocol }), 'invalid quota probe protocol');
  }
  refuses(sizedVideo({ quotaProbeProtocol: ['video-async'] }), 'invalid quota probe protocol');
  refuses(tieredVideo({ quotaProbeProtocol: ['video-async'] }), 'invalid quota probe protocol');
  refuses(imageAsync({ quotaProbeProtocol: ['image-async'] }), 'invalid quota probe protocol');
  refuses(imageSync({ quotaProbeProtocol: ['image-sync'] }), 'invalid quota probe protocol');
  for (const protocol of [null, 0, 1, true, {}, []]) {
    refuses(offering('chat', { quotaProbeProtocol: protocol }), 'invalid quota probe protocol');
  }
});

test('refuses a quota protocol that does not serve the offering category', () => {
  refuses(
    offering('image', { quotaProbeProtocol: 'chat' }),
    'the chat protocol serves chat offerings, not image',
  );
  refuses(
    offering('video', { quotaProbeProtocol: 'image-sync' }),
    'the image-sync protocol serves image offerings, not video',
  );
  refuses(
    offering('video', { quotaProbeProtocol: 'image-async', quotaImageSize: '1024*1024' }),
    'the image-async protocol serves image offerings, not video',
  );
  refuses(
    offering('image', {
      quotaProbeProtocol: 'video-async',
      quotaVideoSize: '1280*720',
      quotaVideoSeconds: 5,
    }),
    'the video-async protocol serves video offerings, not image',
  );
});

test('refuses a field that does not belong to the offering protocol', () => {
  refuses(
    imageSync({ quotaVideoSeconds: 5 }),
    'quotaVideoSeconds does not belong to the image-sync protocol',
  );
  refuses(
    imageAsync({ quotaVideoWatermark: false }),
    'quotaVideoWatermark does not belong to the image-async protocol',
  );
  refuses(
    sizedVideo({ quotaImageSize: '1024*1024' }),
    'quotaImageSize does not belong to the video-async protocol',
  );
  refuses(
    sizedVideo({ quotaThinkingRequired: true }),
    'quotaThinkingRequired does not belong to the video-async protocol',
  );
  refuses(
    imageSync({ quotaChatImageInput: true }),
    'quotaChatImageInput does not belong to the image-sync protocol',
  );
  refuses(
    chat({ quotaPromptMaxChars: 500 }),
    'quotaPromptMaxChars does not belong to the chat protocol',
  );
  refuses(
    chat({ quotaPromptExtendUnsupported: true }),
    'quotaPromptExtendUnsupported does not belong to the chat protocol',
  );
  for (const field of [
    'quotaVideoSize',
    'quotaVideoResolution',
    'quotaVideoRatio',
    'quotaVideoDurationFixed',
    'quotaVideoShotType',
  ]) {
    refuses(
      imageSync({ [field]: sizedVideo()[field] ?? tieredVideo()[field] ?? true }),
      `${field} does not belong to the image-sync protocol`,
    );
  }
});

test('refuses a quota field on an offering without a quota protocol', () => {
  refuses(
    offering('video', { quotaVideoSeconds: 5 }),
    'quotaVideoSeconds does not belong to an offering without a quota protocol',
  );
  refuses(
    offering('image', { quotaImageSize: '1024*1024' }),
    'quotaImageSize does not belong to an offering without a quota protocol',
  );
});

test('refuses a clip length that is not a positive integer', () => {
  for (const seconds of [0, -5, 2.5, '5', null, Number.NaN]) {
    refuses(sizedVideo({ quotaVideoSeconds: seconds }), 'invalid quotaVideoSeconds');
  }
});

test('refuses a size and a resolution on the same offering', () => {
  refuses(
    tieredVideo({ quotaVideoSize: '1280*720' }),
    'a video offering takes quotaVideoSize or quotaVideoResolution, not both',
  );
});

test('refuses a resolution outside 480P, 720P and 1080P', () => {
  for (const resolution of ['360P', '720p', '4K', 720, '1280*720']) {
    refuses(tieredVideo({ quotaVideoResolution: resolution }), 'invalid quotaVideoResolution');
  }
});

test('refuses a ratio that is malformed or that accompanies a size', () => {
  for (const ratio of ['16x9', '16:9:1', 'wide', 1.78, ['16:9'], ' 16:9', '16:9\n']) {
    refuses(tieredVideo({ quotaVideoRatio: ratio }), 'invalid quotaVideoRatio');
  }
  refuses(sizedVideo({ quotaVideoRatio: '16:9' }), 'quotaVideoRatio requires quotaVideoResolution');
});

test('refuses a video offering that cannot be turned into a request', () => {
  refuses(
    without(sizedVideo(), 'quotaVideoSeconds'),
    'a video-async offering requires quotaVideoSeconds',
  );
  refuses(
    without(sizedVideo(), 'quotaVideoSize'),
    'a video-async offering requires quotaVideoSize or quotaVideoResolution',
  );
  refuses(
    without(tieredVideo(), 'quotaVideoRatio'),
    'quotaVideoResolution requires quotaVideoRatio',
  );
});

test('refuses a ratio with a zero or zero-padded term', () => {
  for (const ratio of ['0:0', '16:0', '0:9', '016:9', '16:09', '00:1']) {
    refuses(tieredVideo({ quotaVideoRatio: ratio }), 'invalid quotaVideoRatio');
  }
});

test('refuses a video size with a zero or zero-padded dimension', () => {
  for (const size of ['0*0', '1280*0', '0*720', '01280*0720', '01280*720', '1280*0720']) {
    refuses(sizedVideo({ quotaVideoSize: size }), 'invalid quotaVideoSize');
  }
});

test('refuses an image size with a zero or zero-padded dimension', () => {
  for (const size of ['0*0', '1024*0', '0*1024', '01024*01024', '01024*1024', '1024*01024']) {
    refuses(imageSync({ quotaImageSize: size }), 'invalid quotaImageSize');
    refuses(imageAsync({ quotaImageSize: size }), 'invalid quotaImageSize');
  }
});

test('refuses a malformed video size, shot type, watermark or fixed-duration flag', () => {
  for (const size of ['1280x720', '720P', ['1280*720'], 1280]) {
    refuses(sizedVideo({ quotaVideoSize: size }), 'invalid quotaVideoSize');
  }
  refuses(sizedVideo({ quotaVideoShotType: 'panorama' }), 'invalid quotaVideoShotType');
  refuses(sizedVideo({ quotaVideoWatermark: 'false' }), 'invalid quotaVideoWatermark');
  refuses(sizedVideo({ quotaVideoDurationFixed: false }), 'invalid quotaVideoDurationFixed');
});

test('refuses an asynchronous image offering without a size', () => {
  refuses(
    without(imageAsync(), 'quotaImageSize'),
    'an image-async offering requires quotaImageSize',
  );
});

test('refuses a synchronous image offering without a size', () => {
  refuses(without(imageSync(), 'quotaImageSize'), 'an image-sync offering requires quotaImageSize');
  refuses(
    without(imageSync({ quotaPromptExtendUnsupported: true }), 'quotaImageSize'),
    'an image-sync offering requires quotaImageSize',
  );
});

test('states a size on every authored offering of an image protocol', () => {
  const images = Object.entries(curation.providerOfferings).filter(([, entry]) =>
    ['image-sync', 'image-async'].includes(entry.quotaProbeProtocol),
  );
  assert.ok(images.length > 0);
  for (const [key, entry] of images) {
    assert.match(entry.quotaImageSize ?? '', /^[1-9]\d*\*[1-9]\d*$/, key);
  }
});

test('refuses a malformed image size', () => {
  for (const size of ['1024x1024', '1K', ['1024*1024'], 1024]) {
    refuses(imageSync({ quotaImageSize: size }), 'invalid quotaImageSize');
    refuses(imageAsync({ quotaImageSize: size }), 'invalid quotaImageSize');
  }
});

test('refuses a prompt maximum that is not a positive integer', () => {
  for (const maximum of [0, -1, 499.5, '500', true]) {
    refuses(imageAsync({ quotaPromptMaxChars: maximum }), 'invalid quotaPromptMaxChars');
  }
});

test('refuses a prompt-extension marker that is not true', () => {
  refuses(
    imageSync({ quotaPromptExtendUnsupported: false }),
    'invalid quotaPromptExtendUnsupported',
  );
  refuses(
    tieredVideo({ quotaPromptExtendUnsupported: 'yes' }),
    'invalid quotaPromptExtendUnsupported',
  );
});

test('refuses malformed chat quota fields', () => {
  refuses(chat({ quotaChatImageInput: false }), 'invalid quotaChatImageInput');
  refuses(chat({ quotaThinkingRequired: 'yes' }), 'invalid quotaThinkingRequired');
});

test('refuses an offering without a known provider, category, label or identity', () => {
  refuses(offering('chat', { provider: 'unlisted' }), 'unknown offering provider');
  refuses(offering('chat', { provider: 'constructor' }), 'unknown offering provider');
  refuses(offering('chat', { provider: ['fixture'] }), 'unknown offering provider');
  refuses(offering('speech'), 'unknown offering category');
  refuses(offering('chat', { displayName: '' }), 'missing offering label');
  refuses(offering('chat', { identityStatus: 'guessed' }), 'unknown identity status');
  refuses(offering('chat', { identityStatus: 'unresolved' }), 'invalid offering identity');
  refuses(offering('chat', { providerModelId: 'fixture/../model' }), 'invalid offering identity');
  refuses(offering('chat', { providerModelId: null }), 'invalid offering identity');
});

test('refuses a retirement that is not an ISO instant in UTC', () => {
  accepts(offering('chat', { retiresAt: '2026-10-09T16:00:00.000Z' }));
  for (const retiresAt of ['2026-10-10', '2026-10-10T00:00:00+08:00', '2026-13-01T00:00:00.000Z']) {
    refuses(offering('chat', { retiresAt }), 'retiresAt must be an ISO instant in UTC');
  }
});

const CONNECTED_MEDIA_REQUESTS = {
  'qwen-quota-009': {
    quotaProbeProtocol: 'video-async',
    quotaVideoSize: '1280*720',
    quotaVideoSeconds: 5,
    quotaVideoShotType: 'single',
  },
  'qwen-quota-011': {
    quotaProbeProtocol: 'video-async',
    quotaVideoSize: '832*480',
    quotaVideoSeconds: 5,
    quotaVideoDurationFixed: true,
  },
  'qwen-quota-012': {
    quotaProbeProtocol: 'video-async',
    quotaVideoSize: '1280*720',
    quotaVideoSeconds: 5,
    quotaVideoDurationFixed: true,
  },
  'qwen-quota-013': {
    quotaProbeProtocol: 'video-async',
    quotaVideoSize: '1280*720',
    quotaVideoSeconds: 5,
    quotaVideoDurationFixed: true,
  },
  'qwen-quota-234': {
    quotaProbeProtocol: 'video-async',
    quotaVideoResolution: '720P',
    quotaVideoRatio: '16:9',
    quotaVideoSeconds: 5,
  },
  'qwen-quota-235': {
    quotaProbeProtocol: 'video-async',
    quotaVideoResolution: '720P',
    quotaVideoRatio: '16:9',
    quotaVideoSeconds: 5,
  },
  'qwen-quota-272': {
    quotaProbeProtocol: 'video-async',
    quotaVideoResolution: '720P',
    quotaVideoRatio: '16:9',
    quotaVideoSeconds: 5,
  },
  'qwen-quota-232': {
    quotaProbeProtocol: 'video-async',
    quotaVideoResolution: '720P',
    quotaVideoRatio: '16:9',
    quotaVideoSeconds: 3,
    quotaPromptExtendUnsupported: true,
    quotaVideoWatermark: false,
  },
  'qwen-quota-236': {
    quotaProbeProtocol: 'video-async',
    quotaVideoResolution: '720P',
    quotaVideoRatio: '16:9',
    quotaVideoSeconds: 3,
    quotaPromptExtendUnsupported: true,
    quotaVideoWatermark: false,
  },
  'qwen-quota-027': {
    quotaProbeProtocol: 'image-sync',
    quotaImageSize: '1024*1024',
    quotaPromptExtendUnsupported: true,
  },
  'qwen-quota-028': {
    quotaProbeProtocol: 'image-sync',
    quotaImageSize: '1024*1024',
    quotaPromptExtendUnsupported: true,
  },
  'qwen-quota-146': { quotaProbeProtocol: 'image-sync', quotaImageSize: '1280*1280' },
  'qwen-quota-148': {
    quotaProbeProtocol: 'image-async',
    quotaImageSize: '1024*1024',
    quotaPromptMaxChars: 500,
  },
  'qwen-quota-149': {
    quotaProbeProtocol: 'image-async',
    quotaImageSize: '1024*1024',
    quotaPromptMaxChars: 500,
  },
  'qwen-quota-150': {
    quotaProbeProtocol: 'image-async',
    quotaImageSize: '1024*1024',
    quotaPromptMaxChars: 500,
  },
  'qwen-quota-151': {
    quotaProbeProtocol: 'image-async',
    quotaImageSize: '1024*1024',
    quotaPromptMaxChars: 500,
  },
};
const HELD_BACK_OFFERINGS = [
  'qwen-quota-010',
  'qwen-quota-029',
  'qwen-quota-147',
  'qwen-quota-255',
  'qwen-quota-260',
];

function quotaFields(entry) {
  return Object.fromEntries(Object.entries(entry).filter(([field]) => field.startsWith('quota')));
}

test('holds the request settings of every offering connected from the 2026-10-04 references', () => {
  for (const [key, expected] of Object.entries(CONNECTED_MEDIA_REQUESTS)) {
    assert.deepEqual(quotaFields(curation.providerOfferings[key]), expected, key);
  }
});

test('holds in the catalogue the size z-image-turbo used to take from the web policy', () => {
  assert.deepEqual(quotaFields(curation.providerOfferings['qwen-quota-101']), {
    quotaProbeProtocol: 'image-sync',
    quotaImageSize: '1024*1024',
  });
});

test('connects no video or asynchronous image offering beyond the documented set', () => {
  const connected = Object.entries(curation.providerOfferings)
    .filter(([, entry]) => ['video-async', 'image-async'].includes(entry.quotaProbeProtocol))
    .map(([key]) => key);
  const documented = Object.entries(CONNECTED_MEDIA_REQUESTS)
    .filter(([, entry]) => entry.quotaProbeProtocol !== 'image-sync')
    .map(([key]) => key);
  assert.deepEqual(connected.sort(), documented.sort());
});

test('leaves preview and conflictingly documented offerings without a quota protocol', () => {
  for (const key of HELD_BACK_OFFERINGS) {
    const entry = curation.providerOfferings[key];
    assert.ok(entry, key);
    assert.deepEqual(quotaFields(entry), {}, key);
  }
});

test('records that the 2026-10-04 offerings were connected from documentation without a live call', () => {
  const entries = curation.verificationLog.filter(
    (entry) =>
      entry.date === '2026-10-04' &&
      entry.notes.includes('gained a quota protocol from documentation'),
  );
  assert.equal(entries.length, 1);
  const [{ notes }] = entries;
  assert.match(notes, /z-image-turbo \(qwen-quota-101\).*now holds its 1024\*1024 size/);
  assert.match(notes, /two independent readers/);
  assert.match(notes, /no live provider call was made/);
  assert.match(notes, /the owner decided/);
  assert.match(notes, /alibabacloud\.com\/help\/en\/model-studio\/[a-z0-9-]+-api-reference/);
});
