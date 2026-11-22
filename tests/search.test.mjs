import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../shared/catalog.mjs';
import { SEARCH_CHIPS, SEARCH_KEYWORDS } from '../shared/search-keywords.mjs';
import { popularProducts, rankProducts } from '../src/product-search.js';

const firstName = (query) => rankProducts(query).results[0]?.item?.name;

test('everyday wording ranks the intended product first', () => {
  assert.equal(firstName('dry elbows'), 'Organic Shea Butter');
  assert.equal(firstName('frizzy hair'), 'Hair Butter');
  assert.equal(firstName('curly'), 'Hair Butter');
  assert.equal(firstName('focus'), 'Mucuna pruriens beans');
  assert.equal(firstName('supplement'), 'Mucuna pruriens beans');
  assert.equal(firstName('shia butter'), 'Organic Shea Butter');
});

test('category, price and gift wording produce useful results', () => {
  assert.equal(firstName('health'), 'Mucuna pruriens beans');
  assert.equal(firstName('hair'), 'Hair Butter');
  assert.equal(firstName('under R150'), 'Organic Shea Butter');
  assert.ok(rankProducts('gift').strong);
  assert.equal(rankProducts('gift').results.length >= 3, true);
});

test('exact and partial catalog identifiers outrank broader wording', () => {
  const item = CATALOG.find((product) => product.id === 'organic-sheabutter');
  assert.equal(rankProducts(item.id).results[0].item.id, item.id);
  assert.equal(rankProducts(item.id.slice(0, 8)).results[0].item.id, item.id);
  assert.equal(rankProducts('xyz123').strong, false);
  assert.deepEqual(popularProducts().map((product) => product.id), [
    'organic-sheabutter', 'hair-butter', 'mucuna-puriens-beans'
  ]);
});

test('editable search language covers the three active product IDs', () => {
  for (const id of ['organic-sheabutter', 'hair-butter', 'mucuna-puriens-beans']) {
    assert.ok(Array.isArray(SEARCH_KEYWORDS[id]) && SEARCH_KEYWORDS[id].length > 5);
  }
  assert.deepEqual(SEARCH_CHIPS.map((chip) => chip.query), ['dry skin', 'curly hair', 'gift', 'under R150']);
});
