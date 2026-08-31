import type { Action } from "../types/ocf";

/** An action's self-reference in `after` syntax: "<entity_ref>.<action_type>". */
function actionRef(action: Action): string {
  return `${action.player}.${action.type}`;
}

/** Result of ordering a frame's actions by their `after` dependencies. */
export interface OrderedFrameActions {
  /** Actions in an order where every action follows its `after` dependency. */
  ordered: Action[];
  /** Actions involved in a cycle or referencing a non-existent action — their
   *  ordering edge is dropped and they should be drawn highlighted. */
  conflicts: Set<Action>;
}

/** Topologically sort a frame's actions using `after` as edges. `after`-free
 *  actions (and ties) keep document order (stable). A cycle or dangling `after`
 *  is soft: the offending edge is dropped, the action is flagged in `conflicts`,
 *  and ordering continues without throwing. See
 *  docs/superpowers/specs/2026-08-31-after-ordering-and-legibility-design.md. */
export function orderFrameActions(actions: Action[]): OrderedFrameActions {
  const conflicts = new Set<Action>();

  // Map each ref to the action that declares it. If two actions share a ref
  // (same player+type twice in a frame), the first wins as the dependency target.
  const byRef = new Map<string, Action>();
  for (const a of actions) {
    const ref = actionRef(a);
    if (!byRef.has(ref)) byRef.set(ref, a);
  }

  // Build dependency edges: action -> the action it must follow.
  const dependsOn = new Map<Action, Action | null>();
  for (const a of actions) {
    const after = (a as { after?: string }).after;
    if (!after) {
      dependsOn.set(a, null);
      continue;
    }
    const target = byRef.get(after);
    if (!target || target === a) {
      // Dangling (or self) reference: drop the edge, flag the action.
      conflicts.add(a);
      dependsOn.set(a, null);
    } else {
      dependsOn.set(a, target);
    }
  }

  // Detect cycles by walking each action's dependency chain; if we revisit an
  // action already on the current path, every action on that path is in a cycle.
  const inCycle = new Set<Action>();
  for (const start of actions) {
    const path: Action[] = [];
    const seen = new Set<Action>();
    let node: Action | null = start;
    while (node) {
      if (seen.has(node)) {
        // Mark from the first occurrence of `node` to the end of the path.
        const from = path.indexOf(node);
        for (let i = from; i < path.length; i++) inCycle.add(path[i]);
        break;
      }
      seen.add(node);
      path.push(node);
      node = dependsOn.get(node) ?? null;
    }
  }
  for (const a of inCycle) {
    conflicts.add(a);
    dependsOn.set(a, null); // drop cyclic edges so the sort can proceed
  }

  // Stable topological order: repeatedly emit actions whose dependency is already
  // emitted (or null), scanning in document order to keep ties stable.
  const ordered: Action[] = [];
  const emitted = new Set<Action>();
  while (ordered.length < actions.length) {
    let progressed = false;
    for (const a of actions) {
      if (emitted.has(a)) continue;
      const dep = dependsOn.get(a) ?? null;
      if (dep === null || emitted.has(dep)) {
        ordered.push(a);
        emitted.add(a);
        progressed = true;
      }
    }
    if (!progressed) {
      // Safety net: any remainder (shouldn't happen after cycle-breaking) is
      // appended in document order so we never loop forever.
      for (const a of actions) if (!emitted.has(a)) { ordered.push(a); emitted.add(a); }
      break;
    }
  }

  return { ordered, conflicts };
}
