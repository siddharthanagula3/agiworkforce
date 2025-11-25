/**
 * EmployeeCard Component
 * Beautiful card displaying an AI employee with actions
 */

import type { LucideIcon } from 'lucide-react';
import {
  Briefcase,
  CheckCircle2,
  Clock,
  Code,
  DollarSign,
  Play,
  Plus,
  Settings as SettingsIcon,
  Shield,
  Star,
  TrendingUp,
  User,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../../../components/ui/Card';
import { cn } from '../../../lib/utils';
import type { AIEmployee } from '../../../types/employees';
import { useEmployeeStore } from '../employeeStore';

interface EmployeeCardProps {
  employee: AIEmployee;
  userId?: string;
  onViewDetails?: (employee: AIEmployee) => void;
}

const ROLE_CONFIG: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  SupportAgent: { icon: Users, color: 'text-blue-500', label: 'Support' },
  SalesAgent: { icon: Briefcase, color: 'text-green-500', label: 'Sales' },
  Developer: { icon: Code, color: 'text-purple-500', label: 'Developer' },
  Operations: { icon: SettingsIcon, color: 'text-orange-500', label: 'Operations' },
  Personal: { icon: User, color: 'text-pink-500', label: 'Personal' },
};

function StatItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold">{value}</span>
      </div>
    </div>
  );
}

export function EmployeeCard({
  employee,
  userId = 'default-user',
  onViewDetails,
}: EmployeeCardProps) {
  const { hireEmployee, runDemo, setSelectedEmployee, isDemoRunning } = useEmployeeStore();
  const [isHiring, setIsHiring] = useState(false);
  const [isRunningDemo, setIsRunningDemo] = useState(false);

  const roleConfig = ROLE_CONFIG[employee.role] ?? ROLE_CONFIG['Personal'];
  const RoleIcon = roleConfig!.icon;

  const handleHire = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (employee.is_hired) return;

    setIsHiring(true);
    try {
      await hireEmployee(employee.id, userId);
    } catch (error) {
      console.error('Failed to hire employee:', error);
    } finally {
      setIsHiring(false);
    }
  };

  const handleRunDemo = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRunningDemo(true);
    try {
      await runDemo(employee.id);
    } catch (error) {
      console.error('Failed to run demo:', error);
    } finally {
      setIsRunningDemo(false);
    }
  };

  const handleCardClick = () => {
    setSelectedEmployee(employee);
    onViewDetails?.(employee);
  };

  return (
    <Card
      className="group relative cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] overflow-hidden"
      onClick={handleCardClick}
    >
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      <CardHeader className="relative pb-3">
        <div className="flex items-start justify-between gap-3">
          {/* Icon and name */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-2 ring-primary/10',
              )}
            >
              <RoleIcon className={cn('h-6 w-6', roleConfig!.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg truncate">{employee.name}</CardTitle>
              <Badge variant="secondary" className="mt-1">
                {roleConfig!.label}
              </Badge>
            </div>
          </div>

          {/* Verified badge */}
          {employee.is_verified && (
            <div className="shrink-0" title="Verified Employee">
              <Shield className="h-5 w-5 text-primary fill-primary/20" />
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="relative space-y-3 pb-3">
        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
          {employee.description}
        </p>

        {/* Capabilities pills */}
        <div className="flex flex-wrap gap-1">
          {employee.capabilities.slice(0, 3).map((capability) => (
            <Badge key={capability} variant="outline" className="text-xs px-2 py-0">
              {capability}
            </Badge>
          ))}
          {employee.capabilities.length > 3 && (
            <Badge variant="outline" className="text-xs px-2 py-0">
              +{employee.capabilities.length - 3} more
            </Badge>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/50">
          <StatItem
            icon={Clock}
            label="Saves"
            value={`${employee.estimated_time_saved_per_run}min`}
          />
          <StatItem
            icon={DollarSign}
            label="Value"
            value={`$${employee.estimated_cost_saved_per_run}`}
          />
        </div>

        {/* Rating and popularity */}
        <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
            <span className="font-medium">{employee.avg_rating.toFixed(1)}</span>
            <span>({employee.total_reviews})</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            <span>{employee.clone_count.toLocaleString()} teams</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="relative gap-2 pt-3 border-t border-border/50">
        {employee.is_hired ? (
          <Button variant="secondary" size="sm" className="flex-1 gap-2" disabled>
            <CheckCircle2 className="h-4 w-4" />
            Hired
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2"
              onClick={handleRunDemo}
              disabled={isRunningDemo || isDemoRunning}
            >
              <Play className="h-4 w-4" />
              {isRunningDemo ? 'Running...' : 'Try Demo'}
            </Button>
            <Button size="sm" className="flex-1 gap-2" onClick={handleHire} disabled={isHiring}>
              <Plus className="h-4 w-4" />
              {isHiring ? 'Hiring...' : `$${employee.monthly_price}/mo`}
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
