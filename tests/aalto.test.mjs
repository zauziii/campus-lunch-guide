import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAaltoRecords,classifyAaltoDish,shouldDisplayRestaurant} from '../menu.mjs';
import {collectAaltoDishNames} from '../scripts/update-translations.mjs';

test('uses official recipe components before the dish name for meat evidence',()=>{
  const d=classifyAaltoDish({name:'House special',components:['Porsaanlihasuikaleita'],source:'sodexo'});
  assert.equal(d.meat.status,'identified');
  assert.equal(d.meat.animal,'猪肉');
  assert.equal(d.meat.source,'食材信息');
});

test('distinguishes fish allergens, title evidence and uncertain dishes',()=>{
  const fromAllergen=classifyAaltoDish({name:'House special',allergens:['Fish'],source:'sodexo'});
  assert.equal(fromAllergen.fish,true);
  assert.equal(fromAllergen.fishEvidence,'官方过敏原');
  const fromName=classifyAaltoDish({name:'Crispy fish pieces',source:'compass'});
  assert.equal(fromName.fish,true);
  assert.equal(fromName.fishEvidence,'菜名');
  const unknown=classifyAaltoDish({name:'House special',allergens:['May contain fish'],source:'sodexo'});
  assert.equal(unknown.fish,false);
  assert.equal(unknown.meat.status,'uncertain');
});

test('does not mistake Finnish French fries for fish, but still recognizes fish in the same meal',()=>{
  const burger=classifyAaltoDish({name:'Cheeseburger, French fries',components:['Cheese burger','Ranskalaisia perunoita G, M'],source:'sodexo'});
  assert.equal(burger.fish,false);
  assert.equal(burger.meat.status,'uncertain');
  const fish=classifyAaltoDish({name:'Meal',components:['Kalapihvi','Ranskalaiset perunat'],source:'sodexo'});
  assert.equal(fish.fish,true);
});

test('does not identify vegan dishes, carrots or meat stock as meat',()=>{
  for(const item of [
    {name:'Vegan chicken',properties:['VV']},
    {name:'Vegetarian lunch: soy kebab',properties:['Veg']},
    {name:'Porkkanakeitto',properties:['VV']},
    {name:'Vegetable soup',components:['chicken broth']}
  ])assert.notEqual(classifyAaltoDish(item).meat.status,'identified',item.name);
  assert.equal(classifyAaltoDish({name:'Ham pizza'}).meat.source,'菜名');
});

test('uses the correct restaurant link and day and respects official lunch hours',()=>{
  const source={restaurants:[{id:52,name:'A Bloc',url:'https://www.compass-group.fi/restaurant/a-bloc/',address:'Otaniementie 12',weeklyHours:[],sourceAvailable:true,menus:{'2026-11-07':{
    lunchHours:{start:660,end:960},dishes:[{name:'Crispy chicken',source:'compass'}]
  }}}]};
  const [record]=buildAaltoRecords(source,'2026-11-07');
  assert.equal(record.officialUrl,'https://www.compass-group.fi/restaurant/a-bloc/');
  assert.equal(record.campus,'Otaniemi');
  assert.equal(record.dishes[0].meat.status,'identified');
  assert.equal(shouldDisplayRestaurant(record,959),true);
  assert.equal(shouldDisplayRestaurant(record,960),false);
  assert.equal(buildAaltoRecords(source,'2026-11-08')[0].dishes.length,0);
});

test('queues relevant Aalto titles in Finnish or English for translation',()=>{
  const data={restaurants:[{menus:{'2026-11-09':{dishes:[
    {name:'Chicken and rice'}, {name:'Chicken and rice'},
    {name:'Seitä pestokastikkeessa'}, {name:'Vegan soup',properties:['VV']},
    {name:'Saithe in pesto sauce'}
  ]}}}]};
  assert.deepEqual(collectAaltoDishNames(data),['Chicken and rice','Seitä pestokastikkeessa']);
});
