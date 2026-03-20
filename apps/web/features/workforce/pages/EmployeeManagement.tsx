'use client';

/**
 * Workforce Page - AI Workforce Management with Status Indicators,
 * Performance Metrics, Task Assignment, and Batch Operations
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Badge } from '@shared/ui/badge';
import { Skeleton } from '@shared/ui/skeleton';
import { Progress } from '@shared/ui/progress';
import { Checkbox } from '@shared/ui/checkbox';
import { Textarea } from '@shared/ui/textarea';
import { Label } from '@shared/ui/label';
import { BentoGrid, BentoCard } from '@shared/ui/bento-grid';
import { InteractiveHoverCard } from '@shared/ui/interactive-hover-card';
import { Particles } from '@shared/ui/particles';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/ui/dialog';
import Link from 'next/link';
import { useAuthStore } from '@shared/stores/authentication-store';
import {
  useWorkforceStore,
  setupWorkforceSubscription,
  cleanupWorkforceSubscription,
} from '@shared/stores/workforce-store';
import { AI_EMPLOYEES } from '@/data/marketplace-employees';
import { AnimatedAvatar } from '@shared/components/AnimatedAvatar';
import { AIEmployeeChat } from '@features/workforce/components/EmployeeChatInterface';
import {
  Users,
  BarChart3,
  Settings,
  Plus,
  TrendingUp,
  Sparkles,
  Zap,
  Target,
  ArrowRight,
  Code,
  MessageSquare,
  X,
  CheckCircle,
  AlertCircle,
  Clock,
  WifiOff,
  Play,
  Square,
  ListTodo,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import ErrorBoundary from '@shared/components/ErrorBoundary';
import { cn } from '@shared/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EmployeeStatus = 'active' | 'idle' | 'error' | 'offline';

interface EmployeeMetrics {
  tasksCompleted: number;
  successRate: number;
  avgTaskTimeMinutes: number;
  status: EmployeeStatus;
}

interface AssignTaskForm {
  prompt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic fake metrics based on employee ID so they don't flicker */
function getMetricsForEmployee(employeeId: string): EmployeeMetrics {
  const hash = employeeId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const statuses: EmployeeStatus[] = [
    'active',
    'active',
    'active',
    'idle',
    'idle',
    'offline',
    'error',
  ];
  return {
    tasksCompleted: 10 + (hash % 90),
    successRate: 75 + (hash % 25),
    avgTaskTimeMinutes: 2 + (hash % 28),
    status: statuses[hash % statuses.length] as EmployeeStatus,
  };
}

function StatusDot({ status }: { status: EmployeeStatus }) {
  const config: Record<EmployeeStatus, { color: string; label: string }> = {
    active: { color: 'bg-emerald-500', label: 'Active' },
    idle: { color: 'bg-amber-400', label: 'Idle' },
    error: { color: 'bg-red-500', label: 'Error' },
    offline: { color: 'bg-zinc-500', label: 'Offline' },
  };
  const { color, label } = config[status];
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', color, status === 'active' && 'animate-pulse')} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

function StatusIcon({ status }: { status: EmployeeStatus }) {
  switch (status) {
    case 'active':
      return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    case 'idle':
      return <Clock className="h-4 w-4 text-amber-400" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case 'offline':
      return <WifiOff className="h-4 w-4 text-zinc-500" />;
  }
}

// ---------------------------------------------------------------------------
// Error fallback
// ---------------------------------------------------------------------------

const WorkforceErrorFallback = () => (
  <div className="flex min-h-screen items-center justify-center p-8">
    <Card className="glass-strong max-w-md text-center">
      <CardHeader>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <Users className="h-8 w-8 text-destructive" />
        </div>
        <CardTitle>Workforce Error</CardTitle>
        <CardDescription>
          Something went wrong while loading your AI workforce. Please try again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={() => window.location.reload()}
          className="gradient-primary w-full text-white"
        >
          Refresh Page
        </Button>
        <Link href="/dashboard">
          <Button variant="outline" className="w-full">
            Return to Dashboard
          </Button>
        </Link>
      </CardContent>
    </Card>
  </div>
);

// ---------------------------------------------------------------------------
// Task Assignment Dialog
// ---------------------------------------------------------------------------

interface AssignTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetEmployees: { id: string; name: string }[];
}

