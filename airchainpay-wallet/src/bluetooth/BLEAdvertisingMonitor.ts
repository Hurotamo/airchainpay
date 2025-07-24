import { Platform } from 'react-native';
import { logger } from '../utils/Logger';

/**
 * BLE Advertising Monitor
 * Provides monitoring, analytics, and performance tracking for BLE advertising
 */

export interface MonitoringConfig {
  enablePerformanceTracking: boolean;
  enableErrorTracking: boolean;
  enableUsageAnalytics: boolean;
  samplingRate: number; // Percentage of events to track (0-100)
  maxEventHistory: number;
}

export interface PerformanceMetrics {
  startTime: number;
  stopTime?: number;
  duration: number;
  batteryImpact: number;
  memoryUsage: number;
  cpuUsage: number;
  advertisingInterval: number;
  packetLoss: number;
  signalStrength: number;
}

export interface ErrorMetrics {
  errorType: string;
  errorMessage: string;
  timestamp: number;
  deviceInfo: {
    platform: string;
    version: string;
    model: string;
  };
  context: {
    advertisingState: string;
    bluetoothState: string;
    permissions: string[];
  };
}

export interface UsageAnalytics {
  sessionId: string;
  deviceName: string;
  startTime: number;
  endTime?: number;
  duration: number;
  advertisingMode: string;
  securityEnabled: boolean;
  encryptionEnabled: boolean;
  authenticationEnabled: boolean;
  totalPacketsSent: number;
  totalBytesTransmitted: number;
  averageSignalStrength: number;
  connectionAttempts: number;
  successfulConnections: number;
  failedConnections: number;
}

export class BLEAdvertisingMonitor {
  private static instance: BLEAdvertisingMonitor | null = null;
  private performanceMetrics: Map<string, PerformanceMetrics> = new Map();
  private errorMetrics: Map<string, ErrorMetrics[]> = new Map();
  private usageAnalytics: Map<string, UsageAnalytics> = new Map();
  private eventHistory: { type: string; data: unknown; timestamp: number }[] = [];
  private config: MonitoringConfig;

  private constructor() {
    this.config = {
      enablePerformanceTracking: true,
      enableErrorTracking: true,
      enableUsageAnalytics: true,
      samplingRate: 100, // Track all events
      maxEventHistory: 1000
    };
  }

  public static getInstance(): BLEAdvertisingMonitor {
    if (!BLEAdvertisingMonitor.instance) {
      BLEAdvertisingMonitor.instance = new BLEAdvertisingMonitor();
    }
    return BLEAdvertisingMonitor.instance;
  }

  /**
   * Configure monitoring settings
   */
  configureMonitoring(config: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[BLE] Monitoring configuration updated', this.config);
  }

  /**
   * Start monitoring advertising session
   */
  startMonitoring(sessionId: string, deviceName: string, advertisingMode: string): void {
    if (!this.config.enablePerformanceTracking) {
      return;
    }

    const metrics: PerformanceMetrics = {
      startTime: Date.now(),
      duration: 0,
      batteryImpact: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      advertisingInterval: 100,
      packetLoss: 0,
      signalStrength: -50 // Default signal strength
    };

    this.performanceMetrics.set(sessionId, metrics);

    // Start usage analytics
    if (this.config.enableUsageAnalytics) {
      const analytics: UsageAnalytics = {
        sessionId,
        deviceName,
        startTime: Date.now(),
        duration: 0,
        advertisingMode,
        securityEnabled: false,
        encryptionEnabled: false,
        authenticationEnabled: false,
        totalPacketsSent: 0,
        totalBytesTransmitted: 0,
        averageSignalStrength: -50,
        connectionAttempts: 0,
        successfulConnections: 0,
        failedConnections: 0
      };

      this.usageAnalytics.set(sessionId, analytics);
    }

    this.recordEvent('monitoring_started', { sessionId, deviceName, advertisingMode });
    logger.info('[BLE] Monitoring started', { sessionId, deviceName });
  }

  /**
   * Stop monitoring advertising session
   */
  stopMonitoring(sessionId: string): void {
    const metrics = this.performanceMetrics.get(sessionId);
    if (metrics) {
      metrics.stopTime = Date.now();
      metrics.duration = metrics.stopTime - metrics.startTime;
    }

    const analytics = this.usageAnalytics.get(sessionId);
    if (analytics) {
      analytics.endTime = Date.now();
      analytics.duration = analytics.endTime - analytics.startTime;
    }

    this.recordEvent('monitoring_stopped', { sessionId });
    logger.info('[BLE] Monitoring stopped', { sessionId });
  }

  /**
   * Record performance metrics
   */
  recordPerformanceMetrics(sessionId: string, metrics: Partial<PerformanceMetrics>): void {
    if (!this.config.enablePerformanceTracking) {
      return;
    }

    const currentMetrics = this.performanceMetrics.get(sessionId);
    if (currentMetrics) {
      Object.assign(currentMetrics, metrics);
    }
  }

  /**
   * Record error metrics
   */
  recordErrorMetrics(sessionId: string, error: Error, context: unknown): void {
    if (!this.config.enableErrorTracking) {
      return;
    }

    const errorMetrics: ErrorMetrics = {
      errorType: error.constructor.name,
      errorMessage: error.message,
      timestamp: Date.now(),
      deviceInfo: {
        platform: Platform.OS,
        version: Platform.Version?.toString() || 'unknown',
        model: 'unknown'
      },
      context: {
        advertisingState: (context as any).advertisingState || 'unknown',
        bluetoothState: (context as any).bluetoothState || 'unknown',
        permissions: (context as any).permissions || []
      }
    };

    if (!this.errorMetrics.has(sessionId)) {
      this.errorMetrics.set(sessionId, []);
    }

    this.errorMetrics.get(sessionId)!.push(errorMetrics);
    this.recordEvent('error_recorded', { sessionId, errorType: errorMetrics.errorType });
  }

