import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

// Log levels
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

// Logger configuration
interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFileLogging: boolean;
  maxLogFiles: number;
  maxLogSize: number; // in bytes
}

// Default configuration
const DEFAULT_CONFIG: LoggerConfig = {
  level: __DEV__ ? LogLevel.DEBUG : LogLevel.INFO,
  enableConsole: true,
  enableFileLogging: !__DEV__, // Only log to file in production
  maxLogFiles: 5,
  maxLogSize: 1024 * 1024 // 1MB
};

class Logger {
  private config: LoggerConfig;
  private logDir: string;
  private currentLogFile: string;
  private logQueue: string[] = [];
  private isWriting: boolean = false;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    
    // Set up log directory
    this.logDir = `${FileSystem.documentDirectory}logs/`;
    this.currentLogFile = `${this.logDir}app-${new Date().toISOString().split('T')[0]}.log`;
    
    // Initialize log directory
    this.initLogDirectory();
  }

  /**
   * Initialize log directory
   */
  private async initLogDirectory() {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.logDir);
      
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.logDir, { intermediates: true });
      }
      
      // Rotate logs if needed
      if (this.config.enableFileLogging) {
        this.rotateLogsIfNeeded();
      }
    } catch (error) {
      console.error('Failed to initialize log directory:', error);
    }
  }

  /**
   * Rotate logs if needed
   */
  private async rotateLogsIfNeeded() {
    try {
      // Check if current log file exists and is too large
      const fileInfo = await FileSystem.getInfoAsync(this.currentLogFile);
      
      if (fileInfo.exists && fileInfo.size > this.config.maxLogSize) {
        // Create new log file with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.currentLogFile = `${this.logDir}app-${timestamp}.log`;
        
        // Delete old log files if we have too many
        const files = await FileSystem.readDirectoryAsync(this.logDir);
        const logFiles = files.filter(f => f.startsWith('app-') && f.endsWith('.log'))
          .sort((a, b) => b.localeCompare(a)); // Sort newest first
        
        if (logFiles.length > this.config.maxLogFiles) {
          for (let i = this.config.maxLogFiles; i < logFiles.length; i++) {
            await FileSystem.deleteAsync(`${this.logDir}${logFiles[i]}`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to rotate logs:', error);
    }
  }

  /**
   * Set logger configuration
   */
  setConfig(config: Partial<LoggerConfig>) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Format log message
   */
  private formatLogMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    let formattedMessage = `[${timestamp}] [${level}] ${message}`;
    
    // Format additional arguments
    if (args.length > 0) {
      args.forEach(arg => {
        if (arg instanceof Error) {
          formattedMessage += ` Error: ${arg.message}`;
          if (arg.stack) {
            formattedMessage += `\nStack: ${arg.stack}`;
          }
        } else if (typeof arg === 'object') {
          try {
            formattedMessage += ' ' + JSON.stringify(arg);
          } catch (e) {
            formattedMessage += ' [Object]';
          }
        } else {
          formattedMessage += ' ' + String(arg);
        }
      });
    }
    
    return formattedMessage;
  }

  /**
   * Write log to file
   */
  private async writeToFile(message: string) {
    if (!this.config.enableFileLogging) return;
    
    // Add to queue
    this.logQueue.push(message);
    
    // Process queue if not already processing
    if (!this.isWriting) {
      this.processLogQueue();
    }
  }

  /**
   * Process log queue
   */
  private async processLogQueue() {
    if (this.logQueue.length === 0 || this.isWriting) return;
    
    this.isWriting = true;
    
    try {
      // Get next log message
      const message = this.logQueue.shift();
      
      if (message) {
        // Check if file exists
        const fileInfo = await FileSystem.getInfoAsync(this.currentLogFile);
        
        if (!fileInfo.exists) {
          // Create new file
          await FileSystem.writeAsStringAsync(
            this.currentLogFile,
            message + '\n',
            { encoding: FileSystem.EncodingType.UTF8 }
          );
        } else {
          // Read existing content and append
          const existingContent = await FileSystem.readAsStringAsync(this.currentLogFile);
          await FileSystem.writeAsStringAsync(
            this.currentLogFile,
            existingContent + message + '\n',
            { encoding: FileSystem.EncodingType.UTF8 }
          );
        }
      }
    } catch (error) {
      console.error('Failed to write to log file:', error);
    } finally {
      this.isWriting = false;
      
      // Process next message if there are any
      if (this.logQueue.length > 0) {
        this.processLogQueue();
      }
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, ...args: any[]) {
    if (this.config.level <= LogLevel.DEBUG) {
      const formattedMessage = this.formatLogMessage('DEBUG', message, ...args);
      
      if (this.config.enableConsole) {
        console.debug(formattedMessage);
      }
      
      this.writeToFile(formattedMessage);
    }
  }

  /**
   * Log info message
   */
  info(message: string, ...args: any[]) {
    if (this.config.level <= LogLevel.INFO) {
      const formattedMessage = this.formatLogMessage('INFO', message, ...args);
      
      if (this.config.enableConsole) {
        console.info(formattedMessage);
      }
      
      this.writeToFile(formattedMessage);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: any[]) {
    if (this.config.level <= LogLevel.WARN) {
      const formattedMessage = this.formatLogMessage('WARN', message, ...args);
      
      if (this.config.enableConsole) {
        console.warn(formattedMessage);
      }
      
      this.writeToFile(formattedMessage);
    }
  }

  /**
   * Log error message
   */
  error(message: string, ...args: any[]) {
    if (this.config.level <= LogLevel.ERROR) {
      const formattedMessage = this.formatLogMessage('ERROR', message, ...args);
      
      if (this.config.enableConsole) {
        console.error(formattedMessage);
      }
      
      this.writeToFile(formattedMessage);
    }
  }

  /**
   * Get log files
   */
  async getLogFiles(): Promise<string[]> {
    try {
      const files = await FileSystem.readDirectoryAsync(this.logDir);
      return files.filter(f => f.endsWith('.log'))
        .map(f => `${this.logDir}${f}`);
    } catch (error) {
      console.error('Failed to get log files:', error);
      return [];
    }
  }

  /**
   * Clear all logs
   */
  async clearLogs(): Promise<boolean> {
    try {
      const files = await this.getLogFiles();
      
      for (const file of files) {
        await FileSystem.deleteAsync(file);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to clear logs:', error);
      return false;
    }
  }
}

// Export singleton instance
export const logger = new Logger(); 