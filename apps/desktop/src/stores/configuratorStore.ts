/**
 * Configurator Store
 *
 * Manages the employee configurator state for creating and editing custom AI employees.
 *
 * Updated to Zustand v5 best practices:
 * - Middleware composition: devtools(subscribeWithSelector(...))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - Better devtools integration with store name
 * - subscribeWithSelector for granular subscriptions
 *
 * Note: This store doesn't use persistence since configurator state is session-based.
 */
import type { Edge, Node } from '@xyflow/react';
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';
import type {
  Capability,
  CustomEmployee,
  EmployeeTemplate,
  TestResult,
  TrainingExample,
  WorkflowDefinition,
} from '../types/configurator';

interface ConfiguratorState {
  templates: EmployeeTemplate[];
  customEmployees: CustomEmployee[];
  selectedEmployee: CustomEmployee | null;

  capabilities: Capability[];
  selectedCapabilities: string[];

  workflowNodes: Node[];
  workflowEdges: Edge[];
  selectedNode: Node | null;
  workflowVariables: Record<string, any>;

  trainingExamples: TrainingExample[];

  isPublishing: boolean;
  publishError: string | null;

  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  saveError: string | null;
  isDirty: boolean;
  testModalOpen: boolean;
  publishModalOpen: boolean;
  trainingPanelOpen: boolean;

  isTestRunning: boolean;
  testResult: TestResult | null;

  employeeName: string;
  employeeRole: string;
  employeeDescription: string;
  customInstructions: string;

  fetchTemplates: () => Promise<void>;
  fetchCapabilities: () => Promise<void>;
  fetchMyCustomEmployees: (userId: string) => Promise<void>;
  loadEmployee: (employeeId: string) => Promise<void>;

  createEmployee: (userId: string) => Promise<string>;
  updateEmployee: (id: string) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
  cloneEmployee: (id: string, userId: string) => Promise<string>;
  saveEmployee: () => Promise<void>;

  addNode: (node: Node) => void;
  updateNode: (id: string, data: Record<string, unknown>) => void;
  deleteNode: (id: string) => void;
  setSelectedNode: (node: Node | null) => void;
  addEdge: (edge: Edge) => void;
  deleteEdge: (id: string) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  clearWorkflow: () => void;
  autoLayoutWorkflow: () => void;

  addTrainingExample: (input: string, expectedOutput: string) => void;
  updateTrainingExample: (id: string, field: 'input' | 'expectedOutput', value: string) => void;
  deleteTrainingExample: (id: string) => void;

  testEmployee: (testInput: string) => Promise<TestResult>;
  clearTestResult: () => void;

  publishToMarketplace: (
    employeeId: string,
    price: number,
    tags: string[],
    category: string,
  ) => Promise<void>;

  setEmployeeName: (name: string) => void;
  setEmployeeRole: (role: string) => void;
  setEmployeeDescription: (description: string) => void;
  setCustomInstructions: (instructions: string) => void;
  setTestModalOpen: (open: boolean) => void;
  setPublishModalOpen: (open: boolean) => void;
  setTrainingPanelOpen: (open: boolean) => void;
  setIsDirty: (dirty: boolean) => void;

  reset: () => void;
  resetWorkflow: () => void;
}

const defaultState = {
  templates: [],
  customEmployees: [],
  selectedEmployee: null,
  capabilities: [],
  selectedCapabilities: [],
  workflowNodes: [],
  workflowEdges: [],
  selectedNode: null,
  workflowVariables: {},
  trainingExamples: [],
  isPublishing: false,
  publishError: null,
  isLoading: false,
  error: null,
  isSaving: false,
  saveError: null,
  isDirty: false,
  testModalOpen: false,
  publishModalOpen: false,
  trainingPanelOpen: false,
  isTestRunning: false,
  testResult: null,
  employeeName: 'My Custom Employee',
  employeeRole: 'SupportAgent',
  employeeDescription: '',
  customInstructions: '',
};

