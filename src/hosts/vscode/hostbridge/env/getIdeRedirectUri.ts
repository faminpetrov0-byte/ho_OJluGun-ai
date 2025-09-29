import { EmptyRequest, String } from "@shared/proto/cline/common"
import * as vscode from "vscode"

export async function getIdeRedirectUri(_: EmptyRequest): Promise<String> {
	const uriScheme = vscode.env.uriScheme || "vscode"
	const url = `${uriScheme}://hoOJluGun.ho-ojlugun-ai`
	return { value: url }
}
