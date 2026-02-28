import { supabase } from '@shared/lib/supabase-client';

// Use type assertion to access tables not in generated schema
const db = supabase as unknown as {
  from: (table: string) => ReturnType<typeof supabase.from>;
};

// Local type definitions for the employee management service
type EmployeeCategory = string;
type EmployeeLevel = string;
type EmployeeStatus = string;

interface ToolDefinition {
  id: string;
  name: string;
  type: string;
  description: string;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  steps: unknown[];
}

interface JobAssignment {
  id?: string;
  jobId: string;
  employeeId: string;
  assignedAt: string;
  status: string;
  priority: number;
  estimatedDuration: number;
  toolsUsed: string[];
  workflowsExecuted: string[];
  performance: Record<string, unknown>;
}

interface AIEmployeeSystemConfig {
  maxConcurrentEmployees: number;
  defaultResponseTime: number;
  qualityThreshold: number;
  autoAssignment: boolean;
  loadBalancing: boolean;
  monitoringEnabled: boolean;
  alertingEnabled: boolean;
  backupEmployees: string[];
  escalationRules: unknown[];
}

type AIEmployee = Record<string, unknown>;

class AIEmployeeService {
  private config: AIEmployeeSystemConfig = {
    maxConcurrentEmployees: 50,
    defaultResponseTime: 5,
    qualityThreshold: 85,
    autoAssignment: true,
    loadBalancing: true,
    monitoringEnabled: true,
    alertingEnabled: true,
    backupEmployees: [],
    escalationRules: [],
  };

