import type { OcfDocument, FrameState } from "../types/ocf";

export function resolveFrameState(
  doc: OcfDocument,
  frameIndex: number,
  which: "start" | "end",
): FrameState {
  const frame = doc.frames[frameIndex];
  if (!frame) {
    throw new Error(`resolveFrameState: frame index ${frameIndex} out of range`);
  }

  if (which === "end") {
    return frame.end_state ?? resolveFrameState(doc, frameIndex, "start");
  }

  if (frame.start_state) return frame.start_state;

  if (frameIndex === 0) {
    throw new Error(
      `resolveFrameState: frame "${frame.id}" (index 0) has no start_state and there is ` +
        `no previous frame to inherit an end_state from.`,
    );
  }

  const prevEnd = doc.frames[frameIndex - 1]?.end_state;
  if (prevEnd) return prevEnd;

  throw new Error(
    `resolveFrameState: frame "${frame.id}" has no start_state, and the previous frame ` +
      `("${doc.frames[frameIndex - 1]?.id}") has no end_state to inherit from.`,
  );
}
