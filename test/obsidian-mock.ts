// Runtime replacement for the `obsidian` module in tests (see vitest.config.ts).
// Add only the classes that the code under test uses at runtime. Keep the shapes equal to obsidian.d.ts.
export class Component {}
export class Plugin extends Component {}

// Value classes of Bases (obsidian.d.ts, since 1.10.0). Only the members that the code and the tests use.
export abstract class Value {
  static type = 'value';
  abstract toString(): string;
  abstract isTruthy(): boolean;
}

export abstract class NotNullValue extends Value {}

export class NullValue extends Value {
  static override type = 'null';
  static value = new NullValue();
  override toString(): string {
    return 'null';
  }
  isTruthy(): boolean {
    return false;
  }
}

export abstract class PrimitiveValue<T> extends NotNullValue {
  constructor(protected readonly value: T) {
    super();
  }
  override toString(): string {
    return String(this.value);
  }
  isTruthy(): boolean {
    return Boolean(this.value);
  }
}

export class StringValue extends PrimitiveValue<string> {
  static override type = 'string';
}

export class NumberValue extends PrimitiveValue<number> {
  static override type = 'number';
}

export class BooleanValue extends PrimitiveValue<boolean> {
  static override type = 'boolean';
}

/** The constructor takes the wikilink text, for example `[[Graph|graphs]]`. */
export class LinkValue extends StringValue {
  static override type = 'link';
}

export class ListValue extends NotNullValue {
  static override type = 'list';
  constructor(private readonly items: unknown[]) {
    super();
  }
  override toString(): string {
    return this.items.map(String).join(', ');
  }
  isTruthy(): boolean {
    return this.items.length > 0;
  }
  length(): number {
    return this.items.length;
  }
  get(index: number): Value {
    const item = this.items[index];
    return item instanceof Value ? item : NullValue.value;
  }
}
