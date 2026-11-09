import test from 'node:test';
import assert from 'node:assert/strict';
import {dishTranslation,localDishTranslation,isUsableChineseTranslation} from '../translation.mjs';
import {buildCache,collectDishNames,makeBatches} from '../scripts/update-translations.mjs';

const restaurants=[{menuData:{menus:[{date:'Mon 09.11.',data:[
  {name:'Chicken and rice',ingredients:'chicken, rice'},
  {name:'Salmon soup',meta:{1:['Fish']}},
  {name:'Chicken and rice',ingredients:'chicken, rice'},
  {name:'Saithe in pesto sauce',meta:{1:['Fish']}},
  {name:'Seitä pestokastikkeessa',meta:{1:['Fish']}},
  {name:'Lihapullia Mac & Cheese'},
  {name:'Kermainen savulohikeitto',meta:{1:['Fish']}},
  {name:'Tofu and vegetables',meta:{0:['Veg']}}
]}]}}];

test('local overrides are exact, including the two confirmed fish dishes',()=>{
  assert.equal(localDishTranslation('  Chicken   bolognese  '),'鸡肉肉酱');
  assert.equal(localDishTranslation('Chicken bolognese and salad'),'');
  assert.equal(localDishTranslation('Saithe in pesto sauce'),'青鳕配罗勒酱');
  assert.equal(localDishTranslation('Lemon fish with orange remoulade'),'柠檬鱼配橙香雷莫兰酱');
  assert.equal(localDishTranslation('Shiitake and parmesan pizza, truffle oil and rucola'),'香菇帕尔马奶酪披萨，配松露油和芝麻菜');
});

test('queues relevant English, Finnish and mixed titles while skipping cached local overrides',()=>{
  assert.deepEqual(collectDishNames(restaurants),[
    'Chicken and rice','Salmon soup','Seitä pestokastikkeessa',
    'Lihapullia Mac & Cheese','Kermainen savulohikeitto'
  ]);
});

test('displays valid cached translations for Finnish and mixed titles, or falls back to the original',()=>{
  const cached={'Kermainen savulohikeitto':'奶油烟熏三文鱼汤','Lihapullia Mac & Cheese':'肉丸配芝士通心粉',
    'Saithe in pesto sauce':'不应覆盖的旧翻译','Missing':'translation failed'};
  assert.equal(dishTranslation('Kermainen savulohikeitto',cached),'奶油烟熏三文鱼汤');
  assert.equal(dishTranslation('Lihapullia Mac & Cheese',cached),'肉丸配芝士通心粉');
  assert.equal(dishTranslation('Saithe in pesto sauce',cached),'青鳕配罗勒酱');
  assert.equal(dishTranslation('Missing',cached),'');
  assert.equal(dishTranslation('Not yet translated',cached),'');
});

test('Azure is called only for uncached relevant dishes with the regional header',async()=>{
  let request;
  const result=await buildCache({restaurants,previous:{translations:{'Chicken and rice':'鸡肉配米饭'}},key:'test-key',region:'northeurope',now:new Date('2026-11-07T03:00:00Z'),fetchImpl:async(url,options)=>{
    request={url,options};
    return {ok:true,json:async()=>['三文鱼汤','青鳕配罗勒酱','肉丸配芝士通心粉','奶油烟熏三文鱼汤'].map(text=>({translations:[{text,to:'zh-Hans'}]}))};
  }});
  const url=new URL(request.url);
  assert.equal(url.searchParams.has('from'),false);
  assert.equal(url.searchParams.get('to'),'zh-Hans');
  assert.equal(request.options.headers['Ocp-Apim-Subscription-Region'],'northeurope');
  assert.equal(request.options.headers['Ocp-Apim-Subscription-Key'],'test-key');
  assert.deepEqual(JSON.parse(request.options.body),[
    {Text:'Salmon soup'},{Text:'Seitä pestokastikkeessa'},
    {Text:'Lihapullia Mac & Cheese'},{Text:'Kermainen savulohikeitto'}
  ]);
  assert.equal(result.translations['Chicken and rice'],'鸡肉配米饭');
  assert.equal(result.translations['Salmon soup'],'三文鱼汤');
  assert.equal(result.translations['Lihapullia Mac & Cheese'],'肉丸配芝士通心粉');
  assert.equal(result.translations['Kermainen savulohikeitto'],'奶油烟熏三文鱼汤');
  assert.equal(result.stats.added,4);
  assert.equal(result.updatedAt,'2026-11-07T03:00:00.000Z');
});

test('Azure errors stop publication without exposing the key',async()=>{
  await assert.rejects(buildCache({restaurants,previous:{},key:'fake-secret',fetchImpl:async()=>({ok:false,status:403})}),error=>{
    assert.match(error.message,/403/);
    assert.doesNotMatch(error.message,/fake-secret/);
    return true;
  });
  await assert.rejects(buildCache({restaurants,previous:{},key:''}),/AZURE_TRANSLATOR_KEY/);
});

test('bad translations are not cached and large requests are split',async()=>{
  const result=await buildCache({restaurants,previous:{},key:'test-key',fetchImpl:async()=>({ok:true,json:async()=>[
    {translations:[{text:'鸡肉配米饭'}]},
    {translations:[{text:'Salmon soup'}]},
    {translations:[{text:'青鳕配青酱'}]},
    {translations:[{text:'肉丸配芝士通心粉'}]},
    {translations:[{text:'奶油烟熏三文鱼汤'}]}
  ]})});
  assert.equal(result.translations['Chicken and rice'],'鸡肉配米饭');
  assert.equal(Object.hasOwn(result.translations,'Salmon soup'),false);
  assert.equal(result.stats.untranslated,1);
  assert.equal(isUsableChineseTranslation('translation failed 中文'),false);
  assert.deepEqual(makeBatches(Array.from({length:51},(_,i)=>`Dish ${i}`)).batches.map(batch=>batch.length),[50,1]);
});
