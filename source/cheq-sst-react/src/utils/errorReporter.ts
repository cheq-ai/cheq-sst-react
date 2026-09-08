import type { SstErrorKind } from "../Types";

export type ErrorReporter = (msg: string, fn: string, kind: SstErrorKind) => void;

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
    reportedOnce.add(key);
    reportError(msg, fn, kind);
}
