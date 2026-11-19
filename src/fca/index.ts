// FCA core. Pure TypeScript: no import of `obsidian`, no DOM, no Node API.
export { BitSet, compareLectic } from './bitset';
export { type FormalContext, createContext, objectSet, attributeSet, objectIds, attributeIds } from './context';
export {
  type Concept,
  intentOfObjects,
  extentOfAttributes,
  closeAttributes,
  closeObjects,
  conceptOfAttributes,
  conceptOfObjects,
  nextClosureConcepts,
  compareBySupport,
  lowerNeighbours,
  upperNeighbours,
} from './derivation';
export { type Cover, type LatticeStatus, type BuildLatticeOptions, type LatticeResult, buildLattice } from './lattice';
export { type ExploreResult, exploreBySupport } from './explore';
