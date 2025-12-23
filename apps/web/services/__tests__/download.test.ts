import { describe, it, expect, vi, beforeEach } from 'vitest';
import { triggerDownload, getPlatformExtension } from '../download';

describe('Download Service', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { href: '' });
  });

  describe('triggerDownload', () => {
    it('should set window.location.href to the correct API endpoint for mac', async () => {
      await triggerDownload('mac');
      expect(window.location.href).toBe('/api/download?platform=mac');
    });

    it('should set window.location.href to the correct API endpoint for windows', async () => {
      await triggerDownload('windows');
      expect(window.location.href).toBe('/api/download?platform=windows');
    });

    it('should set window.location.href to the correct API endpoint for linux', async () => {
      await triggerDownload('linux');
      expect(window.location.href).toBe('/api/download?platform=linux');
    });
  });

  describe('getPlatformExtension', () => {
    it('should return .dmg for mac', () => {
      expect(getPlatformExtension('mac')).toBe('.dmg');
    });

    it('should return .exe for windows', () => {
      expect(getPlatformExtension('windows')).toBe('.exe');
    });

    it('should return .AppImage for linux', () => {
      expect(getPlatformExtension('linux')).toBe('.AppImage');
    });

    it('should return empty string for unknown platform', () => {
      expect(getPlatformExtension('unknown')).toBe('');
    });
  });
});
