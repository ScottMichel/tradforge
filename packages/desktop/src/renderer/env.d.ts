import type { TradforgeBridge } from "../shared/bridge.js";

declare global {
  interface Window {
    /** Exposed by the preload script. */
    readonly tradforge: TradforgeBridge;
  }
}
