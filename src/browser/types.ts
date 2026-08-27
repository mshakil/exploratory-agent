export interface ElementReference {
  /** Preferred selector strategy hint */
  strategy?: string;
  value?: string;
  role?: string;
  name?: string;
  /** Fallback CSS/XPath when needed */
  css?: string;
  xpath?: string;
  /** Index among matching elements */
  index?: number;
}

export interface ElementSnapshot {
  tag: string;
  type?: string;
  role?: string;
  text: string;
  accessibleName: string;
  attributes: Record<string, string>;
  isVisible: boolean;
  isEnabled: boolean;
  options?: string[];
  checked?: boolean;
  inputType?: string;
  placeholder?: string;
  href?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  /** Stable handle for interaction within current page load */
  handleId: string;
  cssPath?: string;
}

export interface ActionResult {
  success: boolean;
  error?: string;
  timedOut?: boolean;
}

export interface PageState {
  url: string;
  title: string;
  interactiveElements: ElementSnapshot[];
  modalOpen: boolean;
  activeTab?: string;
  visibleTextSample: string;
}

export interface BrowserAdapter {
  launch(options?: {
    headless?: boolean;
    storageState?: string;
    /** Default Playwright action timeout (ms) */
    timeoutMs?: number;
    /** Navigation/goto timeout (ms); defaults to max(timeoutMs, 30000) */
    navigationTimeoutMs?: number;
  }): Promise<void>;
  close(): Promise<void>;
  navigate(url: string): Promise<void>;
  getCurrentUrl(): Promise<string>;
  getPageTitle(): Promise<string>;
  getInteractiveElements(): Promise<ElementSnapshot[]>;
  click(element: ElementReference): Promise<ActionResult>;
  type(element: ElementReference, value: string): Promise<ActionResult>;
  select(element: ElementReference, value: string): Promise<ActionResult>;
  check(element: ElementReference, checked?: boolean): Promise<ActionResult>;
  getState(): Promise<PageState>;
  waitForStability(timeoutMs?: number, profile?: import("../models/index.js").StabilityProfile): Promise<void>;
  goBack(): Promise<void>;
  saveStorageState(path: string): Promise<void>;
}
