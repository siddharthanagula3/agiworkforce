import { render as renderComponent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pdfMocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  workerOptions: { workerSrc: '' },
}));

vi.mock('pdfjs-dist', () => ({
  getDocument: pdfMocks.getDocument,
  GlobalWorkerOptions: pdfMocks.workerOptions,
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/assets/pdf.worker.min.mjs',
}));

import { PDFViewer } from './PDFViewer';

describe('PDFViewer', () => {
  beforeEach(() => {
    pdfMocks.getDocument.mockReset();
    pdfMocks.workerOptions.workerSrc = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads URLs through the PDF.js 6 options API and releases the bundled worker', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const getPage = vi.fn(() => new Promise(() => {}));
    pdfMocks.getDocument.mockReturnValue({
      destroy,
      promise: Promise.resolve({ numPages: 2, getPage }),
    });
    const onLoad = vi.fn();

    const { unmount } = renderComponent(
      <PDFViewer src="https://files.example.test/plan.pdf" onLoad={onLoad} />,
    );

    await waitFor(() => expect(onLoad).toHaveBeenCalledWith(2));
    expect(pdfMocks.getDocument).toHaveBeenCalledWith({
      url: 'https://files.example.test/plan.pdf',
    });
    expect(pdfMocks.workerOptions.workerSrc).toBe('/assets/pdf.worker.min.mjs');

    unmount();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('renders a completed page once instead of restarting after loading state changes', async () => {
    const canvasContext = {} as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext);
    const render = vi.fn().mockReturnValue({
      promise: Promise.resolve(),
      cancel: vi.fn(),
    });
    const getPage = vi.fn().mockResolvedValue({
      getViewport: vi.fn().mockReturnValue({ width: 640, height: 480 }),
      render,
    });
    pdfMocks.getDocument.mockReturnValue({
      destroy: vi.fn().mockResolvedValue(undefined),
      promise: Promise.resolve({ numPages: 1, getPage }),
    });

    const { unmount } = renderComponent(
      <PDFViewer src="https://files.example.test/single-page.pdf" />,
    );

    await waitFor(() => expect(render).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getPage).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();

    unmount();
  });
});
