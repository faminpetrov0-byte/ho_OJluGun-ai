import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"

interface AIContext {
	projectPath: string
	sessionId: string
	timestamp: number
	conversationHistory: ConversationEntry[]
	codeContext: CodeContext[]
	userPreferences: UserPreferences
	projectInsights: ProjectInsights
}

interface ConversationEntry {
	role: "user" | "assistant"
	content: string
	timestamp: number
	toolsUsed?: string[]
	outcome?: "success" | "failure" | "partial"
}

interface CodeContext {
	filePath: string
	language: string
	lastModified: number
	keyFunctions: string[]
	dependencies: string[]
	complexity: number
}

interface UserPreferences {
	codingStyle: "functional" | "oop" | "mixed"
	preferredTools: string[]
	riskTolerance: "low" | "medium" | "high"
	communicationStyle: "concise" | "detailed" | "interactive"
}

interface ProjectInsights {
	architecture: string
	mainLanguages: string[]
	frameworks: string[]
	commonPatterns: string[]
	problemAreas: string[]
	successfulSolutions: string[]
}

export class AIContextMemory {
	private contextStorage: Map<string, AIContext> = new Map()
	private persistencePath: string
	private currentContext: AIContext | null = null

	constructor(extensionContext: vscode.ExtensionContext) {
		this.persistencePath = path.join(extensionContext.globalStorageUri?.fsPath || "", "ai-context-memory.json")
		this.loadPersistedContexts()
	}

	async initializeContext(projectPath: string): Promise<AIContext> {
		const existingContext = this.contextStorage.get(projectPath)

		if (existingContext) {
			this.currentContext = existingContext
			return existingContext
		}

		// Create new context
		const newContext: AIContext = {
			projectPath,
			sessionId: this.generateSessionId(),
			timestamp: Date.now(),
			conversationHistory: [],
			codeContext: [],
			userPreferences: await this.inferUserPreferences(projectPath),
			projectInsights: await this.analyzeProject(projectPath),
		}

		this.contextStorage.set(projectPath, newContext)
		this.currentContext = newContext
		await this.persistContexts()

		return newContext
	}

	async rememberConversation(
		role: "user" | "assistant",
		content: string,
		toolsUsed?: string[],
		outcome?: "success" | "failure" | "partial",
	) {
		if (!this.currentContext) {
			return
		}

		const entry: ConversationEntry = {
			role,
			content,
			timestamp: Date.now(),
			toolsUsed,
			outcome,
		}

		this.currentContext.conversationHistory.push(entry)

		// Keep only last 100 entries to manage memory
		if (this.currentContext.conversationHistory.length > 100) {
			this.currentContext.conversationHistory = this.currentContext.conversationHistory.slice(-100)
		}

		// Learn from conversation
		await this.learnFromConversation(entry)
		await this.persistContexts()
	}

	async updateCodeContext(filePath: string, content: string) {
		if (!this.currentContext) {
			return
		}

		const language = this.detectLanguage(filePath)
		const analysis = await this.analyzeCode(content, language)

		const codeContext: CodeContext = {
			filePath,
			language,
			lastModified: Date.now(),
			keyFunctions: analysis.functions,
			dependencies: analysis.dependencies,
			complexity: analysis.complexity,
		}

		// Update or add code context
		const existingIndex = this.currentContext.codeContext.findIndex((ctx) => ctx.filePath === filePath)
		if (existingIndex >= 0) {
			this.currentContext.codeContext[existingIndex] = codeContext
		} else {
			this.currentContext.codeContext.push(codeContext)
		}

		// Keep only recent files (last 50)
		this.currentContext.codeContext.sort((a, b) => b.lastModified - a.lastModified)
		this.currentContext.codeContext = this.currentContext.codeContext.slice(0, 50)

		await this.persistContexts()
	}

	getRelevantContext(query: string): {
		conversationHistory: ConversationEntry[]
		codeContext: CodeContext[]
		insights: string[]
	} {
		if (!this.currentContext) {
			return { conversationHistory: [], codeContext: [], insights: [] }
		}

		// Find relevant conversation history
		const relevantConversations = this.findRelevantConversations(query)

		// Find relevant code context
		const relevantCode = this.findRelevantCodeContext(query)

		// Generate contextual insights
		const insights = this.generateInsights(query)

		return {
			conversationHistory: relevantConversations,
			codeContext: relevantCode,
			insights,
		}
	}

