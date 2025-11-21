import React, { useState } from 'react';
import { useTerminalStore, type ShellTypeLiteral } from '../../stores/terminalStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Loader2, Sparkles, AlertTriangle, CheckCircle, Code } from 'lucide-react';

interface TerminalAIAssistantProps {
  sessionId: string;
  shellType: ShellTypeLiteral;
  cwd?: string;
  onCommandSelect?: (command: string) => void;
}

export const TerminalAIAssistant: React.FC<TerminalAIAssistantProps> = ({
  sessionId,
  shellType,
  cwd,
  onCommandSelect,
}) => {
  const [intent, setIntent] = useState('');
  const [suggestedCommand, setSuggestedCommand] = useState<string | null>(null);
  const [improvements, setImprovements] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const terminalStore = useTerminalStore();

  const handleSuggestCommand = async () => {
    if (!intent.trim()) {
      setError('Please enter what you want to do');
      return;
    }

    setLoading(true);
    setError(null);
    setSuggestedCommand(null);
    setImprovements(null);

    try {
      const command = await terminalStore.aiSuggestCommand(intent, shellType, cwd);
      setSuggestedCommand(command);

      // Automatically check for improvements
      const improvementSuggestions = await terminalStore.aiSuggestImprovements(command, shellType);
      if (improvementSuggestions) {
        setImprovements(improvementSuggestions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate command');
      console.error('AI command suggestion failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteCommand = () => {
    if (suggestedCommand && onCommandSelect) {
      onCommandSelect(suggestedCommand);
      // Clear the form after execution
      setIntent('');
      setSuggestedCommand(null);
      setImprovements(null);
    }
  };

  const handleSmartCommit = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await terminalStore.smartCommit(sessionId);
      setSuggestedCommand(null);
      setImprovements(null);
      setIntent('');
      // Show success message
      alert(`Smart commit successful!\n\n${result}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smart commit failed');
      console.error('Smart commit failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading) {
      handleSuggestCommand();
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          AI Assistant
        </CardTitle>
        <CardDescription>
          Get command suggestions, error explanations, and smart git commits
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Command Suggestion */}
        <div className="space-y-2">
          <label htmlFor="intent" className="text-sm font-medium">
            What do you want to do?
          </label>
          <div className="flex gap-2">
            <Input
              id="intent"
              type="text"
              placeholder="e.g., find all large files over 100MB"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
              className="flex-1"
            />
            <Button onClick={handleSuggestCommand} disabled={loading || !intent.trim()}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Suggest
                </>
              )}
            </Button>
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{shellType}</Badge>
            {cwd && <Badge variant="outline">{cwd}</Badge>}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Suggested Command */}
        {suggestedCommand && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Code className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">Suggested Command:</span>
            </div>
            <div className="relative">
              <pre className="p-3 bg-muted rounded-md overflow-x-auto text-sm">
                <code>{suggestedCommand}</code>
              </pre>
              <div className="flex gap-2 mt-2">
                <Button onClick={handleExecuteCommand} size="sm" className="flex-1">
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Execute
                </Button>
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(suggestedCommand);
                    alert('Command copied to clipboard!');
                  }}
                  size="sm"
                  variant="outline"
                >
                  Copy
                </Button>
                <Button
                  onClick={() => {
                    setSuggestedCommand(null);
                    setImprovements(null);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Security/Improvement Warnings */}
        {improvements && (
          <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-yellow-900 dark:text-yellow-100 mb-1">
                Improvement Suggestions:
              </p>
              <div className="text-yellow-800 dark:text-yellow-200 whitespace-pre-wrap">
                {improvements}
              </div>
            </div>
          </div>
        )}

        {/* Git Smart Commit */}
        <div className="pt-4 border-t">
          <Button
            onClick={handleSmartCommit}
            disabled={loading}
            variant="outline"
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Committing...
              </>
            ) : (
              <>
                <Code className="mr-2 h-4 w-4" />
                Smart Commit (AI-generated message)
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Analyzes staged changes and generates a semantic commit message
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
