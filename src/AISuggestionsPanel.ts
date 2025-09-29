import * as vscode from "vscode"

interface Suggestion {
	id: string
	title: string
	description: string
	action: string
	priority: "low" | "medium" | "high" | "critical"
	category: "performance" | "security" | "refactor" | "bug" | "feature"
	confidence: number
}

interface CodeContext {
	filePath: string
	content: string
	language: string
	cursorPosition: number
	selectedText?: string
}

export class AISuggestionsPanel {
	private panel: vscode.WebviewPanel | undefined
	private suggestions: Suggestion[] = []
	private context: vscode.ExtensionContext

	constructor(context: vscode.ExtensionContext) {
		this.context = context
	}

	async generateSuggestions(codeContext: CodeContext): Promise<Suggestion[]> {
		const suggestions: Suggestion[] = []

		// Performance suggestions
		suggestions.push(...this.analyzePerformance(codeContext))

		// Security suggestions
		suggestions.push(...this.analyzeSecurity(codeContext))

		// Code quality suggestions
		suggestions.push(...this.analyzeCodeQuality(codeContext))

		// Feature suggestions
		suggestions.push(...this.suggestFeatures(codeContext))

		this.suggestions = suggestions.sort((a, b) => {
			const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
			return priorityOrder[b.priority] - priorityOrder[a.priority]
		})

		this.updatePanel()
		return this.suggestions
	}

	private analyzePerformance(context: CodeContext): Suggestion[] {
		const suggestions: Suggestion[] = []
		const content = context.content.toLowerCase()

		// Detect inefficient loops
		if (content.includes("for") && content.includes("array") && content.includes("push")) {
			suggestions.push({
				id: "perf-001",
				title: "Optimize Array Operations",
				description: "Consider using map/filter instead of for loops with push",
				action: "Replace for loop with functional methods",
				priority: "medium",
				category: "performance",
				confidence: 0.8,
			})
		}

		// Detect synchronous operations
		if (content.includes("fs.readfilesync") || content.includes("fs.writefilesync")) {
			suggestions.push({
				id: "perf-002",
				title: "Use Async File Operations",
				description: "Synchronous file operations block the event loop",
				action: "Replace with async/await versions",
				priority: "high",
				category: "performance",
				confidence: 0.9,
			})
		}

		return suggestions
	}

	private analyzeSecurity(context: CodeContext): Suggestion[] {
		const suggestions: Suggestion[] = []
		const content = context.content.toLowerCase()

		// Detect potential SQL injection
		if (content.includes("query") && content.includes("+") && content.includes("select")) {
			suggestions.push({
				id: "sec-001",
				title: "Potential SQL Injection",
				description: "String concatenation in SQL queries is dangerous",
				action: "Use parameterized queries or prepared statements",
				priority: "critical",
				category: "security",
				confidence: 0.85,
			})
		}

		// Detect hardcoded secrets
		if (content.includes("password") || content.includes("api_key") || content.includes("secret")) {
			suggestions.push({
				id: "sec-002",
				title: "Hardcoded Credentials Detected",
				description: "Credentials should not be hardcoded in source code",
				action: "Move to environment variables or secure vault",
				priority: "critical",
				category: "security",
				confidence: 0.7,
			})
		}

		return suggestions
	}

	private analyzeCodeQuality(context: CodeContext): Suggestion[] {
		const suggestions: Suggestion[] = []
		const content = context.content

		// Detect long functions
		const functionMatches = content.match(/function\s+\w+\s*\([^)]*\)\s*{[^}]*}/g) || []
		functionMatches.forEach((func) => {
			if (func.split("\n").length > 20) {
				suggestions.push({
					id: "quality-001",
					title: "Long Function Detected",
					description: "Function is too long and should be split",
					action: "Extract smaller functions for better readability",
					priority: "medium",
					category: "refactor",
					confidence: 0.8,
				})
			}
		})

		// Detect missing error handling
		if (content.includes("await") && !content.includes("try") && !content.includes("catch")) {
			suggestions.push({
				id: "quality-002",
				title: "Missing Error Handling",
				description: "Async operations should have proper error handling",
				action: "Add try-catch blocks around async operations",
				priority: "high",
				category: "bug",
				confidence: 0.9,
			})
		}

		return suggestions
	}

	private suggestFeatures(context: CodeContext): Suggestion[] {
		const suggestions: Suggestion[] = []
		const content = context.content.toLowerCase()

		// Suggest logging
		if (!content.includes("console.log") && !content.includes("logger")) {
			suggestions.push({
				id: "feature-001",
				title: "Add Logging",
				description: "Consider adding logging for better debugging",
				action: "Add appropriate logging statements",
				priority: "low",
				category: "feature",
				confidence: 0.6,
			})
		}

		// Suggest tests
		if (context.filePath.includes(".ts") && !context.filePath.includes(".test.") && !context.filePath.includes(".spec.")) {
			suggestions.push({
				id: "feature-002",
				title: "Add Unit Tests",
				description: "This file could benefit from unit tests",
				action: "Create corresponding test file",
				priority: "medium",
				category: "feature",
				confidence: 0.7,
			})
		}

		return suggestions
	}

	showPanel() {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Two)
			return
		}

		this.panel = vscode.window.createWebviewPanel("aiSuggestions", "AI Suggestions", vscode.ViewColumn.Two, {
			enableScripts: true,
			retainContextWhenHidden: true,
		})

		this.panel.onDidDispose(() => {
			this.panel = undefined
		})

		this.updatePanel()
	}

	private updatePanel() {
		if (!this.panel) {
			return
		}

		this.panel.webview.html = this.getWebviewContent()
	}

	private getWebviewContent(): string {
		const suggestionItems = this.suggestions
			.map(
				(suggestion) => `
			<div class="suggestion-item ${suggestion.priority}">
				<div class="suggestion-header">
					<span class="suggestion-title">${suggestion.title}</span>
					<span class="suggestion-priority">${suggestion.priority.toUpperCase()}</span>
				</div>
				<div class="suggestion-description">${suggestion.description}</div>
				<div class="suggestion-action">${suggestion.action}</div>
				<div class="suggestion-confidence">Confidence: ${Math.round(suggestion.confidence * 100)}%</div>
			</div>
		`,
			)
			.join("")

		return `
			<!DOCTYPE html>
			<html>
			<head>
				<style>
					body { font-family: var(--vscode-font-family); padding: 20px; }
					.suggestion-item { 
						border: 1px solid var(--vscode-panel-border);
						margin: 10px 0; padding: 15px; border-radius: 5px;
					}
					.suggestion-item.critical { border-left: 4px solid #ff4444; }
					.suggestion-item.high { border-left: 4px solid #ff8800; }
					.suggestion-item.medium { border-left: 4px solid #ffaa00; }
					.suggestion-item.low { border-left: 4px solid #00aa00; }
					.suggestion-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
					.suggestion-title { font-weight: bold; }
					.suggestion-priority { 
						background: var(--vscode-badge-background); 
						color: var(--vscode-badge-foreground);
						padding: 2px 8px; border-radius: 3px; font-size: 0.8em;
					}
					.suggestion-description { margin: 8px 0; color: var(--vscode-descriptionForeground); }
					.suggestion-action { font-style: italic; color: var(--vscode-textLink-foreground); }
					.suggestion-confidence { font-size: 0.9em; color: var(--vscode-descriptionForeground); margin-top: 8px; }
				</style>
			</head>
			<body>
				<h2>🤖 AI Code Suggestions</h2>
				${suggestionItems || "<p>No suggestions available. Start coding to get AI-powered recommendations!</p>"}
			</body>
			</html>
		`
	}
}
