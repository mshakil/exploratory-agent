export type { BrowserAdapter, ElementReference, ElementSnapshot, ActionResult, PageState } from "./types.js";
export { PlaywrightAdapter } from "./playwright-adapter.js";
export {
  ensurePlaywrightBrowsersPath,
  ensurePlaywrightChromiumInstalled,
  resolveChromiumExecutable,
} from "./ensure-browsers-path.js";

