/* eslint-disable @typescript-eslint/no-floating-promises */
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
 * guards against an invariant state by yeeting the entire extension when no
 * editor
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
  const editor = getEditor()

  if (!editor.selection.active.isEqual(selection.active)) {
    log(
      `adjusting cursor: [${editor.selection.active.line}, ${editor.selection.active.character}] => [${selection.active.line}, ${selection.active.character}]`
    )
  }

  if (
    hasSelection(editor) &&
    !editor.selection.anchor.isEqual(selection.anchor)
  ) {
    log(
      `adjusting anchor: [${editor.selection.anchor.line}, ${editor.selection.anchor.character}] => [${selection.anchor.line}, ${selection.anchor.character}]`
    )
  }

  editor.selection = selection
}

/**
 * @param line - input
 * @returns the line directly proceeding the input
 */
function getPrevLine(
  line: vscode.TextLine | number
): vscode.TextLine | undefined {
  const editor = getEditor()
  const lineNumber = typeof line === "number" ? line : line.lineNumber

  return lineNumber <= 0 ? undefined : editor.document.lineAt(lineNumber - 1)
}

/**
 * @param line - input
 * @returns the line directly following the input
 */
function getNextLine(
  line: vscode.TextLine | number
): vscode.TextLine | undefined {
  const editor = getEditor()
  const lineNumber = typeof line === "number" ? line : line.lineNumber
  const lastLineNumber = editor.document.lineCount - 1

  return lineNumber >= lastLineNumber
    ? undefined
    : editor.document.lineAt(lineNumber + 1)
}

/** @returns the last line of the current selection */
function getSelectionLastLine(): vscode.TextLine {
  const editor = getEditor()

  return editor.document.lineAt(editor.selection.end.line)
}

/**
 * @param position - input
 * @returns the char before the position or empty string if at start of line
 */
function getPrevChar(position: vscode.Position): string {
  const editor = getEditor()

  return editor.document.getText(
    new vscode.Range(
      position.with({ character: Math.max(position.character - 1, 0) }),
      position
    )
  )
}

/**
 * @param position - input
 * @returns the char after the position or empty string if at end of line
 */
function getNextChar(position: vscode.Position): string {
  const editor = getEditor()

  return editor.document.getText(
    new vscode.Range(
      position,
      position.with({ character: position.character + 1 })
    )
  )
}

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
function getContentStartPos(line: vscode.TextLine | number): vscode.Position {
  const editor = getEditor()

  return new vscode.Position(
    typeof line === "number" ? line : line.lineNumber,
    (typeof line === "number"
      ? editor.document.lineAt(line)
      : line
    ).firstNonWhitespaceCharacterIndex
  )
}

/**
 * @param line - target
 * @returns position of last character on target line
 */
export function getContentEndPos(
  line: vscode.TextLine | number
): vscode.Position {
  const editor = getEditor()

  return (typeof line === "number" ? editor.document.lineAt(line) : line).range
    .end
}

/**
 * @param line - target
 * @returns concatenated value of indentation on target line
 */
export const getIndentation = (line: vscode.TextLine | number): string => {
  const editor = getEditor()
  const currentLine =
    typeof line === "number" ? editor.document.lineAt(line) : line

  return editor.document.getText(
    currentLine.range.with({
      end: currentLine.range.end.with({
        character: currentLine.firstNonWhitespaceCharacterIndex,
      }),
    })
  )
}

// #region - fix cursor / selection pos
/**
 * if cursor was at end of last line, the comment tag is errantly placed before
 * the cursor. this moves the comment tag after the cursor, keeping the cursor
 * in the original position before the JSDoc was inserted vscode doesn't have
 * the ability to add to line index greater than max
 *
 * @deprecated - inaccurate results if called _during_ a textEdit. if called
 *   _after_, the cursor movement is noticeable and somewhat slow
 * @param isSingleLineComment - precalculated
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      await vscode.commands.executeCommand("cursorMove", {
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
 * primary extension action, removes the JSDoc tags on selected lines if present
 * or inserts a JSDoc wrapping the selected lines of text comment
 *
 * @returns once edit is complete
 */
