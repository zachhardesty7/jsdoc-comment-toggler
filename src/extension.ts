// useful API pages
// https://code.visualstudio.com/api/references/vscode-api#TextEditor
// https://code.visualstudio.com/api/references/vscode-api#TextDocument
// https://code.visualstudio.com/api/references/vscode-api#TextLine
// https://code.visualstudio.com/api/references/vscode-api#Selection
// https://code.visualstudio.com/api/references/vscode-api#Position
// https://code.visualstudio.com/api/references/vscode-api#Range

import * as vscode from "vscode"
import { getConfigKey } from "./config"

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
    console.log(...messages)
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
      `adjusting cursor: [${editor.selection.active.line}, ${editor.selection.active.character}] => [${selection.active.line}, ${selection.active.character}]`,
    )
  }

  if (
    hasSelection(editor) &&
    !editor.selection.anchor.isEqual(selection.anchor)
  ) {
    log(
      `adjusting anchor: [${editor.selection.anchor.line}, ${editor.selection.anchor.character}] => [${selection.anchor.line}, ${selection.anchor.character}]`,
    )
  }

  editor.selection = selection
}

/**
 * @param line - input
 * @returns the line directly proceeding the input
 */
function getPrevLine(
  line: vscode.TextLine | number,
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
  line: vscode.TextLine | number,
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
      position,
    ),
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
      position.with({ character: position.character + 1 }),
    ),
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
    ).firstNonWhitespaceCharacterIndex,
  )
}

/**
 * @param line - target
 * @returns position of last character on target line
 */
