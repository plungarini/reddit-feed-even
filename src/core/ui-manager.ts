/**
 * UI Manager - Navigation Stack with Context
 *
 * Manages navigation using a stack-based approach:
 * - Each entry contains full context (view, page, highlight, postId)
 * - goBack() returns to previous context
 * - Preserves feed page and highlight position
 */

import { ViewMode } from './types';

export interface NavigationEntry {
  view: ViewMode;
  pageIndex?: number;        // For feed: which page
  highlightIndex?: number;   // For feed: which post highlighted
  postId?: string;           // For detail/comments: which post
  menuSelectedIndex?: number; // For menu: which item is highlighted
}

export interface UIState {
  stack: NavigationEntry[];
}

export class UIManager {
  private state: UIState = {
    stack: [{ view: 'feed', pageIndex: 0, highlightIndex: 0 }],
  };

  private listeners: Array<(state: UIState) => void> = [];

  /**
   * Subscribe to navigation changes
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

  // ========================================================================
  // Navigation Stack Operations
  // ========================================================================

  /**
   * Get current (top) navigation entry
   */
  getCurrentEntry(): NavigationEntry {
    return this.state.stack[this.state.stack.length - 1];
  }

  /**
   * Get current view mode
   */
  getCurrentView(): ViewMode {
    return this.getCurrentEntry().view;
  }

  /**
   * Push new view onto stack
   */
  pushView(entry: NavigationEntry): void {
    this.state.stack.push(entry);
    console.log(`[UIManager] pushView: ${entry.view}, stack depth: ${this.state.stack.length}`);
    this.notify();
  }

  /**
   * Replace current view (same level navigation)
   */
  replaceView(entry: NavigationEntry): void {
    this.state.stack[this.state.stack.length - 1] = entry;
    console.log(`[UIManager] replaceView: ${entry.view}`);
    this.notify();
  }

  /**
   * Go back to previous view
   * Returns the new current entry or null if at root
   */
  goBack(): NavigationEntry | null {
    if (this.state.stack.length > 1) {
      const popped = this.state.stack.pop();
      const current = this.getCurrentEntry();
      console.log(`[UIManager] goBack: from ${popped?.view} to ${current.view}`);
      this.notify();
      return current;
    }
    console.log('[UIManager] goBack: already at root');
    return null;
  }

  /**
   * Check if can go back
   */
  canGoBack(): boolean {
    return this.state.stack.length > 1;
  }

  /**
   * Get stack depth (for debugging)
   */
  getStackDepth(): number {
    return this.state.stack.length;
  }

  /**
   * Reset to initial state (feed at page 0)
   */
  reset(): void {
    this.state.stack = [{ view: 'feed', pageIndex: 0, highlightIndex: 0 }];
    this.notify();
  }

  // ========================================================================
  // Convenience Methods
  // ========================================================================

  /**
   * Navigate to detail view for a post
   */
  goToDetail(postId: string, fromEntry: NavigationEntry): void {
    this.pushView({
      view: 'detail',
      postId,
      // Store return context implicitly in stack order
    });
  }

  /**
   * Navigate to comments for a post
   */
  goToComments(postId: string): void {
    this.pushView({
      view: 'comments',
      postId,
    });
  }

  /**
   * Update current entry context (e.g., highlight changed)
   */
  updateCurrentContext(updates: Partial<NavigationEntry>): void {
    const current = this.getCurrentEntry();
    const updated = { ...current, ...updates };
    this.state.stack[this.state.stack.length - 1] = updated;
    // Don't notify - context updates don't trigger re-render
  }
}
