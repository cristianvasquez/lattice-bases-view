import { BitSet, compareLectic } from './bitset';
import type { FormalContext } from './context';

/** A formal concept. `support` is the number of objects in the extent. */
export interface Concept {
  readonly extent: BitSet;
  readonly intent: BitSet;
  readonly support: number;
}

function checkSize(set: BitSet, size: number, kind: string): void {
  if (set.size !== size) throw new RangeError(`Expected a set of ${size} ${kind}, got size ${set.size}`);
}

/** A': the attributes that all objects of A have. For A = ∅ this is the set of all attributes. */
export function intentOfObjects(ctx: FormalContext, objects: BitSet): BitSet {
  checkSize(objects, ctx.objects.length, 'objects');
  const intent = BitSet.full(ctx.attributes.length);
  for (const g of objects.members()) intent.andInPlace(ctx.objectRows[g]!);
  return intent;
}

/** B': the objects that have all attributes of B. For B = ∅ this is the set of all objects. */
export function extentOfAttributes(ctx: FormalContext, attributes: BitSet): BitSet {
  checkSize(attributes, ctx.attributes.length, 'attributes');
  const extent = BitSet.full(ctx.objects.length);
  for (const m of attributes.members()) extent.andInPlace(ctx.attributeColumns[m]!);
  return extent;
}

/** B'': the closure of an attribute set. */
export function closeAttributes(ctx: FormalContext, attributes: BitSet): BitSet {
  return intentOfObjects(ctx, extentOfAttributes(ctx, attributes));
}

/** A'': the closure of an object set. */
export function closeObjects(ctx: FormalContext, objects: BitSet): BitSet {
  return extentOfAttributes(ctx, intentOfObjects(ctx, objects));
}

/** The concept (B', B''). */
export function conceptOfAttributes(ctx: FormalContext, attributes: BitSet): Concept {
  const extent = extentOfAttributes(ctx, attributes);
  return { extent, intent: intentOfObjects(ctx, extent), support: extent.count() };
}

/** The concept (A'', A'). */
export function conceptOfObjects(ctx: FormalContext, objects: BitSet): Concept {
  const intent = intentOfObjects(ctx, objects);
  const extent = extentOfAttributes(ctx, intent);
  return { extent, intent, support: extent.count() };
}

/**
 * All concepts, each one time, with Next Closure (Ganter) on the attribute closure, in lectic order of the intents.
 * The first concept is (∅', ∅''). The last concept has the intent of all attributes; its support can be 0.
 */
export function* nextClosureConcepts(ctx: FormalContext): Generator<Concept, void, undefined> {
  const m = ctx.attributes.length;
  let current = conceptOfAttributes(ctx, BitSet.empty(m));
  for (;;) {
    yield current;
    let next: Concept | undefined;
    // prefix = current.intent ∩ {0..i-1}, built by removing the indexes ≥ i while i goes down.
    const prefix = current.intent.clone();
    for (let i = m - 1; i >= 0; i--) {
      if (current.intent.has(i)) {
        prefix.delete(i);
        continue;
      }
      const generator = prefix.clone();
      generator.add(i);
      const candidate = conceptOfAttributes(ctx, generator);
      // Canonicity test: the closure adds no index smaller than i.
      if (candidate.intent.and(lowerMask(m, i)).equals(prefix)) {
        next = candidate;
        break;
      }
    }
    if (!next) return;
    current = next;
  }
}

function lowerMask(size: number, i: number): BitSet {
  const mask = BitSet.empty(size);
  for (let w = 0; w < i >>> 5; w++) mask.words[w] = 0xffffffff;
  if (i & 31) mask.words[i >>> 5] = ((1 << (i & 31)) - 1) >>> 0;
  return mask;
}

/** Order for neighbour lists: larger support first, then lectic order of the intents. */
export function compareBySupport(a: Concept, b: Concept): number {
  return b.support - a.support || compareLectic(a.intent, b.intent);
}

/** The concepts that the given concept covers (its lower neighbours in the full lattice), largest support first. */
export function lowerNeighbours(ctx: FormalContext, concept: Concept): Concept[] {
  const candidates = new Map<string, BitSet>();
  for (let j = 0; j < ctx.attributes.length; j++) {
    if (concept.intent.has(j)) continue;
    const extent = concept.extent.and(ctx.attributeColumns[j]!);
    candidates.set(extent.key(), extent);
  }
  const extents = [...candidates.values()];
  const maximal = extents.filter((e) => !extents.some((d) => d !== e && e.isSubsetOf(d)));
  return maximal
    .map((extent) => ({ extent, intent: intentOfObjects(ctx, extent), support: extent.count() }))
    .sort(compareBySupport);
}

/** The concepts that cover the given concept (its upper neighbours in the full lattice), smallest support first. */
export function upperNeighbours(ctx: FormalContext, concept: Concept): Concept[] {
  const candidates = new Map<string, Concept>();
  for (let g = 0; g < ctx.objects.length; g++) {
    if (concept.extent.has(g)) continue;
    const intent = concept.intent.and(ctx.objectRows[g]!);
    const key = intent.key();
    if (candidates.has(key)) continue;
    const extent = extentOfAttributes(ctx, intent);
    candidates.set(key, { extent, intent, support: extent.count() });
  }
  const concepts = [...candidates.values()];
  return concepts
    .filter((c) => !concepts.some((d) => d !== c && c.intent.isSubsetOf(d.intent)))
    .sort((a, b) => a.support - b.support || compareLectic(a.intent, b.intent));
}
