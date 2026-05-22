import type { ProjectRole, TaskPriority, TaskStatus } from '@/lib/types';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
        };
        Update: {
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          slug: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          name: string;
          slug: string;
          description?: string | null;
        };
        Update: {
          name?: string;
          slug?: string;
          description?: string | null;
        };
        Relationships: [];
      };
      project_members: {
        Row: {
          project_id: string;
          user_id: string;
          role: ProjectRole;
          created_at: string;
        };
        Insert: {
          project_id: string;
          user_id: string;
          role: ProjectRole;
        };
        Update: {
          role?: ProjectRole;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          project_id: string;
          creator_id: string;
          assignee_id: string | null;
          title: string;
          body: string | null;
          status: TaskStatus;
          priority: TaskPriority;
          due_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          creator_id: string;
          assignee_id?: string | null;
          title: string;
          body?: string | null;
          status?: TaskStatus;
          priority?: TaskPriority;
          due_at?: string | null;
        };
        Update: {
          assignee_id?: string | null;
          title?: string;
          body?: string | null;
          status?: TaskStatus;
          priority?: TaskPriority;
          due_at?: string | null;
        };
        Relationships: [];
      };
      activity_events: {
        Row: {
          id: string;
          project_id: string;
          actor_id: string;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          project_id: string;
          actor_id: string;
          event_type: string;
          payload?: Json;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      has_project_role: {
        Args: { project_uuid: string; allowed_roles: ProjectRole[] };
        Returns: boolean;
      };
      create_project: {
        Args: { p_name: string; p_description?: string | null };
        Returns: Database['public']['Tables']['projects']['Row'];
      };
    };
    Enums: {
      project_role: ProjectRole;
      task_status: TaskStatus;
      task_priority: TaskPriority;
    };
    CompositeTypes: Record<string, never>;
  };
}
