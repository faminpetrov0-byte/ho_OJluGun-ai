import * as vscode from "vscode"

interface TelemetryEvent {
	event: string
	properties: Record<string, any>
	timestamp: number
}

/**
 * Менеджер телеметрии для анонимной аналитики Cline
 */
export class TelemetryManager {
	private events: TelemetryEvent[] = []
	private isEnabled = false
	private sessionId: string

	constructor(private context: vscode.ExtensionContext) {
		this.sessionId = this.generateSessionId()
		this.checkTelemetrySettings()
	}

	private checkTelemetrySettings(): void {
		// Проверяем настройки VS Code для телеметрии
		const vscodeConfig = vscode.workspace.getConfiguration()
		const vscodeEnabled = (vscodeConfig.get<string>("telemetry.telemetryLevel") || "all") !== "off"

		// Проверяем настройки Cline
		const clineConfig = vscode.workspace.getConfiguration("cline")
		const clineEnabled = clineConfig.get<boolean>("enableTelemetry", false)

		this.isEnabled = vscodeEnabled && clineEnabled
	}

	/**
	 * Отслеживает выполнение команды
	 */
	trackCommand(command: string, duration: number, success: boolean): void {
		if (!this.isEnabled) {
			return
		}

		this.addEvent("command_executed", {
			command: this.sanitizeCommand(command),
			duration,
			success,
			provider: this.getCurrentProvider(),
		})
	}

	/**
	 * Отслеживает производительность AI
	 */
	trackAIPerformance(provider: string, tokens: number, responseTime: number): void {
		if (!this.isEnabled) {
			return
		}

		this.addEvent("ai_performance", {
			provider,
			tokens: Math.min(tokens, 10000), // Ограничиваем для приватности
			responseTime,
			tokensPerSecond: Math.round(tokens / (responseTime / 1000)),
		})
	}

	/**
	 * Отслеживает использование функций
	 */
	trackFeatureUsage(feature: string, context?: Record<string, any>): void {
		if (!this.isEnabled) {
			return
		}

		this.addEvent("feature_used", {
			feature,
			...this.sanitizeContext(context || {}),
		})
	}

	/**
	 * Отслеживает ошибки
	 */
	trackError(error: string, context?: Record<string, any>): void {
		if (!this.isEnabled) {
			return
		}

		this.addEvent("error_occurred", {
			error: this.sanitizeError(error),
			...this.sanitizeContext(context || {}),
		})
	}

	/**
	 * Отслеживает использование инструментов
	 */
	trackToolUsage(toolName: string, success: boolean, duration?: number): void {
		if (!this.isEnabled) {
			return
		}

		this.addEvent("tool_used", {
			tool: toolName,
			success,
			duration: duration || 0,
		})
	}

	/**
	 * Отслеживает создание задач
	 */
	trackTaskCreated(taskType: string, complexity?: "simple" | "medium" | "complex"): void {
		if (!this.isEnabled) {
			return
		}

		this.addEvent("task_created", {
			type: taskType,
			complexity: complexity || "unknown",
		})
	}

	/**
	 * Отслеживает завершение задач
	 */
	trackTaskCompleted(taskType: string, duration: number, success: boolean, stepsCount?: number): void {
		if (!this.isEnabled) {
			return
		}

		this.addEvent("task_completed", {
			type: taskType,
			duration,
			success,
			steps: stepsCount || 0,
		})
	}

	/**
	 * Отслеживает использование браузера
	 */
	trackBrowserUsage(action: string, url?: string): void {
		if (!this.isEnabled) {
			return
		}

		this.addEvent("browser_used", {
			action,
			domain: url ? this.extractDomain(url) : undefined,
		})
	}

	private addEvent(event: string, properties: Record<string, any>): void {
		this.events.push({
			event,
			properties: {
				...properties,
				sessionId: this.sessionId,
				timestamp: Date.now(),
			},
			timestamp: Date.now(),
		})

		// Ограничиваем размер буфера
		if (this.events.length > 1000) {
			this.events = this.events.slice(-500)
		}

		// Периодически сохраняем события
		if (this.events.length % 10 === 0) {
			this.persistEvents()
		}
	}

