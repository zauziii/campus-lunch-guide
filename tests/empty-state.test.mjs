import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRecords,emptyMenuState,officialRestaurantUrl,shouldDisplayRestaurant} from '../menu.mjs';

const date='2026-11-06',token='06.11.';
const dish=(name,flags=[],allergens=[],price='Lounas')=>({name,meta:{'0':flags,'1':allergens},price:{name:price}});
const restaurant=(slug,dishes)=>({
  slug,title:slug,
  menuData:{
    visitingHours:{lounas:{items:[{label:'Ma–Pe',hours:'10:30-14:30'}]}},
    menus:dishes===null?[]:[{date:token,data:dishes}]
  }
});
const records=(...restaurants)=>buildRecords(restaurants,[],token,date);
const vegan=dish('Kasviskeitto',['Veg']);
const vegetarian=dish('Juustokeitto',[],[],'Kasvislounas');

test('suggests a possible vegan day only for explicitly vegan obtained dishes',()=>{
  const result=emptyMenuState(records(
    restaurant('metsatalo',[vegan,dish('Salaatti',['Veg'])]),
    restaurant('terkko',null)
  ));
  assert.equal(result.kind,'possible-vegan-day');
  assert.match(result.detail,/已获取的菜品均标为纯素，可能是 Vegan Day/);
  assert.match(result.detail,/官网/);
});

test('distinguishes vegetarian food from vegan food',()=>{
  const result=emptyMenuState(records(restaurant('metsatalo',[vegan,vegetarian])));
  assert.equal(result.kind,'vegetarian');
  assert.doesNotMatch(result.detail,/Vegan Day/);
});

test('does not infer vegan day from missing or incomplete menu data',()=>{
  assert.equal(emptyMenuState(records(restaurant('metsatalo',null))).kind,'no-menu');
  const unmarkedDessert=dish('Jälkiruoka',[],[],'Jälkiruoka');
  assert.equal(emptyMenuState(records(restaurant('metsatalo',[vegan,unmarkedDessert]))).kind,'no-match');
  assert.equal(emptyMenuState(records(restaurant('metsatalo',[vegan,dish('Päivän ruoka')]))).kind,'lunch-ended');
});

test('unlisted abbreviations do not imply vegetarian or vegan food',()=>{
  for(const flag of ['K','VE']){
    const all=records(restaurant('metsatalo',[dish('Broilerikastike',[flag])]));
    assert.equal(all[0].dishes[0].meat.status,'identified');
    assert.equal(emptyMenuState(all).kind,'lunch-ended');
  }
});

test('checks the complete menu when relevant restaurants are hidden after lunch',()=>{
  for(const relevant of [
    dish('Broilerikastike'),
    dish('Kala',[],['Kala']),
    dish('Päivän ruoka')
  ]){
    const all=records(restaurant('metsatalo',[vegan]),restaurant('terkko',[relevant]));
    assert.equal(all.some(r=>shouldDisplayRestaurant(r,15*60)),false);
    assert.equal(emptyMenuState(all).kind,'lunch-ended');
  }
});

test('a conflicting official fish marker prevents a vegan suggestion',()=>{
  const result=emptyMenuState(records(restaurant('metsatalo',[dish('Päivän ruoka',['Veg'],['Kala'])])));
  assert.equal(result.kind,'lunch-ended');
  assert.doesNotMatch(result.detail,/Vegan Day/);
});

test('opens the UniCafe restaurant selector for each validated slug',()=>{
  for(const slug of ['metsatalo','terkko','pesco-vege-topelias','olivia-henkilostoravintola']){
    const url=new URL(officialRestaurantUrl(slug));
    assert.equal(url.origin,'https://unicafe.fi');
    assert.equal(url.pathname,'/');
    assert.equal(url.searchParams.get('restaurant'),slug);
  }
  for(const invalid of ['',null,'../terkko','terkko&restaurant=kaivopiha','https://example.com'])assert.equal(officialRestaurantUrl(invalid),'');
});
