// useful API pages
// https://code.visualstudio.com/api/references/vscode-api#TextEditor
// https://code.visualstudio.com/api/references/vscode-api#TextDocument
// https://code.visualstudio.com/api/references/vscode-api#TextLine
// https://code.visualstudio.com/api/references/vscode-api#Selection
// https://code.visualstudio.com/api/references/vscode-api#Position
// https://code.visualstudio.com/api/references/vscode-api#Range

import * as vscode from "vscode" // eslint-disable-line import/no-unresolved

const DEBUG = process.env.DEBUG_EXTENSION === "true"

/** zero width space that essentially brands changes made by this extension */
const MAGIC_CHARACTER = "​"

// regexes
const LINE_COMMENT_TAG = "//"
const BLOCK_COMMENT_START_TAG = "/*"
const BLOCK_COMMENT_END_TAG = "*/"
const JSDOC_START_TAG = "/**"
const JSDOC_END_TAG = "*/"
const JSDOC_LINE_CHAR = "*"
const JSDOC_START_REGEX = /\/\*\*\s?/
const JSDOC_END_REGEX = /\s?\*\//
const JSDOC_LINE_CHAR_REGEX = /\s\*\s/

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

/**
 * @param line - target
 * @returns concatenated value of indentation on target line
 */
export const getIndentation = (line: vscode.TextLine | number): string => {
  const currentLine =
    typeof line === "number" ? getEditor().document.lineAt(line) : line
  return getEditor().document.getText(
    currentLine.range.with({
      end: currentLine.range.end.with({
        character: currentLine.firstNonWhitespaceCharacterIndex,
      }),
    })
  )
}

// #region - fix cursor / selection pos
/**
 * if cursor was at end of last line, the comment tag is errantly placed
 * before the cursor. this moves the comment tag after the cursor, keeping the
 * cursor in the original position before the JSDoc was inserted
 * vscode doesn't have the ability to add to line index greater than max
 *
 * @param isSingleLineComment - precalculated
 * @deprecated - inaccurate results if called _during_ a textEdit. if called _after_, the
 * cursor movement is noticeable and somewhat slow
 */
