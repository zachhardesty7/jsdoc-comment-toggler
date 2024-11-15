import path from "path"
import { cyan } from "ansi-colors"

import { runTests } from "vscode-test"
import { log } from "./utils"

async function main() {
  try {
    log.info("Starting tests")
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../")

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./suite")

    console.time(`${cyan("info")} Time to complete all tests`)

    // Download VS Code, unzip it and run the integration test
    await runTests({ extensionDevelopmentPath, extensionTestsPath })
    log.info("No tests failed!")
  } catch {
    log.warn("Some tests failed")
  } finally {
    console.timeEnd(`${cyan("info")} Time to complete all tests`)
  }
}

main()
