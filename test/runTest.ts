import * as path from "path"
import { cyan, yellowBright } from "ansi-colors"

import { runTests } from "vscode-test"

async function main() {
  try {
    console.info(`${cyan("info")} Starting tests`)
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../")

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./suite")

    console.time(`${cyan("info")} Time to complete all tests`)

    // Download VS Code, unzip it and run the integration test
    await runTests({ extensionDevelopmentPath, extensionTestsPath })
  } catch {
    console.warn(`${yellowBright("warn")} Some tests failed`)
  } finally {
    console.timeEnd(`${cyan("info")} Time to complete all tests`)
  }
}

main()
