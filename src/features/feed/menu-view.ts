/**
 * Menu View — Feed Type Selector
 *
 * Shown when the user double-clicks on the feed.
 * Renders two containers:
 *   1. Header  — short TextContainerProperty centred at top
 *   2. List    — ListContainerProperty with the 8 available endpoints
 *
 * Gestures (handled in main.ts):
 *   CLICK        → select highlighted endpoint
 *   DOUBLE_CLICK → exit menu, return to feed unchanged
 */

import {
	EvenAppBridge,
	ListContainerProperty,
	ListItemContainerProperty,
	RebuildPageContainer,
	TextContainerProperty,
} from '@evenrealities/even_hub_sdk';
import { ENDPOINTS } from '../../core/config';
import { FeedEndpoint } from '../../core/types';

const WIDTH = 576;

const HEADER_H = 38;
const HEADER_Y = 0;

const LIST_OFFSET = 5;
const LIST_Y = HEADER_H + LIST_OFFSET;
const LIST_H = 288 - HEADER_H - LIST_OFFSET;

export class MenuView {
	private readonly bridge: EvenAppBridge;

	constructor(bridge: EvenAppBridge) {
		this.bridge = bridge;
	}

	/**
	 * Render the menu.
	 * @param currentEndpoint  The currently active feed endpoint (marked with ">").
	 */
	async render(currentEndpoint: FeedEndpoint): Promise<void> {
		const header = this.buildHeader();
		const list = this.buildList(currentEndpoint);

		const ok = await this.bridge.rebuildPageContainer(
			new RebuildPageContainer({
				containerTotalNum: 2,
				textObject: [header],
				listObject: [list],
			}),
		);

		console.log(`[MenuView] render endpoint=${currentEndpoint} ok=${ok}`);
		if (!ok) throw new Error('rebuildPageContainer returned false (menu)');
	}

	private buildHeader(): TextContainerProperty {
		const text = '╭───────  Select your Feed  ───────╮';
		const textWidth = text.length * 12;
		return new TextContainerProperty({
			xPosition: Math.floor((WIDTH - textWidth) / 2),
			yPosition: HEADER_Y,
			width: WIDTH,
			height: HEADER_H,
			borderWidth: 0,
			paddingLength: 5,
			containerID: 1,
			containerName: 'menu-header',
			isEventCapture: 0,
			content: text,
		});
	}

	private buildList(currentEndpoint: FeedEndpoint): ListContainerProperty {
		const itemNames = Object.entries(ENDPOINTS).map(([key, value]) => {
			const active = key === currentEndpoint;
			const indicator = active ? '>  ' : '    ';
			return `${indicator}${value.name}  -  ${value.description}`;
		});

		const OFFSET = 60;
		return new ListContainerProperty({
			xPosition: 90,
			yPosition: LIST_Y,
			width: WIDTH - OFFSET * 2,
			height: LIST_H,
			borderWidth: 0,
			paddingLength: 0,
			containerID: 2,
			containerName: 'menu-list',
			isEventCapture: 1,
			itemContainer: new ListItemContainerProperty({
				itemCount: itemNames.length,
				itemWidth: WIDTH - OFFSET * 2,
				isItemSelectBorderEn: 1,
				itemName: itemNames,
			}),
		});
	}
}
