'use client';

import {
  getHostBridge,
  type SimulatorAppearance,
  type SimulatorCapture,
  type SimulatorCaptureImage,
  type SimulatorClipboardResult,
  type SimulatorFrame,
  type SimulatorSettings,
  type SimulatorStatus,
  type SimulatorStatusBar,
} from '@agiworkforce/local-runtime-contract';
import { invokeDesktopRuntime } from './runtime-client';

export function readSimulatorStatus(): Promise<SimulatorStatus> {
  return invokeDesktopRuntime<SimulatorStatus>('simulator_status');
}

export function bootSimulator(udid: string): Promise<SimulatorStatus> {
  return invokeDesktopRuntime<SimulatorStatus>('simulator_boot', { udid });
}

export function shutdownSimulator(udid: string): Promise<SimulatorStatus> {
  return invokeDesktopRuntime<SimulatorStatus>('simulator_shutdown', { udid });
}

export function readSimulatorFrame(udid: string): Promise<SimulatorFrame> {
  return invokeDesktopRuntime<SimulatorFrame>('simulator_frame', { udid });
}

export function readSimulatorSettings(udid: string): Promise<SimulatorSettings> {
  return invokeDesktopRuntime<SimulatorSettings>('simulator_settings', { udid });
}

export function setSimulatorAppearance(
  udid: string,
  appearance: SimulatorAppearance,
): Promise<SimulatorSettings> {
  return invokeDesktopRuntime<SimulatorSettings>('simulator_set_appearance', { udid, appearance });
}

export function setSimulatorStatusBar(
  udid: string,
  statusBar: SimulatorStatusBar,
): Promise<SimulatorSettings> {
  return invokeDesktopRuntime<SimulatorSettings>('simulator_set_status_bar', { udid, statusBar });
}

export function pressSimulatorHome(udid: string): Promise<boolean> {
  return invokeDesktopRuntime<boolean>('simulator_home', { udid });
}

export function takeSimulatorScreenshot(udid: string): Promise<SimulatorCapture> {
  return invokeDesktopRuntime<SimulatorCapture>('simulator_screenshot', { udid });
}

export function startSimulatorRecording(udid: string): Promise<SimulatorStatus> {
  return invokeDesktopRuntime<SimulatorStatus>('simulator_record_start', { udid });
}

export function stopSimulatorRecording(): Promise<SimulatorStatus> {
  return invokeDesktopRuntime<SimulatorStatus>('simulator_record_stop');
}

export function copySimulatorClipboard(udid: string): Promise<SimulatorClipboardResult> {
  return invokeDesktopRuntime<SimulatorClipboardResult>('simulator_clipboard_get', { udid });
}

export function sendClipboardToSimulator(udid: string): Promise<SimulatorClipboardResult> {
  return invokeDesktopRuntime<SimulatorClipboardResult>('simulator_clipboard_send', { udid });
}

export function readSimulatorCapture(id: string): Promise<SimulatorCaptureImage> {
  return invokeDesktopRuntime<SimulatorCaptureImage>('simulator_capture_read', { id });
}

export function revealSimulatorCapture(id: string): Promise<boolean> {
  return invokeDesktopRuntime<boolean>('simulator_capture_reveal', { id });
}

export function deleteSimulatorCapture(id: string): Promise<SimulatorStatus> {
  return invokeDesktopRuntime<SimulatorStatus>('simulator_capture_delete', { id });
}

export function onSimulatorChanged(listener: (status: SimulatorStatus) => void): () => void {
  const host = getHostBridge();
  if (!host) return () => undefined;
  return host.onRuntimeEvent((event) => {
    if (event.kind === 'simulator-changed') listener(event.status);
  });
}
