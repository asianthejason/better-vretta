import assert from 'node:assert/strict';
import test from 'node:test';
import { createCategoryCanvasData, asLocationDragDropData, gradeDragDrop, isDragDropAnswered } from '../lib/dragDrop';

test('category canvas survives saved-data conversion with multiple answers and geometry', () => {
  const data = createCategoryCanvasData();
  data.items = [{ id: 'w', content: 'W' }, { id: 'x', content: 'X' }, { id: 'y', content: 'Y' }];
  data.zones[0].correctItemIds = ['w', 'x'];
  data.zones[1].correctItemIds = ['y'];
  const restored = asLocationDragDropData(JSON.parse(JSON.stringify(data)));
  assert.equal(restored.preset, 'category-canvas');
  assert.deepEqual(restored.zones, data.zones);
  assert.equal(gradeDragDrop(restored, { [data.zones[0].id]: ['x', 'w'], [data.zones[1].id]: ['y'] }).isCorrect, true);
  assert.equal(gradeDragDrop(restored, { [data.zones[0].id]: ['x', 'y'], [data.zones[1].id]: ['w'] }).isCorrect, false);
});

test('placing any choice marks a category canvas question as answered', () => {
  const data = createCategoryCanvasData();
  const ids = data.items.map(item => item.id);
  data.items.push({ id: 'distractor', content: 'Optional distractor' });
  assert.equal(isDragDropAnswered(data, {}), false);
  assert.equal(isDragDropAnswered(data, { [data.zones[0].id]: [ids[0]] }), true);
  assert.equal(isDragDropAnswered(data, { [data.zones[0].id]: ['distractor'] }), true);
  const complete = { [data.zones[0].id]: [ids[0]], [data.zones[1].id]: [ids[1]] };
  assert.equal(isDragDropAnswered(data, complete), true);
  assert.equal(gradeDragDrop(data, complete).isCorrect, true);
  const completeButWrong = { [data.zones[0].id]: [ids[1]], [data.zones[1].id]: [ids[0]] };
  assert.equal(isDragDropAnswered(data, completeButWrong), true);
  assert.equal(gradeDragDrop(data, completeButWrong).isCorrect, false);
});
