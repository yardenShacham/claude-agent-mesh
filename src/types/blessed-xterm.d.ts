declare module "blessed-xterm" {
  import blessed from "blessed";

  interface XTermOptions extends blessed.Widgets.BoxOptions {
    shell?: string | null;
    args?: string[];
    env?: Record<string, string | undefined>;
    cwd?: string;
    cursorType?: "block" | "underline" | "bar";
    scrollback?: number;
    controlKey?: string;
    ignoreKeys?: string[];
    mousePassthrough?: boolean;
  }

  class XTerm extends blessed.Widgets.BoxElement {
    pty: unknown;
    scrolling: boolean;
    constructor(options?: XTermOptions);
    spawn(shell: string, args?: string[], cwd?: string, env?: Record<string, string | undefined>): void;
    write(data: string): void;
    terminate(): void;
    kill(): void;
    enableInput(process: boolean): void;
    injectInput(data: string): void;
    getScrollPerc(): number;
    scroll(offset: number): void;
    resetScroll(): void;
  }

  export = XTerm;
}
