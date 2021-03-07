import * as vscode from "vscode" // eslint-disable-line import/no-unresolved

const DEBUG = process.env.DEBUG_EXTENSION === "true"

// regexes
const LINE_COMMENT_TAG = /\/\//
const JSDOC_START_TAG = /\/\*\*\s?/
const JSDOC_END_TAG = /\s?\*\//
const JSDOC_LINE_CHAR = /\s\*\s/

export const log = (...messages: unknown[]): void => {
  if (DEBUG) {
    console.log(...messages) // NOSONAR
  }
}

/**
 * helper to guarantee the active editor is defined.
 *
 * guards against an invariant state by yeeting the entire extension when no editor
 *
 * should **NOT** be possible to ever trigger
 *
 * @returns currently visible editor, safely
 */
export const getEditor = (): vscode.TextEditor => {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    throw new Error("no active editor, make sure a file is open")
  }
  return editor
}

const setCursorSelection = (selection: vscode.Selection) => {
  if (!getEditor().selection.active.isEqual(selection.active)) {
    log(
      `adjusting cursor: [${getEditor().selection.active.line}, ${
        getEditor().selection.active.character
      }] => [${selection.active.line}, ${selection.active.character}]`
    )
  }

  if (
    hasSelection(getEditor()) &&
    !getEditor().selection.anchor.isEqual(selection.anchor)
  ) {
    log(
      `adjusting anchor: [${getEditor().selection.anchor.line}, ${
        getEditor().selection.anchor.character
      }] => [${selection.anchor.line}, ${selection.anchor.character}]`
    )
  }

  getEditor().selection = selection
}

/**
 * @param line - input
 * @returns the line directly proceeding the input
 */
const getPrevLine = (line: vscode.TextLine | number): vscode.TextLine =>
  getEditor().document.lineAt(
    (typeof line !== "number" ? line.lineNumber : line) - 1
  )

/**
 * @param line - input
 * @returns the line directly following the input
 */
