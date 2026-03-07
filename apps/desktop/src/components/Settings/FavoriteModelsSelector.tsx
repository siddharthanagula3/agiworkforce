import React from 'react';
import { Cloud, Check } from 'lucide-react';

/**
 * FavoriteModelsSelector - Simplified version
 *
 * In the current architecture, model selection is managed through the subscription.
 * This component is kept as a placeholder for future enhancements but currently
 * shows a simple message about managed cloud routing.
 */
export const FavoriteModelsSelector: React.FC = () => {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start gap-4">
        <div className="rounded-md bg-muted p-3">
          <Cloud className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold mb-2">Model Selection</h4>
          <p className="text-sm text-muted-foreground mb-3">
            Models are automatically selected based on your task type and subscription plan.
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-green-500" />
              <span>Smart routing selects the best model for each task</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-green-500" />
              <span>No configuration needed - it just works</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
