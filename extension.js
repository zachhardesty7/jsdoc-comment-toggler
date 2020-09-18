const vscode = require("vscode")

/**
 * @param {vscode.ExtensionContext} context - default param
 */
function activate(context) {
  const disposable = vscode.commands.registerCommand(
    "jsdoc-commenter.toggle",
    async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) return

      const lineFirst = editor.document.lineAt(editor.selection.start.line)
      const lineLast = editor.document.lineAt(editor.selection.end.line)

      const jsdocStart = lineFirst.text.match(/\/\*\*\s?/)
      const jsdocEnd = lineLast.text.match(/\s?\*\//)

      // remove JSDoc comment chars if present (preserves comment body)
      if (jsdocStart && jsdocEnd) {
        editor.edit((editBuilder) => {
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

          const startPosStart = new vscode.Position(
            lineFirst.lineNumber,
            jsdocStart.index
          )
          const startPosEnd = new vscode.Position(
            lineFirst.lineNumber,
            jsdocStart.index + jsdocStart[0].length
          )
          const endPosStart = new vscode.Position(
            lineLast.lineNumber,
            jsdocEnd.index
          )
          const endPosEnd = new vscode.Position(
            lineLast.lineNumber,
            jsdocEnd.index + jsdocEnd[0].length
          )

          editBuilder.delete(new vscode.Range(startPosStart, startPosEnd))
          editBuilder.delete(new vscode.Range(endPosStart, endPosEnd))

          for (
            let i = lineFirst.lineNumber + 1;
            i <= lineLast.lineNumber - 1;
            i += 1
          ) {
            const line = editor.document.lineAt(i)
            const jsdocComment = line.text.match(/\\s\\+s/)
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

      // commit changes
      const editStatus = await editor.edit((editBuilder) => {
        // single line comment, no selection
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

        // if cursor was at end of last line, the comment tag is incorrectly placed
        // after the cursor. this moves the cursor back inside the comment
      })
      // if (
      //   editStatus &&
      //   lineLast.lineNumber === editor.selection.active.line &&
      //   editor.selection.active.isAfterOrEqual(end)
      // ) {
      //   const cursorPos = editor.selection.active
      //   const newPos = cursorPos.translate(0, -3)
      //   editor.selection = new vscode.Selection(newPos, newPos)
      // }
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
