/**
 * Menu View - List Container
 * 
 * Shows available actions and settings.
 */

import {
  CreateStartUpPageContainer,
  ListContainerProperty,
  ListItemContainerProperty,
  EvenAppBridge,
} from '@evenrealities/even_hub_sdk';

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
}

export class MenuView {
  private bridge: EvenAppBridge;

  constructor(bridge: EvenAppBridge) {
    this.bridge = bridge;
  }

  /**
   * Render menu with items
   */
  async render(items: MenuItem[], selectedIndex: number = 0): Promise<void> {
    const displayItems = items.slice(0, 15);
    const itemNames = displayItems.map((item, index) => 
      this.formatItem(item, index === selectedIndex)
    );

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
          borderRdaius: 6,
          paddingLength: 5,
          containerID: 1,
          containerName: 'menu',
          isEventCapture: 1,
          itemContainer: new ListItemContainerProperty({
            itemCount: itemNames.length,
            itemWidth: 560,
            isItemSelectBorderEn: 1,
            itemName: itemNames,
          }),
        }),
      ],
    });

    await this.bridge.createStartUpPageContainer(container);
  }

  /**
   * Format a menu item
   */
  private formatItem(item: MenuItem, isSelected: boolean): string {
    const prefix = isSelected ? '▶ ' : '  ';
    const icon = item.icon ? `${item.icon} ` : '';
    return `${prefix}${icon}${item.label}`;
  }

  /**
   * Get default menu items
   */
  static getDefaultItems(): MenuItem[] {
    return [
      { id: 'refresh', label: 'Refresh Feed', icon: '↻' },
      { id: 'upvote', label: 'Upvote Post', icon: '▲' },
      { id: 'downvote', label: 'Downvote Post', icon: '▼' },
      { id: 'hide', label: 'Hide Post', icon: '✓' },
      { id: 'save', label: 'Save Post', icon: '★' },
      { id: 'comments', label: 'View Comments', icon: '💬' },
      { id: 'back', label: 'Go Back', icon: '←' },
    ];
  }

  /**
   * Get feed selection items
   */
  static getFeedItems(): MenuItem[] {
    return [
      { id: 'best', label: 'Best (Personalized)', icon: '★' },
      { id: 'hot', label: 'Hot', icon: '🔥' },
      { id: 'new', label: 'New', icon: '🆕' },
      { id: 'rising', label: 'Rising', icon: '📈' },
      { id: 'top', label: 'Top', icon: '🏆' },
      { id: 'controversial', label: 'Controversial', icon: '⚡' },
      { id: 'r/popular', label: 'Popular', icon: '🌍' },
      { id: 'r/all', label: 'All', icon: '🌐' },
    ];
  }
}
