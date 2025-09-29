/**
 * Менеджер автовосстановления браузера - защита от зависаний
 */
export class BrowserRecoveryManager {
	private actionHistory: Array<{ action: string; timestamp: number; success: boolean }> = []
	private scrollAttempts = 0
	private maxScrollAttempts = 5
	private lastScrollPosition = 0
	private stuckDetectionThreshold = 3
	private recoveryInProgress = false

	/**
	 * Записывает действие в историю
	 */
	recordAction(action: string, success: boolean = true) {
		this.actionHistory.push({
			action,
			timestamp: Date.now(),
			success
		})

		// Отслеживаем скроллинг
		if (action === 'scrollDown') {
			this.scrollAttempts++
		} else {
			this.scrollAttempts = 0 // Сбрасываем если другое действие
		}

		// Оставляем только последние 20 действий
		if (this.actionHistory.length > 20) {
			this.actionHistory.shift()
		}
	}

	/**
	 * Проверяет, застрял ли браузер
	 */
	isStuck(): boolean {
		if (this.recoveryInProgress) return false

		// Проверка 1: Слишком много скроллинга подряд
		if (this.scrollAttempts >= this.maxScrollAttempts) {
			console.log(`[Recovery] Detected infinite scroll: ${this.scrollAttempts} attempts`)
			return true
		}

		// Проверка 2: Повторяющиеся неудачные действия
		const recentActions = this.actionHistory.slice(-this.stuckDetectionThreshold)
		if (recentActions.length >= this.stuckDetectionThreshold) {
			const allFailed = recentActions.every(a => !a.success)
			const sameAction = recentActions.every(a => a.action === recentActions[0].action)
			
			if (allFailed && sameAction) {
				console.log(`[Recovery] Detected stuck on action: ${recentActions[0].action}`)
				return true
			}
		}

		// Проверка 3: Долгое время на одной позиции скролла
		const now = Date.now()
		const recentScrolls = this.actionHistory
			.filter(a => a.action === 'scrollDown' && (now - a.timestamp) < 30000) // Последние 30 сек
		
		if (recentScrolls.length >= 10) {
			console.log(`[Recovery] Too many scrolls in short time: ${recentScrolls.length}`)
			return true
		}

		return false
	}

	/**
	 * Выполняет автовосстановление
	 */
	async performRecovery(page: any): Promise<boolean> {
		if (this.recoveryInProgress) return false

		this.recoveryInProgress = true
		console.log('[Recovery] Starting browser recovery...')

		try {
			// Стратегия 1: Проверка на JavaScript защиту
			const hasJSProtection = await this.detectJSProtection(page)
			if (hasJSProtection) {
				console.log('[Recovery] Detected JS protection, waiting for redirect...')
				await this.handleJSProtection(page)
				return true
			}

			// Стратегия 2: Сброс позиции скролла
			if (this.scrollAttempts >= this.maxScrollAttempts) {
				console.log('[Recovery] Resetting scroll position...')
				await page.evaluate(() => window.scrollTo(0, 0))
				await this.waitForStabilization(page)
				this.scrollAttempts = 0
				return true
			}

			// Стратегия 3: Поиск интерактивных элементов
			const hasInteractiveElements = await this.findAlternativeActions(page)
			if (hasInteractiveElements) {
				console.log('[Recovery] Found alternative actions')
				return true
			}

			// Стратегия 4: Перезагрузка страницы
			console.log('[Recovery] Reloading page as last resort...')
			await page.reload({ waitUntil: 'networkidle2', timeout: 10000 })
			await this.waitForStabilization(page)
			
			return true

		} catch (error) {
			console.error('[Recovery] Recovery failed:', error)
			return false
		} finally {
			this.recoveryInProgress = false
			this.actionHistory = [] // Очищаем историю после восстановления
		}
	}

	/**
	 * Определяет JavaScript защиту (как на lolz.live)
	 */
	private async detectJSProtection(page: any): Promise<boolean> {
		try {
			const content = await page.content()
			
			// Проверяем признаки JS защиты
			const jsProtectionSigns = [
				'slowAES.decrypt',
				'document.cookie="__x="',
				'window.location.href=',
				'Please enable JavaScript',
				'aes.js',
				'toNumbers(',
				'toHex('
			]

			const hasProtection = jsProtectionSigns.some(sign => content.includes(sign))
			
			if (hasProtection) {
				console.log('[Recovery] JS protection detected')
				return true
			}

			// Проверяем размер контента (защищенные страницы обычно очень маленькие)
			if (content.length < 1000 && content.includes('<script>')) {
				console.log('[Recovery] Suspicious small page with scripts')
				return true
			}

			return false
		} catch (error) {
			console.error('[Recovery] Error detecting JS protection:', error)
			return false
		}
	}

	/**
	 * Обрабатывает JavaScript защиту
	 */
	private async handleJSProtection(page: any): Promise<void> {
		try {
			// Ждем выполнения JavaScript и редиректа
			console.log('[Recovery] Waiting for JS protection to complete...')
			
			// Ждем изменения URL или контента
			await Promise.race([
				page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
				page.waitForFunction(() => document.body.innerText.length > 1000, { timeout: 15000 })
			])

			console.log('[Recovery] JS protection handled successfully')
			
		} catch (error) {
			console.log('[Recovery] JS protection timeout, continuing...')
		}
	}

	/**
	 * Ищет альтернативные действия на странице
	 */
	private async findAlternativeActions(page: any): Promise<boolean> {
		try {
			// Ищем кликабельные элементы
			const clickableElements = await page.evaluate(() => {
				const elements = document.querySelectorAll('a, button, [onclick], [role="button"]')
				return elements.length
			})

			if (clickableElements > 0) {
				console.log(`[Recovery] Found ${clickableElements} clickable elements`)
				return true
			}

			// Ищем формы для заполнения
			const forms = await page.evaluate(() => {
				return document.querySelectorAll('form, input, textarea').length
			})

			if (forms > 0) {
				console.log(`[Recovery] Found ${forms} form elements`)
				return true
			}

			return false
		} catch (error) {
			console.error('[Recovery] Error finding alternative actions:', error)
			return false
		}
	}

	/**
	 * Ждет стабилизации страницы
	 */
	private async waitForStabilization(page: any): Promise<void> {
		try {
			await page.waitForLoadState('networkidle', { timeout: 5000 })
		} catch (error) {
			// Игнорируем таймауты
		}
		
		// Дополнительная пауза для стабилизации
		await new Promise(resolve => setTimeout(resolve, 1000))
	}

	/**
	 * Сбрасывает состояние менеджера
	 */
	reset() {
		this.actionHistory = []
		this.scrollAttempts = 0
		this.lastScrollPosition = 0
		this.recoveryInProgress = false
	}

	/**
	 * Получает статистику восстановления
	 */
	getStats() {
		return {
			actionHistory: this.actionHistory.length,
			scrollAttempts: this.scrollAttempts,
			isRecovering: this.recoveryInProgress,
			recentActions: this.actionHistory.slice(-5)
		}
	}
}