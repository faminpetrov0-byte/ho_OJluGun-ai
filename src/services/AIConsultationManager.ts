/**
 * Менеджер AI консультаций - обсуждение планов с другими AI
 */
export class AIConsultationManager {
	private isEnabled = false
	private consultationHistory: Array<{
		plan: string
		consultation: string
		corrections: string[]
		timestamp: number
	}> = []

	/**
	 * Переключает режим консультаций
	 */
	toggleConsultation(): boolean {
		this.isEnabled = !this.isEnabled
		console.log(`[AIConsultation] ${this.isEnabled ? 'Enabled' : 'Disabled'}`)
		return this.isEnabled
	}

	/**
	 * Проверяет, включены ли консультации
	 */
	isConsultationEnabled(): boolean {
		return this.isEnabled
	}

	/**
	 * Консультируется с другими AI перед выполнением плана
	 */
	async consultOnPlan(plan: string, context: string = ''): Promise<{
		shouldProceed: boolean
		corrections: string[]
		consultation: string
	}> {
		if (!this.isEnabled) {
			return {
				shouldProceed: true,
				corrections: [],
				consultation: 'Consultation disabled'
			}
		}

		console.log('[AIConsultation] Starting plan consultation...')

		try {
			// Симуляция консультации с разными AI
			const consultation = await this.performConsultation(plan, context)
			
			// Анализ результатов консультации
			const analysis = this.analyzeConsultation(consultation)
			
			// Сохраняем в историю
			this.consultationHistory.push({
				plan,
				consultation,
				corrections: analysis.corrections,
				timestamp: Date.now()
			})

			// Ограничиваем историю
			if (this.consultationHistory.length > 50) {
				this.consultationHistory.shift()
			}

			return {
				shouldProceed: analysis.shouldProceed,
				corrections: analysis.corrections,
				consultation
			}

		} catch (error) {
			console.error('[AIConsultation] Consultation failed:', error)
			return {
				shouldProceed: true,
				corrections: [`Consultation error: ${error}`],
				consultation: 'Consultation failed, proceeding with original plan'
			}
		}
	}

	/**
	 * Выполняет консультацию с AI
	 */
	private async performConsultation(plan: string, context: string): Promise<string> {
		// В реальной реализации здесь будут запросы к разным AI API
		
		const consultationPrompt = `
Please review this execution plan and provide feedback:

CONTEXT: ${context}

PLAN TO REVIEW:
${plan}

Please analyze:
1. Potential risks or issues
2. Missing steps or considerations  
3. Better approaches or optimizations
4. Security concerns
5. Overall feasibility

Provide specific, actionable feedback.
`

		// Симуляция ответа от AI консультанта
		await new Promise(resolve => setTimeout(resolve, 1000))

		// Примерный ответ консультанта
		const mockConsultation = `
CONSULTATION FEEDBACK:

✅ STRENGTHS:
- Plan structure is logical and well-organized
- Includes proper error handling considerations

⚠️ POTENTIAL ISSUES:
1. Missing backup/rollback strategy for file modifications
2. No validation of user permissions before file operations
3. Could benefit from progress checkpoints

🔧 SUGGESTIONS:
1. Add git stash before risky operations
2. Validate file permissions first
3. Break large operations into smaller chunks
4. Add user confirmation for destructive actions

📊 RISK ASSESSMENT: MEDIUM
The plan is generally safe but could be improved with additional safeguards.

RECOMMENDATION: PROCEED WITH MODIFICATIONS
`

		return mockConsultation
	}

	/**
	 * Анализирует результаты консультации
	 */
	private analyzeConsultation(consultation: string): {
		shouldProceed: boolean
		corrections: string[]
	} {
		const corrections: string[] = []
		let shouldProceed = true

		// Извлекаем предложения из консультации
		const suggestionMatches = consultation.match(/\d+\.\s+([^\n]+)/g)
		if (suggestionMatches) {
			corrections.push(...suggestionMatches.map(s => s.trim()))
		}

		// Проверяем на критические проблемы
		const criticalKeywords = [
			'dangerous', 'critical', 'security risk', 'data loss',
			'irreversible', 'destructive', 'unsafe'
		]

		const hasCriticalIssues = criticalKeywords.some(keyword => 
			consultation.toLowerCase().includes(keyword)
		)

		if (hasCriticalIssues) {
			shouldProceed = false
			corrections.unshift('CRITICAL ISSUES DETECTED - Review required before proceeding')
		}

		// Проверяем рекомендацию
		if (consultation.includes('DO NOT PROCEED') || consultation.includes('STOP')) {
			shouldProceed = false
		}

		return { shouldProceed, corrections }
	}

	/**
	 * Применяет коррекции к плану
	 */
	applyCorrections(originalPlan: string, corrections: string[]): string {
		if (corrections.length === 0) {
			return originalPlan
		}

		let correctedPlan = originalPlan

		// Добавляем коррекции в начало плана
		const correctionSection = `
APPLIED CORRECTIONS FROM AI CONSULTATION:
${corrections.map((c, i) => `${i + 1}. ${c}`).join('\n')}

ORIGINAL PLAN (WITH CORRECTIONS):
`

		correctedPlan = correctionSection + correctedPlan

		return correctedPlan
	}

	/**
	 * Получает историю консультаций
	 */
	getConsultationHistory(limit: number = 10) {
		return this.consultationHistory
			.slice(-limit)
			.map(entry => ({
				...entry,
				timestamp: new Date(entry.timestamp).toISOString()
			}))
	}

	/**
	 * Очищает историю консультаций
	 */
	clearHistory(): void {
		this.consultationHistory = []
		console.log('[AIConsultation] History cleared')
	}

	/**
	 * Получает статистику консультаций
	 */
	getStats() {
		const total = this.consultationHistory.length
		const withCorrections = this.consultationHistory.filter(h => h.corrections.length > 0).length
		
		return {
			isEnabled: this.isEnabled,
			totalConsultations: total,
			consultationsWithCorrections: withCorrections,
			correctionRate: total > 0 ? (withCorrections / total * 100).toFixed(1) + '%' : '0%'
		}
	}
}