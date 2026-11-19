import { Notice, Plugin } from 'obsidian';
import { MAX_CONCEPTS, MAX_NODES, VIEW_TYPE } from './view/config';
import { ConceptLatticeView } from './view/lattice-view';

export default class ConceptAtlasPlugin extends Plugin {
  override async onload(): Promise<void> {
    const registered = this.registerBasesView(VIEW_TYPE, {
      name: 'Concept lattice',
      icon: 'network',
      factory: (controller, containerEl) => new ConceptLatticeView(controller, containerEl),
      options: () => [
        {
          type: 'slider',
          key: 'maxConcepts',
          displayName: 'Concept budget (full lattice)',
          min: MAX_CONCEPTS.min,
          max: MAX_CONCEPTS.max,
          step: MAX_CONCEPTS.step,
          default: MAX_CONCEPTS.default,
        },
        {
          type: 'slider',
          key: 'maxNodes',
          displayName: 'Concepts in the diagram',
          min: MAX_NODES.min,
          max: MAX_NODES.max,
          step: MAX_NODES.step,
          default: MAX_NODES.default,
        },
      ],
    });
    if (!registered) new Notice('Concept Atlas: Bases is not enabled. Enable the core plugin Bases to use the Concept lattice layout.');
  }
}
