import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../Resizable';

describe('Resizable', () => {
  it('renders panels without crashing', () => {
    const { container } = render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>left</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>right</ResizablePanel>
      </ResizablePanelGroup>,
    );
    expect(container.textContent).toContain('left');
    expect(container.textContent).toContain('right');
  });
});
