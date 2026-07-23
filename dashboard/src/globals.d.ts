// Ambient declarations for the Hermes plugin host runtime.
// React + the plugin SDK are injected at runtime by the dashboard host via
// window.__HERMES_PLUGIN_SDK__; we only augment the Window type for
// type-checking. (React is pulled off the SDK at runtime inside index.tsx.)
declare global {
  interface Window {
    __HERMES_PLUGIN_SDK__?: any;
    __HERMES_PLUGINS__?: { register: (name: string, component: any) => void };
  }
}

export {};