  /**
   * Update usage analytics
   */
  updateUsageAnalytics(sessionId: string, updates: Partial<UsageAnalytics>): void {
    if (!this.config.enableUsageAnalytics) {
      return;
    }

    const analytics = this.usageAnalytics.get(sessionId);
    if (analytics) {
      Object.assign(analytics, updates);
    }
  }

  /**
   * Record event for analytics
   */
  private recordEvent(type: string, data: unknown): void {
    if (Math.random() * 100 > this.config.samplingRate) {
      return; // Skip based on sampling rate
    }

    this.eventHistory.push({
      type,
      data,
      timestamp: Date.now()
    });

    // Maintain event history size
    if (this.eventHistory.length > this.config.maxEventHistory) {
      this.eventHistory = this.eventHistory.slice(-this.config.maxEventHistory);
    }
  }

  /**
   * Get performance metrics for session
   */
  getPerformanceMetrics(sessionId: string): PerformanceMetrics | undefined {
    return this.performanceMetrics.get(sessionId);
  }

  /**
   * Get error metrics for session
   */
  getErrorMetrics(sessionId: string): ErrorMetrics[] | undefined {
    return this.errorMetrics.get(sessionId);
  }

  /**
   * Get usage analytics for session
   */
  getUsageAnalytics(sessionId: string): UsageAnalytics | undefined {
    return this.usageAnalytics.get(sessionId);
  }

  /**
   * Get comprehensive monitoring report
   */
  getMonitoringReport(sessionId: string): {
    performance: PerformanceMetrics | undefined;
    errors: ErrorMetrics[] | undefined;
    analytics: UsageAnalytics | undefined;
    eventCount: number;
  } {
    const events = this.eventHistory.filter(e => (e.data as any).sessionId === sessionId);
    
    return {
      performance: this.getPerformanceMetrics(sessionId),
      errors: this.getErrorMetrics(sessionId),
      analytics: this.getUsageAnalytics(sessionId),
      eventCount: events.length
    };
  }

  /**
   * Get overall statistics
   */
  getOverallStatistics(): {
    totalSessions: number;
    totalErrors: number;
    averageSessionDuration: number;
    averageSignalStrength: number;
    totalBytesTransmitted: number;
    successRate: number;
  } {
    const sessions = Array.from(this.usageAnalytics.values());
    const errors = Array.from(this.errorMetrics.values()).flat();
    
    const totalSessions = sessions.length;
    const totalErrors = errors.length;
    const averageSessionDuration = sessions.length > 0 
      ? sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length 
      : 0;
    const averageSignalStrength = sessions.length > 0
      ? sessions.reduce((sum, s) => sum + s.averageSignalStrength, 0) / sessions.length
      : 0;
    const totalBytesTransmitted = sessions.reduce((sum, s) => sum + s.totalBytesTransmitted, 0);
    const successfulSessions = sessions.filter(s => s.successfulConnections > 0).length;
    const successRate = totalSessions > 0 ? (successfulSessions / totalSessions) * 100 : 0;

    return {
      totalSessions,
      totalErrors,
      averageSessionDuration,
      averageSignalStrength,
      totalBytesTransmitted,
      successRate
    };
  }

  /**
   * Export monitoring data
   */
  exportMonitoringData(): {
    performanceMetrics: Map<string, PerformanceMetrics>;
    errorMetrics: Map<string, ErrorMetrics[]>;
    usageAnalytics: Map<string, UsageAnalytics>;
    eventHistory: { type: string; data: unknown; timestamp: number }[];
    statistics: {
      totalSessions: number;
      totalErrors: number;
      averageSessionDuration: number;
      averageSignalStrength: number;
      totalBytesTransmitted: number;
      successRate: number;
    };
  } {
    return {
      performanceMetrics: new Map(this.performanceMetrics),
      errorMetrics: new Map(this.errorMetrics),
      usageAnalytics: new Map(this.usageAnalytics),
      eventHistory: [...this.eventHistory],
      statistics: this.getOverallStatistics()
    };
  }

  /**
   * Clear monitoring data
   */
  clearMonitoringData(): void {
    this.performanceMetrics.clear();
    this.errorMetrics.clear();
    this.usageAnalytics.clear();
    this.eventHistory = [];
    logger.info('[BLE] Monitoring data cleared');
  }

  /**
   * Generate monitoring report
   */
  generateReport(): string {
    const stats = this.getOverallStatistics();
    const config = this.config;
    
    return `
BLE Advertising Monitoring Report
================================

Configuration:
- Performance Tracking: ${config.enablePerformanceTracking ? 'Enabled' : 'Disabled'}
- Error Tracking: ${config.enableErrorTracking ? 'Enabled' : 'Disabled'}
- Usage Analytics: ${config.enableUsageAnalytics ? 'Enabled' : 'Disabled'}
- Sampling Rate: ${config.samplingRate}%

Statistics:
- Total Sessions: ${stats.totalSessions}
- Total Errors: ${stats.totalErrors}
- Average Session Duration: ${Math.round(stats.averageSessionDuration)}ms
- Average Signal Strength: ${Math.round(stats.averageSignalStrength)}dBm
- Total Bytes Transmitted: ${stats.totalBytesTransmitted}
- Success Rate: ${Math.round(stats.successRate)}%

Event History:
- Total Events: ${this.eventHistory.length}
- Recent Events: ${this.eventHistory.slice(-5).map(e => e.type).join(', ')}
    `.trim();
  }
} 