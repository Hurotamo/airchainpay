import { logger } from '../utils/Logger';

/**
 * BLE Advertising Monitor for simplified payment data
 */
export interface MonitoringConfig {
  sessionId: string;
  deviceName: string;
  mode: 'basic' | 'enhanced' | 'secure';
  paymentData?: {
    walletAddress: string;
    amount: string;
    token: string;
    chainId?: string;
  };
}

export interface MonitoringMetrics {
  startTime: number;
  endTime?: number;
  duration: number;
  success: boolean;
  errorCount: number;
  signalStrength: number;
  bytesTransmitted: number;
  successRate: number;
}

export class BLEAdvertisingMonitor {
  private static instance: BLEAdvertisingMonitor | null = null;
  private activeSessions: Map<string, MonitoringConfig> = new Map();
  private metrics: Map<string, MonitoringMetrics> = new Map();
  private errorLogs: Map<string, string[]> = new Map();

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): BLEAdvertisingMonitor {
    if (!BLEAdvertisingMonitor.instance) {
      BLEAdvertisingMonitor.instance = new BLEAdvertisingMonitor();
    }
    return BLEAdvertisingMonitor.instance;
  }

  /**
   * Start monitoring advertising session
   */
  startMonitoring(config: MonitoringConfig): void {
    const { sessionId, deviceName, mode } = config;
    
    logger.info('[BLE Monitor] Starting monitoring', { sessionId, deviceName, mode });
    
    this.activeSessions.set(sessionId, config);
    
    // Initialize metrics
    this.metrics.set(sessionId, {
      startTime: Date.now(),
      duration: 0,
      success: false,
      errorCount: 0,
      signalStrength: 0,
      bytesTransmitted: 0,
      successRate: 0
    });
    
    // Initialize error logs
    this.errorLogs.set(sessionId, []);
    
    logger.info('[BLE Monitor] Monitoring started successfully', { sessionId });
  }

  /**
   * Stop monitoring advertising session
   */
  stopMonitoring(sessionId: string): void {
    const config = this.activeSessions.get(sessionId);
    if (!config) {
      logger.warn('[BLE Monitor] Session not found for stopping:', sessionId);
      return;
    }
    
    logger.info('[BLE Monitor] Stopping monitoring', { sessionId, deviceName: config.deviceName });
    
    // Update metrics
    const metrics = this.metrics.get(sessionId);
    if (metrics) {
      metrics.endTime = Date.now();
      metrics.duration = metrics.endTime - metrics.startTime;
      metrics.success = metrics.errorCount === 0;
      metrics.successRate = metrics.errorCount === 0 ? 100 : 0;
    }
    
    // Clean up
    this.activeSessions.delete(sessionId);
    this.errorLogs.delete(sessionId);
    
    logger.info('[BLE Monitor] Monitoring stopped', { sessionId, duration: metrics?.duration });
  }

  /**
   * Record error metrics
   */
  recordErrorMetrics(sessionId: string, error: Error, context: any): void {
    const metrics = this.metrics.get(sessionId);
    if (metrics) {
      metrics.errorCount++;
    }
    
    // Log error
    const errorLogs = this.errorLogs.get(sessionId) || [];
    errorLogs.push(`${Date.now()}: ${error.message}`);
    this.errorLogs.set(sessionId, errorLogs);
    
    logger.error('[BLE Monitor] Error recorded', { 
      sessionId, 
      error: error.message, 
      context 
    });
  }

  /**
   * Record success metrics
   */
  recordSuccessMetrics(sessionId: string, bytesTransmitted: number = 0): void {
    const metrics = this.metrics.get(sessionId);
    if (metrics) {
      metrics.bytesTransmitted += bytesTransmitted;
      metrics.successRate = 100; // Assume success if this is called
    }
    
    logger.info('[BLE Monitor] Success recorded', { sessionId, bytesTransmitted });
  }

  /**
   * Record signal strength
   */
  recordSignalStrength(sessionId: string, strength: number): void {
    const metrics = this.metrics.get(sessionId);
    if (metrics) {
      metrics.signalStrength = strength;
    }
    
    logger.debug('[BLE Monitor] Signal strength recorded', { sessionId, strength });
  }

  /**
   * Get monitoring statistics
   */
  getMonitoringStatistics(): {
    totalSessions: number;
    activeSessions: number;
    totalErrors: number;
    averageSessionDuration: number;
    averageSignalStrength: number;
    totalBytesTransmitted: number;
    successRate: number;
  } {
    const sessions = Array.from(this.metrics.values());
    const totalSessions = sessions.length;
    const activeSessions = this.activeSessions.size;
    const totalErrors = sessions.reduce((sum, s) => sum + s.errorCount, 0);
    const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
    const totalSignalStrength = sessions.reduce((sum, s) => sum + s.signalStrength, 0);
    const totalBytes = sessions.reduce((sum, s) => sum + s.bytesTransmitted, 0);
    const totalSuccessRate = sessions.reduce((sum, s) => sum + s.successRate, 0);
    
    return {
      totalSessions,
      activeSessions,
      totalErrors,
      averageSessionDuration: totalSessions > 0 ? totalDuration / totalSessions : 0,
      averageSignalStrength: totalSessions > 0 ? totalSignalStrength / totalSessions : 0,
      totalBytesTransmitted: totalBytes,
      successRate: totalSessions > 0 ? totalSuccessRate / totalSessions : 0
    };
  }

  /**
   * Get session metrics
   */
  getSessionMetrics(sessionId: string): MonitoringMetrics | undefined {
    return this.metrics.get(sessionId);
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): Map<string, MonitoringConfig> {
    return new Map(this.activeSessions);
  }

  /**
   * Check if session is active
   */
  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Get session error logs
   */
  getSessionErrorLogs(sessionId: string): string[] {
    return this.errorLogs.get(sessionId) || [];
  }

  /**
   * Clear old metrics
   */
  clearOldMetrics(maxAge: number = 24 * 60 * 60 * 1000): void { // 24 hours default
    const now = Date.now();
    const oldSessions = Array.from(this.metrics.entries()).filter(([_, metrics]) => {
      return (now - metrics.startTime) > maxAge;
    });

    oldSessions.forEach(([sessionId, _]) => {
      this.metrics.delete(sessionId);
      this.activeSessions.delete(sessionId);
      this.errorLogs.delete(sessionId);
    });

    if (oldSessions.length > 0) {
      logger.info('[BLE Monitor] Cleared old metrics', { count: oldSessions.length });
    }
  }

  /**
   * Get monitoring report
   */
  getMonitoringReport(): string {
    const stats = this.getMonitoringStatistics();
    const activeSessions = this.getActiveSessions();
    
    let report = '=== BLE Advertising Monitor Report ===\n';
    report += `Total Sessions: ${stats.totalSessions}\n`;
    report += `Active Sessions: ${stats.activeSessions}\n`;
    report += `Total Errors: ${stats.totalErrors}\n`;
    report += `Average Session Duration: ${Math.round(stats.averageSessionDuration)}ms\n`;
    report += `Average Signal Strength: ${stats.averageSignalStrength.toFixed(2)}dBm\n`;
    report += `Total Bytes Transmitted: ${stats.totalBytesTransmitted}\n`;
    report += `Success Rate: ${stats.successRate.toFixed(2)}%\n\n`;
    
    if (activeSessions.size > 0) {
      report += 'Active Sessions:\n';
      activeSessions.forEach((config, sessionId) => {
        report += `- ${sessionId}: ${config.deviceName} (${config.mode})\n`;
      });
    }
    
    return report;
  }

  /**
   * Clean up all monitoring data
   */
  cleanup(): void {
    logger.info('[BLE Monitor] Cleaning up monitoring data');
    
    this.activeSessions.clear();
    this.metrics.clear();
    this.errorLogs.clear();
    
    logger.info('[BLE Monitor] Cleanup completed');
  }
} 