/**
 * Metrics collection and Prometheus export
 *
 * Exposes metrics in Prometheus text format at /metrics endpoint:
 * - signaling_connections_total: Total active WebSocket connections
 * - signaling_sessions_active: Active pairing sessions in memory
 * - signaling_messages_total: Total messages processed by type
 * - signaling_errors_total: Total errors by type
 * - signaling_pairing_requests_total: Total pairing requests
 * - signaling_uptime_seconds: Server uptime
 * - signaling_memory_usage_bytes: Memory usage
 */

interface Counters {
  messages: Map<string, number>;
  errors: Map<string, number>;
  pairingRequests: number;
  pairingSuccess: number;
  pairingFailure: number;
}

class MetricsCollector {
  private startTime = Date.now();
  private counters: Counters = {
    messages: new Map(),
    errors: new Map(),
    pairingRequests: 0,
    pairingSuccess: 0,
    pairingFailure: 0,
  };

  // External state callbacks
  private getConnectionCount: () => number = () => 0;
  private getSessionCount: () => number = () => 0;

  /**
   * Set callback for getting current connection count
   */
  setConnectionCountCallback(callback: () => number): void {
    this.getConnectionCount = callback;
  }

  /**
   * Set callback for getting current session count
   */
  setSessionCountCallback(callback: () => number): void {
    this.getSessionCount = callback;
  }

  /**
   * Increment message counter
   */
  recordMessage(type: string): void {
    const current = this.counters.messages.get(type) ?? 0;
    this.counters.messages.set(type, current + 1);
  }

  /**
   * Increment error counter
   */
  recordError(type: string): void {
    const current = this.counters.errors.get(type) ?? 0;
    this.counters.errors.set(type, current + 1);
  }

  /**
   * Record a pairing request
   */
  recordPairingRequest(success: boolean): void {
    this.counters.pairingRequests++;
    if (success) {
      this.counters.pairingSuccess++;
    } else {
      this.counters.pairingFailure++;
    }
  }

  /**
   * Get uptime in seconds
   */
  getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get memory usage in bytes
   */
  getMemoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  /**
   * Export metrics in Prometheus text format
   */
  toPrometheusFormat(): string {
    const lines: string[] = [];
    const memUsage = this.getMemoryUsage();

    // Uptime
    lines.push('# HELP signaling_uptime_seconds Server uptime in seconds');
    lines.push('# TYPE signaling_uptime_seconds gauge');
    lines.push(`signaling_uptime_seconds ${this.getUptimeSeconds()}`);

    // Connections
    lines.push('# HELP signaling_connections_total Total active WebSocket connections');
    lines.push('# TYPE signaling_connections_total gauge');
    lines.push(`signaling_connections_total ${this.getConnectionCount()}`);

    // Sessions
    lines.push('# HELP signaling_sessions_active Active pairing sessions in memory');
    lines.push('# TYPE signaling_sessions_active gauge');
    lines.push(`signaling_sessions_active ${this.getSessionCount()}`);

    // Messages
    lines.push('# HELP signaling_messages_total Total messages processed');
    lines.push('# TYPE signaling_messages_total counter');
    for (const [type, count] of this.counters.messages) {
      lines.push(`signaling_messages_total{type="${type}"} ${count}`);
    }
    if (this.counters.messages.size === 0) {
      lines.push('signaling_messages_total{type="none"} 0');
    }

    // Errors
    lines.push('# HELP signaling_errors_total Total errors by type');
    lines.push('# TYPE signaling_errors_total counter');
    for (const [type, count] of this.counters.errors) {
      lines.push(`signaling_errors_total{type="${type}"} ${count}`);
    }
    if (this.counters.errors.size === 0) {
      lines.push('signaling_errors_total{type="none"} 0');
    }

    // Pairing requests
    lines.push('# HELP signaling_pairing_requests_total Total pairing requests');
    lines.push('# TYPE signaling_pairing_requests_total counter');
    lines.push(
      `signaling_pairing_requests_total{status="success"} ${this.counters.pairingSuccess}`,
    );
    lines.push(
      `signaling_pairing_requests_total{status="failure"} ${this.counters.pairingFailure}`,
    );

    // Memory usage
    lines.push('# HELP signaling_memory_bytes Memory usage in bytes');
    lines.push('# TYPE signaling_memory_bytes gauge');
    lines.push(`signaling_memory_bytes{type="heapUsed"} ${memUsage.heapUsed}`);
    lines.push(`signaling_memory_bytes{type="heapTotal"} ${memUsage.heapTotal}`);
    lines.push(`signaling_memory_bytes{type="rss"} ${memUsage.rss}`);
    lines.push(`signaling_memory_bytes{type="external"} ${memUsage.external}`);

    return lines.join('\n');
  }

  /**
   * Get metrics as JSON object
   */
  toJSON(): {
    uptime: number;
    connections: number;
    sessions: number;
    messages: Record<string, number>;
    errors: Record<string, number>;
    pairingRequests: { total: number; success: number; failure: number };
    memory: NodeJS.MemoryUsage;
  } {
    const memUsage = this.getMemoryUsage();
    return {
      uptime: this.getUptimeSeconds(),
      connections: this.getConnectionCount(),
      sessions: this.getSessionCount(),
      messages: Object.fromEntries(this.counters.messages),
      errors: Object.fromEntries(this.counters.errors),
      pairingRequests: {
        total: this.counters.pairingRequests,
        success: this.counters.pairingSuccess,
        failure: this.counters.pairingFailure,
      },
      memory: memUsage,
    };
  }
}

// Export singleton instance
export const metrics = new MetricsCollector();
