interface ValidationRule {
	id: string
	name: string
	category: "security" | "performance" | "maintainability" | "reliability"
	severity: "info" | "warning" | "error" | "critical"
	check: (code: string, context: ValidationContext) => ValidationResult
}

interface ValidationContext {
	filePath: string
	language: string
	projectType: string
	existingCode?: string
	dependencies: string[]
}

interface ValidationResult {
	passed: boolean
	issues: ValidationIssue[]
	score: number
	suggestions: string[]
}

interface ValidationIssue {
	ruleId: string
	severity: "info" | "warning" | "error" | "critical"
	message: string
	line?: number
	column?: number
	suggestion?: string
}

export class QualityGateManager {
	private rules: Map<string, ValidationRule> = new Map()
	private thresholds = {
		critical: 0, // No critical issues allowed
		error: 2, // Max 2 errors allowed
		warning: 10, // Max 10 warnings allowed
		minScore: 7.0, // Minimum quality score (0-10)
	}

	constructor() {
		this.initializeDefaultRules()
	}

	async validateBeforeExecution(code: string, context: ValidationContext): Promise<ValidationResult> {
		const issues: ValidationIssue[] = []
		let totalScore = 10.0
		const suggestions: string[] = []

		// Run all applicable rules
		for (const rule of this.rules.values()) {
			if (this.isRuleApplicable(rule, context)) {
				const result = rule.check(code, context)
				issues.push(...result.issues)
				suggestions.push(...result.suggestions)

				// Adjust score based on issues
				const penalty = this.calculatePenalty(result.issues)
				totalScore = Math.max(0, totalScore - penalty)
			}
		}

		const passed = this.checkThresholds(issues, totalScore)

		return {
			passed,
			issues: issues.sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity)),
			score: Math.round(totalScore * 10) / 10,
			suggestions: [...new Set(suggestions)],
		}
	}

	private initializeDefaultRules() {
		// Security Rules
		this.addRule({
			id: "SEC-001",
			name: "No Hardcoded Secrets",
			category: "security",
			severity: "critical",
			check: (code, context) => this.checkHardcodedSecrets(code, context),
		})

		this.addRule({
			id: "SEC-002",
			name: "SQL Injection Prevention",
			category: "security",
			severity: "critical",
			check: (code, context) => this.checkSqlInjection(code, context),
		})

		this.addRule({
			id: "SEC-003",
			name: "XSS Prevention",
			category: "security",
			severity: "error",
			check: (code, context) => this.checkXssVulnerability(code, context),
		})

		// Performance Rules
		this.addRule({
			id: "PERF-001",
			name: "Async Operations",
			category: "performance",
			severity: "warning",
			check: (code, context) => this.checkAsyncOperations(code, context),
		})

		this.addRule({
			id: "PERF-002",
			name: "Memory Leaks",
			category: "performance",
			severity: "error",
			check: (code, context) => this.checkMemoryLeaks(code, context),
		})

		// Maintainability Rules
		this.addRule({
			id: "MAINT-001",
			name: "Function Complexity",
			category: "maintainability",
			severity: "warning",
			check: (code, context) => this.checkFunctionComplexity(code, context),
		})

		this.addRule({
			id: "MAINT-002",
			name: "Error Handling",
			category: "reliability",
			severity: "error",
			check: (code, context) => this.checkErrorHandling(code, context),
		})
	}

	private checkHardcodedSecrets(code: string, _context: ValidationContext): ValidationResult {
		const issues: ValidationIssue[] = []
		const suggestions: string[] = []

		const secretPatterns = [
			/password\s*[=:]\s*["'][^"']+["']/gi,
			/api[_-]?key\s*[=:]\s*["'][^"']+["']/gi,
			/secret\s*[=:]\s*["'][^"']+["']/gi,
			/token\s*[=:]\s*["'][^"']+["']/gi,
			/[a-zA-Z0-9]{32,}/g, // Potential API keys/tokens
		]

		const lines = code.split("\n")

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]

			for (const pattern of secretPatterns) {
				const matches = line.match(pattern)
				if (matches) {
					issues.push({
						ruleId: "SEC-001",
						severity: "critical",
						message: "Hardcoded secret detected. Use environment variables instead.",
						line: i + 1,
						suggestion: "Move to process.env.SECRET_NAME or use a secure vault",
					})

					suggestions.push("Use environment variables for sensitive data")
				}
			}
		}

		return {
			passed: issues.length === 0,
			issues,
			score: issues.length === 0 ? 10 : Math.max(0, 10 - issues.length * 3),
			suggestions,
		}
	}

	private checkSqlInjection(code: string, _context: ValidationContext): ValidationResult {
		const issues: ValidationIssue[] = []
		const suggestions: string[] = []

		// Check for string concatenation in SQL queries
		const sqlConcatPattern = /query.*\+.*["'`]/gi
		const lines = code.split("\n")

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]

			if (sqlConcatPattern.test(line) && /select|insert|update|delete/i.test(line)) {
				issues.push({
					ruleId: "SEC-002",
					severity: "critical",
					message: "Potential SQL injection vulnerability detected",
					line: i + 1,
					suggestion: "Use parameterized queries or prepared statements",
				})

				suggestions.push("Always use parameterized queries for SQL operations")
			}
		}

		return {
			passed: issues.length === 0,
			issues,
			score: issues.length === 0 ? 10 : 0,
			suggestions,
		}
	}

	private checkXssVulnerability(code: string, _context: ValidationContext): ValidationResult {
		const issues: ValidationIssue[] = []
		const suggestions: string[] = []

		// Check for direct HTML insertion
		const xssPatterns = [/innerHTML\s*=\s*[^;]+/gi, /document\.write\s*\(/gi, /\.html\s*\(\s*[^)]*\+/gi]

		const lines = code.split("\n")

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]

			for (const pattern of xssPatterns) {
				if (pattern.test(line)) {
					issues.push({
						ruleId: "SEC-003",
						severity: "error",
						message: "Potential XSS vulnerability detected",
						line: i + 1,
						suggestion: "Sanitize user input before inserting into DOM",
					})

					suggestions.push("Always sanitize user input before DOM insertion")
				}
			}
		}

		return {
			passed: issues.length === 0,
			issues,
			score: issues.length === 0 ? 10 : Math.max(0, 10 - issues.length * 2),
			suggestions,
		}
	}

	private checkAsyncOperations(code: string, _context: ValidationContext): ValidationResult {
		const issues: ValidationIssue[] = []
		const suggestions: string[] = []

		// Check for synchronous file operations
		const syncPatterns = [/fs\.readFileSync/g, /fs\.writeFileSync/g, /fs\.existsSync/g]

		const lines = code.split("\n")

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]

			for (const pattern of syncPatterns) {
				if (pattern.test(line)) {
					issues.push({
						ruleId: "PERF-001",
						severity: "warning",
						message: "Synchronous file operation blocks event loop",
						line: i + 1,
						suggestion: "Use async version with await",
					})

					suggestions.push("Prefer async file operations to avoid blocking")
				}
			}
		}

		return {
			passed: true, // Warnings don't fail validation
			issues,
			score: Math.max(0, 10 - issues.length * 0.5),
			suggestions,
		}
	}

	private checkMemoryLeaks(code: string, _context: ValidationContext): ValidationResult {
		const issues: ValidationIssue[] = []
		const suggestions: string[] = []

		// Check for potential memory leaks
		const leakPatterns = [
			/setInterval\s*\(/g,
			/addEventListener\s*\(/g,
			/new\s+Array\s*\(\s*\d{6,}\s*\)/g, // Large array allocations
		]

		const lines = code.split("\n")

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]

			if (leakPatterns[0].test(line) && !line.includes("clearInterval")) {
				issues.push({
					ruleId: "PERF-002",
					severity: "error",
					message: "setInterval without clearInterval may cause memory leak",
					line: i + 1,
					suggestion: "Ensure clearInterval is called to clean up",
				})
			}

			if (leakPatterns[1].test(line) && !code.includes("removeEventListener")) {
				issues.push({
					ruleId: "PERF-002",
					severity: "warning",
					message: "Event listener without cleanup may cause memory leak",
					line: i + 1,
					suggestion: "Add removeEventListener in cleanup code",
				})
			}
		}

		return {
			passed: issues.filter((i) => i.severity === "error").length === 0,
			issues,
			score: Math.max(0, 10 - issues.length * 1.5),
			suggestions,
		}
	}

	private checkFunctionComplexity(code: string, _context: ValidationContext): ValidationResult {
		const issues: ValidationIssue[] = []
		const suggestions: string[] = []

		// Simple cyclomatic complexity check
		const functionRegex = /function\s+\w+[^{]*{([^{}]*{[^{}]*}[^{}]*)*[^{}]*}/g
		const complexityKeywords = /if|else|while|for|switch|case|catch|\?|&&|\|\|/g

		let match
		const _lines = code.split("\n")

		while ((match = functionRegex.exec(code)) !== null) {
			const functionCode = match[0]
			const complexity = (functionCode.match(complexityKeywords) || []).length + 1

			if (complexity > 10) {
				// Find line number
				const beforeFunction = code.substring(0, match.index)
				const lineNumber = beforeFunction.split("\n").length

				issues.push({
					ruleId: "MAINT-001",
					severity: "warning",
					message: `Function has high cyclomatic complexity (${complexity})`,
					line: lineNumber,
					suggestion: "Consider breaking into smaller functions",
				})

				suggestions.push("Break complex functions into smaller, focused functions")
			}
		}

		return {
			passed: true, // Warnings don't fail validation
			issues,
			score: Math.max(0, 10 - issues.length * 0.5),
			suggestions,
		}
	}

	private checkErrorHandling(code: string, _context: ValidationContext): ValidationResult {
		const issues: ValidationIssue[] = []
		const suggestions: string[] = []

		// Check for async operations without error handling
		const asyncPattern = /await\s+/g
		const tryPattern = /try\s*{/g

		const hasAsync = asyncPattern.test(code)
		const hasTryCatch = tryPattern.test(code)

		if (hasAsync && !hasTryCatch) {
			issues.push({
				ruleId: "MAINT-002",
				severity: "error",
				message: "Async operations without proper error handling",
				suggestion: "Wrap async operations in try-catch blocks",
			})

			suggestions.push("Always handle errors in async operations")
		}

		return {
			passed: issues.length === 0,
			issues,
			score: issues.length === 0 ? 10 : 5,
			suggestions,
		}
	}

	private addRule(rule: ValidationRule) {
		this.rules.set(rule.id, rule)
	}

	private isRuleApplicable(_rule: ValidationRule, _context: ValidationContext): boolean {
		// All rules are applicable by default
		// Could be enhanced to filter by language, project type, etc.
		return true
	}

	private checkThresholds(issues: ValidationIssue[], score: number): boolean {
		const criticalCount = issues.filter((i) => i.severity === "critical").length
		const errorCount = issues.filter((i) => i.severity === "error").length
		const warningCount = issues.filter((i) => i.severity === "warning").length

		return (
			criticalCount <= this.thresholds.critical &&
			errorCount <= this.thresholds.error &&
			warningCount <= this.thresholds.warning &&
			score >= this.thresholds.minScore
		)
	}

	private calculatePenalty(issues: ValidationIssue[]): number {
		return issues.reduce((penalty, issue) => {
			const weights = { critical: 5, error: 2, warning: 0.5, info: 0.1 }
			return penalty + weights[issue.severity]
		}, 0)
	}

	private getSeverityWeight(severity: string): number {
		const weights = { critical: 4, error: 3, warning: 2, info: 1 }
		return weights[severity as keyof typeof weights] || 0
	}

	updateThresholds(newThresholds: Partial<typeof this.thresholds>) {
		this.thresholds = { ...this.thresholds, ...newThresholds }
	}

	getQualityReport(results: ValidationResult[]): {
		overallScore: number
		totalIssues: number
		issuesByCategory: Record<string, number>
		recommendations: string[]
	} {
		const allIssues = results.flatMap((r) => r.issues)
		const overallScore = results.reduce((sum, r) => sum + r.score, 0) / results.length

		const issuesByCategory = allIssues.reduce(
			(acc, issue) => {
				acc[issue.severity] = (acc[issue.severity] || 0) + 1
				return acc
			},
			{} as Record<string, number>,
		)

		const allSuggestions = results.flatMap((r) => r.suggestions)
		const recommendations = [...new Set(allSuggestions)]

		return {
			overallScore: Math.round(overallScore * 10) / 10,
			totalIssues: allIssues.length,
			issuesByCategory,
			recommendations,
		}
	}
}
