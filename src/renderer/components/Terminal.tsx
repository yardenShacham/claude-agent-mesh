import { useEffect, useRef, useState } from "react";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

/** Shell-escape a file path (wrap in single quotes if it contains special chars). */
function shellEscape(path: string) {
  if (/[^a-zA-Z0-9_.\/\-]/.test(path)) {
    return "'" + path.replace(/'/g, "'\\''") + "'";
  }
  return path;
}

interface TerminalProps {
  agentName: string;
  visible: boolean;
}

const THEME = {
  background: "#1e1e1e",
  foreground: "#e0e0e0",
  cursor: "#e0e0e0",
  cursorAccent: "#1e1e1e",
  selectionBackground: "#264f78",
  black: "#1e1e1e",
  red: "#f48771",
  green: "#4ec9b0",
  yellow: "#dcdcaa",
  blue: "#75beff",
  magenta: "#c586c0",
  cyan: "#9cdcfe",
  white: "#e0e0e0",
  brightBlack: "#7e7e8e",
  brightRed: "#f48771",
  brightGreen: "#4ec9b0",
  brightYellow: "#dcdcaa",
  brightBlue: "#75beff",
  brightMagenta: "#c586c0",
  brightCyan: "#9cdcfe",
  brightWhite: "#ffffff",
};

export function Terminal({ agentName, visible }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const openedRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const unsubDataRef = useRef<(() => void) | null>(null);
  const unsubExitRef = useRef<(() => void) | null>(null);
  const rafIdRef = useRef(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // Drag-and-drop: use native capture-phase listeners so events fire before
  // xterm.js child elements can intercept or swallow them.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let dragCounter = 0;

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setDragging(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      setDragging(false);
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const filePath = window.electronAPI.getFilePath(files[i]);
        if (filePath) paths.push(shellEscape(filePath));
      }
      if (paths.length > 0) {
        window.electronAPI.writePty(agentName, paths.join(" "));
      }
    };

    const opts = { capture: true };
    wrapper.addEventListener("dragover", onDragOver, opts);
    wrapper.addEventListener("dragenter", onDragEnter, opts);
    wrapper.addEventListener("dragleave", onDragLeave, opts);
    wrapper.addEventListener("drop", onDrop, opts);

    return () => {
      wrapper.removeEventListener("dragover", onDragOver, opts);
      wrapper.removeEventListener("dragenter", onDragEnter, opts);
      wrapper.removeEventListener("dragleave", onDragLeave, opts);
      wrapper.removeEventListener("drop", onDrop, opts);
    };
  }, [agentName]);

  // Single effect: create terminal (lazily) and open into DOM when visible
  useEffect(() => {
    const container = containerRef.current;
    if (!visible || !container) return;

    // Create terminal instance and IPC listeners once
    if (!terminalRef.current) {
      const terminal = new XTerminal({
        theme: THEME,
        fontFamily: "Menlo, Monaco, 'Courier New', monospace",
        fontSize: 13,
        scrollback: 5000,
        cursorBlink: true,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Forward keyboard input to PTY
      terminal.onData((data) => {
        window.electronAPI.writePty(agentName, data);
      });

      // Listen for PTY exit
      unsubExitRef.current = window.electronAPI.onPtyExit((name) => {
        if (name !== agentName) return;
        terminal.write("\r\n\x1b[33m  Session ended. Press Enter to restart.\x1b[0m\r\n");
        const disposable = terminal.onData((d) => {
          if (d === "\r" || d === "\n") {
            disposable.dispose();
            terminal.clear();
            window.electronAPI.restartAgent(agentName);
          }
        });
      });
    }

    const terminal = terminalRef.current!;
    const fitAddon = fitAddonRef.current!;

    if (!openedRef.current) {
      // Wait for container to have dimensions before opening
      let attempts = 0;
      const tryOpen = () => {
        if (container.offsetWidth > 0 && container.offsetHeight > 0) {
          terminal.open(container);
          openedRef.current = true;

          // Subscribe to PTY data BEFORE fit/resize so we catch the
          // SIGWINCH-triggered re-render. Any stale buffered data from the
          // old 120×30 layout was never collected (listener starts here).
          unsubDataRef.current = window.electronAPI.onPtyData((name, data) => {
            if (name !== agentName) return;
            terminal.write(data);
          });

          // Fit and resize — triggers SIGWINCH → Claude Code re-renders
          // for correct dimensions, which the listener above will receive.
          fitAddon.fit();
          window.electronAPI.resizePty(agentName, terminal.cols, terminal.rows);

          // Set up ResizeObserver for subsequent resizes.
          // Debounce and skip no-ops to avoid scroll jumps during output.
          let resizeTimer = 0;
          let lastCols = terminal.cols;
          let lastRows = terminal.rows;
          const observer = new ResizeObserver(() => {
            clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(() => {
              if (container.offsetWidth > 0 && container.offsetHeight > 0) {
                // Remember if viewport is at the bottom before fit() potentially
                // disrupts scroll position during active output
                const buf = terminal.buffer.active;
                const wasAtBottom = buf.viewportY === buf.baseY;

                fitAddon.fit();
                if (terminal.cols !== lastCols || terminal.rows !== lastRows) {
                  lastCols = terminal.cols;
                  lastRows = terminal.rows;
                  window.electronAPI.resizePty(agentName, terminal.cols, terminal.rows);
                }

                // Restore scroll position to prevent the "scroll jumps up" bug
                // where fit() disrupts auto-scroll during active output
                if (wasAtBottom) {
                  terminal.scrollToBottom();
                }
              }
            }, 100);
          });
          observer.observe(container);
          resizeObserverRef.current = observer;

          terminal.focus();
        } else if (attempts < 20) {
          attempts++;
          rafIdRef.current = requestAnimationFrame(tryOpen);
        }
      };
      rafIdRef.current = requestAnimationFrame(tryOpen);
    } else {
      // Already opened — do a full refresh (like manual Cmd+Shift+T).
      // After display:none → display:block the canvas context and glyph
      // texture atlas can be stale, so a simple fit+resize isn't enough.
      requestAnimationFrame(() => {
        if (typeof (terminal as any).clearTextureAtlas === "function") {
          (terminal as any).clearTextureAtlas();
        }

        fitAddon.fit();
        terminal.refresh(0, terminal.rows - 1);

        // Fake resize cycle to force Claude Code's TUI to fully redraw
        const cols = terminal.cols;
        const rows = terminal.rows;
        window.electronAPI.resizePty(agentName, cols - 1, rows);
        setTimeout(() => {
          window.electronAPI.resizePty(agentName, cols, rows);
        }, 100);
      });
      terminal.focus();
    }

    return () => {
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [visible, agentName]);

  // Manual refresh triggered via menu or command palette (post-sleep recovery).
  // After macOS sleep the canvas rendering context can become stale, so we:
  // 1. Clear the glyph texture atlas to force re-rasterization
  // 2. Fit the terminal to recalculate dimensions
  // 3. Temporarily resize the PTY (cols-1) then back to force a full SIGWINCH
  //    cycle — Claude Code re-renders its UI at the "new" size, which populates
  //    fresh data into the terminal buffer and forces a complete canvas repaint.
  useEffect(() => {
    return window.electronAPI.onMenuRefreshTerminals(() => {
      if (terminalRef.current && openedRef.current && fitAddonRef.current) {
        const terminal = terminalRef.current;
        const fitAddon = fitAddonRef.current;

        // Clear cached glyph textures (available with allowProposedApi)
        if (typeof (terminal as any).clearTextureAtlas === "function") {
          (terminal as any).clearTextureAtlas();
        }

        fitAddon.fit();
        terminal.refresh(0, terminal.rows - 1);

        // Fake resize cycle: shrink by 1 col then restore, triggering two
        // SIGWINCHs so the child process fully redraws.
        const cols = terminal.cols;
        const rows = terminal.rows;
        window.electronAPI.resizePty(agentName, cols - 1, rows);
        setTimeout(() => {
          window.electronAPI.resizePty(agentName, cols, rows);
        }, 100);
      }
    });
  }, [agentName]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unsubDataRef.current?.();
      unsubExitRef.current?.();
      resizeObserverRef.current?.disconnect();
      terminalRef.current?.dispose();
      // Reset refs so StrictMode remount recreates everything
      terminalRef.current = null;
      fitAddonRef.current = null;
      openedRef.current = false;
      unsubDataRef.current = null;
      unsubExitRef.current = null;
      resizeObserverRef.current = null;
      // Clear container to prevent ghost DOM elements (double cursor)
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="h-full w-full"
      style={{
        display: visible ? "block" : "none",
        outline: dragging ? "2px dashed var(--accent)" : "none",
        outlineOffset: "-2px",
      }}
    >
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ background: "var(--bg-primary)" }}
      />
    </div>
  );
}
