import {CAMPUS_NAMES,todayParts,helsinkiMinutes,formatLunchHours,shouldDisplayRestaurant,buildRecords} from './menu.mjs';
import {localDishTranslation,isUsableChineseTranslation,inspectTranslationResponse,translateQueue} from './translation.mjs';
const API='https://unicafe.fi/wp-json/swiss/v1/restaurants';
const CACHE='campus-lunch-cn-v2';
const content=document.querySelector('#content'), status=document.querySelector('#status'), dateNode=document.querySelector('#today'), refreshButton=document.querySelector('#refresh');
let records=[], translations={}, currentDate='', translating=false, run=0, translationBlockedUntil=0, translationRefreshPending=false, visibleSignature='';
let translationBindings=new Map(), hourBindings=[];
const expandedCampuses=new Set();
const expandedPending=new Set();
const expandedRestaurants=new Set();
try {const cached=JSON.parse(localStorage.getItem(CACHE)||'{}');if(cached&&typeof cached==='object'&&!Array.isArray(cached))translations=cached;} catch {}
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
function setStatus(message, fresh=false){status.replaceChildren();const dot=el('span',fresh?'status-dot ready':'status-dot');status.append(dot,document.createTextNode(' '+message));}
function key(d){return `${d.language}:${d.text}`;}
function improveTranslation(d, text){
  if (!text) return text;
  if (/muikku|vendace/i.test(`${d.original} ${d.enName}`)) text=text.replace(/摊贩|小吃/g,'白鲑鱼');
  if (/broiler|chicken|kana/i.test(`${d.original} ${d.enName}`)) text=text.replace(/肉鸡/g,'鸡肉');
  return text;
}
function translationFor(dish){
  const local=localDishTranslation(dish.original);
  if(local)return local;
  const cached=translations[key(dish)];
  return isUsableChineseTranslation(cached)?improveTranslation(dish,cached):'';
}
function updateTranslation(binding){
  const {dish,title,original,note}=binding,translated=translationFor(dish),fallback=dish.enName||dish.original;
  title.textContent=translated||fallback;
  original.textContent=(translated||fallback!==dish.original)?dish.original:'';
  note.textContent=translated?'':translating?'翻译中…':'中文暂不可用';
}
function refreshTranslations(onlyKey){
  if(onlyKey){for(const binding of translationBindings.get(onlyKey)||[])updateTranslation(binding);return;}
  for(const bindings of translationBindings.values())for(const binding of bindings)updateTranslation(binding);
}
function updateLunchTimes(){
  const minutes=helsinkiMinutes();
  for(const {node,hours} of hourBindings){
    const formatted=formatLunchHours(hours,minutes),prefix=hours.label;
    if(formatted.startsWith(`${prefix} · `))node.replaceChildren(document.createTextNode(prefix),el('span','lunch-phase',formatted.slice(prefix.length)));
    else node.textContent=formatted;
  }
}
function visibleRestaurants(){const minutes=helsinkiMinutes();return records.filter(r=>shouldDisplayRestaurant(r,minutes));}
function signature(list){return JSON.stringify(list.map(r=>r.slug));}
function renderDish(dish, kind){
  const item=el('li','dish'),title=el('span','dish-name');item.append(title);
  if(kind==='meat' && dish.meat.status==='identified')item.append(el('span','evidence',dish.meat.source==='菜名'?dish.meat.animal:`配料含肉（${dish.meat.animal}）`));
  if(kind==='fish'){
    const labels=[];if(dish.marks.containsFish)labels.push('鱼');if(dish.marks.containsCrustaceans)labels.push('甲壳类');if(dish.marks.containsMolluscs)labels.push('贝类');
    item.append(el('span','evidence',`官方标记：${labels.join(' / ')}`));
  }
  const original=el('span','original'),note=el('span','untranslated');item.append(original,note);
  const binding={dish,title,original,note}, k=key(dish);
  if(!translationBindings.has(k))translationBindings.set(k,[]);
  translationBindings.get(k).push(binding);updateTranslation(binding);
  return item;
}
function render(){
  content.replaceChildren();translationBindings=new Map();hourBindings=[];
  const visible=visibleRestaurants();visibleSignature=signature(visible);
  const groups=Object.keys(CAMPUS_NAMES).filter(c=>visible.some(r=>r.campus===c));
  for(const group of [...new Set(visible.map(x=>x.campus))])if(!groups.includes(group))groups.push(group);
  content.classList.toggle('single-campus',groups.length===1);
  for(const campus of groups){
    const list=visible.filter(r=>r.campus===campus);
    const meatCount=list.filter(r=>r.dishes.some(d=>d.meat.status==='identified')).length;
    const fishCount=list.filter(r=>r.dishes.some(d=>d.fish)).length;
    const pendingCount=list.filter(r=>r.dishes.some(d=>d.meat.status==='uncertain')).length;
    const section=el('details','campus');
    section.open=expandedCampuses.has(campus);
    section.addEventListener('toggle',()=>{
      if(!section.isConnected)return;
      if(section.open)expandedCampuses.add(campus);else expandedCampuses.delete(campus);
    });
    const header=el('summary','campus-heading');
    header.append(el('h2','campus-title',`${CAMPUS_NAMES[campus]||campus}${campus==='Keskusta'?'校区':''}`));
    const meta=el('span','campus-meta');const counts=el('span','campus-summary');
    const meat=el('span','count count-meat');meat.append(el('i','dot meat'),el('span','count-label','肉类'),el('strong','count-number',`${meatCount} 家`));
    const fish=el('span','count count-fish');fish.append(el('i','dot fish'),el('span','count-label','鱼 / 海鲜'),el('strong','count-number',`${fishCount} 家`));
    counts.append(meat,fish);
    if(pendingCount){const pending=el('span','count pending-count');pending.append(el('span','count-label','待确认'),el('strong','count-number',`${pendingCount} 家`));counts.append(pending);}
    meta.append(counts);
    if(list.every(r=>!r.dishes.length))meta.append(el('span','missing-summary','暂无菜单'));
    const arrow=el('span','campus-arrow','⌄');arrow.setAttribute('aria-hidden','true');meta.append(arrow);
    header.append(meta);section.append(header);
    const table=el('table','menu-table');const thead=el('thead');const heading=el('tr');
    for(const label of ['食堂','肉类（已识别）','鱼 / 海鲜（官方标记）']){const th=el('th','',label);th.scope='col';heading.append(th);}
    thead.append(heading);table.append(thead);const tbody=el('tbody');
    for(const restaurant of list){
      const row=el('tr');const name=el('th','restaurant-name');name.scope='row';
      const information=el('details','restaurant-info');information.open=expandedRestaurants.has(restaurant.slug);
      information.addEventListener('toggle',()=>{if(!information.isConnected)return;if(information.open)expandedRestaurants.add(restaurant.slug);else expandedRestaurants.delete(restaurant.slug);});
      const summary=el('summary','name-text restaurant-info-toggle',restaurant.name);summary.setAttribute('aria-label',`${restaurant.name} 食堂信息`);
      const infoIcon=el('span','restaurant-info-icon','ⓘ');infoIcon.setAttribute('aria-hidden','true');summary.append(infoIcon);information.append(summary);
      const details=el('div','restaurant-info-panel');details.append(el('span','restaurant-address',restaurant.address?`地址：${restaurant.address}`:'地址未提供'));
      information.append(details);name.append(information);
      if(restaurant.staff)name.append(el('span','staff-tag','员工 / 教师'));
      const hours=el('span',`lunch-hours ${restaurant.lunchHours.status}`);hourBindings.push({node:hours,hours:restaurant.lunchHours});name.append(hours);
      row.append(name);
      if(!restaurant.dishes.length){const empty=el('td','no-menu','暂无菜单');empty.colSpan=2;row.append(empty);}
      else{
        const meatCell=el('td','dish-cell meat');
        const identified=restaurant.dishes.filter(d=>d.meat.status==='identified');
        const pending=restaurant.dishes.filter(d=>d.meat.status==='uncertain');
        if(!identified.length)meatCell.append(el('span','none','未识别到肉'));
        else{const items=el('ul','dish-list');identified.forEach(d=>items.append(renderDish(d,'meat')));meatCell.append(items);}
        if(pending.length){
          const panel=el('details','pending-dishes');panel.open=expandedPending.has(restaurant.slug);
          panel.addEventListener('toggle',()=>{if(!panel.isConnected)return;if(panel.open)expandedPending.add(restaurant.slug);else expandedPending.delete(restaurant.slug);});
          panel.append(el('summary','pending-toggle',`${pending.length} 道待确认`));
          const items=el('ul','dish-list');pending.forEach(d=>items.append(renderDish(d,'pending')));panel.append(items);meatCell.append(panel);
        }
        row.append(meatCell);
        const fishCell=el('td','dish-cell fish');const fishDishes=restaurant.dishes.filter(d=>d.fish);
        if(!fishDishes.length)fishCell.append(el('span','none','未识别到鱼 / 海鲜'));
        else{const items=el('ul','dish-list');fishDishes.forEach(d=>items.append(renderDish(d,'fish')));fishCell.append(items);}
        row.append(fishCell);
      }
      tbody.append(row);
    }
    table.append(tbody);section.append(table);content.append(section);
  }
  if(!groups.length){const empty=el('div','state');empty.append(el('h3','','当前没有可显示的食堂'),el('p','','午餐结束或未找到相关菜品的食堂已隐藏。'));content.append(empty);}
  updateLunchTimes();
}
function decode(s){const t=document.createElement('textarea');t.innerHTML=s;return t.value;}
async function translateAll(version){
  const needed=new Map();
  for(const r of visibleRestaurants())for(const d of r.dishes)if((d.meat.status==='identified'||d.meat.status==='uncertain'||d.fish)&&!translationFor(d))needed.set(key(d),{cacheKey:key(d),text:d.text,language:d.language});
  if(!needed.size||Date.now()<translationBlockedUntil)return;
  translating=true;refreshTranslations();
  const startSignature=visibleSignature;
  const outcome=await translateQueue([...needed.values()],{
    shouldContinue:()=>version===run&&startSignature===visibleSignature,
    request:async item=>{
      if(new TextEncoder().encode(item.text).length>500)return {status:'invalid'};
      const params=new URLSearchParams({q:item.text,langpair:`${item.language}|zh-CN`});
      const response=await fetch(`https://api.mymemory.translated.net/get?${params}`,{signal:AbortSignal.timeout(12000)});
      if(response.status===429)return {status:'quota'};
      if(!response.ok)return {status:response.status>=500?'unavailable':'invalid'};
      const data=await response.json();return inspectTranslationResponse(data,response.status,decode);
    },
    onResult:(item,text)=>{
      translations[item.cacheKey]=text;
      try{localStorage.setItem(CACHE,JSON.stringify(translations));}catch{}
      refreshTranslations(item.cacheKey);
    }
  });
  if(version!==run)return;
  if(outcome.quota)translationBlockedUntil=Date.now()+60*60*1000;
  else if(outcome.unavailable)translationBlockedUntil=Date.now()+5*60*1000;
  translating=false;refreshTranslations();
  if(translationRefreshPending){translationRefreshPending=false;requestTranslations(version);}
}
function requestTranslations(version){
  if(version!==run)return;
  if(translating){translationRefreshPending=true;return;}
  translateAll(version).catch(()=>{if(version===run){translating=false;translationRefreshPending=false;refreshTranslations();}});
}
async function load(){
  const version=++run;translating=false;translationRefreshPending=false;const today=todayParts();currentDate=today.iso;
  dateNode.textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Europe/Helsinki',month:'long',day:'numeric',weekday:'long'}).format(new Date());
  setStatus('正在获取官方菜单…');refreshButton.disabled=true;
  content.innerHTML='<div class="state"><div class="spinner"></div><h3>正在查看今天的菜单</h3><p>从 UniCafe 获取最新信息…</p></div>';
  try{
    async function get(language){const response=await fetch(`${API}?lang=${language}`,{cache:'no-store',signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('menu');const value=await response.json();if(!Array.isArray(value))throw Error('menu');return value;}
    const [fi,en]=await Promise.all([get('fi'),get('en').catch(()=>[])]);
    if(version!==run)return;
    records=buildRecords(fi,en,today.token,today.iso);render();
    const time=new Intl.DateTimeFormat('zh-CN',{timeZone:'Europe/Helsinki',hour:'2-digit',minute:'2-digit'}).format(new Date());
    setStatus(`已更新 ${time}`,true);requestTranslations(version);
  }catch{
    if(version!==run)return;setStatus('菜单暂时无法获取');content.innerHTML='<div class="state error"><div class="state-icon">!</div><h3>暂时无法获取菜单</h3><p>请稍后点击“刷新菜单”，也可以直接查看 UniCafe 官网。</p></div>';
  }finally{if(version===run)refreshButton.disabled=false;}
}
document.querySelector('#original-toggle').addEventListener('click',event=>{
  const button=event.currentTarget;const shown=button.getAttribute('aria-pressed')!=='true';
  button.setAttribute('aria-pressed',String(shown));button.textContent=shown?'隐藏芬兰语':'显示芬兰语';
  document.body.classList.toggle('show-original',shown);
});
refreshButton.addEventListener('click',load);load();
function updateDateAndTime(){
  if(todayParts().iso!==currentDate){load();return;}
  if(refreshButton.disabled)return;
  if(signature(visibleRestaurants())!==visibleSignature){render();requestTranslations(run);}
  else updateLunchTimes();
}
setInterval(updateDateAndTime,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateDateAndTime();});
setInterval(load,15*60*1000);
