/* eslint-disable import/no-unresolved, import/extensions, @typescript-eslint/no-empty-function */
/* global describe, it */

// examples for naming
// https://github.com/mochajs/mocha/blob/fd9fe95e2c8f86366fe12d88b76a81d93d5e20be/test/node-unit/serializer.spec.js

import * as fs from "fs"
import * as assert from "assert"
import * as path from "path"
import * as vscode from "vscode"
import * as Mocha from "mocha"
// import { log } from "../utils"
import { getEditor, toggleJSDocComment } from "../../src/extension"

const testsFolder = "../../../test/examples/"
const resultsFolder = "../../../test/results/"

/** predefined target results after calling `toggleJSDocComment` */
interface Targets {
  /** target document body */
  content?: string
  /** target opposite end of selection */
  anchor?: vscode.Position
  /** target cursor position */
  active?: vscode.Position
}

// NOTE: async required to keep files from overwriting editor
const loadFile = async (fileName: string): Promise<string> => {
  const startingContentUri = path.join(__dirname, testsFolder, fileName)
  const targetContentUri = path.join(__dirname, resultsFolder, fileName)

  const startingContent = fs.readFileSync(startingContentUri, "utf-8")
  const targetContent = fs.readFileSync(targetContentUri, "utf-8")

  const editor = getEditor()

  // set document text to starting content of test
  const lineLast = editor.document.lineAt(editor.document.lineCount - 1)
  await editor.edit((editBuilder) => {
    editBuilder.replace(
      new vscode.Range(0, 0, lineLast.lineNumber, lineLast.range.end.character),
      startingContent
    )
  })

  // normalize to UNIX line endings (`\n`)
  if (JSON.stringify(editor.document.getText()).includes("\\r\\n")) {
    await editor.edit((editBuilder) => {
      editBuilder.setEndOfLine(vscode.EndOfLine.LF)
    })
  }

  // REVIEW: still need delay?
  // await new Promise((resolve) => setTimeout(resolve, 20))

  return targetContent
}

const itHasTargetText = (targets: Targets) => {
  Error.stackTraceLimit = 25 // NOTE: may need adjustment
  const stack: { stack: string } = { stack: "" }
  Error.captureStackTrace(stack)

  it("has the expected text output", () => {
    try {
      const { content } = targets
      if (!content) {
        throw new ReferenceError("target output content not found")
      }

      assert.strictEqual(
        getEditor().document.getText(),
        content,
        "output text incorrect"
      )
    } catch (error) {
      error.stack = stack.stack
      throw error
    }
  })
}

const itHasCursorSelectionPosition = (targets: Targets) => {
  Error.stackTraceLimit = 25 // NOTE: may need adjustment
  const stack: { stack: string } = { stack: "" }
  Error.captureStackTrace(stack)

  it("has cursor & selection at correct position", () => {
    try {
      const { anchor, active } = targets
      if (!anchor || !active) {
        throw new ReferenceError(
          "target anchor and/or active positions not found"
        )
      }

      assert.deepStrictEqual(
        {
          anchor: getEditor().selection.anchor,
          active: getEditor().selection.active,
        },
        {
          anchor,
          active,
        },
        "cursor and/or selection in incorrect position"
      )
    } catch (error) {
      error.stack = stack.stack
      throw error
    }
  })
}

// NOTE: async required to keep files from overwriting editor
const loadTextAndToggleJsdoc = (
  fileName: string,
  targets: Targets,
  anchorInitialPos: vscode.Position,
  activeInitialPos: vscode.Position
): Mocha.Func => async () => {
  const targetContent = await loadFile(fileName)
  Object.assign(targets, { content: targetContent })

  getEditor().selection = new vscode.Selection(
    anchorInitialPos,
    activeInitialPos
  )

  await toggleJSDocComment()
}

