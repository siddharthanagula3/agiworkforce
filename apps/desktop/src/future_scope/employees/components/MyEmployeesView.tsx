/**
 * MyEmployeesView Component
 * Dashboard for managing hired employees
 */

import {
  Calendar,
  Clock,
  DollarSign,
  LayoutGrid,
  LayoutList,
  Play,
  Settings as SettingsIcon,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/AlertDialog';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../../../components/ui/Card';
import { ScrollArea } from '../../../components/ui/ScrollArea';
import type { AIEmployee } from '../../../types/employees';
import { useEmployeeStore } from '../employeeStore';

type ViewMode = 'grid' | 'list';

function formatLastUsed(timestamp?: number): string {
  if (!timestamp) return 'Never used';

  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

interface EmployeeItemProps {
  employee: AIEmployee;
  viewMode: ViewMode;
  onFire: (employee: AIEmployee) => void;
}

function EmployeeGridItem({ employee, onFire }: Omit<EmployeeItemProps, 'viewMode'>) {
  const { employeeStats, runDemo } = useEmployeeStore();
  const stats = employeeStats.get(employee.id);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg">{employee.name}</CardTitle>
          <Badge variant="secondary">{employee.role}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pb-3">
        <p className="text-sm text-muted-foreground line-clamp-2">{employee.description}</p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t">
          <div>
            <div className="text-xs text-muted-foreground mb-1">This Month</div>
            <div className="flex items-center gap-1">
              <Play className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-semibold">{stats?.total_runs || 0} runs</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Saved</div>
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-semibold">{stats?.total_time_saved_minutes || 0}min</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Value</div>
            <div className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-semibold">${stats?.total_cost_saved_usd || 0}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Last Used</div>
            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">{formatLastUsed(stats?.last_run_at)}</span>
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="gap-2 pt-3 border-t">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => runDemo(employee.id)}>
          <Play className="mr-2 h-4 w-4" />
          Run
        </Button>
        <Button variant="outline" size="sm" className="flex-1">
          <SettingsIcon className="mr-2 h-4 w-4" />
          Configure
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => onFire(employee)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}

function EmployeeListItem({ employee, onFire }: Omit<EmployeeItemProps, 'viewMode'>) {
  const { employeeStats, runDemo } = useEmployeeStore();
  const stats = employeeStats.get(employee.id);

  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card p-4 hover:shadow-md transition-shadow">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-semibold text-lg">{employee.name}</h3>
          <Badge variant="secondary">{employee.role}</Badge>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-1">{employee.description}</p>
      </div>

      <div className="flex items-center gap-6 shrink-0">
        <div className="text-center">
          <div className="text-2xl font-bold">{stats?.total_runs || 0}</div>
          <div className="text-xs text-muted-foreground">Runs</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{stats?.total_time_saved_minutes || 0}m</div>
          <div className="text-xs text-muted-foreground">Saved</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">${stats?.total_cost_saved_usd || 0}</div>
          <div className="text-xs text-muted-foreground">Value</div>
        </div>
        <div className="text-center min-w-[80px]">
          <div className="text-sm font-medium">{formatLastUsed(stats?.last_run_at)}</div>
          <div className="text-xs text-muted-foreground">Last used</div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={() => runDemo(employee.id)}>
          <Play className="mr-2 h-4 w-4" />
          Run
        </Button>
        <Button variant="outline" size="sm">
          <SettingsIcon className="mr-2 h-4 w-4" />
          Configure
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => onFire(employee)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function MyEmployeesView() {
  const { myEmployees, fireEmployee } = useEmployeeStore();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [employeeToFire, setEmployeeToFire] = useState<AIEmployee | null>(null);

  const handleConfirmFire = async () => {
    if (!employeeToFire) return;

    try {
      await fireEmployee(employeeToFire.id, 'default-user');
      setEmployeeToFire(null);
    } catch (error) {
      console.error('Failed to fire employee:', error);
    }
  };

  if (myEmployees.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="mb-4 flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-primary/10">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <h3 className="mb-2 text-lg font-semibold">No employees hired yet</h3>
          <p className="mb-6 text-sm text-muted-foreground">
            Browse the employee library to find the perfect AI employees for your team.
          </p>
          <Button>
            <Users className="mr-2 h-4 w-4" />
            Browse Employee Library
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border/60 bg-background/95 backdrop-blur-sm px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">My Employees</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {myEmployees.length} {myEmployees.length === 1 ? 'employee' : 'employees'} hired
            </p>
          </div>

          {/* View mode toggle */}
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <LayoutList className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {myEmployees.reduce((sum, e) => {
                      const stats = useEmployeeStore.getState().employeeStats.get(e.id);
                      return sum + (stats?.total_runs || 0);
                    }, 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Runs</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {Math.round(
                      myEmployees.reduce((sum, e) => {
                        const stats = useEmployeeStore.getState().employeeStats.get(e.id);
                        return sum + (stats?.total_time_saved_minutes || 0);
                      }, 0) / 60,
                    )}
                    h
                  </div>
                  <div className="text-xs text-muted-foreground">Time Saved</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    $
                    {myEmployees.reduce((sum, e) => {
                      const stats = useEmployeeStore.getState().employeeStats.get(e.id);
                      return sum + (stats?.total_cost_saved_usd || 0);
                    }, 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">Value Generated</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{myEmployees.length}</div>
                  <div className="text-xs text-muted-foreground">Active Employees</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Employees list */}
      <ScrollArea className="flex-1 p-6">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {myEmployees.map((employee) => (
              <EmployeeGridItem key={employee.id} employee={employee} onFire={setEmployeeToFire} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {myEmployees.map((employee) => (
              <EmployeeListItem key={employee.id} employee={employee} onFire={setEmployeeToFire} />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Confirmation dialog */}
      <AlertDialog open={!!employeeToFire} onOpenChange={() => setEmployeeToFire(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fire {employeeToFire?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {employeeToFire?.name} from your team. You can always hire them again
              later from the employee library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmFire}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Fire Employee
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
