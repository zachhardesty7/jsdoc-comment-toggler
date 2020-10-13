/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* global describe, it */

import * as fs from "fs"
import * as assert from "assert"
import * as path from "path"
import * as vscode from "vscode"
import { toggleJSDocComment } from "../../src/extension"

const testsFolder = "../../../test/examples/"
const resultsFolder = "../../../test/results/"

/** editor and predefined targets */
interface Subjects {
  editor?: vscode.TextEditor
  /** predefined document body */
  content?: string
  /** predefined opposite end of selection */
  anchor?: vscode.Position
  /** predefined cursor position */
  active?: vscode.Position
}

const loadFile = async (
  fileName: string
): Promise<{ editor: vscode.TextEditor; content: string }> => {
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor")

  const testUri = path.join(__dirname, testsFolder, fileName)
  const contentUri = path.join(__dirname, resultsFolder, fileName)

  const content = fs.readFileSync(contentUri, { encoding: "utf-8" })

  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.file(testUri)
  )
  const editor = await vscode.window.showTextDocument(document)
  await new Promise((resolve) => setTimeout(resolve, 700))

  return { editor, content }
}

const assertEditorCursorSelectionEquals = (subjects: Subjects) => {
  it("has cursor & selection at correct position", async () => {
    const { editor, active, anchor } = subjects
    if (!editor || !active || !anchor)
      throw new Error("editor or target missing")

    assert.deepStrictEqual(
      {
        active: editor.selection.active,
        anchor: editor.selection.anchor,
      },
      {
        active,
        anchor,
      },
      "cursor and/or selection not in expected position"
    )
  })
}

const itHasTargetText = (subjects: Subjects) => {
  it("has toggled JSDoc comment chars", async () => {
    const { editor, content } = subjects
    if (!editor || !content) throw new Error("editor or target missing")

    assert.strictEqual(
      editor.document.getText(),
      content,
      "incorrect textual content"
    )
  })
}

// #region - single line tests
describe("single line jsdoc comment", () => {
  describe("add", () => {
    describe("cursor in middle", () => {
      const cursorPrePos = new vscode.Position(1, 3)

      const subjects: Subjects = {
        anchor: cursorPrePos.translate(0, 4),
        active: cursorPrePos.translate(0, 4),
      }

      before(async () => {
        const data = await loadFile("singleAdd.js")
        Object.assign(subjects, data).editor.selection = new vscode.Selection(
          cursorPrePos,
          cursorPrePos
        )
        await toggleJSDocComment()
      })

      itHasTargetText(subjects)

      assertEditorCursorSelectionEquals(subjects)
    })

    describe("cursor is at end", () => {
      const cursorPrePos = new vscode.Position(1, 13)

      const subjects: Subjects = {
        anchor: cursorPrePos.translate(0, 4),
        active: cursorPrePos.translate(0, 4),
      }

      before(async () => {
        const data = await loadFile("singleAdd.js")
        Object.assign(subjects, data).editor.selection = new vscode.Selection(
          cursorPrePos,
          cursorPrePos
        )
        await toggleJSDocComment()
      })

      itHasTargetText(subjects)

      assertEditorCursorSelectionEquals(subjects)
    })

    describe("cursor is before first non-whitespace", () => {
      const cursorPrePos = new vscode.Position(1, 1)

      const subjects: Subjects = {
        anchor: cursorPrePos,
        active: cursorPrePos,
      }

      before(async () => {
        const data = await loadFile("singleAdd.js")
        Object.assign(subjects, data).editor.selection = new vscode.Selection(
          cursorPrePos,
          cursorPrePos
        )
        await toggleJSDocComment()
      })

      itHasTargetText(subjects)

      assertEditorCursorSelectionEquals(subjects)
    })
  })

  describe("convert", () => {
    describe("cursor in middle", () => {
      const cursorPrePos = new vscode.Position(1, 7)

      const subjects: Subjects = {
        anchor: cursorPrePos.translate(0, 1),
        active: cursorPrePos.translate(0, 1),
      }

      before(async () => {
        const data = await loadFile("singleConvert.js")
        Object.assign(subjects, data).editor.selection = new vscode.Selection(
          cursorPrePos,
          cursorPrePos
        )
        await toggleJSDocComment()
      })

      itHasTargetText(subjects)

      assertEditorCursorSelectionEquals(subjects)
    })

    describe("cursor is at end", () => {
      const cursorPrePos = new vscode.Position(1, 16)

      const subjects: Subjects = {
        anchor: cursorPrePos.translate(0, 1),
        active: cursorPrePos.translate(0, 1),
      }

      before(async () => {
        const data = await loadFile("singleConvert.js")
        Object.assign(subjects, data).editor.selection = new vscode.Selection(
          cursorPrePos,
          cursorPrePos
        )
        await toggleJSDocComment()
      })

      itHasTargetText(subjects)

      assertEditorCursorSelectionEquals(subjects)
    })

    describe("cursor is before first non-whitespace", () => {
      const cursorPrePos = new vscode.Position(1, 1)

      const subjects: Subjects = {
        anchor: cursorPrePos,
        active: cursorPrePos,
      }

      before(async () => {
        const data = await loadFile("singleConvert.js")
        Object.assign(subjects, data).editor.selection = new vscode.Selection(
          cursorPrePos,
          cursorPrePos
        )
        await toggleJSDocComment()
      })

      itHasTargetText(subjects)

      assertEditorCursorSelectionEquals(subjects)
    })
  })

  describe("remove", () => {
    describe("cursor anywhere", () => {
      const cursorPrePos = new vscode.Position(1, 20)

      const subjects: Subjects = {
        anchor: cursorPrePos.translate(0, -4),
        active: cursorPrePos.translate(0, -4),
      }

      before(async () => {
        const data = await loadFile("singleRemove.js")
        Object.assign(subjects, data).editor.selection = new vscode.Selection(
          cursorPrePos,
          cursorPrePos
        )
        await toggleJSDocComment()
      })

      itHasTargetText(subjects)

      assertEditorCursorSelectionEquals(subjects)
    })
  })
})

