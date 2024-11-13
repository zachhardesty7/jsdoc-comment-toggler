/* eslint-disable import/no-unresolved, import/extensions, @typescript-eslint/no-empty-function */
/* global describe, it */

// examples for naming
// https://github.com/mochajs/mocha/blob/fd9fe95e2c8f86366fe12d88b76a81d93d5e20be/test/node-unit/serializer.spec.js

import fs from "fs"
import assert from "assert"
import path from "path"
import vscode from "vscode"
import Mocha from "mocha"
import { getEditor, toggleJSDocComment } from "../../src/extension"
import { getTestedFiles } from "../utils"

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

interface Range {
  active: {
    _character: number
    _line: number
  }
  anchor: {
    _character: number
    _line: number
  }
}

/**
 * useful for debugging, must uncomment `timeout: 60000,` in `mocha` constructor
 * in `index.ts`
 *
 * @param ms - milliseconds to wait
 * @returns promise that resolves after `ms` milliseconds
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// NOTE: async required to keep files from overwriting editor
const loadFile = async (fileName: string): Promise<string> => {
  const startingContentUri = path.join(__dirname, testsFolder, fileName)
  const targetContentUri = path.join(__dirname, resultsFolder, fileName)

  getTestedFiles().add(startingContentUri)

  const startingContent = fs.readFileSync(startingContentUri, "utf-8")
  const targetContent = fs.readFileSync(targetContentUri, "utf-8")

  const editor = getEditor()

  // set document text to starting content of test
  const lineLast = editor.document.lineAt(editor.document.lineCount - 1)
  await editor.edit((editBuilder) => {
    editBuilder.replace(
      new vscode.Range(0, 0, lineLast.lineNumber, lineLast.range.end.character),
      startingContent,
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

const itHasTargetText = (
  targets: Targets,
  fileName: string,
  initial: Range,
) => {
  const startingContentUri = path.join(__dirname, testsFolder, fileName)
  const targetContentUri = path.join(__dirname, resultsFolder, fileName)

  it("has the expected text output", () => {
    try {
      const { content } = targets
      if (!content) {
        throw new ReferenceError("target output content not found")
      }

      assert.strictEqual(
        getEditor().document.getText(),
        content,
        `output text incorrect, initial selection (1-based Editor index) from ${
          initial.anchor._line + 1
        }:${initial.anchor._character + 1} to ${initial.active._line + 1}:${
          initial.active._character + 1
        }
        input file: ${startingContentUri}
        target file: ${targetContentUri}`,
      )
    } catch (error) {
      if (error instanceof Error) {
        error.stack = "" // hide useless info from Mocha test internals
      }
      throw error
    }
  })
}

const itHasCursorSelectionPosition = (
  targets: Targets,
  fileName: string,
  initial: Range,
) => {
  const startingContentUri = path.join(__dirname, testsFolder, fileName)
  const targetContentUri = path.join(__dirname, resultsFolder, fileName)

  Error.stackTraceLimit = 25 // NOTE: may need adjustment
  const stack: { stack: string } = { stack: "" }
  Error.captureStackTrace(stack)

  it("has cursor & selection at correct position", () => {
    try {
      const { anchor, active } = targets
      if (!anchor || !active) {
        throw new ReferenceError(
          "target anchor and/or active positions not found",
        )
      }

      const { selection } = getEditor()
      assert.strictEqual(
        `anchor: ${selection.anchor.line + 1}:${
          selection.anchor.character + 1
        } \nactive: ${selection.active.line + 1}:${
          selection.active.character + 1
        }`,
        `anchor: ${anchor.line + 1}:${anchor.character + 1} \nactive: ${
          active.line + 1
        }:${active.character + 1}`,
        `cursor and/or selection in incorrect position (1-based Editor index), initial selection from ${
          initial.anchor._line + 1
        }:${initial.anchor._character + 1} to ${initial.active._line + 1}:${
          initial.active._character + 1
        }
        input file: ${startingContentUri}
        target file: ${targetContentUri}`,
      )
    } catch (error) {
      if (error instanceof Error) {
        error.stack = stack.stack
      }
      throw error
    }
  })
}

// NOTE: async required to keep files from overwriting editor
const loadTextAndToggleJsdoc =
  (
    fileName: string,
    targets: Targets,
    anchorInitialPos: vscode.Position,
    activeInitialPos: vscode.Position,
  ): Mocha.Func =>
  async () => {
    const targetContent = await loadFile(fileName)
    Object.assign(targets, { content: targetContent })

    getEditor().selection = new vscode.Selection(
      anchorInitialPos,
      activeInitialPos,
    )

    await toggleJSDocComment()
  }

/** line and char should be 1 less than VSCode shows */
const itHasCorrectOutputAndSelectionPositions =
  (
    fileName: string,
    anchorInitialLine: number,
    anchorInitialChar: number,
    activeInitialLine: number,
    activeInitialChar: number,
    anchorLineDelta: number,
    anchorCharDelta: number,
    activeLineDelta: number,
    activeCharDelta: number,
  ) =>
  () => {
    const anchorInitialPos = new vscode.Position(
      anchorInitialLine,
      anchorInitialChar,
    )
    const activeInitialPos = new vscode.Position(
      activeInitialLine,
      activeInitialChar,
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
        activeInitialPos,
      ),
    )

    const initialRange: Range = {
      active: {
        _character: activeInitialChar,
        _line: activeInitialLine,
      },
      anchor: {
        _character: anchorInitialChar,
        _line: anchorInitialLine,
      },
    }

    itHasTargetText(targets, fileName, initialRange)
    itHasCursorSelectionPosition(targets, fileName, initialRange)
  }