export const toggleJSDocComment = async (): Promise<boolean> => {
  const editor = getEditor()

  /** within selection, not live */
  let lineFirst = editor.document.lineAt(editor.selection.start.line)
  /** within selection, not live */
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
    const jsdocMatch = lineBefore?.text.match(JSDOC_START_REGEX)

    if (lineBefore && jsdocMatch) {
      lineFirst = lineBefore
      jsdocStart = jsdocMatch
    }
  }

  // use end tag on next line if it exists
  // TODO: use a separate var to store the start and end line of comments
  if (
    isJsdoc &&
    !jsdocEnd &&
    lineLast.lineNumber !== editor.document.lineCount - 1
  ) {
    const lineAfter = getNextLine(lineLast)
    const jsdocMatch = lineAfter?.text.match(JSDOC_END_REGEX)

    if (lineAfter && jsdocMatch) {
      lineLast = lineAfter
      jsdocEnd = jsdocMatch
    }
  }

  // add hidden text to enable using a replace operation when the cursor is at the end of
  // the line without altering the cursor position
  if (
    jsdocStart?.index === undefined &&
    jsdocEnd?.index === undefined &&
    editor.selection.end.character ===
      getSelectionLastLine().range.end.character
  ) {
    const originalSelection = new vscode.Selection(
      editor.selection.anchor,
      editor.selection.active
    )

    await editor.insertSnippet(
      new vscode.SnippetString(`$0${MAGIC_CHARACTER}`),
      editor.selection.end,
      { undoStopAfter: false, undoStopBefore: false }
    )

    // insert snippet removes the current selection, so restore it
    if (!editor.selection.isEqual(originalSelection)) {
      setCursorSelection(originalSelection)
    }
  }

  // construct and trigger single batch of changes
  return editor.edit((editBuilder) => {
    // #region - remove single line jsdoc, selection or no selection
    const isJSDocCommentFullLine =
      lineFirst.firstNonWhitespaceCharacterIndex === jsdocStart?.index &&
      jsdocEnd &&
      getContentEndPos(lineFirst).character - jsdocEnd[0].length ===
        jsdocEnd.index

    if (
      isSingleLineSelection &&
      jsdocStart?.index !== undefined &&
      jsdocEnd?.index !== undefined &&
      (new vscode.Range(
        lineFirst.lineNumber,
        jsdocStart.index,
        lineLast.lineNumber,
        jsdocEnd.index + jsdocEnd[0].length
      ).contains(editor.selection.active) ||
        isJSDocCommentFullLine)
    ) {
      log("removing single line jsdoc")

      // trailing
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
        // internal
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
      const lineCommentIndex = lineFirst.text.indexOf(LINE_COMMENT_TAG)
      const isLineCommentFullLine =
        lineFirst.firstNonWhitespaceCharacterIndex === lineCommentIndex

      const blockCommentStartIndex = lineFirst.text.indexOf(
        BLOCK_COMMENT_START_TAG
      )
      const blockCommentEndIndex = lineFirst.text.indexOf(BLOCK_COMMENT_END_TAG)
      const isBlockCommentFullLine =
        lineFirst.firstNonWhitespaceCharacterIndex === blockCommentStartIndex &&
        getContentEndPos(lineFirst).character - BLOCK_COMMENT_END_TAG.length ===
          blockCommentEndIndex
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
        lineCommentIndex === -1 &&
        blockCommentStartIndex === -1 &&
        blockCommentEndIndex === -1
      ) {
        log("adding new jsdoc comment to line WITH A SELECTION")

        editBuilder.insert(editor.selection.start, "/** ")

        const nextChar = getNextChar(editor.selection.end)

        editBuilder.replace(
          new vscode.Range(
            editor.selection.end,
            editor.selection.end.translate({ characterDelta: 1 })
          ),
          ` */${nextChar !== MAGIC_CHARACTER ? nextChar : ""}`
        )
      } else if (
        blockCommentStartIndex > -1 &&
        blockCommentEndIndex > -1 &&
        // active cursor within block comment or full line is a block comment
        ((editor.selection.active.character >= blockCommentStartIndex &&
          editor.selection.active.character <
            blockCommentEndIndex + BLOCK_COMMENT_END_TAG.length + 1) ||
          isBlockCommentFullLine)
      ) {
        log("converting block comment to jsdoc")

        const firstChar = editor.document.getText(
          new vscode.Range(
            lineFirst.lineNumber,
            blockCommentStartIndex + BLOCK_COMMENT_START_TAG.length,
            lineFirst.lineNumber,
            blockCommentStartIndex + BLOCK_COMMENT_START_TAG.length + 1
          )
        )

        if (isBlockCommentTrailing) {
          const indent = getIndentation(lineFirst)
          const prevContent = editor.document
            .getText(
              new vscode.Range(
                getContentStartPos(lineFirst),
                new vscode.Position(
                  lineFirst.lineNumber,
                  blockCommentStartIndex
                )
              )
            )
            .trim()
          const nextContent = editor.document
            .getText(
              new vscode.Range(
                new vscode.Position(
                  lineFirst.lineNumber,
                  blockCommentEndIndex + BLOCK_COMMENT_END_TAG.length
                ),
                getContentEndPos(lineLast)
              )
            )
            .trim()

          const prevCommentChars = editor.document
            .getText(
              new vscode.Range(
                new vscode.Position(
                  lineFirst.lineNumber,
                  blockCommentStartIndex + BLOCK_COMMENT_START_TAG.length
                ),
                editor.selection.active
              )
            )
            .trimStart()
          const nextCommentChars = editor.document
            .getText(
              new vscode.Range(
                editor.selection.active,
                new vscode.Position(lineFirst.lineNumber, blockCommentEndIndex)
              )
            )
            .trimEnd()

          editBuilder.replace(
            new vscode.Range(
              editor.selection.active.with({ character: 0 }),
              editor.selection.active
            ),
            ""
          )
          editBuilder.insert(
            editor.selection.active.with({ character: 0 }),
            `${indent}/** ${prevCommentChars}`
          )
          editBuilder.replace(
            new vscode.Range(
              editor.selection.active,
              getContentEndPos(editor.selection.active.line)
            ),
            `${nextCommentChars} */\n${indent}${prevContent}${nextContent}`
          )
        } else {
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
        lineCommentIndex > -1 &&
        (editor.selection.active.character > lineCommentIndex ||
          isLineCommentFullLine)
      ) {
        log("converting line comment to jsdoc")

        const indent = getIndentation(lineFirst)
        const prevLineText = getPrevLine(lineFirst)?.text.trim()
        const nextLineText = getNextLine(lineFirst)?.text.trim()
        // already starts with a star
        if (lineFirst.text.trim().startsWith(JSDOC_LINE_CHAR)) {
          editBuilder.replace(
            new vscode.Range(
              lineFirst.lineNumber,
              lineCommentIndex,
              lineFirst.lineNumber,
              lineCommentIndex + LINE_COMMENT_TAG.length
            ),
            ""
          )
        } else if (
          // line comment nested inside jsdoc
          prevLineText?.startsWith(JSDOC_START_TAG) ||
          prevLineText?.startsWith(JSDOC_LINE_CHAR) ||
          nextLineText?.startsWith(JSDOC_LINE_CHAR) ||
          nextLineText?.startsWith(JSDOC_END_TAG)
        ) {
          editBuilder.replace(
            new vscode.Range(
              lineFirst.lineNumber,
              lineCommentIndex,
              lineFirst.lineNumber,
              lineCommentIndex + LINE_COMMENT_TAG.length
            ),
            "*"
          )
        } else if (isLineCommentFullLine) {
          const firstChar = editor.document.getText(
            new vscode.Range(
              lineFirst.lineNumber,
              lineCommentIndex + LINE_COMMENT_TAG.length,
              lineFirst.lineNumber,
              lineCommentIndex + LINE_COMMENT_TAG.length + 1
            )
          )

          // REVIEW: could try to standardize by matching before and after cursor with regex here
          editBuilder.replace(
            new vscode.Range(
              lineFirst.lineNumber,
              lineCommentIndex,
              lineFirst.lineNumber,
              lineCommentIndex + LINE_COMMENT_TAG.length
            ),
            ""
          )
          editBuilder.insert(
            new vscode.Position(lineFirst.lineNumber, lineCommentIndex),
            `/**${firstChar !== " " ? " " : ""}`
          )

          const lastChar = editor.document.getText(
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
          const prevContent = editor.document
            .getText(
              new vscode.Range(
                getContentStartPos(lineFirst),
                new vscode.Position(lineFirst.lineNumber, lineCommentIndex)
              )
            )
            .trim()

          const prevCommentChars = editor.document
            .getText(
              new vscode.Range(
                new vscode.Position(
                  lineFirst.lineNumber,
                  lineCommentIndex + LINE_COMMENT_TAG.length
                ),
                editor.selection.active
              )
            )
            .trimStart()
          const nextCommentChars = editor.document
            .getText(
              new vscode.Range(
                editor.selection.active,
                getContentEndPos(lineFirst)
              )
            )
            .trimEnd()

          editBuilder.replace(
            new vscode.Range(
              editor.selection.active.with({ character: 0 }),
              editor.selection.active
            ),
            ""
          )
          editBuilder.insert(
            editor.selection.active.with({ character: 0 }),
            `${indent}/** ${prevCommentChars}`
          )
          editBuilder.replace(
            new vscode.Range(
              editor.selection.active,
              getContentEndPos(editor.selection.active.line)
            ),
            `${nextCommentChars} */\n${indent}${prevContent}`
          )
        }
      } else {
        log("adding NEW jsdoc comment when NO SELECTION")

        const prevChar = getPrevChar(editor.selection.active)
        const nextChar = getNextChar(editor.selection.active)
        const isLineBlank =
          lineActive.isEmptyOrWhitespace ||
          lineActive.text.includes(MAGIC_CHARACTER)

        if (
          (!isLineBlank &&
            editor.selection.active.character ===
              lineActive.firstNonWhitespaceCharacterIndex) ||
          (prevChar === " " &&
            nextChar === " " &&
            editor.selection.active.character >
              lineActive.firstNonWhitespaceCharacterIndex)
        ) {
          log(
            "add inline jsdoc, cursor at start of non-empty line or has spaces on both sides"
          )
          editBuilder.insert(editor.selection.active, "/** ")
          editBuilder.replace(
            new vscode.Range(
              editor.selection.active,
              editor.selection.active.translate({ characterDelta: 1 })
            ),
            ` */${nextChar && nextChar !== " " ? " " : ""}${nextChar}`
          )
        } else {
          log(
            "add jsdoc on prev line, cursor somewhere in middle, or at end of line, or at start of blank line"
          )
          const indent = getIndentation(lineFirst)
          const prevChars = editor.document.getText(
            new vscode.Range(
              editor.selection.active.with({ character: 0 }),
              editor.selection.active
            )
          )

          editBuilder.replace(
            new vscode.Range(
              editor.selection.active.with({ character: 0 }),
              editor.selection.active
            ),
            ``
          )
          editBuilder.insert(
            editor.selection.active.with({ character: 0 }),
            `${indent}/** `
          )

          editBuilder.replace(
            new vscode.Range(
              editor.selection.active,
              editor.selection.active.translate({ characterDelta: 1 })
            ),
            // if there are non-whitespace chars on the line, move comment to previous line
            isLineBlank
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
      const line = editor.document.lineAt(i)
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
  vscode.workspace.onDidChangeTextDocument(
    (event) => {
      if (event.contentChanges[0]?.text === MAGIC_CHARACTER) {
        if (event.reason === vscode.TextDocumentChangeReason.Undo) {
          vscode.commands.executeCommand("undo")
        } else if (event.reason === vscode.TextDocumentChangeReason.Redo) {
          vscode.commands.executeCommand("redo")
        } else {
          // ignore undefined event reasons (e.g. typing)
        }
      }
    },
    null,
    context.subscriptions
  )

  if (DEBUG) {
    vscode.window.showInformationMessage("jsdoc comment toggler loaded")
  }

  context.subscriptions.push(disposable)
}
