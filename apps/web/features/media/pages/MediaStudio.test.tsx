/**
 * MediaStudio Component Tests
 *
 * Tests for the Media Studio page that handles image/video generation.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Must mock before import. Use a factory function approach.
// Mock ALL lucide-react exports as simple span components.
vi.mock('lucide-react', () => {
  // Create a generic icon component factory
  const makeIcon = (name: string) => {
    const Icon = (props: Record<string, unknown>) => {
      const { children, ...rest } = props;
      return (
        <span data-icon={name} {...rest}>
          {children as React.ReactNode}
        </span>
      );
    };
    Icon.displayName = name;
    return Icon;
  };

  return {
    __esModule: true,
    Image: makeIcon('Image'),
    Video: makeIcon('Video'),
    Download: makeIcon('Download'),
    Sparkles: makeIcon('Sparkles'),
    Wand2: makeIcon('Wand2'),
    Loader2: makeIcon('Loader2'),
    Clock: makeIcon('Clock'),
    ImagePlus: makeIcon('ImagePlus'),
    AlertCircle: makeIcon('AlertCircle'),
    CheckCircle2: makeIcon('CheckCircle2'),
    Play: makeIcon('Play'),
    X: makeIcon('X'),
    Trash2: makeIcon('Trash2'),
    RefreshCw: makeIcon('RefreshCw'),
    ZoomIn: makeIcon('ZoomIn'),
    Maximize2: makeIcon('Maximize2'),
    ExternalLink: makeIcon('ExternalLink'),
    ChevronDown: makeIcon('ChevronDown'),
    ChevronUp: makeIcon('ChevronUp'),
    Copy: makeIcon('Copy'),
    Share2: makeIcon('Share2'),
    MoreHorizontal: makeIcon('MoreHorizontal'),
    Settings: makeIcon('Settings'),
  };
});

vi.mock('@shared/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined | null)[]) => args.filter(Boolean).join(' '),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../services/media-api-service', () => ({
  generateImages: vi.fn().mockResolvedValue([]),
  generateVideo: vi.fn().mockResolvedValue({ operationId: 'test' }),
  getVideoStatus: vi.fn().mockResolvedValue({ status: 'idle' }),
  getImageDisplayUrl: vi.fn().mockReturnValue(''),
}));

import { MediaStudio } from './MediaStudio';

/**
 * Helper: find and click the tab button whose text matches exactly.
 */
function clickTab(tabText: string) {
  const allButtons = screen.getAllByRole('button');
  const tabBtn = allButtons.find((btn) => btn.textContent?.trim() === tabText);
  if (!tabBtn) throw new Error(`Tab button with text "${tabText}" not found`);
  fireEvent.click(tabBtn);
}

describe('MediaStudio', () => {
  it('renders without crashing', () => {
    render(<MediaStudio />);
    expect(screen.getByText('Media Studio')).toBeDefined();
  });

  it('shows the page description', () => {
    render(<MediaStudio />);
    expect(screen.getByText('Generate images and videos with AI')).toBeDefined();
  });

  it('defaults to Image tab', () => {
    render(<MediaStudio />);
    expect(screen.getByText('Style')).toBeDefined();
    expect(screen.getByPlaceholderText('Describe the image you want to create...')).toBeDefined();
  });

  it('switches to Video tab when clicked', () => {
    render(<MediaStudio />);

    clickTab('Video');

    expect(screen.getByText('Duration')).toBeDefined();
    expect(screen.getByPlaceholderText('Describe the video you want to create...')).toBeDefined();
  });

  it('shows image-specific options on Image tab', () => {
    render(<MediaStudio />);

    // Style options
    expect(screen.getByText('Photorealistic')).toBeDefined();
    expect(screen.getByText('Digital Art')).toBeDefined();
    expect(screen.getByText('Illustration')).toBeDefined();

    // Size option
    expect(screen.getByText('1:1 Square')).toBeDefined();

    // Model options
    expect(screen.getByText('DALL-E 3')).toBeDefined();
    expect(screen.getByText('Google Imagen')).toBeDefined();
    expect(screen.getByText('Stability AI')).toBeDefined();

    // Number of images
    expect(screen.getByText('Number of Images')).toBeDefined();
  });

  it('shows video-specific options on Video tab', () => {
    render(<MediaStudio />);

    clickTab('Video');

    expect(screen.getByText('4s')).toBeDefined();
    expect(screen.getByText('8s')).toBeDefined();
  });

  it('generate button is disabled when prompt is empty', () => {
    render(<MediaStudio />);

    // The Generate Image button should be disabled when prompt is empty
    const generateButtons = screen
      .getAllByRole('button')
      .filter((btn) => btn.textContent?.includes('Generate Image'));
    if (generateButtons.length > 0) {
      expect(generateButtons[0]).toBeDisabled();
    } else {
      // Fall back to any Generate button
      const anyGen = screen
        .getAllByRole('button')
        .filter((btn) => btn.textContent?.includes('Generate'));
      const lastGen = anyGen[anyGen.length - 1];
      expect(lastGen).toBeDisabled();
    }
  });

  it('generate button is enabled when prompt has text', () => {
    render(<MediaStudio />);

    const textarea = screen.getByPlaceholderText('Describe the image you want to create...');
    fireEvent.change(textarea, { target: { value: 'A beautiful sunset' } });

    const generateButtons = screen
      .getAllByRole('button')
      .filter((btn) => btn.textContent?.includes('Generate Image'));
    if (generateButtons.length > 0) {
      expect(generateButtons[0]).not.toBeDisabled();
    } else {
      const anyGen = screen
        .getAllByRole('button')
        .filter((btn) => btn.textContent?.includes('Generate'));
      const lastGen = anyGen[anyGen.length - 1];
      expect(lastGen).not.toBeDisabled();
    }
  });

  it('shows generation history section', () => {
    render(<MediaStudio />);
    expect(screen.getByText('Generation History')).toBeDefined();
  });

  it('switches back to Image tab from Video tab', () => {
    render(<MediaStudio />);

    clickTab('Video');
    clickTab('Image');

    expect(screen.getByText('Style')).toBeDefined();
  });
});
