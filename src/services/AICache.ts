import * as crypto from "crypto"

/**
 * Запись в кэше
 */
interface CacheEntry {
	response: string
	timestamp: number
	hits: number
	provider: string
	tokens?: number
}

/**
 * Статистика кэша
 */
export interface CacheStats {
	size: number
	hitRate: number
	totalHits: number
	totalMisses: number
	memoryUsage: number // в байтах
	oldestEntry?: Date
	newestEntry?: Date
}

/**
 * Кэш для AI ответов для улучшения производительности Cline
 */
export class AICache {
	private cache = new Map<string, CacheEntry>()
	private readonly maxSize: number
	private readonly ttl: number // Time to live в миллисекундах
	private hits = 0
	private misses = 0

	constructor(maxSize: number = 100, ttlMinutes: number = 30) {
		this.maxSize = maxSize
		this.ttl = ttlMinutes * 60 * 1000

		// Периодическая очистка устаревших записей
		setInterval(() => this.cleanup(), 5 * 60 * 1000) // каждые 5 минут
	}

	/**
	 * Получает кэшированный ответ
	 */
	getCachedResponse(prompt: string, provider: string = "default"): string | null {
		const key = this.createCacheKey(prompt, provider)
		const entry = this.cache.get(key)

		if (!entry) {
			this.misses++
			return null
		}

		// Проверяем TTL
		if (Date.now() - entry.timestamp > this.ttl) {
			this.cache.delete(key)
			this.misses++
			return null
		}

		// Увеличиваем счетчик использования
		entry.hits++
		this.hits++

		return entry.response
	}

	/**
	 * Сохраняет ответ в кэш
	 */
	setCachedResponse(prompt: string, response: string, provider: string = "default", tokens?: number): void {
		const key = this.createCacheKey(prompt, provider)

		// Очищаем кэш если он переполнен
		if (this.cache.size >= this.maxSize) {
			this.evictLeastUsed()
		}

		this.cache.set(key, {
			response,
			timestamp: Date.now(),
			hits: 0,
			provider,
			tokens,
		})
	}

	/**
	 * Проверяет, есть ли ответ в кэше
	 */
	hasCachedResponse(prompt: string, provider: string = "default"): boolean {
		const key = this.createCacheKey(prompt, provider)
		const entry = this.cache.get(key)

		if (!entry) {
			return false
		}

		// Проверяем TTL
		if (Date.now() - entry.timestamp > this.ttl) {
			this.cache.delete(key)
			return false
		}

		return true
	}

	/**
	 * Создает ключ кэша из промпта и провайдера
	 */
	private createCacheKey(prompt: string, provider: string): string {
		const normalizedPrompt = this.normalizePrompt(prompt)
		const combined = `${provider}:${normalizedPrompt}`
		return crypto.createHash("sha256").update(combined).digest("hex")
	}

	/**
	 * Нормализует промпт для лучшего кэширования
	 */
	private normalizePrompt(prompt: string): string {
		return prompt
			.trim()
			.toLowerCase()
			.replace(/\s+/g, " ") // Заменяем множественные пробелы на один
			.replace(/[^\w\s]/g, "") // Убираем специальные символы
			.substring(0, 1000) // Ограничиваем длину
	}

	/**
	 * Удаляет наименее используемые записи
	 */
	private evictLeastUsed(): void {
		if (this.cache.size === 0) {
			return
		}

		let leastUsedKey = ""
		let minHits = Infinity
		let oldestTime = Infinity

		for (const [key, entry] of this.cache.entries()) {
			// Приоритет: сначала по количеству использований, потом по времени
			if (entry.hits < minHits || (entry.hits === minHits && entry.timestamp < oldestTime)) {
				minHits = entry.hits
				oldestTime = entry.timestamp
				leastUsedKey = key
			}
		}

		if (leastUsedKey) {
			this.cache.delete(leastUsedKey)
		}
	}

