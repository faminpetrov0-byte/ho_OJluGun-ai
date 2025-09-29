import * as path from "path"
import * as vscode from "vscode"

/**
 * Результат операции с файлом
 */
export interface FileOperationResult {
	success: boolean
	content?: string
	error?: string
	path?: string
}

/**
 * Информация о файле
 */
export interface FileInfo {
	path: string
	name: string
	size: number
	isDirectory: boolean
	lastModified: Date
	extension?: string
}

/**
 * Менеджер файловой системы для Cosmos AI
 * Упрощенные операции с файлами через VS Code API
 */
export class FileSystemManager {
	private workspaceRoot: string

	constructor(workspaceRoot?: string) {
		this.workspaceRoot = workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ""
	}

	/**
	 * Чтение файла
	 */
	async readFile(filePath: string): Promise<FileOperationResult> {
		try {
			const fullPath = this.resolvePath(filePath)
			const uri = vscode.Uri.file(fullPath)
			const content = await vscode.workspace.fs.readFile(uri)

			return {
				success: true,
				content: Buffer.from(content).toString("utf8"),
				path: fullPath,
			}
		} catch (error: any) {
			return {
				success: false,
				error: error.message,
				path: filePath,
			}
		}
	}

	/**
	 * Создание файла
	 */
	async createFile(filePath: string, content: string): Promise<FileOperationResult> {
		try {
			const fullPath = this.resolvePath(filePath)
			const uri = vscode.Uri.file(fullPath)

			// Создаем директории если не существуют
			const dirPath = path.dirname(fullPath)
			await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath))

			// Создаем файл
			await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"))

