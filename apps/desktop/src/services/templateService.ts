import { invoke } from '../lib/tauri-mock';
import type { AgentTemplate, TemplateCategory } from '../types/templates';

export class TemplateService {
  static async getAllTemplates(): Promise<AgentTemplate[]> {
    return await invoke<AgentTemplate[]>('get_all_templates');
  }

  static async getTemplateById(id: string): Promise<AgentTemplate | null> {
    return await invoke<AgentTemplate | null>('get_template_by_id', { id });
  }

  static async getTemplatesByCategory(category: TemplateCategory): Promise<AgentTemplate[]> {
    return await invoke<AgentTemplate[]>('get_templates_by_category', {
      category,
    });
  }

  static async installTemplate(templateId: string): Promise<void> {
    return await invoke<void>('install_template', { template_id: templateId });
  }

  static async uninstallTemplate(templateId: string): Promise<void> {
    return await invoke<void>('uninstall_template', {
      template_id: templateId,
    });
  }

  static async getInstalledTemplates(): Promise<AgentTemplate[]> {
    return await invoke<AgentTemplate[]>('get_installed_templates');
  }

  static async searchTemplates(query: string): Promise<AgentTemplate[]> {
    return await invoke<AgentTemplate[]>('search_templates', { query });
  }

  static async executeTemplate(
    templateId: string,
    params: Record<string, string>,
  ): Promise<string> {
    return await invoke<string>('execute_template', {
      template_id: templateId,
      params,
    });
  }

  static async getTemplateCategories(): Promise<string[]> {
    return await invoke<string[]>('get_template_categories');
  }
}