export function getContentEndPos(
  line: vscode.TextLine | number,
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
    }),
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
  log("adjusting cursor pos")
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
        getContentEndPos(editor.selection.anchor.line),
      )
    ) {
      editor.selection = new vscode.Selection(
        editor.selection.active,
        editor.selection.anchor,
      )
      await vscode.commands.executeCommand("cursorMove", {
        to: "left",
        by: "character",
        value: 3,
        select: hasSelection(editor),
      })
      editor.selection = new vscode.Selection(
        editor.selection.active,
        editor.selection.anchor,
      )
    } else {
      /* noop */
    }
  } else {
    // adjust multiline comment cursor
    // selection ends at end of line
    if (
      editor.selection.end.isAfterOrEqual(
        getContentEndPos(editor.selection.end.line),
      )
    ) {
      const adjustedSelectionEndPos = getContentEndPos(
        editor.selection.end.line - 1,
      )

      // ensure cursor is at original side of the selection
      const isCursorAtEnd = cursorPos.isEqual(editor.selection.end)

      setCursorSelection(
        new vscode.Selection(
          isCursorAtEnd ? editor.selection.start : adjustedSelectionEndPos,
          isCursorAtEnd ? adjustedSelectionEndPos : editor.selection.start,
        ),
      )
    }

    // selection starts before first non-whitespace char of line
    if (
      editor.selection.start.isBefore(
        getContentStartPos(editor.selection.start.line),
      )
    ) {
      const adjustedSelectionStartPos = getContentStartPos(
        editor.selection.start.line + 1,
      ).translate({ characterDelta: 2 })

      // ensure cursor is at same side of selection
      const isCursorAtStart = cursorPos.isEqual(editor.selection.start)

      setCursorSelection(
        new vscode.Selection(
          isCursorAtStart ? editor.selection.end : adjustedSelectionStartPos,
          isCursorAtStart ? adjustedSelectionStartPos : editor.selection.end,
        ),
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
interface JSDocToggleContext {
  editor: vscode.TextEditor
  lineFirst: vscode.TextLine
  lineLast: vscode.TextLine
  lineActive: vscode.TextLine
  lineAnchor: vscode.TextLine
  isSingleLineSelection: boolean
  jsdocStart: RegExpMatchArray | null
  jsdocEnd: RegExpMatchArray | null
}

const createJSDocToggleContext = (
  editor: vscode.TextEditor,
): JSDocToggleContext => {
  const lineFirst = editor.document.lineAt(editor.selection.start.line)
  const lineLast = editor.document.lineAt(editor.selection.end.line)
  return {
    editor,
    lineFirst,
    lineLast,
    lineActive: editor.document.lineAt(editor.selection.active.line),
    lineAnchor: editor.document.lineAt(editor.selection.anchor.line),
    isSingleLineSelection: lineFirst.lineNumber === lineLast.lineNumber,
    jsdocStart: lineFirst.text.match(JSDOC_START_REGEX),
    jsdocEnd: lineLast.text.match(JSDOC_END_REGEX),
  }
}

const normalizeJsdocBoundaries = (context: JSDocToggleContext): void => {
  const { editor } = context
  const isJsdoc =
    context.lineActive.text.trim().startsWith(JSDOC_LINE_CHAR) ||
    context.lineAnchor.text.trim().startsWith(JSDOC_LINE_CHAR)

  if (isJsdoc && !context.jsdocStart && context.lineFirst.lineNumber !== 0) {
    const lineBefore = getPrevLine(context.lineFirst)
    const jsdocMatch = lineBefore?.text.match(JSDOC_START_REGEX)

    if (lineBefore && jsdocMatch) {
      context.lineFirst = lineBefore
      context.jsdocStart = jsdocMatch
    }
  }

  if (
    isJsdoc &&
    !context.jsdocEnd &&
    context.lineLast.lineNumber !== editor.document.lineCount - 1
  ) {
    const lineAfter = getNextLine(context.lineLast)
    const jsdocMatch = lineAfter?.text.match(JSDOC_END_REGEX)

    if (lineAfter && jsdocMatch) {
      context.lineLast = lineAfter
      context.jsdocEnd = jsdocMatch
    }
  }
}

const addCursorHackIfNeeded = async (
  context: JSDocToggleContext,
): Promise<void> => {
  const { editor } = context

  if (
    !getConfigKey("disableCursorHack") &&
    context.jsdocStart?.index === undefined &&
    context.jsdocEnd?.index === undefined &&
    editor.selection.end.character ===
      getSelectionLastLine().range.end.character
  ) {
    const originalSelection = new vscode.Selection(
      editor.selection.anchor,
      editor.selection.active,
    )

    await editor.insertSnippet(
      new vscode.SnippetString(`$0${MAGIC_CHARACTER}`),
      editor.selection.end,
      { undoStopAfter: false, undoStopBefore: false },
    )

    if (!editor.selection.isEqual(originalSelection)) {
      setCursorSelection(originalSelection)
    }
  }
}

const removeSingleLineJSDoc = (
  editBuilder: vscode.TextEditorEdit,
  context: JSDocToggleContext,
): boolean => {
  const {
    editor,
    lineFirst,
    lineLast,
    isSingleLineSelection,
    jsdocStart,
    jsdocEnd,
  } = context

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
      jsdocEnd.index + jsdocEnd[0].length,
    ).contains(editor.selection.active) ||
      isJSDocCommentFullLine)
  ) {
    log("removing single line jsdoc")

    if (
      jsdocEnd.index + jsdocEnd[0].length ===
      getContentEndPos(lineLast).character
    ) {
      editBuilder.replace(
        new vscode.Range(
          lineFirst.lineNumber,
          jsdocStart.index,
          lineFirst.lineNumber,
          jsdocStart.index + jsdocStart[0].length,
        ),
        "// ",
      )
      editBuilder.delete(
        new vscode.Range(
          lineLast.lineNumber,
          jsdocEnd.index,
          lineLast.lineNumber,
          jsdocEnd.index + jsdocEnd[0].length,
        ),
      )
    } else {
      editBuilder.replace(
        new vscode.Range(
          lineFirst.lineNumber,
          jsdocStart.index,
          lineFirst.lineNumber,
          jsdocStart.index + jsdocStart[0].length,
        ),
        "/* ",
      )
    }

    return true
  }

  return false
}

const removeMultiLineJSDoc = (
  editBuilder: vscode.TextEditorEdit,
  context: JSDocToggleContext,
): boolean => {
  const {
    editor,
    lineFirst,
    lineLast,
    isSingleLineSelection,
    jsdocStart,
    jsdocEnd,
  } = context

  if (!isSingleLineSelection && jsdocStart?.index && jsdocEnd?.index) {
    log("removing multi line jsdoc")
    editBuilder.delete(lineFirst.rangeIncludingLineBreak)
    editBuilder.delete(lineLast.rangeIncludingLineBreak)

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
            jsdocComment.index + 3,
          ),
          "// ",
        )
      }
    }

    return true
  }

  return false
}