	private async learnFromConversation(entry: ConversationEntry) {
		if (!this.currentContext) {
			return
		}

		// Learn user preferences
		if (entry.role === "user") {
			this.updateUserPreferences(entry.content)
		}

		// Learn from successful solutions
		if (entry.role === "assistant" && entry.outcome === "success") {
			this.updateSuccessfulSolutions(entry.content, entry.toolsUsed || [])
		}

		// Identify problem areas
		if (entry.outcome === "failure") {
			this.identifyProblemAreas(entry.content)
		}
	}

	private updateUserPreferences(userMessage: string) {
		if (!this.currentContext) {
			return
		}

		const message = userMessage.toLowerCase()

		// Detect coding style preference
		if (message.includes("functional") || message.includes("map") || message.includes("filter")) {
			this.currentContext.userPreferences.codingStyle = "functional"
		} else if (message.includes("class") || message.includes("object") || message.includes("inheritance")) {
			this.currentContext.userPreferences.codingStyle = "oop"
		}

		// Detect communication style
		if (message.includes("brief") || message.includes("short") || message.includes("quick")) {
			this.currentContext.userPreferences.communicationStyle = "concise"
		} else if (message.includes("explain") || message.includes("detail") || message.includes("why")) {
			this.currentContext.userPreferences.communicationStyle = "detailed"
		}

		// Detect risk tolerance
		if (message.includes("careful") || message.includes("safe") || message.includes("backup")) {
			this.currentContext.userPreferences.riskTolerance = "low"
		} else if (message.includes("quick") || message.includes("fast") || message.includes("just do it")) {
			this.currentContext.userPreferences.riskTolerance = "high"
		}
	}

	private updateSuccessfulSolutions(solution: string, toolsUsed: string[]) {
		if (!this.currentContext) {
			return
		}

		// Extract patterns from successful solutions
		const patterns = this.extractPatterns(solution)
		for (const pattern of patterns) {
			if (!this.currentContext.projectInsights.successfulSolutions.includes(pattern)) {
				this.currentContext.projectInsights.successfulSolutions.push(pattern)
			}
		}

		// Update preferred tools
		for (const tool of toolsUsed) {
			if (!this.currentContext.userPreferences.preferredTools.includes(tool)) {
				this.currentContext.userPreferences.preferredTools.push(tool)
			}
		}
	}

	private findRelevantConversations(query: string): ConversationEntry[] {
		if (!this.currentContext) {
			return []
		}

		const queryWords = query.toLowerCase().split(/\s+/)
		const scored = this.currentContext.conversationHistory.map((entry) => {
			const contentWords = entry.content.toLowerCase().split(/\s+/)
			const relevance = this.calculateRelevance(queryWords, contentWords)
			return { entry, relevance }
		})

		return scored
			.filter((item) => item.relevance > 0.2)
			.sort((a, b) => b.relevance - a.relevance)
			.slice(0, 10)
			.map((item) => item.entry)
	}

	private findRelevantCodeContext(query: string): CodeContext[] {
		if (!this.currentContext) {
			return []
		}

		const queryWords = query.toLowerCase().split(/\s+/)
		const scored = this.currentContext.codeContext.map((ctx) => {
			const contextWords = [...ctx.keyFunctions, ...ctx.dependencies, path.basename(ctx.filePath)]
				.join(" ")
				.toLowerCase()
				.split(/\s+/)

			const relevance = this.calculateRelevance(queryWords, contextWords)
			return { ctx, relevance }
		})

		return scored
			.filter((item) => item.relevance > 0.1)
			.sort((a, b) => b.relevance - a.relevance)
			.slice(0, 5)
			.map((item) => item.ctx)
	}