const getNextLine = (line: vscode.TextLine | number): vscode.TextLine =>
  getEditor().document.lineAt(
    (typeof line === "number" ? line : line.lineNumber) + 1
  )

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
  new vscode.Position(
    typeof line === "number" ? line : line.lineNumber,
    (typeof line === "number"
      ? getEditor().document.lineAt(line)
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
  (typeof line === "number" ? getEditor().document.lineAt(line) : line).range
    .end

// #region - fix cursor / selection pos
/**
 * if cursor was at end of last line, the comment tag is errantly placed
 * before the cursor. this moves the comment tag after the cursor, keeping the
 * cursor in the original position before the JSDoc was inserted
 * vscode doesn't have the ability to add to line index greater than max
 *
 * @param isSingleLineComment - precalculated
 */
const adjustCursorPos = (isSingleLineComment: boolean) => {
  const editor = getEditor()
  const cursorPos = editor.selection.active

  // adjust single line comment cursor
  if (isSingleLineComment) {
    if (cursorPos.isEqual(getContentEndPos(cursorPos.line))) {
      // https://code.visualstudio.com/api/references/commands
      vscode.commands.executeCommand("cursorMove", {
        to: "left",
        by: "character",
        value: 3,
        select: false,
      })
    } else if (hasSelection(editor)) {
      // any selection
      const adjustedSelectionEndPos = editor.selection.end.translate(0, -3)

      const isCursorAtEnd = cursorPos.isEqual(editor.selection.end)

      setCursorSelection(
        new vscode.Selection(
          isCursorAtEnd ? editor.selection.start : adjustedSelectionEndPos,
          isCursorAtEnd ? adjustedSelectionEndPos : editor.selection.start
        )
      )
    } else {
      //  no selection, cursor somewhere in the middle
      //  no adjustment needed
    }
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

      setCursorSelection(
        new vscode.Selection(
          isCursorAtEnd ? editor.selection.start : adjustedSelectionEndPos,
          isCursorAtEnd ? adjustedSelectionEndPos : editor.selection.start
        )
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

      setCursorSelection(
        new vscode.Selection(
          isCursorAtStart ? editor.selection.end : adjustedSelectionStartPos,
          isCursorAtStart ? adjustedSelectionStartPos : editor.selection.end
        )
      )
    }
  }
}

/**
 * primary extension action, removes the JSDoc tags on selected lines if present or inserts
 * a JSDoc wrapping the selected lines of text comment
 *
 * @returns once edit is complete
 */
export const toggleJSDocComment = async (): Promise<boolean> => {
  const editor = getEditor()

  let lineFirst = editor.document.lineAt(editor.selection.start.line)
  let lineLast = editor.document.lineAt(editor.selection.end.line)

  const isSingleLineComment = lineFirst.lineNumber === lineLast.lineNumber

  let jsdocStart = lineFirst.text.match(JSDOC_START_TAG)
  let jsdocEnd = lineLast.text.match(JSDOC_END_TAG)

  // fix multiline selection when open or close tag not selected
  // use start tag on prev line if it exists
  if (!jsdocStart && lineFirst.lineNumber !== 0) {
    const lineBefore = getPrevLine(lineFirst)
    const jsdocMatch = lineBefore.text.match(JSDOC_START_TAG)
    if (jsdocMatch) {
      lineFirst = lineBefore
      jsdocStart = jsdocMatch
    }
  }

  // use end tag on prev line if it exists
  if (!jsdocEnd && lineLast.lineNumber !== editor.document.lineCount - 1) {
    const lineAfter = getNextLine(lineLast)
    const jsdocMatch = lineAfter.text.match(JSDOC_END_TAG)
    if (jsdocMatch) {
      lineLast = lineAfter
      jsdocEnd = jsdocMatch
    }
  }

  // construct and trigger single batch of changes
  return editor.edit((editBuilder) => {
    // #region - remove single line jsdoc, no selection or selection
    if (
      isSingleLineComment &&
      jsdocStart?.index !== undefined &&
      jsdocEnd?.index !== undefined &&
      new vscode.Range(
        lineFirst.lineNumber,
        jsdocStart.index,
        lineLast.lineNumber,
        jsdocEnd.index + jsdocEnd[0].length
      ).contains(getEditor().selection.active)
    ) {
      log("removing single line jsdoc")

      // internal
      if (
        jsdocEnd.index + jsdocEnd[0].length ===
        getContentEndPos(lineLast).character
      ) {
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
      } else {
        // trailing
        editBuilder.replace(
          new vscode.Range(
            lineFirst.lineNumber,
            jsdocStart.index,
            lineFirst.lineNumber,
            jsdocStart.index + jsdocStart[0].length
          ),
          "/* "
        )
      }

      return
    }

    // #region - remove multi line jsdoc
    if (!isSingleLineComment && jsdocStart?.index && jsdocEnd?.index) {
      log("removing multi line jsdoc")
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

        if (jsdocComment?.index) {
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
      }
      // handled removing existing jsdoc, job done
      return
    }

    // #region - no jsdoc exists
    if (isSingleLineComment) {
      const lineCommentTag = lineFirst.text.match(LINE_COMMENT_TAG)
      const isLineCommentFullLine =
        lineFirst.firstNonWhitespaceCharacterIndex === lineCommentTag?.index

      if (hasSelection(editor)) {
        // TODO: implement this
        // editBuilder.insert(editor.selection.start, "/** ")
        // editBuilder.insert(editor.selection.end, " */")
        if (isSingleLineComment) {
          return
        }
      } else {
        log("inserting single line jsdoc")

        if (lineCommentTag) {
          const firstChar = getEditor().document.getText(
            new vscode.Range(
              lineFirst.lineNumber,
              lineFirst.firstNonWhitespaceCharacterIndex +
                lineCommentTag[0].length,
              lineFirst.lineNumber,
              lineFirst.firstNonWhitespaceCharacterIndex +
                lineCommentTag[0].length +
                1
            )
          )

          const indent = " ".repeat(lineFirst.firstNonWhitespaceCharacterIndex)
          editBuilder.replace(
            new vscode.Range(
              lineFirst.lineNumber,
              0,
              lineFirst.lineNumber,
              lineFirst.firstNonWhitespaceCharacterIndex +
                lineCommentTag[0].length
            ),
            ""
          )
          editBuilder.insert(
            new vscode.Position(lineFirst.lineNumber, 0),
            `${indent}/**${firstChar !== " " ? " " : ""}`
          )

          if (isLineCommentFullLine) {
            const lastChar = getEditor().document.getText(
              new vscode.Range(
                getContentEndPos(lineFirst).translate(0, -1),
                getContentEndPos(lineFirst)
              )
            )

            editBuilder.insert(
              getContentEndPos(lineFirst),
              `${lastChar && lastChar !== " " ? " " : ""}*/`
            )
          }

          // no line or block comment already exists
        } else {
          const adjacentRange = new vscode.Range(
            getEditor().selection.active.line,
            Math.max(getEditor().selection.active.character - 1, 0),
            getEditor().selection.active.line,
            getEditor().selection.active.character + 1
          )
          const adjacentChars = getEditor().document.getText(adjacentRange)

          if (
            getEditor().selection.active.character === 0 ||
            adjacentChars === "  "
          ) {
            editBuilder.insert(getEditor().selection.active, "/** ")
            editBuilder.replace(
              new vscode.Range(
                getEditor().selection.active,
                getEditor().selection.active.translate(0, 1)
              ),
              ` */${adjacentChars[0] && adjacentChars[0] !== " " ? " " : ""}${
                adjacentChars[0] ? adjacentChars[0] : ""
              }`
            )
          } else {
            const indent = " ".repeat(
              lineFirst.firstNonWhitespaceCharacterIndex
            )
            const prevChars = getEditor().document.getText(
              new vscode.Range(
                new vscode.Position(getEditor().selection.active.line, 0),
                getEditor().selection.active
              )
            )

            editBuilder.replace(
              new vscode.Range(
                new vscode.Position(getEditor().selection.active.line, 0),
                getEditor().selection.active
              ),
              `/** `
            )
            editBuilder.replace(
              new vscode.Range(
                getEditor().selection.active,
                getEditor().selection.active.translate(0, 1)
              ),
              ` */\n${indent}${prevChars}${
                adjacentChars[1] ? adjacentChars[1] : ""
              }`
            )
          }
        }
      }

      adjustCursorPos(isSingleLineComment)

      return
    }

    // #region - insert multi line comment
    log("inserting multi line jsdoc")
    const indentation = " ".repeat(lineFirst.firstNonWhitespaceCharacterIndex)
    editBuilder.insert(getContentStartPos(lineFirst), `/**\n${indentation}`)
    // target all lines between opening tag exclusive and closing tag inclusive
    for (let i = lineFirst.lineNumber; i <= lineLast.lineNumber; i += 1) {
      const line = getEditor().document.lineAt(i)
      log("line", line)
      if (line) {
        const contentStart = line.text.slice(
          line.firstNonWhitespaceCharacterIndex
        )
        const commentTag = contentStart.match(LINE_COMMENT_TAG)
        if (commentTag) {
          editBuilder.replace(
            new vscode.Range(
              line.lineNumber,
              line.firstNonWhitespaceCharacterIndex,
              line.lineNumber,
              line.firstNonWhitespaceCharacterIndex + commentTag[0].length
            ),
            " * "
          )
        } else {
          editBuilder.insert(getContentStartPos(line), " * ")
        }
      }
    }

    editBuilder.insert(getContentEndPos(lineLast), `\n${indentation} */`)
  })
}

export const activate = (context: vscode.ExtensionContext): void => {
  // REVIEW: consider using `registerTextEditorCommand`
  const disposable = vscode.commands.registerCommand(
    "jsdoc-comment-toggler.toggle",
    toggleJSDocComment
  )

  if (DEBUG) {
    vscode.window.showInformationMessage("jsdoc comment toggler loaded")
  }

  context.subscriptions.push(disposable)
}
