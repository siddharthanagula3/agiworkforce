import { Layers } from 'lucide-react';

export function ProjectsView() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-zinc-50 dark:bg-zinc-950/50">
      <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/20 rounded-2xl flex items-center justify-center mb-4">
        <Layers className="w-8 h-8 text-orange-600 dark:text-orange-400" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Projects</h2>
      <p className="text-gray-500 max-w-md">
        Manage complex tasks with multi-file context and persistent memory. This feature is coming
        soon.
      </p>
    </div>
  );
}
