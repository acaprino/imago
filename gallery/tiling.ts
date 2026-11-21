// The tiling workspace of the gallery: createTilingWorkspace (ts/ui/tiling-workspace.ts) on a layout of five panes that
// shows every part of it, with the smallest model an app could give it. The package draws the panes and their chrome and
// owns no layout: the model below validates nothing, applies each action to a copy of the layout, lays the panes out by
// their weights and finds a pane's neighbour. An app's model is its own (Shinatama has one); this one is the gallery's.
//
// The layout: a pane with two tabs, the focused one, the second tab toned; beside it a pane with one tab over an empty
// pane (its placeholder and the button that opens a tab); a collapsed pane; and a pane whose only tab the filter hides.
// Dragging a tab to another pane or to a side moves it, as in an app.

import { createTilingWorkspace, type TilingAction } from '../ts/ui/tiling-workspace.ts';

type Size = { width: number; height: number };
type Group = { kind: 'group'; id: string; tabs: string[]; activeTabId: string | null; collapsed: boolean; lastUsableSize: Size };
type Split = { kind: 'split'; id: string; axis: 'columns' | 'rows'; children: Node[]; weights: number[] };
type Node = Group | Split;
type View = { id: string; hidden: boolean; label: string; kind: 'terminal' | 'files' | 'log'; tone?: string };
type Layout = { root: Node; views: View[]; focusedGroupId: string | null; maximizedGroupId: string | null };
type Pane = Size & { groupId: string; x: number; y: number; visible: boolean };
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const MINIMUM: Size = { width: 120, height: 80 };
const COLLAPSED: Size = { width: 48, height: 32 };
const USABLE: Size = { width: 0, height: 0 };

const group = (id: string, tabs: string[], collapsed = false): Group => ({ kind: 'group', id, tabs, activeTabId: tabs[0] ?? null, collapsed, lastUsableSize: USABLE });

const VIEWS: View[] = [
  { id: 'console', hidden: false, label: 'billing-service', kind: 'terminal' },
  { id: 'review', hidden: false, label: 'reviewer', kind: 'terminal', tone: 'var(--im-cat-3)' },
  { id: 'files', hidden: false, label: 'Files', kind: 'files' },
  { id: 'notes', hidden: false, label: 'Notes', kind: 'files' },
  { id: 'build', hidden: false, label: 'build.log', kind: 'log' },
];

function initialLayout(): Layout {
  return {
    root: {
      kind: 'split', id: 'g-split-main', axis: 'columns', weights: [1.4, 1, 0, 1],
      children: [
        group('g-pane-console', ['console', 'review']),
        { kind: 'split', id: 'g-split-side', axis: 'rows', weights: [1, 1], children: [group('g-pane-files', ['files']), group('g-pane-empty', [])] },
        group('g-pane-notes', ['notes'], true),
        group('g-pane-build', ['build']),
      ],
    },
    views: VIEWS,
    focusedGroupId: 'g-pane-console',
    maximizedGroupId: null,
  };
}

const groupsOf = (node: Node): Group[] => (node.kind === 'group' ? [node] : node.children.flatMap(groupsOf));
const findGroup = (layout: Layout, id: string): Group | undefined => groupsOf(layout.root).find((g) => g.id === id);
function findSplit(node: Node, id: string): Split | undefined {
  if (node.kind === 'group') return undefined;
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findSplit(child, id);
    if (found) return found;
  }
  return undefined;
}
function parentOf(node: Node, child: Node): Split | undefined {
  if (node.kind === 'group') return undefined;
  if (node.children.includes(child)) return node;
  for (const each of node.children) {
    const found = parentOf(each, child);
    if (found) return found;
  }
  return undefined;
}

/** The layout after `action`, on a copy: the base is never changed. */
function apply(base: Layout, action: TilingAction): Result<Layout> {
  const layout: Layout = structuredClone(base);
  switch (action.type) {
    case 'focus':
      layout.focusedGroupId = action.groupId;
      break;
    case 'activate': {
      const target = findGroup(layout, action.groupId);
      if (!target?.tabs.includes(action.viewId)) return { ok: false, error: 'no such tab' };
      target.activeTabId = action.viewId;
      break;
    }
    case 'collapse': {
      const target = findGroup(layout, action.groupId);
      if (!target) return { ok: false, error: 'no such pane' };
      target.collapsed = action.collapsed;
      break;
    }
    case 'maximize':
      layout.maximizedGroupId = action.groupId;
      break;
    case 'remember-size': {
      const target = findGroup(layout, action.groupId);
      if (target) target.lastUsableSize = { ...action.size };
      break;
    }
    case 'resize': {
      const split = findSplit(layout.root, action.splitId);
      if (!split || split.weights.length !== action.weights.length) return { ok: false, error: 'no such split' };
      split.weights = [...action.weights];
      break;
    }
    case 'move': {
      const source = groupsOf(layout.root).find((g) => g.tabs.includes(action.viewId));
      const target = findGroup(layout, action.groupId);
      if (!source || !target) return { ok: false, error: 'no such tab or pane' };
      source.tabs = source.tabs.filter((id) => id !== action.viewId);
      if (source.activeTabId === action.viewId) source.activeTabId = source.tabs[0] ?? null;
      if (action.edge) {
        const fresh = group(action.edge.newGroupId, [action.viewId]);
        const parent = parentOf(layout.root, target);
        const before = action.edge.side === 'before';
        if (parent && parent.axis === action.edge.axis) {
          const at = parent.children.indexOf(target) + (before ? 0 : 1);
          parent.children.splice(at, 0, fresh);
          parent.weights.splice(at, 0, 1);
        } else {
          const split: Split = { kind: 'split', id: action.edge.newSplitId, axis: action.edge.axis, weights: [1, 1], children: before ? [fresh, target] : [target, fresh] };
          if (parent) parent.children[parent.children.indexOf(target)] = split;
          else layout.root = split;
        }
        layout.focusedGroupId = fresh.id;
      } else {
        const index = Math.max(0, Math.min(target.tabs.length, action.index ?? target.tabs.length));
        target.tabs.splice(index, 0, action.viewId);
        target.activeTabId = action.viewId;
        layout.focusedGroupId = target.id;
      }
      break;
    }
  }
  return { ok: true, value: layout };
}

