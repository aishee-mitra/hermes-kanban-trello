// Ambient declarations for the Hermes plugin host runtime.
// React + the plugin SDK are injected at runtime by the dashboard host via
// window.__HERMES_PLUGIN_SDK__; we only need the Window augmentation for
// type-checking. (The `h` factory is declared locally in index.tsx.)
import * as React from "react";

declare global {
  interface Window {
    __HERMES_PLUGIN_SDK__?: any;
    __HERMES_PLUGINS__?: { register: (name: string, component: any) => void };
  }
}

export {};
