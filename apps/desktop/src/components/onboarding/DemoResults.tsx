import React from 'react';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import {
  CheckCircle,
  Clock,
  DollarSign,
  TrendingUp,
  ArrowRight,
  Check,
} from 'lucide-react';

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

interface DemoResultsProps {
  results: DemoResult;
  onHire?: () => void;
  onTryAnother?: () => void;
}

export const DemoResults: React.FC<DemoResultsProps> = ({
  results,
  onHire,
  onTryAnother,
}) => {
  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 py-8 px-4">
      {/* Success Header with Animation */}
      <Card className="border-green-500/50 bg-gradient-to-br from-green-500/10 to-green-500/5 shadow-xl">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="animate-bounce">
              <CheckCircle className="h-24 w-24 text-green-500" />
            </div>
            <div>
              <h2 className="text-4xl font-bold mb-2">Amazing! 🎉</h2>
              <h3 className="text-2xl font-semibold text-green-600 dark:text-green-400">
                Demo Complete!
              </h3>
              <p className="text-muted-foreground mt-3 text-lg">
                {results.employeeName} successfully completed the task in just{' '}
                <span className="font-bold text-foreground">{results.completionTimeSeconds} seconds</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Grid */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-2">
              <Clock className="h-8 w-8 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{results.timeSavedMinutes} min</div>
                <div className="text-xs text-muted-foreground">Time Saved</div>
              </div>
              <div className="text-xs text-muted-foreground">vs manual work</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-2">
              <DollarSign className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold">${results.costSavedUsd}</div>
                <div className="text-xs text-muted-foreground">Cost Saved</div>
              </div>
              <div className="text-xs text-muted-foreground">based on $30/hr</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-2">
              <TrendingUp className="h-8 w-8 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">
                  {(results.qualityScore * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-muted-foreground">Quality Score</div>
              </div>
              <div className="text-xs text-muted-foreground">accuracy rate</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Before & After */}
      <Card>
        <CardHeader>
          <CardTitle>Transformation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-muted-foreground">
                Input
              </div>
              <p className="text-sm">{results.inputSummary}</p>
            </div>

            <ArrowRight className="h-6 w-6 text-muted-foreground" />

            <div className="space-y-2">
              <div className="text-sm font-semibold text-muted-foreground">
                Output
              </div>
              <p className="text-sm font-semibold">{results.outputSummary}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions Taken */}
      <Card>
        <CardHeader>
          <CardTitle>What {results.employeeName} Did</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {results.actionsTaken.map((action, i) => (
              <li key={i} className="flex items-start gap-3">
                <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm">{action}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* ROI Calculation */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              If you run this automation daily...
            </p>
            <div className="text-3xl font-bold text-primary">
              {(results.timeSavedMinutes * 30).toLocaleString()} minutes/month
            </div>
            <div className="text-xl font-semibold text-green-600">
              ${(results.costSavedUsd * 30).toFixed(2)} saved/month
            </div>
            <p className="text-xs text-muted-foreground">
              = {Math.floor((results.timeSavedMinutes * 30) / 60)} hours of your time back
            </p>
          </div>
        </CardContent>
      </Card>

      {/* CTA Buttons */}
      <div className="space-y-4">
        <Button
          size="lg"
          className="w-full text-lg h-14 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
          onClick={onHire}
        >
          <CheckCircle className="mr-2 h-5 w-5" />
          Continue to Setup
        </Button>

        <Button
          size="lg"
          variant="outline"
          className="w-full text-lg h-12"
          onClick={onTryAnother}
        >
          Try Another Demo
        </Button>
      </div>

      <div className="text-center space-y-2">
        <p className="text-xs text-muted-foreground">
          14-day free trial • No credit card required • Cancel anytime
        </p>
        <p className="text-xs text-muted-foreground">
          🔒 Your data stays on your device • 100% privacy guaranteed
        </p>
      </div>
    </div>
  );
};
