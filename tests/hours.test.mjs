import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRecords,resolveTodayLunchHours,formatLunchHours,helsinkiMinutes,detectMeat,officialMarks} from '../menu.mjs';

const schedule=(items)=>({lounas:{items}});
const regular={label:'Ma–Pe',hours:'10:30-14:30',closedException:false};
const weekend={label:'La–Su',hours:'Suljettu',closedException:true};

test('shows weekday lunch hours as regular hours',()=>{
  assert.deepEqual(resolveTodayLunchHours(schedule([regular,weekend]),'2026-11-06'),{status:'regular',label:'午餐 10:30–14:30 · 常规',startMinutes:630,endMinutes:870});
  assert.deepEqual(resolveTodayLunchHours(schedule([regular,weekend]),'2026-11-07'),{status:'closed',label:'午餐暂停 · 常规'});
});
test('does not infer closure from a missing day or use general opening hours',()=>{
  assert.equal(resolveTodayLunchHours(schedule([regular]),'2026-11-07').status,'unknown');
  assert.equal(resolveTodayLunchHours({business:{items:[regular]},lounas:false},'2026-11-06').status,'unknown');
});
test('uses the dated exception only on its date',()=>{
  const data=schedule([regular,{exception:true,label:'28.10',hours:'11:00–14:00'}]);
  assert.deepEqual(resolveTodayLunchHours(data,'2026-10-28'),{status:'exception',label:'午餐 11:00–14:00 · 特殊时间',startMinutes:660,endMinutes:840});
  assert.equal(resolveTodayLunchHours(data,'2026-11-06').label,'午餐 10:30–14:30 · 常规');
});
test('supports date ranges including across the new year',()=>{
  const october=schedule([regular,{exception:true,label:'19.-24.10.',hours:'11:00–13:30'}]);
  assert.equal(resolveTodayLunchHours(october,'2026-10-21').status,'exception');
  assert.equal(resolveTodayLunchHours(october,'2026-11-06').status,'regular');
  const newYear=schedule([regular,{exception:true,label:'30.12.-2.1.',hours:'Suljettu'}]);
  assert.equal(resolveTodayLunchHours(newYear,'2027-01-01').status,'closed');
  assert.equal(resolveTodayLunchHours(newYear,'2027-01-04').status,'regular');
});
test('normalizes official dot-separated times and does not guess invalid times',()=>{
  assert.equal(resolveTodayLunchHours(schedule([{label:'Ma–Pe',hours:'10.30-15:00'}]),'2026-11-06').label,'午餐 10:30–15:00 · 常规');
  assert.equal(resolveTodayLunchHours(schedule([{label:'Ma–Pe',hours:'25:30-15:00'}]),'2026-11-06').status,'unknown');
});
test('does not silently ignore an exception it cannot interpret',()=>{
  const data=schedule([regular,{exception:true,label:'pyhäpäivä',hours:'Suljettu'}]);
  assert.deepEqual(resolveTodayLunchHours(data,'2026-11-06'),{status:'unknown',label:'午餐时间请查看官网'});
});
test('English-feed records include lunch hours and meat recognition',()=>{
  const dishes=[{name:'Chicken bolognese',ingredients:'chicken mince',meta:{}}];
  const english=[{slug:'example',title:'Example',location:[{name:'City Centre'}],menuData:{visitingHours:schedule([{label:'Mon–Fri',hours:'10:30-14:30'}]),menus:[{date:'Fri 06.11.',data:dishes}]}}];
  const [record]=buildRecords(english,'06.11.','2026-11-06');
  assert.equal(record.lunchHours.status,'regular');
  assert.equal(record.campus,'City Centre');
  assert.equal(record.dishes[0].original,'Chicken bolognese');
  assert.equal(record.dishes[0].meat.status,'identified');
});
test('understands the English weekday and closure labels used by UniCafe',()=>{
  const data=schedule([{label:'Mon–Fri',hours:'10:30–14:30'},{label:'Sat–Sun',hours:'Closed',closedException:true}]);
  assert.equal(resolveTodayLunchHours(data,'2026-11-06').endMinutes,870);
  assert.equal(resolveTodayLunchHours(data,'2026-11-07').status,'closed');
  assert.equal(resolveTodayLunchHours(data,'2026-11-08').status,'closed');
});
test('shows lunch status at the correct boundaries without assuming stock',()=>{
  const hours=resolveTodayLunchHours(schedule([regular]),'2026-11-06');
  assert.equal(formatLunchHours(hours,629),'午餐 10:30–14:30 · 常规 · 未开始');
  assert.equal(formatLunchHours(hours,630),'午餐 10:30–14:30 · 常规 · 时段内');
  assert.equal(formatLunchHours(hours,869),'午餐 10:30–14:30 · 常规 · 时段内');
  assert.equal(formatLunchHours(hours,870),'午餐 10:30–14:30 · 常规 · 已结束');
  assert.equal(formatLunchHours({status:'unknown',label:'午餐时间未提供'},870),'午餐时间未提供');
  assert.equal(formatLunchHours({status:'closed',label:'午餐暂停 · 常规'},870),'午餐暂停 · 常规');
});
test('uses Helsinki time in winter and summer',()=>{
  assert.equal(helsinkiMinutes(new Date('2026-11-06T14:00:00Z')),16*60);
  assert.equal(helsinkiMinutes(new Date('2026-06-01T09:30:00Z')),12*60+30);
});
test('distinguishes meat named in a title from meat only in ingredients',()=>{
  const named=detectMeat({name:'Chicken bolognese',ingredients:'chicken',meta:{}});
  const inIngredients=detectMeat({name:'Oven baked sausage',ingredients:'water, chicken, turkey',meta:{}});
  assert.equal(named.source,'菜名');assert.equal(named.animal,'鸡肉');
  assert.equal(inIngredients.source,'配料');assert.equal(inIngredients.animal,'鸡肉');
  assert.equal(detectMeat({name:'Chicken bolognese',ingredients:'chicken',meta:{'0':['K']}}).status,'identified');
});
test('does not treat vegan names, trace warnings or bouillon as meat dishes',()=>{
  assert.notEqual(detectMeat({name:'Vegetarian chicken-style strips',ingredients:'soy protein',meta:{}}).status,'identified');
  assert.notEqual(detectMeat({name:'Vegetable soup',ingredients:'water, carrot; may contain traces of chicken.',meta:{}}).status,'identified');
  assert.notEqual(detectMeat({name:'Vegetable soup',ingredients:'water, chicken bouillon powder (salt, chicken meat powder), carrot',meta:{}}).status,'identified');
});
test('accepts English-feed fish labels without confusing trace warnings for ingredients',()=>{
  assert.equal(officialMarks({meta:{'1':['fish']}}).containsFish,true);
  assert.equal(officialMarks({meta:{'1':['kalat']}}).containsFish,true);
  assert.equal(officialMarks({meta:{'1':['may contain traces of fish']}}).containsFish,false);
  assert.equal(officialMarks({meta:{'1':['saattaa sisältää: kalat']}}).containsFish,false);
});
test('keeps each restaurant associated with its own official address',()=>{
  const input=[
    {slug:'metsatalo',title:'Metsätalo',address:'Fabianinkatu 39',menuData:{}},
    {slug:'terkko',title:'Terkko',address:'Haartmaninkatu 4',menuData:{}}
  ];
  const records=buildRecords(input,'06.11.','2026-11-06');
  assert.deepEqual(records.map(r=>[r.name,r.address]),[['Metsätalo','Fabianinkatu 39'],['Terkko','Haartmaninkatu 4']]);
  assert.equal('officialUrl' in records[0],false);
});
