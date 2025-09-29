import { ApiHandler } from "@core/api"
import { FileContextTracker } from "@core/context/context-tracking/FileContextTracker"
import { ClineIgnoreController } from "@core/ignore/ClineIgnoreController"
import { DiffViewProvider } from "@integrations/editor/DiffViewProvider"
import { BrowserSession } from "@services/browser/BrowserSession"
import { AIConsultationManager } from "../../services/AIConsultationManager"
import { UrlContentFetcher } from "@services/browser/UrlContentFetcher"
import { McpHub } from "@services/mcp/McpHub"
import { ClineAsk, ClineSay } from "@shared/ExtensionMessage"
import { ClineDefaultTool } from "@shared/tools"
import { ClineAskResponse } from "@shared/WebviewMessage"
import * as vscode from "vscode"
import { modelDoesntSupportWebp } from "@/utils/model-utils"
import { ToolUse } from "../assistant-message"
import { ContextManager } from "../context/context-management/ContextManager"
import { formatResponse } from "../prompts/responses"
import { StateManager } from "../storage/StateManager"
import { WorkspaceRootManager } from "../workspace"
import { ToolResponse } from "."
import { MessageStateHandler } from "./message-state"
import { TaskState } from "./TaskState"
import { AutoApprove } from "./tools/autoApprove"
import { AccessMcpResourceHandler } from "./tools/handlers/AccessMcpResourceHandler"
import { AskFollowupQuestionToolHandler } from "./tools/handlers/AskFollowupQuestionToolHandler"
import { AttemptCompletionHandler } from "./tools/handlers/AttemptCompletionHandler"
import { BrowserToolHandler } from "./tools/handlers/BrowserToolHandler"
import { CondenseHandler } from "./tools/handlers/CondenseHandler"
import { ExecuteCommandToolHandler } from "./tools/handlers/ExecuteCommandToolHandler"
import { ListCodeDefinitionNamesToolHandler } from "./tools/handlers/ListCodeDefinitionNamesToolHandler"
import { ListFilesToolHandler } from "./tools/handlers/ListFilesToolHandler"
import { LoadMcpDocumentationHandler } from "./tools/handlers/LoadMcpDocumentationHandler"
import { NewTaskHandler } from "./tools/handlers/NewTaskHandler"
import { PlanModeRespondHandler } from "./tools/handlers/PlanModeRespondHandler"
import { ReadFileToolHandler } from "./tools/handlers/ReadFileToolHandler"
import { ReportBugHandler } from "./tools/handlers/ReportBugHandler"
import { SearchFilesToolHandler } from "./tools/handlers/SearchFilesToolHandler"
import { SummarizeTaskHandler } from "./tools/handlers/SummarizeTaskHandler"
import { UseMcpToolHandler } from "./tools/handlers/UseMcpToolHandler"
import { WebFetchToolHandler } from "./tools/handlers/WebFetchToolHandler"
import { WriteToFileToolHandler } from "./tools/handlers/WriteToFileToolHandler"
import { IPartialBlockHandler, SharedToolHandler, ToolExecutorCoordinator } from "./tools/ToolExecutorCoordinator"
import { ToolValidator } from "./tools/ToolValidator"
import { TaskConfig, validateTaskConfig } from "./tools/types/TaskConfig"
import { createUIHelpers } from "./tools/types/UIHelpers"
import { ToolDisplayUtils } from "./tools/utils/ToolDisplayUtils"
import { ToolResultUtils } from "./tools/utils/ToolResultUtils"

export class ToolExecutor {
	private autoApprover: AutoApprove
	private coordinator: ToolExecutorCoordinator
	private consultationManager: AIConsultationManager

	// ==========================================
	// COSMOS AI: MAX_CORRECTION_DEPTH INTEGRATION
	// ==========================================
	/**
	 * Максимальна кількість спроб корекції для одного інструменту
	 * Це запобігає нескінченним циклам AI коррекції
	 */
	private static readonly MAX_CORRECTION_DEPTH = 3

	/**
	 * Лічильник спроб корекції для кожного інструменту
	 * Ключ: tool.name, Значення: кількість спроб
	 */
	private correctionAttempts = new Map<string, number>()

	// Auto-approval methods using the AutoApprove class
	private shouldAutoApproveTool(toolName: ClineDefaultTool): boolean | [boolean, boolean] {
		return this.autoApprover.shouldAutoApproveTool(toolName)
	}

