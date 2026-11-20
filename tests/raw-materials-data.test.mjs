import test from 'node:test';
import assert from 'node:assert/strict';
import { RAW_MATERIALS, getRawMaterial, materialShopHref } from '../shared/raw-materials.mjs';
import { getProduct, getProductMaterials, getProductsByMaterial, findVariant } from '../shared/catalog.mjs';

test('seven distinct material slides retain editable copy and independent managed images', () => {
  assert.deepEqual(RAW_MATERIALS.map((item)=>item.name),['Raw Shea Butter','Papaya','Lemon','Cocoa','Moringa Leaf','Roasted Coffee','Avocado']);
  assert.equal(new Set(RAW_MATERIALS.map((item)=>item.id)).size,7);
  assert.equal(new Set(RAW_MATERIALS.map((item)=>item.image)).size,7);
  for(const item of RAW_MATERIALS){
    assert.ok(item.description.length>100);
    assert.match(item.image,/^\/(?:manus-storage\/async-images|assets)\/.+\.(?:webp|png|jpg)$/);
    assert.ok(item.alt.length>20);
    assert.equal(new URL(materialShopHref(item.id),'https://store.example').searchParams.get('material'),item.id);
    assert.equal(getRawMaterial(item.id),item);
  }
});
test('every ingredient membership refers to a known stable product; one SKU appears once per filter', () => {
  for(const item of RAW_MATERIALS){
    assert.equal(new Set(item.products).size,item.products.length);
    for(const key of item.products) assert.ok(getProduct(key),`${item.id}: ${key}`);
    assert.deepEqual(new Set(getProductsByMaterial(item.id).map((product)=>product.product)),new Set(item.products));
  }
});
test('citronella is not confused with lemon, and unknown formulations are not inferred from generic cream labels', () => {
  assert.ok(getProductMaterials('HAI-CRE-0030').includes('shea'));
  assert.ok(!getProductMaterials('HAI-CRE-0030').includes('lemon'));
  assert.ok(!getProductMaterials('BO-CRE-0004').includes('shea'));
  assert.deepEqual(getProductMaterials('Hair Butter'),['shea','cocoa','avocado']);
  assert.deepEqual(getProductsByMaterial('unknown'),[]);
});
test('raw-material membership does not make pending products purchasable or modify existing prices', () => {
  assert.equal(findVariant('BO-CRE-0001','100g'),null);
  assert.equal(findVariant('Organic Sheabutter','100g').amountZar,100);
  assert.equal(findVariant('Hair Butter','250g').amountZar,200);
});
