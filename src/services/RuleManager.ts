import * as path from "path"
import * as vscode from "vscode"

/**
 * Правило проекта для AI агента
 */
export interface ProjectRule {
	id: string
	name: string
	description: string
	pattern: string
	action: "enforce" | "suggest" | "warn"
	category: "code-style" | "security" | "performance" | "architecture" | "custom"
	enabled: boolean
	priority: number
	createdAt: Date
	updatedAt: Date
}

/**
 * Результат применения правила
 */
export interface RuleViolation {
	ruleId: string
	ruleName: string
	filePath: string
	line: number
	column: number
	message: string
	severity: "error" | "warning" | "info"
	suggestion?: string
}

/**
 * Менеджер правил проекта - управляет пользовательскими правилами для AI
 */
export class RuleManager {
	private rules: Map<string, ProjectRule> = new Map()
	private readonly rulesFile: string

	constructor(workspaceRoot: string) {
		this.rulesFile = path.join(workspaceRoot, ".cline", "rules.json")
		this.loadRules()
	}

	/**
	 * Загружает правила из файла
	 */
	private async loadRules(): Promise<void> {
		try {
			const rulesUri = vscode.Uri.file(this.rulesFile)
			const content = await vscode.workspace.fs.readFile(rulesUri)
			const rulesData = JSON.parse(Buffer.from(content).toString("utf8"))

			this.rules.clear()
			rulesData.forEach((rule: any) => {
				this.rules.set(rule.id, {
					...rule,
					createdAt: new Date(rule.createdAt),
					updatedAt: new Date(rule.updatedAt),
				})
			})
		} catch (_error) {
			// Файл не существует или поврежден - создаем дефолтные правила
			await this.createDefaultRules()
		}
	}

	/**
	 * Сохраняет правила в файл
	 */
	private async saveRules(): Promise<void> {
		try {
			// Создаем директорию если не существует
			const rulesDir = path.dirname(this.rulesFile)
			await vscode.workspace.fs.createDirectory(vscode.Uri.file(rulesDir))

			const rulesArray = Array.from(this.rules.values())
			const content = JSON.stringify(rulesArray, null, 2)

			await vscode.workspace.fs.writeFile(vscode.Uri.file(this.rulesFile), Buffer.from(content, "utf8"))
		} catch (error) {
			console.error("[RuleManager] Failed to save rules:", error)
		}
	}

	/**
	 * Создает дефолтные правила
	 */
	private async createDefaultRules(): Promise<void> {
		const defaultRules: ProjectRule[] = [
			{
				id: "no-console-log",
				name: "No Console Logs",
				description: "Avoid console.log in production code",
				pattern: "console\\.log\\(",
				action: "warn",
				category: "code-style",
				enabled: true,
				priority: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: "no-hardcoded-secrets",
				name: "No Hardcoded Secrets",
				description: "Avoid hardcoded API keys and passwords",
				pattern: "(api[_-]?key|password|secret|token)\\s*[=:]\\s*[\"'][^\"']+[\"']",
				action: "enforce",
				category: "security",
				enabled: true,
				priority: 10,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]

		defaultRules.forEach((rule) => {
			this.rules.set(rule.id, rule)
		})

		await this.saveRules()
	}

	/**
	 * Добавляет новое правило
	 */
	async addRule(rule: Omit<ProjectRule, "id" | "createdAt" | "updatedAt">): Promise<string> {
		const id = this.generateRuleId()
		const newRule: ProjectRule = {
			...rule,
			id,
			createdAt: new Date(),
			updatedAt: new Date(),
		}

		this.rules.set(id, newRule)
		await this.saveRules()
		return id
	}

	/**
	 * Получает правила для AI контекста
	 */
	getRulesForAI(): string {
		const enabledRules = Array.from(this.rules.values())
			.filter((rule) => rule.enabled)
			.sort((a, b) => b.priority - a.priority)

		if (enabledRules.length === 0) {
			return "No custom rules defined for this project."
		}

		let rulesText = "Project Rules (follow these when generating code):\n\n"

		enabledRules.forEach((rule, index) => {
			rulesText += `${index + 1}. ${rule.name} (${rule.action})\n`
			rulesText += `   ${rule.description}\n\n`
		})

		return rulesText
	}

	/**
	 * Проверяет файл на соответствие правилам
	 */
	async checkFile(filePath: string): Promise<RuleViolation[]> {
		const violations: RuleViolation[] = []

		try {
			const fileUri = vscode.Uri.file(filePath)
			const content = await vscode.workspace.fs.readFile(fileUri)
			const text = Buffer.from(content).toString("utf8")
			const lines = text.split("\n")

			const enabledRules = Array.from(this.rules.values()).filter((rule) => rule.enabled)

			for (const rule of enabledRules) {
				const regex = new RegExp(rule.pattern, "gi")

				lines.forEach((line, lineIndex) => {
					let match
					while ((match = regex.exec(line)) !== null) {
						violations.push({
							ruleId: rule.id,
							ruleName: rule.name,
							filePath,
							line: lineIndex + 1,
							column: match.index + 1,
							message: rule.description,
							severity: this.actionToSeverity(rule.action),
						})
					}
				})
			}
		} catch (error) {
			console.error(`[RuleManager] Failed to check file ${filePath}:`, error)
		}

		return violations
	}

	private generateRuleId(): string {
		return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
	}

	private actionToSeverity(action: ProjectRule["action"]): RuleViolation["severity"] {
		switch (action) {
			case "enforce":
				return "error"
			case "warn":
				return "warning"
			case "suggest":
				return "info"
			default:
				return "info"
		}
	}
}
