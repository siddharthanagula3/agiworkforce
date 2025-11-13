/**
 * Employee Store
 * Manages AI employee marketplace and hired employees state
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AIEmployee, DemoResult, EmployeeRole, EmployeeUsageStats } from '../types/employees';

interface EmployeeState {
  // State
  employees: AIEmployee[];
  myEmployees: AIEmployee[];
  featuredEmployees: AIEmployee[];
  employeeStats: Map<string, EmployeeUsageStats>;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  selectedCategory: EmployeeRole | 'all';
  selectedEmployee: AIEmployee | null;
  demoResults: DemoResult | null;
  isDemoRunning: boolean;

  // Actions
  fetchAllEmployees: () => Promise<void>;
  fetchMyEmployees: (userId: string) => Promise<void>;
  fetchFeaturedEmployees: () => Promise<void>;
  fetchEmployeeStats: (userId: string) => Promise<void>;
  searchEmployees: (query: string) => Promise<void>;
  hireEmployee: (employeeId: string, userId: string) => Promise<void>;
  fireEmployee: (employeeId: string, userId: string) => Promise<void>;
  runDemo: (employeeId: string) => Promise<void>;
  setSelectedEmployee: (employee: AIEmployee | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: EmployeeRole | 'all') => void;
  clearDemoResults: () => void;
  reset: () => void;
}

export const useEmployeeStore = create<EmployeeState>((set, get) => ({
  // Initial state
  employees: [],
  myEmployees: [],
  featuredEmployees: [],
  employeeStats: new Map(),
  isLoading: false,
  error: null,
  searchQuery: '',
  selectedCategory: 'all',
  selectedEmployee: null,
  demoResults: null,
  isDemoRunning: false,

  // Fetch all employees from the marketplace
  fetchAllEmployees: async () => {
    set({ isLoading: true, error: null });
    try {
      const employees = await invoke<AIEmployee[]>('get_all_employees');
      set({ employees, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch employees:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  // Fetch user's hired employees
  fetchMyEmployees: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const myEmployees = await invoke<AIEmployee[]>('get_user_employees', { userId });
      set({ myEmployees, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch hired employees:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  // Fetch featured/recommended employees
  fetchFeaturedEmployees: async () => {
    set({ isLoading: true, error: null });
    try {
      const featuredEmployees = await invoke<AIEmployee[]>('get_featured_employees');
      set({ featuredEmployees, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch featured employees:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  // Fetch usage statistics for hired employees
  fetchEmployeeStats: async (userId: string) => {
    try {
      const stats = await invoke<EmployeeUsageStats[]>('get_employee_stats', { userId });
      const statsMap = new Map<string, EmployeeUsageStats>();
      stats.forEach(stat => statsMap.set(stat.employee_id, stat));
      set({ employeeStats: statsMap });
    } catch (error) {
      console.error('Failed to fetch employee stats:', error);
    }
  },

  // Search employees
  searchEmployees: async (query: string) => {
    set({ searchQuery: query, isLoading: true, error: null });
    try {
      const employees = await invoke<AIEmployee[]>('search_employees', { query });
      set({ employees, isLoading: false });
    } catch (error) {
      console.error('Failed to search employees:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  // Hire an employee
  hireEmployee: async (employeeId: string, userId: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('hire_employee', { userId, employeeId });

      // Update local state
      const { employees, myEmployees } = get();
      const employee = employees.find(e => e.id === employeeId);

      if (employee) {
        const updatedEmployee = { ...employee, is_hired: true };
        set({
          employees: employees.map(e => e.id === employeeId ? updatedEmployee : e),
          myEmployees: [...myEmployees, updatedEmployee],
          isLoading: false,
        });

        // Refresh stats
        await get().fetchEmployeeStats(userId);
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('Failed to hire employee:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  // Fire an employee
  fireEmployee: async (employeeId: string, userId: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('fire_employee', { userId, employeeId });

      // Update local state
      const { employees, myEmployees } = get();
      set({
        employees: employees.map(e => e.id === employeeId ? { ...e, is_hired: false } : e),
        myEmployees: myEmployees.filter(e => e.id !== employeeId),
        isLoading: false,
      });

      // Clear stats for fired employee
      const statsMap = new Map(get().employeeStats);
      statsMap.delete(employeeId);
      set({ employeeStats: statsMap });
    } catch (error) {
      console.error('Failed to fire employee:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  // Run employee demo
  runDemo: async (employeeId: string) => {
    set({ isDemoRunning: true, error: null, demoResults: null });
    try {
      const results = await invoke<DemoResult>('run_employee_demo', { employeeId });
      set({ demoResults: results, isDemoRunning: false });
    } catch (error) {
      console.error('Failed to run demo:', error);
      set({ error: String(error), isDemoRunning: false });
      throw error;
    }
  },

  // Set selected employee for detail view
  setSelectedEmployee: (employee: AIEmployee | null) => {
    set({ selectedEmployee: employee });
  },

  // Set search query
  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  // Set category filter
  setSelectedCategory: (category: EmployeeRole | 'all') => {
    set({ selectedCategory: category });
  },

  // Clear demo results
  clearDemoResults: () => {
    set({ demoResults: null });
  },

  // Reset store
  reset: () => {
    set({
      employees: [],
      myEmployees: [],
      featuredEmployees: [],
      employeeStats: new Map(),
      isLoading: false,
      error: null,
      searchQuery: '',
      selectedCategory: 'all',
      selectedEmployee: null,
      demoResults: null,
      isDemoRunning: false,
    });
  },
}));

// Selectors for optimized subscriptions
export const selectEmployees = (state: EmployeeState) => state.employees;
export const selectMyEmployees = (state: EmployeeState) => state.myEmployees;
export const selectFeaturedEmployees = (state: EmployeeState) => state.featuredEmployees;
export const selectIsLoading = (state: EmployeeState) => state.isLoading;
export const selectError = (state: EmployeeState) => state.error;
export const selectSearchQuery = (state: EmployeeState) => state.searchQuery;
export const selectSelectedCategory = (state: EmployeeState) => state.selectedCategory;
export const selectSelectedEmployee = (state: EmployeeState) => state.selectedEmployee;
export const selectDemoResults = (state: EmployeeState) => state.demoResults;
export const selectIsDemoRunning = (state: EmployeeState) => state.isDemoRunning;
export const selectEmployeeStats = (state: EmployeeState) => state.employeeStats;

// Filtered employees selector
export const selectFilteredEmployees = (state: EmployeeState) => {
  let filtered = state.employees;

  // Apply category filter
  if (state.selectedCategory !== 'all') {
    filtered = filtered.filter(e => e.role === state.selectedCategory);
  }

  // Apply search filter
  if (state.searchQuery.trim()) {
    const query = state.searchQuery.toLowerCase();
    filtered = filtered.filter(e =>
      e.name.toLowerCase().includes(query) ||
      e.description.toLowerCase().includes(query) ||
      e.capabilities.some(c => c.toLowerCase().includes(query))
    );
  }

  return filtered;
};