/** Each pane's box: a split shares its length by the weights, after what its collapsed panes keep. */
function paneRects(layout: Layout, viewport: Size): Size & { panes: Pane[] } {
  const panes: Pane[] = [];
  const place = (node: Node, x: number, y: number, width: number, height: number, visible: boolean): void => {
    if (node.kind === 'group') {
      panes.push({ groupId: node.id, x, y, width, height, visible });
      return;
    }
    const columns = node.axis === 'columns';
    const fixed = node.children.map((child) => (child.kind === 'group' && child.collapsed ? (columns ? COLLAPSED.width : COLLAPSED.height) : 0));
    const free = Math.max(0, (columns ? width : height) - fixed.reduce((a, b) => a + b, 0));
    const weights = node.children.map((child, at) => (fixed[at] ? 0 : node.weights[at] || 1));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let at = 0;
    node.children.forEach((child, index) => {
      const length = fixed[index] || (free * weights[index]) / total;
      if (columns) place(child, x + at, y, length, height, visible);
      else place(child, x, y + at, width, length, visible);
      at += length;
    });
  };
  if (layout.maximizedGroupId) {
    for (const each of groupsOf(layout.root)) {
      const on = each.id === layout.maximizedGroupId;
      panes.push({ groupId: each.id, x: 0, y: 0, width: on ? viewport.width : 0, height: on ? viewport.height : 0, visible: on });
    }
  } else place(layout.root, 0, 0, viewport.width, viewport.height, true);
  return { width: viewport.width, height: viewport.height, panes };
}

/** The pane next to `groupId` in `direction`: the nearest whose box starts past this one's edge. */
function keyboardNeighbor(layout: Layout, groupId: string, direction: 'left' | 'right' | 'up' | 'down', viewport: Size): string | null {
  const { panes } = paneRects(layout, viewport);
  const from = panes.find((pane) => pane.groupId === groupId);
  if (!from) return null;
  const centre = (pane: Pane): [number, number] => [pane.x + pane.width / 2, pane.y + pane.height / 2];
  const [cx, cy] = centre(from);
  const ahead = panes.filter((pane) => pane.visible && pane.groupId !== groupId && {
    left: pane.x + pane.width <= from.x + 1, right: pane.x >= from.x + from.width - 1,
    up: pane.y + pane.height <= from.y + 1, down: pane.y >= from.y + from.height - 1,
  }[direction]);
  ahead.sort((a, b) => Math.hypot(centre(a)[0] - cx, centre(a)[1] - cy) - Math.hypot(centre(b)[0] - cx, centre(b)[1] - cy));
  return ahead[0]?.groupId ?? null;
}

/** What a view shows: a few lines, as a terminal or a file would. */
function binding(view: View): HTMLElement {
  const element = document.createElement('pre');
  element.className = 'im-code-view';
  element.setAttribute('aria-label', view.label);
  element.textContent = view.kind === 'terminal' ? `> npm test -- retry\n14 passed\n${view.label} is ready` : view.kind === 'log' ? 'vite build\n✓ 214 modules transformed' : `${view.label}\nsrc/\nREADME.md`;
  return element;
}

/** Mounts the workspace in `host` (which needs a height). The function it returns takes it down. */
export function mountTilingWorkspace(host: HTMLElement): () => void {
  let layout = initialLayout();
  const bindings = new Map(VIEWS.map((view) => [view.id, binding(view)]));
  const workspace = createTilingWorkspace<View, Layout, string>({
    host,
    bindings,
    model: { minimumPaneSize: MINIMUM, validate: (value) => ({ ok: true, value }), preview: apply, paneRects, keyboardNeighbor },
    newTabLabel: 'New tab in this pane',
    emptyActionLabel: '+ New tab',
    labelForView: (view) => view.label,
    toneForView: (view) => view.tone ?? null,
    // The filter of an app that shows only some kinds of tab: the build log is not one, so its pane says so.
    tabFilter: () => ({ label: 'terminal and file', shows: (view) => view.kind !== 'log' }),
    dispatch: (action, expected) => {
      const next = apply(expected, action);
      if (!next.ok) return;
      layout = next.value;
      workspace.render(layout);
    },
  });
  workspace.render(layout);
  return () => workspace.destroy();
}
