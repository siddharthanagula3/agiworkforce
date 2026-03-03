/**
 * VibeViewStore Tests
 *
 * Tests for the vibe view store: initial state, exported interface,
 * and all store actions (view, split layout, editor, terminal,
 * app viewer, planner, file tree, file metadata, reset).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Zustand persist uses localStorage — provide a simple in-memory mock
const localStorageStore: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => {
    localStorageStore[key] = value;
  },
  removeItem: (key: string) => {
    delete localStorageStore[key];
  },
  clear: () => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
  },
});

// crypto.randomUUID is used by addTerminalCommand
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `test-uuid-${++uuidCounter}`,
});

// ─── Import under test ────────────────────────────────────────────────────────

import {
  useVibeViewStore,
  type VibeViewStore,
  type FileTreeItem,
  type FileMetadata,
} from './vibe-view-store';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Reset store to initial state before each test */
function resetStore() {
  useVibeViewStore.getState().resetViewState();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('VibeViewStore', () => {
  beforeEach(() => {
    uuidCounter = 0;
    resetStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 1. Exported interface is importable
  // ==========================================================================

  describe('Exports', () => {
    it('exports useVibeViewStore hook', () => {
      expect(useVibeViewStore).toBeDefined();
      expect(typeof useVibeViewStore).toBe('function');
    });

    it('exports the VibeViewStore type (interface is usable)', () => {
      // TypeScript will catch this at compile time; at runtime we verify the store
      // shape matches the interface by checking key properties exist
      const state: VibeViewStore = useVibeViewStore.getState();
      expect(state).toHaveProperty('activeView');
      expect(state).toHaveProperty('splitLayout');
      expect(state).toHaveProperty('followingAgent');
      expect(state).toHaveProperty('editorState');
      expect(state).toHaveProperty('terminalState');
      expect(state).toHaveProperty('appViewerState');
      expect(state).toHaveProperty('plannerState');
      expect(state).toHaveProperty('fileTree');
      expect(state).toHaveProperty('fileMetadata');
    });

    it('all action functions are present on the store', () => {
      const state = useVibeViewStore.getState();
      const actionNames: (keyof VibeViewStore)[] = [
        'setActiveView',
        'updateSplitLayout',
        'toggleFollowAgent',
        'setFollowingAgent',
        'updateEditorState',
        'openFile',
        'closeFile',
        'setCurrentFile',
        'updateEditorContent',
        'updateCursor',
        'addTerminalCommand',
        'updateTerminalCommand',
        'clearTerminalHistory',
        'updateAppViewerState',
        'setAppViewerUrl',
        'setViewport',
        'updatePlannerState',
        'addTask',
        'updateTask',
        'setCurrentTask',
        'setFileTree',
        'expandFolder',
        'collapseFolder',
        'setFileMetadata',
        'upsertFileMetadata',
        'removeFileMetadata',
        'getFileMetadata',
        'resetViewState',
      ];
      for (const name of actionNames) {
        expect(typeof state[name]).toBe('function');
      }
    });
  });

  // ==========================================================================
  // 2. Initial state
  // ==========================================================================

  describe('Initial State', () => {
    it('has correct activeView', () => {
      expect(useVibeViewStore.getState().activeView).toBe('editor');
    });

    it('has correct splitLayout', () => {
      const { splitLayout } = useVibeViewStore.getState();
      expect(splitLayout.leftWidth).toBe(40);
      expect(splitLayout.rightWidth).toBe(60);
    });

    it('has followingAgent set to false', () => {
      expect(useVibeViewStore.getState().followingAgent).toBe(false);
    });

    it('has correct editorState defaults', () => {
      const { editorState } = useVibeViewStore.getState();
      expect(editorState.currentFile).toBeNull();
      expect(editorState.openFiles).toEqual([]);
      expect(editorState.cursor).toEqual({ line: 1, column: 1 });
      expect(editorState.content).toBe('');
      expect(editorState.language).toBe('typescript');
    });

    it('has correct terminalState defaults', () => {
      const { terminalState } = useVibeViewStore.getState();
      expect(terminalState.history).toEqual([]);
      expect(terminalState.activeCommand).toBeNull();
    });

    it('has correct appViewerState defaults', () => {
      const { appViewerState } = useVibeViewStore.getState();
      expect(appViewerState.url).toBeNull();
      expect(appViewerState.viewport).toBe('desktop');
      expect(appViewerState.isLoading).toBe(false);
    });

    it('has correct plannerState defaults', () => {
      const { plannerState } = useVibeViewStore.getState();
      expect(plannerState.tasks).toEqual([]);
      expect(plannerState.currentTaskId).toBeNull();
    });

    it('has empty fileTree', () => {
      expect(useVibeViewStore.getState().fileTree).toEqual([]);
    });

    it('has empty fileMetadata', () => {
      expect(useVibeViewStore.getState().fileMetadata).toEqual({});
    });
  });

  // ==========================================================================
  // 3. View management
  // ==========================================================================

  describe('setActiveView', () => {
    it('switches from editor to app-viewer', () => {
      useVibeViewStore.getState().setActiveView('app-viewer');
      expect(useVibeViewStore.getState().activeView).toBe('app-viewer');
    });

    it('switches back to editor', () => {
      useVibeViewStore.getState().setActiveView('app-viewer');
      useVibeViewStore.getState().setActiveView('editor');
      expect(useVibeViewStore.getState().activeView).toBe('editor');
    });
  });

  // ==========================================================================
  // 4. Split layout
  // ==========================================================================

  describe('updateSplitLayout', () => {
    it('updates leftWidth and computes rightWidth as 100 - leftWidth', () => {
      useVibeViewStore.getState().updateSplitLayout(60);
      const { splitLayout } = useVibeViewStore.getState();
      expect(splitLayout.leftWidth).toBe(60);
      expect(splitLayout.rightWidth).toBe(40);
    });

    it('handles edge value of 0', () => {
      useVibeViewStore.getState().updateSplitLayout(0);
      const { splitLayout } = useVibeViewStore.getState();
      expect(splitLayout.leftWidth).toBe(0);
      expect(splitLayout.rightWidth).toBe(100);
    });

    it('handles edge value of 100', () => {
      useVibeViewStore.getState().updateSplitLayout(100);
      const { splitLayout } = useVibeViewStore.getState();
      expect(splitLayout.leftWidth).toBe(100);
      expect(splitLayout.rightWidth).toBe(0);
    });
  });

  // ==========================================================================
  // 5. Following agent
  // ==========================================================================

  describe('toggleFollowAgent', () => {
    it('toggles followingAgent from false to true', () => {
      useVibeViewStore.getState().toggleFollowAgent();
      expect(useVibeViewStore.getState().followingAgent).toBe(true);
    });

    it('toggles followingAgent back to false', () => {
      useVibeViewStore.getState().toggleFollowAgent();
      useVibeViewStore.getState().toggleFollowAgent();
      expect(useVibeViewStore.getState().followingAgent).toBe(false);
    });
  });

  describe('setFollowingAgent', () => {
    it('sets followingAgent to true', () => {
      useVibeViewStore.getState().setFollowingAgent(true);
      expect(useVibeViewStore.getState().followingAgent).toBe(true);
    });

    it('sets followingAgent to false', () => {
      useVibeViewStore.getState().setFollowingAgent(true);
      useVibeViewStore.getState().setFollowingAgent(false);
      expect(useVibeViewStore.getState().followingAgent).toBe(false);
    });
  });

  // ==========================================================================
  // 6. Editor state
  // ==========================================================================

  describe('openFile', () => {
    it('sets the current file, content and language', () => {
      useVibeViewStore.getState().openFile('/src/index.ts', 'console.log("hi")', 'typescript');
      const { editorState } = useVibeViewStore.getState();
      expect(editorState.currentFile).toBe('/src/index.ts');
      expect(editorState.content).toBe('console.log("hi")');
      expect(editorState.language).toBe('typescript');
    });

    it('adds file to openFiles list', () => {
      useVibeViewStore.getState().openFile('/src/index.ts', '', 'typescript');
      expect(useVibeViewStore.getState().editorState.openFiles).toContain('/src/index.ts');
    });

    it('does not duplicate file in openFiles list', () => {
      useVibeViewStore.getState().openFile('/src/index.ts', '', 'typescript');
      useVibeViewStore.getState().openFile('/src/index.ts', 'updated', 'typescript');
      expect(
        useVibeViewStore.getState().editorState.openFiles.filter((f) => f === '/src/index.ts'),
      ).toHaveLength(1);
    });
  });

  describe('closeFile', () => {
    it('removes the file from openFiles', () => {
      useVibeViewStore.getState().openFile('/a.ts', '', 'typescript');
      useVibeViewStore.getState().openFile('/b.ts', '', 'typescript');
      useVibeViewStore.getState().closeFile('/a.ts');
      expect(useVibeViewStore.getState().editorState.openFiles).not.toContain('/a.ts');
      expect(useVibeViewStore.getState().editorState.openFiles).toContain('/b.ts');
    });

    it('sets currentFile to next open file when closing the active file', () => {
      useVibeViewStore.getState().openFile('/a.ts', '', 'typescript');
      useVibeViewStore.getState().openFile('/b.ts', '', 'typescript');
      // currentFile is now /b.ts
      useVibeViewStore.getState().closeFile('/b.ts');
      // Should fall back to /a.ts
      expect(useVibeViewStore.getState().editorState.currentFile).toBe('/a.ts');
    });

    it('sets currentFile to null when no files remain', () => {
      useVibeViewStore.getState().openFile('/a.ts', '', 'typescript');
      useVibeViewStore.getState().closeFile('/a.ts');
      expect(useVibeViewStore.getState().editorState.currentFile).toBeNull();
    });
  });

  describe('setCurrentFile', () => {
    it('updates currentFile', () => {
      useVibeViewStore.getState().setCurrentFile('/src/app.ts');
      expect(useVibeViewStore.getState().editorState.currentFile).toBe('/src/app.ts');
    });

    it('sets currentFile to null', () => {
      useVibeViewStore.getState().setCurrentFile('/src/app.ts');
      useVibeViewStore.getState().setCurrentFile(null);
      expect(useVibeViewStore.getState().editorState.currentFile).toBeNull();
    });
  });

  describe('updateEditorContent', () => {
    it('updates the editor content', () => {
      useVibeViewStore.getState().updateEditorContent('const x = 1;');
      expect(useVibeViewStore.getState().editorState.content).toBe('const x = 1;');
    });
  });

  describe('updateCursor', () => {
    it('updates line and column', () => {
      useVibeViewStore.getState().updateCursor(10, 5);
      expect(useVibeViewStore.getState().editorState.cursor).toEqual({ line: 10, column: 5 });
    });
  });

  describe('updateEditorState', () => {
    it('merges partial updates into editorState', () => {
      useVibeViewStore.getState().updateEditorState({ language: 'python' });
      const { editorState } = useVibeViewStore.getState();
      expect(editorState.language).toBe('python');
      // Other fields should remain
      expect(editorState.cursor).toEqual({ line: 1, column: 1 });
    });
  });

  // ==========================================================================
  // 7. Terminal state
  // ==========================================================================

  describe('addTerminalCommand', () => {
    it('adds a command and returns its id', () => {
      const id = useVibeViewStore.getState().addTerminalCommand({
        command: 'ls -la',
        output: '',
        status: 'running',
      });
      expect(id).toBe('test-uuid-1');
      const { terminalState } = useVibeViewStore.getState();
      expect(terminalState.history).toHaveLength(1);
      expect(terminalState!.history[0]!.command!).toBe('ls -la');
      expect(terminalState.activeCommand).toBe('test-uuid-1');
    });

    it('assigns a timestamp to the command', () => {
      useVibeViewStore.getState().addTerminalCommand({
        command: 'pwd',
        output: '/home',
        status: 'completed',
      });
      const cmd = useVibeViewStore.getState().terminalState.history[0];
      expect(cmd!.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('updateTerminalCommand', () => {
    it('updates the command by id', () => {
      const id = useVibeViewStore.getState().addTerminalCommand({
        command: 'npm test',
        output: '',
        status: 'running',
      });
      useVibeViewStore
        .getState()
        .updateTerminalCommand(id, { output: 'Tests passed', status: 'completed' });
      const cmd = useVibeViewStore.getState().terminalState.history[0];
      expect(cmd!.output).toBe('Tests passed');
      expect(cmd!.status).toBe('completed');
    });

    it('clears activeCommand when status is completed', () => {
      const id = useVibeViewStore.getState().addTerminalCommand({
        command: 'echo hi',
        output: '',
        status: 'running',
      });
      useVibeViewStore.getState().updateTerminalCommand(id, { status: 'completed' });
      expect(useVibeViewStore.getState().terminalState.activeCommand).toBeNull();
    });

    it('clears activeCommand when status is failed', () => {
      const id = useVibeViewStore.getState().addTerminalCommand({
        command: 'bad-command',
        output: '',
        status: 'running',
      });
      useVibeViewStore.getState().updateTerminalCommand(id, { status: 'failed', exitCode: 1 });
      expect(useVibeViewStore.getState().terminalState.activeCommand).toBeNull();
    });

    it('does not change other commands when updating by id', () => {
      const id1 = useVibeViewStore.getState().addTerminalCommand({
        command: 'cmd1',
        output: '',
        status: 'running',
      });
      const id2 = useVibeViewStore.getState().addTerminalCommand({
        command: 'cmd2',
        output: '',
        status: 'running',
      });
      useVibeViewStore
        .getState()
        .updateTerminalCommand(id2, { output: 'result2', status: 'completed' });
      const history = useVibeViewStore.getState().terminalState.history;
      const cmd1 = history.find((c) => c.id === id1);
      expect(cmd1?.status).toBe('running');
    });
  });

  describe('clearTerminalHistory', () => {
    it('clears all history and activeCommand', () => {
      useVibeViewStore
        .getState()
        .addTerminalCommand({ command: 'ls', output: '', status: 'running' });
      useVibeViewStore.getState().clearTerminalHistory();
      const { terminalState } = useVibeViewStore.getState();
      expect(terminalState.history).toEqual([]);
      expect(terminalState.activeCommand).toBeNull();
    });
  });

  // ==========================================================================
  // 8. App viewer state
  // ==========================================================================

  describe('setAppViewerUrl', () => {
    it('sets the url and marks isLoading true', () => {
      useVibeViewStore.getState().setAppViewerUrl('http://localhost:3000');
      const { appViewerState } = useVibeViewStore.getState();
      expect(appViewerState.url).toBe('http://localhost:3000');
      expect(appViewerState.isLoading).toBe(true);
    });
  });

  describe('setViewport', () => {
    it('sets viewport to mobile', () => {
      useVibeViewStore.getState().setViewport('mobile');
      expect(useVibeViewStore.getState().appViewerState.viewport).toBe('mobile');
    });

    it('sets viewport to tablet', () => {
      useVibeViewStore.getState().setViewport('tablet');
      expect(useVibeViewStore.getState().appViewerState.viewport).toBe('tablet');
    });

    it('sets viewport back to desktop', () => {
      useVibeViewStore.getState().setViewport('mobile');
      useVibeViewStore.getState().setViewport('desktop');
      expect(useVibeViewStore.getState().appViewerState.viewport).toBe('desktop');
    });
  });

  describe('updateAppViewerState', () => {
    it('merges partial updates', () => {
      useVibeViewStore.getState().updateAppViewerState({ isLoading: true });
      expect(useVibeViewStore.getState().appViewerState.isLoading).toBe(true);
      // url remains null
      expect(useVibeViewStore.getState().appViewerState.url).toBeNull();
    });
  });

  // ==========================================================================
  // 9. Planner state
  // ==========================================================================

  describe('addTask', () => {
    it('appends a task to the tasks array', () => {
      const task = {
        id: 'task-1',
        title: 'Write tests',
        description: 'Cover all branches',
        status: 'pending' as const,
        assignedTo: 'agent-1',
        dependencies: [],
        progress: 0,
      };
      useVibeViewStore.getState().addTask(task);
      expect(useVibeViewStore.getState().plannerState.tasks).toHaveLength(1);
      expect(useVibeViewStore!.getState().plannerState.tasks[0]!.id!).toBe('task-1');
    });
  });

  describe('updateTask', () => {
    it('updates a task by id', () => {
      const task = {
        id: 'task-2',
        title: 'Deploy',
        description: 'Push to prod',
        status: 'pending' as const,
        assignedTo: 'agent-2',
        dependencies: [],
        progress: 0,
      };
      useVibeViewStore.getState().addTask(task);
      useVibeViewStore.getState().updateTask('task-2', { status: 'in_progress', progress: 50 });
      const updated = useVibeViewStore.getState().plannerState.tasks[0];
      expect(updated!.status).toBe('in_progress');
      expect(updated!.progress).toBe(50);
    });
  });

  describe('setCurrentTask', () => {
    it('sets the currentTaskId', () => {
      useVibeViewStore.getState().setCurrentTask('task-3');
      expect(useVibeViewStore.getState().plannerState.currentTaskId).toBe('task-3');
    });

    it('clears currentTaskId when null is passed', () => {
      useVibeViewStore.getState().setCurrentTask('task-3');
      useVibeViewStore.getState().setCurrentTask(null);
      expect(useVibeViewStore.getState().plannerState.currentTaskId).toBeNull();
    });
  });

  // ==========================================================================
  // 10. File tree
  // ==========================================================================

  describe('setFileTree', () => {
    it('replaces the file tree', () => {
      const tree: FileTreeItem[] = [
        { id: 'f1', name: 'src', type: 'folder', path: '/src', children: [] },
      ];
      useVibeViewStore.getState().setFileTree(tree);
      expect(useVibeViewStore.getState().fileTree).toHaveLength(1);
      expect(useVibeViewStore!.getState().fileTree[0]!.id!).toBe('f1');
    });
  });

  describe('expandFolder', () => {
    it('sets metadata.isExpanded to true on the target folder', () => {
      const tree: FileTreeItem[] = [
        { id: 'folder-1', name: 'src', type: 'folder', path: '/src', children: [] },
      ];
      useVibeViewStore.getState().setFileTree(tree);
      useVibeViewStore.getState().expandFolder('folder-1');
      const folder = useVibeViewStore.getState().fileTree[0];
      expect(folder!.metadata?.['isExpanded']).toBe(true);
    });
  });

  describe('collapseFolder', () => {
    it('sets metadata.isExpanded to false on the target folder', () => {
      const tree: FileTreeItem[] = [
        { id: 'folder-2', name: 'dist', type: 'folder', path: '/dist', children: [] },
      ];
      useVibeViewStore.getState().setFileTree(tree);
      useVibeViewStore.getState().expandFolder('folder-2');
      useVibeViewStore.getState().collapseFolder('folder-2');
      const folder = useVibeViewStore.getState().fileTree[0];
      expect(folder!.metadata?.['isExpanded']).toBe(false);
    });
  });

  // ==========================================================================
  // 11. File metadata
  // ==========================================================================

  describe('setFileMetadata', () => {
    it('replaces fileMetadata keyed by path', () => {
      const meta: FileMetadata[] = [
        { id: 'm1', name: 'index.ts', path: '/src/index.ts', url: '' },
        { id: 'm2', name: 'app.ts', path: '/src/app.ts', url: '' },
      ];
      useVibeViewStore.getState().setFileMetadata(meta);
      const stored = useVibeViewStore.getState().fileMetadata;
      expect(stored!['/src/index.ts']!.id!).toBe('m1');
      expect(stored!['/src/app.ts']!.id!).toBe('m2');
    });
  });

  describe('upsertFileMetadata', () => {
    it('inserts new metadata', () => {
      const meta: FileMetadata = { id: 'm3', name: 'util.ts', path: '/src/util.ts', url: '' };
      useVibeViewStore.getState().upsertFileMetadata(meta);
      expect(useVibeViewStore!.getState().fileMetadata['/src/util.ts']!.id!).toBe('m3');
    });

    it('overwrites existing metadata for the same path', () => {
      const meta1: FileMetadata = { id: 'm4', name: 'helper.ts', path: '/helper.ts', url: 'v1' };
      const meta2: FileMetadata = { id: 'm4', name: 'helper.ts', path: '/helper.ts', url: 'v2' };
      useVibeViewStore.getState().upsertFileMetadata(meta1);
      useVibeViewStore.getState().upsertFileMetadata(meta2);
      expect(useVibeViewStore!.getState().fileMetadata['/helper.ts']!.url!).toBe('v2');
    });
  });

  describe('removeFileMetadata', () => {
    it('removes metadata by path', () => {
      useVibeViewStore.getState().upsertFileMetadata({
        id: 'm5',
        name: 'temp.ts',
        path: '/temp.ts',
        url: '',
      });
      useVibeViewStore.getState().removeFileMetadata('/temp.ts');
      expect(useVibeViewStore.getState().fileMetadata['/temp.ts']).toBeUndefined();
    });
  });

  describe('getFileMetadata', () => {
    it('returns metadata for an existing path', () => {
      useVibeViewStore.getState().upsertFileMetadata({
        id: 'm6',
        name: 'config.ts',
        path: '/config.ts',
        url: '',
      });
      const result = useVibeViewStore.getState().getFileMetadata('/config.ts');
      expect(result?.id).toBe('m6');
    });

    it('returns undefined for a non-existent path', () => {
      const result = useVibeViewStore.getState().getFileMetadata('/does-not-exist.ts');
      expect(result).toBeUndefined();
    });
  });

  // ==========================================================================
  // 12. resetViewState
  // ==========================================================================

  describe('resetViewState', () => {
    it('resets all state back to initial values', () => {
      // Modify various parts of the store
      useVibeViewStore.getState().setActiveView('app-viewer');
      useVibeViewStore.getState().setFollowingAgent(true);
      useVibeViewStore.getState().openFile('/a.ts', 'content', 'typescript');
      useVibeViewStore
        .getState()
        .addTerminalCommand({ command: 'ls', output: '', status: 'running' });
      useVibeViewStore.getState().setAppViewerUrl('http://localhost');
      useVibeViewStore.getState().addTask({
        id: 't1',
        title: 'T',
        description: '',
        status: 'pending',
        assignedTo: '',
        dependencies: [],
        progress: 0,
      });
      useVibeViewStore.getState().upsertFileMetadata({ id: 'x', name: 'x', path: '/x', url: '' });

      // Now reset
      useVibeViewStore.getState().resetViewState();

      const state = useVibeViewStore.getState();
      expect(state.activeView).toBe('editor');
      expect(state.followingAgent).toBe(false);
      expect(state.editorState.currentFile).toBeNull();
      expect(state.editorState.openFiles).toEqual([]);
      expect(state.terminalState.history).toEqual([]);
      expect(state.appViewerState.url).toBeNull();
      expect(state.plannerState.tasks).toEqual([]);
      expect(state.fileMetadata).toEqual({});
    });
  });
});
