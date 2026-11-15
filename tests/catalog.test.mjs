import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, CATEGORY_DEFINITIONS, getProduct, getProductName, getProductCategories, getProductsByCategory, getValidVariants, isPurchasable, getStartingPrice, findVariant } from '../shared/catalog.mjs';
import { readBag } from '../src/cart-storage.js';

const imported = CATALOG.filter((product) => product.sourceItem !== undefined);
test('all 32 source rows and the three established products have unique identifiers', () => {
  assert.equal(CATALOG.length, 35);
  assert.equal(imported.length, 32);
  assert.deepEqual(imported.map((item) => item.sourceItem).sort((a,b) => a-b), Array.from({length:32}, (_,index) => index+1));
  assert.equal(new Set(CATALOG.map((item) => item.product)).size, CATALOG.length);
  assert.equal(new Set(CATALOG.map((item) => item.id)).size, CATALOG.length);
  assert.ok(imported.every((item) => item.sourceWorkbook === 'SHEABLISS-PRODUCTLIST.xlsx'));
});
test('FACE becomes Skin while Body, Hair and Health remain separate', () => {
  assert.deepEqual(CATEGORY_DEFINITIONS.map((category) => category.name), ['Body','Skin','Hair','Health']);
  assert.ok(imported.filter((item) => item.sourceCategory === 'FACE').every((item) => item.category === 'Skin'));
  assert.equal(getProduct('Organic Sheabutter').category, 'Body');
  assert.equal(getProductsByCategory('Health').length, 1);
  assert.equal(getProductName('BO-CRE-0004'), 'Avocado Face & Body Cream');
});
test('explicit multi-use memberships do not duplicate the same SKU in a collection', () => {
  const avocado = getProduct('BO-OIL-0019');
  assert.deepEqual(getProductCategories(avocado), ['Body','Hair']);
  for (const category of ['Body','Hair']) assert.equal(getProductsByCategory(category).filter((item) => item.product === avocado.product).length, 1);
  assert.deepEqual(getProductCategories(getProduct('FAC-CRE-0023')), ['Skin','Body']);
});
test('suspected duplicate formulations stay separate and traceable', () => {
  const body = getProduct('BO-CRE-0004');
  const skin = getProduct('FAC-CRE-0024');
  assert.notEqual(body.id, skin.id);
  assert.equal(body.name, skin.name);
  assert.equal(body.needsReview, true);
  assert.deepEqual(body.possibleDuplicateOf, [skin.product]);
  assert.ok(body.reviewNotes.some((note) => note.includes('do not merge')));
});
test('ambiguous butter/soap and soap-making oil are not mislabelled as ready products', () => {
  const unresolved = getProduct('BO-SOA-0016');
  assert.equal(unresolved.productType, 'To be confirmed');
  assert.equal(unresolved.subcategory, 'Awaiting confirmation');
  assert.equal(unresolved.needsReview, true);
  assert.equal(getProduct('BO-OIL-0021').subcategory, 'Soap-making Ingredients');
  assert.equal(getProduct('BO-CRE-0008').subcategory, 'Body Butters');
  assert.equal(getProduct('BO-CRE-0009').subcategory, 'Body Butters');
});
test('the balm code is corrected without losing its original spreadsheet reference', () => {
  const balm = getProduct('FAC-BAL-0026');
  assert.equal(balm.sourceCode, 'FAC-OIL-0026');
  assert.equal(balm.productType, 'Lip Balm');
  assert.equal(balm.category, 'Skin');
});
test('blank spreadsheet prices never become zero, Infinity or sale variants', () => {
  for (const product of imported) {
    assert.equal(product.sourcePrice, null);
    assert.equal(product.sourceSize, null);
    assert.equal(isPurchasable(product), false);
    assert.equal(getStartingPrice(product), null);
    assert.deepEqual(getValidVariants(product), []);
    assert.equal(findVariant(product.product, '100g'), null);
  }
  const pendingWithForgedVariant = {...imported[0], variants:[{size:'100g',amountZar:1}]};
  assert.equal(isPurchasable(pendingWithForgedVariant),false);
  const reviewWithPrice = {...getProduct('BO-SOA-0016'),status:'active',variants:[{size:'100g',amountZar:100}]};
  assert.equal(isPurchasable(reviewWithPrice),false);
});
test('all established prices and checkout identifiers remain compatible', () => {
  const expected = [
    ['Organic Sheabutter','100g',100],['Organic Sheabutter','200g',180],['Organic Sheabutter','500g',380],
    ['Organic Sheabutter','1kg',700],['Organic Sheabutter','5kg',3000],['Hair Butter','250g',200],
    ['Mucuna Puriens (Beans)','100g',250],['Mucuna Puriens (Beans)','200g',150],
  ];
  for (const [key,size,price] of expected) {
    const variant = findVariant(key,size);
    assert.equal(variant.product,key);
    assert.equal(variant.amountZar,price);
  }
  assert.equal(findVariant('Organic Sheabutter','100g').category,'Body');
  assert.equal(CATALOG.filter(isPurchasable).length,3);
});
test('saved-bag hydration drops unpriced products and ignores forged browser prices', () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = {getItem: () => JSON.stringify([
    {product:'BO-CRE-0001',size:'100g',quantity:1,price:'R1'},
    {product:'Organic Sheabutter',size:'100g',quantity:2,price:'R1'},
  ])};
  try {
    const bag = readBag();
    assert.equal(bag.length,1);
    assert.equal(bag[0].product,'Organic Sheabutter');
    assert.equal(bag[0].amount,100);
    assert.equal(bag[0].price,'R100');
    assert.equal(bag[0].quantity,2);
  } finally {
    if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original;
  }
});
