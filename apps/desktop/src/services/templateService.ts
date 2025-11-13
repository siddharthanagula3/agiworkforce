import { invoke } from '@tauri-apps/api/core';
import type { AgentTemplate, TemplateCategory } from '../types/templates';

/**
 * Template Service - Wrapper for Tauri commands
 */
export class TemplateService {
  /**
   * Get all available templates
   */
  static async getAllTemplates(): Promise<AgentTemplate[]> {
    return await invoke<AgentTemplate[]>('get_all_templates');
  }

  /**
   * Get template by ID
   */
  static async getTemplateById(id: string): Promise<AgentTemplate | null> {
    return await invoke<AgentTemplate | null>('get_template_by_id', { id });
  }

  /**
   * Get templates by category
   */
  static async getTemplatesByCategory(category: TemplateCategory): Promise<AgentTemplate[]> {
    return await invoke<AgentTemplate[]>('get_templates_by_category', {
      category,
    });
  }

  /**
   * Install a template
   */
  static async installTemplate(templateId: string): Promise<void> {
    return await invoke<void>('install_template', { template_id: templateId });
  }

  /**
   * Uninstall a template
   */
  static async uninstallTemplate(templateId: string): Promise<void> {
    return await invoke<void>('uninstall_template', {
      template_id: templateId,
    });
  }

  /**
   * Get installed templates
   */
  static async getInstalledTemplates(): Promise<AgentTemplate[]> {
    return await invoke<AgentTemplate[]>('get_installed_templates');
  }

  /**
   * Search templates by query
   */
  static async searchTemplates(query: string): Promise<AgentTemplate[]> {
    return await invoke<AgentTemplate[]>('search_templates', { query });
  }

  /**
   * Execute a template
   */
  static async executeTemplate(
    templateId: string,
    params: Record<string, string>,
  ): Promise<string> {
    return await invoke<string>('execute_template', {
      template_id: templateId,
      params,
    });
  }

  /**
   * Get template categories
   */
  static async getTemplateCategories(): Promise<string[]> {
    return await invoke<string[]>('get_template_categories');
  }
}
