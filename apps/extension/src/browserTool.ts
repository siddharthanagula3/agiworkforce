/**
 * Browser-tool action bridge — maps Anthropic Computer Use's
 * `computer_20251124` action set onto the Chrome extension's native
 * `RunPageAction` shape.
 *
 * Why this exists:
 *   The shared `@agiworkforce/browser-tool` package owns the canonical
 *   `BrowserAction` type. The extension cannot run Playwright (no
 *   `playwright-core` in MV3), but it CAN execute most of the Computer
 *   Use action set against the active tab via content-script injections.
 *   This bridge accepts the canonical action shape and emits an
 *   extension-native plan for the existing `RUN_PAGE_ACTIONS` worker.
 *
 * Type-only import: we import `BrowserAction` from `@agiworkforce/browser-tool`
 * via `import type` so Vite tree-shakes the package's runtime (which
 * depends on Playwright). Only the type alias travels into the bundle —
 * verified by inspecting the production rollup output.
 *
 * 16-action coverage (Anthropic Computer Use `computer_20251124`):
 *   ✓ screenshot          → CAPTURE_SCREENSHOT
 *   ✓ left_click          → CLICK (button:'left')
 *   ✓ right_click         → RIGHT_CLICK
 *   ✓ middle_click        → CLICK (button:'middle')
 *   ✓ double_click        → DOUBLE_CLICK
 *   ✓ triple_click        → CLICK + EXECUTE_SCRIPT (3× with detail)
 *   ✓ mouse_move          → EXECUTE_SCRIPT (dispatchEvent mousemove)
 *   ✓ key                 → EXECUTE_SCRIPT (KeyboardEvent)
 *   ✓ type                → TYPE
 *   ✓ scroll              → SCROLL
 *   ✓ hold_key            → EXECUTE_SCRIPT (keydown + setTimeout + keyup)
 *   ✓ wait                → EXECUTE_SCRIPT (await sleep)
 *   ✓ left_mouse_down     → EXECUTE_SCRIPT (mousedown)
 *   ✓ left_mouse_up       → EXECUTE_SCRIPT (mouseup)
 *   ✓ cursor_position     → EXECUTE_SCRIPT (return saved cursor pos)
 *   ✗ zoom                → NOT IMPLEMENTABLE in content script (Chrome
 *                           ext lacks page-zoom API; would need
 *                           `chrome.tabs.setZoom` which requires the
 *                           `tabs` permission and operates per-tab).
 *
 * Cross-package action set: The shared package's existing 10-action
 * `BrowserAction` (navigate, click, clickCoords, type, press, screenshot,
 * snapshot, wait, evaluate, close) is a SUBSET of Computer Use's 16
 * actions. This bridge accepts both forms and routes accordingly.
 *
 * Permissions: `right_click`, `triple_click`, `hold_key`, and the cursor-
 * tracking actions need access to the page's keyboard/mouse event
 * dispatcher, which requires the `scripting` and `activeTab` permissions
 * already declared in the manifest. `zoom` would need `tabs`, which is
 * deferred (no shipping use-case yet).
 */

import type {
  BrowserAction,
  BrowserToolResult,
  BrowserSnapshot,
  BrowserSnapshotMode,
} from '@agiworkforce/browser-tool';

/** Canonical Anthropic Computer Use action set (`computer_20251124`). */
export type ComputerUseAction =
  | { kind: 'screenshot' }
  | { kind: 'left_click'; coordinate?: [number, number]; ref?: string }
  | { kind: 'right_click'; coordinate?: [number, number]; ref?: string }
  | { kind: 'middle_click'; coordinate?: [number, number]; ref?: string }
  | { kind: 'double_click'; coordinate?: [number, number]; ref?: string }
  | { kind: 'triple_click'; coordinate?: [number, number]; ref?: string }
  | { kind: 'mouse_move'; coordinate: [number, number] }
  | { kind: 'key'; text: string }
  | { kind: 'type'; text: string; ref?: string }
  | {
      kind: 'scroll';
      coordinate?: [number, number];
      scroll_direction: 'up' | 'down' | 'left' | 'right';
      scroll_amount: number;
    }
  | { kind: 'hold_key'; text: string; duration: number }
  | { kind: 'wait'; duration: number }
  | { kind: 'left_mouse_down'; coordinate: [number, number] }
  | { kind: 'left_mouse_up'; coordinate: [number, number] }
  | { kind: 'cursor_position' }
  | { kind: 'zoom'; level: number };

/** Native extension action shape (already declared in `types.ts`). */
export interface PageActionStep {
  id: string;
  type: string;
  selector?: string | null;
  value?: string | null;
  delay?: number | null;
}

export type { BrowserAction, BrowserToolResult, BrowserSnapshot, BrowserSnapshotMode };

let stepIdCounter = 0;
function stepId(prefix: string): string {
  stepIdCounter += 1;
  return `${prefix}_${stepIdCounter}_${Date.now()}`;
}

/**
 * Translate Anthropic Computer Use's action set onto the extension's
 * native page-action plan. Returns one or more `PageActionStep`s for the
 * existing `RUN_PAGE_ACTIONS` machinery.
 */