	private getCurrentProvider(): string {
		try {
			const config = vscode.workspace.getConfiguration("cline")
			return config.get<string>("apiProvider", "unknown")
		} catch {
			return "unknown"
		}
	}

	private sanitizeCommand(command: string): string {
		// Удаляем потенциально чувствительную информацию
		return command
			.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
			.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, "[CARD]")
			.replace(/\b[A-Za-z0-9]{20,}\b/g, "[TOKEN]")
			.replace(/password\s*[=:]\s*\S+/gi, "password=[REDACTED]")
			.replace(/api[_-]?key\s*[=:]\s*\S+/gi, "api_key=[REDACTED]")
	}

	private sanitizeError(error: string): string {
		return this.sanitizeCommand(error)
	}

	private sanitizeContext(context: Record<string, any>): Record<string, any> {
		const sanitized: Record<string, any> = {}

		for (const [key, value] of Object.entries(context)) {
			if (typeof value === "string") {
				sanitized[key] = this.sanitizeCommand(value)
			} else if (typeof value === "number" || typeof value === "boolean") {
				sanitized[key] = value
			} else {
				sanitized[key] = "[OBJECT]"
			}
		}

		return sanitized
	}

	private extractDomain(url: string): string {
		try {
			const domain = new URL(url).hostname
			// Возвращаем только домен верхнего уровня для приватности
			const parts = domain.split(".")
			if (parts.length >= 2) {
				return parts.slice(-2).join(".")
			}
			return domain
		} catch {
			return "unknown"
		}
	}

	private generateSessionId(): string {
		return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
	}

	/**
	 * Сохраняет события в локальное хранилище
	 */
	private async persistEvents(): Promise<void> {
		try {
			await this.context.globalState.update("telemetry_events", this.events)
		} catch (error) {
			console.warn("[TelemetryManager] Failed to persist events:", error)
		}
	}

	/**
	 * Получает статистику использования
	 */
	getUsageStats(): {
		totalCommands: number
		averageResponseTime: number
		mostUsedFeatures: Array<{ feature: string; count: number }>
		errorRate: number
		sessionDuration: number
	} {
		const commands = this.events.filter((e) => e.event === "command_executed")
		const features = this.events.filter((e) => e.event === "feature_used")
		const errors = this.events.filter((e) => e.event === "error_occurred")

		const avgResponseTime =
			commands.length > 0 ? commands.reduce((sum, e) => sum + (e.properties.duration || 0), 0) / commands.length : 0

		const featureCounts = features.reduce(
			(acc, e) => {
				const feature = e.properties.feature
				acc[feature] = (acc[feature] || 0) + 1
				return acc
			},
			{} as Record<string, number>,
		)

		const mostUsedFeatures = Object.entries(featureCounts)
			.map(([feature, count]) => ({ feature, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 5)

		const errorRate = commands.length > 0 ? (errors.length / commands.length) * 100 : 0

		const sessionStart = this.events.length > 0 ? this.events[0].timestamp : Date.now()
		const sessionDuration = Date.now() - sessionStart

		return {
			totalCommands: commands.length,
			averageResponseTime: Math.round(avgResponseTime),
			mostUsedFeatures,
			errorRate: Math.round(errorRate * 100) / 100,
			sessionDuration: Math.round(sessionDuration / 1000), // в секундах
		}
	}

	/**
	 * Очищает все события
	 */
	async clearEvents(): Promise<void> {
		this.events = []
		await this.context.globalState.update("telemetry_events", [])
	}

	/**
	 * Включает/выключает телеметрию
	 */
	setEnabled(enabled: boolean): void {
		this.isEnabled = enabled
		if (!enabled) {
			this.clearEvents()
		}
	}

	/**
	 * Проверяет, включена ли телеметрия
	 */
	isEnabledStatus(): boolean {
		return this.isEnabled
	}
}