/** line and char should be 1 less than VSCode shows */
const itHasCorrectOutputAndCursorPosition = (
  fileName: string,
  cursorInitialLine: number,
  cursorInitialChar: number,
  cursorLineDelta: number,
  cursorCharDelta: number,
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
    cursorCharDelta,
  )

// #region - single line tests
describe("single line jsdoc comment", () => {
  // "add new comment op"
  describe("adding new comment", () => {
    describe("when NO selection", () => {
      describe(
        "when cursor is at start of an empty line",
        itHasCorrectOutputAndCursorPosition("singleAddAbove.js", 0, 0, 0, 4),
      )
      describe(
        "when cursor is at start of line",
        itHasCorrectOutputAndCursorPosition("singleAddStart.js", 1, 0, 0, 4),
      )
      describe(
        "when cursor is not at start but right before text",
        itHasCorrectOutputAndCursorPosition("singleAddStartB.js", 4, 6, 0, 4),
      )
      describe(
        "when cursor is not at start and is 1+ space away from text",
        itHasCorrectOutputAndCursorPosition("singleAddStartC.js", 4, 0, 0, 10),
      )
      describe(
        "when cursor is at end of line",
        itHasCorrectOutputAndCursorPosition("singleAddEnd.js", 0, 24, 0, -20),
      )
      describe(
        "when cursor has space on left and right",
        itHasCorrectOutputAndCursorPosition("singleAddSpaced.js", 0, 19, 0, 4),
      )
      // REVIEW: maybe add an inline jsdoc comment
      describe(
        "when cursor is missing a space on left or right",
        itHasCorrectOutputAndCursorPosition(
          "singleAddUnspaced.js",
          0,
          18,
          0,
          -14,
        ),
      )
      describe(
        "when cursor is on an indented new line of a block",
        itHasCorrectOutputAndCursorPosition("singleAddBlock.js", 1, 2, 0, 4),
      )
    })

    // FIXME: adds line to the comment that has active cursor
    describe.skip(
      "when selection is entire line",
      itHasCorrectOutputAndSelectionPositions(
        "singleAddSelection.js",
        0,
        0,
        1,
        0,
        0,
        4,
        -1,
        26,
      ),
    )

    // TODO: improve weak example
    describe(
      "when selection exists within interior of line",
      itHasCorrectOutputAndSelectionPositions(
        "singleAddSelectionInternal.js",
        0,
        21,
        0,
        32,
        0,
        4,
        0,
        4,
      ),
    )

    // TODO: improve weak example
    describe(
      "when selection ends at end of line",
      itHasCorrectOutputAndSelectionPositions(
        "singleAddSelectionEnd.js",
        0,
        19,
        0,
        24,
        0,
        4,
        0,
        4,
      ),
    )

    // FIXME: adds line to the comment that has active cursor & messes up selection
    describe.skip(
      "when selection is entire line (triple click) and indented",
      itHasCorrectOutputAndSelectionPositions(
        "singleAddSelectionIndent.js",
        1,
        0,
        2,
        0,
        0,
        6,
        -1,
        28,
      ),
    )
    // FIXME: adds line to the comment that has active cursor & messes up spacing & selection
    describe.skip(
      "when selection is entire alone line (triple click) and indented",
      itHasCorrectOutputAndSelectionPositions(
        "singleAddSelectionIndentAlone.js",
        2,
        0,
        3,
        0,
        0,
        6,
        -1,
        28,
      ),
    )
    describe(
      "when selection is all of the text and indented",
      itHasCorrectOutputAndSelectionPositions(
        "singleAddSelectionIndent.js",
        1,
        2,
        1,
        24,
        0,
        4,
        0,
        4,
      ),
    )
    describe(
      "when reversed selection is all of the text and indented",
      itHasCorrectOutputAndSelectionPositions(
        "singleAddSelectionIndent.js",
        1,
        24,
        1,
        2,
        0,
        4,
        0,
        4,
      ),
    )
  })

  describe("when existing comment", () => {
    describe("when it's a line comment", () => {
      // TODO: implement (make sure any arbitrary spaces are handled)
      // describe("when it's missing spaces and is ugly", () => {
      // })

      describe("when it's alone on a line", () => {
        describe("when NO selection", () => {
          describe(
            "when cursor's inside",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLine.js",
              2,
              18,
              0,
              1,
            ),
          )

          describe(
            "when cursor is before comment",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLine.js",
              2,
              0,
              0,
              0,
            ),
          )

          describe(
            "when cursor is inside comment tag",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLine.js",
              2,
              3,
              0,
              2,
            ),
          )

          describe(
            "when cursor is just after comment tag before a space",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLine.js",
              2,
              4,
              0,
              1,
            ),
          )

          describe(
            "when cursor is just after space after comment tag",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLine.js",
              2,
              5,
              0,
              1,
            ),
          )

          describe(
            "when cursor is at end of line comment",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLine.js",
              2,
              28,
              0,
              1,
            ),
          )
        })
        // TODO: implement
        // describe("when selection", () => {
        // })
      })

      describe("when it's at start of a line", () => {
        describe("when NO selection", () => {
          describe(
            "when cursor's inside",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLineStart.js",
              0,
              10,
              0,
              1,
            ),
          )

          describe(
            "when cursor is just before comment tag",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLineStart.js",
              0,
              0,
              0,
              3,
            ),
          )

          describe(
            "when cursor is inside comment tag",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLineStart.js",
              0,
              1,
              0,
              2,
            ),
          )

          describe(
            "when cursor is just after comment tag before a space",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLineStart.js",
              0,
              2,
              0,
              1,
            ),
          )

          describe(
            "when cursor is just after space after comment tag",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLineStart.js",
              0,
              3,
              0,
              1,
            ),
          )

          describe(
            "when cursor is at end of line comment",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLineStart.js",
              0,
              25,
              0,
              1,
            ),
          )
        })
        // TODO: implement
        // describe("when selection", () => {
        // })
      })

      describe("when it's nested in JSDoc", () => {
        // TODO: can be improved by also aligning the comment
        describe(
          "when NO star proceeds it",
          itHasCorrectOutputAndCursorPosition(
            "singleConvertLineNestedA.js",
            1,
            21,
            0,
            -1,
          ),
        )
        // TODO: can be improved by also aligning the comment
        describe(
          "when NO star proceeds it in middle",
          itHasCorrectOutputAndCursorPosition(
            "singleConvertLineNestedB.js",
            2,
            21,
            0,
            -1,
          ),
        )
        // FIXME: rm extra space
        describe(
          "when a star proceeds it",
          itHasCorrectOutputAndCursorPosition(
            "singleConvertLineNestedC.js",
            2,
            21,
            0,
            -2,
          ),
        )
      })

      describe("when it's trailing code", () => {
        describe("when NO selection", () => {
          describe(
            "when cursor is before comment",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLineTrailingB.js",
              2,
              6,
              0,
              0,
            ),
          )
          describe(
            "when cursor's inside",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLineTrailing.js",
              2,
              25,
              0,
              -12,
            ),
          )
          // REVIEW: should this leave cursor just before comment tag instead of moving inside jsdoc?
          // FIXME: creates new comment instead of converting
          describe.skip(
            "when cursor is just before comment tag",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLineTrailing.js",
              2,
              15,
              0,
              -9,
            ),
          )
          // FIXME: doesn't get rid of comment tag
          describe.skip(
            "when cursor is inside comment tag",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLineTrailing.js",
              2,
              16,
              0,
              -10,
            ),
          )
          // FIXME: adds an extra space between jsdoc start and comment
          describe.skip(
            "when cursor is just after comment tag before a space",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLineTrailing.js",
              2,
              17,
              0,
              -11,
            ),
          )
          describe(
            "when cursor is just after space after comment tag",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLineTrailing.js",
              2,
              18,
              0,
              -12,
            ),
          )
          describe(
            "when cursor is at end of line comment",
            itHasCorrectOutputAndCursorPosition(
              "singleConvertLineTrailing.js",
              2,
              40,
              0,
              -12,
            ),
          )
        })
        // TODO: implement
        // describe("when selection", () => {
        // })
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
          1,
        ),
      )
      describe(
        "when it's alone on a line & cursor before it",
        itHasCorrectOutputAndCursorPosition(
          "singleConvertBlock.js",
          1,
          0,
          0,
          0,
        ),
      )
      describe(
        "when it's alone on a line & cursor after it",
        itHasCorrectOutputAndCursorPosition(
          "singleConvertBlock.js",
          1,
          30,
          0,
          1,
        ),
      )

      describe(
        "when it's internal & surrounded by code",
        itHasCorrectOutputAndCursorPosition(
          "singleConvertBlockInternal.js",
          1,
          23,
          0,
          1,
        ),
      )
      describe(
        "when it's leading code",
        itHasCorrectOutputAndCursorPosition(
          "singleConvertBlockLeading.js",
          2,
          18,
          0,
          1,
        ),
      )
      describe(
        "when it's trailing comment",
        itHasCorrectOutputAndCursorPosition(
          "singleConvertBlockTrailing.js",
          3,
          23,
          0,
          -12,
        ),
      )
      describe(
        "when it's trailing comment inside comma",
        itHasCorrectOutputAndCursorPosition(
          "singleConvertBlockTrailingComma.js",
          2,
          23,
          0,
          -10,
        ),
      )
      // FIXME: doesn't add space afterward
      describe.skip(
        "when it's missing spaces and ugly",
        itHasCorrectOutputAndCursorPosition(
          "singleConvertBlockUnspaced.js",
          1,
          11,
          0,
          2,
        ),
      )
    })
  })
})

