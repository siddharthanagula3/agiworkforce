import { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@shared/ui/textarea';
import { Badge } from '@/shared/components/ui/badge';
import { Plus, Send, Mic, MicOff, Users, User, Loader2, Paperclip } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useFileOperations } from '@/hooks/useFileOperations';

interface ChatInputProps {
  onSubmit: (message: string) => void;
  selectedEmployees: string[];
  availableEmployees: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  onSelectEmployee: (employeeId: string) => void;
  onDeselectEmployee: (employeeId: string) => void;
  isStreaming?: boolean;
  onStop?: () => void;
  placeholder?: string;
  /** Fires when the input transitions between empty and non-empty (debounced 500ms on clear). */
  onTypingChange?: (isTyping: boolean) => void;
}

export function ChatInput({
  onSubmit,
  selectedEmployees,
  availableEmployees,
  onSelectEmployee,
  onDeselectEmployee,
  isStreaming = false,
  onStop,
  placeholder = 'Ask anything',
  onTypingChange,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showEmployeeSelector, setShowEmployeeSelector] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<
    Array<{ name: string; path: string; size: number }>
  >([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasTypingRef = useRef(false);

  const { loading: fileLoading } = useFileOperations();

  // Track empty <-> non-empty transitions with 500ms debounce on clearing
  useEffect(() => {
    const hasContent = message.trim().length > 0;

    if (hasContent && !wasTypingRef.current) {
      // Immediately signal typing start
      wasTypingRef.current = true;
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      onTypingChange?.(true);
    } else if (!hasContent && wasTypingRef.current) {
      // Debounce the "stopped typing" signal by 500ms
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      typingTimerRef.current = setTimeout(() => {
        wasTypingRef.current = false;
        onTypingChange?.(false);
        typingTimerRef.current = null;
      }, 500);
    }
  }, [message, onTypingChange]);

  // Cleanup timer on unmount
  useEffect(() => {
    const timer = typingTimerRef;
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      setAttachedFiles((prev) => [
        ...prev,
        {
          name: file.name,
          path: file.name,
          size: file.size,
        },
      ]);
    }
    // Reset input so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const removeAttachedFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = () => {
    if (message.trim() && !isStreaming) {
      onSubmit(message.trim());
      setMessage('');
      setAttachedFiles([]);
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleEmployeeToggle = (employeeId: string) => {
    if (selectedEmployees.includes(employeeId)) {
      onDeselectEmployee(employeeId);
    } else {
      onSelectEmployee(employeeId);
    }
  };

  const selectedEmployeeNames = availableEmployees
    .filter((emp) => selectedEmployees.includes(emp.id))
    .map((emp) => emp.name);

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-3 shadow-sm">
      {/* Employee Selection */}
      {selectedEmployees.length > 0 && (
        <div className="mb-3 flex items-center space-x-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Working with:</span>
          {selectedEmployeeNames.map((name) => (
            <Badge key={`employee-${name}`} variant="secondary" className="text-xs">
              {name}
            </Badge>
          ))}
        </div>
      )}

      {/* Attached files */}
      {attachedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachedFiles.map((file, idx) => (
            <Badge key={`file-${idx}`} variant="secondary" className="text-xs gap-1 pr-1">
              <Paperclip className="h-3 w-3" />
              {file.name}
              <button
                onClick={() => removeAttachedFile(idx)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <span className="sr-only">Remove</span>
                &times;
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="flex items-end gap-2">
        {/* Left Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted"
            onClick={() => fileInputRef.current?.click()}
            disabled={fileLoading}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          <Button
            variant="ghost"
            size="sm"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted"
            onClick={() => setShowEmployeeSelector(!showEmployeeSelector)}
          >
            <Users className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'rounded-md p-2 hover:bg-muted',
              isRecording ? 'text-red-500' : 'text-muted-foreground',
            )}
            onClick={() => setIsRecording(!isRecording)}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
        </div>

        {/* Main Input */}
        <div className="relative flex-1">
          <Textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            disabled={isStreaming}
            rows={1}
            className={cn(
              'max-h-40 min-h-[44px] resize-y rounded-xl bg-background pr-16 ring-1 ring-border focus-visible:ring-2',
              isStreaming && 'cursor-not-allowed opacity-50',
            )}
          />

          {/* Send Button */}
          {isStreaming ? (
            <Button
              onClick={onStop}
              size="sm"
              variant="secondary"
              className="absolute right-2 top-1/2 h-8 -translate-y-1/2 transform rounded-md px-2"
            >
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Stop
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!message.trim()}
              size="sm"
              className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 transform rounded-md p-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted"
          >
            <User className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Employee Selector Dropdown */}
      {showEmployeeSelector && (
        <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3">
          <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Select AI Employees
          </div>
          <div className="flex flex-wrap gap-2">
            {availableEmployees.map((employee) => (
              <Button
                key={employee.id}
                variant={selectedEmployees.includes(employee.id) ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleEmployeeToggle(employee.id)}
                className="text-xs"
              >
                {employee.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Status Messages */}
      {isStreaming && (
        <div className="mt-2 flex items-center text-xs text-gray-500 dark:text-gray-400">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          AI Employees are working...
        </div>
      )}

      {isRecording && (
        <div className="mt-2 flex items-center text-xs text-red-500">
          <Mic className="mr-1 h-3 w-3" />
          Recording... Click to stop
        </div>
      )}
    </div>
  );
}
