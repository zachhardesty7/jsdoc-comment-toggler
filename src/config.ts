import * as vscode from "vscode"

export interface ExtensionConfig {
  disableCursorHack: boolean
}

/**
 * @param name - the key of the configuration value to retrieve
 * @returns the value of the configuration key
 * @see https://github.com/Sertion/vscode-gitblame/blob/main/src/util/property.ts
 */
export const getConfigKey = <TKey extends keyof ExtensionConfig>(
  name: TKey
): ExtensionConfig[TKey] =>
  vscode.workspace
    .getConfiguration("jsdoc-comment-toggler")
    .get(name) as ExtensionConfig[TKey]
