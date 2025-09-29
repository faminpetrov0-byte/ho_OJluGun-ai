import { ClineDefaultTool } from "../shared/tools"

interface TaskAnalysis {
	taskType: "file_operation" | "code_analysis" | "execution" | "search" | "browser" | "terminal"
	complexity: "low" | "medium" | "high"
	riskLevel: "safe" | "moderate" | "risky"
	estimatedTime: number
}

interface ToolEfficiency {
	toolName: ClineDefaultTool
	efficiency: number
	suitability: number
	riskScore: number
}

export class SmartToolSelector {
	private toolPerformanceHistory: Map<ClineDefaultTool, number[]> = new Map()

	async selectOptimalTool(task: string, availableTools: ClineDefaultTool[]): Promise<ClineDefaultTool> {
		const analysis = this.analyzeTask(task)
		const toolEfficiencies = this.calculateToolEfficiencies(analysis, availableTools)

		// Sort by combined score (efficiency + suitability - risk)
		const bestTool = toolEfficiencies.sort((a, b) => {
			const scoreA = a.efficiency + a.suitability - a.riskScore
			const scoreB = b.efficiency + b.suitability - b.riskScore
			return scoreB - scoreA
		})[0]

		return bestTool.toolName
	}

	private analyzeTask(task: string): TaskAnalysis {
		const taskLower = task.toLowerCase()

		// Determine task type
		let taskType: TaskAnalysis["taskType"] = "execution"
		if (taskLower.includes("file") || taskLower.includes("read") || taskLower.includes("write")) {
			taskType = "file_operation"
		} else if (taskLower.includes("analyze") || taskLower.includes("review") || taskLower.includes("check")) {
			taskType = "code_analysis"
		} else if (taskLower.includes("search") || taskLower.includes("find")) {
			taskType = "search"
		} else if (taskLower.includes("browser") || taskLower.includes("web") || taskLower.includes("click")) {
			taskType = "browser"
		} else if (taskLower.includes("terminal") || taskLower.includes("command") || taskLower.includes("run")) {
			taskType = "terminal"
		}

		// Determine complexity
		const complexity = task.length > 100 ? "high" : task.length > 50 ? "medium" : "low"

		// Determine risk level
		const riskKeywords = ["delete", "remove", "rm", "drop", "truncate", "format"]
		const riskLevel = riskKeywords.some((keyword) => taskLower.includes(keyword))
			? "risky"
			: taskLower.includes("modify") || taskLower.includes("change")
				? "moderate"
				: "safe"

		return {
			taskType,
			complexity,
			riskLevel,
			estimatedTime: this.estimateTaskTime(taskType, complexity),
		}
	}

	private calculateToolEfficiencies(analysis: TaskAnalysis, availableTools: ClineDefaultTool[]): ToolEfficiency[] {
		const toolMappings: Record<TaskAnalysis["taskType"], ClineDefaultTool[]> = {
			file_operation: [ClineDefaultTool.FILE_READ, ClineDefaultTool.FILE_NEW, ClineDefaultTool.LIST_FILES],
			code_analysis: [ClineDefaultTool.FILE_READ, ClineDefaultTool.LIST_FILES],
			search: [ClineDefaultTool.SEARCH, ClineDefaultTool.LIST_FILES],
			browser: [ClineDefaultTool.BROWSER],
			terminal: [ClineDefaultTool.BASH],
			execution: [ClineDefaultTool.BASH, ClineDefaultTool.BROWSER],
		}

		return availableTools.map((tool) => {
			const suitableTools = toolMappings[analysis.taskType] || []
			const suitability = suitableTools.includes(tool) ? 1.0 : 0.3

			const efficiency = this.getToolEfficiency(tool)
			const riskScore = this.calculateRiskScore(tool, analysis.riskLevel)

			return {
				toolName: tool,
				efficiency,
				suitability,
				riskScore,
			}
		})
	}

	private getToolEfficiency(tool: ClineDefaultTool): number {
		const history = this.toolPerformanceHistory.get(tool) || [0.7]
		return history.reduce((sum, score) => sum + score, 0) / history.length
	}

	private calculateRiskScore(tool: ClineDefaultTool, riskLevel: TaskAnalysis["riskLevel"]): number {
		const toolRisks: Record<ClineDefaultTool, number> = {
			[ClineDefaultTool.ASK]: 0.2,
			[ClineDefaultTool.ATTEMPT]: 0.1,
			[ClineDefaultTool.BASH]: 0.8,
			[ClineDefaultTool.FILE_EDIT]: 0.5,
			[ClineDefaultTool.FILE_READ]: 0.1,
			[ClineDefaultTool.FILE_NEW]: 0.4,
			[ClineDefaultTool.SEARCH]: 0.1,
			[ClineDefaultTool.LIST_FILES]: 0.1,
			[ClineDefaultTool.LIST_CODE_DEF]: 0.1,
			[ClineDefaultTool.BROWSER]: 0.6,
			[ClineDefaultTool.MCP_USE]: 0.7,
			[ClineDefaultTool.MCP_ACCESS]: 0.5,
			[ClineDefaultTool.MCP_DOCS]: 0.2,
			[ClineDefaultTool.NEW_TASK]: 0.3,
			[ClineDefaultTool.PLAN_MODE]: 0.3,
			[ClineDefaultTool.TODO]: 0.2,
			[ClineDefaultTool.WEB_FETCH]: 0.4,
			[ClineDefaultTool.CONDENSE]: 0.2,
			[ClineDefaultTool.SUMMARIZE_TASK]: 0.2,
			[ClineDefaultTool.REPORT_BUG]: 0.7,
			[ClineDefaultTool.NEW_RULE]: 0.6,
		}

		const baseRisk = toolRisks[tool] || 0.5
		const riskMultiplier = riskLevel === "risky" ? 2.0 : riskLevel === "moderate" ? 1.5 : 1.0

		return baseRisk * riskMultiplier
	}

	private estimateTaskTime(taskType: TaskAnalysis["taskType"], complexity: TaskAnalysis["complexity"]): number {
		const baseTime = {
			file_operation: 2,
			code_analysis: 5,
			search: 3,
			browser: 10,
			terminal: 5,
			execution: 8,
		}[taskType]

		const complexityMultiplier = {
			low: 1.0,
			medium: 2.0,
			high: 4.0,
		}[complexity]

		return baseTime * complexityMultiplier
	}

	recordToolPerformance(tool: ClineDefaultTool, success: boolean, executionTime: number) {
		const score = success ? Math.max(0.1, 1.0 - executionTime / 30) : 0.1

		if (!this.toolPerformanceHistory.has(tool)) {
			this.toolPerformanceHistory.set(tool, [])
		}

		const history = this.toolPerformanceHistory.get(tool)!
		history.push(score)

		// Keep only last 10 records
		if (history.length > 10) {
			history.shift()
		}
	}
}
