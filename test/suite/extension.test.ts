/* eslint-disable import/no-unresolved, import/extensions, @typescript-eslint/no-empty-function */
/* global describe, it */

// examples for naming
// https://github.com/mochajs/mocha/blob/fd9fe95e2c8f86366fe12d88b76a81d93d5e20be/test/node-unit/serializer.spec.js

import * as fs from "fs"
import * as assert from "assert"
import * as path from "path"
import * as vscode from "vscode"
import * as Mocha from "mocha"
import { toggleJSDocComment } from "../../src/extension"

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

const getEditor = () => {
  const editor = vscode.window.activeTextEditor
  if (!editor) throw new Error("no active editor, make sure a file is open")
  return editor
}

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
  if (JSON.stringify(editor.document.getText()).includes("\\r\\n"))
    await editor.edit((editBuilder) => {
      editBuilder.setEndOfLine(vscode.EndOfLine.LF)
    })

  // REVIEW: still need delay?
  // await new Promise((resolve) => setTimeout(resolve, 20))

  return targetContent
}

const itHasCursorSelectionPosition = (targets: Targets) => {
  it("has cursor & selection at correct position", () => {
    const { anchor, active } = targets
    if (!anchor || !active)
      throw new Error("missing anchor or active target positions")

    assert.deepStrictEqual(
      {
        anchor: getEditor().selection.anchor,
        active: getEditor().selection.active,
      },
      {
        anchor,
        active,
      },
      "cursor and/or selection not in expected position"
    )
  })
}

const itHasTargetText = (targets: Targets) => {
  it("starts with proper comment tag chars", () => {
    const { content } = targets
    if (!content) throw new Error("missing target content")

    assert.strictEqual(
      getEditor().document.getText(),
      content,
      "incorrect textual content"
    )
  })
}

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

const runTest = (
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

// #region - single line tests
describe("single line jsdoc comments", () => {
  // describe("add new comment op", () => {
  describe("adding new comment", () => {
    describe("when cursor is anywhere, but has NO selection", () => {
      const cursorInitialPos = new vscode.Position(0, 18)

      const targets: Targets = {
        anchor: cursorInitialPos.translate(0, 4),
        active: cursorInitialPos.translate(0, 4),
      }

      before(
        loadTextAndToggleJsdoc(
          "singleAdd.js",
          targets,
          cursorInitialPos,
          cursorInitialPos
        )
      )

      itHasTargetText(targets)
      itHasCursorSelectionPosition(targets)
    })

    // REVIEW: honestly can't think of a use-case for this
    describe("when selection exists within interior of line", () => {
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
      describe("when it's alone on a line", () => {
        describe("when NO selection", () => {
          describe("when cursor is in middle of comment", () => {
            const cursorInitialPos = new vscode.Position(1, 10)

            const targets: Targets = {
              anchor: cursorInitialPos.translate(0, 1),
              active: cursorInitialPos.translate(0, 1),
            }

            before(
              loadTextAndToggleJsdoc(
                "singleConvertLine.js",
                targets,
                cursorInitialPos,
                cursorInitialPos
              )
            )

            itHasTargetText(targets)
            itHasCursorSelectionPosition(targets)
          })

          describe("when cursor is before first comment char of line comment", () => {
            const cursorInitialPos = new vscode.Position(1, 5)

            const targets: Targets = {
              anchor: cursorInitialPos.translate(0, 1),
              active: cursorInitialPos.translate(0, 1),
            }

            before(
              loadTextAndToggleJsdoc(
                "singleConvertLine.js",
                targets,
                cursorInitialPos,
                cursorInitialPos
              )
            )

            itHasTargetText(targets)
            itHasCursorSelectionPosition(targets)
          })

          describe("when cursor is at end of line comment", () => {
            const cursorInitialPos = new vscode.Position(1, 32)

            const targets: Targets = {
              anchor: cursorInitialPos.translate(0, 1),
              active: cursorInitialPos.translate(0, 1),
            }

            before(
              loadTextAndToggleJsdoc(
                "singleConvertLine.js",
                targets,
                cursorInitialPos,
                cursorInitialPos
              )
            )

            itHasTargetText(targets)
            itHasCursorSelectionPosition(targets)
          })

          describe("when cursor is before line comment start", () => {
            const cursorInitialPos = new vscode.Position(1, 1)

            const targets: Targets = {
              anchor: cursorInitialPos,
              active: cursorInitialPos,
            }

            before(
              loadTextAndToggleJsdoc(
                "singleConvertLine.js",
                targets,
                cursorInitialPos,
                cursorInitialPos
              )
            )

            itHasTargetText(targets)
            itHasCursorSelectionPosition(targets)
          })
        })
        describe.skip("when selection", () => {})
      })
      describe.skip("when it's trailing code", () => {
        describe.skip("when NO selection", () => {
          describe.skip("when cursor is in middle of comment", () => {})
          describe.skip("when cursor is before first comment char of line comment", () => {})
          describe.skip("when cursor is at end of line comment", () => {})
          describe.skip("when cursor is before line comment start", () => {})
        })
        describe.skip("when selection", () => {})
      })
      describe.skip("when it's unspaced", () => {
        describe.skip("when NO selection", () => {
          describe.skip("when cursor is in middle of comment", () => {})
          describe.skip("when cursor is before first comment char of line comment", () => {})
          describe.skip("when cursor is at end of line comment", () => {})
          describe.skip("when cursor is before line comment start", () => {})
        })
        describe.skip("when selection", () => {})
      })
    })
    describe.skip("when it's a block comment", () => {
      describe.skip("when it's alone on a line", () => {})
      describe.skip("when it's internal & surrounded by code", () => {})
      describe.skip("when it's leading code", () => {})
      describe.skip("when it's trailing code", () => {})
      describe.skip("when it's unspaced", () => {})
    })
  })
})

describe("remove existing jsdoc", () => {
  describe("when it's alone on a line", () => {
    describe("cursor anywhere", () => {
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
  describe.skip("when it's internal & surrounded by code", () => {})
  describe.skip("when it's leading code", () => {})
  describe.skip("when it's trailing code", () => {})
  describe.skip("when it's unspaced", () => {})
})

// #region - multiline comments
describe("multi line jsdoc comment", () => {
  describe("add", () => {
    describe(
      "selection not before or at end (internal)",
      runTest("multiAdd.js", 2, 5, 1, 5, 1, 3, 1, 3)
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
