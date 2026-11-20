import { sidebarCollapse, sidebarDrawer, sidebarResize } from '../../ts/ui/sidebar.ts';

declare global {
  interface Window {
    /** For tests/gallery/layout.mjs: the two functions, to try them on a copy of the shell. */
    __imagoSidebar?: { sidebarDrawer: typeof sidebarDrawer; sidebarCollapse: typeof sidebarCollapse };
  }
}
window.__imagoSidebar = { sidebarDrawer, sidebarCollapse };

// The choice to fold the sidebar into its rail outlives a redraw of the gallery, as an app would store it.
let collapsed = false;
let width: number | undefined;

// Below 620 the sidebar opens from the title-bar button; from 850 up the button in its header folds it into the rail.
export default function mount({ shell }: { shell: HTMLElement }): () => void {
  const stopDrawer = sidebarDrawer(shell);
  const stopCollapse = sidebarCollapse(shell, { collapsed, onChange: (value) => (collapsed = value) });
  const stopResize = sidebarResize(shell, { label: 'Sidebar width', width, onChange: value => { width = value; } });
  return () => {
    stopResize();
    stopDrawer();
    stopCollapse();
  };
}
