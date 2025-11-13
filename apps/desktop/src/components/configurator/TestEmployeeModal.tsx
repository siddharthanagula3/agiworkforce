import * as React from 'react';
import { Play, Loader2, CheckCircle, XCircle, Clock, TrendingUp, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Label } from '../ui/Label';
import { Textarea } from '../ui/Textarea';
import { Alert, AlertDescription, AlertTitle } from '../ui/Alert';
import { Badge } from '../ui/Badge';
import { useConfiguratorStore } from '../../stores/configuratorStore';

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
}

function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <div className="flex-shrink-0 text-muted-foreground">{icon}</div>
      <div className="flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </div>
  );
}

export function TestEmployeeModal() {
  const [testInput, setTestInput] = React.useState('');

  const testModalOpen = useConfiguratorStore((state) => state.testModalOpen);
  const setTestModalOpen = useConfiguratorStore((state) => state.setTestModalOpen);
  const isTestRunning = useConfiguratorStore((state) => state.isTestRunning);
  const testResult = useConfiguratorStore((state) => state.testResult);
  const testEmployee = useConfiguratorStore((state) => state.testEmployee);
  const clearTestResult = useConfiguratorStore((state) => state.clearTestResult);

  const handleRunTest = async () => {
    if (!testInput.trim()) {
      alert('Please enter test input');
      return;
    }

    try {
      await testEmployee(testInput);
    } catch (error) {
      console.error('Test failed:', error);
    }
  };

  const handleClose = () => {
    setTestModalOpen(false);
    clearTestResult();
    setTestInput('');
  };

  const handleRunAnother = () => {
    clearTestResult();
    setTestInput('');
  };

  return (
    <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Test Employee</DialogTitle>
          <DialogDescription>
            Run a test to validate your employee&apos;s workflow and configuration
          </DialogDescription>
        </DialogHeader>

        {!isTestRunning && !testResult ? (
          // Input form
          <>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="test-input">Test Input</Label>
                <Textarea
                  id="test-input"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  placeholder="Enter sample data or scenario to test..."
                  rows={8}
                />
                <p className="text-xs text-muted-foreground">
                  Provide realistic input that your employee would process in production
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleRunTest} disabled={!testInput.trim()}>
                <Play className="mr-2 h-4 w-4" />
                Run Test
              </Button>
            </DialogFooter>
          </>
        ) : isTestRunning ? (
          // Running state
          <div className="py-8 text-center">
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-blue-500" />
            <p className="text-lg font-semibold">Running test...</p>
            <p className="text-sm text-muted-foreground">Processing your input</p>
          </div>
        ) : testResult ? (
          // Results
          <>
            <div className="space-y-4 py-4">
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <>
                    <CheckCircle className="h-6 w-6 text-green-500" />
                    <span className="text-lg font-semibold">Test Passed</span>
                    <Badge variant="default" className="bg-green-500">
                      Success
                    </Badge>
                  </>
                ) : (
                  <>
                    <XCircle className="h-6 w-6 text-red-500" />
                    <span className="text-lg font-semibold">Test Failed</span>
                    <Badge variant="destructive">Failed</Badge>
                  </>
                )}
              </div>

              {/* Output */}
              <div className="space-y-2">
                <Label>Output</Label>
                <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-sm">
                  {testResult.output || '(No output)'}
                </pre>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <StatCard
                  label="Execution Time"
                  value={`${testResult.executionTimeMs}ms`}
                  icon={<Clock className="h-4 w-4" />}
                />
                <StatCard
                  label="Quality Score"
                  value={`${(testResult.qualityScore * 100).toFixed(0)}%`}
                  icon={<TrendingUp className="h-4 w-4" />}
                />
              </div>

              {/* Steps Executed */}
              {testResult.stepsExecuted > 0 && (
                <div className="rounded-md bg-blue-50 p-3">
                  <p className="text-sm text-blue-900">
                    Successfully executed {testResult.stepsExecuted} workflow steps
                  </p>
                </div>
              )}

              {/* Errors */}
              {testResult.errors && testResult.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Errors</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc space-y-1 pl-4">
                      {testResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Warnings */}
              {testResult.warnings && testResult.warnings.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Warnings</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc space-y-1 pl-4">
                      {testResult.warnings.map((warn, i) => (
                        <li key={i}>{warn}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Success Tips */}
              {testResult.success && (
                <div className="rounded-md bg-green-50 p-3">
                  <p className="text-sm font-medium text-green-900">Next Steps</p>
                  <ul className="mt-2 space-y-1 text-xs text-green-700">
                    <li>• Test with more varied inputs</li>
                    <li>• Add training examples if needed</li>
                    <li>• Save your employee when ready</li>
                    <li>• Publish to marketplace to share with others</li>
                  </ul>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={handleRunAnother}>Run Another Test</Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
