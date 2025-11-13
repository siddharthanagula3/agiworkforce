/**
 * Role Selection Component
 * Allows users to select their role for personalized demos
 */

import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/Badge';
import { Check } from 'lucide-react';
import type { UserRole, RoleOption } from '../../types/onboarding';
import { ROLE_OPTIONS } from '../../data/onboardingDemos';

interface RoleSelectionProps {
  onSelectRole: (role: UserRole) => void;
  selectedRole?: UserRole | null;
}

export const RoleSelection: React.FC<RoleSelectionProps> = ({
  onSelectRole,
  selectedRole = null,
}) => {
  const [hoveredRole, setHoveredRole] = useState<UserRole | null>(null);

  const handleRoleClick = (roleId: UserRole) => {
    onSelectRole(roleId);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 py-8 px-4">
      {/* Header */}
      <div className="text-center space-y-4">
        <h2 className="text-4xl font-bold tracking-tight">
          What best describes you?
        </h2>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          We'll recommend the perfect AI employees for your needs
        </p>
      </div>

      {/* Role cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ROLE_OPTIONS.map((role) => {
          const isSelected = selectedRole === role.id;
          const isHovered = hoveredRole === role.id;

          return (
            <Card
              key={role.id}
              className={`cursor-pointer transition-all duration-300 ${
                isSelected
                  ? 'border-primary border-2 shadow-lg scale-[1.02]'
                  : isHovered
                    ? 'border-primary/50 shadow-md scale-[1.01]'
                    : 'border-border hover:border-primary/30'
              }`}
              onClick={() => handleRoleClick(role.id)}
              onMouseEnter={() => setHoveredRole(role.id)}
              onMouseLeave={() => setHoveredRole(null)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div className="text-4xl">{role.icon}</div>

                    {/* Title */}
                    <div>
                      <CardTitle className="text-lg">{role.title}</CardTitle>
                    </div>
                  </div>

                  {/* Selected checkmark */}
                  {isSelected && (
                    <div className="bg-primary rounded-full p-1">
                      <Check className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>

                <CardDescription className="text-sm mt-2">
                  {role.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Perfect for */}
                <div className="text-xs text-muted-foreground">
                  <span className="font-semibold">Perfect for:</span>{' '}
                  {role.perfectFor}
                </div>

                {/* Recommended employees */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-foreground">
                    Recommended Employees:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {role.recommendedEmployees.slice(0, 3).map((employee, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="text-xs px-2 py-0.5"
                      >
                        {employee}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Continue button (shown when role selected) */}
      {selectedRole && (
        <div className="flex justify-center pt-4">
          <Button
            size="lg"
            onClick={() => onSelectRole(selectedRole)}
            className="min-w-[200px] text-lg h-12"
          >
            Continue
          </Button>
        </div>
      )}

      {/* Help text */}
      <div className="text-center text-sm text-muted-foreground pt-4">
        <p>
          Don't worry, you can explore all employees regardless of your role
        </p>
      </div>
    </div>
  );
};
