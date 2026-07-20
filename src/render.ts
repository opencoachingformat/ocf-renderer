import * as THREE from "three";
import type { OcfDocument } from "./types/ocf";
import { ViewModeController, type ViewMode, type RenderFrameResult } from "./view-modes/view-mode-controller";
import { buildCamera } from "./scene/camera";
import { resolveCourtDimensions } from "./court/coordinate-transformer";

export interface OCFRendererOptions {
  mode?: ViewMode;
}

export class OCFRenderer {
  private readonly controller = new ViewModeController();

  constructor(private readonly document: OcfDocument, options: OCFRendererOptions = {}) {
    if (options.mode) this.controller.setMode(options.mode);
  }

  setMode(mode: ViewMode): void {
    this.controller.setMode(mode);
  }

  /** Builds the scene + a camera fit to the court, for the given frame. */
  renderFrame(frameIndex: number, aspect = 1): RenderFrameResult & { camera?: THREE.OrthographicCamera } {
    const result = this.controller.renderFrame(this.document, frameIndex);
    if (result.status !== "ok") return result;
    const dims = resolveCourtDimensions(this.document.court);
    const camera = buildCamera(dims, this.document.court.type, aspect);
    return { ...result, camera };
  }

  /** Renders directly to a canvas using WebGLRenderer — browser/Node-with-headless-gl only. */
  renderToCanvas(frameIndex: number, canvas: HTMLCanvasElement): void {
    const { clientWidth, clientHeight } = canvas;
    const aspect = clientWidth / clientHeight;
    const result = this.renderFrame(frameIndex, aspect);
    if (result.status !== "ok" || !result.camera) {
      throw new Error(`OCFRenderer.renderToCanvas: mode "${this.controller.getMode()}" is not implemented yet`);
    }
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(clientWidth, clientHeight, false);
    renderer.render(result.scene, result.camera);
  }

  dispose(scene: THREE.Scene): void {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry?.dispose();
        const material = obj.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      }
    });
  }
}