	private async shouldAutoApproveToolWithPath(
		blockname: ClineDefaultTool,
		autoApproveActionpath: string | undefined,
	): Promise<boolean> {
		return this.autoApprover.shouldAutoApproveToolWithPath(blockname, autoApproveActionpath)
	}

	constructor(
		// Core Services & Managers
		private context: vscode.ExtensionContext,
		private taskState: TaskState,
		private messageStateHandler: MessageStateHandler,
		private api: ApiHandler,
		private urlContentFetcher: UrlContentFetcher,
		private browserSession: BrowserSession,
		private diffViewProvider: DiffViewProvider,
		private mcpHub: McpHub,
		private fileContextTracker: FileContextTracker,
		private clineIgnoreController: ClineIgnoreController,
		private contextManager: ContextManager,
		private stateManager: StateManager,

		// Configuration & Settings

		private cwd: string,
		private taskId: string,
		private ulid: string,

		// Workspace Management
		private workspaceManager: WorkspaceRootManager | undefined,
		private isMultiRootEnabled: boolean,

		// Callbacks to the Task (Entity)
		private say: (
			type: ClineSay,
			text?: string,
			images?: string[],
			files?: string[],
			partial?: boolean,
		) => Promise<number | undefined>,
		private ask: (
			type: ClineAsk,
			text?: string,
			partial?: boolean,
		) => Promise<{
			response: ClineAskResponse
			text?: string
			images?: string[]
			files?: string[]
		}>,
		private saveCheckpoint: (isAttemptCompletionMessage?: boolean, completionMessageTs?: number) => Promise<void>,
		private sayAndCreateMissingParamError: (toolName: ClineDefaultTool, paramName: string, relPath?: string) => Promise<any>,
		private removeLastPartialMessageIfExistsWithType: (type: "ask" | "say", askOrSay: ClineAsk | ClineSay) => Promise<void>,
		private executeCommandTool: (command: string, timeoutSeconds: number | undefined) => Promise<[boolean, any]>,
		private doesLatestTaskCompletionHaveNewChanges: () => Promise<boolean>,
		private updateFCListFromToolResponse: (taskProgress: string | undefined) => Promise<void>,
		private switchToActMode: () => Promise<boolean>,
	) {
		this.autoApprover = new AutoApprove(this.stateManager)
		this.consultationManager = new AIConsultationManager()

		// Initialize the coordinator and register all tool handlers
		this.coordinator = new ToolExecutorCoordinator()
		this.registerToolHandlers()
	}

	// Create a properly typed TaskConfig object for handlers
	// NOTE: modifying this object in the tool handlers is okay since these are all references to the singular ToolExecutor instance's variables. However, be careful modifying this object assuming it will update the ToolExecutor instance, e.g. config.browserSession = ... will not update the ToolExecutor.browserSession instance variable. Use applyLatestBrowserSettings() instead.
	private asToolConfig(): TaskConfig {
		const config: TaskConfig = {
			taskId: this.taskId,
			ulid: this.ulid,
			context: this.context,
			mode: this.stateManager.getGlobalSettingsKey("mode"),
			strictPlanModeEnabled: this.stateManager.getGlobalSettingsKey("strictPlanModeEnabled"),
			yoloModeToggled: this.stateManager.getGlobalSettingsKey("yoloModeToggled"),
			cwd: this.cwd,
			workspaceManager: this.workspaceManager,
			isMultiRootEnabled: this.isMultiRootEnabled,
			taskState: this.taskState,
			messageState: this.messageStateHandler,
			api: this.api,
			autoApprovalSettings: this.stateManager.getGlobalSettingsKey("autoApprovalSettings"),
			autoApprover: this.autoApprover,
			browserSettings: this.stateManager.getGlobalSettingsKey("browserSettings"),
			focusChainSettings: this.stateManager.getGlobalSettingsKey("focusChainSettings"),
			services: {
				mcpHub: this.mcpHub,
				browserSession: this.browserSession,
				urlContentFetcher: this.urlContentFetcher,
				diffViewProvider: this.diffViewProvider,
				fileContextTracker: this.fileContextTracker,
				clineIgnoreController: this.clineIgnoreController,
				contextManager: this.contextManager,
				stateManager: this.stateManager,
			},
			callbacks: {
				say: this.say,
				ask: this.ask,
				saveCheckpoint: this.saveCheckpoint,
				postStateToWebview: async () => {},
				reinitExistingTaskFromId: async () => {},
				cancelTask: async () => {},
				updateTaskHistory: async (_: any) => [],
				executeCommandTool: this.executeCommandTool,
				doesLatestTaskCompletionHaveNewChanges: this.doesLatestTaskCompletionHaveNewChanges,
				updateFCListFromToolResponse: this.updateFCListFromToolResponse,
				sayAndCreateMissingParamError: this.sayAndCreateMissingParamError,
				removeLastPartialMessageIfExistsWithType: this.removeLastPartialMessageIfExistsWithType,
				shouldAutoApproveTool: this.shouldAutoApproveTool.bind(this),
				shouldAutoApproveToolWithPath: this.shouldAutoApproveToolWithPath.bind(this),
				applyLatestBrowserSettings: this.applyLatestBrowserSettings.bind(this),
				switchToActMode: this.switchToActMode,
			},
			coordinator: this.coordinator,
		}

		// Validate the config at runtime to catch any missing properties
		validateTaskConfig(config)
		return config
	}

