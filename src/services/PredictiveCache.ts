import { createHash } from "crypto"

interface PredictionPattern {
	context: string
	nextActions: string[]
	frequency: number
	lastUsed: number
}

interface CacheEntry {
	key: string
	value: any
	timestamp: number
	accessCount: number
	predictedNext: string[]
}

export class PredictiveCache {
	private cache: Map<string, CacheEntry> = new Map()
	private patterns: Map<string, PredictionPattern> = new Map()
	private maxCacheSize = 1000
	private maxPatterns = 500
	private predictionAccuracy: Map<string, number> = new Map()

	async predictNextActions(currentContext: string): Promise<string[]> {
		const contextHash = this.hashContext(currentContext)
		const pattern = this.patterns.get(contextHash)

		if (pattern) {
			// Update last used timestamp
			pattern.lastUsed = Date.now()

			// Pre-cache likely next actions
			await this.precacheActions(pattern.nextActions)

			return pattern.nextActions.slice(0, 5) // Return top 5 predictions
		}

		// If no pattern found, analyze similar contexts
		return this.findSimilarPatterns(currentContext)
	}

	async cacheWithPrediction(key: string, value: any, context: string): Promise<void> {
		const predictions = await this.predictNextActions(context)

		const entry: CacheEntry = {
			key,
			value,
			timestamp: Date.now(),
			accessCount: 1,
			predictedNext: predictions,
		}

		this.cache.set(key, entry)
		this.evictIfNeeded()
	}

	get(key: string): any {
		const entry = this.cache.get(key)
		if (!entry) {
			return null
		}

		// Update access statistics
		entry.accessCount++
		entry.timestamp = Date.now()

		// Trigger predictive caching for next actions
		this.triggerPredictiveCaching(entry.predictedNext)

		return entry.value
	}

	recordActionSequence(context: string, _action: string, nextAction?: string) {
		const contextHash = this.hashContext(context)

		if (!this.patterns.has(contextHash)) {
			this.patterns.set(contextHash, {
				context: contextHash,
				nextActions: [],
				frequency: 0,
				lastUsed: Date.now(),
			})
		}

		const pattern = this.patterns.get(contextHash)!

		if (nextAction) {
			// Add or update next action frequency
			const actionIndex = pattern.nextActions.indexOf(nextAction)
			if (actionIndex === -1) {
				pattern.nextActions.push(nextAction)
			} else {
				// Move to front (most recent)
				pattern.nextActions.splice(actionIndex, 1)
				pattern.nextActions.unshift(nextAction)
			}
		}

		pattern.frequency++
		pattern.lastUsed = Date.now()

		this.evictPatternsIfNeeded()
	}

	private async precacheActions(actions: string[]): Promise<void> {
		// Pre-cache common file operations
		for (const action of actions.slice(0, 3)) {
			if (action.includes("read_file:")) {
				const filePath = action.split(":")[1]
				if (filePath && !this.cache.has(`file_content:${filePath}`)) {
					try {
						// This would integrate with FileSystemManager
						// const content = await this.fileManager.readFile(filePath)
						// this.cache.set(`file_content:${filePath}`, { key: `file_content:${filePath}`, value: content, timestamp: Date.now(), accessCount: 0, predictedNext: [] })
					} catch (_error) {
						// Ignore pre-cache errors
					}
				}
			}
		}
	}

	private triggerPredictiveCaching(predictions: string[]) {
		// Asynchronously cache predicted next actions
		setTimeout(() => {
			this.precacheActions(predictions)
		}, 100)
	}

	private findSimilarPatterns(context: string): string[] {
		const contextWords = context.toLowerCase().split(/\s+/)
		const similarities: Array<{ pattern: PredictionPattern; score: number }> = []

		for (const [_hash, pattern] of this.patterns) {
			const patternWords = pattern.context.toLowerCase().split(/\s+/)
			const similarity = this.calculateSimilarity(contextWords, patternWords)

			if (similarity > 0.3) {
				similarities.push({ pattern, score: similarity })
			}
		}

		// Sort by similarity and frequency
		similarities.sort((a, b) => {
			const scoreA = a.score * Math.log(a.pattern.frequency + 1)
			const scoreB = b.score * Math.log(b.pattern.frequency + 1)
			return scoreB - scoreA
		})

		// Combine predictions from top similar patterns
		const predictions: string[] = []
		for (const sim of similarities.slice(0, 3)) {
			predictions.push(...sim.pattern.nextActions.slice(0, 2))
		}

		return [...new Set(predictions)].slice(0, 5)
	}

	private calculateSimilarity(words1: string[], words2: string[]): number {
		const set1 = new Set(words1)
		const set2 = new Set(words2)
		const intersection = new Set([...set1].filter((x) => set2.has(x)))
		const union = new Set([...set1, ...set2])

		return intersection.size / union.size
	}

	private hashContext(context: string): string {
		// Create a hash that captures semantic meaning
		const normalized = context
			.toLowerCase()
			.replace(/\s+/g, " ")
			.replace(/[^\w\s]/g, "")
			.trim()

		return createHash("sha256").update(normalized).digest("hex").substring(0, 16)
	}

	private evictIfNeeded() {
		if (this.cache.size <= this.maxCacheSize) {
			return
		}

		// LRU eviction with access count consideration
		const entries = Array.from(this.cache.entries())
		entries.sort((a, b) => {
			const scoreA = a[1].accessCount * (Date.now() - a[1].timestamp)
			const scoreB = b[1].accessCount * (Date.now() - b[1].timestamp)
			return scoreA - scoreB
		})

		// Remove oldest 10% of entries
		const toRemove = Math.floor(this.cache.size * 0.1)
		for (let i = 0; i < toRemove; i++) {
			this.cache.delete(entries[i][0])
		}
	}

	private evictPatternsIfNeeded() {
		if (this.patterns.size <= this.maxPatterns) {
			return
		}

		// Remove least used patterns
		const patterns = Array.from(this.patterns.entries())
		patterns.sort((a, b) => {
			const scoreA = a[1].frequency * (Date.now() - a[1].lastUsed)
			const scoreB = b[1].frequency * (Date.now() - b[1].lastUsed)
			return scoreA - scoreB
		})

		const toRemove = Math.floor(this.patterns.size * 0.1)
		for (let i = 0; i < toRemove; i++) {
			this.patterns.delete(patterns[i][0])
		}
	}

	getStats() {
		return {
			cacheSize: this.cache.size,
			patternsCount: this.patterns.size,
			hitRate: this.calculateHitRate(),
			predictionAccuracy: this.calculatePredictionAccuracy(),
		}
	}

	private calculateHitRate(): number {
		const totalAccess = Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.accessCount, 0)
		return totalAccess > 0 ? this.cache.size / totalAccess : 0
	}

	private calculatePredictionAccuracy(): number {
		const accuracies = Array.from(this.predictionAccuracy.values())
		return accuracies.length > 0 ? accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length : 0
	}
}
