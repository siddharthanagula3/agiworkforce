import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTerminal } from '../useTerminal';

// Mock the tauri-mock module
vi.mock('../../lib/tauri-mock', () => ({
  invoke: vi.fn(),
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

import { invoke, listen } from '../../lib/tauri-mock';

const mockInvoke = invoke as ReturnType<typeof vi.fn>;
const mockListen = listen as ReturnType<typeof vi.fn>;

describe('useTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockResolvedValue(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createSession', () => {
    it('should create a new terminal session', async () => {
      const mockSessionId = 'test-session-123';
      mockInvoke.mockResolvedValueOnce(mockSessionId);

      const { result } = renderHook(() => useTerminal({ autoConnect: false }));

      let sessionId: string | undefined;
      await act(async () => {
        sessionId = await result.current.createSession('PowerShell');
      });

      expect(sessionId).toBe(mockSessionId);
      expect(mockInvoke).toHaveBeenCalledWith('terminal_create_session', {
        shellType: 'PowerShell',
        cwd: undefined,
      });
    });

    it('should create session with custom working directory', async () => {
      const mockSessionId = 'test-session-456';
      mockInvoke.mockResolvedValueOnce(mockSessionId);

      const { result } = renderHook(() => useTerminal({ autoConnect: false }));

      await act(async () => {
        await result.current.createSession('GitBash', '/home/user');
      });

      expect(mockInvoke).toHaveBeenCalledWith('terminal_create_session', {
        shellType: 'GitBash',
        cwd: '/home/user',
      });
    });

    it('should auto-connect to session when autoConnect is true', async () => {
      const mockSessionId = 'test-session-789';
      mockInvoke.mockResolvedValueOnce(mockSessionId);

      const { result } = renderHook(() => useTerminal({ autoConnect: true }));

      await act(async () => {
        await result.current.createSession('PowerShell');
      });

      expect(mockListen).toHaveBeenCalledTimes(2); // output and exit events
    });
  });

  describe('closeSession', () => {
    it('should close a terminal session', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useTerminal());

      await act(async () => {
        await result.current.closeSession('session-to-close');
      });

      expect(mockInvoke).toHaveBeenCalledWith('terminal_close_session', {
        sessionId: 'session-to-close',
      });
    });
  });

  describe('sendInput', () => {
    it('should send input to terminal', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useTerminal());

      await act(async () => {
        await result.current.sendInput('session-123', 'ls -la\n');
      });

      expect(mockInvoke).toHaveBeenCalledWith('terminal_send_input', {
        sessionId: 'session-123',
        data: 'ls -la\n',
      });
    });
  });

  describe('getOutput', () => {
    it('should get terminal output', async () => {
      const mockOutput = 'Command output here';
      mockInvoke.mockResolvedValueOnce(mockOutput);

      const { result } = renderHook(() => useTerminal());

      let output: string | undefined;
      await act(async () => {
        output = await result.current.getOutput('session-123');
      });

      expect(output).toBe(mockOutput);
      expect(mockInvoke).toHaveBeenCalledWith('terminal_get_output', {
        sessionId: 'session-123',
      });
    });
  });

  describe('resize', () => {
    it('should resize terminal', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useTerminal());

      await act(async () => {
        await result.current.resize('session-123', 80, 24);
      });

      expect(mockInvoke).toHaveBeenCalledWith('terminal_resize', {
        sessionId: 'session-123',
        cols: 80,
        rows: 24,
      });
    });
  });

  describe('getHistory', () => {
    it('should get command history with default limit', async () => {
      const mockHistory = ['ls', 'cd /home', 'pwd'];
      mockInvoke.mockResolvedValueOnce(mockHistory);

      const { result } = renderHook(() => useTerminal());

      let history: string[] | undefined;
      await act(async () => {
        history = await result.current.getHistory('session-123');
      });

      expect(history).toEqual(mockHistory);
      expect(mockInvoke).toHaveBeenCalledWith('terminal_get_history', {
        sessionId: 'session-123',
        limit: 100,
      });
    });

    it('should get command history with custom limit', async () => {
      mockInvoke.mockResolvedValueOnce(['cmd1', 'cmd2']);

      const { result } = renderHook(() => useTerminal());

      await act(async () => {
        await result.current.getHistory('session-123', 50);
      });

      expect(mockInvoke).toHaveBeenCalledWith('terminal_get_history', {
        sessionId: 'session-123',
        limit: 50,
      });
    });
  });

  describe('searchHistory', () => {
    it('should search command history', async () => {
      const mockResults = ['git commit', 'git push'];
      mockInvoke.mockResolvedValueOnce(mockResults);

      const { result } = renderHook(() => useTerminal());

      let results: string[] | undefined;
      await act(async () => {
        results = await result.current.searchHistory('session-123', 'git');
      });

      expect(results).toEqual(mockResults);
      expect(mockInvoke).toHaveBeenCalledWith('terminal_search_history', {
        sessionId: 'session-123',
        query: 'git',
        limit: 50,
      });
    });
  });

  describe('environment variables', () => {
    it('should set environment variable', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useTerminal());

      await act(async () => {
        await result.current.setEnv('session-123', 'MY_VAR', 'my_value');
      });

      expect(mockInvoke).toHaveBeenCalledWith('terminal_set_env', {
        sessionId: 'session-123',
        key: 'MY_VAR',
        value: 'my_value',
      });
    });

    it('should get environment variable', async () => {
      mockInvoke.mockResolvedValueOnce('test_value');

      const { result } = renderHook(() => useTerminal());

      let value: string | null | undefined;
      await act(async () => {
        value = await result.current.getEnv('session-123', 'PATH');
      });

      expect(value).toBe('test_value');
      expect(mockInvoke).toHaveBeenCalledWith('terminal_get_env', {
        sessionId: 'session-123',
        key: 'PATH',
      });
    });

    it('should list environment variables', async () => {
      const mockVars = [
        { key: 'PATH', value: '/usr/bin' },
        { key: 'HOME', value: '/home/user' },
      ];
      mockInvoke.mockResolvedValueOnce(mockVars);

      const { result } = renderHook(() => useTerminal());

      let vars: { key: string; value: string }[] | undefined;
      await act(async () => {
        vars = await result.current.listEnv('session-123');
      });

      expect(vars).toEqual(mockVars);
    });

    it('should unset environment variable', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useTerminal());

      await act(async () => {
        await result.current.unsetEnv('session-123', 'MY_VAR');
      });

      expect(mockInvoke).toHaveBeenCalledWith('terminal_unset_env', {
        sessionId: 'session-123',
        key: 'MY_VAR',
      });
    });
  });

  describe('detectShells', () => {
    it('should detect available shells', async () => {
      const mockShells = [
        { name: 'PowerShell', path: '/usr/bin/pwsh', available: true, shell_type: 'PowerShell' },
        { name: 'Bash', path: '/bin/bash', available: true, shell_type: 'GitBash' },
      ];
      mockInvoke.mockResolvedValueOnce(mockShells);

      const { result } = renderHook(() => useTerminal());

      let shells: typeof mockShells | undefined;
      await act(async () => {
        shells = await result.current.detectShells();
      });

      expect(shells).toEqual(mockShells);
      expect(mockInvoke).toHaveBeenCalledWith('terminal_detect_shells');
    });
  });

  describe('error handling', () => {
    it('should handle errors and call onError callback', async () => {
      const mockError = new Error('Terminal error');
      mockInvoke.mockRejectedValueOnce(mockError);

      const onError = vi.fn();
      const { result } = renderHook(() => useTerminal({ onError }));

      await expect(async () => {
        await act(async () => {
          await result.current.sendInput('session-123', 'bad-command');
        });
      }).rejects.toThrow('Terminal error');

      expect(onError).toHaveBeenCalledWith(mockError);
    });

    it('should set error state on failure', async () => {
      const mockError = new Error('Connection failed');
      mockInvoke.mockRejectedValueOnce(mockError);

      let capturedError: Error | undefined;
      const onError = vi.fn((err: Error) => {
        capturedError = err;
      });
      const { result } = renderHook(() => useTerminal({ onError }));

      try {
        await act(async () => {
          await result.current.createSession('PowerShell');
        });
      } catch {
        // Expected to throw
      }

      // Error callback should have been called with the error
      expect(onError).toHaveBeenCalled();
      expect(capturedError).toBeInstanceOf(Error);
      expect(capturedError?.message).toBe('Connection failed');
    });
  });

  describe('session connection', () => {
    it('should connect to session output stream', async () => {
      const { result } = renderHook(() => useTerminal());

      await act(async () => {
        await result.current.connectToSession('session-123');
      });

      expect(mockListen).toHaveBeenCalledWith('terminal-output-session-123', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('terminal-exit-session-123', expect.any(Function));
    });

    it('should disconnect from session', async () => {
      const mockUnlisten = vi.fn();
      mockListen.mockResolvedValue(mockUnlisten);

      const { result } = renderHook(() => useTerminal());

      await act(async () => {
        await result.current.connectToSession('session-123');
      });

      act(() => {
        result.current.disconnectFromSession('session-123');
      });

      expect(mockUnlisten).toHaveBeenCalled();
    });
  });

  describe('callbacks', () => {
    it('should call onOutput when output is received', async () => {
      let outputCallback: ((event: { payload: string }) => void) | undefined;
      mockListen.mockImplementation(
        (event: string, callback: (event: { payload: string }) => void) => {
          if (event.startsWith('terminal-output-')) {
            outputCallback = callback;
          }
          return Promise.resolve(() => {});
        },
      );

      const onOutput = vi.fn();
      const { result } = renderHook(() => useTerminal({ onOutput }));

      await act(async () => {
        await result.current.connectToSession('session-123');
      });

      expect(outputCallback).toBeDefined();

      act(() => {
        outputCallback?.({ payload: 'test output' });
      });

      expect(onOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-123',
          data: 'test output',
        }),
      );
    });
  });
});
