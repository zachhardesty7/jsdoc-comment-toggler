import { cyan, red, yellowBright } from "ansi-colors"

const VERBOSE = process.env.VERBOSE_TESTS === "true"

/**
 * simple wrapper around `console.log` that only logs when `VERBOSE` is true
 *
 * @param messages - items to print to console
 */
export const log = (...messages: unknown[]): void => {
  if (VERBOSE) {
    console.log(...messages) // NOSONAR
  }
}

/**
 * simple wrapper around `console.info` that only logs when `VERBOSE` is true and
 * prefixes logged items with cyan colored string `"info"`
 *
 * @param messages - items to print to console
 */
log.info = (...messages: unknown[]): void => {
  if (VERBOSE) {
    console.info(cyan("info"), ...messages)
  }
}

/**
 * simple wrapper around `console.warn` that only logs when `VERBOSE` is true and
 * prefixes logged items with bright yellow colored string `"warn"`
 *
 * @param messages - items to print to console
 */
log.warn = (...messages: unknown[]): void => {
  if (VERBOSE) {
    console.warn(yellowBright("warn"), ...messages) // NOSONAR
  }
}

/**
 * simple wrapper around `console.error` that only logs when `VERBOSE` is true and
 * prefixes logged items with red colored string `"error"`
 *
 * @param messages - items to print to console
 */
log.error = (...messages: unknown[]): void => {
  if (VERBOSE) {
    console.error(red("error"), ...messages) // NOSONAR
  }
}
