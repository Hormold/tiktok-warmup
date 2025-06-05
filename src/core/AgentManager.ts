import { logger } from '../tools/utils.js';

import type { Worker } from './Worker.js';

/**
 * Agent stages (for future implementation)
 */
export type AgentStage = 'initiating' | 'learning' | 'working' | 'stopped';

/**
 * AgentManager - orchestrates worker stages and automation
 * 
 * MVP Version: Basic structure without stage implementation
 */
export class AgentManager {
  private worker: Worker;
  private currentStage: AgentStage = 'stopped';
  private isRunning = false;

  constructor(worker: Worker) {
    this.worker = worker;
    logger.debug(`AgentManager created for worker: ${worker.deviceName}`);
  }

  /**
   * Start the agent automation (MVP: just logging)
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn(`Agent for ${this.worker.deviceName} is already running`);
      return;
    }

    try {
      logger.info(`🧠 Starting agent for ${this.worker.deviceName}...`);
      
      // Check if worker is ready
      if (!this.worker.isReady()) {
        throw new Error('Worker is not ready');
      }

      this.isRunning = true;
      this.currentStage = 'initiating';
      
      // Start real automation pipeline
      logger.info(`✅ Agent started for ${this.worker.deviceName} (stage: ${this.currentStage})`);
      
      // Run the real automation: Initialize → Learn → Work
      await this.startRealAutomation();
      
    } catch (error) {
      logger.error(`❌ Failed to start agent for ${this.worker.deviceName}:`, error);
      this.isRunning = false;
      this.currentStage = 'stopped';
      throw error;
    }
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info(`🛑 Stopping agent for ${this.worker.deviceName}...`);
    
    try {
      this.isRunning = false;
      this.currentStage = 'stopped';
      
      // TODO: Add proper cleanup:
      // - Stop automation loops
      // - Save current state
      // - Release resources
      
      logger.info(`✅ Agent stopped for ${this.worker.deviceName}`);
      
    } catch (error) {
      logger.error(`❌ Error stopping agent for ${this.worker.deviceName}:`, error);
      throw error;
    }
  }

  /**
   * Get current stage
   */
  getCurrentStage(): AgentStage {
    return this.currentStage;
  }

  /**
   * Check if agent is running
   */
  isAgentRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get associated worker
   */
  getWorker(): Worker {
    return this.worker;
  }

  /**
   * Real automation pipeline using Worker methods
   */
  private async startRealAutomation(): Promise<void> {
    try {
      // Start the worker automation pipeline
      await this.worker.startAutomation();
      
      // Sync our stage with worker stage
      this.currentStage = this.mapWorkerStageToAgentStage(this.worker.getStage());
      
      logger.info(`🎯 Real automation started for ${this.worker.deviceName}, current stage: ${this.currentStage}`);
      
      // Monitor worker stage and sync with agent
      this.startStageMonitoring();
      
    } catch (error) {
      logger.error(`❌ Real automation failed for ${this.worker.deviceName}:`, error);
      this.isRunning = false;
      this.currentStage = 'stopped';
      throw error;
    }
  }

  /**
   * Monitor worker stage changes and sync with agent stage
   */
  private startStageMonitoring(): void {
    const monitor = () => {
      if (!this.isRunning) return;
      
      const workerStage = this.worker.getStage();
      const agentStage = this.mapWorkerStageToAgentStage(workerStage);
      
      if (agentStage !== this.currentStage) {
        logger.info(`🔄 ${this.worker.deviceName}: Stage transition ${this.currentStage} → ${agentStage}`);
        this.currentStage = agentStage;
      }
      
      // Continue monitoring
      setTimeout(monitor, 2000);
    };
    
    // Start monitoring after a short delay
    setTimeout(monitor, 1000);
  }

  /**
   * Map worker stage to agent stage
   */
  private mapWorkerStageToAgentStage(workerStage: string): AgentStage {
    switch (workerStage) {
      case 'initializing':
        return 'initiating';
      case 'learning':
        return 'learning';
      case 'working':
        return 'working';
      case 'stopped':
      case 'error':
      default:
        return 'stopped';
    }
  }
} 