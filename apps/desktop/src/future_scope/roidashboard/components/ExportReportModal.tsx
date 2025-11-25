/**
 * ExportReportModal Component
 * Generate PDF/CSV/JSON reports
 */

import { Download, FileJson, FileSpreadsheet, FileText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/Dialog';
import { Input } from '../../../components/ui/Input';
import { Label } from '../../../components/ui/Label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/Select';
import type { ExportOptions } from '../../../types/roi';
import { useROIStore } from '../roiStore';

interface ExportReportModalProps {
  open: boolean;
  onClose: () => void;
}

export function ExportReportModal({ open, onClose }: ExportReportModalProps) {
  const { exportReport } = useROIStore();
  const [loading, setLoading] = useState(false);

  const [options, setOptions] = useState<ExportOptions>({
    dateRange: 'month',
    format: 'pdf',
    includeCharts: true,
    includeDetailedLog: false,
    includeComparison: true,
    includeEmployeeBreakdown: true,
  });

  const handleExport = async () => {
    setLoading(true);
    try {
      const filePath = await exportReport(options);
      toast.success(`Report exported successfully!`, {
        description: `Saved to: ${filePath}`,
        duration: 5000,
      });
      onClose();
    } catch (error) {
      toast.error('Failed to export report', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const getFormatIcon = (format: string) => {
    switch (format) {
      case 'pdf':
        return <FileText className="h-4 w-4" />;
      case 'csv':
        return <FileSpreadsheet className="h-4 w-4" />;
      case 'json':
        return <FileJson className="h-4 w-4" />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Export ROI Report</DialogTitle>
          <DialogDescription>Generate a comprehensive report of your ROI metrics</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date Range */}
          <div className="space-y-2">
            <Label htmlFor="dateRange">Date Range</Label>
            <Select
              value={options.dateRange}
              onValueChange={(value) =>
                setOptions({ ...options, dateRange: value as ExportOptions['dateRange'] })
              }
            >
              <SelectTrigger id="dateRange">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="quarter">This Quarter</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Custom Date Range */}
          {options.dateRange === 'custom' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={options.startDate || ''}
                  onChange={(e) => setOptions({ ...options, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={options.endDate || ''}
                  onChange={(e) => setOptions({ ...options, endDate: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Format */}
          <div className="space-y-2">
            <Label>Format</Label>
            <div className="grid grid-cols-3 gap-3">
              {(['pdf', 'csv', 'json'] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => setOptions({ ...options, format })}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                    options.format === format
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  {getFormatIcon(format)}
                  <span className="text-sm font-medium uppercase">{format}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Include Options */}
          <div className="space-y-2">
            <Label>Include</Label>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeCharts"
                  checked={options.includeCharts}
                  onCheckedChange={(checked) =>
                    setOptions({ ...options, includeCharts: checked as boolean })
                  }
                />
                <label
                  htmlFor="includeCharts"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Charts & Visualizations
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeDetailedLog"
                  checked={options.includeDetailedLog}
                  onCheckedChange={(checked) =>
                    setOptions({ ...options, includeDetailedLog: checked as boolean })
                  }
                />
                <label
                  htmlFor="includeDetailedLog"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Detailed Activity Log
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeComparison"
                  checked={options.includeComparison}
                  onCheckedChange={(checked) =>
                    setOptions({ ...options, includeComparison: checked as boolean })
                  }
                />
                <label
                  htmlFor="includeComparison"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Comparison Data
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeEmployeeBreakdown"
                  checked={options.includeEmployeeBreakdown}
                  onCheckedChange={(checked) =>
                    setOptions({ ...options, includeEmployeeBreakdown: checked as boolean })
                  }
                />
                <label
                  htmlFor="includeEmployeeBreakdown"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Employee Breakdown
                </label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={loading}>
            {loading ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
