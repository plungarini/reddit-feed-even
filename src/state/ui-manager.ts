/**
 * UI Manager - View State Management
 * 
 * Manages the current view mode and navigation between views.
 */

import { ViewMode } from '../types';

export interface UIState {
  currentView: ViewMode;
  previousView: ViewMode | null;
}

export class UIManager {
  private state: UIState = {
    currentView: 'feed',
    previousView: null,
  };

  private listeners: Array<(state: UIState) => void> = [];

  /**
   * Subscribe to view changes
   */
  subscribe(listener: (state: UIState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) this.listeners.splice(index, 1);
    };
  }

  private notify(): void {
    this.listeners.forEach(l => l({ ...this.state }));
  }

  /**
   * Get current view
   */
  getCurrentView(): ViewMode {
    return this.state.currentView;
  }

  /**
   * Get previous view
   */
  getPreviousView(): ViewMode | null {
    return this.state.previousView;
  }

  /**
   * Change to a specific view
   */
  setView(view: ViewMode): void {
    if (this.state.currentView !== view) {
      this.state.previousView = this.state.currentView;
      this.state.currentView = view;
      this.notify();
    }
  }

  /**
   * Go back to previous view
   */
  goBack(): void {
    if (this.state.previousView) {
      const prev = this.state.previousView;
      this.state.previousView = this.state.currentView;
      this.state.currentView = prev;
      this.notify();
    } else {
      // Default to feed if no previous view
      this.setView('feed');
    }
  }

  /**
   * Check if current view is a specific mode
   */
  isView(view: ViewMode): boolean {
    return this.state.currentView === view;
  }

  /**
   * Toggle between two views
   */
  toggle(view1: ViewMode, view2: ViewMode): void {
    this.setView(this.state.currentView === view1 ? view2 : view1);
  }

  /**
   * Get view history info
   */
  canGoBack(): boolean {
    return this.state.previousView !== null;
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.state.currentView = 'feed';
    this.state.previousView = null;
    this.notify();
  }
}