	/**
	 * Register all tool handlers with the coordinator
	 */
	private registerToolHandlers(): void {
		const validator = new ToolValidator(this.clineIgnoreController)

		// Register all tool handlers
		this.coordinator.register(new ListFilesToolHandler(validator))
		this.coordinator.register(new ReadFileToolHandler(validator))
		this.coordinator.register(new BrowserToolHandler())
		this.coordinator.register(new AskFollowupQuestionToolHandler())
		this.coordinator.register(new WebFetchToolHandler())

		// Register WriteToFileToolHandler for all three file tools with proper typing
		const writeHandler = new WriteToFileToolHandler(validator)
		this.coordinator.register(writeHandler) // registers as "write_to_file" (ClineDefaultTool.FILE_NEW)
		this.coordinator.register(new SharedToolHandler(ClineDefaultTool.FILE_EDIT, writeHandler))
		this.coordinator.register(new SharedToolHandler(ClineDefaultTool.NEW_RULE, writeHandler))

		this.coordinator.register(new ListCodeDefinitionNamesToolHandler(validator))
		this.coordinator.register(new SearchFilesToolHandler(validator))
		this.coordinator.register(new ExecuteCommandToolHandler(validator))
		this.coordinator.register(new UseMcpToolHandler())
		this.coordinator.register(new AccessMcpResourceHandler())
		this.coordinator.register(new LoadMcpDocumentationHandler())
		this.coordinator.register(new PlanModeRespondHandler())
		this.coordinator.register(new NewTaskHandler())
		this.coordinator.register(new AttemptCompletionHandler())
		this.coordinator.register(new CondenseHandler())
		this.coordinator.register(new SummarizeTaskHandler())
		this.coordinator.register(new ReportBugHandler())
	}

	/**
	 * Main entry point for tool execution - called by Task class
	 */
	public async executeTool(block: ToolUse): Promise<void> {
		await this.execute(block)
	}

	/**
	 * Updates the browser settings
	 */
	public async applyLatestBrowserSettings() {
		if (this.context) {
			await this.browserSession.dispose()
			const apiHandlerModel = this.api.getModel()
			const useWebp = this.api ? !modelDoesntSupportWebp(apiHandlerModel) : true
			this.browserSession = new BrowserSession(this.context, this.stateManager, useWebp)
		} else {
			console.warn("no controller context available for browserSession")
		}

		return this.browserSession
	}

	/**
	 * Handles errors during tool execution
	 */
	private async handleError(action: string, error: Error, block: ToolUse): Promise<void> {
		console.log(error)
		const errorString = `Error ${action}: ${error.message}`
		await this.say("error", errorString)

		// Create error response for the tool
		const errorResponse = formatResponse.toolError(errorString)
		this.pushToolResult(errorResponse, block)
	}

	private pushToolResult = (content: ToolResponse, block: ToolUse) => {
		// Use the ToolResultUtils to properly format and push the tool result
		ToolResultUtils.pushToolResult(
			content,
			block,
			this.taskState.userMessageContent,
			(block: ToolUse) => ToolDisplayUtils.getToolDescription(block),
			this.api,
			() => {
				this.taskState.didAlreadyUseTool = true
			},
			this.coordinator,
		)
	}

