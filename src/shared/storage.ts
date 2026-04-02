import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

type Bridge = Awaited<ReturnType<typeof waitForEvenAppBridge>>;

let bridgePromise: Promise<Bridge | null> | null = null;

async function getBridge(): Promise<Bridge | null> {
	if (!bridgePromise) {
		console.log('[Storage] Initializing bridge-backed storage');
		bridgePromise = waitForEvenAppBridge().catch((error) => {
			console.warn('[Storage] Bridge unavailable, falling back to browser storage:', error);
			return null;
		});
	}

	return bridgePromise;
}

function getBrowserStorage(): Storage | null {
	try {
		console.log('[Storage] Using browser localStorage');
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

export async function getStoredItem(key: string): Promise<string | null> {
	const bridge = await getBridge();
	if (bridge) {
		console.log(`[Storage] bridge.getLocalStorage("${key}")`);
		const value = await bridge.getLocalStorage(key);
		console.log(`[Storage] bridge.getLocalStorage("${key}") ->`, value);
		return value === '' ? null : value;
	}

	const storage = getBrowserStorage();
	const value = storage?.getItem(key) ?? null;
	console.log(`[Storage] localStorage.getItem("${key}") ->`, value);
	return value;
}

export async function setStoredItem(key: string, value: string): Promise<boolean> {
	const bridge = await getBridge();
	if (bridge) {
		console.log(`[Storage] bridge.setLocalStorage("${key}") <-`, value);
		const ok = await bridge.setLocalStorage(key, value);
		console.log(`[Storage] bridge.setLocalStorage("${key}") ->`, ok);
		return ok;
	}

	const storage = getBrowserStorage();
	if (!storage) {
		console.warn(`[Storage] No storage backend available for set("${key}")`);
		return false;
	}

	try {
		storage.setItem(key, value);
		console.log(`[Storage] localStorage.setItem("${key}") <-`, value);
		return true;
	} catch (error) {
		console.warn('[Storage] Failed to persist item:', error);
		return false;
	}
}

export async function removeStoredItem(key: string): Promise<boolean> {
	const bridge = await getBridge();
	if (bridge) {
		console.log(`[Storage] bridge.setLocalStorage("${key}") <- "" (remove emulation)`);
		const ok = await bridge.setLocalStorage(key, '');
		console.log(`[Storage] bridge.remove("${key}") ->`, ok);
		return ok;
	}

	const storage = getBrowserStorage();
	if (!storage) {
		console.warn(`[Storage] No storage backend available for remove("${key}")`);
		return false;
	}

	try {
		storage.removeItem(key);
		console.log(`[Storage] localStorage.removeItem("${key}")`);
		return true;
	} catch (error) {
		console.warn('[Storage] Failed to remove item:', error);
		return false;
	}
}
