import * as THREE from "three";
import type { OcfDocument } from "../types/ocf";
import { composeFrame } from "../scene/compose-frame";

export type ViewMode = "tactical_print" | "coaching_animation";

export type RenderFrameResult =
  | { status: "ok"; scene: THREE.Scene }
  | { status: "not_implemented"; mode: ViewMode };

export class ViewModeController {
  private mode: ViewMode = "tactical_print";

  setMode(mode: ViewMode): void {
    this.mode = mode;
  }

  getMode(): ViewMode {
    return this.mode;
  }

  renderFrame(doc: OcfDocument, frameIndex: number): RenderFrameResult {
    if (this.mode === "tactical_print") {
      return { status: "ok", scene: composeFrame(doc, frameIndex) };
    }
    return { status: "not_implemented", mode: this.mode };
  }
}
