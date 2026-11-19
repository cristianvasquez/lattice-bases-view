// Conversion of evaluated Bases values. Needs the runtime classes of `obsidian` (instanceof checks).
import { LinkValue, ListValue, NullValue, type Value } from 'obsidian';
import type { ConvertedValue } from './atlas';

/**
 * `obsidian.d.ts` names `ErrorValue` in the JSDoc of `BasesEntry.getValue` but does not export the class.
 * This check uses the static `type` of the value class (all Value classes have one), with the class name as a fallback.
 */
function isErrorValue(value: Value): boolean {
  const ctor = value.constructor as { type?: unknown; name?: unknown };
  return ctor.type === 'error' || ctor.name === 'ErrorValue';
}

function errorMessage(value: Value): string {
  const message = (value as { message?: unknown }).message;
  if (typeof message === 'string' && message.trim() !== '') return message.trim();
  return normalize(value.toString()) || 'Unknown error';
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** Display text of a wikilink, else its target, without `[[` and `]]`. */
function linkText(value: LinkValue): string {
  const text = normalize(value.toString());
  const match = /^\[\[(.*)\]\]$/.exec(text);
  if (match === null) return text;
  const inner = match[1] ?? '';
  const bar = inner.indexOf('|');
  if (bar < 0) return normalize(inner);
  const display = normalize(inner.slice(bar + 1));
  return display !== '' ? display : normalize(inner.slice(0, bar));
}

/** Appends the values of `value` to `out`. Returns the error message when `value` or one of its elements is an error. */
function collect(value: Value | null, out: string[]): string | null {
  if (value === null || value instanceof NullValue) return null;
  if (isErrorValue(value)) return errorMessage(value);
  if (value instanceof ListValue) {
    for (let i = 0; i < value.length(); i++) {
      const error = collect(value.get(i), out);
      if (error !== null) return error;
    }
    return null;
  }
  const text = value instanceof LinkValue ? linkText(value) : normalize(value.toString());
  if (text !== '') out.push(text);
  return null;
}

/**
 * Converts one evaluated value to the values of a facet.
 * `null`, `NullValue`, empty text and lists without values are "unannotated": no value is recorded.
 * Nested lists are flattened. An error anywhere in the value makes the result an error.
 */
export function convertValue(value: Value | null): ConvertedValue {
  const values: string[] = [];
  const error = collect(value, values);
  if (error !== null) return { kind: 'error', message: error };
  if (values.length === 0) return { kind: 'unannotated' };
  return { kind: 'values', values };
}
