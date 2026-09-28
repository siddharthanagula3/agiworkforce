import * as vscode from 'vscode';

export interface ApprovalAnswer {
  cwd: string;
  threadId: string;
  turnId: string;
  requestId: string;
  approved: boolean;
}

const answeredOnPhone = new vscode.EventEmitter<ApprovalAnswer>();
const answeredInEditor = new vscode.EventEmitter<ApprovalAnswer>();

export const onApprovalAnsweredOnPhone = answeredOnPhone.event;
export const onApprovalAnsweredInEditor = answeredInEditor.event;

export function approvalAnsweredOnPhone(answer: ApprovalAnswer): void {
  answeredOnPhone.fire(answer);
}

export function approvalAnsweredInEditor(answer: ApprovalAnswer): void {
  answeredInEditor.fire(answer);
}
