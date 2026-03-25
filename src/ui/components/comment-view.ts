/**
 * Comment View - Text Container
 * 
 * Displays comments for a post.
 * Shows top comments with author and score.
 */

import {
  CreateStartUpPageContainer,
  TextContainerProperty,
  EvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import { RedditComment } from '../../types';

export class CommentView {
  private bridge: EvenAppBridge;

  constructor(bridge: EvenAppBridge) {
    this.bridge = bridge;
  }

  /**
   * Render comments view
   */
  async render(comments: RedditComment[]): Promise<void> {
    const content = this.buildContent(comments);

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
          containerName: 'comments',
          isEventCapture: 1,
          content,
        }),
      ],
    });

    await this.bridge.createStartUpPageContainer(container);
  }

  /**
   * Build comment display content
   */
  private buildContent(comments: RedditComment[]): string {
    if (comments.length === 0) {
      return 'No comments yet.\n\nDouble-tap to go back.';
    }

    const lines: string[] = [];

    // Header
    lines.push(`💬 Comments (${comments.length})`);
    lines.push('');

    // Comments
    for (const comment of comments.slice(0, 5)) {
      // Author and score line
      lines.push(`u/${comment.author}  ·  ▲ ${this.formatScore(comment.score)}`);

      // Comment body
      const body = this.wrapText(comment.body, 65);
      lines.push(body);
      lines.push('');
    }

    // Footer
    lines.push('─'.repeat(40));
    lines.push('Double-tap to go back');

    return lines.join('\n').substring(0, 1950);
  }

  /**
   * Format score with k suffix
   */
  private formatScore(score: number): string {
    if (score >= 1000) {
      return `${(score / 1000).toFixed(1)}k`;
    }
    return String(score);
  }

  /**
   * Wrap text to fit container
   */
  private wrapText(text: string, width: number): string {
    // Clean up text
    const cleanText = text
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = cleanText.split(' ');
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
}
