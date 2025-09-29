import * as vscode from "vscode"

/**
 * Тип изменения файла
 */
export type FileChangeType = "created" | "changed" | "deleted" | "renamed"

/**
 * Событие изменения файла
 */
export interface FileChangeEvent {
	uri: vscode.Uri
	type: FileChangeType
	timestamp: Date
	oldUri?: vscode.Uri // Для переименований
}

/**
 * Статистика workspace
 */
export interface WorkspaceStats {
	totalFiles: number
	fileTypes: Record<string, number>
	totalSize: number
	lastModified: Date
	recentChanges: FileChangeEvent[]
}

/**
 * Мониторинг изменений в workspace для Cline
 */
export class WorkspaceMonitor {
	private disposables: vscode.Disposable[] = []
	private changeHistory: FileChangeEvent[] = []
	private onFileChangeCallback?: (event: FileChangeEvent) => void
	private readonly maxHistorySize = 100

	constructor() {
		this.setupWatchers()
	}

	private setupWatchers(): void {
		// Отслеживание изменений в документах
		this.disposables.push(vscode.workspace.onDidChangeTextDocument(this.handleDocumentChange.bind(this)))

		// Отслеживание создания файлов
		this.disposables.push(vscode.workspace.onDidCreateFiles(this.handleFilesCreated.bind(this)))

		// Отслеживание удаления файлов
		this.disposables.push(vscode.workspace.onDidDeleteFiles(this.handleFilesDeleted.bind(this)))

		// Отслеживание переименования файлов
		this.disposables.push(vscode.workspace.onDidRenameFiles(this.handleFilesRenamed.bind(this)))

		// Отслеживание сохранения файлов
		this.disposables.push(vscode.workspace.onDidSaveTextDocument(this.handleDocumentSaved.bind(this)))
	}

	/**
	 * Устанавливает callback для обработки изменений файлов
	 */
	setOnFileChangeCallback(callback: (event: FileChangeEvent) => void): void {
		this.onFileChangeCallback = callback
	}

