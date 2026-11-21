import type { GraphBox, GraphEdge, GraphNode, GraphScene } from './graph.ts';

/** Unpositioned graph data. Layout and sizing remain inside Imago. */
export type GraphItem = Omit<GraphNode, keyof GraphBox>;
export interface GraphColumnGroup extends GraphItem { children: readonly string[] }
export interface GroupedGraphOptions {
  nodeHeight?: number;
  rowGap?: number;
  groupGap?: number;
  columnGap?: number;
  minGroupWidth?: number;
  minNodeWidth?: number;
}

/** Conservative label width at the graph's 13px font; avoids a DOM measuring pass. */
export function graphTextWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += /[mwMW@%]/.test(ch) ? 11.5 : /[A-Z0-9]/.test(ch) ? 8.7 : /[iljtfr.,:;'|!()\-_ \/]/.test(ch) ? 5 : ch.codePointAt(0)! > 0x2fff ? 14 : 7.4;
  return Math.ceil(width);
}

const positive = (value: number | undefined, fallback: number) => value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;

/** Two columns: group nodes on the left, their children on the right. Shared children
 * occur once; ungrouped nodes follow. Membership and same-column relation routes are
 * generated here, so consumers supply only identifiers, labels and relationships. */
export function groupedGraphScene(groups: readonly GraphColumnGroup[], items: readonly GraphItem[], relations: readonly GraphEdge[] = [], options: GroupedGraphOptions = {}): GraphScene {
  const height = positive(options.nodeHeight, [...groups, ...items].some(item => item.detail) ? 56 : 40), rowGap = positive(options.rowGap, 10);
  const groupGap = positive(options.groupGap, 20), columnGap = positive(options.columnGap, 96);
  const known = new Map<string, GraphItem>();
  for (const item of items) {
    if (known.has(item.id)) throw new Error(`Duplicate graph node: ${item.id}`);
    known.set(item.id, item);
  }
  const groupIds = new Set<string>();
  for (const group of groups) {
    if (known.has(group.id) || groupIds.has(group.id)) throw new Error(`Duplicate graph node: ${group.id}`);
    groupIds.add(group.id);
  }
  const positions = new Map<string, number>();
  const order: GraphItem[] = [];
  let y = 0;
  const put = (id: string) => {
    if (!known.has(id) || positions.has(id)) return false;
    positions.set(id, y); order.push(known.get(id)!); y += height + rowGap; return true;
  };
  for (const group of groups) {
    let placed = false;
    for (const id of group.children) placed = put(id) || placed;
    if (placed) y += groupGap;
  }
  for (const id of known.keys()) put(id);
  const drawn = groups.flatMap(group => {
    const rows = [...new Set(group.children)].flatMap(id => positions.has(id) ? [positions.get(id)!] : []);
    return rows.length ? [{ group, y: (Math.min(...rows) + Math.max(...rows)) / 2 }] : [];
  }).sort((a, b) => a.y - b.y);
  let previous = -Infinity;
  for (const entry of drawn) { entry.y = Math.max(entry.y, previous + height + rowGap); previous = entry.y; }
  const widthOf = (item: GraphItem) => Math.max(graphTextWidth(item.label), graphTextWidth(item.detail ?? '')) + 32 + (item.count !== undefined ? 32 : 0);
  const groupWidth = Math.max(positive(options.minGroupWidth, 160), ...drawn.map(({ group }) => widthOf(group)));
  const nodeWidth = Math.max(positive(options.minNodeWidth, 220), ...items.map(widthOf));
  const right = groupWidth + columnGap;
  const nodes: GraphNode[] = [
    ...drawn.map(({ group: { children: _children, ...group }, y }) => ({ ...group, x: 0, y, width: groupWidth, height })),
    ...order.map(item => ({ ...item, x: right, y: positions.get(item.id)!, width: nodeWidth, height })),
  ];
  const at = new Map(nodes.map(node => [node.id, node]));
  const edges: GraphEdge[] = [];
  for (const { group } of drawn) for (const id of new Set(group.children)) {
    const target = at.get(id);
    if (target) edges.push({ source: group.id, target: id, tone: target.selected ? 'info' : undefined, dimmed: target.dimmed });
  }
  for (const edge of relations) {
    const a = at.get(edge.source), b = at.get(edge.target);
    if (!a || !b) continue;
    if (edge.points?.length || a.x !== b.x || a === b) { edges.push({ ...edge }); continue; }
    const start = a.x + a.width, end = b.x + b.width;
    const lane = Math.max(start, end) + 32 + Math.min(Math.abs(a.y - b.y) / 5, 80);
    edges.push({ ...edge, points: [
      { x: start, y: a.y + a.height / 2 }, { x: lane, y: a.y + a.height / 2 },
      { x: lane, y: b.y + b.height / 2 }, { x: end, y: b.y + b.height / 2 },
    ] });
  }
  return { nodes, edges };
}
