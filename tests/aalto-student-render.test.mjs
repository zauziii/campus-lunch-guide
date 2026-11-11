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
}

test('Aalto shows student lunch restaurants and warns about unclassified old data',async t=>{
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
  const restaurant=(id,name,priceCategory)=>({id,name,priceCategory,menus:{[tomorrow.iso]:{dishes:[{name:'Chicken',source:'kanttiinit'}]}}});
  let aalto={collectedAt:new Date().toISOString(),restaurants:[
    restaurant(1,'Kvarkki','student'),restaurant(41,'Mau-kas','studentPremium'),restaurant(99,'Unknown café',undefined)
  ]};
  globalThis.fetch=async url=>String(url).includes('translations.json')
    ?{ok:true,json:async()=>({translations:{},aalto})}
    :{ok:true,json:async()=>[]};
  await import('../app.js');
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  await flush();schools[1].handlers.click();await flush();days[1].handlers.click();await flush();
  assert.equal(nodes['list-note'].textContent,'仅显示学生餐餐厅');
  assert.match(nodes.content.textContent,/Kvarkki/);
  assert.doesNotMatch(nodes.content.textContent,/Mau-kas|Unknown café/);
  assert.match(nodes.content.textContent,/部分餐厅分类或菜单暂时无法确认/);

  aalto={collectedAt:new Date().toISOString(),refreshFailed:true,restaurants:[restaurant(99,'Old café',undefined)]};
  nodes.refresh.handlers.click();await flush();
  assert.doesNotMatch(nodes.content.textContent,/Old café/);
  assert.match(nodes.content.textContent,/旧数据的学生餐分类无法确认/);
});
