export interface TerminalOutput {
  terminalName: string;
  transcript: string;
}

export interface TerminalOutputSource {
  latestOutput(): TerminalOutput | undefined;
}

let source: TerminalOutputSource | undefined;

export function setTerminalOutputSource(next: TerminalOutputSource | undefined): void {
  source = next;
}

export function latestTerminalOutput(): TerminalOutput | undefined {
  return source?.latestOutput();
}