// #region - multiline comments
describe("multi line jsdoc comment", () => {
  describe("add", () => {
    describe("selection not before or at end (internal)", () => {
      const anchorPrePos = new vscode.Position(2, 5)
      const activePrePos = new vscode.Position(1, 5)

      const subjects: Subjects = {
        anchor: anchorPrePos.translate(1, 3),
        active: activePrePos.translate(1, 3),
      }

      before(async () => {
        const data = await loadFile("multiAdd.js")
        Object.assign(subjects, data).editor.selection = new vscode.Selection(
          anchorPrePos,
          activePrePos
        )
        await toggleJSDocComment()
      })

      itHasTargetText(subjects)

      assertEditorCursorSelectionEquals(subjects)
    })

    // REVIEW: not sure this makes sense
    describe("selection is before first non-whitespace char", () => {
      const activePrePos = new vscode.Position(1, 1)
      const anchorPrePos = new vscode.Position(2, 5)

      const subjects: Subjects = {
        anchor: anchorPrePos.translate(1, 3),
        active: activePrePos.translate(1, 4),
      }

      before(async () => {
        const data = await loadFile("multiAdd.js")
        Object.assign(subjects, data).editor.selection = new vscode.Selection(
          anchorPrePos,
          activePrePos
        )
        await toggleJSDocComment()
      })

      itHasTargetText(subjects)

      assertEditorCursorSelectionEquals(subjects)
    })

    describe("selection is at end", () => {
      const anchorPrePos = new vscode.Position(2, 13)
      const activePrePos = new vscode.Position(1, 5)

      const subjects: Subjects = {
        anchor: anchorPrePos.translate(1, 3),
        active: activePrePos.translate(1, 3),
      }

      before(async () => {
        const data = await loadFile("multiAdd.js")
        Object.assign(subjects, data).editor.selection = new vscode.Selection(
          anchorPrePos,
          activePrePos
        )
        await toggleJSDocComment()
      })

      itHasTargetText(subjects)

      assertEditorCursorSelectionEquals(subjects)
    })
  })

  describe("convert", () => {
    describe("selection not before or at end (internal)", () => {
      const anchorPrePos = new vscode.Position(2, 9)
      const activePrePos = new vscode.Position(1, 9)

      const subjects: Subjects = {
        anchor: anchorPrePos.translate(1, 0),
        active: activePrePos.translate(1, 0),
      }

      before(async () => {
        const data = await loadFile("multiConvert.js")
        Object.assign(subjects, data).editor.selection = new vscode.Selection(
          anchorPrePos,
          activePrePos
        )
        await toggleJSDocComment()
      })

      itHasTargetText(subjects)

      assertEditorCursorSelectionEquals(subjects)
    })

    // REVIEW: not sure this makes sense
    describe("selection is before first non-whitespace char", () => {
      const activePrePos = new vscode.Position(1, 1)
      const anchorPrePos = new vscode.Position(2, 9)

      const subjects: Subjects = {
        anchor: anchorPrePos.translate(1, 0),
        active: new vscode.Position(2, 5), // FIXME: hardcoded
      }

      before(async () => {
        const data = await loadFile("multiConvert.js")
        Object.assign(subjects, data).editor.selection = new vscode.Selection(
          anchorPrePos,
          activePrePos
        )
        await toggleJSDocComment()
      })

      itHasTargetText(subjects)

      assertEditorCursorSelectionEquals(subjects)
    })

    describe("selection is at end", () => {
      const anchorPrePos = new vscode.Position(2, 16)
      const activePrePos = new vscode.Position(1, 9)

      const subjects: Subjects = {
        anchor: anchorPrePos.translate(1, 0),
        active: activePrePos.translate(1, 0),
      }

      before(async () => {
        const data = await loadFile("multiConvert.js")
        Object.assign(subjects, data).editor.selection = new vscode.Selection(
          anchorPrePos,
          activePrePos
        )
        await toggleJSDocComment()
      })

      itHasTargetText(subjects)

      assertEditorCursorSelectionEquals(subjects)
    })
  })

  describe("remove", () => {
    describe("all lines, including open and close tags, are selected", () => {
      const anchorPrePos = new vscode.Position(4, 5)
      const activePrePos = new vscode.Position(1, 2)

      const subjects: Subjects = {
        anchor: anchorPrePos.translate(-2).with({ character: 13 }),
        active: activePrePos.with({ character: 0 }),
      }

      before(async () => {
        const data = await loadFile("multiRemove.js")
        Object.assign(subjects, data).editor.selection = new vscode.Selection(
          anchorPrePos,
          activePrePos
        )
        await toggleJSDocComment()
      })

      itHasTargetText(subjects)

      assertEditorCursorSelectionEquals(subjects)
    })

    describe("neither the start nor end tags' lines are within selection", () => {
      const anchorPrePos = new vscode.Position(3, 8)
      const activePrePos = new vscode.Position(2, 8)

      const subjects: Subjects = {
        anchor: anchorPrePos.translate(-1, 0),
        active: activePrePos.translate(-1, 0),
      }

      before(async () => {
        const data = await loadFile("multiRemove.js")
        Object.assign(subjects, data).editor.selection = new vscode.Selection(
          anchorPrePos,
          activePrePos
        )
        await toggleJSDocComment()
      })

      itHasTargetText(subjects)

      assertEditorCursorSelectionEquals(subjects)
    })

    // TODO: single line multi line block comment
    describe("no selection & cursor is anywhere within", () => {
      const cursorPrePos = new vscode.Position(2, 8)

      const subjects: Subjects = {
        anchor: cursorPrePos.translate(-1, -3),
        active: cursorPrePos.translate(-1, -3),
      }

      before(async () => {
        const data = await loadFile("multiAdd.js")
        Object.assign(subjects, data).editor.selection = new vscode.Selection(
          cursorPrePos,
          cursorPrePos
        )
        await toggleJSDocComment()
      })

      itHasTargetText(subjects)

      assertEditorCursorSelectionEquals(subjects)
    })
  })
})
