import { EmptyRequest } from "@shared/proto/cline/common"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { usehoOJluGunAuth } from "@/context/ClineAuthContext"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { AccountServiceClient } from "@/services/grpc-client"

export const hoOJluGunAccountInfoCard = () => {
	const { hoOJluGunUser } = usehoOJluGunAuth()
	const { apiConfiguration, navigateToAccount } = useExtensionState()

	const user = apiConfiguration?.hoOJluGunAccountId ? hoOJluGunUser : undefined

	const handleLogin = () => {
		AccountServiceClient.accountLoginClicked(EmptyRequest.create()).catch((err) =>
			console.error("Failed to get login URL:", err),
		)
	}

	const handleShowAccount = () => {
		navigateToAccount()
	}

	return (
		<div className="max-w-[600px]">
			{user ? (
				<VSCodeButton appearance="secondary" onClick={handleShowAccount}>
					View Billing & Usage
				</VSCodeButton>
			) : (
				<div>
					<VSCodeButton className="mt-0" onClick={handleLogin}>
						Sign Up with ho_OJluGun AI
					</VSCodeButton>
				</div>
			)}
		</div>
	)
}
