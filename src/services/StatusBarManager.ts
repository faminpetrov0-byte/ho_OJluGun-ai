import * as vscode from "vscode"

/**
 * Статусы AI агента
 */
export type AgentStatus = "ready" | "thinking" | "executing" | "error" | "offline"

/**
 * Менеджер статус-бара для отображения состояния Cosmos AI
 */
export class StatusBarManager {
	private statusBarItem: vscode.StatusBarItem
	private currentStatus: AgentStatus = "ready"
	private isActive = false

	constructor() {
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
		this.statusBarItem.command = "cline.openChat"
		this.updateStatus("ready")
		this.statusBarItem.show()
	}

	/**
	 * Обновляет статус AI агента
	 */
	updateStatus(status: AgentStatus, message?: string): void {
		this.currentStatus = status

		switch (status) {
			case "ready":
				this.statusBarItem.text = "$(robot) Cline AI"
				this.statusBarItem.tooltip = "Cline AI Assistant - Ready"
				this.statusBarItem.backgroundColor = undefined
				this.statusBarItem.color = undefined
				break

			case "thinking":
				this.statusBarItem.text = "$(loading~spin) Cline AI"
				this.statusBarItem.tooltip = "Cline AI - Thinking..."
				this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground")
				this.statusBarItem.color = new vscode.ThemeColor("statusBarItem.warningForeground")
				break

			case "executing":
				this.statusBarItem.text = "$(gear~spin) Cline AI"
				this.statusBarItem.tooltip = "Cline AI - Executing plan..."
				this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground")
				this.statusBarItem.color = new vscode.ThemeColor("statusBarItem.prominentForeground")
				break

			case "error":
				this.statusBarItem.text = "$(error) Cline AI"
				this.statusBarItem.tooltip = `Cline AI - Error: ${message || "Unknown error"}`
				this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground")
				this.statusBarItem.color = new vscode.ThemeColor("statusBarItem.errorForeground")
				break

			case "offline":
				this.statusBarItem.text = "$(circle-slash) Cline AI"
				this.statusBarItem.tooltip = "Cline AI - Offline"
				this.statusBarItem.backgroundColor = undefined
				this.statusBarItem.color = new vscode.ThemeColor("disabledForeground")
				break
		}

		// Добавляем дополнительное сообщение если есть
		if (message && status !== "error") {
			this.statusBarItem.tooltip += ` - ${message}`
		}
	}

	/**
	 * Показывает прогресс выполнения
	 */
	showProgress(current: number, total: number, operation?: string): void {
		const percentage = Math.round((current / total) * 100)
		const progressBar = this.createProgressBar(percentage)

		this.statusBarItem.text = `$(gear~spin) ${progressBar} ${percentage}%`
		this.statusBarItem.tooltip = operation
			? `Cline AI - ${operation} (${current}/${total})`
			: `Cline AI - Progress: ${current}/${total}`
	}

	/**
	 * Показывает временное сообщение
	 */
	showTemporaryMessage(message: string, duration: number = 3000): void {
		const originalText = this.statusBarItem.text
		const originalTooltip = this.statusBarItem.tooltip
		const originalBackground = this.statusBarItem.backgroundColor

		this.statusBarItem.text = `$(info) ${message}`
		this.statusBarItem.tooltip = message
		this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground")

		setTimeout(() => {
			this.statusBarItem.text = originalText
			this.statusBarItem.tooltip = originalTooltip
			this.statusBarItem.backgroundColor = originalBackground
		}, duration)
	}

	/**
	 * Показывает количество активных задач
	 */
	showTaskCount(count: number): void {
		if (count === 0) {
			this.updateStatus("ready")
		} else {
			this.statusBarItem.text = `$(gear~spin) Cline AI (${count})`
			this.statusBarItem.tooltip = `Cline AI - ${count} active task${count > 1 ? "s" : ""}`
		}
	}

	/**
	 * Показывает статистику использования
	 */
	showStats(stats: { commandsExecuted?: number; filesModified?: number; errorsFixed?: number }): void {
		const parts: string[] = []

		if (stats.commandsExecuted) {
			parts.push(`${stats.commandsExecuted} commands`)
		}
		if (stats.filesModified) {
			parts.push(`${stats.filesModified} files`)
		}
		if (stats.errorsFixed) {
			parts.push(`${stats.errorsFixed} fixes`)
		}

		if (parts.length > 0) {
			this.statusBarItem.tooltip = `Cline AI - Session: ${parts.join(", ")}`
		}
	}

	/**
	 * Получает текущий статус
	 */
	getCurrentStatus(): AgentStatus {
		return this.currentStatus
	}

	/**
	 * Скрывает статус-бар
	 */
	hide(): void {
		this.statusBarItem.hide()
		this.isActive = false
	}

	/**
	 * Показывает статус-бар
	 */
	show(): void {
		this.statusBarItem.show()
		this.isActive = true
	}

	/**
	 * Проверяет, активен ли статус-бар
	 */
	isVisible(): boolean {
		return this.isActive
	}

	/**
	 * Освобождает ресурсы
	 */
	dispose(): void {
		this.statusBarItem.dispose()
	}

	/**
	 * Создает ASCII прогресс-бар
	 */
	private createProgressBar(percentage: number, width: number = 10): string {
		const filled = Math.round((percentage / 100) * width)
		const empty = width - filled
		return "█".repeat(filled) + "░".repeat(empty)
	}

	/**
	 * Анимация мигания для привлечения внимания
	 */
	blink(times: number = 3, interval: number = 500): void {
		let count = 0
		const originalBackground = this.statusBarItem.backgroundColor

		const blinkInterval = setInterval(() => {
			if (count >= times * 2) {
				clearInterval(blinkInterval)
				this.statusBarItem.backgroundColor = originalBackground
				return
			}

			this.statusBarItem.backgroundColor =
				count % 2 === 0 ? new vscode.ThemeColor("statusBarItem.prominentBackground") : originalBackground

			count++
		}, interval)
	}

	/**
	 * Показывает индикатор подключения к API
	 */
	showApiStatus(provider: string, connected: boolean): void {
		const _icon = connected ? "$(check)" : "$(x)"
		const status = connected ? "Connected" : "Disconnected"

		this.statusBarItem.tooltip = `Cline AI - ${provider}: ${status}`

		if (!connected && this.currentStatus === "ready") {
			this.updateStatus("offline", `${provider} disconnected`)
		}
	}
}
