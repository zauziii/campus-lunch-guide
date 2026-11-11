import test from 'node:test';
import assert from 'node:assert/strict';
import {todayParts,shiftDateParts} from '../menu.mjs';

class Element {
  constructor(tag,text=''){
    this.tag=tag;this.text=text;this.children=[];this.dataset={};this.attributes={};this.handlers={};
    this.classList={toggle(){}};this.isConnected=true;
  }
  set textContent(text){this.text=String(text);this.children=[];}
  get textContent(){return this.text+this.children.map(child=>child.textContent).join('');}
  set innerHTML(value){this.text=String(value);this.children=[];}
  append(...items){this.children.push(...items.map(item=>typeof item==='string'?new Element('#text',item):item));}
  replaceChildren(...items){this.text='';this.children=[];this.append(...items);}
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(name,fn){this.handlers[name]=fn;}
  walk(){return [this,...this.children.flatMap(child=>child.walk())];}
}

test('the restaurant and campus show only unresolved dishes as pending',async t=>{
  const original={document:globalThis.document,fetch:globalThis.fetch,setInterval:globalThis.setInterval};
  t.after(()=>{
    if(original.document===undefined)delete globalThis.document;else globalThis.document=original.document;
    globalThis.fetch=original.fetch;globalThis.setInterval=original.setInterval;
  });
  const nodes=Object.fromEntries(['content','status','today','refresh','heading-day','list-note','source-link','eyebrow','fish-legend','footer-source','notice-details'].map(id=>[id,new Element(id)]));
  const schools=['helsinki','aalto'].map(university=>Object.assign(new Element('button'),{dataset:{university}}));
  const days=[0,1].map(day=>Object.assign(new Element('button'),{dataset:{day:String(day)}}));
  globalThis.document={body:new Element('body'),hidden:false,querySelector:s=>nodes[s.slice(1)],querySelectorAll:s=>s==='[data-university]'?schools:s==='[data-day]'?days:[],createElement:tag=>new Element(tag),createTextNode:text=>new Element('#text',String(text)),addEventListener(){}};
  globalThis.setInterval=()=>0;

  const tomorrow=shiftDateParts(todayParts().iso,1);
  const fish={name:'Mango-seesamikirjolohta',meta:{'1':['fish']},price:{name:'Erikoinen'}};
  const both={name:'Chicken with fish sauce',ingredients:'chicken, fish sauce',meta:{'1':['fish']},price:{name:'Lounas'}};
  const unknown={name:'Mystery special',meta:{},price:{name:'Erikoinen'}};
  let dishes=[fish,both];
  const feed=()=>[{slug:'meilahti',title:'Meilahti',location:[{name:'Meilahti'}],menuData:{menus:[{date:tomorrow.token,data:dishes}]}}];
  globalThis.fetch=async url=>String(url).includes('translations.json')
    ?{ok:true,json:async()=>({translations:{}})}
    :{ok:true,json:async()=>feed()};
  await import('../app.js');
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  await flush();days[1].handlers.click();await flush();

  let elements=nodes.content.walk();
  assert.equal(elements.some(node=>node.className==='count pending-count'),false);
  assert.equal(elements.some(node=>node.className==='pending-dishes'),false);
  const fishCell=elements.find(node=>node.className==='dish-cell fish');
  const meatCell=elements.find(node=>node.className==='dish-cell meat');
  assert.match(fishCell.textContent,/Mango-seesamikirjolohta/);
  assert.match(fishCell.textContent,/Chicken with fish sauce/);
  assert.match(meatCell.textContent,/Chicken with fish sauce/);

  dishes=[fish,both,unknown];nodes.refresh.handlers.click();await flush();
  elements=nodes.content.walk();
  const count=elements.find(node=>node.className==='count pending-count');
  const pending=elements.find(node=>node.className==='pending-dishes');
  assert.equal(count.textContent,'待确认1 家');
  assert.match(pending.textContent,/1 道待确认/);
  assert.match(pending.textContent,/Mystery special/);
  assert.doesNotMatch(pending.textContent,/Mango-seesamikirjolohta/);
  assert.doesNotMatch(pending.textContent,/Chicken with fish sauce/);
});
