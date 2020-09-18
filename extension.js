const vscode = require("vscode")

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

const JSDOC_START_TAG = /\/\*\*\s?/
const JSDOC_END_TAG = /\s?\*\//

/**
 * @param {vscode.ExtensionContext} context - default param
 */
function activate(context) {
  const disposable = vscode.commands.registerCommand(
    "jsdoc-commenter.toggle",
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

      // remove jsdoc tags (preserves comment body)
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

          // continuation comment line *'s
          for (
            let i = lineFirst.lineNumber + 1;
            i <= lineLast.lineNumber - 1;
            i += 1
          ) {
            const line = editor.document.lineAt(i)
            const jsdocComment = line.text.match(/\s\*\s/)
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

      // TODO: wrap exact selection when it's only 1 line

      // add comment tags
      const wasInsertSuccessful = await editor.edit((editBuilder) => {
        // single line comment, no selection & selection
        if (lineFirst.lineNumber === lineLast.lineNumber) {
          const contentStart = new vscode.Position(
            lineFirst.lineNumber,
            lineFirst.firstNonWhitespaceCharacterIndex
          )
          const contentEnd = lineLast.range.end

          editBuilder.insert(contentStart, "/** ")
          editBuilder.insert(contentEnd, " */")

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
          // const jsdocComment = line.text.match(/\\s\\+s/)
          const contentStart = new vscode.Position(
            line.lineNumber,
            line.firstNonWhitespaceCharacterIndex
          )

          editBuilder.insert(contentStart, " * ")
        }

        const contentStart = new vscode.Position(
          lineFirst.lineNumber,
          lineFirst.firstNonWhitespaceCharacterIndex
        )
        const contentEnd = lineLast.range.end
        const indentation = " ".repeat(
          lineFirst.firstNonWhitespaceCharacterIndex
        )

        editBuilder.insert(contentStart, `/**\n${indentation} * `)
        editBuilder.insert(contentEnd, `\n${indentation} */`)
      })

      // if cursor was at end of last line, the comment tag is errantly placed
      // before the cursor. this moves the comment tag after the cursor, keeping the
      // cursor in the original position before the JSDoc was added
      // vscode doesn't have the ability to add to line index greater than max
      const cursorPos = editor.selection.active
      const anchorPos = editor.selection.anchor

      if (!wasInsertSuccessful) return

      // single line comment
      if (lineFirst.lineNumber === lineLast.lineNumber) {
        // selection is at end of line it's on
        if (
          editor.selection.end.isAfterOrEqual(
            editor.document.lineAt(editor.selection.end).range.end
          )
        ) {
          const adjustedSelectionEndPos = editor.selection.end.translate(0, -3)

          if (cursorPos.isEqual(anchorPos)) {
            editor.selection = new vscode.Selection(
              adjustedSelectionEndPos,
              adjustedSelectionEndPos
            )
          } else {
            // ensure cursor is at same side of selection
            const isCursorAtEnd = cursorPos.isEqual(editor.selection.end)
            editor.selection = new vscode.Selection(
              isCursorAtEnd ? editor.selection.start : adjustedSelectionEndPos,
              isCursorAtEnd ? adjustedSelectionEndPos : editor.selection.start
            )
          }
        }
      } else {
        // multiline comment
        // selection ends at end of line
        if (
          editor.selection.end.isAfterOrEqual(
            editor.document.lineAt(editor.selection.end).range.end
          )
        ) {
          const adjustedSelectionEndPos = getPrevLine(editor.selection.end.line)
            .range.end

          // ensure cursor is at same side of selection
          const isCursorAtEnd = cursorPos.isEqual(editor.selection.end)
          editor.selection = new vscode.Selection(
            isCursorAtEnd ? editor.selection.start : adjustedSelectionEndPos,
            isCursorAtEnd ? adjustedSelectionEndPos : editor.selection.start
          )
        }

        // selection starts before first non-whitespace char of line
        if (
          editor.selection.start.isBefore(
            new vscode.Position(
              editor.selection.start.line,
              editor.document.lineAt(
                editor.selection.start
              ).firstNonWhitespaceCharacterIndex
            )
          )
        ) {
          const adjustedSelectionStartLine = getNextLine(
            editor.selection.start.line
          )
          const adjustedSelectionStartPos = new vscode.Position(
            adjustedSelectionStartLine.lineNumber,
            adjustedSelectionStartLine.firstNonWhitespaceCharacterIndex + 2
          )

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
