/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* global describe, it */

import * as fs from "fs"
import * as assert from "assert"
import * as path from "path"
import * as vscode from "vscode"
import * as Extension from "../../src/extension"

const testsFolder = "../../../test/examples/"
const resultsFolder = "../../../test/results/"

const assertEditorCursorEquals = (
  editor: vscode.TextEditor,
  target: vscode.Position
) => {
  const cursorPos = editor.selection.active

  assert.strictEqual(
    cursorPos.line,
    target.line,
    `cursor on incorrect line\n${cursorPos}`
  )
  assert.strictEqual(
    cursorPos.character,
    target.character,
    `cursor at incorrect pos\n${cursorPos}`
  )
}

const assertEditorAnchorEquals = (
  editor: vscode.TextEditor,
  target: vscode.Position
) => {
  const anchorPos = editor.selection.anchor

  assert.strictEqual(
    anchorPos.line,
    target.line,
    `anchor (other end of selection) on incorrect line\n${anchorPos}`
  )
  assert.strictEqual(
    anchorPos.character,
    target.character,
    `anchor (other end of selection) at incorrect pos\n${anchorPos}`
  )
}

describe("Single Line Comment Tests", () => {
  vscode.window.showInformationMessage("Start all Single Line tests.")

  it("Adds when cursor in middle", async () => {
    const [editor, result] = await loadFile("singleAdd.js")
    const cursorPrePos = new vscode.Position(1, 3)
    editor.selection = new vscode.Selection(cursorPrePos, cursorPrePos)

    // vscode.commands.executeCommand("jsdoc-comment-toggler.toggle")
    await Extension.toggleJSDocComment()

    // verify textual content
    assert.strictEqual(
      editor.document.getText(),
      result,
      "incorrect textual content"
    )

    // verify cursor & selection positions
    assertEditorCursorEquals(editor, cursorPrePos.translate(0, 4))
    assertEditorAnchorEquals(editor, cursorPrePos.translate(0, 4))

    await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
  })

  it("Adds when cursor is at end", async () => {
    const [editor, result] = await loadFile("singleAdd.js")
    const cursorPrePos = new vscode.Position(1, 13)
    editor.selection = new vscode.Selection(cursorPrePos, cursorPrePos)

    await Extension.toggleJSDocComment()

    // verify textual content
    assert.strictEqual(
      editor.document.getText(),
      result,
      "incorrect textual content"
    )

    // verify cursor & selection positions
    assertEditorCursorEquals(editor, cursorPrePos.translate(0, 4))
    assertEditorAnchorEquals(editor, cursorPrePos.translate(0, 4))

    await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
  })

  it("Adds when cursor is before first non-whitespace", async () => {
    const [editor, result] = await loadFile("singleAdd.js")
    const cursorPrePos = new vscode.Position(1, 1)
    editor.selection = new vscode.Selection(cursorPrePos, cursorPrePos)

    await Extension.toggleJSDocComment()

    // verify textual content
    assert.strictEqual(
      editor.document.getText(),
      result,
      "incorrect textual content"
    )

    // verify cursor & selection positions
    assertEditorCursorEquals(editor, cursorPrePos)
    assertEditorAnchorEquals(editor, cursorPrePos)

    await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
  })

  it("Removes", async () => {
    const [editor, result] = await loadFile("singleRemove.js")
    const cursorPrePos = new vscode.Position(1, 20)
    editor.selection = new vscode.Selection(cursorPrePos, cursorPrePos)

    await Extension.toggleJSDocComment()

    // verify textual content
    assert.strictEqual(
      editor.document.getText(),
      result,
      "incorrect textual content"
    )

    // verify cursor & selection positions
    assertEditorCursorEquals(editor, cursorPrePos.translate(0, -7))
    assertEditorAnchorEquals(editor, cursorPrePos.translate(0, -7))

    await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
  })
})

