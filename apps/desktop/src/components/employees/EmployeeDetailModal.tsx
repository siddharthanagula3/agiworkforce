/**
 * EmployeeDetailModal Component
 * Full detail view of an AI employee with tabs for different information
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/Dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ScrollArea } from '../ui/ScrollArea';
import {
  Shield,
  Clock,
  DollarSign,
  TrendingUp,
  Star,
  Plus,
  CheckCircle2,
  Play,
  Users,
  Briefcase,
  Code,
  Settings as SettingsIcon,
  User,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEmployeeStore } from '../../stores/employeeStore';

const ROLE_CONFIG: Record<
  string,
  { icon: LucideIcon; color: string; label: string }
> = {
  SupportAgent: { icon: Users, color: 'text-blue-500', label: 'Support' },
  SalesAgent: { icon: Briefcase, color: 'text-green-500', label: 'Sales' },
  Developer: { icon: Code, color: 'text-purple-500', label: 'Developer' },
  Operations: { icon: SettingsIcon, color: 'text-orange-500', label: 'Operations' },
  Personal: { icon: User, color: 'text-pink-500', label: 'Personal' },
};

function StatCard({ icon: Icon, label, value, subtext }: {
  icon: LucideIcon;
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-xs text-muted-foreground">{subtext}</div>
    </div>
  );
}

export function EmployeeDetailModal() {
  const { selectedEmployee, setSelectedEmployee, hireEmployee, runDemo, isDemoRunning } = useEmployeeStore();
  const [isHiring, setIsHiring] = useState(false);
  const [isRunningDemo, setIsRunningDemo] = useState(false);

  const employee = selectedEmployee;
  const isOpen = !!employee;

  if (!employee) return null;

  const roleConfig = ROLE_CONFIG[employee.role] ?? ROLE_CONFIG['Personal'];
  const RoleIcon = roleConfig!.icon;

  const handleClose = () => {
    setSelectedEmployee(null);
  };

  const handleHire = async () => {
    if (employee.is_hired) return;

    setIsHiring(true);
    try {
      await hireEmployee(employee.id, 'default-user');
    } catch (error) {
      console.error('Failed to hire employee:', error);
    } finally {
      setIsHiring(false);
    }
  };

  const handleRunDemo = async () => {
    setIsRunningDemo(true);
    try {
      await runDemo(employee.id);
    } catch (error) {
      console.error('Failed to run demo:', error);
    } finally {
      setIsRunningDemo(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <ScrollArea className="max-h-[90vh]">
          <div className="p-6">
            <DialogHeader>
              {/* Header with icon and title */}
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    'flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-2 ring-primary/10'
                  )}
                >
                  <RoleIcon className={cn('h-8 w-8', roleConfig!.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <DialogTitle className="text-2xl">{employee.name}</DialogTitle>
                    {employee.is_verified && (
                      <div title="Verified Employee">
                        <Shield className="h-6 w-6 text-primary fill-primary/20" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{roleConfig!.label}</Badge>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                      <span className="font-medium">{employee.avg_rating.toFixed(1)}</span>
                      <span>({employee.total_reviews} reviews)</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <TrendingUp className="h-4 w-4" />
                      <span>{employee.clone_count.toLocaleString()} teams</span>
                    </div>
                  </div>
                </div>
              </div>
            </DialogHeader>

            {/* Tabs */}
            <Tabs defaultValue="overview" className="mt-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
                <TabsTrigger value="reviews">Reviews</TabsTrigger>
                <TabsTrigger value="workflow">Demo Workflow</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6 mt-6">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Description</h3>
                  <p className="text-muted-foreground leading-relaxed">{employee.description}</p>
                </div>

                {/* Stats Grid */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Performance Metrics</h3>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <StatCard
                      icon={Clock}
                      label="Time Saved"
                      value={`${employee.estimated_time_saved_per_run} min`}
                      subtext="per run"
                    />
                    <StatCard
                      icon={DollarSign}
                      label="Cost Saved"
                      value={`$${employee.estimated_cost_saved_per_run}`}
                      subtext="per run"
                    />
                    <StatCard
                      icon={TrendingUp}
                      label="Success Rate"
                      value="98%"
                      subtext="completion rate"
                    />
                    <StatCard
                      icon={Star}
                      label="Quality Score"
                      value={employee.avg_rating.toFixed(1)}
                      subtext="out of 5.0"
                    />
                  </div>
                </div>

                {/* Monthly projection */}
                <div className="rounded-lg border bg-primary/5 p-6">
                  <h3 className="text-lg font-semibold mb-3">Monthly Value Projection</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <div className="text-3xl font-bold text-primary">
                        {employee.estimated_time_saved_per_run * 20} hours
                      </div>
                      <div className="text-sm text-muted-foreground">Time saved per month</div>
                      <div className="mt-1 text-xs text-muted-foreground">Based on 20 runs/month</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-primary">
                        ${employee.estimated_cost_saved_per_run * 20}
                      </div>
                      <div className="text-sm text-muted-foreground">Value generated per month</div>
                      <div className="mt-1 text-xs text-muted-foreground">At $50/hour labor cost</div>
                    </div>
                  </div>
                </div>

                {/* Demo video placeholder */}
                <div className="rounded-lg border bg-muted/30 aspect-video flex items-center justify-center">
                  <div className="text-center">
                    <Play className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Demo video coming soon</p>
                  </div>
                </div>
              </TabsContent>

              {/* Capabilities Tab */}
              <TabsContent value="capabilities" className="space-y-6 mt-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">All Capabilities</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {employee.capabilities.map((capability) => (
                      <div
                        key={capability}
                        className="flex items-center gap-2 rounded-lg border bg-card p-3"
                      >
                        <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm">{capability}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {employee.required_integrations && employee.required_integrations.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Required Integrations</h3>
                    <div className="space-y-2">
                      {employee.required_integrations.map((integration) => (
                        <div
                          key={integration}
                          className="flex items-center justify-between rounded-lg border bg-card p-3"
                        >
                          <span className="text-sm font-medium">{integration}</span>
                          <Badge variant="outline">Required</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-lg border bg-muted/30 p-4">
                  <h4 className="font-semibold mb-2">Setup Instructions</h4>
                  <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                    <li>Click "Hire" to add this employee to your team</li>
                    <li>Configure required integrations in Settings</li>
                    <li>Start using the employee from the My Employees page</li>
                    <li>Monitor performance and adjust settings as needed</li>
                  </ol>
                </div>
              </TabsContent>

              {/* Reviews Tab */}
              <TabsContent value="reviews" className="space-y-4 mt-6">
                <div className="rounded-lg border bg-card p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <div className="text-4xl font-bold">{employee.avg_rating.toFixed(1)}</div>
                      <div className="flex items-center gap-1 mt-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={cn(
                              'h-4 w-4',
                              i < Math.round(employee.avg_rating)
                                ? 'fill-yellow-500 text-yellow-500'
                                : 'text-muted-foreground'
                            )}
                          />
                        ))}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {employee.total_reviews} reviews
                      </div>
                    </div>
                    <div className="space-y-1 flex-1 max-w-sm">
                      {[5, 4, 3, 2, 1].map((stars) => (
                        <div key={stars} className="flex items-center gap-2 text-sm">
                          <span className="w-8">{stars}★</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{
                                width: `${stars === 5 ? 80 : stars === 4 ? 15 : 5}%`,
                              }}
                            />
                          </div>
                          <span className="w-8 text-muted-foreground text-xs">
                            {stars === 5 ? 80 : stars === 4 ? 15 : 5}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Recent Reviews</h3>
                  <p className="text-sm text-muted-foreground">
                    Reviews feature coming soon. Check back later to see what other teams are saying!
                  </p>
                </div>
              </TabsContent>

              {/* Workflow Tab */}
              <TabsContent value="workflow" className="space-y-6 mt-6">
                {employee.demo_workflow ? (
                  <>
                    <div>
                      <h3 className="text-lg font-semibold mb-2">{employee.demo_workflow.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        Estimated duration: {employee.demo_workflow.duration_seconds} seconds
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-3">Workflow Steps</h4>
                      <div className="space-y-2">
                        {employee.demo_workflow.steps.map((step, index) => (
                          <div
                            key={index}
                            className="flex items-start gap-3 rounded-lg border bg-card p-3"
                          >
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                              {index + 1}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium">{step.action}</div>
                              {step.description && (
                                <div className="text-sm text-muted-foreground mt-1">
                                  {step.description}
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground mt-1">
                                ~{Math.round(step.duration_ms / 1000)}s
                              </div>
                            </div>
                            <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="rounded-lg border bg-muted/30 p-4">
                        <h4 className="font-semibold mb-2">Sample Input</h4>
                        <p className="text-sm text-muted-foreground">
                          {employee.demo_workflow.sample_input}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-4">
                        <h4 className="font-semibold mb-2">Expected Output</h4>
                        <p className="text-sm text-muted-foreground">
                          {employee.demo_workflow.expected_output}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No demo workflow available</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t p-6">
          <div className="flex w-full gap-3">
            <Button variant="outline" onClick={handleClose} className="flex-1">
              Close
            </Button>
            <Button
              variant="outline"
              onClick={handleRunDemo}
              disabled={isRunningDemo || isDemoRunning}
              className="flex-1"
            >
              <Play className="mr-2 h-4 w-4" />
              {isRunningDemo ? 'Running...' : 'Try Demo'}
            </Button>
            {employee.is_hired ? (
              <Button variant="secondary" disabled className="flex-1">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Already Hired
              </Button>
            ) : (
              <Button onClick={handleHire} disabled={isHiring} className="flex-1">
                <Plus className="mr-2 h-4 w-4" />
                {isHiring ? 'Hiring...' : `Hire - $${employee.monthly_price}/mo`}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
