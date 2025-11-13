/**
 * Configurator Store
 * Manages AI employee configurator state including workflow editing, capabilities, and training
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Node, Edge } from 'reactflow';
import type {
  CustomEmployee,
  EmployeeTemplate,
  Capability,
  TrainingExample,
  TestResult,
  WorkflowDefinition,
} from '../types/configurator';

interface ConfiguratorState {
  // Templates & Custom Employees
  templates: EmployeeTemplate[];
  customEmployees: CustomEmployee[];
  selectedEmployee: CustomEmployee | null;

  // Capability Library
  capabilities: Capability[];
  selectedCapabilities: string[];

  // Workflow Editing
  workflowNodes: Node[];
  workflowEdges: Edge[];
  selectedNode: Node | null;
  workflowVariables: Record<string, any>;

  // Training
  trainingExamples: TrainingExample[];

  // Publishing
  isPublishing: boolean;
  publishError: string | null;

  // UI State
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  saveError: string | null;
  isDirty: boolean;
  testModalOpen: boolean;
  publishModalOpen: boolean;
  trainingPanelOpen: boolean;

  // Test State
  isTestRunning: boolean;
  testResult: TestResult | null;

  // Employee Metadata
  employeeName: string;
  employeeRole: string;
  employeeDescription: string;
  customInstructions: string;

  // Actions - Data Fetching
  fetchTemplates: () => Promise<void>;
  fetchCapabilities: () => Promise<void>;
  fetchMyCustomEmployees: (userId: string) => Promise<void>;
  loadEmployee: (employeeId: string) => Promise<void>;

  // Actions - Employee CRUD
  createEmployee: (userId: string) => Promise<string>;
  updateEmployee: (id: string) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
  cloneEmployee: (id: string, userId: string) => Promise<string>;
  saveEmployee: () => Promise<void>;

  // Actions - Workflow Editing
  addNode: (node: Node) => void;
  updateNode: (id: string, data: any) => void;
  deleteNode: (id: string) => void;
  setSelectedNode: (node: Node | null) => void;
  addEdge: (edge: Edge) => void;
  deleteEdge: (id: string) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  clearWorkflow: () => void;
  autoLayoutWorkflow: () => void;

  // Actions - Training
  addTrainingExample: (input: string, expectedOutput: string) => void;
  updateTrainingExample: (id: string, field: 'input' | 'expectedOutput', value: string) => void;
  deleteTrainingExample: (id: string) => void;

  // Actions - Testing
  testEmployee: (testInput: string) => Promise<TestResult>;
  clearTestResult: () => void;

  // Actions - Publishing
  publishToMarketplace: (
    employeeId: string,
    price: number,
    tags: string[],
    category: string,
  ) => Promise<void>;

  // Actions - UI State
  setEmployeeName: (name: string) => void;
  setEmployeeRole: (role: string) => void;
  setEmployeeDescription: (description: string) => void;
  setCustomInstructions: (instructions: string) => void;
  setTestModalOpen: (open: boolean) => void;
  setPublishModalOpen: (open: boolean) => void;
  setTrainingPanelOpen: (open: boolean) => void;
  setIsDirty: (dirty: boolean) => void;

  // Actions - Reset
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

export const useConfiguratorStore = create<ConfiguratorState>((set, get) => ({
  ...defaultState,

  // Fetch employee templates
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

  // Fetch available capabilities
  fetchCapabilities: async () => {
    try {
      // Load built-in capabilities
      const { BUILT_IN_CAPABILITIES } = await import('../types/configurator');
      set({ capabilities: BUILT_IN_CAPABILITIES });
    } catch (error) {
      console.error('Failed to fetch capabilities:', error);
      set({ error: String(error) });
    }
  },

  // Fetch user's custom employees
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

  // Load an existing employee for editing
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

  // Create a new custom employee
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

  // Update an existing custom employee
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

  // Delete a custom employee
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

  // Clone an existing employee
  cloneEmployee: async (id: string, userId: string) => {
    try {
      const clonedId = await invoke<string>('clone_custom_employee', { employeeId: id, userId });
      await get().fetchMyCustomEmployees(userId);
      return clonedId;
    } catch (error) {
      console.error('Failed to clone employee:', error);
      throw error;
    }
  },

  // Save current employee
  saveEmployee: async () => {
    const { selectedEmployee } = get();
    if (selectedEmployee) {
      await get().updateEmployee(selectedEmployee.id);
    }
  },

  // Add a new node to the workflow
  addNode: (node: Node) => {
    set((state) => ({
      workflowNodes: [...state.workflowNodes, node],
      isDirty: true,
    }));
  },

  // Update a node's data
  updateNode: (id: string, data: any) => {
    set((state) => ({
      workflowNodes: state.workflowNodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...data } } : node,
      ),
      isDirty: true,
    }));
  },

  // Delete a node
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

  // Set selected node
  setSelectedNode: (node: Node | null) => {
    set({ selectedNode: node });
  },

  // Add an edge
  addEdge: (edge: Edge) => {
    set((state) => ({
      workflowEdges: [...state.workflowEdges, edge],
      isDirty: true,
    }));
  },

  // Delete an edge
  deleteEdge: (id: string) => {
    set((state) => ({
      workflowEdges: state.workflowEdges.filter((edge) => edge.id !== id),
      isDirty: true,
    }));
  },

  // Set all nodes
  setNodes: (nodes: Node[]) => {
    set({ workflowNodes: nodes, isDirty: true });
  },

  // Set all edges
  setEdges: (edges: Edge[]) => {
    set({ workflowEdges: edges, isDirty: true });
  },

  // Clear workflow
  clearWorkflow: () => {
    set({ workflowNodes: [], workflowEdges: [], selectedNode: null, isDirty: true });
  },

  // Auto-layout workflow (simple algorithm)
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

  // Add training example
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

  // Update training example
  updateTrainingExample: (id: string, field: 'input' | 'expectedOutput', value: string) => {
    set((state) => ({
      trainingExamples: state.trainingExamples.map((example) =>
        example.id === id ? { ...example, [field]: value } : example,
      ),
      isDirty: true,
    }));
  },

  // Delete training example
  deleteTrainingExample: (id: string) => {
    set((state) => ({
      trainingExamples: state.trainingExamples.filter((example) => example.id !== id),
      isDirty: true,
    }));
  },

  // Test employee
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

  // Clear test result
  clearTestResult: () => {
    set({ testResult: null });
  },

  // Publish to marketplace
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

  // UI State setters
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

  // Reset entire store
  reset: () => {
    set(defaultState);
  },

  // Reset just the workflow
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
}));
