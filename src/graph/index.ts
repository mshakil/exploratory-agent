import type { Page, Transition } from "../models/index.js";

export class ApplicationGraph {
  private pages = new Map<string, Page>();
  private byFingerprint = new Map<string, string>();
  private transitions: Transition[] = [];

  addPage(page: Page): Page {
    const existingId = this.byFingerprint.get(page.stateFingerprint);
    if (existingId) {
      return this.pages.get(existingId)!;
    }
    this.pages.set(page.id, page);
    this.byFingerprint.set(page.stateFingerprint, page.id);
    return page;
  }

  hasFingerprint(fingerprint: string): boolean {
    return this.byFingerprint.has(fingerprint);
  }

  getPageByFingerprint(fingerprint: string): Page | undefined {
    const id = this.byFingerprint.get(fingerprint);
    return id ? this.pages.get(id) : undefined;
  }

  getPage(id: string): Page | undefined {
    return this.pages.get(id);
  }

  updatePage(id: string, patch: Partial<Page>): void {
    const page = this.pages.get(id);
    if (!page) return;
    Object.assign(page, patch);
  }

  addTransition(transition: Transition): void {
    const exists = this.transitions.some(
      (t) =>
        t.from === transition.from &&
        t.to === transition.to &&
        t.action.element === transition.action.element &&
        t.action.type === transition.action.type,
    );
    if (!exists) {
      this.transitions.push(transition);
    }
  }

  listPages(): Page[] {
    return [...this.pages.values()];
  }

  listTransitions(): Transition[] {
    return [...this.transitions];
  }

  getChildren(pageId: string): Page[] {
    const childIds = new Set(
      this.transitions.filter((t) => t.from === pageId).map((t) => t.to),
    );
    return [...childIds].map((id) => this.pages.get(id)!).filter(Boolean);
  }

  serialize() {
    return {
      pages: this.listPages(),
      transitions: this.listTransitions(),
    };
  }

  static fromSerialized(data: {
    pages: Page[];
    transitions: Transition[];
  }): ApplicationGraph {
    const graph = new ApplicationGraph();
    for (const page of data.pages) {
      graph.pages.set(page.id, page);
      graph.byFingerprint.set(page.stateFingerprint, page.id);
    }
    graph.transitions = [...data.transitions];
    return graph;
  }
}
