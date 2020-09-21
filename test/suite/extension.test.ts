import * as fs from "fs"
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* global suite, test */

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

  assert.strictEqual(cursorPos.line, target.line, "cursor on incorrect line")
  assert.strictEqual(
    cursorPos.character,
    target.character,
    "cursor at incorrect pos"
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
    "anchor (other end of selection) on incorrect line"
  )
  assert.strictEqual(
    anchorPos.character,
    target.character,
    "anchor (other end of selection) at incorrect pos"
  )
}

suite("Single Line Comment Tests", () => {
  vscode.window.showInformationMessage("Start all Single Line tests.")

  test("Add when cursor in middle", async () => {
    const [editor, result] = await loadFile("singleAdd.js")
    const cursorBeforePos = editor.selection.active.translate(1, 3)
    editor.selection = new vscode.Selection(cursorBeforePos, cursorBeforePos)

    // vscode.commands.executeCommand("jsdoc-comment-toggler.toggle")
    await Extension.toggleJSDocComment()

    // verify textual content
    assert.strictEqual(
      editor.document.getText(),
      result,
      "incorrect textual content"
    )

    // verify cursor & selection positions
    assertEditorCursorEquals(editor, cursorBeforePos.translate(0, 4))
    assertEditorAnchorEquals(editor, cursorBeforePos.translate(0, 4))

    vscode.commands.executeCommand("workbench.action.closeActiveEditor")
  })
  // test("Add when cursor or selection is at end", async () => {
  //   const [editor, result] = await loadFile("singleAddSelectionBefore.js")
  //   const cursorBeforePos = editor.selection.active.translate(1, 1)
  //   editor.selection = new vscode.Selection(cursorBeforePos, cursorBeforePos)

  //   vscode.commands.executeCommand("workbench.action.closeActiveEditor")
  // })
  test("Add when cursor or selection is before first non-whitespace", async () => {
    const [editor, result] = await loadFile("singleAddSelectionBefore.js")
    const cursorBeforePos = new vscode.Position(1, 1)
    editor.selection = new vscode.Selection(cursorBeforePos, cursorBeforePos)
    console.log("editor.selection", editor.selection)

    await Extension.toggleJSDocComment()

    // verify textual content
    console.log("result", result)
    assert.strictEqual(
      editor.document.getText(),
      result,
      "incorrect textual content"
    )

    // verify cursor & selection positions
    assertEditorCursorEquals(editor, cursorBeforePos)
    assertEditorAnchorEquals(editor, cursorBeforePos)

    vscode.commands.executeCommand("workbench.action.closeActiveEditor")
  })
  // test("Remove", async () => {
  //   const [editor, result] = await loadFile("singleRemove.js")
  // const cursorBeforePos = editor.selection.active.translate(1, 3)
  //   vscode.commands.executeCommand("workbench.action.closeActiveEditor")
  // })
})

suite("Multi Line Comment Tests", () => {
  vscode.window.showInformationMessage("Start all Multi Line tests.")

  // test("Add", async () => {
  //   const editor = await loadFile("multiAdd.js")
  //   assert.strictEqual(editor.document.getText(), -1)
  // })
  // test("Add when cursor or selection is before first non-whitespace of line", async () => {
  //   const editor = await loadFile("multiAddSelectionBefore.js")
  //   assert.strictEqual(editor.document.getText(), -1)
  // })
  // test("Add when cursor or selection is at end", async () => {
  //   const editor = await loadFile("multiAddSelectionEnd.js")
  //   assert.strictEqual(editor.document.getText(), -1)
  // })
  // test("Remove when all lines, including open and close tags, are selected", async () => {
  //   const editor = await loadFile("multiRemoveSelectionFull.js")
  //   assert.strictEqual(editor.document.getText(), -1)
  // })
  // test("Remove when either or both of the start and end tags are not selected", async () => {
  //   const editor = await loadFile("multiRemoveSelectionInner.js")
  //   assert.strictEqual(editor.document.getText(), -1)
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