const insertJsdocForRange = (
  editBuilder: vscode.TextEditorEdit,
  editor: vscode.TextEditor,
): void => {
  log("adding new jsdoc comment to line WITH A SELECTION")
  editBuilder.insert(editor.selection.start, "/** ")
  const nextChar = getNextChar(editor.selection.end)
  editBuilder.replace(
    new vscode.Range(
      editor.selection.end,
      editor.selection.end.translate({ characterDelta: 1 }),
    ),
    ` */${nextChar === MAGIC_CHARACTER ? "" : nextChar}`,
  )
}

const convertBlockCommentToJsdoc = (
  editBuilder: vscode.TextEditorEdit,
  context: JSDocToggleContext,
  blockCommentStartIndex: number,
  blockCommentEndIndex: number,
  isBlockCommentTrailing: boolean,
): void => {
  const { editor, lineFirst, lineLast } = context
  log("converting block comment to jsdoc")

  const firstChar = editor.document.getText(
    new vscode.Range(
      lineFirst.lineNumber,
      blockCommentStartIndex + BLOCK_COMMENT_START_TAG.length,
      lineFirst.lineNumber,
      blockCommentStartIndex + BLOCK_COMMENT_START_TAG.length + 1,
    ),
  )

  if (isBlockCommentTrailing) {
    const indent = getIndentation(lineFirst)
    const prevContent = editor.document
      .getText(
        new vscode.Range(
          getContentStartPos(lineFirst),
          new vscode.Position(lineFirst.lineNumber, blockCommentStartIndex),
        ),
      )
      .trim()
    const nextContent = editor.document
      .getText(
        new vscode.Range(
          new vscode.Position(
            lineFirst.lineNumber,
            blockCommentEndIndex + BLOCK_COMMENT_END_TAG.length,
          ),
          getContentEndPos(lineLast),
        ),
      )
      .trim()

    const prevCommentChars = editor.document
      .getText(
        new vscode.Range(
          new vscode.Position(
            lineFirst.lineNumber,
            blockCommentStartIndex + BLOCK_COMMENT_START_TAG.length,
          ),
          editor.selection.active,
        ),
      )
      .trimStart()
    const nextCommentChars = editor.document
      .getText(
        new vscode.Range(
          editor.selection.active,
          new vscode.Position(lineFirst.lineNumber, blockCommentEndIndex),
        ),
      )
      .trimEnd()

    editBuilder.replace(
      new vscode.Range(
        editor.selection.active.with({ character: 0 }),
        editor.selection.active,
      ),
      "",
    )
    editBuilder.insert(
      editor.selection.active.with({ character: 0 }),
      `${indent}/** ${prevCommentChars}`,
    )
    editBuilder.replace(
      new vscode.Range(
        editor.selection.active,
        getContentEndPos(editor.selection.active.line),
      ),
      `${nextCommentChars} */\n${indent}${prevContent}${nextContent}`,
    )
  } else {
    editBuilder.replace(
      new vscode.Range(
        lineFirst.lineNumber,
        blockCommentStartIndex,
        lineFirst.lineNumber,
        blockCommentStartIndex + BLOCK_COMMENT_START_TAG.length,
      ),
      "",
    )

    editBuilder.insert(
      new vscode.Position(lineFirst.lineNumber, blockCommentStartIndex),
      `/**${firstChar === " " ? "" : " "}`,
    )
  }
}

