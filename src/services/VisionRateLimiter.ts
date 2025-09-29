/**
 * Менеджер ограничений для Vision API - Cosmos AI Innovation
 * Інтегровано в Cline для запобігання перевищення лімітів AI Vision API
 */

export interface RateLimitResult {
	allowed: boolean
	waitTime?: number // Час очікування в міллісекундах
	reason?: string // Причина відмови
	quotaRemaining?: number // Залишок квоти на сьогодні
}

export class VisionRateLimiter {
	// Ліміти AI Vision API (стандартні, можуть варіюватися)
	private static readonly DAILY_LIMIT = 50 // Запитів на день
	private static readonly HOUR_LIMIT = 10 // Запитів на годину
	private static readonly MINUTE_LIMIT = 1 // Запитів на хвилину
	private static readonly BURST_LIMIT = 2 // Burst ліміт

	// Лічильники використання
	private dailyCount = 0
	private hourlyCount = 0
	private minuteCount = 0
	private burstCount = 0

	// Часові мітки останнього скидання
	private lastDailyReset = Date.now()
	private lastHourlyReset = Date.now()
	private lastMinuteReset = Date.now()
	private lastRequestTime = 0

	// Проміжки скидання
	private readonly HOUR_MS = 60 * 60 * 1000
	private readonly DAY_MS = 24 * 60 * 60 * 1000

	constructor() {
		// Відновлення лічильників з локального сховища
		this.loadUsageStats()
	}

	/**
	 * Перевіряє, чи можна зробити запит до Vision API
	 */
	canMakeVisionRequest(): RateLimitResult {
		const now = Date.now()

		// Скидання лічильників по таймаутах
		this.resetCountersIfNeeded(now)

		// Перевірка burst ліміту (дуже часті запити)
		if (this.burstCount >= VisionRateLimiter.BURST_LIMIT) {
			const timeSinceLastRequest = now - this.lastRequestTime
			if (timeSinceLastRequest < 2000) {
				// 2 секунди мінімум між запитами
				return {
					allowed: false,
					waitTime: 2000 - timeSinceLastRequest,
					reason: "Burst limit exceeded",
					quotaRemaining: VisionRateLimiter.DAILY_LIMIT - this.dailyCount,
				}
			}
		}

		// Перевірка хвилинного ліміту
		if (this.minuteCount >= VisionRateLimiter.MINUTE_LIMIT) {
			const timeToNextMinute = 60 * 1000 - (now - this.lastMinuteReset)
			return {
				allowed: false,
				waitTime: Math.max(1000, timeToNextMinute), // Мінімум 1 секунда
				reason: "Minute limit exceeded",
				quotaRemaining: VisionRateLimiter.DAILY_LIMIT - this.dailyCount,
			}
		}

		// Перевірка годинного ліміту
		if (this.hourlyCount >= VisionRateLimiter.HOUR_LIMIT) {
			const timeToNextHour = this.HOUR_MS - (now - this.lastHourlyReset)
			return {
				allowed: false,
				waitTime: timeToNextHour,
				reason: "Hourly limit exceeded",
				quotaRemaining: VisionRateLimiter.DAILY_LIMIT - this.dailyCount,
			}
		}

		// Перевірка денного ліміту
		if (this.dailyCount >= VisionRateLimiter.DAILY_LIMIT) {
			const timeToNextDay = this.DAY_MS - (now - this.lastDailyReset)
			return {
				allowed: false,
				waitTime: timeToNextDay,
				reason: "Daily limit exceeded",
				quotaRemaining: 0,
			}
		}

		// Усі перевірки пройдені
		return {
			allowed: true,
			quotaRemaining: VisionRateLimiter.DAILY_LIMIT - this.dailyCount,
		}
	}

	/**
	 * Реєструє успішний запит до Vision API
	 */
	recordRequest(): void {
		const now = Date.now()

		this.dailyCount++
		this.hourlyCount++
		this.minuteCount++
		this.burstCount++
		this.lastRequestTime = now

		// Збереження статистики
		this.saveUsageStats()

		console.log(`[CosmosVisionLimiter] Request recorded. Usage: ${this.dailyCount}/${VisionRateLimiter.DAILY_LIMIT} daily`)
	}

	/**
	 * Отримати поточну статистику використання
	 */
	getUsageStats(): {
		daily: { used: number; limit: number; remaining: number; resetIn: number }
		hourly: { used: number; limit: number; remaining: number; resetIn: number }
		minute: { used: number; limit: number; remaining: number; resetIn: number }
	} {
		const now = Date.now()

		return {
			daily: {
				used: this.dailyCount,
				limit: VisionRateLimiter.DAILY_LIMIT,
				remaining: Math.max(0, VisionRateLimiter.DAILY_LIMIT - this.dailyCount),
				resetIn: this.DAY_MS - (now - this.lastDailyReset),
			},
			hourly: {
				used: this.hourlyCount,
				limit: VisionRateLimiter.HOUR_LIMIT,
				remaining: Math.max(0, VisionRateLimiter.HOUR_LIMIT - this.hourlyCount),
				resetIn: this.HOUR_MS - (now - this.lastHourlyReset),
			},
			minute: {
				used: this.minuteCount,
				limit: VisionRateLimiter.MINUTE_LIMIT,
				remaining: Math.max(0, VisionRateLimiter.MINUTE_LIMIT - this.minuteCount),
				resetIn: 60 * 1000 - (now - this.lastMinuteReset),
			},
		}
	}

	/**
	 * Примусовий скидання лічильників (для тестування)
	 */
	resetAllCounters(): void {
		this.dailyCount = 0
		this.hourlyCount = 0
		this.minuteCount = 0
		this.burstCount = 0
		this.lastRequestTime = 0

		const now = Date.now()
		this.lastDailyReset = now
		this.lastHourlyReset = now
		this.lastMinuteReset = now

		this.saveUsageStats()
		console.log("[CosmosVisionLimiter] All counters reset")
	}

	/**
	 * Скидання лічильників по таймаутах
	 */
	private resetCountersIfNeeded(now: number): void {
		// Щоденний скидання
		if (now - this.lastDailyReset >= this.DAY_MS) {
			this.dailyCount = 0
			this.lastDailyReset = now
			console.log("[CosmosVisionLimiter] Daily counter reset")
		}

		// Погодинний скидання
		if (now - this.lastHourlyReset >= this.HOUR_MS) {
			this.hourlyCount = 0
			this.lastHourlyReset = now
			console.log("[CosmosVisionLimiter] Hourly counter reset")
		}

		// Щохвилинний скидання
		if (now - this.lastMinuteReset >= 60 * 1000) {
			this.minuteCount = 0
			this.lastMinuteReset = now
		}

		// Burst скидання (кожні 30 секунд)
		if (now - this.lastRequestTime >= 30 * 1000) {
			this.burstCount = 0
		}
	}

	/**
	 * Завантаження статистики використання з сховища
	 */
	private loadUsageStats(): void {
		try {
			// В реальному додатку тут може бути завантаження з VSCode storage
			console.log("[CosmosVisionLimiter] Usage stats loaded")
		} catch (error) {
			console.warn("[CosmosVisionLimiter] Failed to load usage stats:", error)
		}
	}

	/**
	 * Збереження статистики використання в сховище
	 */
	private saveUsageStats(): void {
		try {
			// В реальному додатку тут може бути збереження в VSCode storage/state manager
			console.log("[CosmosVisionLimiter] Usage stats saved")
		} catch (error) {
			console.warn("[CosmosVisionLimiter] Failed to save usage stats:", error)
		}
	}
}
