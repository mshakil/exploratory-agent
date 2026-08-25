import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import type {
  Action,
  Application,
  Element,
  ExplorationMeta,
  Flow,
  Page,
  Transition,
} from "../models/index.js";

export interface MemorySnapshot {
  application: Application;
  pages: Page[];
  elements: Element[];
  flows: Flow[];
  actions: Action[];
  transitions: Transition[];
  exploration: ExplorationMeta;
  visitedFingerprints: string[];
}

export class MemoryStore {
  constructor(private readonly memoryDir: string) {}

  async ensure(): Promise<void> {
    await mkdir(this.memoryDir, { recursive: true });
  }

  private file(name: string): string {
    return path.join(this.memoryDir, name);
  }

  async exists(): Promise<boolean> {
    try {
      await access(this.file("exploration.json"));
      return true;
    } catch {
      return false;
    }
  }

  async save(snapshot: MemorySnapshot): Promise<void> {
    await this.ensure();
    await Promise.all([
      writeFile(this.file("pages.json"), JSON.stringify(snapshot.pages, null, 2)),
      writeFile(this.file("elements.json"), JSON.stringify(snapshot.elements, null, 2)),
      writeFile(this.file("flows.json"), JSON.stringify(snapshot.flows, null, 2)),
      writeFile(this.file("actions.json"), JSON.stringify(snapshot.actions, null, 2)),
      writeFile(this.file("transitions.json"), JSON.stringify(snapshot.transitions, null, 2)),
      writeFile(
        this.file("exploration.json"),
        JSON.stringify(
          {
            application: snapshot.application,
            exploration: snapshot.exploration,
            visitedFingerprints: snapshot.visitedFingerprints,
          },
          null,
          2,
        ),
      ),
      writeFile(
        this.file("selectors.json"),
        JSON.stringify(
          snapshot.elements.map((e) => ({
            elementId: e.id,
            elementName: e.name,
            pageId: e.pageId,
            selectors: e.selectors,
            confidence: e.confidence,
          })),
          null,
          2,
        ),
      ),
    ]);
  }

  async load(): Promise<MemorySnapshot | null> {
    if (!(await this.exists())) return null;

    const explorationRaw = JSON.parse(
      await readFile(this.file("exploration.json"), "utf8"),
    ) as {
      application: Application;
      exploration: ExplorationMeta;
      visitedFingerprints: string[];
    };

    const readJson = async <T>(name: string, fallback: T): Promise<T> => {
      try {
        return JSON.parse(await readFile(this.file(name), "utf8")) as T;
      } catch {
        return fallback;
      }
    };

    return {
      application: explorationRaw.application,
      exploration: explorationRaw.exploration,
      visitedFingerprints: explorationRaw.visitedFingerprints ?? [],
      pages: await readJson<Page[]>("pages.json", []),
      elements: await readJson<Element[]>("elements.json", []),
      flows: await readJson<Flow[]>("flows.json", []),
      actions: await readJson<Action[]>("actions.json", []),
      transitions: await readJson<Transition[]>("transitions.json", []),
    };
  }
}
