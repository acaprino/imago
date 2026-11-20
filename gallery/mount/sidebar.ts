import { sidebarDrawer } from '../../ts/ui/sidebar.ts';

// Below 620 the sidebar opens from the title-bar button.
export default function mount({ shell }: { shell: HTMLElement }): () => void {
  return sidebarDrawer(shell);
}
