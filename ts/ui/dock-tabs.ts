/** Placement instructions for the application's layout model. IDs are stable across DOM updates. */
export type DockPlacement = 'center' | 'left' | 'right' | 'top' | 'bottom' | 'before' | 'after';
export interface DockMove { tab: string; pane: string; placement: DockPlacement; relativeTo?: string }

export function dockTabs(host: HTMLElement, options: {
  move: (request: DockMove) => void;
  canMove?: (request: DockMove) => boolean;
  describe: (request: DockMove) => string;
}) {
  const doc = host.ownerDocument;
  const listeners = new AbortController();
  const signal = listeners.signal;
  const live = doc.createElement('span');
  live.className = 'im-dock-announcement';
  live.setAttribute('role', 'status');
  host.append(live);
  type Target = { node: HTMLElement; move: DockMove };
  let gesture: { tab: HTMLElement; pointer?: number; x: number; y: number; started: boolean } | undefined;
  let preview: Target | undefined;
  let suppressClick = false;
  const panes = () => [...host.querySelectorAll<HTMLElement>('[data-im-pane]')].filter(el => el.getClientRects().length);
  const tabs = (pane: HTMLElement) => [...pane.querySelectorAll<HTMLElement>('[data-im-dock-tab]')]
    .filter(tab => tab.closest('[data-im-pane]') === pane && tab.getClientRects().length);
  function target(pane: HTMLElement, placement: DockPlacement, relative?: HTMLElement): Target | undefined {
    const source = gesture?.tab;
    if (!source || !host.contains(source) || !host.contains(pane) || relative === source) return;
    if (source.closest('[data-im-pane]') === pane && !relative && (placement === 'center' || tabs(pane).length === 1)) return;
    const move: DockMove = { tab: source.dataset.imDockTab!, pane: pane.dataset.imPane!, placement };
    if (relative) move.relativeTo = relative.dataset.imDockTab;
    return options.canMove?.(move) === false ? undefined : { node: relative ?? pane, move };
  }
  function highlight(next?: Target) {
    if (next?.node === preview?.node && next?.move.placement === preview?.move.placement) return;
    if (preview) delete preview.node.dataset.imDockTarget;
    preview = next;
    if (next) next.node.dataset.imDockTarget = next.move.placement;
    live.textContent = next ? options.describe(next.move) : '';
  }
  function end(commit = false) {
    if (!gesture) return;
    const { tab, pointer } = gesture;
    const request = preview?.move;
    const valid = preview && host.contains(preview.node) && host.contains(tab);
    if (gesture.started && pointer !== undefined) suppressClick = true;
    gesture = undefined;
    if (pointer !== undefined && host.hasPointerCapture(pointer)) host.releasePointerCapture(pointer);
    highlight();
    if (commit && valid && request && options.canMove?.(request) !== false) options.move(request);
  }
  function fromPoint(x: number, y: number) {
    const el = doc.elementFromPoint(x, y);
    const pane = el?.closest<HTMLElement>('[data-im-pane]');
    if (!pane || !host.contains(pane)) return;
    const tab = el?.closest<HTMLElement>('[data-im-dock-tab]');
    if (tab) {
      const r = tab.getBoundingClientRect();
      return target(pane, x < r.left + r.width / 2 ? 'before' : 'after', tab);
    }
    const rect = pane.getBoundingClientRect();
    const dx = (x - rect.left) / rect.width - 0.5;
    const dy = (y - rect.top) / rect.height - 0.5;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 0.25) return target(pane, 'center');
    if (Math.abs(dx) >= Math.abs(dy)) return target(pane, dx < 0 ? 'left' : 'right');
    return target(pane, dy < 0 ? 'top' : 'bottom');
  }

  function tabAt(event: Event) {
    if (!(event.target instanceof Element)) return;
    const tab = event.target.closest<HTMLElement>('[data-im-dock-tab]');
    const control = event.target.closest('button, input, a, select, textarea, [contenteditable=true]');
    if (tab && (!control || control === tab) && host.contains(tab) && !tab.matches(':disabled, [aria-disabled=true]')) return tab;
  }
  host.addEventListener('pointerdown', event => {
    suppressClick = false;
    const tab = tabAt(event);
    if (!tab || gesture || event.button !== 0 || !event.isPrimary) return;
    gesture = { tab, pointer: event.pointerId, x: event.clientX, y: event.clientY, started: false };
  }, { signal });
  // Listen on the document before capture too: moving across the host boundary must end the gesture.
  doc.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    if (!gesture.started && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 6) return;
    if (!gesture.started) host.setPointerCapture(event.pointerId);
    gesture.started = true;
    highlight(fromPoint(event.clientX, event.clientY));
  }, { signal });
  doc.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    const dragged = gesture.started;
    if (dragged) highlight(fromPoint(event.clientX, event.clientY));
    suppressClick = dragged;
    end(dragged);
  }, { signal });
  function cancelPointer(event: PointerEvent) {
    if (gesture && event.pointerId === gesture.pointer) end();
  }
  doc.addEventListener('pointercancel', cancelPointer, { signal });
  host.addEventListener('lostpointercapture', event => {
    if (event.target === host) cancelPointer(event);
  }, { signal });
  host.addEventListener('click', event => {
    if (suppressClick && event.detail > 0) { event.preventDefault(); event.stopImmediatePropagation(); }
    suppressClick = false;
  }, { capture: true, signal });

  function keyTargets(): Target[] {
    return panes().flatMap(pane => {
      const result = (['center', 'left', 'right', 'top', 'bottom'] as const).map(edge => target(pane, edge));
      const peers = tabs(pane).filter(tab => tab !== gesture?.tab);
      for (const tab of peers) result.push(target(pane, 'before', tab));
      if (peers.length) result.push(target(pane, 'after', peers.at(-1)));
      return result.filter((item): item is Target => !!item);
    });
  }
  doc.addEventListener('keydown', event => {
    if (event.isComposing || event.defaultPrevented) return;
    if (gesture && event.key === 'Escape') end();
    else if (gesture && gesture.pointer === undefined) {
      if (event.key === 'Enter') end(true);
      else if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
        const all = keyTargets();
        const index = all.findIndex(t => t.node === preview?.node && t.move.placement === preview?.move.placement);
        const step = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
        highlight(all[(index + step + all.length) % all.length]);
      } else { if (event.key === 'Tab') end(); return; }
    } else {
      const tab = tabAt(event);
      if (gesture || !tab || event.key !== 'Enter' || !event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      gesture = { tab, x: 0, y: 0, started: true };
      const first = keyTargets()[0];
      if (!first) { end(); return; }
      highlight(first);
    }
    event.preventDefault();
    event.stopPropagation();
  }, { signal });
  host.addEventListener('focusout', event => {
    if (gesture && gesture.pointer === undefined && !gesture.tab.contains(event.relatedTarget as Node | null)) end();
  }, { signal });
  doc.defaultView?.addEventListener('blur', () => end(), { signal });
  return () => { end(); listeners.abort(); live.remove(); };
}