const itHasCorrectOutputAndSelectionPositions = (
  fileName: string,
  anchorInitialLine: number,
  anchorInitialChar: number,
  activeInitialLine: number,
  activeInitialChar: number,
  anchorLineDelta: number,
  anchorCharDelta: number,
  activeLineDelta: number,
  activeCharDelta: number
) => () => {
  const anchorInitialPos = new vscode.Position(
    anchorInitialLine,
    anchorInitialChar
  )
  const activeInitialPos = new vscode.Position(
    activeInitialLine,
    activeInitialChar
  )

  const targets: Targets = {
    anchor: anchorInitialPos.translate(anchorLineDelta, anchorCharDelta),
    active: activeInitialPos.translate(activeLineDelta, activeCharDelta),
  }

  before(
    loadTextAndToggleJsdoc(
      fileName,
      targets,
      anchorInitialPos,
      activeInitialPos
    )
  )

  itHasTargetText(targets)
  itHasCursorSelectionPosition(targets)
}

const itHasCorrectOutputAndCursorPosition = (
  fileName: string,
  cursorInitialLine: number,
  cursorInitialChar: number,
  cursorLineDelta: number,
  cursorCharDelta: number
) =>
  itHasCorrectOutputAndSelectionPositions(
    fileName,
    cursorInitialLine,
    cursorInitialChar,
    cursorInitialLine,
    cursorInitialChar,
    cursorLineDelta,
    cursorCharDelta,
    cursorLineDelta,
    cursorCharDelta
  )

// #region - single line tests
describe.only("single line jsdoc comment", () => {
  // "add new comment op"
  describe("adding new comment", () => {
    describe("when NO selection", () => {
      describe(
        "when cursor is at start of line",
        itHasCorrectOutputAndCursorPosition("singleAddStart.js", 1, 0, 0, 4)
      )
      describe(
        "when cursor is at end of line",
        itHasCorrectOutputAndCursorPosition("singleAddEnd.js", 0, 24, 0, -20)
      )
      describe(
        "when cursor has space on left and right",
        itHasCorrectOutputAndCursorPosition("singleAddSpaced.js", 0, 19, 0, 4)
      )
      // REVIEW: maybe add an inline jsdoc comment
      describe(
        "when cursor is missing a space on left or right",
        itHasCorrectOutputAndCursorPosition(
          "singleAddUnspaced.js",
          0,
          18,
          0,
          -14
        )
      )
    })

    // TODO: parens and add inline comment before selection
    describe.skip("when selection exists within interior of line", () => {
      const anchorInitialPos = new vscode.Position(0, 21)
      const activeInitialPos = new vscode.Position(0, 32)

      const targets: Targets = {
        anchor: anchorInitialPos.translate(0, 4),
        active: activeInitialPos.translate(0, 4),
      }

      before(
        loadTextAndToggleJsdoc(
          "singleAddSelectionInternal.js",
          targets,
          anchorInitialPos,
          activeInitialPos
        )
      )

      itHasTargetText(targets)
      itHasCursorSelectionPosition(targets)
    })
  })

  describe("converting existing comment", () => {
    describe("when it's a line comment", () => {
      // TODO: make sure any arbitrary spaces are handled
      describe.skip("when it's missing spaces and is ugly", () => {
        /* TODO: implement */
      })

      describe("when it's alone on a line", () => {
        describe("when NO selection", () => {
          describe(
            "when cursor's inside",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLine.js",
              2,
              18,
              0,
              1
            )
          )

          // TODO: needs new file
          describe.skip(
            "when cursor is before comment",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLine.js",
              2,
              1,
              0,
              4
            )
          )

          describe(
            "when cursor is inside comment tag",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLine.js",
              2,
              3,
              0,
              2
            )
          )

          describe(
            "when cursor is just after comment tag before a space",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLine.js",
              2,
              4,
              0,
              1
            )
          )

          describe(
            "when cursor is just after space after comment tag",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLine.js",
              2,
              5,
              0,
              1
            )
          )

          describe(
            "when cursor is at end of line comment",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLine.js",
              2,
              28,
              0,
              1
            )
          )
        })
        describe.skip("when selection", () => {
          /* TODO: implement */
        })
      })

      describe("when it's trailing code", () => {
        describe("when NO selection", () => {
          // FIXME: create new tag
          describe.skip(
            "when cursor is before comment",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLineTrailing.js",
              2,
              6,
              0,
              0
            )
          )
          describe(
            "when cursor's inside",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLineTrailing.js",
              2,
              25,
              0,
              -12
            )
          )
        })
        describe.skip("when selection", () => {
          /* TODO: implement */
        })
      })
    })

    describe("when it's a block comment", () => {
      describe(
        "when it's alone on a line",
        itHasCorrectOutputAndCursorPosition(
          "singleConvertBlock.js",
          1,
          12,
          0,
          1
        )
      )
      describe(
        "when it's internal & surrounded by code",
        itHasCorrectOutputAndCursorPosition(
          "singleConvertBlockInternal.js",
          1,
          23,
          0,
          1
        )
      )
      describe(
        "when it's leading code",
        itHasCorrectOutputAndCursorPosition(
          "singleConvertBlockLeading.js",
          2,
          18,
          0,
          1
        )
      )
      describe(
        "when it's trailing comment",
        itHasCorrectOutputAndCursorPosition(
          "singleConvertBlockTrailing.js",
          3,
          23,
          0,
          -12
        )
      )
      describe(
        "when it's trailing comment inside comma",
        itHasCorrectOutputAndCursorPosition(
          "singleConvertBlockTrailingComma.js",
          2,
          23,
          0,
          -10
        )
      )
      // TODO: doesn't add space afterward
      describe.skip(
        "when it's missing spaces and ugly",
        itHasCorrectOutputAndCursorPosition(
          "singleConvertBlockUnspaced.js",
          1,
          11,
          0,
          2
        )
      )
    })
  })
})

