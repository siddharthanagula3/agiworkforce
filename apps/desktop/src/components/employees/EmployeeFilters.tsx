/**
 * EmployeeFilters Component
 * Search and filter controls for the employee marketplace
 */

import { Search, Users, Briefcase, Code, Settings as SettingsIcon, User, Check } from 'lucide-react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';
import { useEmployeeStore } from '../../stores/employeeStore';
import type { EmployeeRole } from '../../types/employees';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';
import { useState } from 'react';

const CATEGORY_CONFIG: Array<{
  id: EmployeeRole | 'all';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'all', label: 'All', icon: Users },
  { id: 'SupportAgent', label: 'Support', icon: Users },
  { id: 'SalesAgent', label: 'Sales', icon: Briefcase },
  { id: 'Developer', label: 'Development', icon: Code },
  { id: 'Operations', label: 'Operations', icon: SettingsIcon },
  { id: 'Personal', label: 'Personal', icon: User },
];

export function EmployeeFilters() {
  const {
    searchQuery,
    selectedCategory,
    setSearchQuery,
    setSelectedCategory,
    myEmployees,
  } = useEmployeeStore();

  const [showMyEmployeesOnly, setShowMyEmployeesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'popular' | 'newest' | 'time_saved' | 'rating'>('popular');

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  return (
    <div className="border-b border-border/60 bg-background/95 backdrop-blur-sm">
      <div className="px-6 py-4 space-y-4">
        {/* Top row: Search and sort */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search employees by name, role, or capability..."
              className="pl-9 h-10"
            />
          </div>

          {/* Sort dropdown */}
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
            <SelectTrigger className="w-full sm:w-48 h-10">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="popular">Most Popular</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="time_saved">Most Time Saved</SelectItem>
              <SelectItem value="rating">Highest Rated</SelectItem>
            </SelectContent>
          </Select>

          {/* My Employees toggle */}
          <Button
            variant={showMyEmployeesOnly ? 'default' : 'outline'}
            className={cn(
              'gap-2 h-10',
              showMyEmployeesOnly && 'bg-primary text-primary-foreground'
            )}
            onClick={() => setShowMyEmployeesOnly(!showMyEmployeesOnly)}
          >
            {showMyEmployeesOnly && <Check className="h-4 w-4" />}
            My Employees
            {myEmployees.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {myEmployees.length}
              </Badge>
            )}
          </Button>
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2">
          {CATEGORY_CONFIG.map((category) => {
            const Icon = category.icon;
            const isActive = selectedCategory === category.id;

            return (
              <Button
                key={category.id}
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'gap-2 transition-all',
                  isActive && 'bg-primary text-primary-foreground shadow-sm'
                )}
                onClick={() => setSelectedCategory(category.id)}
              >
                <Icon className="h-3.5 w-3.5" />
                {category.label}
              </Button>
            );
          })}
        </div>

        {/* Active filters summary */}
        {(searchQuery || selectedCategory !== 'all' || showMyEmployeesOnly) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Active filters:</span>
            {searchQuery && (
              <Badge variant="secondary" className="gap-1">
                Search: {searchQuery}
                <button
                  onClick={() => setSearchQuery('')}
                  className="ml-1 hover:text-foreground"
                >
                  ×
                </button>
              </Badge>
            )}
            {selectedCategory !== 'all' && (
              <Badge variant="secondary" className="gap-1">
                {CATEGORY_CONFIG.find(c => c.id === selectedCategory)?.label}
                <button
                  onClick={() => setSelectedCategory('all')}
                  className="ml-1 hover:text-foreground"
                >
                  ×
                </button>
              </Badge>
            )}
            {showMyEmployeesOnly && (
              <Badge variant="secondary" className="gap-1">
                My Employees
                <button
                  onClick={() => setShowMyEmployeesOnly(false)}
                  className="ml-1 hover:text-foreground"
                >
                  ×
                </button>
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
                setShowMyEmployeesOnly(false);
              }}
              className="h-7 px-2 text-xs"
            >
              Clear all
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