	/**
	 * Очищает устаревшие записи
	 */
	private cleanup(): void {
		const now = Date.now()
		const keysToDelete: string[] = []

		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.timestamp > this.ttl) {
				keysToDelete.push(key)
			}
		}

		keysToDelete.forEach((key) => this.cache.delete(key))

		if (keysToDelete.length > 0) {
			console.log(`[AICache] Cleaned up ${keysToDelete.length} expired entries`)
		}
	}

	/**
	 * Очищает весь кэш
	 */
	clear(): void {
		this.cache.clear()
		this.hits = 0
		this.misses = 0
	}

	/**
	 * Удаляет записи для конкретного провайдера
	 */
	clearProvider(provider: string): void {
		const keysToDelete: string[] = []

		for (const [key, entry] of this.cache.entries()) {
			if (entry.provider === provider) {
				keysToDelete.push(key)
			}
		}

		keysToDelete.forEach((key) => this.cache.delete(key))
	}

	/**
	 * Получает статистику кэша
	 */
	getStats(): CacheStats {
		const totalRequests = this.hits + this.misses
		const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0

		let memoryUsage = 0
		let oldestEntry: Date | undefined
		let newestEntry: Date | undefined

		for (const entry of this.cache.values()) {
			memoryUsage += entry.response.length * 2 // Примерно 2 байта на символ для UTF-16

			const entryDate = new Date(entry.timestamp)
			if (!oldestEntry || entryDate < oldestEntry) {
				oldestEntry = entryDate
			}
			if (!newestEntry || entryDate > newestEntry) {
				newestEntry = entryDate
			}
		}

		return {
			size: this.cache.size,
			hitRate: Math.round(hitRate * 10000) / 100, // Процент с 2 знаками после запятой
			totalHits: this.hits,
			totalMisses: this.misses,
			memoryUsage,
			oldestEntry,
			newestEntry,
		}
	}

	/**
	 * Получает топ наиболее используемых записей
	 */
	getTopEntries(limit: number = 10): Array<{
		prompt: string
		hits: number
		provider: string
		age: number // в минутах
	}> {
		const entries: Array<{
			prompt: string
			hits: number
			provider: string
			age: number
		}> = []

		const now = Date.now()

		for (const [_key, entry] of this.cache.entries()) {
			// Пытаемся восстановить промпт из первых символов ответа (не идеально, но для статистики подойдет)
			const prompt = entry.response.substring(0, 50) + "..."
			const age = Math.round((now - entry.timestamp) / (60 * 1000))

			entries.push({
				prompt,
				hits: entry.hits,
				provider: entry.provider,
				age,
			})
		}

		return entries.sort((a, b) => b.hits - a.hits).slice(0, limit)
	}

	/**
	 * Получает статистику по провайдерам
	 */
	getProviderStats(): Record<
		string,
		{
			entries: number
			totalHits: number
			averageHits: number
		}
	> {
		const stats: Record<
			string,
			{
				entries: number
				totalHits: number
				averageHits: number
			}
		> = {}

		for (const entry of this.cache.values()) {
			if (!stats[entry.provider]) {
				stats[entry.provider] = {
					entries: 0,
					totalHits: 0,
					averageHits: 0,
				}
			}

			stats[entry.provider].entries++
			stats[entry.provider].totalHits += entry.hits
		}

		// Вычисляем средние значения
		for (const provider in stats) {
			const providerStats = stats[provider]
			providerStats.averageHits =
				providerStats.entries > 0 ? Math.round((providerStats.totalHits / providerStats.entries) * 100) / 100 : 0
		}

		return stats
	}

	/**
	 * Экспортирует кэш для сохранения
	 */
	export(): string {
		const exportData = {
			cache: Array.from(this.cache.entries()),
			stats: {
				hits: this.hits,
				misses: this.misses,
			},
			timestamp: Date.now(),
		}

		return JSON.stringify(exportData)
	}

	/**
	 * Импортирует кэш из сохраненных данных
	 */
	import(data: string): boolean {
		try {
			const importData = JSON.parse(data)

			this.cache.clear()

			for (const [key, entry] of importData.cache) {
				// Проверяем, что запись не устарела
				if (Date.now() - entry.timestamp <= this.ttl) {
					this.cache.set(key, entry)
				}
			}

			this.hits = importData.stats.hits || 0
			this.misses = importData.stats.misses || 0

			return true
		} catch (error) {
			console.error("[AICache] Failed to import cache:", error)
			return false
		}
	}
}
