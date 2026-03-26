/**
 * Comment View - List Container with Toggleable Tree
 *
 * Uses ListContainerProperty for native scrollable list.
 * Each comment is ONE list item (single line, indented by depth).
 * Firmware handles scrolling and selection highlighting.
 *
 * Layout:
 *   - Single list container with padding
 *   - Indentation via spaces: "  ↳ reply text"
 *   - Collapsed comments show "[+N] author: preview..."
 *   - Expanded comments show full text
 *
 * Navigation:
 *   Scroll moves highlight between comments (firmware handles)
 *   Single tap (CLICK) = toggle expand/collapse
 *   Double tap = back to detail
 *   "Load more" item = load more comments
 */

import {
  EvenAppBridge,
  RebuildPageContainer,
  ListContainerProperty,
  ListItemContainerProperty,
} from '@evenrealities/even_hub_sdk';
import { RedditComment } from '../../types';

const CONTAINER_WIDTH = 560;
const CONTAINER_HEIGHT = 272;
const ITEM_WIDTH = 552;
const MAX_ITEM_CHARS = 60;

export class CommentView {
  private bridge: EvenAppBridge;
  private expandedComments = new Set<string>();
  private visibleComments: RedditComment[] = [];

  constructor(bridge: EvenAppBridge) {
    this.bridge = bridge;
  }

  reset(): void {
    this.expandedComments.clear();
    this.visibleComments = [];
  }

  /**
   * Render comments as native list container
   */
  async render(comments: RedditComment[], hasMore: boolean, loading: boolean): Promise<void> {
    // Flatten tree based on expanded state
    this.visibleComments = this.flattenVisible(comments);

    // Build list items
    const itemNames: string[] = this.visibleComments.map(c => this.formatComment(c));

    // Add loading indicator or "Load more" item
    if (loading) {
      itemNames.push('Loading more comments...');
    } else if (hasMore) {
      itemNames.push('↓ Load more comments...');
    }

    console.log(`[CommentView] render comments=${this.visibleComments.length} items=${itemNames.length}`);

    // Single list container
    const listContainer = new ListContainerProperty({
      xPosition: 8,
      yPosition: 8,
      width: CONTAINER_WIDTH,
      height: CONTAINER_HEIGHT,
      borderWidth: 1,
      borderColor: 5,
      borderRadius: 6,
      paddingLength: 4,
      containerID: 1,
      containerName: 'comment-list',
      isEventCapture: 1,
      itemContainer: new ListItemContainerProperty({
        itemCount: itemNames.length,
        itemWidth: ITEM_WIDTH,
        isItemSelectBorderEn: 1,  // Native highlight border
        itemName: itemNames,
      }),
    });

    const ok = await this.bridge.rebuildPageContainer(new RebuildPageContainer({
      containerTotalNum: 1,
      listObject: [listContainer],
    }));

    console.log('[CommentView] rebuildPageContainer:', ok);
  }

  /**
   * Format comment as single-line list item
   */
  private formatComment(c: RedditComment): string {
    const depth = c.depth ?? 0;
    const indent = '  '.repeat(depth);
    const prefix = depth > 0 ? '↳ ' : '';

    // Check if collapsed
    if (c.collapsed && c.replies?.length) {
      const count = this.countAllReplies(c);
      const preview = c.body.substring(0, 30);
      const text = `${indent}[+${count}] u/${c.author}: ${preview}...`;
      return text.length > MAX_ITEM_CHARS ? text.substring(0, MAX_ITEM_CHARS - 1) + '…' : text;
    }

    const score = fmtScore(c.score);
    const body = c.body.length > 40 ? c.body.substring(0, 37) + '...' : c.body;
    const text = `${indent}${prefix}▲${score} u/${c.author} | ${body}`;
    return text.length > MAX_ITEM_CHARS ? text.substring(0, MAX_ITEM_CHARS - 1) + '…' : text;
  }

  /**
   * Flatten comment tree based on expanded state
   */
  private flattenVisible(comments: RedditComment[]): RedditComment[] {
    const result: RedditComment[] = [];

    for (const c of comments) {
      result.push({
        ...c,
        collapsed: !this.expandedComments.has(c.id) && !!(c.replies?.length),
      });

      if (this.expandedComments.has(c.id) && c.replies?.length) {
        result.push(...this.flattenVisible(c.replies));
      }
    }

    return result;
  }

  /**
   * Count all nested replies
   */
  private countAllReplies(comment: RedditComment): number {
    if (!comment.replies?.length) return 0;
    let count = comment.replies.length;
    for (const r of comment.replies) {
      count += this.countAllReplies(r);
    }
    return count;
  }

  /**
   * Toggle comment expanded/collapsed
   */
  toggleComment(commentId: string): void {
    if (this.expandedComments.has(commentId)) {
      this.expandedComments.delete(commentId);
    } else {
      this.expandedComments.add(commentId);
    }
  }

  isExpanded(commentId: string): boolean {
    return this.expandedComments.has(commentId);
  }

  /**
   * Get comment at index (for event handling)
   */
  getCommentAt(index: number): RedditComment | null {
    return this.visibleComments[index] ?? null;
  }
}

function fmtScore(n: number): string {
  if (!n || n <= 0) return '0';
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}
