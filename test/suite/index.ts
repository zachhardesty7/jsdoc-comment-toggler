/* eslint-disable import/no-unresolved, import/extensions */

import path from "path"
import Mocha from "mocha"
import glob from "glob"
import vscode from "vscode"
import { cyan } from "ansi-colors"
import { log } from "../utils"

import "source-map-support/register"

const DEBUG_TESTS = process.env.DEBUG_TESTS === "true"

export const run = (
  testsRoot: string,
  cb: (error: Error | null, failures?: number) => void
): void => {
  // Create the mocha test
  const mocha = new Mocha({
    ui: "bdd",
    color: true,
    inlineDiffs: true,
    bail: DEBUG_TESTS,
    timeout: 8000,
  })

  const scratchpadUri = path.join(
    __dirname,
    "../../../test/suite/scratchpad.js"
  )

  // NOTE: async required to keep files from overwriting editor
  glob("**/**.test.js", { cwd: testsRoot }, async (err, files) => {
    if (err) {
      log.error("glob err", err)
      return cb(err)
    }

    console.time(`${cyan("info")} Time to init all tests`)

    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.file(scratchpadUri)
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
        log.error(`${failures} tests failed`)
        cb(null, failures)
      })
    } catch (error) {
      log.error("caught err", error)
      return cb(error instanceof Error ? error : null)
    }
  })
}
