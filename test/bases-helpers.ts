// Fake Bases entries for the tests of src/bases. The values come from the mock classes (test/obsidian-mock.ts).
import { NotNullValue, type BasesEntry, type BasesPropertyId, type TFile, type Value } from 'obsidian';

/** Stand-in for the ErrorValue of Obsidian. obsidian.d.ts does not export that class; the adapter detects it by its static `type`. */
export class FakeErrorValue extends NotNullValue {
  static override type = 'error';
  constructor(readonly message: string) {
    super();
  }
  override toString(): string {
    return this.message;
  }
  override isTruthy(): boolean {
    return false;
  }
}

export function entry(path: string, values: Partial<Record<BasesPropertyId, Value | null>>): BasesEntry {
  const basename = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
  const file = { path, basename } as TFile;
  return { file, getValue: (id: BasesPropertyId) => values[id] ?? null } as BasesEntry;
}
