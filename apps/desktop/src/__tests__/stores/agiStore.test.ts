import { describe, it, expect, beforeEach } from 'vitest';
import { useExecutionStore } from '../../stores/executionStore';
import type {
  ActiveGoal,
  ExecutionStep,
  TerminalLog,
  BrowserAction,
  FileChange,
} from '../../stores/executionStore';

/**
 * Tests for the real ExecutionStore (Zustand + immer).
 *
 * This store manages all AGI execution state: goals, steps, terminal logs,
 * browser actions, file changes, LLM streaming, and panel UI state.
 */

describe('ExecutionStore (real Zustand store)', () => {
  beforeEach(() => {
    // Reset the store to initial state before each test
    useExecutionStore.getState().reset();
  });

  describe('Active Goal Management', () => {
    const sampleGoal: ActiveGoal = {
      id: 'goal-1',
      description: 'Analyze user feedback',
      status: 'planning',
      startTime: Date.now(),
      totalSteps: 0,
      completedSteps: 0,
      progressPercent: 0,
    };

    it('should start with no active goal', () => {
      const state = useExecutionStore.getState();
      expect(state.activeGoal).toBeNull();
    });

    it('should set an active goal', () => {
      useExecutionStore.getState().setActiveGoal(sampleGoal);

      const state = useExecutionStore.getState();
      expect(state.activeGoal).toBeDefined();
      expect(state.activeGoal!.id).toBe('goal-1');
      expect(state.activeGoal!.description).toBe('Analyze user feedback');
      expect(state.activeGoal!.status).toBe('planning');
    });

    it('should update an active goal status', () => {
      useExecutionStore.getState().setActiveGoal(sampleGoal);
      useExecutionStore.getState().setActiveGoal({
        ...sampleGoal,
        status: 'executing',
        totalSteps: 5,
      });

      const state = useExecutionStore.getState();
      expect(state.activeGoal!.status).toBe('executing');
      expect(state.activeGoal!.totalSteps).toBe(5);
    });

    it('should clear the active goal when set to null', () => {
      useExecutionStore.getState().setActiveGoal(sampleGoal);
      useExecutionStore.getState().setActiveGoal(null);

      const state = useExecutionStore.getState();
      expect(state.activeGoal).toBeNull();
    });
  });

  describe('Execution Steps', () => {
    it('should start with an empty steps array', () => {
      expect(useExecutionStore.getState().steps).toHaveLength(0);
    });

    it('should add execution steps', () => {
      const step: ExecutionStep = {
        id: 'step-1',
        goalId: 'goal-1',
        index: 0,
        description: 'Fetch data from API',
        status: 'in-progress',
        startTime: Date.now(),
      };

      useExecutionStore.getState().addStep(step);

      const state = useExecutionStore.getState();
      expect(state.steps).toHaveLength(1);
      expect(state.steps[0]!.id).toBe('step-1');
      expect(state.steps[0]!.description).toBe('Fetch data from API');
      expect(state.steps[0]!.status).toBe('in-progress');
    });

    it('should update a step by ID', () => {
      const step: ExecutionStep = {
        id: 'step-1',
        goalId: 'goal-1',
        index: 0,
        description: 'Fetch data',
        status: 'in-progress',
        startTime: Date.now(),
      };

      useExecutionStore.getState().addStep(step);
      useExecutionStore.getState().updateStep('step-1', {
        status: 'completed',
        endTime: Date.now(),
        executionTimeMs: 1500,
      });

      const updated = useExecutionStore.getState().steps[0];
      expect(updated!.status).toBe('completed');
      expect(updated!.executionTimeMs).toBe(1500);
      expect(updated!.endTime).toBeDefined();
    });

    it('should append LLM reasoning to a step', () => {
      const step: ExecutionStep = {
        id: 'step-1',
        goalId: 'goal-1',
        index: 0,
        description: 'Reasoning step',
        status: 'in-progress',
      };

      useExecutionStore.getState().addStep(step);
      useExecutionStore.getState().appendLLMReasoning('step-1', 'Analyzing the ');
      useExecutionStore.getState().appendLLMReasoning('step-1', 'input data...');

      const result = useExecutionStore.getState().steps[0];
      expect(result!.llmReasoning).toBe('Analyzing the input data...');
    });

    it('should cap steps at 200 entries', () => {
      const store = useExecutionStore.getState();
      for (let i = 0; i < 210; i++) {
        store.addStep({
          id: `step-${i}`,
          goalId: 'goal-1',
          index: i,
          description: `Step ${i}`,
          status: 'completed',
        });
      }

      const state = useExecutionStore.getState();
      expect(state.steps).toHaveLength(200);
      // Should keep the most recent entries
      expect(state.steps[199]!.id).toBe('step-209');
    });
  });

  describe('Terminal Logs', () => {
    it('should add terminal logs', () => {
      const log: TerminalLog = {
        id: 'log-1',
        timestamp: Date.now(),
        command: 'ls -la',
        output: 'total 42\ndrwxr-xr-x ...',
        exitCode: 0,
        isError: false,
      };

      useExecutionStore.getState().addTerminalLog(log);

      const state = useExecutionStore.getState();
      expect(state.terminalLogs).toHaveLength(1);
      expect(state.terminalLogs[0]!.command).toBe('ls -la');
    });

    it('should clear terminal logs', () => {
      useExecutionStore.getState().addTerminalLog({
        id: 'log-1',
        timestamp: Date.now(),
        output: 'output',
        isError: false,
      });

      useExecutionStore.getState().clearTerminalLogs();

      expect(useExecutionStore.getState().terminalLogs).toHaveLength(0);
    });

    it('should set terminal scroll lock', () => {
      expect(useExecutionStore.getState().terminalScrollLock).toBe(true); // default
      useExecutionStore.getState().setTerminalScrollLock(false);
      expect(useExecutionStore.getState().terminalScrollLock).toBe(false);
    });
  });

  describe('Browser Actions', () => {
    it('should add browser actions', () => {
      const action: BrowserAction = {
        id: 'action-1',
        timestamp: Date.now(),
        type: 'navigate',
        url: 'https://example.com',
        success: true,
      };

      useExecutionStore.getState().addBrowserAction(action);

      const state = useExecutionStore.getState();
      expect(state.browserActions).toHaveLength(1);
      expect(state.browserActions[0]!.url).toBe('https://example.com');
    });

    it('should update current browser state from screenshot action', () => {
      const action: BrowserAction = {
        id: 'action-1',
        timestamp: Date.now(),
        type: 'screenshot',
        screenshotData: 'base64-data-here',
        success: true,
      };

      useExecutionStore.getState().addBrowserAction(action);

      const state = useExecutionStore.getState();
      expect(state.currentScreenshot).toBe('base64-data-here');
    });

    it('should update current browser URL and screenshot', () => {
      useExecutionStore.getState().updateCurrentBrowserState('https://example.com', 'img-data');

      const state = useExecutionStore.getState();
      expect(state.currentBrowserUrl).toBe('https://example.com');
      expect(state.currentScreenshot).toBe('img-data');
    });
  });

  describe('File Changes', () => {
    it('should add file changes', () => {
      const change: FileChange = {
        id: 'fc-1',
        timestamp: Date.now(),
        path: '/src/app.ts',
        operation: 'modify',
        oldContent: 'const x = 1;',
        newContent: 'const x = 2;',
        language: 'typescript',
        accepted: null,
      };

      useExecutionStore.getState().addFileChange(change);

      const state = useExecutionStore.getState();
      expect(state.fileChanges).toHaveLength(1);
      expect(state.fileChanges[0]!.path).toBe('/src/app.ts');
      expect(state.fileChanges[0]!.accepted).toBeNull();
    });

    it('should update file change acceptance', () => {
      useExecutionStore.getState().addFileChange({
        id: 'fc-1',
        timestamp: Date.now(),
        path: '/src/app.ts',
        operation: 'modify',
        accepted: null,
      });

      useExecutionStore.getState().updateFileChange('fc-1', true);

      expect(useExecutionStore.getState().fileChanges[0]!.accepted).toBe(true);
    });

    it('should clear file changes', () => {
      useExecutionStore.getState().addFileChange({
        id: 'fc-1',
        timestamp: Date.now(),
        path: '/src/a.ts',
        operation: 'create',
        accepted: null,
      });

      useExecutionStore.getState().clearFileChanges();

      expect(useExecutionStore.getState().fileChanges).toHaveLength(0);
    });

    it('should cap file changes at 500 entries', () => {
      const store = useExecutionStore.getState();
      for (let i = 0; i < 510; i++) {
        store.addFileChange({
          id: `fc-${i}`,
          timestamp: Date.now(),
          path: `/src/file-${i}.ts`,
          operation: 'modify',
          accepted: null,
        });
      }

      expect(useExecutionStore.getState().fileChanges).toHaveLength(500);
    });
  });

  describe('LLM Streaming', () => {
    it('should append LLM stream chunks', () => {
      useExecutionStore.getState().appendLLMStream('Hello ');
      useExecutionStore.getState().appendLLMStream('world!');

      expect(useExecutionStore.getState().currentLLMStream).toBe('Hello world!');
    });

    it('should clear the LLM stream', () => {
      useExecutionStore.getState().appendLLMStream('some text');
      useExecutionStore.getState().clearLLMStream();

      expect(useExecutionStore.getState().currentLLMStream).toBe('');
    });

    it('should set streaming state', () => {
      expect(useExecutionStore.getState().isStreaming).toBe(false);

      useExecutionStore.getState().setStreaming(true);
      expect(useExecutionStore.getState().isStreaming).toBe(true);

      useExecutionStore.getState().setStreaming(false);
      expect(useExecutionStore.getState().isStreaming).toBe(false);
    });
  });

  describe('Panel UI State', () => {
    it('should start with panel hidden', () => {
      expect(useExecutionStore.getState().panelVisible).toBe(false);
    });

    it('should set panel visibility', () => {
      useExecutionStore.getState().setPanelVisible(true);
      expect(useExecutionStore.getState().panelVisible).toBe(true);
    });

    it('should toggle panel visibility', () => {
      useExecutionStore.getState().togglePanel();
      expect(useExecutionStore.getState().panelVisible).toBe(true);

      useExecutionStore.getState().togglePanel();
      expect(useExecutionStore.getState().panelVisible).toBe(false);
    });

    it('should set active tab', () => {
      expect(useExecutionStore.getState().activeTab).toBe('thinking');

      useExecutionStore.getState().setActiveTab('terminal');
      expect(useExecutionStore.getState().activeTab).toBe('terminal');

      useExecutionStore.getState().setActiveTab('browser');
      expect(useExecutionStore.getState().activeTab).toBe('browser');

      useExecutionStore.getState().setActiveTab('files');
      expect(useExecutionStore.getState().activeTab).toBe('files');

      useExecutionStore.getState().setActiveTab('reflection');
      expect(useExecutionStore.getState().activeTab).toBe('reflection');
    });
  });

  describe('Reflection State', () => {
    it('should start with default reflection state', () => {
      const reflection = useExecutionStore.getState().reflection;
      expect(reflection.currentInsight).toBeNull();
      expect(reflection.failurePatterns).toHaveLength(0);
      expect(reflection.corrections).toHaveLength(0);
      expect(reflection.subGoals).toHaveLength(0);
      expect(reflection.recommendations).toHaveLength(0);
      expect(reflection.iteration).toBe(0);
      expect(reflection.isReflecting).toBe(false);
      expect(reflection.goalAchievable).toBe(true);
      expect(reflection.confidence).toBe(1.0);
    });

    it('should set reflecting state', () => {
      useExecutionStore.getState().setReflecting(true);
      expect(useExecutionStore.getState().reflection.isReflecting).toBe(true);
    });

    it('should set iteration number', () => {
      useExecutionStore.getState().setIteration(3);
      expect(useExecutionStore.getState().reflection.iteration).toBe(3);
    });

    it('should set recommendations', () => {
      useExecutionStore
        .getState()
        .setRecommendations(['Try a different approach', 'Break into smaller steps']);

      const recommendations = useExecutionStore.getState().reflection.recommendations;
      expect(recommendations).toHaveLength(2);
      expect(recommendations[0]).toBe('Try a different approach');
    });

    it('should clear reflection state', () => {
      useExecutionStore.getState().setReflecting(true);
      useExecutionStore.getState().setIteration(5);
      useExecutionStore.getState().setRecommendations(['test']);

      useExecutionStore.getState().clearReflection();

      const reflection = useExecutionStore.getState().reflection;
      expect(reflection.isReflecting).toBe(false);
      expect(reflection.iteration).toBe(0);
      expect(reflection.recommendations).toHaveLength(0);
    });
  });

  describe('Cleanup and Reset', () => {
    it('should cleanup goal contexts while preserving goal state', () => {
      useExecutionStore.getState().setActiveGoal({
        id: 'goal-1',
        description: 'Test goal',
        status: 'completed',
        startTime: Date.now(),
        totalSteps: 2,
        completedSteps: 2,
        progressPercent: 100,
      });

      useExecutionStore.getState().addStep({
        id: 'step-1',
        goalId: 'goal-1',
        index: 0,
        description: 'Step 1',
        status: 'completed',
      });

      useExecutionStore.getState().addTerminalLog({
        id: 'log-1',
        timestamp: Date.now(),
        output: 'output',
        isError: false,
      });

      useExecutionStore.getState().cleanupGoalContexts();

      const state = useExecutionStore.getState();
      // Goal should still be there
      expect(state.activeGoal).toBeDefined();
      expect(state.activeGoal!.id).toBe('goal-1');
      // But execution data should be cleared
      expect(state.steps).toHaveLength(0);
      expect(state.terminalLogs).toHaveLength(0);
      expect(state.browserActions).toHaveLength(0);
      expect(state.fileChanges).toHaveLength(0);
      expect(state.isStreaming).toBe(false);
    });

    it('should fully reset all state', () => {
      useExecutionStore.getState().setActiveGoal({
        id: 'goal-1',
        description: 'Test',
        status: 'executing',
        startTime: Date.now(),
        totalSteps: 1,
        completedSteps: 0,
        progressPercent: 0,
      });
      useExecutionStore.getState().setPanelVisible(true);
      useExecutionStore.getState().setActiveTab('terminal');
      useExecutionStore.getState().setStreaming(true);

      useExecutionStore.getState().reset();

      const state = useExecutionStore.getState();
      expect(state.activeGoal).toBeNull();
      expect(state.steps).toHaveLength(0);
      expect(state.panelVisible).toBe(false);
      expect(state.activeTab).toBe('thinking');
      expect(state.isStreaming).toBe(false);
    });
  });

  describe('Selectors', () => {
    it('selectActiveStep should return the in-progress step', async () => {
      const { selectActiveStep } = await import('../../stores/executionStore');

      useExecutionStore.getState().addStep({
        id: 'step-1',
        goalId: 'goal-1',
        index: 0,
        description: 'Done',
        status: 'completed',
      });
      useExecutionStore.getState().addStep({
        id: 'step-2',
        goalId: 'goal-1',
        index: 1,
        description: 'Active',
        status: 'in-progress',
      });
      useExecutionStore.getState().addStep({
        id: 'step-3',
        goalId: 'goal-1',
        index: 2,
        description: 'Pending',
        status: 'pending',
      });

      const activeStep = selectActiveStep(useExecutionStore.getState());
      expect(activeStep).toBeDefined();
      expect(activeStep!.id).toBe('step-2');
      expect(activeStep!.description).toBe('Active');
    });

    it('selectPendingFileChanges should return unreviewed changes', async () => {
      const { selectPendingFileChanges } = await import('../../stores/executionStore');

      useExecutionStore.getState().addFileChange({
        id: 'fc-1',
        timestamp: Date.now(),
        path: '/a.ts',
        operation: 'modify',
        accepted: true,
      });
      useExecutionStore.getState().addFileChange({
        id: 'fc-2',
        timestamp: Date.now(),
        path: '/b.ts',
        operation: 'create',
        accepted: null,
      });
      useExecutionStore.getState().addFileChange({
        id: 'fc-3',
        timestamp: Date.now(),
        path: '/c.ts',
        operation: 'delete',
        accepted: null,
      });

      const pending = selectPendingFileChanges(useExecutionStore.getState());
      expect(pending).toHaveLength(2);
      expect(pending.map((c) => c.id)).toEqual(['fc-2', 'fc-3']);
    });
  });
});
