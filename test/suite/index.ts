/* eslint-disable import/no-unresolved, import/extensions */

import * as path from "path"
import * as Mocha from "mocha"
import * as glob from "glob"
import * as vscode from "vscode"
import { cyan } from "ansi-colors"
import { log } from "../utils"

import "source-map-support/register"

export const run = (
  testsRoot: string,
  cb: (error: Error | null, failures?: number) => void
): void => {
  // Create the mocha test
  const mocha = new Mocha({
    ui: "bdd",
    color: true,
  })

  const scratchpadUri = path.join(
    __dirname,
    "../../../test/suite/scratchpad.js"
  )

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
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Add files to the test suite
    files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)))

    console.timeEnd(`${cyan("info")} Time to init all tests`)

    try {
      // Run the mocha test
      return mocha.run((failures) => {
        cb(null, failures)
      })
    } catch (error) {
      log.error(error)
      return cb(error)
    }
  })
}
