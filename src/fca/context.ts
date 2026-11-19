import { BitSet } from './bitset';

/**
 * A formal context (G, M, I). Objects and attributes are string ids in the given order. Index i of a bit set refers to objects[i] or attributes[i].
 * `objectRows[g]` is the set of attributes of object g. `attributeColumns[m]` is the set of objects that have attribute m.
 */
export interface FormalContext {
  readonly objects: readonly string[];
  readonly attributes: readonly string[];
  readonly objectIndex: ReadonlyMap<string, number>;
  readonly attributeIndex: ReadonlyMap<string, number>;
  readonly objectRows: readonly BitSet[];
  readonly attributeColumns: readonly BitSet[];
}

function indexIds(ids: readonly string[], kind: string): Map<string, number> {
  const index = new Map<string, number>();
  ids.forEach((id, i) => {
    if (index.has(id)) throw new Error(`Duplicate ${kind} id: ${id}`);
    index.set(id, i);
  });
  return index;
}

/** Creates a formal context. Throws an Error for a duplicate id or for an incidence pair with an unknown id. */
export function createContext(objects: string[], attributes: string[], incidence: Iterable<readonly [string, string]>): FormalContext {
  const objectList = [...objects];
  const attributeList = [...attributes];
  const objectIndex = indexIds(objectList, 'object');
  const attributeIndex = indexIds(attributeList, 'attribute');
  const objectRows = objectList.map(() => BitSet.empty(attributeList.length));
  const attributeColumns = attributeList.map(() => BitSet.empty(objectList.length));
  for (const [object, attribute] of incidence) {
    const g = objectIndex.get(object);
    if (g === undefined) throw new Error(`Incidence pair has an unknown object id: ${object}`);
    const m = attributeIndex.get(attribute);
    if (m === undefined) throw new Error(`Incidence pair has an unknown attribute id: ${attribute}`);
    objectRows[g]!.add(m);
    attributeColumns[m]!.add(g);
  }
  return { objects: objectList, attributes: attributeList, objectIndex, attributeIndex, objectRows, attributeColumns };
}

/** The set of objects with the given ids. Throws an Error for an unknown id. */
export function objectSet(ctx: FormalContext, ids: Iterable<string>): BitSet {
  const set = BitSet.empty(ctx.objects.length);
  for (const id of ids) {
    const g = ctx.objectIndex.get(id);
    if (g === undefined) throw new Error(`Unknown object id: ${id}`);
    set.add(g);
  }
  return set;
}

/** The set of attributes with the given ids. Throws an Error for an unknown id. */
export function attributeSet(ctx: FormalContext, ids: Iterable<string>): BitSet {
  const set = BitSet.empty(ctx.attributes.length);
  for (const id of ids) {
    const m = ctx.attributeIndex.get(id);
    if (m === undefined) throw new Error(`Unknown attribute id: ${id}`);
    set.add(m);
  }
  return set;
}

/** The ids of the objects in the set, in context order. */
export function objectIds(ctx: FormalContext, set: BitSet): string[] {
  return set.members().map((g) => ctx.objects[g]!);
}

/** The ids of the attributes in the set, in context order. */
export function attributeIds(ctx: FormalContext, set: BitSet): string[] {
  return set.members().map((m) => ctx.attributes[m]!);
}
