import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLaurusRecords,classifyAaltoDish,shouldDisplayRestaurant} from '../menu.mjs';
import {buildCache} from '../scripts/update-translations.mjs';

const snapshot={collectedAt:'2026-11-11T05:30:00Z',restaurants:[{
  id:69,name:'Laurus / Café Civis',url:'https://www.sodexo.fi/en/restaurants/helsinki-university-main-building',
  address:'Fabianinkatu 33, 00170 Helsinki',sourceAvailable:true,menus:{
    '2026-11-11':{lunchHours:{start:630,end:900},dishes:[
      {name:"Fried coley (1 pcs) in the baker's style",allergens:['Fish'],components:['Paistettua seitiä'],source:'sodexo'},
      {name:'Cafe Civis: Marinated shrimp poke bowl',allergens:['Crustaceans'],source:'sodexo'},
      {name:'Cafe Civis: Curry chicken baguette',components:['Curry-broilerpatonki'],source:'sodexo'},
      {name:'Root vegetable and bean hash',properties:['VV'],source:'sodexo'}
    ]},
    '2026-11-12':{lunchHours:{start:630,end:900},dishes:[{name:'Pollo limonello pasta',source:'sodexo'}]}
  }
},{id:70,name:'Not the requested restaurant',menus:{}}]};

test('places the requested Main Building restaurant in the existing city-centre group',()=>{
  const records=buildLaurusRecords(snapshot,'2026-11-11','Keskusta');
  assert.equal(records.length,1);
  const record=records[0];
  assert.equal(record.campus,'Keskusta');
  assert.equal(record.name,'Laurus / Café Civis');
  assert.equal(record.provider,'external');
  assert.equal(record.officialUrl,'https://www.sodexo.fi/en/restaurants/helsinki-university-main-building');
  assert.equal(record.address,'Fabianinkatu 33, 00170 Helsinki');
  assert.equal(shouldDisplayRestaurant(record,899),true);
  assert.equal(shouldDisplayRestaurant(record,900),false);
  assert.equal(shouldDisplayRestaurant(record,null),true);
});

test('uses Sodexo allergens and recipe components to identify fish, seafood and chicken',()=>{
  const dishes=buildLaurusRecords(snapshot,'2026-11-11')[0].dishes;
  assert.equal(dishes[0].fish,true);
  assert.equal(dishes[0].fishEvidence,'官方过敏原');
  assert.equal(dishes[1].marks.containsCrustaceans,true);
  assert.equal(dishes[2].meat.animal,'鸡肉');
  assert.equal(dishes[2].meat.source,'菜名');
  assert.equal(dishes[3].meat.status,'excluded');
  assert.equal(dishes[3].fish,false);
});

test('recognizes coley and pollo in dish names without labelling vegan pollo as meat',()=>{
  assert.equal(classifyAaltoDish({name:'Fried coley'}).fishEvidence,'菜名');
  assert.equal(buildLaurusRecords(snapshot,'2026-11-12')[0].dishes[0].meat.animal,'鸡肉');
  assert.equal(buildLaurusRecords(snapshot,'2026-11-12')[0].dishes[0].meat.source,'菜名');
  assert.notEqual(classifyAaltoDish({name:'Vegan pollo pasta',properties:['VV']}).meat.status,'identified');
});

test('distinguishes actual ingredients from recipe titles and dish names',()=>{
  assert.equal(classifyAaltoDish({name:'House special',ingredients:['broiler']}).meat.source,'食材信息');
  assert.equal(classifyAaltoDish({name:'House special',components:['broiler']}).meat.source,'配方信息');
  assert.equal(classifyAaltoDish({name:'House special',components:['Paistettua seitiä']}).fishEvidence,'配方信息');
  assert.equal(classifyAaltoDish({name:'House special',ingredients:['seiti']}).fishEvidence,'食材信息');
  assert.equal(classifyAaltoDish({name:'Fish soup',components:['Kalakeitto']}).fishEvidence,'菜名');
});

test('does not mistake Finnish nationality words for fish but recognizes actual fish compounds',()=>{
  const cheese={name:'Cafe Civis: Greek cheese baguette',components:['Kreikkalainen juustopatonki G, L'],source:'sodexo'};
  assert.equal(classifyAaltoDish(cheese).fish,false);
  for(const name of ['Kreikkalainen salaatti','Amerikkalainen kastike','Ranskalaisia perunoita']){
    assert.equal(classifyAaltoDish({name}).fish,false,name);
  }
  for(const name of ['Kalakeittoa','Mantelikalaa','Savukalaa','Tonnikalaa','Kreikkalainen kala']){
    assert.equal(classifyAaltoDish({name}).fish,true,name);
  }
});

test('includes relevant Main Building menu names in the translation cache',async()=>{
  let body=[];
  const cache=await buildCache({restaurants:[],previous:{},laurus:snapshot,key:'test-key',fetchImpl:async(_url,options)=>{
    body=JSON.parse(options.body);
    return {ok:true,json:async()=>body.map(()=>({translations:[{text:'测试菜名'}]}))};
  }});
  assert.ok(!body.some(x=>x.Text==='Pollo limonello pasta'));
  assert.ok(body.some(x=>x.Text.includes('Fried coley')));
  assert.ok(!body.some(x=>x.Text==='Root vegetable and bean hash'));
  assert.equal(cache.translations['Cafe Civis: Curry chicken baguette'],'测试菜名');
});
