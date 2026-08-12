// jsdom doesn't implement 2D canvas rendering (that requires the native
// `canvas` package). Entity symbols render jersey numbers onto a
// THREE.CanvasTexture via CanvasRenderingContext2D; tests only assert on the
// resulting scene graph, never on actual pixels, so a minimal no-op 2D
// context is enough to let that code run under jsdom.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: "",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    fillRect: () => {},
    clearRect: () => {},
    fillText: () => {},
    measureText: () => ({ width: 0 }),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
