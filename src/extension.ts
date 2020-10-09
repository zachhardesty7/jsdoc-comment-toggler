import * as vscode from "vscode" // eslint-disable-line import/no-unresolved

const DEBUG = false

// regexes
const JSDOC_START_TAG = /\/\*\*\s?/
const JSDOC_END_TAG = /\s?\*\//
const JSDOC_LINE_CHAR = /\s\*\s/

/**
 * helper to yeet the entire extension when no editor, should **NOT** be possible to
 * ever trigger
 */
const throwMissingEditor = () => {
  throw new Error("no vscode active editor")
}

export const log = (...messages: unknown[]): void => {
  if (DEBUG) {
    console.log(messages)
  }
}

/**
 * @param line - input
 * @returns the line directly proceeding the input
 */
const getPrevLine = (line: vscode.TextLine | number): vscode.TextLine =>
  vscode.window.activeTextEditor?.document.lineAt(
    (typeof line !== "number" ? line.lineNumber : line) - 1
  ) ?? throwMissingEditor()

/**
 * @param line - input
 * @returns the line directly following the input
 */
const getNextLine = (line: vscode.TextLine | number): vscode.TextLine =>
  vscode.window.activeTextEditor?.document.lineAt(
    (typeof line === "number" ? line : line.lineNumber) + 1
  ) ?? throwMissingEditor()

/**
 * @param editor - vscode's currently active text editor
 * @returns whether any text is currently selected
 */
const hasSelection = (editor: vscode.TextEditor): boolean =>
  !editor.selection.active.isEqual(editor.selection.anchor)

/**
 * @param line - target
 * @returns position of first non-whitespace character on target line
 */
const getContentStartPos = (line: vscode.TextLine | number): vscode.Position =>
  !vscode.window.activeTextEditor
    ? throwMissingEditor()
    : new vscode.Position(
        typeof line === "number" ? line : line.lineNumber,
        (typeof line === "number"
          ? vscode.window.activeTextEditor.document.lineAt(line)
          : line
        ).firstNonWhitespaceCharacterIndex
      )

/**
 * @param line - target
 * @returns position of last character on target line
 */
export const getContentEndPos = (
  line: vscode.TextLine | number
): vscode.Position =>
  (typeof line === "number"
    ? vscode.window.activeTextEditor?.document.lineAt(line)
    : line
  )?.range.end ?? throwMissingEditor()

/**
 * primary extension action, removes the JSDoc tags on selected lines if present or inserts
 * a JSDoc wrapping the selected lines of text comment
 */
