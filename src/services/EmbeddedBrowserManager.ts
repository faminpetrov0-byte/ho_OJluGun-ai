import * as vscode from 'vscode'

/**
 * Менеджер встроенного браузера для чата
 */
export class EmbeddedBrowserManager {
	private panel: vscode.WebviewPanel | undefined
	private isVisible = false

	/**
	 * Переключает видимость браузера
	 */
	async toggleBrowser(): Promise<void> {
		if (this.panel) {
			if (this.isVisible) {
				this.hideBrowser()
			} else {
				this.showBrowser()
			}
		} else {
			await this.createBrowser()
		}
	}

	/**
	 * Создает новый браузер
	 */
	private async createBrowser(): Promise<void> {
		this.panel = vscode.window.createWebviewPanel(
			'cosmosEmbeddedBrowser',
			'🌐 Cosmos Browser',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		)

		this.panel.webview.html = this.getBrowserHTML()
		this.isVisible = true

		this.panel.onDidDispose(() => {
			this.panel = undefined
			this.isVisible = false
		})

		// Обработка сообщений от браузера
		this.panel.webview.onDidReceiveMessage(message => {
			this.handleBrowserMessage(message)
		})
	}

	/**
	 * Показывает браузер
	 */
	private showBrowser(): void {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Beside)
			this.isVisible = true
		}
	}

	/**
	 * Скрывает браузер
	 */
	private hideBrowser(): void {
		if (this.panel) {
			// Минимизируем панель
			this.isVisible = false
		}
	}

	/**
	 * Закрывает браузер
	 */
	closeBrowser(): void {
		if (this.panel) {
			this.panel.dispose()
			this.panel = undefined
			this.isVisible = false
		}
	}

	/**
	 * HTML для встроенного браузера
	 */
	private getBrowserHTML(): string {
		return `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Cosmos Browser</title>
				<style>
					body { 
						margin: 0; 
						padding: 0; 
						font-family: var(--vscode-font-family);
						background: var(--vscode-editor-background);
					}
					.browser-header {
						background: var(--vscode-titleBar-activeBackground);
						color: var(--vscode-titleBar-activeForeground);
						padding: 8px;
						display: flex;
						align-items: center;
						gap: 8px;
						border-bottom: 1px solid var(--vscode-panel-border);
					}
					.url-input {
						flex: 1;
						padding: 4px 8px;
						background: var(--vscode-input-background);
						color: var(--vscode-input-foreground);
						border: 1px solid var(--vscode-input-border);
						border-radius: 3px;
					}
					.nav-button {
						background: var(--vscode-button-background);
						color: var(--vscode-button-foreground);
						border: none;
						padding: 4px 8px;
						border-radius: 3px;
						cursor: pointer;
					}
					.nav-button:hover {
						background: var(--vscode-button-hoverBackground);
					}
					.browser-frame {
						width: 100%;
						height: calc(100vh - 50px);
						border: none;
					}
					.ai-shortcuts {
						display: flex;
						gap: 4px;
						flex-wrap: wrap;
					}
					.ai-shortcut {
						background: var(--vscode-badge-background);
						color: var(--vscode-badge-foreground);
						padding: 2px 6px;
						border-radius: 10px;
						font-size: 11px;
						cursor: pointer;
						border: none;
					}
				</style>
			</head>
			<body>
				<div class="browser-header">
					<button class="nav-button" onclick="goBack()">←</button>
					<button class="nav-button" onclick="goForward()">→</button>
					<button class="nav-button" onclick="refresh()">⟳</button>
					<input type="text" class="url-input" id="urlInput" value="https://google.com" 
						   onkeypress="if(event.key==='Enter') navigate()">
					<button class="nav-button" onclick="navigate()">Go</button>
				</div>
				<div class="browser-header" style="padding: 4px 8px;">
					<div class="ai-shortcuts">
						<button class="ai-shortcut" onclick="openAI('chatgpt')">ChatGPT</button>
						<button class="ai-shortcut" onclick="openAI('gemini')">Gemini</button>
						<button class="ai-shortcut" onclick="openAI('claude')">Claude</button>
						<button class="ai-shortcut" onclick="openAI('copilot')">Copilot</button>
					</div>
				</div>
				<iframe id="browserFrame" class="browser-frame" src="https://google.com"></iframe>

				<script>
					const vscode = acquireVsCodeApi();
					const frame = document.getElementById('browserFrame');
					const urlInput = document.getElementById('urlInput');

					function navigate() {
						const url = urlInput.value;
						if (!url.startsWith('http')) {
							urlInput.value = 'https://' + url;
						}
						frame.src = urlInput.value;
						vscode.postMessage({ type: 'navigate', url: urlInput.value });
					}

					function goBack() {
						vscode.postMessage({ type: 'back' });
					}

					function goForward() {
						vscode.postMessage({ type: 'forward' });
					}

					function refresh() {
						frame.src = frame.src;
						vscode.postMessage({ type: 'refresh' });
					}

					function openAI(aiType) {
						const urls = {
							chatgpt: 'https://chat.openai.com',
							gemini: 'https://gemini.google.com',
							claude: 'https://claude.ai',
							copilot: 'https://copilot.microsoft.com'
						};
						
						if (urls[aiType]) {
							urlInput.value = urls[aiType];
							navigate();
						}
					}

					// Обновляем URL в поле при навигации
					frame.addEventListener('load', () => {
						try {
							urlInput.value = frame.contentWindow.location.href;
						} catch (e) {
							// Cross-origin ограничения
						}
					});
				</script>
			</body>
			</html>
		`
	}

	/**
	 * Обработка сообщений от браузера
	 */
	private handleBrowserMessage(message: any): void {
		switch (message.type) {
			case 'navigate':
				console.log(`[EmbeddedBrowser] Navigating to: ${message.url}`)
				break
			case 'back':
			case 'forward':
			case 'refresh':
				console.log(`[EmbeddedBrowser] Action: ${message.type}`)
				break
		}
	}

	/**
	 * Получает статус браузера
	 */
	getStatus() {
		return {
			isOpen: !!this.panel,
			isVisible: this.isVisible
		}
	}
}