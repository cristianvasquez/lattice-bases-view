/** A fixed-size set of indexes 0..size-1, stored as bits in a Uint32Array. */
export class BitSet {
  readonly size: number;
  readonly words: Uint32Array;

  constructor(size: number, words?: Uint32Array) {
    if (!Number.isInteger(size) || size < 0) throw new RangeError(`BitSet size must be a non-negative integer: ${size}`);
    const length = (size + 31) >>> 5;
    if (words && words.length !== length) throw new RangeError(`BitSet of size ${size} needs ${length} words, got ${words.length}`);
    this.size = size;
    this.words = words ?? new Uint32Array(length);
  }

  /** The empty set. */
  static empty(size: number): BitSet {
    return new BitSet(size);
  }

  /** The set of all indexes 0..size-1. */
  static full(size: number): BitSet {
    const set = new BitSet(size);
    set.words.fill(0xffffffff);
    const rest = size & 31;
    if (rest !== 0) set.words[set.words.length - 1] = ((1 << rest) - 1) >>> 0;
    return set;
  }

  static fromIndexes(size: number, indexes: Iterable<number>): BitSet {
    const set = new BitSet(size);
    for (const i of indexes) set.add(i);
    return set;
  }

  has(i: number): boolean {
    if (i < 0 || i >= this.size) return false;
    return ((this.words[i >>> 5]! >>> (i & 31)) & 1) === 1;
  }

  /** Adds index i in place. */
  add(i: number): void {
    if (!Number.isInteger(i) || i < 0 || i >= this.size) throw new RangeError(`Index ${i} is out of range 0..${this.size - 1}`);
    this.words[i >>> 5] = (this.words[i >>> 5]! | (1 << (i & 31))) >>> 0;
  }

  /** Removes index i in place. */
  delete(i: number): void {
    if (i < 0 || i >= this.size) return;
    this.words[i >>> 5] = (this.words[i >>> 5]! & ~(1 << (i & 31))) >>> 0;
  }

  clone(): BitSet {
    return new BitSet(this.size, this.words.slice());
  }

  /** Intersection. Returns a new set. */
  and(other: BitSet): BitSet {
    this.check(other);
    const out = new Uint32Array(this.words.length);
    for (let w = 0; w < out.length; w++) out[w] = this.words[w]! & other.words[w]!;
    return new BitSet(this.size, out);
  }

  /** Intersection in place. */
  andInPlace(other: BitSet): this {
    this.check(other);
    for (let w = 0; w < this.words.length; w++) this.words[w] = this.words[w]! & other.words[w]!;
    return this;
  }

  /** True when this set is a subset of other (equal sets included). */
  isSubsetOf(other: BitSet): boolean {
    this.check(other);
    for (let w = 0; w < this.words.length; w++) if ((this.words[w]! & ~other.words[w]!) !== 0) return false;
    return true;
  }

  equals(other: BitSet): boolean {
    if (this.size !== other.size) return false;
    for (let w = 0; w < this.words.length; w++) if (this.words[w] !== other.words[w]) return false;
    return true;
  }

  count(): number {
    let c = 0;
    for (let w = 0; w < this.words.length; w++) {
      let v = this.words[w]!;
      v -= (v >>> 1) & 0x55555555;
      v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
      c += Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
    }
    return c;
  }

  /** The indexes in the set, ascending. */
  members(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.size; i++) if (this.has(i)) out.push(i);
    return out;
  }

  /** A string that is equal for two sets exactly when the sets are equal (same size). */
  key(): string {
    return Array.prototype.join.call(this.words, ',');
  }

  private check(other: BitSet): void {
    if (other.size !== this.size) throw new RangeError(`BitSet size mismatch: ${this.size} and ${other.size}`);
  }
}

/**
 * Lectic comparison (Ganter) of two sets of the same size. The set that contains the smallest index where the sets differ is the larger set.
 * Returns a negative number, 0 or a positive number.
 */
export function compareLectic(a: BitSet, b: BitSet): number {
  if (a.size !== b.size) throw new RangeError(`BitSet size mismatch: ${a.size} and ${b.size}`);
  for (let w = 0; w < a.words.length; w++) {
    const x = a.words[w]!;
    const y = b.words[w]!;
    if (x === y) continue;
    const diff = (x ^ y) >>> 0;
    const lowest = 31 - Math.clz32(diff & -diff);
    return (x >>> lowest) & 1 ? 1 : -1;
  }
  return 0;
}