  // Get all AI employees
  async getEmployees(filters?: {
    category?: EmployeeCategory;
    status?: EmployeeStatus;
    level?: EmployeeLevel;
    department?: string;
    available?: boolean;
  }) {
    try {
      let query = db.from('ai_employees').select('*');

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.level) {
        query = query.eq('level', filters.level);
      }
      if (filters?.department) {
        query = query.eq('department', filters.department);
      }
      if (filters?.available) {
        query = query.eq('status', 'available');
      }

      const { data, error } = await query.order('name');

      if (error) throw error;
      return { data, error: null };
    } catch (error: unknown) {
      // Updated: Jan 15th 2026 - Fixed missing error type check
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    }
  }

  // Get employee by ID
  async getEmployee(id: string) {
    try {
      const { data, error } = await supabase
        .from('ai_employees')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return { data, error: null };
    } catch (error: unknown) {
      // Updated: Jan 15th 2026 - Fixed missing error type check
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    }
  }

  // Create new AI employee
  async createEmployee(employee: Omit<AIEmployee, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      const { data, error } = await db
        .from('ai_employees')
        .insert({
          ...employee,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Failed to create employee: No data returned');
      return { data, error: null };
    } catch (error: unknown) {
      // Updated: Jan 15th 2026 - Fixed missing error type check
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    }
  }

  // Update employee
  async updateEmployee(id: string, updates: Partial<AIEmployee>) {
    try {
      const { data, error } = await db
        .from('ai_employees')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Employee not found or update failed');
      return { data, error: null };
    } catch (error: unknown) {
      // Updated: Jan 15th 2026 - Fixed missing error type check
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    }
  }

  // Delete employee
  async deleteEmployee(id: string) {
    try {
      const { error } = await db.from('ai_employees').delete().eq('id', id);

      if (error) throw error;
      return { data: true, error: null };
    } catch (error: unknown) {
      // Updated: Jan 15th 2026 - Fixed missing error type check
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    }
  }

  // Get employees by category
  async getEmployeesByCategory(category: EmployeeCategory) {
    return this.getEmployees({ category });
  }

  // Get available employees for assignment
  async getAvailableEmployees(requirements?: {
    skills?: string[];
    level?: EmployeeLevel;
    maxCost?: number;
    department?: string;
  }) {
    try {
      let query = db.from('ai_employees').select('*').eq('status', 'available');

      if (requirements?.department) {
        query = query.eq('department', requirements.department);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Filter by additional requirements
      let filteredEmployees = (data || []) as AIEmployee[];

      if (requirements?.skills && requirements.skills.length > 0) {
        filteredEmployees = filteredEmployees.filter((emp) => {
          const caps = emp.capabilities as Record<string, string[]> | undefined;
          return requirements.skills!.some(
            (skill) =>
              caps?.core_skills?.includes(skill) || caps?.technical_skills?.includes(skill),
          );
        });
      }

      if (requirements?.level) {
        filteredEmployees = filteredEmployees.filter((emp) => emp.level === requirements.level);
      }

      if (requirements?.maxCost) {
        filteredEmployees = filteredEmployees.filter((emp) => {
          const cost = emp.cost as Record<string, number> | undefined;
          return (cost?.hourly_rate ?? 0) <= requirements.maxCost!;
        });
      }

      return { data: filteredEmployees, error: null };
    } catch (error: unknown) {
      // Updated: Jan 15th 2026 - Fixed missing error type check
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    }
  }

  // Assign employee to job
  async assignEmployeeToJob(employeeId: string, jobId: string, priority: number = 1) {
    try {
      const assignment: Omit<JobAssignment, 'id'> = {
        jobId,
        employeeId,
        assignedAt: new Date().toISOString(),
        status: 'assigned',
        priority,
        estimatedDuration: 0, // Will be calculated based on job complexity
        toolsUsed: [],
        workflowsExecuted: [],
        performance: {
          efficiency: 0,
          quality: 0,
          timeliness: 0,
          toolUsage: {},
          errors: 0,
          iterations: 0,
        },
      };

      const { data, error } = await db
        .from('job_assignments')
        .insert(assignment)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Failed to create job assignment: No data returned');

      // Update employee status
      await this.updateEmployee(employeeId, { status: 'working' });

      return { data, error: null };
    } catch (error: unknown) {
      // Updated: Jan 15th 2026 - Fixed missing error type check
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    }
  }

  // Get employee performance stats
  async getEmployeePerformance(employeeId: string) {
    try {
      const { data, error } = await db
        .from('ai_employees')
        .select('performance')
        .eq('id', employeeId)
        .maybeSingle();

      if (error) throw error;
      return { data: (data as Record<string, unknown> | null)?.performance, error: null };
    } catch (error: unknown) {
      // Updated: Jan 15th 2026 - Fixed missing error type check
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    }
  }

  // Update employee performance
  async updateEmployeePerformance(employeeId: string, performance: unknown) {
    try {
      const { data, error } = await db
        .from('ai_employees')
        .update({
          performance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', employeeId)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Employee not found or performance update failed');
      return { data, error: null };
    } catch (error: unknown) {
      // Updated: Jan 15th 2026 - Fixed missing error type check
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    }
  }

  // Get system configuration
  async getSystemConfig() {
    return { data: this.config, error: null };
  }

  // Update system configuration
  async updateSystemConfig(config: Partial<AIEmployeeSystemConfig>) {
    this.config = { ...this.config, ...config };
    return { data: this.config, error: null };
  }

  // Get employee tools
  async getEmployeeTools(employeeId: string) {
    try {
      const { data, error } = await db
        .from('ai_employees')
        .select('tools')
        .eq('id', employeeId)
        .maybeSingle();

      if (error) throw error;
      return { data: (data as Record<string, unknown> | null)?.tools || [], error: null };
    } catch (error: unknown) {
      // Updated: Jan 15th 2026 - Fixed missing error type check
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    }
  }

  // Update employee tools
  async updateEmployeeTools(employeeId: string, tools: ToolDefinition[]) {
    try {
      const { data, error } = await db
        .from('ai_employees')
        .update({
          tools,
          updated_at: new Date().toISOString(),
        })
        .eq('id', employeeId)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Employee not found or tools update failed');
      return { data, error: null };
    } catch (error: unknown) {
      // Updated: Jan 15th 2026 - Fixed missing error type check
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    }
  }

  // Get employee workflows
  async getEmployeeWorkflows(employeeId: string) {
    try {
      const { data, error } = await db
        .from('ai_employees')
        .select('workflows')
        .eq('id', employeeId)
        .maybeSingle();

      if (error) throw error;
      return { data: (data as Record<string, unknown> | null)?.workflows || [], error: null };
    } catch (error: unknown) {
      // Updated: Jan 15th 2026 - Fixed missing error type check
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    }
  }

  // Update employee workflows
  async updateEmployeeWorkflows(employeeId: string, workflows: WorkflowDefinition[]) {
    try {
      const { data, error } = await db
        .from('ai_employees')
        .update({
          workflows,
          updated_at: new Date().toISOString(),
        })
        .eq('id', employeeId)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Employee not found or workflows update failed');
      return { data, error: null };
    } catch (error: unknown) {
      // Updated: Jan 15th 2026 - Fixed missing error type check
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    }
  }

  // Search employees by skills
  async searchEmployeesBySkills(skills: string[], limit: number = 10) {
    try {
      const { data, error } = await db
        .from('ai_employees')
        .select('*')
        .eq('status', 'available')
        .limit(limit);

      if (error) throw error;

      // Filter employees by skills match
      const matchedEmployees = ((data || []) as AIEmployee[]).filter((emp) => {
        const caps = emp.capabilities as Record<string, string[]> | undefined;
        const allSkills = [
          ...(caps?.core_skills || []),
          ...(caps?.technical_skills || []),
          ...(caps?.specializations || []),
        ];

        return skills.some((skill) =>
          allSkills.some((empSkill: string) =>
            empSkill.toLowerCase().includes(skill.toLowerCase()),
          ),
        );
      });

      return { data: matchedEmployees, error: null };
    } catch (error: unknown) {
      // Updated: Jan 15th 2026 - Fixed missing error type check
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    }
  }

  // Get employee assignments
  async getEmployeeAssignments(employeeId: string) {
    try {
      const { data, error } = await db
        .from('job_assignments')
        .select('*')
        .eq('employee_id', employeeId)
        .order('assigned_at', { ascending: false });

      if (error) throw error;
      return { data, error: null };
    } catch (error: unknown) {
      // Updated: Jan 15th 2026 - Fixed missing error type check
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    }
  }

  // Get system statistics
  async getSystemStats() {
    try {
      const { data: employees, error: empError } = await db
        .from('ai_employees')
        .select('status, category, level');

      if (empError) throw empError;

      const { data: assignments, error: assignError } = await db
        .from('job_assignments')
        .select('status, employee_id');

      if (assignError) throw assignError;

      const emps = (employees || []) as AIEmployee[];
      const assigns = (assignments || []) as AIEmployee[];

      const stats = {
        totalEmployees: emps.length,
        availableEmployees: emps.filter((emp) => emp.status === 'available').length,
        workingEmployees: emps.filter((emp) => emp.status === 'working').length,
        activeAssignments: assigns.filter((assign) => assign.status === 'in_progress').length,
        completedAssignments: assigns.filter((assign) => assign.status === 'completed').length,
        categories: this.groupByCategory(employees || []),
        levels: this.groupByLevel(employees || []),
      };

      return { data: stats, error: null };
    } catch (error: unknown) {
      // Updated: Jan 15th 2026 - Fixed missing error type check
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    }
  }

  private groupByCategory(employees: AIEmployee[]) {
    return employees.reduce((acc: Record<string, number>, emp: AIEmployee) => {
      const category = String(emp.category ?? 'unknown');
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
  }

  private groupByLevel(employees: AIEmployee[]) {
    return employees.reduce((acc: Record<string, number>, emp: AIEmployee) => {
      const level = String(emp.level ?? 'unknown');
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {});
  }
}

export const aiEmployeeService = new AIEmployeeService();