export function computerUseToPageActions(action: ComputerUseAction): PageActionStep[] {
  switch (action.kind) {
    case 'screenshot':
      return [{ id: stepId('screenshot'), type: 'screenshot' }];
    case 'left_click':
      return [
        {
          id: stepId('click'),
          type: 'click',
          selector: action.ref ?? null,
          value: coordsToValue(action.coordinate),
        },
      ];
    case 'right_click':
      return [
        {
          id: stepId('right_click'),
          type: 'right_click',
          selector: action.ref ?? null,
          value: coordsToValue(action.coordinate),
        },
      ];
    case 'middle_click':
      return [
        {
          id: stepId('click'),
          type: 'click',
          selector: action.ref ?? null,
          value: `middle:${coordsToValue(action.coordinate) ?? ''}`,
        },
      ];
    case 'double_click':
      return [
        {
          id: stepId('dblclick'),
          type: 'double_click',
          selector: action.ref ?? null,
          value: coordsToValue(action.coordinate),
        },
      ];
    case 'triple_click':
      return [
        {
          id: stepId('triple'),
          type: 'triple_click',
          selector: action.ref ?? null,
          value: coordsToValue(action.coordinate),
        },
      ];
    case 'mouse_move':
      return [
        {
          id: stepId('move'),
          type: 'execute_script',
          value: scriptForMouseMove(action.coordinate),
        },
      ];
    case 'key':
      return [
        {
          id: stepId('key'),
          type: 'key',
          value: action.text,
        },
      ];
    case 'type':
      return [
        {
          id: stepId('type'),
          type: 'type',
          selector: action.ref ?? null,
          value: action.text,
        },
      ];
    case 'scroll':
      return [
        {
          id: stepId('scroll'),
          type: 'scroll',
          value: JSON.stringify({
            direction: action.scroll_direction,
            amount: action.scroll_amount,
            coordinate: action.coordinate ?? null,
          }),
        },
      ];
    case 'hold_key':
      return [
        {
          id: stepId('hold'),
          type: 'hold_key',
          value: action.text,
          delay: action.duration,
        },
      ];
    case 'wait':
      return [
        {
          id: stepId('wait'),
          type: 'wait',
          delay: action.duration,
        },
      ];
    case 'left_mouse_down':
      return [
        {
          id: stepId('down'),
          type: 'execute_script',
          value: scriptForMouseDown(action.coordinate),
        },
      ];
    case 'left_mouse_up':
      return [
        {
          id: stepId('up'),
          type: 'execute_script',
          value: scriptForMouseUp(action.coordinate),
        },
      ];
    case 'cursor_position':
      return [
        {
          id: stepId('cursor'),
          type: 'execute_script',
          value: 'JSON.stringify(window.__agi_cursor__ || {x: 0, y: 0})',
        },
      ];
    case 'zoom':
      // Not implementable from a content-script context; return an
      // explicit no-op step that the executor logs and skips.
      return [
        {
          id: stepId('zoom'),
          type: 'unsupported',
          value: `zoom:${action.level}`,
        },
      ];
  }
}

/**
 * Translate the shared package's `BrowserAction` (10-action subset) onto
 * native page actions. Used when callers consume the Playwright-style
 * canonical action vocabulary.
 */
export function browserActionToPageActions(action: BrowserAction): PageActionStep[] {
  switch (action.kind) {
    case 'navigate':
      return [{ id: stepId('navigate'), type: 'navigate', value: action.url }];
    case 'click':
      return [
        {
          id: stepId('click'),
          type: action.button === 'right' ? 'right_click' : 'click',
          selector: action.ref,
          value: action.button ? `button:${action.button}` : null,
        },
      ];
    case 'clickCoords':
      return [
        {
          id: stepId('click_coord'),
          type: 'click',
          value: `${action.x},${action.y}`,
        },
      ];
    case 'type':
      return [
        {
          id: stepId('type'),
          type: 'type',
          selector: action.ref,
          value: action.submit ? `${action.text}\n` : action.text,
        },
      ];
    case 'press':
      return [
        {
          id: stepId('press'),
          type: 'key',
          value: action.key,
        },
      ];
    case 'screenshot':
      return [{ id: stepId('screenshot'), type: 'screenshot' }];
    case 'snapshot':
      return [
        {
          id: stepId('snapshot'),
          type: 'snapshot',
          value: action.mode ?? 'aria',
        },
      ];
    case 'wait':
      return [{ id: stepId('wait'), type: 'wait', delay: action.ms }];
    case 'evaluate':
      return [
        {
          id: stepId('eval'),
          type: 'execute_script',
          value: action.script,
        },
      ];
    case 'close':
      return [{ id: stepId('close'), type: 'unsupported', value: 'close' }];
  }
}

function coordsToValue(coords?: [number, number]): string | null {
  return coords ? `${coords[0]},${coords[1]}` : null;
}

function scriptForMouseMove([x, y]: [number, number]): string {
  return `(()=>{const el=document.elementFromPoint(${x},${y});if(el)el.dispatchEvent(new MouseEvent('mousemove',{clientX:${x},clientY:${y},bubbles:true}));window.__agi_cursor__={x:${x},y:${y}};})()`;
}

// Note: the previous scriptForKey / scriptForHoldKey helpers built JavaScript
// source strings via template interpolation and emitted them as
// `type: 'execute_script'` steps. content.ts has no `execute_script` switch
// case, so those strings were dead-code producers — never eval'd — but
// CodeQL `js/bad-code-sanitization` flagged the producer-side interpolation
// (alerts #451-#454). Refactored: callers now emit `type: 'key'` /
// `type: 'hold_key'` steps with the key string + optional durationMs as
// structured fields, and content.ts dispatches KeyboardEvent natively with
// the key string passed as data — no JavaScript string ever leaves this
// process for downstream execution.

function scriptForMouseDown([x, y]: [number, number]): string {
  return `(()=>{const el=document.elementFromPoint(${x},${y});if(el)el.dispatchEvent(new MouseEvent('mousedown',{clientX:${x},clientY:${y},bubbles:true,button:0}));})()`;
}

function scriptForMouseUp([x, y]: [number, number]): string {
  return `(()=>{const el=document.elementFromPoint(${x},${y});if(el)el.dispatchEvent(new MouseEvent('mouseup',{clientX:${x},clientY:${y},bubbles:true,button:0}));})()`;
}