describe("remove existing jsdoc", () => {
  describe("when it's alone on a line", () => {
    describe(
      "when cursor is before comment",
      itHasCorrectOutputAndCursorPosition("singleRemove.js", 1, 0, 0, 0),
    )

    describe(
      "when cursor's inside",
      itHasCorrectOutputAndCursorPosition("singleRemove.js", 1, 20, 0, -1),
    )
    describe(
      "when cursor's at end",
      itHasCorrectOutputAndCursorPosition("singleRemove.js", 1, 31, 0, -4),
    )
  })
  describe(
    "when it's internal & surrounded by code",
    itHasCorrectOutputAndCursorPosition(
      "singleRemoveInternal.js",
      1,
      24,
      0,
      -1,
    ),
  )
  describe(
    "when it's leading code",
    itHasCorrectOutputAndCursorPosition("singleRemoveLeading.js", 2, 13, 0, -1),
  )
  describe(
    "when it's trailing code",
    itHasCorrectOutputAndCursorPosition(
      "singleRemoveTrailing.js",
      1,
      25,
      0,
      -1,
    ),
  )
  describe(
    "when it's unspaced",
    itHasCorrectOutputAndCursorPosition("singleRemoveUnspaced.js", 1, 12, 0, 0),
  )
  describe(
    "when the whole line is selected from end to start",
    itHasCorrectOutputAndSelectionPositions(
      "singleRemoveUnspaced.js",
      1,
      29,
      1,
      0,
      0,
      -2,
      0,
      0,
    ),
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
        3,
      ),
    )

    describe(
      "selection is before first non-whitespace char",
      itHasCorrectOutputAndSelectionPositions(
        "multiAdd.js",
        1,
        1,
        2,
        5,
        // TODO: consider not including JSDoc opening `/**` in selection and make next two params 1, 3
        0,
        0,
        1,
        3,
      ),
    )

    describe(
      "selection is at end",
      itHasCorrectOutputAndSelectionPositions(
        "multiAdd.js",
        2,
        13,
        1,
        5,
        1,
        3,
        1,
        3,
      ),
    )
  })

  describe("convert", () => {
    describe(
      "selection not before or at end (internal)",
      itHasCorrectOutputAndSelectionPositions(
        "multiConvertLine.js",
        2,
        9,
        1,
        9,
        1,
        1,
        1,
        0,
      ),
    )

    describe(
      "selection is before first non-whitespace char",
      itHasCorrectOutputAndSelectionPositions(
        "multiConvertLine.js",
        2,
        9,
        1,
        1,
        1,
        1,
        // TODO: consider not including JSDoc opening `/**` in selection and make next two params 1, 4
        0,
        0,
      ),
    )

    describe(
      "selection starts at end",
      itHasCorrectOutputAndSelectionPositions(
        "multiConvertLine.js",
        2,
        15,
        1,
        9,
        1,
        1,
        1,
        0,
      ),
    )
  })

  describe("remove", () => {
    describe(
      "all lines, including open and close tags, are selected",
      itHasCorrectOutputAndSelectionPositions(
        "multiRemove.js",
        4,
        5,
        1,
        2,
        // TODO: consider excluding trailing newline from selection, making next two params -1, 11
        -1,
        -5,
        0,
        -2,
      ),
    )

    describe(
      "neither the start nor end tags' lines are within selection",
      itHasCorrectOutputAndSelectionPositions(
        "multiRemove.js",
        3,
        8,
        2,
        8,
        -1,
        0,
        -1,
        0,
      ),
    )

    // TODO: single line multi line block comment
    describe.skip(
      "no selection & cursor is anywhere within",
      itHasCorrectOutputAndSelectionPositions(
        "multiRemove.js",
        2,
        8,
        2,
        8,
        -1,
        -3,
        -1,
        -3,
      ),
    )
  })
})
