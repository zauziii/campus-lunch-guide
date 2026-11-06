import test from 'node:test';
import assert from 'node:assert/strict';
import {localDishTranslation,isUsableChineseTranslation,inspectTranslationResponse,translateQueue} from '../translation.mjs';

test('local translations match complete known dish names only',()=>{
  assert.equal(localDishTranslation('  kermainen   savulohikeitto  '),'奶油烟熏三文鱼汤');
  assert.equal(localDishTranslation('Kermainen savulohikeitto ja salaatti'),'');
});
test('translation responses reject exhausted quotas and untranslated text',()=>{
  assert.deepEqual(inspectTranslationResponse({responseStatus:429,responseData:{translatedText:'MYMEMORY WARNING: quota'}}),{status:'quota'});
  assert.deepEqual(inspectTranslationResponse({},429),{status:'quota'});
  assert.deepEqual(inspectTranslationResponse({responseStatus:200,quotaFinished:1}),{status:'quota'});
  assert.deepEqual(inspectTranslationResponse({responseStatus:200,responseData:{translatedText:'Chicken soup'}}),{status:'invalid'});
  assert.deepEqual(inspectTranslationResponse({responseStatus:200,responseData:{translatedText:'鸡肉汤'}}),{status:'success',text:'鸡肉汤'});
  assert.equal(isUsableChineseTranslation('MYMEMORY WARNING: 中文'),false);
});
test('one bad translation does not discard other dishes and quota stops further requests',async()=>{
  const requested=[],saved=[];
  const outcome=await translateQueue(['bad','good','quota','later'],{
    concurrency:1,
    request:async item=>{requested.push(item);return item==='bad'?{status:'invalid'}:item==='quota'?{status:'quota'}:{status:'success',text:'鸡肉'};},
    onResult:(item,text)=>saved.push([item,text])
  });
  assert.deepEqual(requested,['bad','good','quota']);
  assert.deepEqual(saved,[['good','鸡肉']]);
  assert.equal(outcome.quota,true);
});
test('stops retrying after repeated service failures',async()=>{
  let requests=0;
  const outcome=await translateQueue([1,2,3,4],{concurrency:1,request:async()=>{requests++;throw Error('network');},onResult:()=>{}});
  assert.equal(requests,2);assert.equal(outcome.unavailable,true);
});
test('a changed menu stops an obsolete translation queue',async()=>{
  let active=true;const saved=[];
  await translateQueue([1,2],{concurrency:1,shouldContinue:()=>active,request:async()=>{active=false;return {status:'success',text:'鸡肉'};},onResult:(item)=>saved.push(item)});
  assert.deepEqual(saved,[]);
});
