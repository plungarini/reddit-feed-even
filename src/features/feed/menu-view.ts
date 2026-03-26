/**
 * Menu View - List Container
 *
 * Shows available actions and settings.
 */

import {
	CreateStartUpPageContainer,
	EvenAppBridge,
	ListContainerProperty,
	ListItemContainerProperty,
} from '@evenrealities/even_hub_sdk';

export interface MenuItem {
	id: string;
	label: string;
	desc: string;
}

export class MenuView {
	private readonly bridge: EvenAppBridge;

	constructor(bridge: EvenAppBridge) {
		this.bridge = bridge;
	}

	/**
	 * Render menu with items
	 */
	async render(): Promise<void> {
		const itemNames = this.getFeedItems().map((item) => `${item.label} - ${item.desc}`);

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
	 * Get feed selection items
	 */
	getFeedItems(): MenuItem[] {
		return [
			{ id: 'best', label: 'Best', desc: 'Personalized feed' },
			{ id: 'hot', label: 'Hot', desc: 'Trending now' },
			{ id: 'new', label: 'New', desc: 'Latest posts' },
			{ id: 'rising', label: 'Rising', desc: 'Gaining popularity' },
			{ id: 'top', label: 'Top', desc: 'Highest rated' },
			{ id: 'controversial', label: 'Controversial', desc: 'Most debated' },
			{ id: 'r/popular', label: '[R] Popular', desc: 'Across Reddit' },
			{ id: 'r/all', label: '[R] All', desc: 'Everything' },
		];
	}
}
