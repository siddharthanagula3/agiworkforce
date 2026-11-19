export interface AssistantFenceEditRequest {
  language: string;
  identity: string;
  content: string;
}

export class AssistantFenceEditError extends Error {}
