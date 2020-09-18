const vscode = require("vscode")

// regexes
const JSDOC_START_TAG = /\/\*\*\s?/
const JSDOC_END_TAG = /\s?\*\//
const JSDOC_LINE_CHAR = /\s\*\s/

/**
 * @param {vscode.TextLine | number} line - input
 * @returns {vscode.TextLine} output
 */
const getPrevLine = (line) =>
  vscode.window.activeTextEditor.document.lineAt(
    (typeof line !== "number" ? line.lineNumber : line) - 1
  )

/**
 * @param {vscode.TextLine | number} line - input
 * @returns {vscode.TextLine} output
 */
const getNextLine = (line) =>
  vscode.window.activeTextEditor.document.lineAt(
    (typeof line !== "number" ? line.lineNumber : line) + 1
  )

/**
 * @param {vscode.TextEditor} editor - context
 * @returns {boolean} is any text selected
 */
const hasSelection = (editor) =>
  !editor.selection.active.isEqual(editor.selection.anchor)

/**
 * @param {vscode.TextLine} line - input
 * @returns {vscode.Position} first non whitespace position
 */
const getContentStartPos = (line) =>
  new vscode.Position(line.lineNumber, line.firstNonWhitespaceCharacterIndex)

/**
 * @param {vscode.TextLine} line - input
 * @returns {vscode.Position} first non whitespace position
 */
const getContentEndPos = (line) => line.range.end

/**
 * @param {vscode.ExtensionContext} context - default param
 */
function activate(context) {
  const disposable = vscode.commands.registerCommand(
    "jsdoc-comment-toggler.toggle",
    async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) return

      let lineFirst = editor.document.lineAt(editor.selection.start.line)
      let lineLast = editor.document.lineAt(editor.selection.end.line)

      let jsdocStart = lineFirst.text.match(JSDOC_START_TAG)
      let jsdocEnd = lineLast.text.match(JSDOC_END_TAG)

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

      // #region - rm jsdoc tags (preserves comment body)
      if (jsdocStart && jsdocEnd) {
        editor.edit((editBuilder) => {
          // single line comment, no selection & selection
          if (lineFirst.lineNumber === lineLast.lineNumber) {
            editBuilder.delete(
              new vscode.Range(
                lineFirst.lineNumber,
                jsdocStart.index,
                lineFirst.lineNumber,
                jsdocStart.index + jsdocStart[0].length
              )
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

          // multi line comment
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
            editBuilder.delete(
              new vscode.Range(
                line.lineNumber,
                jsdocComment.index,
                line.lineNumber,
                jsdocComment.index + 3
              )
            )
          }
        })

        return
      }

      // #region - add jsdoc tags
      const wasInsertSuccessful = await editor.edit((editBuilder) => {
        // single line comment
        if (lineFirst.lineNumber === lineLast.lineNumber) {
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

        // multi line comment
        // target all lines between opening tag exclusive and closing tag inclusive
        for (
          let i = lineFirst.lineNumber + 1;
          i <= lineLast.lineNumber;
          i += 1
        ) {
          const line = editor.document.lineAt(i)
          editBuilder.insert(getContentStartPos(line), " * ")
        }

        const indentation = " ".repeat(
          lineFirst.firstNonWhitespaceCharacterIndex
        )

        editBuilder.insert(
          getContentStartPos(lineFirst),
          `/**\n${indentation} * `
        )
        editBuilder.insert(getContentEndPos(lineLast), `\n${indentation} */`)
      })

      // if cursor was at end of last line, the comment tag is errantly placed
      // before the cursor. this moves the comment tag after the cursor, keeping the
      // cursor in the original position before the JSDoc was added
      // vscode doesn't have the ability to add to line index greater than max
      // #region - fix cursor / selection pos
      if (!wasInsertSuccessful) return
      const cursorPos = editor.selection.active

      // single line comment
      if (lineFirst.lineNumber === lineLast.lineNumber) {
        const adjustedSelectionEndPos = editor.selection.end.translate(0, -3)

        if (hasSelection(editor)) {
          // any selection
          const isCursorAtEnd = cursorPos.isEqual(editor.selection.end)
          editor.selection = new vscode.Selection(
            isCursorAtEnd ? editor.selection.start : adjustedSelectionEndPos,
            isCursorAtEnd ? adjustedSelectionEndPos : editor.selection.start
          )
        } else if (
          cursorPos.isEqual(getContentEndPos(editor.document.lineAt(cursorPos)))
        ) {
          // no selection but cursor at end of line
          editor.selection = new vscode.Selection(
            adjustedSelectionEndPos,
            adjustedSelectionEndPos
          )
        }
      } else {
        // multiline comment
        // selection ends at end of line
        if (
          editor.selection.end.isAfterOrEqual(
            getContentEndPos(editor.document.lineAt(editor.selection.end))
          )
        ) {
          const adjustedSelectionEndPos = getContentEndPos(
            getPrevLine(editor.selection.end.line)
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
            getContentStartPos(editor.document.lineAt(editor.selection.start))
          )
        ) {
          const adjustedSelectionStartLine = getNextLine(
            editor.selection.start.line
          )
          const adjustedSelectionStartPos = getContentStartPos(
            adjustedSelectionStartLine
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
  )

  context.subscriptions.push(disposable)
}
exports.activate = activate

function deactivate() {}

module.exports = {
  activate,
  deactivate,
}
