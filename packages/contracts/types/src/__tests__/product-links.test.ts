import { describe, expect, it } from 'vitest';
import {
  PRODUCT_LINK_TARGETS,
  isProductLinkId,
  parseProductLinkPath,
  productLinkPath,
  productLinkUrl,
} from '../product-links';
import { isProductPath } from '../product-routes';

describe('product links', () => {
  it('round-trips every target through its web path', () => {
    for (const target of PRODUCT_LINK_TARGETS) {
      const path = productLinkPath(target, 'b1c2d3e4-0000-4000-8000-000000000001');
      expect(parseProductLinkPath(path)).toEqual({
        target,
        id: 'b1c2d3e4-0000-4000-8000-000000000001',
      });
    }
  });

  it('keeps the fallback path inside the product so the proxy asks for a session', () => {
    for (const target of PRODUCT_LINK_TARGETS) {
      expect(isProductPath(productLinkPath(target, 'id-1'))).toBe(true);
    }
  });

  it('builds an absolute web fallback url', () => {
    expect(productLinkUrl('https://agiworkforce.com', 'work', 'run-1')).toBe(
      'https://agiworkforce.com/open/work/run-1',
    );
  });

  it('rejects unknown targets, extra segments and unsafe ids', () => {
    expect(parseProductLinkPath('/open/invoice/inv-1')).toBeNull();
    expect(parseProductLinkPath('/open/work/run-1/extra')).toBeNull();
    expect(parseProductLinkPath('/chat/work/run-1')).toBeNull();
    expect(parseProductLinkPath('/open/work/%2E%2E%2Fadmin')).toBeNull();
    expect(parseProductLinkPath('/open/work/%E0%A4%A')).toBeNull();
    expect(isProductLinkId('a'.repeat(129))).toBe(false);
    expect(isProductLinkId('')).toBe(false);
  });

  it('ignores the query string', () => {
    expect(parseProductLinkPath('/open/schedule/s-1?from=push')).toEqual({
      target: 'schedule',
      id: 's-1',
    });
  });
});
