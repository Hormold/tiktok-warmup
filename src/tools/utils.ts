import { exec } from 'child_process';
import { promisify } from 'util';

/**
 * Promisified exec for async shell commands
 */
export const execAsync = promisify(exec);

/**
 * Logger levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Simple logger with levels and timestamps
 */
class Logger {
  private level: LogLevel = LogLevel.INFO;
  private prefix = '[TikTok-Agent]';

  constructor() {
    // Set log level from environment
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLevel && envLevel in LogLevel) {
      this.level = LogLevel[envLevel as keyof typeof LogLevel];
    }

    // Enable debug if DEBUG env var is set
    if (process.env.DEBUG) {
      this.level = LogLevel.DEBUG;
    }
  }

  private log(level: LogLevel, message: string, ...args: any[]) {
    if (level < this.level) return;

    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    const prefix = `${this.prefix} ${timestamp} [${levelName}]`;

    // Color output based on level
    const colors = {
      [LogLevel.DEBUG]: '\x1b[36m', // cyan
      [LogLevel.INFO]: '\x1b[32m',  // green
      [LogLevel.WARN]: '\x1b[33m',  // yellow
      [LogLevel.ERROR]: '\x1b[31m', // red
    };
    const reset = '\x1b[0m';
    const color = colors[level] || '';

    console.log(`${color}${prefix}${reset}`, message, ...args);
  }

  debug(message: string, ...args: any[]) {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  info(message: string, ...args: any[]) {
    this.log(LogLevel.INFO, message, ...args);
  }

  warn(message: string, ...args: any[]) {
    this.log(LogLevel.WARN, message, ...args);
  }

  error(message: string, ...args: any[]) {
    this.log(LogLevel.ERROR, message, ...args);
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }
}

/**
 * Global logger instance
 */
export const logger = new Logger();

/**
 * Sleep utility
 */
export const sleep = async (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Random number between min and max (inclusive)
 */
export const randomBetween = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Random element from array
 */
export const randomChoice = <T>(array: T[]): T => {
  return array[Math.floor(Math.random() * array.length)];
};

/**
 * Retry function with exponential backoff
 */
export const retry = async <T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
  } = {}
): Promise<T> => {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        break;
      }

      const delay = Math.min(
        baseDelay * Math.pow(backoffFactor, attempt - 1),
        maxDelay
      );

      logger.debug(`Attempt ${attempt} failed, retrying in ${delay}ms:`, error);
      await sleep(delay);
    }
  }

  throw lastError!;
};

/**
 * Format duration in human readable format
 */
export const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};

/**
 * Deep clone object
 */
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Sanitize device ID for file names
 */
export const sanitizeDeviceId = (deviceId: string): string => {
  return deviceId.replace(/[^a-zA-Z0-9-_]/g, '_');
};

/**
 * Check if string is valid JSON
 */
export const isValidJson = (str: string): boolean => {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
};

/**
 * Truncate text to max length with ellipsis
 */
export const truncate = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength - 3)  }...`;
}; 

/**
 * Generate a random UUID
 */
export const uuidv4 = () => {
  return crypto.randomUUID();
};