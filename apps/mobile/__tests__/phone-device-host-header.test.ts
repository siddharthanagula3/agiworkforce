import { headerSafeJson } from '@/src/features/integrations/services/phoneDeviceHost';

describe('the phone device-host header', () => {
  it('stays printable ASCII for a phone name with a curly apostrophe and reads back unchanged', () => {
    const declared = { deviceName: 'Mei’s iPhone 的', capabilities: ['calendar.read'] };

    const encoded = headerSafeJson(declared);

    expect(/^[\x20-\x7e]*$/.test(encoded)).toBe(true);
    expect(JSON.parse(encoded)).toEqual(declared);
  });
});
