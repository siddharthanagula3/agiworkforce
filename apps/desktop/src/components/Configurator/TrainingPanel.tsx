import { ChevronDown, GraduationCap, Plus, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Label } from '../ui/Label';
import { Textarea } from '../ui/Textarea';
import { Badge } from '../ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/Collapsible';
import { cn } from '../../lib/utils';
import { useConfiguratorStore } from '../../stores/configuratorStore';

export function TrainingPanel() {
  const trainingOpen = useConfiguratorStore((state) => state.trainingPanelOpen);
  const setTrainingOpen = useConfiguratorStore((state) => state.setTrainingPanelOpen);
  const trainingExamples = useConfiguratorStore((state) => state.trainingExamples);
  const addTrainingExample = useConfiguratorStore((state) => state.addTrainingExample);
  const updateTrainingExample = useConfiguratorStore((state) => state.updateTrainingExample);
  const deleteTrainingExample = useConfiguratorStore((state) => state.deleteTrainingExample);

  const handleAddExample = () => {
    addTrainingExample('', '');
  };

  return (
    <Collapsible open={trainingOpen} onOpenChange={setTrainingOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between border-t p-3 transition-colors hover:bg-muted/50">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4" />
          <span className="font-semibold">Training Examples</span>
          <Badge variant="secondary">{trainingExamples.length}</Badge>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', trainingOpen && 'rotate-180')}
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t">
        <div className="space-y-4 p-4" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {/* Add Example Button */}
          <Button variant="outline" className="w-full" onClick={handleAddExample}>
            <Plus className="mr-2 h-4 w-4" />
            Add Training Example
          </Button>

          {/* Training Examples Info */}
          {trainingExamples.length === 0 && (
            <div className="rounded-md bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                No training examples yet. Add examples to help improve your AI employee&apos;s
                performance.
              </p>
            </div>
          )}

          {/* Example List */}
          {trainingExamples.map((example, index) => (
            <Card key={example.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Example {index + 1}</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteTrainingExample(example.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Input</Label>
                  <Textarea
                    value={example.input}
                    onChange={(e) => updateTrainingExample(example.id, 'input', e.target.value)}
                    placeholder="What the user might ask or provide..."
                    rows={2}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Expected Output</Label>
                  <Textarea
                    value={example.expectedOutput}
                    onChange={(e) =>
                      updateTrainingExample(example.id, 'expectedOutput', e.target.value)
                    }
                    placeholder="What the employee should produce..."
                    rows={2}
                    className="text-sm"
                  />
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Training Tips */}
          {trainingExamples.length > 0 && (
            <div className="rounded-md bg-blue-50 p-3">
              <p className="text-xs font-medium text-blue-900">Training Tips</p>
              <ul className="mt-2 space-y-1 text-xs text-blue-700">
                <li>• Add 3-5 examples for basic training</li>
                <li>• Include edge cases and variations</li>
                <li>• Keep examples relevant to your workflow</li>
                <li>• Test after adding new examples</li>
              </ul>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