	/**
	 * Tools that are restricted in plan mode and can only be used in act mode
	 */
	private static readonly PLAN_MODE_RESTRICTED_TOOLS: ClineDefaultTool[] = [
		ClineDefaultTool.FILE_NEW,
		ClineDefaultTool.FILE_EDIT,
		ClineDefaultTool.NEW_RULE,
	]

	/**
	 * Execute a tool through the coordinator if it's registered
	 */
	private async execute(block: ToolUse): Promise<boolean> {
		if (!this.coordinator.has(block.name)) {
			return false // Tool not handled by coordinator
		}

		const config = this.asToolConfig()

		try {
			// Check if user rejected a previous tool
			if (this.taskState.didRejectTool) {
				const reason = block.partial
					? "Tool was interrupted and not executed due to user rejecting a previous tool."
					: "Skipping tool due to user rejecting a previous tool."
				this.createToolRejectionMessage(block, reason)
				return true
			}

			// Check if a tool has already been used in this message
			if (this.taskState.didAlreadyUseTool) {
				this.taskState.userMessageContent.push({
					type: "text",
					text: formatResponse.toolAlreadyUsed(block.name),
				})
				return true
			}

			// Logic for plan-mode tool call restrictions
			if (
				this.stateManager.getGlobalSettingsKey("strictPlanModeEnabled") &&
				this.stateManager.getGlobalSettingsKey("mode") === "plan" &&
				block.name &&
				this.isPlanModeToolRestricted(block.name)
			) {
				const errorMessage = `Tool '${block.name}' is not available in PLAN MODE. This tool is restricted to ACT MODE for file modifications. Only use tools available for PLAN MODE when in that mode.`
				await this.say("error", errorMessage)
				this.pushToolResult(formatResponse.toolError(errorMessage), block)
				await this.saveCheckpoint()
				return true
			}

			// Close browser for non-browser tools
			if (block.name !== "browser_action") {
				await this.browserSession.closeBrowser()
			}

			// Handle partial blocks
			if (block.partial) {
				await this.handlePartialBlock(block, config)
				return true
			}

			// Handle complete blocks
			await this.handleCompleteBlock(block, config)
			await this.saveCheckpoint()
			return true
		} catch (error) {
			await this.handleError(`executing ${block.name}`, error as Error, block)
			await this.saveCheckpoint()
			return true
		}
	}

	/**
	 * Check if a tool is restricted in plan mode
	 */
	private isPlanModeToolRestricted(toolName: ClineDefaultTool): boolean {
		return ToolExecutor.PLAN_MODE_RESTRICTED_TOOLS.includes(toolName)
	}

	/**
	 * Create a tool rejection message and add it to user message content
	 */
	private createToolRejectionMessage(block: ToolUse, reason: string): void {
		this.taskState.userMessageContent.push({
			type: "text",
			text: `${reason} ${ToolDisplayUtils.getToolDescription(block, this.coordinator)}`,
		})
	}

	/**
	 * Handle partial block streaming UI updates
	 */
	private async handlePartialBlock(block: ToolUse, config: TaskConfig): Promise<void> {
		// NOTE: We don't push tool results in partial blocks because this is only for UI streaming.
		// The ToolExecutor will handle pushToolResult() when the complete block is processed.
		// This maintains separation of concerns: partial = UI updates, complete = final state changes.
		const handler = this.coordinator.getHandler(block.name)

		// Check if handler supports partial blocks with proper typing
		if (handler && "handlePartialBlock" in handler) {
			const uiHelpers = createUIHelpers(config)
			const partialHandler = handler as IPartialBlockHandler
			await partialHandler.handlePartialBlock(block, uiHelpers)
		}
	}

