/* eslint-disable import/no-unresolved, import/extensions */

import path from "path"
import Mocha from "mocha"
import { glob } from "glob"
import vscode from "vscode"
import { cyan } from "ansi-colors"
import { DEBUG_TESTS, getTestedFiles, log } from "../utils"

import "source-map-support/register"

export const run = (
  testsRoot: string,
  cb: (error: Error | null, failures?: number) => void,
): void => {
  // Create the mocha test
  const mocha = new Mocha({
    ui: "bdd",
    color: true,
    inlineDiffs: true,
    bail: DEBUG_TESTS,
    timeout: 10000, // bumped up so startup doesn't fail first test
  })

  const scratchpadUri = path.join(
    __dirname,
    "../../../test/suite/scratchpad.js",
  )

  main()

  // NOTE: async required to keep files from overwriting editor
  async function main() {
    const files = await glob("**/**.test.js", { cwd: testsRoot })
    console.time(`${cyan("info")} Time to init all tests`)

    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.file(scratchpadUri),
    )
    await vscode.window.showTextDocument(document)
    // editor isn't immediately available when `showTextDocument` promise fulfills
    const HALF_SECOND = 500
    await new Promise((resolve) => setTimeout(resolve, HALF_SECOND))

    // Add files to the test suite
    for (const f of files) {
      mocha.addFile(path.resolve(testsRoot, f))
    }

    console.timeEnd(`${cyan("info")} Time to init all tests`)

    try {
      // Run the mocha test
      return mocha.run((failures) => {
        if (failures) {
          log.error(`${failures} tests failed`)
        }

        if (DEBUG_TESTS) {
          log.info("files tested at this point", [...getTestedFiles()])
        }

        cb(null, failures)
      })
    } catch (error) {
      log.error("caught err", error)
      return cb(error instanceof Error ? error : null)
    }
  }
}
