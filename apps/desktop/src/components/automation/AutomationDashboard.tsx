import { useEffect, useState } from 'react';
import {
  Play,
  Trash2,
  Code,
  Download,
  Search,
  Filter,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Dialog } from '../ui/Dialog';
import { Select } from '../ui/Select';
import * as api from '../../api/automation-enhanced';
import type {
  AutomationScript,
  CodeLanguage,
  ExecutionResult,
} from '../../types/automation-enhanced';

export function AutomationDashboard() {
  const [scripts, setScripts] = useState<AutomationScript[]>([]);
  const [filteredScripts, setFilteredScripts] = useState<AutomationScript[]>([]);
  const [selectedScript, setSelectedScript] = useState<AutomationScript | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [showCodeDialog, setShowCodeDialog] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [codeLanguage, setCodeLanguage] = useState<CodeLanguage>('python');

  // Load scripts on mount
  useEffect(() => {
    loadScripts();
  }, []);

  // Filter scripts when search/tag changes
  useEffect(() => {
    let filtered = scripts;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (script) =>
          script.name.toLowerCase().includes(query) ||
          script.description.toLowerCase().includes(query),
      );
    }

    if (tagFilter) {
      filtered = filtered.filter((script) => script.tags.includes(tagFilter));
    }

    setFilteredScripts(filtered);
  }, [scripts, searchQuery, tagFilter]);

  const loadScripts = async () => {
    setLoading(true);
    try {
      const loadedScripts = await api.listScripts();
      setScripts(loadedScripts);
      setFilteredScripts(loadedScripts);
    } catch (error) {
      console.error('Failed to load scripts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteScript = async (script: AutomationScript) => {
    setExecuting(true);
    setSelectedScript(script);
    setExecutionResult(null);

    try {
      const result = await api.executeScript(script);
      setExecutionResult(result);
    } catch (error) {
      console.error('Failed to execute script:', error);
      setExecutionResult({
        success: false,
        actionsCompleted: 0,
        actionsFailed: 0,
        durationMs: 0,
        error: String(error),
        screenshots: [],
        logs: [],
      });
    } finally {
      setExecuting(false);
    }
  };

  const handleDeleteScript = async (scriptId: string) => {
    if (!confirm('Are you sure you want to delete this automation?')) return;

    try {
      await api.deleteScript(scriptId);
      await loadScripts();
    } catch (error) {
      console.error('Failed to delete script:', error);
    }
  };

  const handleGenerateCode = async (script: AutomationScript, language: CodeLanguage) => {
    try {
      const result = await api.generateCode(script, language);
      setGeneratedCode(result.code);
      setCodeLanguage(language);
      setSelectedScript(script);
      setShowCodeDialog(true);
    } catch (error) {
      console.error('Failed to generate code:', error);
    }
  };

  const handleDownloadCode = () => {
    const extension = {
      python: 'py',
      rust: 'rs',
      javascript: 'js',
      typescript: 'ts',
    }[codeLanguage];

    const blob = new Blob([generatedCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedScript?.name.replace(/\s+/g, '_')}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const allTags = Array.from(new Set(scripts.flatMap((script) => script.tags)));

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Automation Library</h2>
          <p className="text-sm text-gray-500">{scripts.length} saved automations</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search automations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {allTags.length > 0 && (
          <Select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
            <option value="">All Tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </Select>
        )}
      </div>

      {/* Scripts Grid */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-gray-500">Loading automations...</div>
        </div>
      ) : filteredScripts.length === 0 ? (
        <Card className="flex h-64 flex-col items-center justify-center text-center">
          <Filter className="mb-4 h-12 w-12 text-gray-400" />
          <p className="mb-2 text-lg font-medium text-gray-700">No automations found</p>
          <p className="text-sm text-gray-500">
            {searchQuery || tagFilter
              ? 'Try adjusting your filters'
              : 'Record your first automation to get started'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredScripts.map((script) => (
            <Card key={script.id} className="flex flex-col p-4">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{script.name}</h3>
                  <p className="text-sm text-gray-500 line-clamp-2">{script.description}</p>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap gap-1">
                {script.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>

              <div className="mb-3 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {script.actions.length} actions
                </div>
                <div>Created: {formatDate(script.createdAt)}</div>
                {script.lastRunAt && <div>Last run: {formatDate(script.lastRunAt)}</div>}
              </div>

              <div className="mt-auto flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleExecuteScript(script)}
                  disabled={executing}
                  className="flex-1"
                >
                  <Play className="mr-1 h-3 w-3" />
                  Run
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleGenerateCode(script, 'python')}
                >
                  <Code className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDeleteScript(script.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Execution Result Dialog */}
      {executionResult && (
        <Dialog open={!!executionResult} onOpenChange={() => setExecutionResult(null)}>
          <div className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              {executionResult.success ? (
                <CheckCircle className="h-8 w-8 text-green-500" />
              ) : (
                <XCircle className="h-8 w-8 text-red-500" />
              )}
              <div>
                <h3 className="text-lg font-semibold">
                  {executionResult.success ? 'Execution Successful' : 'Execution Failed'}
                </h3>
                <p className="text-sm text-gray-500">
                  Completed in {(executionResult.durationMs / 1000).toFixed(2)}s
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Actions completed:</span>
                <span className="font-medium">{executionResult.actionsCompleted}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Actions failed:</span>
                <span className="font-medium">{executionResult.actionsFailed}</span>
              </div>
            </div>

            {executionResult.error && (
              <div className="rounded-lg bg-red-50 p-3">
                <p className="text-sm font-medium text-red-800">Error:</p>
                <p className="text-sm text-red-600">{executionResult.error}</p>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={() => setExecutionResult(null)}>Close</Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Code Generation Dialog */}
      <Dialog open={showCodeDialog} onOpenChange={setShowCodeDialog}>
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Generated Code</h3>
            <div className="flex gap-2">
              <Select
                value={codeLanguage}
                onChange={(e) => {
                  setCodeLanguage(e.target.value as CodeLanguage);
                  if (selectedScript) {
                    handleGenerateCode(selectedScript, e.target.value as CodeLanguage);
                  }
                }}
              >
                <option value="python">Python</option>
                <option value="rust">Rust</option>
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
              </Select>
              <Button size="sm" onClick={handleDownloadCode}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          </div>

          <pre className="max-h-96 overflow-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100">
            <code>{generatedCode}</code>
          </pre>

          <div className="flex justify-end">
            <Button onClick={() => setShowCodeDialog(false)}>Close</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
