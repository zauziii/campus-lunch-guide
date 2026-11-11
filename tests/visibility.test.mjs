import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRecords,resolveTodayLunchHours,shouldDisplayRestaurant} from '../menu.mjs';

const lunch={status:'regular',startMinutes:630,endMinutes:870};
const meat={meat:{status:'identified'},fish:false};
const pending={meat:{status:'uncertain'},fish:false};
const fish={meat:{status:'excluded'},fish:true};
const other={meat:{status:'excluded'},fish:false};
const restaurant=(hours,dishes)=>({lunchHours:hours,dishes});

test('shows upcoming and current lunch, then hides it at the end time',()=>{
  assert.equal(shouldDisplayRestaurant(restaurant(lunch,[meat]),600),true);
  assert.equal(shouldDisplayRestaurant(restaurant(lunch,[meat]),869),true);
  assert.equal(shouldDisplayRestaurant(restaurant(lunch,[meat]),870),false);
});
test('retains unknown hours and uncertain food, but hides explicit closure',()=>{
  assert.equal(shouldDisplayRestaurant(restaurant({status:'unknown'},[pending]),900),true);
  assert.equal(shouldDisplayRestaurant(restaurant({status:'closed'},[meat]),600),false);
  assert.equal(shouldDisplayRestaurant(restaurant(undefined,[fish]),900),true);
  assert.equal(shouldDisplayRestaurant(restaurant(lunch,[meat]),NaN),true);
});
test('hides restaurants with no identified, fish or uncertain dishes',()=>{
  assert.equal(shouldDisplayRestaurant(restaurant(lunch,[other]),600),false);
  assert.equal(shouldDisplayRestaurant(restaurant(lunch,[]),600),false);
  assert.equal(shouldDisplayRestaurant(restaurant(lunch,[other,fish]),600),true);
  assert.equal(shouldDisplayRestaurant(restaurant(lunch,[other,pending]),600),true);
});
test('uses a dated special schedule before the weekly schedule',()=>{
  const hours=resolveTodayLunchHours({lounas:{items:[
    {label:'Ma–Pe',hours:'10:30-14:30'},
    {exception:true,label:'6.11.',hours:'11:00–16:00'}
  ]}},'2026-11-06');
  assert.equal(shouldDisplayRestaurant(restaurant(hours,[meat]),15*60),true);
  assert.equal(shouldDisplayRestaurant(restaurant(hours,[meat]),16*60),false);
});
test('filters Olivia staff restaurant at its published closing time',()=>{
  const data=[{slug:'olivia-henkilostoravintola',title:'Olivia staff restaurant',location:[{name:'City Centre'}],menuData:{
    visitingHours:{business:{items:[{label:'Mon–Fri',hours:'11:00-13:30',closedException:false}]},lounas:false},
    menus:[{date:'Thu 12.11.',data:[{name:'Chicken with Satay sauce',ingredients:'chicken fillet',meta:{}}]}]
  }}];
  const [record]=buildRecords(data,'12.11.','2026-11-12');
  assert.equal(record.lunchHours.label,'营业 11:00–13:30 · 常规');
  assert.equal(shouldDisplayRestaurant(record,809),true);
  assert.equal(shouldDisplayRestaurant(record,810),false);
  assert.equal(shouldDisplayRestaurant(record,null),true);
});