describe("remove existing jsdoc", () => {
  describe("when it's alone on a line", () => {
    describe("when cursor's inside", () => {
      const cursorInitialPos = new vscode.Position(1, 20)

      const targets: Targets = {
        anchor: cursorInitialPos.translate(0, -4),
        active: cursorInitialPos.translate(0, -4),
      }

      before(
        loadTextAndToggleJsdoc(
          "singleRemove.js",
          targets,
          cursorInitialPos,
          cursorInitialPos
        )
      )

      itHasTargetText(targets)
      itHasCursorSelectionPosition(targets)
    })
  })
  describe(
    "when it's internal & surrounded by code",
    itHasCorrectOutputAndCursorPosition("singleRemoveInternal.js", 1, 24, 0, -1)
  )
  describe(
    "when it's leading code",
    itHasCorrectOutputAndCursorPosition("singleRemoveLeading.js", 2, 13, 0, -1)
  )
  describe(
    "when it's trailing code",
    itHasCorrectOutputAndCursorPosition("singleRemoveTrailing.js", 1, 25, 0, -1)
  )
  describe(
    "when it's unspaced",
    itHasCorrectOutputAndCursorPosition("singleRemoveUnspaced.js", 1, 12, 0, 0)
  )
})

// #region - multiline comments
describe("multi line jsdoc comment", () => {
  describe("add", () => {
    describe(
      "selection not before or at end (internal)",
      itHasCorrectOutputAndSelectionPositions(
        "multiAdd.js",
        2,
        5,
        1,
        5,
        1,
        3,
        1,
        3
      )
    )

    // REVIEW: not sure this makes sense
    describe("selection is before first non-whitespace char", () => {
      const activeInitialPos = new vscode.Position(1, 1)
      const anchorInitialPos = new vscode.Position(2, 5)

      const targets: Targets = {
        anchor: anchorInitialPos.translate(1, 3),
        active: activeInitialPos.translate(1, 4),
      }

      before(
        loadTextAndToggleJsdoc(
          "multiAdd.js",
          targets,
          anchorInitialPos,
          activeInitialPos
        )
      )

      itHasTargetText(targets)
      itHasCursorSelectionPosition(targets)
    })

    describe("selection is at end", () => {
      const anchorInitialPos = new vscode.Position(2, 13)
      const activeInitialPos = new vscode.Position(1, 5)

      const targets: Targets = {
        anchor: anchorInitialPos.translate(1, 3),
        active: activeInitialPos.translate(1, 3),
      }

      before(
        loadTextAndToggleJsdoc(
          "multiAdd.js",
          targets,
          anchorInitialPos,
          activeInitialPos
        )
      )

      itHasTargetText(targets)
      itHasCursorSelectionPosition(targets)
    })
  })

  describe("convert", () => {
    describe("selection not before or at end (internal)", () => {
      const anchorInitialPos = new vscode.Position(2, 9)
      const activeInitialPos = new vscode.Position(1, 9)

      const targets: Targets = {
        anchor: anchorInitialPos.translate(1, 1),
        active: activeInitialPos.translate(1, 0),
      }

      before(
        loadTextAndToggleJsdoc(
          "multiConvertLine.js",
          targets,
          anchorInitialPos,
          activeInitialPos
        )
      )

      itHasTargetText(targets)
      itHasCursorSelectionPosition(targets)
    })

    // REVIEW: not sure this makes sense
    describe("selection is before first non-whitespace char", () => {
      const activeInitialPos = new vscode.Position(1, 1)
      const anchorInitialPos = new vscode.Position(2, 9)

      const targets: Targets = {
        anchor: anchorInitialPos.translate(1, 1),
        active: new vscode.Position(2, 5), // FIXME: hardcoded
      }

      before(
        loadTextAndToggleJsdoc(
          "multiConvertLine.js",
          targets,
          anchorInitialPos,
          activeInitialPos
        )
      )

      itHasTargetText(targets)
      itHasCursorSelectionPosition(targets)
    })

    describe("selection is at end", () => {
      const anchorInitialPos = new vscode.Position(2, 16)
      const activeInitialPos = new vscode.Position(1, 9)

      const targets: Targets = {
        anchor: anchorInitialPos.translate(1, 0),
        active: activeInitialPos.translate(1, 0),
      }

      before(
        loadTextAndToggleJsdoc(
          "multiConvertLine.js",
          targets,
          anchorInitialPos,
          activeInitialPos
        )
      )

      itHasTargetText(targets)
      itHasCursorSelectionPosition(targets)
    })
  })

  describe("remove", () => {
    describe("all lines, including open and close tags, are selected", () => {
      const anchorInitialPos = new vscode.Position(4, 5)
      const activeInitialPos = new vscode.Position(1, 2)

      const targets: Targets = {
        anchor: anchorInitialPos.translate(-2).with({ character: 13 }),
        active: activeInitialPos.with({ character: 0 }),
      }

      before(
        loadTextAndToggleJsdoc(
          "multiRemove.js",
          targets,
          anchorInitialPos,
          activeInitialPos
        )
      )

      itHasTargetText(targets)
      itHasCursorSelectionPosition(targets)
    })

    describe("neither the start nor end tags' lines are within selection", () => {
      const anchorInitialPos = new vscode.Position(3, 8)
      const activeInitialPos = new vscode.Position(2, 8)

      const targets: Targets = {
        anchor: anchorInitialPos.translate(-1, 0),
        active: activeInitialPos.translate(-1, 0),
      }

      before(
        loadTextAndToggleJsdoc(
          "multiRemove.js",
          targets,
          anchorInitialPos,
          activeInitialPos
        )
      )

      itHasTargetText(targets)
      itHasCursorSelectionPosition(targets)
    })

    // TODO: single line multi line block comment
    describe("no selection & cursor is anywhere within", () => {
      const cursorInitialPos = new vscode.Position(2, 8)

      const targets: Targets = {
        anchor: cursorInitialPos.translate(-1, -3),
        active: cursorInitialPos.translate(-1, -3),
      }

      before(
        loadTextAndToggleJsdoc(
          "multiAdd.js",
          targets,
          cursorInitialPos,
          cursorInitialPos
        )
      )

      itHasTargetText(targets)
      itHasCursorSelectionPosition(targets)
    })
  })
})
