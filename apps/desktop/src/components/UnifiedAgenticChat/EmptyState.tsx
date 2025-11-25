import { Sparkles } from 'lucide-react';
import React from 'react';

export const EmptyState: React.FC = () => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-8 pb-48 z-0">
      <div className="mx-auto max-w-3xl w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-full blur-2xl opacity-30 scale-125" />
            <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 shadow-lg shadow-teal-500/25">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-4xl font-semibold text-gray-900 dark:text-white tracking-tight">
            How can I help you today?
          </h1>
          <p className="text-lg text-gray-500 dark:text-gray-400">
            Start typing, drop in files, or pick a focus above to guide Claude.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EmptyState;
