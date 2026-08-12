import { entityRef, type Ball, type BallState, type Coordinate, type FrameState, type OcfDocument } from "../types/ocf";

/** Fully resolved state: every entity ref -> Coordinate, every ball id -> BallState. */
export interface ResolvedFrameState {
  positions: Record<string, Coordinate>;
  balls: Record<string, BallState>;
}

function ballStateOf(ball: Ball): BallState {
  if (ball.carried_by !== undefined) return { carried_by: ball.carried_by };
  if (ball.at !== undefined) return { at: ball.at };
  return { dead: true };
}

function applyState(acc: ResolvedFrameState, state: FrameState | undefined): void {
  if (!state) return;
  for (const [key, value] of Object.entries(state)) {
    if (key === "balls" || value === undefined) continue;
    acc.positions[key] = value as Coordinate;
  }
  if (state.balls) Object.assign(acc.balls, state.balls);
}

export function resolveFrameState(
  doc: OcfDocument,
  frameIndex: number,
  which: "start" | "end",
): ResolvedFrameState {
  if (!doc.frames[frameIndex]) {
    throw new Error(`resolveFrameState: frame index ${frameIndex} out of range`);
  }

  const acc: ResolvedFrameState = { positions: {}, balls: {} };
  for (const entity of doc.entities) {
    acc.positions[entityRef(entity)] = { x: entity.x, y: entity.y };
  }
  for (const ball of doc.balls ?? []) {
    acc.balls[ball.id] = ballStateOf(ball);
  }

  for (let i = 0; i <= frameIndex; i++) {
    applyState(acc, doc.frames[i].start_state);
    if (i < frameIndex || which === "end") applyState(acc, doc.frames[i].end_state);
  }
  return acc;
}
