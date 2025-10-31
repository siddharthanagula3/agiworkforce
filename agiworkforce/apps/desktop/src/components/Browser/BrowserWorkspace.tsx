import { useState, useEffect } from 'react';
import { useBrowserStore } from '../../stores/browserStore';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Globe,
  Plus,
  X,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Camera,
  Code,
  Mouse,
  Keyboard,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';

export function BrowserWorkspace({ className }: { className?: string }) {
  const {
    sessions,
    activeSessionId,
    initialized,
    initialize,
    launchBrowser,
    openTab,
    closeTab,
    navigateTab,
    clickElement,
    typeText,
    screenshot,
    getPageContent,
    executeScript,
  } = useBrowserStore();

  const [urlInput, setUrlInput] = useState('https://example.com');
  const [selectorInput, setSelectorInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [scriptInput, setScriptInput] = useState('');
  const [pageContent, setPageContent] = useState('');
  const [screenshotData, setScreenshotData] = useState('');

  useEffect(() => {
    if (!initialized) {
      initialize().catch((error) => {
        console.error('Failed to initialize browser:', error);
        toast.error('Failed to initialize browser automation');
      });
    }
  }, [initialized, initialize]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeTab = activeSession?.tabs.find((t) => t.active);

  const handleLaunchBrowser = async (browserType: string, headless: boolean) => {
    try {
      await launchBrowser(browserType, headless);
      toast.success(`${browserType} browser launched`);
    } catch (error) {
      toast.error(`Failed to launch ${browserType}`);
    }
  };

  const handleOpenTab = async () => {
    if (!urlInput.trim()) {
      toast.error('Please enter a URL');
      return;
    }

    try {
      await openTab(urlInput);
      toast.success('Tab opened');
    } catch (error) {
      toast.error('Failed to open tab');
    }
  };

  const handleNavigate = async () => {
    if (!activeTab || !urlInput.trim()) return;

    try {
      await navigateTab(activeTab.id, urlInput);
      toast.success('Navigated to ' + urlInput);
    } catch (error) {
      toast.error('Failed to navigate');
    }
  };

  const handleClick = async () => {
    if (!activeTab || !selectorInput.trim()) {
      toast.error('Please enter a CSS selector');
      return;
    }

    try {
      await clickElement(activeTab.id, selectorInput);
      toast.success('Clicked element: ' + selectorInput);
    } catch (error) {
      toast.error('Failed to click element');
    }
  };

  const handleType = async () => {
    if (!activeTab || !selectorInput.trim() || !textInput.trim()) {
      toast.error('Please enter selector and text');
      return;
    }

    try {
      await typeText(activeTab.id, selectorInput, textInput);
      toast.success('Typed text into ' + selectorInput);
    } catch (error) {
      toast.error('Failed to type text');
    }
  };

  const handleScreenshot = async () => {
    if (!activeTab) return;

    try {
      const data = await screenshot(activeTab.id);
      setScreenshotData(data);
      toast.success('Screenshot captured');
    } catch (error) {
      toast.error('Failed to capture screenshot');
    }
  };

  const handleGetContent = async () => {
    if (!activeTab) return;

    try {
      const content = await getPageContent(activeTab.id);
      setPageContent(content);
      toast.success('Page content retrieved');
    } catch (error) {
      toast.error('Failed to get page content');
    }
  };

  const handleExecuteScript = async () => {
    if (!activeTab || !scriptInput.trim()) {
      toast.error('Please enter a script');
      return;
    }

    try {
      const result = await executeScript(activeTab.id, scriptInput);
      toast.success('Script executed: ' + JSON.stringify(result));
    } catch (error) {
      toast.error('Failed to execute script');
    }
  };

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/10">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Browser Automation</span>
          {sessions.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({sessions.length} browser{sessions.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="default" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Launch Browser
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleLaunchBrowser('Chromium', false)}>
                Chromium (Headed)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleLaunchBrowser('Chromium', true)}>
                Chromium (Headless)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleLaunchBrowser('Firefox', false)}>
                Firefox (Headed)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleLaunchBrowser('Firefox', true)}>
                Firefox (Headless)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Content */}
      {activeSession ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* URL Bar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Button variant="ghost" size="sm" disabled>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" disabled>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleNavigate}>
              <RotateCw className="h-4 w-4" />
            </Button>

            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNavigate()}
              placeholder="Enter URL..."
              className="flex-1"
            />

            <Button variant="default" size="sm" onClick={handleOpenTab}>
              Go
            </Button>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="controls" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="px-3">
              <TabsTrigger value="controls">
                <Mouse className="h-3 w-3 mr-1" />
                Controls
              </TabsTrigger>
              <TabsTrigger value="content">
                <Eye className="h-3 w-3 mr-1" />
                Content
              </TabsTrigger>
              <TabsTrigger value="screenshot">
                <Camera className="h-3 w-3 mr-1" />
                Screenshot
              </TabsTrigger>
              <TabsTrigger value="script">
                <Code className="h-3 w-3 mr-1" />
                Script
              </TabsTrigger>
            </TabsList>

            <TabsContent value="controls" className="flex-1 overflow-auto p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">CSS Selector</label>
                <Input
                  value={selectorInput}
                  onChange={(e) => setSelectorInput(e.target.value)}
                  placeholder="e.g., #submit-button"
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleClick}>
                  <Mouse className="h-4 w-4 mr-2" />
                  Click Element
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Text to Type</label>
                <Input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Enter text..."
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleType}>
                  <Keyboard className="h-4 w-4 mr-2" />
                  Type Text
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="content" className="flex-1 overflow-auto p-4">
              <Button onClick={handleGetContent} className="mb-4">
                <Eye className="h-4 w-4 mr-2" />
                Get Page Content
              </Button>

              <div className="border border-border rounded-lg p-4 bg-muted/5 overflow-auto max-h-96">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {pageContent || 'Page content will appear here...'}
                </pre>
              </div>
            </TabsContent>

            <TabsContent value="screenshot" className="flex-1 overflow-auto p-4">
              <Button onClick={handleScreenshot} className="mb-4">
                <Camera className="h-4 w-4 mr-2" />
                Capture Screenshot
              </Button>

              {screenshotData && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <img
                    src={`data:image/png;base64,${screenshotData}`}
                    alt="Screenshot"
                    className="w-full"
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="script" className="flex-1 overflow-auto p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">JavaScript Code</label>
                <textarea
                  value={scriptInput}
                  onChange={(e) => setScriptInput(e.target.value)}
                  placeholder="document.title"
                  className="w-full h-32 p-2 border border-border rounded-md bg-background font-mono text-sm"
                />
              </div>

              <Button onClick={handleExecuteScript}>
                <Code className="h-4 w-4 mr-2" />
                Execute Script
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center space-y-4">
            <Globe className="h-16 w-16 mx-auto opacity-20" />
            <div>
              <p className="text-lg font-medium mb-2">No Browser Session</p>
              <p className="text-sm">Launch a browser to get started</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
