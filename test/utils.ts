import { cyan, red, yellowBright } from "ansi-colors"

export const VERBOSE = true

export const log = (...messages: unknown[]): void => {
  if (VERBOSE) console.log(...messages)
}

log.info = (...messages: unknown[]): void => {
  if (VERBOSE) console.info(cyan("info"), ...messages)
}

log.warn = (...messages: unknown[]): void => {
  if (VERBOSE) console.warn(yellowBright("warn"), ...messages)
}

log.error = (...messages: unknown[]): void => {
  if (VERBOSE) console.error(red("error"), ...messages)
}
