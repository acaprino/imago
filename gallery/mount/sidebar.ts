import { sidebarCollapse, sidebarDrawer, sidebarResize } from '../../ts/ui/sidebar.ts';

declare global {
  interface Window {
    /** For tests/gallery/layout.mjs: the two functions, to try them on a copy of the shell. */
    __imagoSidebar?: { sidebarDrawer: typeof sidebarDrawer; sidebarCollapse: typeof sidebarCollapse };
  }
}
window.__imagoSidebar = { sidebarDrawer, sidebarCollapse };

let width: number | undefined;

// The drawer below 620 and the fold from 850 up are not wired here: `mountApp` (gallery/main.ts) does it, and keeps the
// choice to fold across a redraw. What is left is the splitter that sets the width of the docked sidebar.
export default function mount({ shell }: { shell: HTMLElement }): () => void {
  return sidebarResize(shell, { label: 'Sidebar width', width, onChange: value => { width = value; } });
}
