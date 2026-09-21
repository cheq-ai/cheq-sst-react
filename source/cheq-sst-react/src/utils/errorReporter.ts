import type { SstErrorKind } from "../Types";

/** Return false to signal the report was dropped: a once-key is then not burned and may retry. */
export type ErrorReporter = (msg: string, fn: string, kind: SstErrorKind) => boolean | void;

// Injected by Sst so modules it imports can report errors without a circular import.
let reportError: ErrorReporter = () => {};
const reportedOnce = new Set<string>();

export function setErrorReporter(reporter: ErrorReporter) {
    reportError = reporter;
}

export function reportSstError(msg: string, fn: string, kind: SstErrorKind) {
    reportError(msg, fn, kind);
}

/** For conditions that persist for the whole session; beaconing per event would flood. */
export function reportSstErrorOnce(key: string, msg: string, fn: string, kind: SstErrorKind) {
    if (reportedOnce.has(key)) return;
    if (reportError(msg, fn, kind) === false) return;
    reportedOnce.add(key);
}
