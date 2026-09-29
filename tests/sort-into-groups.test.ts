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

test('completion depends on sorting every choice, not guessing which categories must be filled', () => {
  const data = createCategoryCanvasData();
  const ids = data.items.map(item => item.id);
  assert.equal(isDragDropAnswered(data, {}), false);
  assert.equal(isDragDropAnswered(data, { [data.zones[0].id]: [ids[0]] }), false);
  assert.equal(isDragDropAnswered(data, { [data.zones[0].id]: ids }), true);
  assert.equal(gradeDragDrop(data, { [data.zones[0].id]: ids }).isCorrect, false);
});
