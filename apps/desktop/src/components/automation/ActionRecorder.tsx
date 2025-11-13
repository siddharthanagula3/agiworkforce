import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  Play,
  Square,
  Save,
  Trash2,
  Edit,
  Clock,
  MousePointer,
  Keyboard,
  Camera,
  Code,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Dialog } from '../ui/Dialog';
import { Badge } from '../ui/Badge';
import { ScrollArea } from '../ui/ScrollArea';
import * as api from '../../api/automation-enhanced';
import type { RecordedAction, Recording } from '../../types/automation-enhanced';

interface ActionRecorderProps {
  onSaveScript?: (scriptId: string) => void;
}

export function ActionRecorder({ onSaveScript }: ActionRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedActions, setRecordedActions] = useState<RecordedAction[]>([]);
  const [duration, setDuration] = useState(0);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [scriptName, setScriptName] = useState('');
  const [scriptDescription, setScriptDescription] = useState('');
  const [scriptTags, setScriptTags] = useState('');
  const [currentRecording, setCurrentRecording] = useState<Recording | null>(null);

  // Update duration every second while recording
  useEffect(() => {
    if (!isRecording) return;

    const interval = setInterval(() => {
      setDuration((prev) => prev + 1000);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording]);

  // Listen for recorded actions
  useEffect(() => {
    const unlisten = listen<RecordedAction>('automation:action_recorded', (event) => {
      setRecordedActions((prev) => [...prev, event.payload]);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleStartRecording = async () => {
    try {
      await api.startRecording();
      setIsRecording(true);
      setRecordedActions([]);
      setDuration(0);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const handleStopRecording = async () => {
    try {
      const recording = await api.stopRecording();
      setIsRecording(false);
      setCurrentRecording(recording);
      setShowSaveDialog(true);
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  const handleSaveAsScript = async () => {
    if (!currentRecording) return;

    try {
      const tags = scriptTags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const script = await api.saveRecordingAsScript(
        currentRecording,
        scriptName || 'Untitled Automation',
        scriptDescription,
        tags,
      );

      setShowSaveDialog(false);
      setScriptName('');
      setScriptDescription('');
      setScriptTags('');
      setCurrentRecording(null);
      setRecordedActions([]);

      if (onSaveScript) {
        onSaveScript(script.id);
      }
    } catch (error) {
      console.error('Failed to save script:', error);
    }
  };

  const handleDeleteAction = (actionId: string) => {
    setRecordedActions((prev) => prev.filter((a) => a.id !== actionId));
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'click':
      case 'right_click':
      case 'double_click':
        return <MousePointer className="h-4 w-4" />;
      case 'type':
      case 'hotkey':
        return <Keyboard className="h-4 w-4" />;
      case 'screenshot':
        return <Camera className="h-4 w-4" />;
      case 'wait':
        return <Clock className="h-4 w-4" />;
      default:
        return <Code className="h-4 w-4" />;
    }
  };

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'click':
      case 'right_click':
      case 'double_click':
        return 'bg-blue-500/10 text-blue-500';
      case 'type':
      case 'hotkey':
        return 'bg-green-500/10 text-green-500';
      case 'screenshot':
        return 'bg-purple-500/10 text-purple-500';
      case 'wait':
        return 'bg-yellow-500/10 text-yellow-500';
      default:
        return 'bg-gray-500/10 text-gray-500';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Action Recorder</h2>
          <p className="text-sm text-gray-500">Record and replay your desktop actions</p>
        </div>
        <div className="flex items-center gap-2">
          {isRecording && (
            <Badge variant="destructive" className="animate-pulse">
              Recording {formatDuration(duration)}
            </Badge>
          )}
          <Button
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            variant={isRecording ? 'destructive' : 'default'}
          >
            {isRecording ? (
              <>
                <Square className="mr-2 h-4 w-4" />
                Stop Recording
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Recording
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Actions List */}
      <Card>
        <ScrollArea className="h-[500px] p-4">
          {recordedActions.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-gray-500">
              <Play className="mb-4 h-12 w-12 opacity-50" />
              <p className="mb-2 text-lg font-medium">No actions recorded yet</p>
              <p className="text-sm">
                Click "Start Recording" and perform actions on your desktop
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recordedActions.map((action, index) => (
                <div
                  key={action.id}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-mono text-gray-500">{index + 1}</div>
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded ${getActionColor(action.actionType)}`}
                    >
                      {getActionIcon(action.actionType)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">
                          {action.actionType.replace('_', ' ')}
                        </span>
                        {action.value && (
                          <Badge variant="outline" className="max-w-xs truncate">
                            {action.value}
                          </Badge>
                        )}
                      </div>
                      {action.target && (
                        <div className="text-xs text-gray-500">
                          Position: ({action.target.x}, {action.target.y})
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {formatDuration(action.timestampMs)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteAction(action.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </Card>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <div className="space-y-4 p-6">
          <div>
            <h3 className="mb-2 text-lg font-semibold">Save Recording as Script</h3>
            <p className="text-sm text-gray-500">
              Give your automation a name and description
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="script-name" className="mb-1 block text-sm font-medium">
                Script Name
              </label>
              <Input
                id="script-name"
                value={scriptName}
                onChange={(e) => setScriptName(e.target.value)}
                placeholder="My Automation"
              />
            </div>

            <div>
              <label htmlFor="script-description" className="mb-1 block text-sm font-medium">
                Description (optional)
              </label>
              <Input
                id="script-description"
                value={scriptDescription}
                onChange={(e) => setScriptDescription(e.target.value)}
                placeholder="What does this automation do?"
              />
            </div>

            <div>
              <label htmlFor="script-tags" className="mb-1 block text-sm font-medium">
                Tags (comma-separated)
              </label>
              <Input
                id="script-tags"
                value={scriptTags}
                onChange={(e) => setScriptTags(e.target.value)}
                placeholder="work, daily, email"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAsScript}>
              <Save className="mr-2 h-4 w-4" />
              Save Script
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