export const toggleJSDocComment = async (): Promise<void> => {
  const editor = vscode.window.activeTextEditor
  if (!editor) return

  let lineFirst = editor.document.lineAt(editor.selection.start.line)
  let lineLast = editor.document.lineAt(editor.selection.end.line)

  const isSingleLineComment = lineFirst.lineNumber === lineLast.lineNumber

  let jsdocStart = lineFirst.text.match(JSDOC_START_TAG)
  let jsdocEnd = lineLast.text.match(JSDOC_END_TAG)

  // fix multiline selection when open or close tag no selected
  // use start tag on prev line if it exists
  if (!jsdocStart) {
    const lineBefore = getPrevLine(lineFirst)
    const jsdocMatch = lineBefore.text.match(JSDOC_START_TAG)
    if (jsdocMatch) {
      lineFirst = lineBefore
      jsdocStart = jsdocMatch
    }
  }

  // use end tag on prev line if it exists
  if (!jsdocEnd) {
    const lineAfter = getNextLine(lineLast)
    const jsdocMatch = lineAfter.text.match(JSDOC_END_TAG)
    if (jsdocMatch) {
      lineLast = lineAfter
      jsdocEnd = jsdocMatch
    }
  }

  // #region - remove jsdoc tags (preserves comment body)
  // const wasRemoveSuccessful =
  await editor.edit((editBuilder) => {
    if (!jsdocStart?.index || !jsdocEnd?.index) return

    // remove single line comment, no selection or selection
    if (isSingleLineComment) {
      editBuilder.replace(
        new vscode.Range(
          lineFirst.lineNumber,
          jsdocStart.index,
          lineFirst.lineNumber,
          jsdocStart.index + jsdocStart[0].length
        ),
        "// "
      )
      editBuilder.delete(
        new vscode.Range(
          lineLast.lineNumber,
          jsdocEnd.index,
          lineLast.lineNumber,
          jsdocEnd.index + jsdocEnd[0].length
        )
      )

      return
    }

    // remove multi line comment
    // open & close tags (first and last line)
    editBuilder.delete(lineFirst.rangeIncludingLineBreak)
    editBuilder.delete(lineLast.rangeIncludingLineBreak)

    // continuation comment line's *s
    for (
      let i = lineFirst.lineNumber + 1;
      i <= lineLast.lineNumber - 1;
      i += 1
    ) {
      const line = editor.document.lineAt(i)
      const jsdocComment = line.text.match(JSDOC_LINE_CHAR)

      if (jsdocComment?.index)
        editBuilder.replace(
          new vscode.Range(
            line.lineNumber,
            jsdocComment.index,
            line.lineNumber,
            jsdocComment.index + 3
          ),
          "// "
        )
    }
  })

  // handled removing existing jsdoc, job done
  if (jsdocStart && jsdocEnd) {
    return
    // TODO: rarely need to move cursor during multiline deletion
    // if (!isSingleLineComment && wasRemoveSuccessful) {
    // }
  }

  // #region - insert jsdoc tags, none already exists
  const wasInsertSuccessful = await editor.edit((editBuilder) => {
    // insert single line comment
    if (isSingleLineComment) {
      if (hasSelection(editor)) {
        editBuilder.insert(editor.selection.start, "/** ")
        editBuilder.insert(editor.selection.end, " */")
      } else {
        // no selection
        editBuilder.insert(getContentStartPos(lineFirst), "/** ")
        editBuilder.insert(getContentEndPos(lineLast), " */")
      }

      return
    }

    // insert multi line comment
    // target all lines between opening tag exclusive and closing tag inclusive
    for (let i = lineFirst.lineNumber + 1; i <= lineLast.lineNumber; i += 1) {
      editBuilder.insert(getContentStartPos(i), " * ")
    }

    const indentation = " ".repeat(lineFirst.firstNonWhitespaceCharacterIndex)

    editBuilder.insert(getContentStartPos(lineFirst), `/**\n${indentation} * `)
    editBuilder.insert(getContentEndPos(lineLast), `\n${indentation} */`)
  })

  // if cursor was at end of last line, the comment tag is errantly placed
  // before the cursor. this moves the comment tag after the cursor, keeping the
  // cursor in the original position before the JSDoc was inserted
  // vscode doesn't have the ability to add to line index greater than max
  // #region - fix cursor / selection pos
  if (!wasInsertSuccessful) return
  const cursorPos = editor.selection.active

  // adjust single line comment cursor
  if (isSingleLineComment) {
    if (hasSelection(editor)) {
      // any selection
      const adjustedSelectionEndPos = editor.selection.end.translate(0, -3)

      const isCursorAtEnd = cursorPos.isEqual(editor.selection.end)
      editor.selection = new vscode.Selection(
        isCursorAtEnd ? editor.selection.start : adjustedSelectionEndPos,
        isCursorAtEnd ? adjustedSelectionEndPos : editor.selection.start
      )
    } else if (cursorPos.isEqual(getContentEndPos(cursorPos.line))) {
      // no selection, cursor at end of line
      const adjustedSelectionEndPos = editor.selection.end.translate(0, -3)

      editor.selection = new vscode.Selection(
        adjustedSelectionEndPos,
        adjustedSelectionEndPos
      )
    }
    // else {
    //  no selection, cursor somewhere in the middle
    //  no adjustment needed
    // }
  } else {
    // adjust multiline comment cursor
    // selection ends at end of line
    if (
      editor.selection.end.isAfterOrEqual(
        getContentEndPos(editor.selection.end.line)
      )
    ) {
      const adjustedSelectionEndPos = getContentEndPos(
        editor.selection.end.line - 1
      )

      // ensure cursor is at original side of the selection
      const isCursorAtEnd = cursorPos.isEqual(editor.selection.end)
      editor.selection = new vscode.Selection(
        isCursorAtEnd ? editor.selection.start : adjustedSelectionEndPos,
        isCursorAtEnd ? adjustedSelectionEndPos : editor.selection.start
      )
    }

    // selection starts before first non-whitespace char of line
    if (
      editor.selection.start.isBefore(
        getContentStartPos(editor.selection.start.line)
      )
    ) {
      const adjustedSelectionStartPos = getContentStartPos(
        editor.selection.start.line + 1
      ).translate(0, 2)

      // ensure cursor is at same side of selection
      const isCursorAtStart = cursorPos.isEqual(editor.selection.start)
      editor.selection = new vscode.Selection(
        isCursorAtStart ? editor.selection.end : adjustedSelectionStartPos,
        isCursorAtStart ? adjustedSelectionStartPos : editor.selection.end
      )
    }
  }
}

export const activate = (context: vscode.ExtensionContext): void => {
  const disposable = vscode.commands.registerCommand(
    "jsdoc-comment-toggler.toggle",
    toggleJSDocComment
  )

  context.subscriptions.push(disposable)
}
