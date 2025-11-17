// Updated Nov 16, 2025: Added accessible dialogs to replace window.confirm
import { useState } from 'react';
import { useBrowserStore } from '../../stores/browserStore';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { ScrollArea } from '../ui/ScrollArea';
import { Badge } from '../ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import {
  Circle,
  Square,
  Play,
  Trash2,
  Copy,
  Download,
  Edit,
  X,
  Check,
  Code,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '../ui/ConfirmDialog';

interface BrowserRecorderProps {
  className?: string;
}

export function BrowserRecorder({ className }: BrowserRecorderProps) {
  const {
    isRecording,
    recordedSteps,
    startRecording,
    stopRecording,
    clearRecording,
    generatePlaywrightCode,
  } = useBrowserStore();

  const [codeFormat, setCodeFormat] = useState<'playwright' | 'puppeteer' | 'selenium'>('playwright');
  const [editingStepId, setEditingStepId] = useState<string | null>(null);

  // Updated Nov 16, 2025: Use accessible dialogs
  const { confirm, dialog: confirmDialog } = useConfirm();

  const handleStartRecording = () => {
    startRecording();
    toast.success('Recording started');
  };

  const handleStopRecording = () => {
    stopRecording();
    toast.success('Recording stopped');
  };

  // Updated Nov 16, 2025: Use accessible ConfirmDialog instead of window.confirm
  const handleClearRecording = async () => {
    if (recordedSteps.length > 0) {
      const confirmed = await confirm({
        title: 'Clear recording?',
        description: 'Are you sure you want to clear all recorded steps? This action cannot be undone.',
        confirmText: 'Clear',
        variant: 'destructive',
      });

      if (confirmed) {
        clearRecording();
        toast.success('Recording cleared');
      }
    }
  };

  const copyCode = () => {
    const code = generateCode();
    navigator.clipboard.writeText(code);
    toast.success('Code copied to clipboard');
  };

  const downloadCode = () => {
    const code = generateCode();
    const ext = codeFormat === 'playwright' ? 'spec.ts' : 'js';
    const filename = `browser-automation.${ext}`;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Code downloaded');
  };

  const generateCode = () => {
    if (codeFormat === 'playwright') {
      return generatePlaywrightCode();
    } else if (codeFormat === 'puppeteer') {
      return generatePuppeteerCode();
    } else {
      return generateSeleniumCode();
    }
  };

  const generatePuppeteerCode = () => {
    let code = `const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

`;

    recordedSteps.forEach((step) => {
      switch (step.type) {
        case 'navigate':
          code += `  await page.goto('${step.value}');\n`;
          break;
        case 'click':
          code += `  await page.click('${step.selector}');\n`;
          break;
        case 'type':
          code += `  await page.type('${step.selector}', '${step.value}');\n`;
          break;
        case 'wait':
          code += `  await page.waitForSelector('${step.selector}');\n`;
          break;
        case 'screenshot':
          code += `  await page.screenshot({ path: 'screenshot.png' });\n`;
          break;
      }
    });

    code += `
  await browser.close();
})();
`;
    return code;
  };

  const generateSeleniumCode = () => {
    let code = `from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

driver = webdriver.Chrome()

try:
`;

    recordedSteps.forEach((step) => {
      switch (step.type) {
        case 'navigate':
          code += `    driver.get('${step.value}')\n`;
          break;
        case 'click':
          code += `    driver.find_element(By.CSS_SELECTOR, '${step.selector}').click()\n`;
          break;
        case 'type':
          code += `    driver.find_element(By.CSS_SELECTOR, '${step.selector}').send_keys('${step.value}')\n`;
          break;
        case 'wait':
          code += `    WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.CSS_SELECTOR, '${step.selector}')))\n`;
          break;
        case 'screenshot':
          code += `    driver.save_screenshot('screenshot.png')\n`;
          break;
      }
    });

    code += `finally:
    driver.quit()
`;
    return code;
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className={cn('flex flex-col h-full bg-background border border-border rounded-lg', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className={cn(
            'h-3 w-3 rounded-full',
            isRecording ? 'bg-red-600 animate-pulse' : 'bg-muted-foreground'
          )} />
          <span className="text-sm font-medium">
            {isRecording ? 'Recording...' : 'Recorder'}
          </span>
          {recordedSteps.length > 0 && (
            <Badge variant="secondary">{recordedSteps.length} steps</Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isRecording ? (
            <Button variant="destructive" size="sm" onClick={handleStopRecording}>
              <Square className="h-4 w-4 mr-1" />
              Stop
            </Button>
          ) : (
            <Button variant="default" size="sm" onClick={handleStartRecording}>
              <Circle className="h-4 w-4 mr-1" />
              Start Recording
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearRecording}
            disabled={recordedSteps.length === 0}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <Tabs defaultValue="steps" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="px-4">
          <TabsTrigger value="steps">
            <Play className="h-3 w-3 mr-1" />
            Steps
          </TabsTrigger>
          <TabsTrigger value="code">
            <Code className="h-3 w-3 mr-1" />
            Code
          </TabsTrigger>
        </TabsList>

        {/* Steps view */}
        <TabsContent value="steps" className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            {recordedSteps.length > 0 ? (
              <div className="divide-y divide-border">
                {recordedSteps.map((step, index) => (
                  <div
                    key={step.id}
                    className="px-4 py-3 hover:bg-muted/50"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        {index + 1}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs capitalize">
                            {step.type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(step.timestamp)}
                          </span>
                        </div>

                        {editingStepId === step.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              defaultValue={step.selector || step.value || ''}
                              className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background"
                              autoFocus
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingStepId(null)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingStepId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="text-sm">
                            {step.type === 'navigate' && (
                              <span className="font-mono text-xs">
                                Navigate to: {step.value}
                              </span>
                            )}
                            {step.type === 'click' && (
                              <span className="font-mono text-xs">
                                Click: {step.selector}
                              </span>
                            )}
                            {step.type === 'type' && (
                              <span className="font-mono text-xs">
                                Type "{step.value}" into {step.selector}
                              </span>
                            )}
                            {step.type === 'wait' && (
                              <span className="font-mono text-xs">
                                Wait for: {step.selector}
                              </span>
                            )}
                            {step.type === 'screenshot' && (
                              <span className="font-mono text-xs">
                                Take screenshot
                              </span>
                            )}
                            {step.type === 'execute' && (
                              <span className="font-mono text-xs">
                                Execute: {step.value}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingStepId(step.id)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center space-y-4">
                  <Circle className="h-16 w-16 mx-auto opacity-20" />
                  <div>
                    <div className="text-sm font-medium mb-1">No steps recorded</div>
                    <div className="text-xs">
                      {isRecording
                        ? 'Perform actions in the browser to record them'
                        : 'Click "Start Recording" to begin'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Code view */}
        <TabsContent value="code" className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border">
            <div className="flex items-center gap-1">
              {(['playwright', 'puppeteer', 'selenium'] as const).map((format) => (
                <Button
                  key={format}
                  variant={codeFormat === format ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setCodeFormat(format)}
                >
                  {format}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={copyCode}
                disabled={recordedSteps.length === 0}
              >
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={downloadCode}
                disabled={recordedSteps.length === 0}
              >
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 p-4">
            {recordedSteps.length > 0 ? (
              <pre className="text-xs font-mono bg-muted/5 p-4 rounded-lg overflow-x-auto border border-border">
                <code>{generateCode()}</code>
              </pre>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Code className="h-12 w-12 mx-auto opacity-20 mb-2" />
                  <div className="text-sm">No code generated yet</div>
                </div>
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Updated Nov 16, 2025: Render accessible dialogs */}
      {confirmDialog}
    </div>
  );
}
