export function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}

export function isValidUrl(url: string): boolean {
	try {
		new URL(url)
		return true
	} catch {
		return false
	}
}

export async function ensureChromiumExists(): Promise<{ executablePath: string }> {
	// Simplified chromium check
	return {
		executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
	}
}