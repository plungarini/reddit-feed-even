/**
 * Feed View - List Container
 * 
 * Displays a scrollable list of posts using Even Hub's ListContainer.
 * Optimized for G2 display constraints.
 */

import {
  CreateStartUpPageContainer,
  ListContainerProperty,
  ListItemContainerProperty,
  EvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import { CachedPost } from '../../types';

export interface FeedViewOptions {
  showScores?: boolean;
  showSubreddit?: boolean;
  maxTitleLength?: number;
}

export class FeedView {
  private bridge: EvenAppBridge;
  private options: FeedViewOptions;

  constructor(
    bridge: EvenAppBridge,
    options: FeedViewOptions = {}
  ) {
    this.bridge = bridge;
    this.options = {
      showScores: true,
      showSubreddit: true,
      maxTitleLength: 45,
      ...options,
    };
  }

  /**
   * Render the feed list
   */
  async render(posts: CachedPost[], selectedIndex: number = 0): Promise<void> {
    const displayPosts = posts.slice(0, 20); // Max 20 items in list
    const items = displayPosts.map((post, index) => 
      this.formatPostItem(post, index === selectedIndex)
    );

    // Handle empty state
    if (items.length === 0) {
      items.push('No posts available');
    }

    const container = new CreateStartUpPageContainer({
      containerTotalNum: 1,
      listObject: [
        new ListContainerProperty({
          xPosition: 0,
          yPosition: 0,
          width: 576,
          height: 288,
          borderWidth: 1,
          borderColor: 13,
          borderRadius: 6,
          paddingLength: 5,
          containerID: 1,
          containerName: 'feed',
          isEventCapture: 1,
          itemContainer: new ListItemContainerProperty({
            itemCount: items.length,
            itemWidth: 560,
            isItemSelectBorderEn: 1,
            itemName: items,
          }),
        }),
      ],
    });

    await this.bridge.createStartUpPageContainer(container);
  }

  /**
   * Format a single post for display
   */
  private formatPostItem(post: CachedPost, isSelected: boolean): string {
    const parts: string[] = [];

    // Selection indicator
    parts.push(isSelected ? '▶' : ' ');

    // Score
    if (this.options.showScores) {
      parts.push(this.formatScore(post.score));
    }

    // Subreddit
    if (this.options.showSubreddit) {
      parts.push(`r/${post.subreddit}`);
    }

    // Title
    const title = this.truncate(post.title, this.options.maxTitleLength || 45);
    parts.push(title);

    // Interaction indicator
    if (post.interaction) {
      const icon = this.getInteractionIcon(post.interaction);
      parts.push(icon);
    }

    // Seen indicator
    if (post.seen && !isSelected) {
      parts.push('·');
    }

    return parts.join(' ');
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
   * Truncate text to max length
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Get icon for interaction type
   */
  private getInteractionIcon(interaction: string): string {
    switch (interaction) {
      case 'upvote': return '▲';
      case 'downvote': return '▼';
      case 'hide': return '✓';
      case 'save': return '★';
      default: return '';
    }
  }

  /**
   * Update view options
   */
  setOptions(options: Partial<FeedViewOptions>): void {
    this.options = { ...this.options, ...options };
  }
}
