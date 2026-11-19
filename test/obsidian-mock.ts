// Runtime replacement for the `obsidian` module in tests (see vitest.config.ts).
// Add only the classes that the code under test uses at runtime. Keep the shapes equal to obsidian.d.ts.
export class Component {}
export class Plugin extends Component {}