	/**
	 * Handle complete block execution with Cosmos AI MAX_CORRECTION_DEPTH logic
	 */
	private async handleCompleteBlock(block: ToolUse, config: any): Promise<void> {
		// ==========================================
		// COSMOS AI: AI CONSULTATION BEFORE EXECUTION
		// ==========================================
		if (this.consultationManager.isConsultationEnabled()) {
			const planDescription = `Tool: ${block.name}\nParams: ${JSON.stringify(block.params, null, 2)}`
			const consultation = await this.consultationManager.consultOnPlan(planDescription, this.cwd)
			
			if (!consultation.shouldProceed) {
				await this.say("error", `⏳ AI Consultation blocked execution: ${consultation.consultation}`)
				this.pushToolResult(formatResponse.toolError("Execution blocked by AI consultation"), block)
				return
			}
			
			if (consultation.corrections.length > 0) {
				await this.say("text", `⏳ AI Consultation suggestions:\n${consultation.corrections.join('\n')}`)
			}
		}

		// ==========================================
		// COSMOS AI: SAFETY CHECKPOINT BEFORE EXECUTION
		// ==========================================
		const toolId = block.name

		// Створюємо чекпоінт для ризикованих операцій
		if (this.isRiskyTool(block.name)) {
			await this.createSafetyCheckpoint(block)
		}

		let result = await this.coordinator.execute(config, block)

		// ==========================================
		// COSMOS AI: ERROR CORRECTION LOGIC
		// ==========================================
		if (!this.isToolResultSuccessful(result)) {
			const attempts = this.correctionAttempts.get(toolId) || 0

			if (attempts < ToolExecutor.MAX_CORRECTION_DEPTH) {
				// Спробуємо AI коррекцію
				const correctionResult = await this.attemptAICorrection(block, result, config)

				if (correctionResult) {
					// AI надавав пропозицію - створюємо corrective tool call
					await this.say(
						"text",
						`🤖 AI корекція ${attempts + 1}/${ToolExecutor.MAX_CORRECTION_DEPTH}: ${correctionResult.description}`,
					)

					// Збільшуємо лічильник спроб
					this.correctionAttempts.set(toolId, attempts + 1)

					// Створюємо новий блок для корекції та виконуємо його
					const correctiveBlock = this.createCorrectiveToolBlock(block, correctionResult)
					result = await this.coordinator.execute(config, correctiveBlock)
				} else {
					// AI не зміг допомогти - повідомляємо користувача
					this.correctionAttempts.set(toolId, attempts + 1)
					await this.say(
						"error",
						`AI не зміг виправити помилку інструменту '${toolId}'. Спроба ${attempts + 1}/${ToolExecutor.MAX_CORRECTION_DEPTH}`,
					)
				}
			} else {
				// MAX_CORRECTION_DEPTH досягнуто - аварійний вихід
				await this.handleMaxCorrectionLimitReached(block, toolId)
			}
		}

		this.pushToolResult(result, block)

		// Handle focus chain updates
		if (!block.partial && this.stateManager.getGlobalSettingsKey("focusChainSettings").enabled) {
			await this.updateFCListFromToolResponse(block.params.task_progress)
		}
	}

	// ===========================================================================================
	// COSMOS AI: MAX_CORRECTION_DEPTH IMPLEMENTATION METHODS
	// ===========================================================================================

	/**
	 * Визначає чи є результат інструменту успішним
	 */
	private isToolResultSuccessful(result: any): boolean {
		// Інструмент вважається успішним якщо немає помилки або він повернув успішний статус
		return !result.error && result.success !== false
	}

	/**
	 * Визначає чи є інструмент ризикованим і потребує чекпоінта
	 */
	private isRiskyTool(toolName: string): boolean {
		const riskyTools = [
			"run_terminal_cmd",
			"run_command", // термінальні команди
			"write_to_file",
			"file_edit", // модифікація файлів
			"apply_diff", // застосування змін
		]
		return riskyTools.includes(toolName)
	}

	/**
	 * Створює safety checkpoint для ризикованих операцій
	 */
	private async createSafetyCheckpoint(block: ToolUse): Promise<void> {
		try {
			// Використовуємо існуючий git stash механізм Cline
			const success = await this.executeGitCommand(
				`git stash push -m "cosmos-safety-checkpoint-${block.name}-${Date.now()}"`,
			)
			if (success) {
				await this.say("text", `🛡️ Створено safety checkpoint для ${block.name}`)
			}
		} catch (error) {
			console.warn("Failed to create safety checkpoint:", error)
		}
	}

	/**
	 * Відновлює стан з git stash при досягненні MAX_CORRECTION_DEPTH
	 */
	private async restoreFromSafetyCheckpoint(_block: ToolUse): Promise<void> {
		try {
			const success = await this.executeGitCommand("git stash pop")
			if (success) {
				await this.say("text", `🔄 Відновлено стан до safety checkpoint`)
			}
		} catch (error) {
			console.error("Failed to restore from safety checkpoint:", error)
			await this.say("error", "❌ Помилка відновлення з safety checkpoint")
		}
	}

