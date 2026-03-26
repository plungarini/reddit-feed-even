/**
 * Sync Scheduler
 * 
 * Manages automatic background syncing at configured intervals.
 * Handles start/stop and interval changes.
 */

import { SyncEngine, SyncResult } from './sync-engine';
import { FeedConfig } from '../../core/types';

export class SyncScheduler {
  private engine: SyncEngine;
  private intervalMinutes: number;
  private timerId: number | null = null;
  private feedConfig: FeedConfig | null = null;
  private isRunning = false;

  constructor(engine: SyncEngine, intervalMinutes: number = 30) {
    this.engine = engine;
    this.intervalMinutes = intervalMinutes;
  }

  /**
   * Start scheduled syncing
   */
  start(feedConfig: FeedConfig): void {
    if (this.isRunning) {
      this.stop();
    }

    this.feedConfig = feedConfig;
    this.isRunning = true;

    // Initial sync after short delay
    setTimeout(() => {
      if (this.feedConfig) {
        this.engine.sync(this.feedConfig);
      }
    }, 5000);

    // Schedule recurring sync
    this.timerId = window.setInterval(() => {
      if (this.feedConfig && !this.engine.isRunning()) {
        console.log('[SyncScheduler] Triggering scheduled sync');
        this.engine.sync(this.feedConfig);
      }
    }, this.intervalMinutes * 60 * 1000);

    console.log(`[SyncScheduler] Started with ${this.intervalMinutes}min interval`);
  }

  /**
   * Stop scheduled syncing
   */
  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isRunning = false;
    console.log('[SyncScheduler] Stopped');
  }

  /**
   * Check if scheduler is running
   */
  running(): boolean {
    return this.isRunning;
  }

  /**
   * Update sync interval (restarts if running)
   */
  setInterval(minutes: number): void {
    const wasRunning = this.isRunning;
    const config = this.feedConfig;

    this.intervalMinutes = minutes;

    if (wasRunning && config) {
      this.stop();
      this.start(config);
    }
  }

  /**
   * Get current interval
   */
  getInterval(): number {
    return this.intervalMinutes;
  }

  /**
   * Trigger immediate sync
   */
  async triggerNow(): Promise<SyncResult | null> {
    if (this.feedConfig) {
      return this.engine.sync(this.feedConfig);
    }
    return null;
  }

  /**
   * Pause syncing temporarily
   */
  pause(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Resume syncing
   */
  resume(): void {
    if (this.isRunning && this.feedConfig && this.timerId === null) {
      this.timerId = window.setInterval(() => {
        if (this.feedConfig && !this.engine.isRunning()) {
          this.engine.sync(this.feedConfig);
        }
      }, this.intervalMinutes * 60 * 1000);
    }
  }
}
