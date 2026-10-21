const test = require('node:test');
const assert = require('node:assert');
const { extractItems } = require('../src/providers/harvest');

test('finds listings nested in wrappers and ignores avatars/menus', () => {
  const items = extractItems({
    results: [
      { listing: { uid: 'abc', title: 'Oak Tree', thumbnails: [{ mediaUrl: 'https://cdn.x/oak.jpg' }], user: { sellerName: 'Leaf Studio', avatar: 'https://cdn.x/a.png' } } },
      { uid: 'def', title: 'Rock Pack', images: [{ url: 'https://cdn.x/rock.png' }] }
    ],
    user: { id: 7, name: 'Me', avatarUrl: 'https://cdn.x/me.png' },
    menu: [{ id: 1, title: 'Home' }]
  });
  assert.deepStrictEqual(items.map(i => [i.id, i.title, i.thumbnail, i.author]), [
    ['abc', 'Oak Tree', 'https://cdn.x/oak.jpg', 'Leaf Studio'],
    ['def', 'Rock Pack', 'https://cdn.x/rock.png', undefined]
  ]);
});

test('dedupes by id and tolerates junk input', () => {
  const o = { id: 1, name: 'A', thumbnail: 'https://x/a.png' };
  assert.strictEqual(extractItems([o, o]).length, 1);
  assert.deepStrictEqual(extractItems(null), []);
  assert.deepStrictEqual(extractItems('x'), []);
});