const convertLineCommentToJsdoc = (
  editBuilder: vscode.TextEditorEdit,
  context: JSDocToggleContext,
  lineCommentIndex: number,
  isLineCommentFullLine: boolean,
): void => {
  const { editor, lineFirst } = context
  log("converting line comment to jsdoc")

  const indent = getIndentation(lineFirst)
  const prevLineText = getPrevLine(lineFirst)?.text.trim()
  const nextLineText = getNextLine(lineFirst)?.text.trim()

  if (lineFirst.text.trim().startsWith(JSDOC_LINE_CHAR)) {
    editBuilder.replace(
      new vscode.Range(
        lineFirst.lineNumber,
        lineCommentIndex,
        lineFirst.lineNumber,
        lineCommentIndex + LINE_COMMENT_TAG.length,
      ),
      "",
    )
    return
  }

  if (
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
        lineCommentIndex + LINE_COMMENT_TAG.length,
      ),
      "*",
    )
    return
  }

  if (isLineCommentFullLine) {
    const firstChar = editor.document.getText(
      new vscode.Range(
        lineFirst.lineNumber,
        lineCommentIndex + LINE_COMMENT_TAG.length,
        lineFirst.lineNumber,
        lineCommentIndex + LINE_COMMENT_TAG.length + 1,
      ),
    )

    editBuilder.replace(
      new vscode.Range(
        lineFirst.lineNumber,
        lineCommentIndex,
        lineFirst.lineNumber,
        lineCommentIndex + LINE_COMMENT_TAG.length,
      ),
      "",
    )
    editBuilder.insert(
      new vscode.Position(lineFirst.lineNumber, lineCommentIndex),
      `/**${firstChar === " " ? "" : " "}`,
    )

    const lastChar = editor.document.getText(
      new vscode.Range(
        getContentEndPos(lineFirst).translate(0, -1),
        getContentEndPos(lineFirst),
      ),
    )

    editBuilder.replace(
      new vscode.Range(
        getContentEndPos(lineFirst),
        getContentEndPos(lineFirst).translate({ characterDelta: 1 }),
      ),
      `${lastChar && lastChar !== " " ? " " : ""}*/`,
    )
    return
  }

  const prevContent = editor.document
    .getText(
      new vscode.Range(
        getContentStartPos(lineFirst),
        new vscode.Position(lineFirst.lineNumber, lineCommentIndex),
      ),
    )
    .trim()

  const prevCommentChars = editor.document
    .getText(
      new vscode.Range(
        new vscode.Position(
          lineFirst.lineNumber,
          lineCommentIndex + LINE_COMMENT_TAG.length,
        ),
        editor.selection.active,
      ),
    )
    .trimStart()
  const nextCommentChars = editor.document
    .getText(
      new vscode.Range(editor.selection.active, getContentEndPos(lineFirst)),
    )
    .trimEnd()

  editBuilder.replace(
    new vscode.Range(
      editor.selection.active.with({ character: 0 }),
      editor.selection.active,
    ),
    "",
  )
  editBuilder.insert(
    editor.selection.active.with({ character: 0 }),
    `${indent}/** ${prevCommentChars}`,
  )
  editBuilder.replace(
    new vscode.Range(
      editor.selection.active,
      getContentEndPos(editor.selection.active.line),
    ),
    `${nextCommentChars} */\n${indent}${prevContent}`,
  )
}

const addJsdocNoSelection = (
  editBuilder: vscode.TextEditorEdit,
  context: JSDocToggleContext,
): void => {
  const { editor, lineFirst, lineActive } = context
  log("adding NEW jsdoc comment when NO SELECTION")

  const prevChar = getPrevChar(editor.selection.active)
  const nextChar = getNextChar(editor.selection.active)
  const isLineBlank =
    lineActive.isEmptyOrWhitespace || lineActive.text.includes(MAGIC_CHARACTER)

  if (
    (!isLineBlank &&
      editor.selection.active.character ===
        lineActive.firstNonWhitespaceCharacterIndex) ||
    (prevChar === " " &&
      nextChar === " " &&
      editor.selection.active.character >
        lineActive.firstNonWhitespaceCharacterIndex)
  ) {
    editBuilder.insert(editor.selection.active, "/** ")
    editBuilder.replace(
      new vscode.Range(
        editor.selection.active,
        editor.selection.active.translate({ characterDelta: 1 }),
      ),
      ` */${nextChar && nextChar !== " " ? " " : ""}${nextChar}`,
    )
    return
  }

  const indent = getIndentation(lineFirst)
  const prevChars = editor.document.getText(
    new vscode.Range(
      editor.selection.active.with({ character: 0 }),
      editor.selection.active,
    ),
  )

  editBuilder.replace(
    new vscode.Range(
      editor.selection.active.with({ character: 0 }),
      editor.selection.active,
    ),
    "",
  )
  editBuilder.insert(
    editor.selection.active.with({ character: 0 }),
    `${indent}/** `,
  )
  editBuilder.replace(
    new vscode.Range(
      editor.selection.active,
      editor.selection.active.translate({ characterDelta: 1 }),
    ),
    isLineBlank
      ? ` */`
      : ` */\n${prevChars}${nextChar === MAGIC_CHARACTER ? "" : nextChar}`,
  )
}