			return {
				success: true,
				path: fullPath,
			}
		} catch (error: any) {
			return {
				success: false,
				error: error.message,
				path: filePath,
			}
		}
	}

	/**
	 * Модификация файла
	 */
	async modifyFile(filePath: string, oldContent: string, newContent: string): Promise<FileOperationResult> {
		try {
			const readResult = await this.readFile(filePath)
			if (!readResult.success || !readResult.content) {
				return readResult
			}

			const updatedContent = readResult.content.replace(oldContent, newContent)
			return await this.writeFile(filePath, updatedContent)
		} catch (error: any) {
			return {
				success: false,
				error: error.message,
				path: filePath,
			}
		}
	}

	/**
	 * Запись в файл
	 */
	async writeFile(filePath: string, content: string): Promise<FileOperationResult> {
		try {
			const fullPath = this.resolvePath(filePath)
			const uri = vscode.Uri.file(fullPath)

			await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"))

			return {
				success: true,
				path: fullPath,
			}
		} catch (error: any) {
			return {
				success: false,
				error: error.message,
				path: filePath,
			}
		}
	}

	/**
	 * Удаление файла
	 */
	async deleteFile(filePath: string): Promise<FileOperationResult> {
		try {
			const fullPath = this.resolvePath(filePath)
			const uri = vscode.Uri.file(fullPath)

			await vscode.workspace.fs.delete(uri)

			return {
				success: true,
				path: fullPath,
			}
		} catch (error: any) {
			return {
				success: false,
				error: error.message,
				path: filePath,
			}
		}
	}

	/**
	 * Проверка существования файла
	 */
	async fileExists(filePath: string): Promise<boolean> {
		try {
			const fullPath = this.resolvePath(filePath)
			const uri = vscode.Uri.file(fullPath)
			const stat = await vscode.workspace.fs.stat(uri)
			return stat.type === vscode.FileType.File
		} catch {
			return false
		}
	}

	/**
	 * Получение информации о файле
	 */
	async getFileInfo(filePath: string): Promise<FileInfo | null> {
		try {
			const fullPath = this.resolvePath(filePath)
			const uri = vscode.Uri.file(fullPath)
			const stat = await vscode.workspace.fs.stat(uri)

			return {
				path: fullPath,
				name: path.basename(fullPath),
				size: stat.size,
				isDirectory: stat.type === vscode.FileType.Directory,
				lastModified: new Date(stat.mtime),
				extension: path.extname(fullPath).slice(1),
			}
		} catch {
			return null
		}
	}

	/**
	 * Список файлов в директории
	 */
	async listDirectory(dirPath: string): Promise<FileInfo[]> {
		try {
			const fullPath = this.resolvePath(dirPath)
			const uri = vscode.Uri.file(fullPath)
			const entries = await vscode.workspace.fs.readDirectory(uri)

			const fileInfos: FileInfo[] = []

			for (const [name, type] of entries) {
				const itemPath = path.join(fullPath, name)
				const itemUri = vscode.Uri.file(itemPath)

				try {
					const stat = await vscode.workspace.fs.stat(itemUri)
					fileInfos.push({
						path: itemPath,
						name,
						size: stat.size,
						isDirectory: type === vscode.FileType.Directory,
						lastModified: new Date(stat.mtime),
						extension: type === vscode.FileType.File ? path.extname(name).slice(1) : undefined,
					})
				} catch {
					// Пропускаем файлы к которым нет доступа
				}
			}

			return fileInfos.sort((a, b) => {
				// Директории сначала, потом файлы по алфавиту
				if (a.isDirectory && !b.isDirectory) {
					return -1
				}
				if (!a.isDirectory && b.isDirectory) {
					return 1
				}
				return a.name.localeCompare(b.name)
			})
		} catch {
			return []
		}
	}

	/**
	 * Создание директории
	 */
	async createDirectory(dirPath: string): Promise<FileOperationResult> {
		try {
			const fullPath = this.resolvePath(dirPath)
			const uri = vscode.Uri.file(fullPath)

			await vscode.workspace.fs.createDirectory(uri)

			return {
				success: true,
				path: fullPath,
			}
		} catch (error: any) {
			return {
				success: false,
				error: error.message,
				path: dirPath,
			}
		}
	}

	/**
	 * Поиск файлов по паттерну
	 */
	async findFiles(pattern: string, exclude?: string): Promise<string[]> {
		try {
			const files = await vscode.workspace.findFiles(pattern, exclude)
			return files.map((uri) => uri.fsPath)
		} catch {
			return []
		}
	}

	/**
	 * Копирование файла
	 */
	async copyFile(sourcePath: string, targetPath: string): Promise<FileOperationResult> {
		try {
			const sourceUri = vscode.Uri.file(this.resolvePath(sourcePath))
			const targetUri = vscode.Uri.file(this.resolvePath(targetPath))

			await vscode.workspace.fs.copy(sourceUri, targetUri)

			return {
				success: true,
				path: targetUri.fsPath,
			}
		} catch (error: any) {
			return {
				success: false,
				error: error.message,
				path: targetPath,
			}
		}
	}

	/**
	 * Перемещение файла
	 */
	async moveFile(sourcePath: string, targetPath: string): Promise<FileOperationResult> {
		try {
			const sourceUri = vscode.Uri.file(this.resolvePath(sourcePath))
			const targetUri = vscode.Uri.file(this.resolvePath(targetPath))

			await vscode.workspace.fs.rename(sourceUri, targetUri)

			return {
				success: true,
				path: targetUri.fsPath,
			}
		} catch (error: any) {
			return {
				success: false,
				error: error.message,
				path: targetPath,
			}
		}
	}

	/**
	 * Получение размера файла/директории
	 */
	async getSize(filePath: string): Promise<number> {
		try {
			const info = await this.getFileInfo(filePath)
			if (!info) {
				return 0
			}

			if (info.isDirectory) {
				// Рекурсивно считаем размер директории
				const files = await this.listDirectory(filePath)
				let totalSize = 0

				for (const file of files) {
					if (file.isDirectory) {
						totalSize += await this.getSize(file.path)
					} else {
						totalSize += file.size
					}
				}

				return totalSize
			}

			return info.size
		} catch {
			return 0
		}
	}

	/**
	 * Разрешение относительного пути к абсолютному
	 */
	private resolvePath(filePath: string): string {
		if (path.isAbsolute(filePath)) {
			return filePath
		}
		return path.join(this.workspaceRoot, filePath)
	}

	/**
	 * Получение относительного пути от workspace root
	 */
	getRelativePath(filePath: string): string {
		if (!this.workspaceRoot) {
			return filePath
		}
		return path.relative(this.workspaceRoot, filePath)
	}

	/**
	 * Проверка, находится ли файл в workspace
	 */
	isInWorkspace(filePath: string): boolean {
		if (!this.workspaceRoot) {
			return false
		}
		const fullPath = this.resolvePath(filePath)
		return fullPath.startsWith(this.workspaceRoot)
	}
}
