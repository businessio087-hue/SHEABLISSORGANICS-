import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOG, CATEGORY_DEFINITIONS, getProductsByCategory, getProduct, getProductRange, getProductRanges, getValidVariants, isPurchasable } from '../shared/catalog.mjs';

// These stubs exercise rendering only. They never contact the real API/database or
// fabricate signed-in customers in Preview; all actual auth tests remain separate.
const previous = new Map(['document','window','location','fetch','CustomEvent'].map((key) => [key, globalThis[key]]));
let catalogProductCard;
before(async () => {
  globalThis.document = { querySelectorAll: () => [], addEventListener: () => {}, dispatchEvent: () => {} };
  globalThis.window = { addEventListener: () => {} };
  globalThis.location = { origin: 'https://store.example' };
  globalThis.CustomEvent = class { constructor(type, options) { this.type=type; this.detail=options.detail; } };
  globalThis.fetch = async () => ({ok:true,json:async()=>({authenticated:false,registered:false,user:null,identity:null,csrfToken:null})});
  ({ catalogProductCard } = await import('../src/wishlist.js'));
  await new Promise((resolve) => setImmediate(resolve));
});
after(() => { for (const [key,value] of previous) { if (value===undefined) delete globalThis[key]; else globalThis[key]=value; } });

const source = readFileSync(new URL('../src/category.js', import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '');
function renderCategory(path) {
  const location = new URL(path, 'https://store.example');
  const created = [];
  const node = () => ({innerHTML:'',textContent:'',className:'',content:'',classList:{add:()=>{}},setAttribute:()=>{},before:(other)=>created.push(other)});
  const selectors = new Map(['#category-title','#category-description','meta[name="description"]','.category-main .breadcrumbs','#category-products'].map((selector)=>[selector,node()]));
  if (location.pathname==='/shop.html') { const nav=node();nav.className='shop-category-navigation';selectors.set('.shop-category-navigation',nav); }
  const document = {title:'',querySelector:(selector)=>selectors.get(selector)||null,createElement:()=>node()};
  new Function('CATALOG','CATEGORY_DEFINITIONS','getProductsByCategory','getProductRange','getProductRanges','catalogProductCard','updateHeartButtons','document','location',source)(CATALOG,CATEGORY_DEFINITIONS,getProductsByCategory,getProductRange,getProductRanges,catalogProductCard,()=>{},document,location);
  const categoryNav=selectors.get('.shop-category-navigation')||created.find((item)=>item.className==='shop-category-navigation');
  return {html:selectors.get('#category-products').innerHTML,categoryNav,created,document};
}
const productKeys = (html) => [...html.matchAll(/data-wishlist-product="([^"]+)"/g)].map((match)=>match[1]);
const hrefFor = (html,label) => {
  const match=html.match(new RegExp(`<a\\b[^>]*\\bhref="([^"]+)"[^>]*>${label}</a>`));
  assert.ok(match,`${label} link must exist`);
  return new URL(match[1].replaceAll('&amp;','&'), 'https://store.example');
};

test('all 35 catalog cards retain SKU keys; only three approved products show buying controls', () => {
  for (const item of CATALOG) {
    const html=catalogProductCard(item);
    assert.ok(html.includes(`data-wishlist-product="${item.product}"`));
    assert.doesNotMatch(html,/\b(?:Infinity|NaN)\b/);
    if (!isPurchasable(item)) {
      assert.ok(!html.includes('catalog-product-buy'));
      assert.ok(!html.includes('catalog-product-price'));
      assert.match(html,/being confirmed|to be confirmed/);
    } else {
      const variant=getValidVariants(item)[0];
      assert.ok(html.includes(`R${variant.amountZar.toLocaleString('en-ZA')}`));
      assert.ok(html.includes(encodeURIComponent(variant.size)));
      assert.ok(html.includes('catalog-product-buy'));
    }
  }
});
test('Shop shows every independent SKU once and category pages follow membership', () => {
  const shop=productKeys(renderCategory('/shop.html').html);
  assert.equal(shop.length,CATALOG.length);
  assert.equal(new Set(shop).size,CATALOG.length);
  for (const {name} of CATEGORY_DEFINITIONS) {
    assert.deepEqual(productKeys(renderCategory(`/category.html?category=${name}`).html),getProductsByCategory(name).map((item)=>item.product));
  }
});
test('Skin face-cream filters include the body/face cream under its Skin range', () => {
  const view=renderCategory('/category.html?category=Skin&range=Face%20Creams');
  assert.ok(productKeys(view.html).includes('BO-CRE-0004'));
  assert.ok(view.html.includes('catalog-product-skin'));
  assert.equal(getProductRange(getProduct('BO-CRE-0004'),'Skin'),'Face Creams');
  assert.equal(getProductRange(getProduct('BO-CRE-0004'),'Body'),'Creams & Lotions');
});
test('switching from Body Butters to Skin drops the incompatible filter', () => {
  const body=renderCategory('/category.html?category=Body&range=Body%20Butters');
  const skin=hrefFor(body.categoryNav.innerHTML,'Skin');
  assert.equal(skin.searchParams.get('category'),'Skin');
  assert.equal(skin.searchParams.has('range'),false);
  assert.equal(productKeys(renderCategory(skin.pathname+skin.search).html).length,getProductsByCategory('Skin').length);
});
test('compatible oil filters persist when changing category, while invalid ranges offer a reset', () => {
  const skin=renderCategory('/category.html?category=Skin&range=Oils');
  const body=hrefFor(skin.categoryNav.innerHTML,'Body');
  assert.equal(body.searchParams.get('range'),'Oils');
  const invalid=renderCategory('/category.html?category=Skin&range=Not%20A%20Range');
  assert.equal(productKeys(invalid.html).length,0);
  assert.match(invalid.html,/reset filter/);
  assert.equal(hrefFor(invalid.html,'All products — reset filter').searchParams.get('category'),'Skin');
});
test('Shop range filters include all category-specific memberships without duplicating a SKU', () => {
  const expected=CATALOG.filter((item)=>getProductRanges(item).includes('Face Creams')).map((item)=>item.product);
  assert.deepEqual(productKeys(renderCategory('/shop.html?range=Face%20Creams').html),expected);
});
test('saved-product cards keep unpriced and duplicate entries safe and distinguishable', () => {
  const first=catalogProductCard(getProduct('BO-CRE-0004'),{saved:true});
  const second=catalogProductCard(getProduct('FAC-CRE-0024'),{saved:true});
  assert.ok(first.includes('BO-CRE-0004'));
  assert.ok(second.includes('FAC-CRE-0024'));
  assert.ok(first.includes('saved-product-card'));
  assert.ok(!first.includes('catalog-product-buy'));
  assert.ok(!second.includes('catalog-product-price'));
});