	private generateInsights(_query: string): string[] {
		if (!this.currentContext) {
			return []
		}

		const insights: string[] = []

		// Add user preference insights
		insights.push(`User prefers ${this.currentContext.userPreferences.codingStyle} coding style`)
		insights.push(`Communication style: ${this.currentContext.userPreferences.communicationStyle}`)

		// Add project insights
		if (this.currentContext.projectInsights.commonPatterns.length > 0) {
			insights.push(
				`Common patterns in this project: ${this.currentContext.projectInsights.commonPatterns.slice(0, 3).join(", ")}`,
			)
		}

		// Add successful solution insights
		if (this.currentContext.projectInsights.successfulSolutions.length > 0) {
			insights.push(
				`Previously successful approaches: ${this.currentContext.projectInsights.successfulSolutions.slice(0, 2).join(", ")}`,
			)
		}

		return insights
	}

	private calculateRelevance(words1: string[], words2: string[]): number {
		const set1 = new Set(words1)
		const set2 = new Set(words2)
		const intersection = new Set([...set1].filter((x) => set2.has(x)))

		if (set1.size === 0 || set2.size === 0) {
			return 0
		}
		return intersection.size / Math.sqrt(set1.size * set2.size)
	}

	private async analyzeProject(_projectPath: string): Promise<ProjectInsights> {
		// This would integrate with existing project analysis
		return {
			architecture: "unknown",
			mainLanguages: ["typescript"],
			frameworks: [],
			commonPatterns: [],
			problemAreas: [],
			successfulSolutions: [],
		}
	}

	private async inferUserPreferences(_projectPath: string): Promise<UserPreferences> {
		return {
			codingStyle: "mixed",
			preferredTools: [],
			riskTolerance: "medium",
			communicationStyle: "detailed",
		}
	}

	private async analyzeCode(
		content: string,
		_language: string,
	): Promise<{
		functions: string[]
		dependencies: string[]
		complexity: number
	}> {
		// Basic code analysis - would be enhanced with proper AST parsing
		const functions = (content.match(/function\s+(\w+)|const\s+(\w+)\s*=/g) || []).map((match) =>
			match.replace(/function\s+|const\s+|=.*$/g, "").trim(),
		)

		const dependencies = (content.match(/import.*from\s+['"]([^'"]+)['"]/g) || []).map(
			(match) => match.match(/['"]([^'"]+)['"]/)![1],
		)

		const complexity = Math.min(10, Math.floor(content.length / 1000) + functions.length)

		return { functions, dependencies, complexity }
	}

	private detectLanguage(filePath: string): string {
		const ext = path.extname(filePath).toLowerCase()
		const languageMap: Record<string, string> = {
			".ts": "typescript",
			".js": "javascript",
			".py": "python",
			".java": "java",
			".cpp": "cpp",
			".c": "c",
			".go": "go",
			".rs": "rust",
		}
		return languageMap[ext] || "unknown"
	}

	private extractPatterns(text: string): string[] {
		// Extract common coding patterns from successful solutions
		const patterns: string[] = []

		if (text.includes("async/await")) {
			patterns.push("async/await pattern")
		}
		if (text.includes("try/catch")) {
			patterns.push("error handling")
		}
		if (text.includes("map(") || text.includes("filter(")) {
			patterns.push("functional programming")
		}
		if (text.includes("class ")) {
			patterns.push("object-oriented design")
		}

		return patterns
	}

	private identifyProblemAreas(content: string) {
		// Identify areas that commonly cause problems
		if (!this.currentContext) {
			return
		}

		if (content.includes("permission") || content.includes("access denied")) {
			this.addProblemArea("file permissions")
		}
		if (content.includes("network") || content.includes("timeout")) {
			this.addProblemArea("network connectivity")
		}
	}

	private addProblemArea(area: string) {
		if (!this.currentContext) {
			return
		}
		if (!this.currentContext.projectInsights.problemAreas.includes(area)) {
			this.currentContext.projectInsights.problemAreas.push(area)
		}
	}

	private generateSessionId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substr(2)
	}

	private async loadPersistedContexts() {
		try {
			const data = await fs.readFile(this.persistencePath, "utf-8")
			const contexts = JSON.parse(data)
			this.contextStorage = new Map(Object.entries(contexts))
		} catch (_error) {
			// File doesn't exist or is corrupted, start fresh
		}
	}

	private async persistContexts() {
		try {
			const contexts = Object.fromEntries(this.contextStorage)
			await fs.writeFile(this.persistencePath, JSON.stringify(contexts, null, 2))
		} catch (error) {
			console.error("Failed to persist AI context:", error)
		}
	}
}