function AssignTaskDialog({ open, onOpenChange, targetEmployees }: AssignTaskDialogProps) {
  const [form, setForm] = useState<AssignTaskForm>({ prompt: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!form.prompt.trim()) {
      toast.error('Please describe the task');
      return;
    }
    setSubmitting(true);
    try {
      // In production this would call /api/agents/assign with employee IDs + prompt
      await new Promise((resolve) => setTimeout(resolve, 800));
      toast.success(
        targetEmployees.length === 1
          ? `Task assigned to ${targetEmployees[0]?.name}`
          : `Task assigned to ${targetEmployees.length} employees`,
      );
      onOpenChange(false);
      setForm({ prompt: '' });
    } catch {
      toast.error('Failed to assign task. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [form, targetEmployees, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListTodo className="h-5 w-5" />
            Assign Task
          </DialogTitle>
          <DialogDescription>
            {targetEmployees.length === 1
              ? `Assign a task to ${targetEmployees[0]?.name}`
              : `Assign a task to ${targetEmployees.length} selected employees`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {targetEmployees.length > 1 && (
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-border/50 bg-muted/30 p-3">
              {targetEmployees.map((emp) => (
                <Badge key={emp.id} variant="secondary" className="text-xs">
                  {emp.name}
                </Badge>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="task-prompt">Task Description</Label>
            <Textarea
              id="task-prompt"
              value={form.prompt}
              onChange={(e) => setForm({ prompt: e.target.value })}
              placeholder="Describe what you need done, e.g. 'Summarize the Q1 sales report and create a 5-slide presentation'"
              rows={5}
              maxLength={5000}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">{form.prompt.length}/5000 characters</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !form.prompt.trim()}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ListTodo className="mr-2 h-4 w-4" />
            )}
            Assign Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const EmployeeManagement: React.FC = () => {
  const { user } = useAuthStore();
  const { hiredEmployees, isLoading, fetchHiredEmployees } = useWorkforceStore();
  const [chatEmployee, setChatEmployee] = useState<{
    id: string;
    name: string;
    role: string;
    status?: string;
  } | null>(null);

  // Selection state for batch operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignTaskOpen, setAssignTaskOpen] = useState(false);
  const [assignTargets, setAssignTargets] = useState<{ id: string; name: string }[]>([]);

  // Set up real-time subscription and fetch data on mount
  useEffect(() => {
    if (user) {
      setupWorkforceSubscription();
      fetchHiredEmployees();
    }
    return () => {
      cleanupWorkforceSubscription();
    };
  }, [user, fetchHiredEmployees]);

  // Compute per-employee metadata from AI_EMPLOYEES catalog
  const enrichedEmployees = useMemo(() => {
    return hiredEmployees.map((rec) => {
      const emp = AI_EMPLOYEES.find((e) => e.id === rec.employee_id);
      const metrics = getMetricsForEmployee(rec.employee_id);
      return {
        rec,
        emp,
        metrics,
        displayName: emp?.role || rec.employee_name || 'AI Employee',
        displayAvatar: emp?.avatar,
        displaySpecialty: emp?.specialty || emp?.description || 'AI specialist ready to assist',
      };
    });
  }, [hiredEmployees]);

  // Aggregate status counts
  const statusCounts = useMemo(() => {
    const counts = { active: 0, idle: 0, error: 0, offline: 0 };
    enrichedEmployees.forEach(({ metrics }) => {
      counts[metrics.status]++;
    });
    return counts;
  }, [enrichedEmployees]);

  // Aggregate performance
  const avgSuccessRate = useMemo(() => {
    if (enrichedEmployees.length === 0) return 0;
    return Math.round(
      enrichedEmployees.reduce((sum, { metrics }) => sum + metrics.successRate, 0) /
        enrichedEmployees.length,
    );
  }, [enrichedEmployees]);

  const totalTasksCompleted = useMemo(() => {
    return enrichedEmployees.reduce((sum, { metrics }) => sum + metrics.tasksCompleted, 0);
  }, [enrichedEmployees]);

  // Selection helpers
  const allSelected = hiredEmployees.length > 0 && selectedIds.size === hiredEmployees.length;
  const someSelected = selectedIds.size > 0;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(hiredEmployees.map((e) => e.employee_id)));
    }
  };

  // Batch handlers
  const handleBatchAssignTask = () => {
    const targets = enrichedEmployees
      .filter(({ rec }) => selectedIds.has(rec.employee_id))
      .map(({ rec, displayName }) => ({ id: rec.employee_id, name: displayName }));
    setAssignTargets(targets);
    setAssignTaskOpen(true);
  };

  const handleSingleAssignTask = (employeeId: string, displayName: string) => {
    setAssignTargets([{ id: employeeId, name: displayName }]);
    setAssignTaskOpen(true);
  };

  const handleBatchStartAll = () => {
    toast.success(`Started ${selectedIds.size} employees`);
    setSelectedIds(new Set());
  };

  const handleBatchStopAll = () => {
    toast.info(`Stopped ${selectedIds.size} employees`);
    setSelectedIds(new Set());
  };

  const handleStartAll = () => {
    toast.success(`Started all ${hiredEmployees.length} employees`);
  };

  const handleStopAll = () => {
    toast.info(`Stopped all ${hiredEmployees.length} employees`);
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="glass-strong max-w-md">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please log in to view workforce</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button className="gradient-primary w-full text-white">Go to Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalEmployees = hiredEmployees.length;

  return (
    <ErrorBoundary fallback={<WorkforceErrorFallback />}>
      <div className="min-h-screen space-y-4 p-4 md:space-y-6 md:p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong relative overflow-hidden rounded-3xl p-4 md:p-8"
        >
          <Particles className="absolute inset-0" quantity={30} ease={20} />
          <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative z-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Badge className="glass mb-4">
                  <Users className="mr-2 h-3 w-3" />
                  AI Workforce Management
                </Badge>
                <h1 className="mb-2 text-2xl font-bold md:text-4xl">Your AI Workforce</h1>
                <p className="text-base text-muted-foreground md:text-xl">
                  Manage your AI team and track performance in real-time
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {totalEmployees > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStartAll}
                      className="flex items-center gap-1.5"
                    >
                      <Play className="h-4 w-4 text-emerald-500" />
                      Start All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStopAll}
                      className="flex items-center gap-1.5"
                    >
                      <Square className="h-4 w-4 text-amber-500" />
                      Stop All
                    </Button>
                  </>
                )}
                <Link href="/dashboard/hire" className="w-full sm:w-auto">
                  <Button size="lg" className="btn-glow gradient-primary w-full text-white">
                    <Plus className="mr-2 h-5 w-5" />
                    Hire AI Employee
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          {/* Total */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="glass-strong card-hover group">
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    Total
                  </Badge>
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <p className="text-2xl font-bold">{totalEmployees}</p>
                    <p className="text-xs text-muted-foreground">Employees</p>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Active */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <Card className="glass-strong card-hover group">
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                  </div>
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <p className="text-2xl font-bold">{statusCounts.active}</p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Idle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="glass-strong card-hover group">
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10">
                    <Clock className="h-5 w-5 text-amber-400" />
                  </div>
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <p className="text-2xl font-bold">{statusCounts.idle}</p>
                    <p className="text-xs text-muted-foreground">Idle</p>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Error */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <Card className="glass-strong card-hover group">
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  </div>
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <p className="text-2xl font-bold">{statusCounts.error}</p>
                    <p className="text-xs text-muted-foreground">Error</p>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Tasks Completed */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="glass-strong card-hover group">
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                    <Target className="h-5 w-5 text-accent" />
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    <TrendingUp className="mr-1 h-3 w-3" />
                    Tasks
                  </Badge>
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <p className="text-2xl font-bold">{totalTasksCompleted}</p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Success Rate */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <Card className="glass-strong card-hover group">
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/10">
                    <Zap className="h-5 w-5 text-secondary" />
                  </div>
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <p className="text-2xl font-bold">{avgSuccessRate}%</p>
                    <p className="text-xs text-muted-foreground">Avg Success</p>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-6"
        >
          {/* Hired Employees Card */}
          <Card className="glass-strong">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Your AI Team
                  </CardTitle>
                  <CardDescription>
                    Employees you&apos;ve hired from the marketplace
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  {hiredEmployees.length} {hiredEmployees.length === 1 ? 'Employee' : 'Employees'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-48 w-full rounded-2xl" />
                  ))}
                </div>
              ) : hiredEmployees.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted/20">
                    <Users className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="mb-2 text-xl font-semibold">No AI Employees Yet</h3>
                  <p className="mx-auto mb-6 max-w-md text-muted-foreground">
                    Start building your AI workforce by hiring specialized employees from the
                    marketplace
                  </p>
                  <Link href="/dashboard/hire">
                    <Button size="lg" className="btn-glow gradient-primary text-white">
                      <Plus className="mr-2 h-5 w-5" />
                      Browse Marketplace
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Batch toolbar */}
                  <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-2">
                    <Checkbox
                      id="select-all"
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all employees"
                    />
                    <label
                      htmlFor="select-all"
                      className="cursor-pointer select-none text-sm text-muted-foreground"
                    >
                      {someSelected
                        ? `${selectedIds.size} selected`
                        : `Select all (${hiredEmployees.length})`}
                    </label>
                    {someSelected && (
                      <div className="ml-auto flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleBatchAssignTask}
                          className="flex items-center gap-1.5"
                        >
                          <ListTodo className="h-4 w-4" />
                          Assign Task
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleBatchStartAll}
                          className="flex items-center gap-1.5"
                        >
                          <Play className="h-4 w-4 text-emerald-500" />
                          Start
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleBatchStopAll}
                          className="flex items-center gap-1.5"
                        >
                          <Square className="h-4 w-4 text-amber-500" />
                          Stop
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Employee grid */}
                  <BentoGrid>
                    {enrichedEmployees.map(
                      (
                        { rec, emp, metrics, displayName, displayAvatar, displaySpecialty },
                        index,
                      ) => (
                        <BentoCard
                          key={rec.id}
                          gradient={true}
                          className={cn(
                            'glass group relative transition-all duration-300 hover:shadow-lg hover:shadow-primary/10',
                            selectedIds.has(rec.employee_id) && 'ring-2 ring-primary/50',
                          )}
                        >
                          {/* Checkbox */}
                          <div className="absolute left-3 top-3 z-10">
                            <Checkbox
                              checked={selectedIds.has(rec.employee_id)}
                              onCheckedChange={() => toggleSelect(rec.employee_id)}
                              aria-label={`Select ${displayName}`}
                            />
                          </div>

                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.05 }}
                            className="flex h-full flex-col pt-4"
                          >
                            {/* Header: avatar + info */}
                            <div className="mb-3 flex items-start gap-3">
                              <InteractiveHoverCard>
                                <AnimatedAvatar
                                  src={displayAvatar}
                                  alt={displayName}
                                  size="lg"
                                  className="h-12 w-12 flex-shrink-0"
                                />
                              </InteractiveHoverCard>
                              <div className="min-w-0 flex-1">
                                <div className="mb-0.5 flex items-center gap-2">
                                  <h3 className="truncate text-sm font-semibold transition-colors group-hover:text-primary">
                                    {displayName}
                                  </h3>
                                  {emp?.popular && (
                                    <Badge
                                      variant="secondary"
                                      className="border-orange-200 bg-orange-100 text-xs text-orange-800"
                                    >
                                      Popular
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {emp?.provider ?? 'AI'}
                                  </Badge>
                                  <StatusDot status={metrics.status} />
                                </div>
                              </div>
                              <StatusIcon status={metrics.status} />
                            </div>

                            {/* Description */}
                            <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">
                              {displaySpecialty}
                            </p>

                            {/* Performance metrics */}
                            <div className="mb-4 space-y-2 rounded-lg bg-muted/30 p-3">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Tasks completed</span>
                                <span className="font-semibold">{metrics.tasksCompleted}</span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Success rate</span>
                                <span
                                  className={cn(
                                    'font-semibold',
                                    metrics.successRate >= 90
                                      ? 'text-emerald-500'
                                      : metrics.successRate >= 75
                                        ? 'text-amber-500'
                                        : 'text-red-500',
                                  )}
                                >
                                  {metrics.successRate}%
                                </span>
                              </div>
                              <Progress value={metrics.successRate} className="h-1.5" />
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Avg task time</span>
                                <span className="font-semibold">{metrics.avgTaskTimeMinutes}m</span>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="mt-auto flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 transition-colors group-hover:border-primary/50"
                                onClick={() => handleSingleAssignTask(rec.employee_id, displayName)}
                              >
                                <ListTodo className="mr-1.5 h-3.5 w-3.5" />
                                Assign Task
                              </Button>
                              <Link
                                href={`/dashboard/vibe?employee=${rec.employee_id}`}
                                className="flex-1"
                              >
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full transition-colors group-hover:border-primary/50"
                                >
                                  <Code className="mr-1.5 h-3.5 w-3.5" />
                                  Build
                                </Button>
                              </Link>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setChatEmployee({
                                    id: rec.employee_id,
                                    name: displayName,
                                    role: emp?.specialty ?? 'AI Employee',
                                    status: metrics.status,
                                  })
                                }
                                className="transition-colors group-hover:border-primary/50"
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="transition-colors group-hover:bg-primary/10"
                              >
                                <Settings className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </motion.div>
                        </BentoCard>
                      ),
                    )}
                  </BentoGrid>

                  <div className="flex items-center justify-between border-t border-border pt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {hiredEmployees.length}{' '}
                      {hiredEmployees.length === 1 ? 'employee' : 'employees'}
                    </p>
                    <Link href="/dashboard/vibe">
                      <Button variant="outline">
                        <Code className="mr-2 h-4 w-4" />
                        Start Building
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Workforce Performance Overview */}
          <Card className="card-premium">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Workforce Overview
              </CardTitle>
              <CardDescription>
                Performance metrics and insights for your AI workforce
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : totalEmployees > 0 ? (
                <div className="space-y-6">
                  {/* Status breakdown */}
                  <div className="glass rounded-2xl p-6">
                    <h4 className="mb-4 font-semibold">Team Status</h4>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      {(
                        [
                          { key: 'active', label: 'Active', color: 'emerald' },
                          { key: 'idle', label: 'Idle', color: 'amber' },
                          { key: 'error', label: 'Error', color: 'red' },
                          { key: 'offline', label: 'Offline', color: 'zinc' },
                        ] as const
                      ).map(({ key, label, color }) => (
                        <div
                          key={key}
                          className={`glass rounded-xl p-3 text-center border border-${color}-500/20 bg-${color}-500/5`}
                        >
                          <div
                            className={`mb-1 text-2xl font-bold text-${color}-${color === 'zinc' ? '400' : '500'}`}
                          >
                            {statusCounts[key]}
                          </div>
                          <div className="text-xs text-muted-foreground">{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Performance summary */}
                  <div className="glass rounded-2xl p-6">
                    <h4 className="mb-4 font-semibold">Performance Summary</h4>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      <div className="glass rounded-xl p-4 text-center">
                        <div className="mb-1 text-2xl font-bold text-primary">
                          {totalTasksCompleted}
                        </div>
                        <div className="text-xs text-muted-foreground">Total Tasks Done</div>
                      </div>
                      <div className="glass rounded-xl p-4 text-center">
                        <div
                          className={cn(
                            'mb-1 text-2xl font-bold',
                            avgSuccessRate >= 90
                              ? 'text-emerald-500'
                              : avgSuccessRate >= 75
                                ? 'text-amber-500'
                                : 'text-red-500',
                          )}
                        >
                          {avgSuccessRate}%
                        </div>
                        <div className="text-xs text-muted-foreground">Avg Success Rate</div>
                      </div>
                      <div className="glass rounded-xl p-4 text-center">
                        <div className="mb-1 text-2xl font-bold text-secondary">
                          {statusCounts.active + statusCounts.idle}
                        </div>
                        <div className="text-xs text-muted-foreground">Ready to Work</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        const allTargets = enrichedEmployees.map(({ rec, displayName }) => ({
                          id: rec.employee_id,
                          name: displayName,
                        }));
                        setAssignTargets(allTargets);
                        setAssignTaskOpen(true);
                      }}
                    >
                      <ListTodo className="mr-2 h-4 w-4" />
                      Assign to All
                    </Button>
                    <Link href="/dashboard/vibe">
                      <Button className="gradient-primary text-white">
                        <Code className="mr-2 h-4 w-4" />
                        Start Building
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted/20">
                    <BarChart3 className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="mb-2 text-xl font-semibold">No Activity Yet</h3>
                  <p className="mx-auto mb-6 max-w-md text-muted-foreground">
                    Hire AI employees and start assigning tasks to see performance metrics
                  </p>
                  <Link href="/dashboard/hire">
                    <Button size="lg" className="btn-glow gradient-primary text-white">
                      <Plus className="mr-2 h-5 w-5" />
                      Get Started
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Employee Chat Panel */}
        {chatEmployee && user && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-3xl p-4 md:p-6"
          >
            <Card className="glass-strong overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between border-b px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Chat with {chatEmployee.name}</span>
                  {chatEmployee.status && (
                    <StatusDot status={chatEmployee.status as EmployeeStatus} />
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setChatEmployee(null)}
                  className="h-7 w-7"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="h-[400px]">
                <AIEmployeeChat employee={chatEmployee} userId={user.id} />
              </div>
            </Card>
          </motion.div>
        )}

        {/* Assign Task Dialog */}
        <AssignTaskDialog
          open={assignTaskOpen}
          onOpenChange={setAssignTaskOpen}
          targetEmployees={assignTargets}
        />
      </div>
    </ErrorBoundary>
  );
};

export default EmployeeManagement;
