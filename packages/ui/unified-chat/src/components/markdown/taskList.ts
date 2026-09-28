import { createContext } from 'react';

const TASK_MARKER = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[([ xX])\]/;
const FENCE = /^[ \t]{0,3}(?:```|~~~)/;

interface TaskMarker {
  lineStart: number;
  box: number;
  checked: boolean;
}

function findTaskMarkers(markdown: string): TaskMarker[] {
  const markers: TaskMarker[] = [];
  let insideFence = false;
  let offset = 0;
  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) {
      insideFence = !insideFence;
    } else if (!insideFence) {
      const match = TASK_MARKER.exec(line);
      if (match) {
        markers.push({
          lineStart: offset,
          box: offset + match[0].length - 2,
          checked: match[1] !== ' ',
        });
      }
    }
    offset += line.length + 1;
  }
  return markers;
}

export function taskIndexAtOffset(markdown: string, offset: number): number {
  return findTaskMarkers(markdown).findIndex(
    (marker) => marker.lineStart <= offset && offset <= marker.box,
  );
}

export function toggleMarkdownTask(markdown: string, index: number): string {
  const marker = findTaskMarkers(markdown)[index];
  if (!marker) return markdown;
  return `${markdown.slice(0, marker.box)}${marker.checked ? ' ' : 'x'}${markdown.slice(marker.box + 1)}`;
}

export interface TaskToggle {
  source: string;
  onToggle: (index: number) => void;
}

export const TaskToggleContext = createContext<TaskToggle | null>(null);
export const TaskItemIndexContext = createContext<number | null>(null);
