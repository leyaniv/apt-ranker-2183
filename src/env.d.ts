/// <reference types="vite/client" />

/** Injected at build time by Vite from package.json */
declare const __APP_VERSION__: string;

declare module "*.md?raw" {
  const content: string;
  export default content;
}