export const useConfiguratorStore = create<ConfiguratorState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...defaultState,

      fetchTemplates: async () => {
        set({ isLoading: true, error: null });
        try {
          const templates = await invoke<EmployeeTemplate[]>('get_employee_templates');
          set({ templates, isLoading: false });
        } catch (error) {
          console.error('Failed to fetch templates:', error);
          set({ error: String(error), isLoading: false });
        }
      },

      fetchCapabilities: async () => {
        try {
          const { BUILT_IN_CAPABILITIES } = await import('../types/configurator');
          set({ capabilities: BUILT_IN_CAPABILITIES });
        } catch (error) {
          console.error('Failed to fetch capabilities:', error);
          set({ error: String(error) });
        }
      },

      fetchMyCustomEmployees: async (userId: string) => {
        set({ isLoading: true, error: null });
        try {
          const employees = await invoke<CustomEmployee[]>('get_custom_employees', { userId });
          set({ customEmployees: employees, isLoading: false });
        } catch (error) {
          console.error('Failed to fetch custom employees:', error);
          set({ error: String(error), isLoading: false });
        }
      },

      loadEmployee: async (employeeId: string) => {
        set({ isLoading: true, error: null });
        try {
          const employee = await invoke<CustomEmployee>('get_employee_by_id', { employeeId });
          set({
            selectedEmployee: employee,
            employeeName: employee.name,
            employeeRole: employee.role,
            employeeDescription: employee.description,
            customInstructions: employee.customInstructions || '',
            workflowNodes: employee.workflow.nodes,
            workflowEdges: employee.workflow.edges,
            workflowVariables: employee.workflow.variables,
            trainingExamples: employee.trainingData,
            selectedCapabilities: employee.capabilities,
            isLoading: false,
            isDirty: false,
          });
        } catch (error) {
          console.error('Failed to load employee:', error);
          set({ error: String(error), isLoading: false });
        }
      },

      createEmployee: async (userId: string) => {
        set({ isSaving: true, saveError: null });
        try {
          const {
            employeeName,
            employeeRole,
            employeeDescription,
            customInstructions,
            workflowNodes,
            workflowEdges,
            workflowVariables,
            trainingExamples,
            selectedCapabilities,
          } = get();

          const employee: Omit<CustomEmployee, 'id' | 'createdAt' | 'updatedAt'> = {
            name: employeeName,
            role: employeeRole,
            description: employeeDescription,
            customInstructions,
            capabilities: selectedCapabilities,
            workflow: {
              nodes: workflowNodes,
              edges: workflowEdges,
              variables: workflowVariables,
            },
            trainingData: trainingExamples,
            isPublished: false,
            userId,
          };

          const employeeId = await invoke<string>('create_custom_employee', { employee });

          set({ isSaving: false, isDirty: false });
          return employeeId;
        } catch (error) {
          console.error('Failed to create employee:', error);
          set({ saveError: String(error), isSaving: false });
          throw error;
        }
      },

      updateEmployee: async (id: string) => {
        set({ isSaving: true, saveError: null });
        try {
          const {
            employeeName,
            employeeRole,
            employeeDescription,
            customInstructions,
            workflowNodes,
            workflowEdges,
            workflowVariables,
            trainingExamples,
            selectedCapabilities,
          } = get();

          const employee = {
            id,
            name: employeeName,
            role: employeeRole,
            description: employeeDescription,
            customInstructions,
            capabilities: selectedCapabilities,
            workflow: {
              nodes: workflowNodes,
              edges: workflowEdges,
              variables: workflowVariables,
            },
            trainingData: trainingExamples,
          };

          await invoke('update_custom_employee', { employee });

          set({ isSaving: false, isDirty: false });
        } catch (error) {
          console.error('Failed to update employee:', error);
          set({ saveError: String(error), isSaving: false });
          throw error;
        }
      },

      deleteEmployee: async (id: string) => {
        try {
          await invoke('delete_custom_employee', { employeeId: id });
          set((state) => ({
            customEmployees: state.customEmployees.filter((e) => e.id !== id),
          }));
        } catch (error) {
          console.error('Failed to delete employee:', error);
          throw error;
        }
      },

      cloneEmployee: async (id: string, userId: string) => {
        try {
          const clonedId = await invoke<string>('clone_custom_employee', {
            employeeId: id,
            userId,
          });
          await get().fetchMyCustomEmployees(userId);
          return clonedId;
        } catch (error) {
          console.error('Failed to clone employee:', error);
          throw error;
        }
      },

      saveEmployee: async () => {
        const { selectedEmployee } = get();
        if (selectedEmployee) {
          await get().updateEmployee(selectedEmployee.id);
        }
      },

      addNode: (node: Node) => {
        set((state) => ({
          workflowNodes: [...state.workflowNodes, node],
          isDirty: true,
        }));
      },

      updateNode: (id: string, data: Record<string, unknown>) => {
        set((state) => ({
          workflowNodes: state.workflowNodes.map((node) =>
            node.id === id ? { ...node, data: { ...node.data, ...data } } : node,
          ),
          isDirty: true,
        }));
      },

      deleteNode: (id: string) => {
        set((state) => ({
          workflowNodes: state.workflowNodes.filter((node) => node.id !== id),
          workflowEdges: state.workflowEdges.filter(
            (edge) => edge.source !== id && edge.target !== id,
          ),
          selectedNode: state.selectedNode?.id === id ? null : state.selectedNode,
          isDirty: true,
        }));
      },

      setSelectedNode: (node: Node | null) => {
        set({ selectedNode: node });
      },

      addEdge: (edge: Edge) => {
        set((state) => ({
          workflowEdges: [...state.workflowEdges, edge],
          isDirty: true,
        }));
      },

      deleteEdge: (id: string) => {
        set((state) => ({
          workflowEdges: state.workflowEdges.filter((edge) => edge.id !== id),
          isDirty: true,
        }));
      },

      setNodes: (nodes: Node[]) => {
        set({ workflowNodes: nodes, isDirty: true });
      },

      setEdges: (edges: Edge[]) => {
        set({ workflowEdges: edges, isDirty: true });
      },

      clearWorkflow: () => {
        set({ workflowNodes: [], workflowEdges: [], selectedNode: null, isDirty: true });
      },

      autoLayoutWorkflow: () => {
        const { workflowNodes } = get();
        let x = 100;
        let y = 100;
        const layoutedNodes = workflowNodes.map((node, index) => {
          const layoutedNode = {
            ...node,
            position: { x, y },
          };
          x += 250;
          if ((index + 1) % 3 === 0) {
            x = 100;
            y += 150;
          }
          return layoutedNode;
        });
        set({ workflowNodes: layoutedNodes, isDirty: true });
      },

      addTrainingExample: (input: string, expectedOutput: string) => {
        const example: TrainingExample = {
          id: `example-${Date.now()}`,
          input,
          expectedOutput,
          createdAt: Date.now(),
        };
        set((state) => ({
          trainingExamples: [...state.trainingExamples, example],
          isDirty: true,
        }));
      },

      updateTrainingExample: (id: string, field: 'input' | 'expectedOutput', value: string) => {
        set((state) => ({
          trainingExamples: state.trainingExamples.map((example) =>
            example.id === id ? { ...example, [field]: value } : example,
          ),
          isDirty: true,
        }));
      },

      deleteTrainingExample: (id: string) => {
        set((state) => ({
          trainingExamples: state.trainingExamples.filter((example) => example.id !== id),
          isDirty: true,
        }));
      },

      testEmployee: async (testInput: string) => {
        set({ isTestRunning: true, testResult: null });
        try {
          const {
            workflowNodes,
            workflowEdges,
            workflowVariables,
            customInstructions,
            trainingExamples,
          } = get();

          const workflow: WorkflowDefinition = {
            nodes: workflowNodes,
            edges: workflowEdges,
            variables: workflowVariables,
          };

          const result = await invoke<TestResult>('test_custom_employee', {
            workflow,
            customInstructions,
            trainingExamples,
            testInput,
          });

          set({ testResult: result, isTestRunning: false });
          return result;
        } catch (error) {
          console.error('Failed to test employee:', error);
          const errorResult: TestResult = {
            success: false,
            output: '',
            executionTimeMs: 0,
            qualityScore: 0,
            errors: [String(error)],
            stepsExecuted: 0,
            timestamp: Date.now(),
          };
          set({ testResult: errorResult, isTestRunning: false });
          throw error;
        }
      },

      clearTestResult: () => {
        set({ testResult: null });
      },

      publishToMarketplace: async (
        employeeId: string,
        price: number,
        tags: string[],
        category: string,
      ) => {
        set({ isPublishing: true, publishError: null });
        try {
          await invoke('publish_employee_to_marketplace', {
            employeeId,
            price,
            tags,
            category,
          });
          set({ isPublishing: false, publishModalOpen: false });
        } catch (error) {
          console.error('Failed to publish employee:', error);
          set({ publishError: String(error), isPublishing: false });
          throw error;
        }
      },

      setEmployeeName: (name: string) => {
        set({ employeeName: name, isDirty: true });
      },

      setEmployeeRole: (role: string) => {
        set({ employeeRole: role, isDirty: true });
      },

      setEmployeeDescription: (description: string) => {
        set({ employeeDescription: description, isDirty: true });
      },

      setCustomInstructions: (instructions: string) => {
        set({ customInstructions: instructions, isDirty: true });
      },

      setTestModalOpen: (open: boolean) => {
        set({ testModalOpen: open });
      },

      setPublishModalOpen: (open: boolean) => {
        set({ publishModalOpen: open });
      },

      setTrainingPanelOpen: (open: boolean) => {
        set({ trainingPanelOpen: open });
      },

      setIsDirty: (dirty: boolean) => {
        set({ isDirty: dirty });
      },

      reset: () => {
        set(defaultState);
      },

      resetWorkflow: () => {
        set({
          workflowNodes: [],
          workflowEdges: [],
          selectedNode: null,
          workflowVariables: {},
          employeeName: 'My Custom Employee',
          employeeRole: 'SupportAgent',
          employeeDescription: '',
          customInstructions: '',
          trainingExamples: [],
          isDirty: false,
        });
      },
    })),
    { name: 'ConfiguratorStore', enabled: import.meta.env.DEV },
  ),
);
