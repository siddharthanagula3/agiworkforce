import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api';
import { Button } from '../ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Loader2, Play } from 'lucide-react';
import { DemoResults } from './DemoResults';

interface AIEmployee {
  id: string;
  name: string;
  description: string;
  estimatedTimeSavedPerRun: number;
  estimatedCostSavedPerRun: number;
  demoDurationSeconds: number;
  matchScore: number;
}

interface DemoResult {
  employeeId: string;
  employeeName: string;
  taskDescription: string;
  inputSummary: string;
  outputSummary: string;
  actionsTaken: string[];
  timeSavedMinutes: number;
  costSavedUsd: number;
  qualityScore: number;
  completionTimeSeconds: number;
}

interface InstantDemoProps {
  employee: AIEmployee;
  sessionId?: string;
  onComplete?: (results: DemoResult) => void;
}

export const InstantDemo: React.FC<InstantDemoProps> = ({
  employee,
  sessionId,
  onComplete,
}) => {
  const [status, setStatus] = useState<'ready' | 'running' | 'completed'>('ready');
  const [results, setResults] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runDemo = async () => {
    setStatus('running');
    setError(null);

    try {
      const result = await invoke<DemoResult>('run_instant_demo', {
        employeeId: employee.id,
        userId: 'demo_user',
      });

      setResults(result);
      setStatus('completed');

      // Record demo results if session exists
      if (sessionId) {
        await invoke('record_demo_results', {
          sessionId,
          results: result,
        });
      }

      onComplete?.(result);
    } catch (err) {
      setError(err as string);
      setStatus('ready');
    }
  };

  if (status === 'running') {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center space-y-4 py-8">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
            <div className="text-center">
              <h3 className="text-lg font-semibold">Running Demo...</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Watch {employee.name} in action
              </p>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <p className="animate-pulse">Processing sample data...</p>
                <p className="text-xs">
                  Estimated time: {employee.demoDurationSeconds} seconds
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === 'completed' && results) {
    return <DemoResults results={results} />;
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">See {employee.name} in Action</CardTitle>
        <CardDescription>{employee.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-primary/10 rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Time Saved</div>
            <div className="text-2xl font-bold text-primary">
              {employee.estimatedTimeSavedPerRun} min
            </div>
          </div>
          <div className="bg-green-500/10 rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Cost Saved</div>
            <div className="text-2xl font-bold text-green-600">
              ${employee.estimatedCostSavedPerRun}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-semibold">What You'll See:</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>• Live processing of sample data</li>
            <li>• Real-time actions and decisions</li>
            <li>• Time and cost savings calculation</li>
            <li>• Quality metrics and accuracy</li>
          </ul>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <Button
          size="lg"
          className="w-full"
          onClick={runDemo}
          disabled={status === 'running'}
        >
          <Play className="mr-2 h-5 w-5" />
          Run 30-Second Demo →
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          No setup required • Uses sample data • Takes ~{employee.demoDurationSeconds}s
        </p>
      </CardContent>
    </Card>
  );
};
