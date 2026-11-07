import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRecords,emptyMenuState,officialRestaurantUrl,shouldDisplayRestaurant} from '../menu.mjs';

const date='2026-11-06',token='06.11.',during=12*60,after=15*60;
const dish=(name,flags=[],allergens=[],price='Lounas')=>({name,meta:{'0':flags,'1':allergens},price:{name:price}});
const restaurant=(slug,dishes,hours='10:30-14:30')=>({
  slug,title:slug,
  menuData:{
    visitingHours:{lounas:{items:[{label:'Ma–Pe',hours}]}},
    menus:dishes===null?[]:[{date:token,data:dishes}]
  }
});
const records=(...restaurants)=>buildRecords(restaurants,token,date);
const plant=dish('Vegetable soup',['Veg']);
const meat=dish('Chicken bolognese');
const fish=dish('Fish bites',[],['fish']);
const pending=dish('Daily special');

test('shows one simple message when no available menu has identified meat or fish',()=>{
  const all=records(restaurant('metsatalo',[plant,dish('Cheese soup',[],[],'Kasvislounas')]));
  assert.deepEqual(emptyMenuState(all,during),{kind:'no-match',title:'今天暂未发现肉或鱼'});
});

test('shows no-match even with dishes requiring review, while keeping them visible',()=>{
  const all=records(restaurant('metsatalo',[plant,pending]));
  assert.equal(emptyMenuState(all,during).kind,'no-match');
  assert.equal(shouldDisplayRestaurant(all[0],during),true);
});

test('an available identified meat or fish dish prevents the no-match message',()=>{
  for(const food of [meat,fish,dish('Daily special',['Veg'],['fish'])]){
    const all=records(restaurant('metsatalo',[plant,food]));
    assert.equal(emptyMenuState(all,during),null);
    assert.equal(shouldDisplayRestaurant(all[0],during),true);
  }
});

test('meat from an ended lunch does not affect other restaurants still serving',()=>{
  const all=records(restaurant('metsatalo',[meat],'10:30-11:30'),restaurant('terkko',[plant]));
  assert.equal(shouldDisplayRestaurant(all[0],during),false);
  assert.equal(emptyMenuState(all,during).title,'今天暂未发现肉或鱼');
  assert.equal(emptyMenuState(all,after).kind,'lunch-ended');
});

test('missing current menus get a separate message even if an earlier menu had meat',()=>{
  assert.equal(emptyMenuState(records(restaurant('metsatalo',null)),during).kind,'no-menu');
  const all=records(restaurant('metsatalo',[meat],'10:30-11:30'),restaurant('terkko',null));
  assert.equal(emptyMenuState(all,during).kind,'no-menu');
});

test('unlisted abbreviations do not hide identified meat',()=>{
  for(const flag of ['K','VE']){
    const all=records(restaurant('metsatalo',[dish('Chicken bolognese',[flag])]));
    assert.equal(all[0].dishes[0].meat.status,'identified');
    assert.equal(emptyMenuState(all,during),null);
  }
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