	private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
		if (event.document.uri.scheme === "file" && event.contentChanges.length > 0) {
			const changeEvent: FileChangeEvent = {
				uri: event.document.uri,
				type: "changed",
				timestamp: new Date(),
			}

			this.addToHistory(changeEvent)
			this.onFileChangeCallback?.(changeEvent)
		}
	}

	private handleDocumentSaved(document: vscode.TextDocument): void {
		if (document.uri.scheme === "file") {
			const changeEvent: FileChangeEvent = {
				uri: document.uri,
				type: "changed",
				timestamp: new Date(),
			}

			this.addToHistory(changeEvent)
			this.onFileChangeCallback?.(changeEvent)
		}
	}

	private handleFilesCreated(event: vscode.FileCreateEvent): void {
		event.files.forEach((uri) => {
			const changeEvent: FileChangeEvent = {
				uri,
				type: "created",
				timestamp: new Date(),
			}

			this.addToHistory(changeEvent)
			this.onFileChangeCallback?.(changeEvent)
		})
	}

	private handleFilesDeleted(event: vscode.FileDeleteEvent): void {
		event.files.forEach((uri) => {
			const changeEvent: FileChangeEvent = {
				uri,
				type: "deleted",
				timestamp: new Date(),
			}

			this.addToHistory(changeEvent)
			this.onFileChangeCallback?.(changeEvent)
		})
	}

	private handleFilesRenamed(event: vscode.FileRenameEvent): void {
		event.files.forEach(({ oldUri, newUri }) => {
			const changeEvent: FileChangeEvent = {
				uri: newUri,
				type: "renamed",
				timestamp: new Date(),
				oldUri,
			}

			this.addToHistory(changeEvent)
			this.onFileChangeCallback?.(changeEvent)
		})
	}

	private addToHistory(event: FileChangeEvent): void {
		this.changeHistory.push(event)

		// Ограничиваем размер истории
		if (this.changeHistory.length > this.maxHistorySize) {
			this.changeHistory = this.changeHistory.slice(-this.maxHistorySize)
		}
	}

	/**
	 * Получает статистику workspace
	 */
	async getWorkspaceStats(): Promise<WorkspaceStats> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
		if (!workspaceFolder) {
			return {
				totalFiles: 0,
				fileTypes: {},
				totalSize: 0,
				lastModified: new Date(),
				recentChanges: [],
			}
		}

		try {
			const files = await vscode.workspace.findFiles("**/*", "**/node_modules/**")
			const fileTypes: Record<string, number> = {}
			let totalSize = 0
			let lastModified = new Date(0)

			for (const file of files) {
				try {
					const stat = await vscode.workspace.fs.stat(file)
					const ext = this.getFileExtension(file.path)

					fileTypes[ext] = (fileTypes[ext] || 0) + 1
					totalSize += stat.size

					if (stat.mtime > lastModified.getTime()) {
						lastModified = new Date(stat.mtime)
					}
				} catch (_error) {
					// Игнорируем ошибки доступа к файлам
				}
			}

			return {
				totalFiles: files.length,
				fileTypes,
				totalSize,
				lastModified,
				recentChanges: this.getRecentChanges(10),
			}
		} catch (error) {
			console.error("[WorkspaceMonitor] Failed to get workspace stats:", error)
			return {
				totalFiles: 0,
				fileTypes: {},
				totalSize: 0,
				lastModified: new Date(),
				recentChanges: [],
			}
		}
	}

	/**
	 * Получает недавние изменения
	 */
	getRecentChanges(limit: number = 20): FileChangeEvent[] {
		return this.changeHistory.slice(-limit).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
	}

	/**
	 * Получает изменения за определенный период
	 */
	getChangesSince(since: Date): FileChangeEvent[] {
		return this.changeHistory.filter((change) => change.timestamp >= since)
	}

	/**
	 * Получает изменения по типу файла
	 */
	getChangesByFileType(extension: string): FileChangeEvent[] {
		return this.changeHistory.filter((change) => this.getFileExtension(change.uri.path) === extension)
	}

	/**
	 * Получает наиболее активные файлы
	 */
	getMostActiveFiles(limit: number = 10): Array<{ uri: vscode.Uri; changeCount: number }> {
		const fileCounts = new Map<string, { uri: vscode.Uri; count: number }>()

		this.changeHistory.forEach((change) => {
			const path = change.uri.path
			const existing = fileCounts.get(path)

			if (existing) {
				existing.count++
			} else {
				fileCounts.set(path, { uri: change.uri, count: 1 })
			}
		})

		return Array.from(fileCounts.values())
			.sort((a, b) => b.count - a.count)
			.slice(0, limit)
			.map((item) => ({ uri: item.uri, changeCount: item.count }))
	}

	/**
	 * Проверяет, был ли файл недавно изменен
	 */
	wasRecentlyModified(uri: vscode.Uri, withinMinutes: number = 5): boolean {
		const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000)
		return this.changeHistory.some((change) => change.uri.path === uri.path && change.timestamp >= cutoff)
	}

	/**
	 * Получает расширение файла
	 */
	private getFileExtension(filePath: string): string {
		const ext = filePath.split(".").pop()?.toLowerCase()
		return ext || "no-extension"
	}

	/**
	 * Очищает историю изменений
	 */
	clearHistory(): void {
		this.changeHistory = []
	}

	/**
	 * Получает сводку активности за день
	 */
	getDailySummary(): {
		totalChanges: number
		fileTypes: Record<string, number>
		mostActiveHour: number
		changesByType: Record<FileChangeType, number>
	} {
		const today = new Date()
		today.setHours(0, 0, 0, 0)

		const todayChanges = this.changeHistory.filter((change) => change.timestamp >= today)

		const fileTypes: Record<string, number> = {}
		const hourCounts: Record<number, number> = {}
		const changesByType: Record<FileChangeType, number> = {
			created: 0,
			changed: 0,
			deleted: 0,
			renamed: 0,
		}

		todayChanges.forEach((change) => {
			// Подсчет по типам файлов
			const ext = this.getFileExtension(change.uri.path)
			fileTypes[ext] = (fileTypes[ext] || 0) + 1

			// Подсчет по часам
			const hour = change.timestamp.getHours()
			hourCounts[hour] = (hourCounts[hour] || 0) + 1

			// Подсчет по типам изменений
			changesByType[change.type]++
		})

		// Находим самый активный час
		const mostActiveHour = Object.entries(hourCounts).reduce(
			(max, [hour, count]) => (count > (hourCounts[max] || 0) ? parseInt(hour) : max),
			0,
		)

		return {
			totalChanges: todayChanges.length,
			fileTypes,
			mostActiveHour,
			changesByType,
		}
	}

	/**
	 * Освобождает ресурсы
	 */
	dispose(): void {
		this.disposables.forEach((d) => d.dispose())
		this.disposables = []
		this.changeHistory = []
	}
}