const adjustCursorPos = async (isSingleLineComment: boolean) => {
  const editor = getEditor()
  const cursorPos = editor.selection.active

  // adjust single line comment cursor
  if (isSingleLineComment) {
    // if (
    //   editor.selection.end.isEqual(getContentEndPos(editor.selection.end.line))
    // ) {
    //   if (editor.selection.anchor.isAfter(editor.selection.active)) {
    //     editor.selection = new vscode.Selection(
    //       editor.selection.anchor.translate({ characterDelta: -3 }),
    //       editor.selection.active
    //     )
    //   } else {
    //     editor.selection = new vscode.Selection(
    //       editor.selection.anchor,
    //       editor.selection.active.translate({ characterDelta: -3 })
    //     )
    //   }
    // }
    // at end of line
    if (cursorPos.isEqual(getContentEndPos(cursorPos.line))) {
      // https://code.visualstudio.com/api/references/commands
      vscode.commands.executeCommand("cursorMove", {
        to: "left",
        by: "character",
        value: 3,
        select: hasSelection(editor),
      })
    } else if (
      // handle backwards selection range at end of line
      editor.selection.anchor.isEqual(
        getContentEndPos(editor.selection.anchor.line)
      )
    ) {
      editor.selection = new vscode.Selection(
        editor.selection.active,
        editor.selection.anchor
      )
      await vscode.commands.executeCommand("cursorMove", {
        to: "left",
        by: "character",
        value: 3,
        select: hasSelection(editor),
      })
      editor.selection = new vscode.Selection(
        editor.selection.active,
        editor.selection.anchor
      )
    } else {
      /* noop */
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
      ).translate({ characterDelta: 2 })

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
  const lineActive = editor.document.lineAt(editor.selection.active.line)
  const lineAnchor = editor.document.lineAt(editor.selection.anchor.line)

  /** first line num of selection === last line num */
  const isSingleLineSelection = lineFirst.lineNumber === lineLast.lineNumber

  let jsdocStart = lineFirst.text.match(JSDOC_START_REGEX)
  let jsdocEnd = lineLast.text.match(JSDOC_END_REGEX)

  // fix multiline selection when open or close tag not selected
  // use start tag on prev line if it exists
  /** should actually check all lines between `lineFirst` and `lineLast` */
  const isJsdoc =
    lineActive.text.trim().startsWith(JSDOC_LINE_CHAR) ||
    lineAnchor.text.trim().startsWith(JSDOC_LINE_CHAR)
  if (isJsdoc && !jsdocStart && lineFirst.lineNumber !== 0) {
    const lineBefore = getPrevLine(lineFirst)
    const jsdocMatch = lineBefore.text.match(JSDOC_START_REGEX)
    if (jsdocMatch) {
      lineFirst = lineBefore
      jsdocStart = jsdocMatch
    }
  }

  // use end tag on prev line if it exists
  if (
    isJsdoc &&
    !jsdocEnd &&
    lineLast.lineNumber !== editor.document.lineCount - 1
  ) {
    const lineAfter = getNextLine(lineLast)
    const jsdocMatch = lineAfter.text.match(JSDOC_END_REGEX)
    if (jsdocMatch) {
      lineLast = lineAfter
      jsdocEnd = jsdocMatch
    }
  }

  // add hidden text to enable using a replace operation when the cursor is at the end of
  // the line without altering the selection
  if (
    !hasSelection(getEditor()) &&
    getEditor().selection.end.character === lineLast.range.end.character
  ) {
    await getEditor().insertSnippet(
      new vscode.SnippetString(`$0${MAGIC_CHARACTER}`),
      getEditor().selection.active,
      { undoStopAfter: false, undoStopBefore: false }
    )
  }

  // construct and trigger single batch of changes
  return getEditor().edit((editBuilder) => {
    // #region - remove single line jsdoc, selection or no selection
    if (
      isSingleLineSelection &&
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
    if (!isSingleLineSelection && jsdocStart?.index && jsdocEnd?.index) {
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
        const jsdocComment = line.text.match(JSDOC_LINE_CHAR_REGEX)

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

    // #region - no jsdoc exists but possibly block or line comment
    if (isSingleLineSelection) {
      const lineCommentTag = lineFirst.text.match(LINE_COMMENT_TAG)
      const blockCommentStartIndex = lineFirst.text.indexOf(
        BLOCK_COMMENT_START_TAG
      )
      const blockCommentEndIndex = lineFirst.text.indexOf(BLOCK_COMMENT_END_TAG)
      const isLineCommentFullLine =
        lineFirst.firstNonWhitespaceCharacterIndex === lineCommentTag?.index
      const isBlockCommentTrailing =
        lineFirst.firstNonWhitespaceCharacterIndex !== blockCommentStartIndex &&
        (lineFirst.text.length - BLOCK_COMMENT_END_TAG.length ===
          blockCommentEndIndex ||
          lineFirst.text.length - BLOCK_COMMENT_END_TAG.length - 1 ===
            blockCommentEndIndex)

      if (
        hasSelection(editor) &&
        !jsdocStart?.index &&
        !jsdocEnd?.index &&
        !lineCommentTag?.index &&
        blockCommentStartIndex === -1 &&
        blockCommentEndIndex === -1
      ) {
        log("adding new jsdoc comment to line WITH A SELECTION")
        // selection on line without jsdoc or block/line comment
        editBuilder.insert(editor.selection.start, "/** ")

        // if there's another character after selection, grab position to build bigger range
        let nextPosition = getEditor().selection.end
        if (!getContentEndPos(lineLast).isEqual(getEditor().selection.end)) {
          nextPosition = nextPosition.translate({ characterDelta: 1 })
        }
        // could be a range w/ same end as beginning if selection at end of line
        const nextCharRange = new vscode.Range(
          getEditor().selection.end,
          nextPosition
        )

        // put jsdoc after next char but shuffle next char to after jsdoc
        editBuilder.replace(
          nextCharRange,
          ` */${getEditor().document.getText(nextCharRange)}`
        )
      } else if (
        blockCommentStartIndex > -1 &&
        blockCommentEndIndex > -1 &&
        getEditor().selection.active.character > blockCommentStartIndex &&
        getEditor().selection.active.character <
          blockCommentEndIndex + BLOCK_COMMENT_END_TAG.length
      ) {
        log("converting block comment to jsdoc")
        // block comment already exists and active cursor within it
        const firstChar = getEditor().document.getText(
          new vscode.Range(
            lineFirst.lineNumber,
            blockCommentStartIndex + BLOCK_COMMENT_START_TAG.length,
            lineFirst.lineNumber,
            blockCommentStartIndex + BLOCK_COMMENT_START_TAG.length + 1
          )
        )

        if (isBlockCommentTrailing) {
          const indent = getIndentation(lineFirst)
          const prevContent = getEditor()
            .document.getText(
              new vscode.Range(
                getContentStartPos(lineFirst),
                new vscode.Position(
                  lineFirst.lineNumber,
                  blockCommentStartIndex
                )
              )
            )
            .trim()
          const nextContent = getEditor()
            .document.getText(
              new vscode.Range(
                new vscode.Position(
                  lineFirst.lineNumber,
                  blockCommentEndIndex + BLOCK_COMMENT_END_TAG.length
                ),
                getContentEndPos(lineLast)
              )
            )
            .trim()

          const prevCommentChars = getEditor()
            .document.getText(
              new vscode.Range(
                new vscode.Position(
                  lineFirst.lineNumber,
                  blockCommentStartIndex + BLOCK_COMMENT_START_TAG.length
                ),
                getEditor().selection.active
              )
            )
            .trimStart()
          const nextCommentChars = getEditor()
            .document.getText(
              new vscode.Range(
                getEditor().selection.active,
                new vscode.Position(lineFirst.lineNumber, blockCommentEndIndex)
              )
            )
            .trimEnd()

          editBuilder.replace(
            new vscode.Range(
              getEditor().selection.active.with({ character: 0 }),
              getEditor().selection.active
            ),
            ""
          )
          editBuilder.insert(
            getEditor().selection.active.with({ character: 0 }),
            `${indent}/** ${prevCommentChars}`
          )
          editBuilder.replace(
            new vscode.Range(
              getEditor().selection.active,
              getContentEndPos(getEditor().selection.active.line)
            ),
            `${nextCommentChars} */\n${indent}${prevContent}${nextContent}`
          )
        } else {
          // block comment not alone
          editBuilder.replace(
            new vscode.Range(
              lineFirst.lineNumber,
              blockCommentStartIndex,
              lineFirst.lineNumber,
              blockCommentStartIndex + BLOCK_COMMENT_START_TAG.length
            ),
            ""
          )

          editBuilder.insert(
            new vscode.Position(lineFirst.lineNumber, blockCommentStartIndex),
            `/**${firstChar !== " " ? " " : ""}`
          )
        }
      } else if (
        lineCommentTag?.index &&
        getEditor().selection.active.character > lineCommentTag.index
      ) {
        log("converting line comment to jsdoc")
        const firstChar = getEditor().document.getText(
          new vscode.Range(
            lineFirst.lineNumber,
            lineFirst.firstNonWhitespaceCharacterIndex +
              LINE_COMMENT_TAG.length,
            lineFirst.lineNumber,
            lineFirst.firstNonWhitespaceCharacterIndex +
              LINE_COMMENT_TAG.length +
              1
          )
        )

        const indent = getIndentation(lineFirst)
        const prevLineText = getPrevLine(lineFirst).text.trim()
        const nextLineText = getNextLine(lineFirst).text.trim()
        // already starts with a star
        if (lineFirst.text.trim().startsWith(JSDOC_LINE_CHAR)) {
          editBuilder.replace(
            new vscode.Range(
              lineFirst.lineNumber,
              lineCommentTag.index,
              lineFirst.lineNumber,
              lineCommentTag.index + lineCommentTag[0].length
            ),
            ""
          )
        } else if (
          // line comment nested inside jsdoc
          prevLineText.startsWith(JSDOC_START_TAG) ||
          prevLineText.startsWith(JSDOC_LINE_CHAR) ||
          nextLineText.startsWith(JSDOC_LINE_CHAR) ||
          nextLineText.startsWith(JSDOC_END_TAG)
        ) {
          editBuilder.replace(
            new vscode.Range(
              lineFirst.lineNumber,
              lineCommentTag.index,
              lineFirst.lineNumber,
              lineCommentTag.index + lineCommentTag[0].length
            ),
            "*"
          )
        } else if (isLineCommentFullLine) {
          // REVIEW: could try to standardize by matching before and after cursor with regex here
          editBuilder.replace(
            new vscode.Range(
              lineFirst.lineNumber,
              0,
              lineFirst.lineNumber,
              lineFirst.firstNonWhitespaceCharacterIndex +
                LINE_COMMENT_TAG.length
            ),
            ""
          )
          editBuilder.insert(
            new vscode.Position(lineFirst.lineNumber, 0),
            `${indent}/**${firstChar !== " " ? " " : ""}`
          )

          const lastChar = getEditor().document.getText(
            new vscode.Range(
              getContentEndPos(lineFirst).translate(0, -1),
              getContentEndPos(lineFirst)
            )
          )

          editBuilder.replace(
            new vscode.Range(
              getContentEndPos(lineFirst),
              getContentEndPos(lineFirst).translate({ characterDelta: 1 })
            ),
            `${lastChar && lastChar !== " " ? " " : ""}*/`
          )
        } else {
          // line comment trails code
          const prevContent = getEditor()
            .document.getText(
              new vscode.Range(
                getContentStartPos(lineFirst),
                new vscode.Position(lineFirst.lineNumber, lineCommentTag.index)
              )
            )
            .trim()

          const prevCommentChars = getEditor()
            .document.getText(
              new vscode.Range(
                new vscode.Position(
                  lineFirst.lineNumber,
                  lineCommentTag.index + LINE_COMMENT_TAG.length
                ),
                getEditor().selection.active
              )
            )
            .trimStart()
          const nextCommentChars = getEditor()
            .document.getText(
              new vscode.Range(
                getEditor().selection.active,
                getContentEndPos(lineFirst)
              )
            )
            .trimEnd()

          editBuilder.replace(
            new vscode.Range(
              getEditor().selection.active.with({ character: 0 }),
              getEditor().selection.active
            ),
            ""
          )
          editBuilder.insert(
            getEditor().selection.active.with({ character: 0 }),
            `${indent}/** ${prevCommentChars}`
          )
          editBuilder.replace(
            new vscode.Range(
              getEditor().selection.active,
              getContentEndPos(getEditor().selection.active.line)
            ),
            `${nextCommentChars} */\n${indent}${prevContent}`
          )
        }
      } else {
        log("adding NEW jsdoc comment when NO SELECTION")
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
          // cursor at start of an empty line
          editBuilder.insert(getEditor().selection.active, "/** ")
          editBuilder.replace(
            new vscode.Range(
              getEditor().selection.active,
              getEditor().selection.active.translate({ characterDelta: 1 })
            ),
            ` */${adjacentChars[0] && adjacentChars[0] !== " " ? " " : ""}${
              adjacentChars[0] ? adjacentChars[0] : ""
            }`
          )
        } else {
          // cursor somewhere in middle or at end of line
          const indent = getIndentation(lineFirst)
          const prevChars = getEditor().document.getText(
            new vscode.Range(
              getEditor().selection.active.with({ character: 0 }),
              getEditor().selection.active
            )
          )

          editBuilder.replace(
            new vscode.Range(
              getEditor().selection.active.with({ character: 0 }),
              getEditor().selection.active
            ),
            ``
          )
          editBuilder.insert(
            getEditor().selection.active.with({ character: 0 }),
            `${indent}/** `
          )

          const nextChar = adjacentChars[1] || ""
          editBuilder.replace(
            new vscode.Range(
              getEditor().selection.active,
              getEditor().selection.active.translate({ characterDelta: 1 })
            ),
            // if there non-whitespace chars on the line, move comment to previous line
            lineActive.isEmptyOrWhitespace ||
              lineActive.text.includes(MAGIC_CHARACTER)
              ? ` */`
              : ` */\n${prevChars}${
                  nextChar !== MAGIC_CHARACTER ? nextChar : ""
                }`
          )
        }
      }

      return
    }

    // #region - insert multi line comment
    log("inserting multi line jsdoc")
    const indentation = getIndentation(lineFirst)
    editBuilder.insert(getContentStartPos(lineFirst), `/**\n${indentation}`)
    // target all lines between opening tag exclusive and closing tag inclusive
    for (let i = lineFirst.lineNumber; i <= lineLast.lineNumber; i += 1) {
      const line = getEditor().document.lineAt(i)
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

  // TODO: investigate possible performance issues with this
  // when an undo or redo contains our magic character, perform it twice as adding
  // and removing the magic character is an extra item on the undo stack
  vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.contentChanges[0]?.text === MAGIC_CHARACTER) {
      if (event.reason === vscode.TextDocumentChangeReason.Undo) {
        vscode.commands.executeCommand("undo")
      } else if (event.reason === vscode.TextDocumentChangeReason.Redo) {
        vscode.commands.executeCommand("redo")
      } else {
        // ignore undefined event reasons (e.g. typing)
      }
    }
  })

  if (DEBUG) {
    vscode.window.showInformationMessage("jsdoc comment toggler loaded")
  }

  context.subscriptions.push(disposable)
}
