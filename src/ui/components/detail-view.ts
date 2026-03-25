/**
 * Detail View - Text Container
 * 
 * Displays full post details including title, content, and metadata.
 * Uses Even Hub's TextContainer for scrollable content.
 */

import {
  CreateStartUpPageContainer,
  TextContainerProperty,
  EvenAppBridge,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk';
import { CachedPost } from '../../types';

export class DetailView {
  private bridge: EvenAppBridge;

  constructor(bridge: EvenAppBridge) {
    this.bridge = bridge;
  }

  /**
   * Render post detail view
   */
  async render(post: CachedPost): Promise<void> {
    const content = this.buildContent(post);

    const container = new CreateStartUpPageContainer({
      containerTotalNum: 1,
      textObject: [
        new TextContainerProperty({
          xPosition: 0,
          yPosition: 0,
          width: 576,
          height: 288,
          borderWidth: 1,
          borderColor: 5,
          borderRdaius: 4,
          paddingLength: 8,
          containerID: 1,
          containerName: 'detail',
          isEventCapture: 1,
          content,
        }),
      ],
    });

    await this.bridge.createStartUpPageContainer(container);
  }

  /**
   * Update content without full rebuild
   */
  async update(post: CachedPost): Promise<void> {
    const content = this.buildContent(post);

    await this.bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: 1,
      containerName: 'detail',
      contentOffset: 0,
      contentLength: 2000, // Approximate max
      content,
    }));
  }

  /**
   * Build display content for a post
   */
  private buildContent(post: CachedPost): string {
    const lines: string[] = [];

    // Header with metadata
    const metaParts: string[] = [];
    metaParts.push(`r/${post.subreddit}`);
    metaParts.push(`▲ ${this.formatScore(post.score)}`);
    metaParts.push(`💬 ${post.numComments}`);
    if (post.interaction) {
      metaParts.push(this.getInteractionLabel(post.interaction));
    }
    lines.push(metaParts.join('  |  '));
    lines.push('');

    // Title
    lines.push(this.wrapText(post.title, 68));
    lines.push('');

    // Selftext or URL
    if (post.selftext) {
      const selftext = this.wrapText(post.selftext, 68);
      lines.push(selftext.substring(0, 900)); // Limit selftext length
      lines.push('');
    } else if (post.contentType === 'link') {
      lines.push(`🔗 ${this.truncate(post.url, 65)}`);
      lines.push('');
    }

    // Content type indicator
    if (post.contentType !== 'self' && post.contentType !== 'link') {
      lines.push(`[${post.contentType.toUpperCase()}]`);
      lines.push('');
    }

    // Author and time
    const timeAgo = this.formatTimeAgo(post.createdUtc);
    lines.push(`by u/${post.author} · ${timeAgo}`);
    lines.push('');

    // Footer with controls hint
    lines.push('─'.repeat(40));
    lines.push('Swipe: Next/Prev  |  Tap: Comments  |  Double: Back');

    return lines.join('\n').substring(0, 1950);
  }

  /**
   * Format score with k/m suffix
   */
  private formatScore(score: number): string {
    if (score >= 1000000) {
      return `${(score / 1000000).toFixed(1)}m`;
    }
    if (score >= 1000) {
      return `${(score / 1000).toFixed(1)}k`;
    }
    return String(score);
  }

  /**
   * Format timestamp as relative time
   */
  private formatTimeAgo(createdUtc: number): string {
    const seconds = Math.floor(Date.now() / 1000) - createdUtc;

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 604800)}w ago`;
  }

  /**
   * Get label for interaction
   */
  private getInteractionLabel(interaction: string): string {
    switch (interaction) {
      case 'upvote': return '▲ upvoted';
      case 'downvote': return '▼ downvoted';
      case 'hide': return '✓ hidden';
      case 'save': return '★ saved';
      default: return '';
    }
  }

  /**
   * Wrap text to fit container width
   */
  private wrapText(text: string, width: number): string {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).length > width) {
        lines.push(currentLine.trim());
        currentLine = word;
      } else {
        currentLine += ' ' + word;
      }
    }

    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }

    return lines.join('\n');
  }

  /**
   * Truncate text with ellipsis
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}