	/**
	 * Спроба AI коррекції проваленого інструменту
	 */
	private async attemptAICorrection(
		block: ToolUse,
		failedResult: any,
		_config: any,
	): Promise<{ description: string; toolCall: any } | null> {
		try {
			// Створюємо контекст помилки
			const errorContext = await this.gatherErrorContext(block, failedResult)

			// Надсилаємо в AI для аналізу
			const correctionPrompt = `
Проаналізуй цю помилку виконання інструменту та запропонуй корекцію:

Інструмент: ${block.name}
Помилка: ${failedResult.error || "Unknown error"}
Вихід: ${failedResult.output || "No output"}
Контекст: ${errorContext}

Поверни конкретний план корекції у форматі:
DESCRIPTION: [короткий опис що робиться]
TOOL: [ім'я інструменту для корекції]
PARAMS: [параметри для інструменту]
`

			const stream = this.api.createMessage("", [{ role: "user", content: correctionPrompt }])

			let aiText = ""
			for await (const chunk of stream) {
				if (chunk.type === "text") {
					aiText += chunk.text
				}
			}

			// Парсимо відповідь AI
			const correction = this.parseAICorrectionResponse(aiText)

			return correction
		} catch (error) {
			console.error("AI correction failed:", error)
			return null
		}
	}

	/**
	 * Створює контекст помилки для AI аналізу
	 */
	private async gatherErrorContext(block: ToolUse, failedResult: any): Promise<string> {
		const contextParts = []

		// Інформація про завдання
		contextParts.push(`Task: ${this.taskId}`)
		contextParts.push(`Tool: ${block.name}`)
		contextParts.push(`Parameters: ${JSON.stringify(block.params)}`)

		// Інформація про помилку
		if (failedResult.error) {
			contextParts.push(`Error: ${failedResult.error}`)
		}
		if (failedResult.output) {
			contextParts.push(`Output: ${failedResult.output}`)
		}

		// Інформація про робочий простір
		contextParts.push(`CWD: ${this.cwd}`)

		return contextParts.join("\n")
	}

	/**
	 * Парсить відповідь AI для корекції
	 */
	private parseAICorrectionResponse(aiText: string): { description: string; toolCall: any } | null {
		try {
			const lines = aiText.split("\n")
			let description = ""
			let toolName = ""
			let params = {}

			for (const line of lines) {
				if (line.startsWith("DESCRIPTION:")) {
					description = line.replace("DESCRIPTION:", "").trim()
				} else if (line.startsWith("TOOL:")) {
					toolName = line.replace("TOOL:", "").trim()
				} else if (line.startsWith("PARAMS:")) {
					const paramsStr = line.replace("PARAMS:", "").trim()
					params = JSON.parse(paramsStr)
				}
			}

			if (description && toolName) {
				return {
					description,
					toolCall: { name: toolName, params },
				}
			}

			return null
		} catch (error) {
			console.error("Failed to parse AI correction response:", error)
			return null
		}
	}

	/**
	 * Створює корективний tool block
	 */
	private createCorrectiveToolBlock(originalBlock: ToolUse, correction: { description: string; toolCall: any }): ToolUse {
		return {
			...originalBlock,
			name: correction.toolCall.name,
			params: correction.toolCall.params,
		}
	}

	/**
	 * Обробляє досягнення MAX_CORRECTION_DEPTH ліміту
	 */
	private async handleMaxCorrectionLimitReached(block: ToolUse, toolId: string): Promise<void> {
		const message = `🚨 **MAX_CORRECTION_DEPTH досягнуто** для інструменту '${toolId}'

Досягнуто максимальну кількість (${ToolExecutor.MAX_CORRECTION_DEPTH}) спроб корекції.
Інструмент '${toolId}' більше не виконуватиметься в цьому завданні.

🔄 Відновлюю стан до останнього safety checkpoint...`

		await this.say("error", message)

		// Відновлюємо з safety checkpoint
		await this.restoreFromSafetyCheckpoint(block)

		// Очищаємо лічильник для цього інструменту
		this.correctionAttempts.delete(toolId)
	}

	/**
	 * Виконує git команду через існуючий executeCommandTool
	 */
	private async executeGitCommand(command: string): Promise<boolean> {
		try {
			const result = await this.executeCommandTool(command, 30) // 30 second timeout
			return result[0] // success boolean
		} catch (error) {
			console.error("Git command failed:", error)
			return false
		}
	}
}
