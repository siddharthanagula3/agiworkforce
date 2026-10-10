// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { prepareVoiceAttachment } from './voice-attachments';

const LIMIT = 256 * 1024;

function pdf(bytes: number, name = 'brief.pdf'): File {
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
}

describe('prepareVoiceAttachment', () => {
  it('sends a PDF to the backend as a Responses input_file with its data inline', async () => {
    const result = await prepareVoiceAttachment(pdf(1_000), LIMIT);

    expect(result).toMatchObject({ ok: true, kind: 'file', name: 'brief.pdf' });
    if (!result.ok) throw new Error('expected a prepared file');
    expect(result.content).toMatchObject({ type: 'input_file', filename: 'brief.pdf' });
    expect((result.content as { file_data: string }).file_data).toMatch(
      /^data:application\/pdf;base64,/,
    );
  });

  it('refuses a PDF larger than the data channel can carry in one message', async () => {
    expect(await prepareVoiceAttachment(pdf(LIMIT), LIMIT)).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });

  it('sends a photo as a downscaled input_image, trying smaller sizes until it fits', async () => {
    const downscale = vi
      .fn()
      .mockResolvedValueOnce(`data:image/jpeg;base64,${'a'.repeat(LIMIT)}`)
      .mockResolvedValueOnce('data:image/jpeg;base64,small');
    const photo = new File([new Uint8Array(10)], 'menu.png', { type: 'image/png' });

    const result = await prepareVoiceAttachment(photo, LIMIT, downscale);

    expect(downscale).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      ok: true,
      kind: 'image',
      name: 'menu.png',
      content: { type: 'input_image', image_url: 'data:image/jpeg;base64,small', detail: 'auto' },
    });
  });

  it('refuses anything that is neither a photo nor a PDF', async () => {
    const sheet = new File(['a,b'], 'data.csv', { type: 'text/csv' });

    expect(await prepareVoiceAttachment(sheet, LIMIT)).toEqual({
      ok: false,
      reason: 'unsupported',
    });
  });
});
