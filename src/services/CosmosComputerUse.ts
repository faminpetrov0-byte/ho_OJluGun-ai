import { Browser, chromium, Page } from "playwright"
import { VisionRateLimiter } from "./VisionRateLimiter.js"

/**
 * Computer Use возможности для Cline - интеграция Cosmos AI
 * Расширенное управление браузером с Vision анализом
 */
export class CosmosComputerUse {
	private browser: Browser | null = null
	private page: Page | null = null
	private visionLimiter: VisionRateLimiter

	constructor() {
		this.visionLimiter = new VisionRateLimiter()
	}

	/**
	 * Инициализация браузера
	 */
	async initialize(): Promise<Page> {
		if (!this.browser) {
			this.browser = await chromium.launch({
				headless: true,
				args: ["--no-sandbox", "--disable-setuid-sandbox"],
			})
		}
		if (!this.page) {
			this.page = await this.browser.newPage()
			await this.page.setViewportSize({ width: 1280, height: 720 })
		}
		return this.page
	}

	/**
	 * Навигация к URL
	 */
	async navigateToUrl(url: string): Promise<void> {
		if (!this.page) {
			await this.initialize()
		}
		await this.page!.goto(url, { waitUntil: "networkidle" })
	}

	/**
	 * Клик по элементу
	 */
	async clickElement(selector: string): Promise<void> {
		if (!this.page) {
			throw new Error("Browser not initialized")
		}

		await this.page.waitForSelector(selector, { timeout: 5000 })
		await this.page.click(selector)
	}

	/**
	 * Ввод текста в поле
	 */
	async typeText(selector: string, text: string): Promise<void> {
		if (!this.page) {
			throw new Error("Browser not initialized")
		}

		await this.page.waitForSelector(selector, { timeout: 5000 })
		await this.page.fill(selector, text)
	}

	/**
	 * Скриншот с Vision анализом
	 */
	async takeSmartScreenshot(
		_context: string,
		_task: string,
	): Promise<{
		screenshot: Buffer
		analysis?: {
			pageElements: string[]
			suggestedActions: string[]
			successIndicators: string[]
			issues: string[]
		}
	}> {
		if (!this.page) {
			throw new Error("Browser not initialized")
		}

		const screenshot = await this.page.screenshot({ type: "png" })

		// Проверяем лимиты Vision API
		const rateCheck = this.visionLimiter.canMakeVisionRequest()
		if (!rateCheck.allowed) {
			console.log(`[CosmosComputerUse] Vision blocked: ${rateCheck.reason}`)
			return { screenshot }
		}

		// В реальной реализации здесь будет Vision анализ
		const analysis = {
			pageElements: ["webpage", "navigation", "content-area"],
			suggestedActions: ["analyze-page-structure", "locate-interactive-elements"],
			successIndicators: ["page-loaded", "elements-visible"],
			issues: [],
		}

		this.visionLimiter.recordRequest()
		return { screenshot, analysis }
	}

	/**
	 * Поиск элементов на странице
	 */
	async findElements(query: string): Promise<string[]> {
		if (!this.page) {
			throw new Error("Browser not initialized")
		}

		const selectors: string[] = []

		// Поиск по тексту
		const textElements = await this.page.locator(`text=${query}`).all()
		for (let i = 0; i < textElements.length; i++) {
			selectors.push(`text=${query}`)
		}

		// Поиск по placeholder
		const placeholderElements = await this.page.locator(`[placeholder*="${query}"]`).all()
		for (let i = 0; i < placeholderElements.length; i++) {
			selectors.push(`[placeholder*="${query}"]`)
		}

		// Поиск по aria-label
		const ariaElements = await this.page.locator(`[aria-label*="${query}"]`).all()
		for (let i = 0; i < ariaElements.length; i++) {
			selectors.push(`[aria-label*="${query}"]`)
		}

		return [...new Set(selectors)]
	}

	/**
	 * Ожидание элемента
	 */
	async waitForElement(selector: string, timeout: number = 5000): Promise<boolean> {
		if (!this.page) {
			throw new Error("Browser not initialized")
		}

		try {
			await this.page.waitForSelector(selector, { timeout })
			return true
		} catch {
			return false
		}
	}

	/**
	 * Получение текста элемента
	 */
	async getElementText(selector: string): Promise<string> {
		if (!this.page) {
			throw new Error("Browser not initialized")
		}

		const element = await this.page.locator(selector).first()
		return (await element.textContent()) || ""
	}

	/**
	 * Скролл страницы с защитой от зацикливания
	 */
	async scrollPage(direction: "up" | "down", pixels: number = 500): Promise<boolean> {
		if (!this.page) {
			throw new Error("Browser not initialized")
		}

		// Получаем текущую позицию скролла
		const beforeScroll = await this.page.evaluate(() => window.pageYOffset)
		
		const scrollY = direction === "down" ? pixels : -pixels
		await this.page.evaluate((y) => {
			window.scrollBy(0, y)
		}, scrollY)
		
		// Ждем завершения скролла
		await this.page.waitForTimeout(300)
		
		// Проверяем, изменилась ли позиция
		const afterScroll = await this.page.evaluate(() => window.pageYOffset)
		
		// Возвращаем true если скролл произошел, false если достигли конца
		return Math.abs(afterScroll - beforeScroll) > 10
	}

	/**
	 * Проверка достижения конца страницы
	 */
	async isAtPageEnd(): Promise<boolean> {
		if (!this.page) {
			return true
		}
		
		return await this.page.evaluate(() => {
			const scrollTop = window.pageYOffset
			const windowHeight = window.innerHeight
			const documentHeight = document.documentElement.scrollHeight
			
			// Считаем что достигли конца если осталось меньше 100px
			return (scrollTop + windowHeight) >= (documentHeight - 100)
		})
	}

	/**
	 * Получение статуса браузера
	 */
	async getBrowserStatus(): Promise<{
		isConnected: boolean
		currentUrl?: string
		pageTitle?: string
		viewportSize?: { width: number; height: number }
		isAtEnd?: boolean
	}> {
		if (!this.page) {
			return { isConnected: false }
		}

		try {
			return {
				isConnected: true,
				currentUrl: this.page.url(),
				pageTitle: await this.page.title(),
				viewportSize: (await this.page.viewportSize()) || undefined,
				isAtEnd: await this.isAtPageEnd(),
			}
		} catch {
			return { isConnected: false }
		}
	}

	/**
	 * Закрытие браузера
	 */
	async dispose(): Promise<void> {
		if (this.browser) {
			await this.browser.close()
			this.browser = null
			this.page = null
		}
	}
}
