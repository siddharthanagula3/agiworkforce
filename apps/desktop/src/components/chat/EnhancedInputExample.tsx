/**
 * EnhancedInput Usage Example
 *
 * This example demonstrates how to integrate the EnhancedInput component
 * into a chat interface to match Cursor Composer's UX.
 */

import { useCallback } from 'react';
import { EnhancedInput } from './EnhancedInput';
import { useChatStore } from '../../stores/chatStore';

export function ChatInterfaceWithEnhancedInput() {
  const { sendMessage, loading: isSending } = useChatStore();
  const activeConversationId = useChatStore((state) => state.activeConversationId);

  const handleSend = useCallback(
    (content: string, attachments: File[]) => {
      // Send message with attachments
      sendMessage(content, attachments, undefined, undefined, undefined);
    },
    [sendMessage],
  );

  return (
    <div className="flex h-screen flex-col">
      {/* Chat messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Messages would go here */}
      </div>

      {/* Enhanced input area */}
      <EnhancedInput
        onSend={handleSend}
        conversationId={activeConversationId}
        isSending={isSending}
        placeholder="Describe your task... (Shift+Enter for new line, Enter to submit)"
      />
    </div>
  );
}

/**
 * Features Included:
 *
 * 1. Auto-resizing Textarea
 *    - Minimum 3 lines (72px)
 *    - Maximum 20 lines (480px)
 *    - Automatically grows as user types
 *
 * 2. File Attachments
 *    - Drag and drop files
 *    - Click "Add files" button
 *    - Up to 10 files, 10MB each, 50MB total
 *    - File type icons and previews
 *    - Remove individual files
 *
 * 3. Slash Commands
 *    - Type "/" to trigger autocomplete
 *    - Arrow keys to navigate
 *    - Enter to select
 *    - Commands: /fix, /explain, /refactor, /document, /optimize, /test, /review
 *
 * 4. Keyboard Shortcuts
 *    - Enter: Send message
 *    - Shift+Enter: New line
 *    - Cmd/Ctrl+K: Clear input
 *    - Cmd/Ctrl+U: Upload file
 *    - Esc: Close command suggestions
 *
 * 5. Draft Persistence
 *    - Drafts are automatically saved per conversation
 *    - Drafts persist across sessions
 *    - Old drafts (7+ days) are cleaned up
 *
 * 6. Context Indicators
 *    - Shows active workspace path
 *    - Shows number of selected files
 *    - Shows number of open editors
 *
 * 7. Markdown Preview
 *    - Toggle preview with Eye/EyeOff button
 *    - Renders markdown in real-time
 *
 * 8. Image Paste
 *    - Paste images from clipboard
 *    - Automatically adds to attachments
 *
 * 9. Voice Recording (Placeholder)
 *    - Mic button to start/stop recording
 *    - Will be connected to voice commands later
 *
 * 10. Screenshot Capture (Placeholder)
 *     - Camera button to capture screenshots
 *     - Will be connected to screen capture later
 */

/**
 * State Management:
 *
 * The component uses two stores:
 * - inputStore: Manages drafts, attachments, and UI state
 * - chatStore: Handles message sending and conversation state
 *
 * Draft messages are persisted in localStorage and automatically
 * loaded when switching between conversations.
 */

/**
 * Tauri Commands:
 *
 * The following Tauri commands are available:
 *
 * 1. fs_read_file_content(file_path: string)
 *    - Reads file content with metadata
 *    - Returns: { content, size, line_count, language, excerpt }
 *    - Already registered in main.rs
 *
 * 2. fs_get_workspace_files(workspace_path: string)
 *    - Lists files in workspace directory
 *    - Returns: Array of { path, name, size, is_file, is_dir, extension, language }
 *    - Newly added and registered in main.rs
 */

/**
 * Integration Steps:
 *
 * 1. Replace existing InputComposer with EnhancedInput:
 *    ```tsx
 *    import { EnhancedInput } from './EnhancedInput';
 *
 *    <EnhancedInput
 *      onSend={handleSend}
 *      conversationId={activeConversationId}
 *      isSending={isSending}
 *    />
 *    ```
 *
 * 2. Update context metadata from workspace:
 *    ```tsx
 *    import { useInputStore } from '../../stores/inputStore';
 *
 *    const { updateContextMetadata } = useInputStore();
 *
 *    useEffect(() => {
 *      updateContextMetadata({
 *        workspacePath: '/path/to/workspace',
 *        selectedFilesCount: 3,
 *        openEditorsCount: 5,
 *      });
 *    }, [workspaceState]);
 *    ```
 *
 * 3. Connect voice recording (optional):
 *    - Implement voice recording in handleVoiceToggle
 *    - Use Web Audio API or native Tauri recording
 *    - Store recordings in inputStore.voiceRecordings
 *
 * 4. Connect screenshot capture (optional):
 *    - Already implemented in existing ScreenCaptureButton
 *    - Can be integrated by calling the capture function
 */