const handleSingleLineSelection = (
  editBuilder: vscode.TextEditorEdit,
  context: JSDocToggleContext,
): void => {
  const { editor, lineFirst } = context
  const lineCommentIndex = lineFirst.text.indexOf(LINE_COMMENT_TAG)
  const isLineCommentFullLine =
    lineFirst.firstNonWhitespaceCharacterIndex === lineCommentIndex

  const blockCommentStartIndex = lineFirst.text.indexOf(BLOCK_COMMENT_START_TAG)
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
    context.jsdocStart?.index === undefined &&
    context.jsdocEnd?.index === undefined &&
    lineCommentIndex === -1 &&
    blockCommentStartIndex === -1 &&
    blockCommentEndIndex === -1
  ) {
    insertJsdocForRange(editBuilder, editor)
    return
  }

  if (
    blockCommentStartIndex > -1 &&
    blockCommentEndIndex > -1 &&
    ((editor.selection.active.character >= blockCommentStartIndex &&
      editor.selection.active.character <
        blockCommentEndIndex + BLOCK_COMMENT_END_TAG.length + 1) ||
      isBlockCommentFullLine)
  ) {
    convertBlockCommentToJsdoc(
      editBuilder,
      context,
      blockCommentStartIndex,
      blockCommentEndIndex,
      isBlockCommentTrailing,
    )
    return
  }

  if (
    lineCommentIndex > -1 &&
    (editor.selection.active.character > lineCommentIndex ||
      isLineCommentFullLine)
  ) {
    convertLineCommentToJsdoc(
      editBuilder,
      context,
      lineCommentIndex,
      isLineCommentFullLine,
    )
    return
  }

  addJsdocNoSelection(editBuilder, context)
}

const insertMultiLineJSDoc = (
  editBuilder: vscode.TextEditorEdit,
  context: JSDocToggleContext,
): void => {
  log("inserting multi line jsdoc")
  const { editor, lineFirst, lineLast } = context
  const indentation = getIndentation(lineFirst)

  editBuilder.insert(getContentStartPos(lineFirst), `/**\n${indentation}`)
  for (let i = lineFirst.lineNumber; i <= lineLast.lineNumber; i += 1) {
    const line = editor.document.lineAt(i)
    const contentStart = line.text.slice(line.firstNonWhitespaceCharacterIndex)
    const commentTag = contentStart.match(LINE_COMMENT_TAG)
    if (commentTag) {
      const firstChar = getNextChar(
        new vscode.Position(
          line.lineNumber,
          line.firstNonWhitespaceCharacterIndex + commentTag[0].length,
        ),
      )

      editBuilder.replace(
        new vscode.Range(
          line.lineNumber,
          line.firstNonWhitespaceCharacterIndex,
          line.lineNumber,
          line.firstNonWhitespaceCharacterIndex + commentTag[0].length,
        ),
        ` *${firstChar === " " ? "" : " "}`,
      )
    } else {
      editBuilder.insert(getContentStartPos(line), " * ")
    }
  }

  const contentEnd = getContentEndPos(lineLast)
  const nextChar = getNextChar(contentEnd)
  editBuilder.replace(
    new vscode.Range(contentEnd, contentEnd.translate({ characterDelta: 1 })),
    `\n${indentation} */${nextChar === MAGIC_CHARACTER ? "" : nextChar}`,
  )
}

export const toggleJSDocComment = async (): Promise<boolean> => {
  const editor = getEditor()
  const context = createJSDocToggleContext(editor)

  normalizeJsdocBoundaries(context)
  await addCursorHackIfNeeded(context)

  return editor.edit((editBuilder) => {
    if (removeSingleLineJSDoc(editBuilder, context)) {
      return
    }

    if (removeMultiLineJSDoc(editBuilder, context)) {
      return
    }

    if (context.isSingleLineSelection) {
      handleSingleLineSelection(editBuilder, context)
      return
    }

    insertMultiLineJSDoc(editBuilder, context)
  })
}

export const activate = (context: vscode.ExtensionContext): void => {
  // REVIEW: consider using `registerTextEditorCommand`
  const disposable = vscode.commands.registerCommand(
    "jsdoc-comment-toggler.toggle",
    toggleJSDocComment,
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
    context.subscriptions,
  )

  if (DEBUG) {
    vscode.window.showInformationMessage("jsdoc comment toggler loaded")
  }

  context.subscriptions.push(disposable)
}
