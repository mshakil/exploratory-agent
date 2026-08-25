import type { Action, Flow, FlowStep, Page, Transition } from "../models/index.js";
import type { Element } from "../models/index.js";
import { slugify } from "../discovery/index.js";

/**
 * Extract representative flows from executed action chains / transitions.
 * Keeps this deterministic — no LLM required for V1.
 */
export function extractFlows(params: {
  pages: Page[];
  elements: Element[];
  actions: Action[];
  transitions: Transition[];
}): Flow[] {
  const { pages, elements, actions, transitions } = params;
  const pageById = new Map(pages.map((p) => [p.id, p]));
  const elementById = new Map(elements.map((e) => [e.id, e]));
  const flows: Flow[] = [];
  const seen = new Set<string>();

  // Build flows from successful action sequences that change state
  const executed = actions.filter(
    (a) => a.status === "EXECUTED" && a.resultingStateId && a.resultingStateId !== a.pageId,
  );

  // Group by destination page for named destination flows
  const byDestination = new Map<string, Action[]>();
  for (const action of executed) {
    const dest = action.resultingStateId!;
    if (!byDestination.has(dest)) byDestination.set(dest, []);
    byDestination.get(dest)!.push(action);
  }

  for (const [destId, destActions] of byDestination) {
    const destPage = pageById.get(destId);
    if (!destPage) continue;

    // Prefer a short path via transitions
    const path = shortestPath(transitions, destActions[0]!.pageId, destId);
    const steps: FlowStep[] = [];

    if (path.length > 0) {
      path.forEach((t, i) => {
        const el = [...elementById.values()].find(
          (e) => e.name === t.action.element && e.pageId === t.from,
        );
        steps.push({
          order: i + 1,
          action: t.action.type,
          element: t.action.element,
          selector: el?.selectors.preferred,
          resultingState: pageById.get(t.to)?.name,
        });
      });
    } else {
      const action = destActions[0]!;
      const el = elementById.get(action.elementId);
      steps.push({
        order: 1,
        action: action.type,
        element: action.elementName,
        value: maskIfSensitive(action.value),
        selector: el?.selectors.preferred,
        resultingState: destPage.name,
      });
    }

    const name = inventFlowName(destPage, steps);
    const key = `${name}:${steps.map((s) => s.element).join(">")}`;
    if (seen.has(key)) continue;
    seen.add(key);

    flows.push({
      id: slugify(name),
      name,
      preconditions: [],
      steps,
      resultingState: destPage.name,
      outcome: `Reached ${destPage.name}`,
    });
  }

  // Form-oriented flows: type/select then submit-like click on same page lineage
  const formish = actions.filter(
    (a) =>
      a.status === "EXECUTED" &&
      (a.type === "type" || a.type === "select" || a.type === "check"),
  );
  if (formish.length > 0) {
    const submit = executed.find(
      (a) =>
        /save|submit|create|apply|login|sign/i.test(a.elementName) &&
        a.type === "click",
    );
    if (submit) {
      const related = formish.filter((a) => a.pageId === submit.pageId).slice(0, 6);
      if (related.length > 0) {
        const steps: FlowStep[] = [
          ...related.map((a, i) => {
            const el = elementById.get(a.elementId);
            return {
              order: i + 1,
              action: a.type,
              element: a.elementName,
              value: maskIfSensitive(a.value),
              selector: el?.selectors.preferred,
            };
          }),
          {
            order: related.length + 1,
            action: "click",
            element: submit.elementName,
            selector: elementById.get(submit.elementId)?.selectors.preferred,
            resultingState: pageById.get(submit.resultingStateId || "")?.name,
          },
        ];
        const name = `${submit.elementName} Flow`;
        const key = `form:${name}`;
        if (!seen.has(key)) {
          seen.add(key);
          flows.push({
            id: slugify(name),
            name,
            preconditions: [],
            steps,
            resultingState: pageById.get(submit.resultingStateId || "")?.name,
            outcome: "Form interaction completed",
          });
        }
      }
    }
  }

  return flows.slice(0, 50);
}

function inventFlowName(destPage: Page, steps: FlowStep[]): string {
  const last = steps[steps.length - 1];
  if (last?.element && /create|add|edit|save|login|open/i.test(last.element)) {
    return last.element;
  }
  if (destPage.reachedBy?.element) {
    return `${destPage.reachedBy.element} → ${destPage.name}`;
  }
  return `Navigate to ${destPage.name}`;
}

function shortestPath(
  transitions: Transition[],
  from: string,
  to: string,
): Transition[] {
  if (from === to) return [];
  const queue: { node: string; path: Transition[] }[] = [{ node: from, path: [] }];
  const visited = new Set<string>([from]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const outgoing = transitions.filter((t) => t.from === current.node);
    for (const t of outgoing) {
      if (visited.has(t.to)) continue;
      const nextPath = [...current.path, t];
      if (t.to === to) return nextPath;
      visited.add(t.to);
      queue.push({ node: t.to, path: nextPath });
      if (nextPath.length > 8) continue;
    }
  }
  return [];
}

function maskIfSensitive(value?: string): string | undefined {
  if (!value) return undefined;
  if (/pass|secret|token/i.test(value)) return "***";
  return value;
}