describe("Multi Line Comment Tests", () => {
  vscode.window.showInformationMessage("Start all Multi Line tests.")

  it("Adds", async () => {
    const [editor, result] = await loadFile("multiAdd.js")
    const activePrePos = new vscode.Position(1, 5)
    const anchorPrePos = new vscode.Position(2, 5)
    editor.selection = new vscode.Selection(anchorPrePos, activePrePos)

    // vscode.commands.executeCommand("jsdoc-comment-toggler.toggle")
    await Extension.toggleJSDocComment()

    // verify textual content
    assert.strictEqual(
      editor.document.getText(),
      result,
      "incorrect textual content"
    )

    // verify cursor & selection positions
    assertEditorCursorEquals(editor, activePrePos.translate(1, 3))
    assertEditorAnchorEquals(editor, anchorPrePos.translate(1, 3))

    await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
  })

  it("Adds when selection is before first non-whitespace of line", async () => {
    const [editor, result] = await loadFile("multiAdd.js")
    const activePrePos = new vscode.Position(1, 1)
    const anchorPrePos = new vscode.Position(2, 1)
    editor.selection = new vscode.Selection(anchorPrePos, activePrePos)

    // vscode.commands.executeCommand("jsdoc-comment-toggler.toggle")
    await Extension.toggleJSDocComment()

    // verify textual content
    assert.strictEqual(
      editor.document.getText(),
      result,
      "incorrect textual content"
    )

    // verify cursor & selection positions
    assertEditorCursorEquals(editor, activePrePos.translate(1, 4))
    assertEditorAnchorEquals(editor, anchorPrePos.translate(1, 3))

    await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
  })

  // test("Adds when selection is at end", async () => {
  //   const [editor, result] = await loadFile("multiAdd.js")
  //   const cursorPrePos = new vscode.Position(1, 3)
  //   editor.selection = new vscode.Selection(cursorPrePos, cursorPrePos)

  //   // vscode.commands.executeCommand("jsdoc-comment-toggler.toggle")
  //   await Extension.toggleJSDocComment()

  //   // verify textual content
  //   assert.strictEqual(
  //     editor.document.getText(),
  //     result,
  //     "incorrect textual content"
  //   )

  //   // verify cursor & selection positions
  //   assertEditorCursorEquals(editor, cursorPrePos.translate(0, 4))
  //   assertEditorAnchorEquals(editor, cursorPrePos.translate(0, 4))

  //   await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
  // })

  // test("Removes when all lines, including open and close tags, are selected", async () => {
  //   const [editor, result] = await loadFile("multiRemove.js")
  //   const cursorPrePos = new vscode.Position(1, 3)
  //   editor.selection = new vscode.Selection(cursorPrePos, cursorPrePos)

  //   // vscode.commands.executeCommand("jsdoc-comment-toggler.toggle")
  //   await Extension.toggleJSDocComment()

  //   // verify textual content
  //   assert.strictEqual(
  //     editor.document.getText(),
  //     result,
  //     "incorrect textual content"
  //   )

  //   // verify cursor & selection positions
  //   assertEditorCursorEquals(editor, cursorPrePos.translate(0, 4))
  //   assertEditorAnchorEquals(editor, cursorPrePos.translate(0, 4))

  //   await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
  // })

  // test("Removes when either or both of the start and end tags are not selected", async () => {
  //   const [editor, result] = await loadFile("multiRemove.js")
  //   const cursorPrePos = new vscode.Position(1, 3)
  //   editor.selection = new vscode.Selection(cursorPrePos, cursorPrePos)

  //   // vscode.commands.executeCommand("jsdoc-comment-toggler.toggle")
  //   await Extension.toggleJSDocComment()

  //   // verify textual content
  //   assert.strictEqual(
  //     editor.document.getText(),
  //     result,
  //     "incorrect textual content"
  //   )

  //   // verify cursor & selection positions
  //   assertEditorCursorEquals(editor, cursorPrePos.translate(0, 4))
  //   assertEditorAnchorEquals(editor, cursorPrePos.translate(0, 4))

  //   await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
  // })
})

const sleep = (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

const getUri = (directory: string, fileName: string) =>
  path.join(__dirname, directory, fileName)

const loadFile = async (
  fileName: string
): Promise<[vscode.TextEditor, string]> => {
  const testUri = getUri(testsFolder, fileName)
  const resultUri = getUri(resultsFolder, fileName)

  const result = fs.readFileSync(resultUri, { encoding: "utf-8" })

  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.file(testUri)
  )
  const editor = await vscode.window.showTextDocument(document)
  await sleep(500)
  // await new Promise(resolve => setTimeout(resolve, 500));
  return [editor, result]
}
