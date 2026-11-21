import test from 'node:test';
import assert from 'node:assert/strict';
import { groupedGraphScene, graphTextWidth } from '../ts/graph-layout.ts';

test('grouped layout owns placement, shared children and ungrouped nodes', () => {
  const scene = groupedGraphScene([
    { id: 'g1', label: 'First', children: ['b', 'a', 'b'] },
    { id: 'g2', label: 'Second', children: ['a'] },
    { id: 'empty', label: 'Absent', children: ['missing'] },
  ], ['a', 'b', 'c'].map(id => ({ id, label: id })));
  assert.deepEqual(scene.nodes.map(n => n.id), ['g1', 'g2', 'b', 'a', 'c']);
  assert.deepEqual(scene.edges.map(e => [e.source, e.target]), [['g1', 'b'], ['g1', 'a'], ['g2', 'a']]);
  for (let i = 1; i < scene.nodes.length; i++) for (const earlier of scene.nodes.slice(0, i)) {
    const node = scene.nodes[i];
    if (node.x === earlier.x) assert.ok(node.y >= earlier.y + earlier.height || earlier.y >= node.y + node.height);
  }
});

test('the edges to a selected node carry the accent, the selection mark; the others no tone', () => {
  const scene = groupedGraphScene([{ id: 'g', label: 'Group', children: ['a', 'b'] }], [{ id: 'a', label: 'A', selected: true }, { id: 'b', label: 'B' }]);
  assert.deepEqual(scene.edges.map(e => [e.target, e.tone]), [['a', 'accent'], ['b', undefined]]);
});

test('long proportional and multilingual labels fit inside their nodes', () => {
  const text = 'WWWW'.repeat(30) + '漢字';
  const scene = groupedGraphScene([{ id: 'group', label: text, children: ['node'] }], [{ id: 'node', label: text, count: 10 }]);
  assert.ok(scene.nodes.every(n => n.width > graphTextWidth(text)));
  assert.ok(graphTextWidth('WWWW') > graphTextWidth('iiii'));
  assert.ok(graphTextWidth('漢字') >= 26);
});

test('same-column relationships route outside nodes and preserve semantics', () => {
  const scene = groupedGraphScene([], [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], [
    { source: 'a', target: 'b', label: 'Excludes', directed: false, dotted: true, tone: 'err' },
    { source: 'a', target: 'missing' },
  ]);
  assert.equal(scene.edges.length, 1);
  const edge = scene.edges[0], a = scene.nodes[0];
  assert.equal(edge.directed, false);
  assert.equal(edge.dotted, true);
  assert.equal(edge.tone, 'err');
  assert.ok(edge.points![1].x > a.x + a.width);
  assert.equal(edge.points![0].y, a.y + a.height / 2);
});

test('node identity is unambiguous and input arrays stay untouched', () => {
  const nodes = Object.freeze([Object.freeze({ id: 'one', label: 'One' })]);
  assert.equal(groupedGraphScene([], nodes).nodes.length, 1);
  assert.throws(() => groupedGraphScene([], [...nodes, ...nodes]), /Duplicate graph node/);
  assert.throws(() => groupedGraphScene([{ id: 'one', label: 'Group', children: ['one'] }], nodes), /Duplicate graph node/);
  assert.deepEqual(groupedGraphScene([], []), { nodes: [], edges: [] });
});

test('invalid geometry options use finite positive defaults', () => {
  const scene = groupedGraphScene([], [{ id: 'a', label: 'A' }], [], { nodeHeight: NaN, rowGap: -1, minNodeWidth: Infinity });
  assert.ok(scene.nodes.every(n => [n.x, n.y, n.width, n.height].every(Number.isFinite)));
  assert.ok(scene.nodes[0].height > 0 && scene.nodes[0].width > 0);
});
