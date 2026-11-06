import {CAMPUS_NAMES,todayParts,buildRecords} from './menu.mjs';
const API='https://unicafe.fi/wp-json/swiss/v1/restaurants';
const CACHE='campus-lunch-cn-v2';
const content=document.querySelector('#content'), status=document.querySelector('#status'), dateNode=document.querySelector('#today'), refreshButton=document.querySelector('#refresh');
let records=[], translations={}, currentDate='', translating=false, run=0;
const expandedCampuses=new Set();
try { translations=JSON.parse(localStorage.getItem(CACHE)||'{}'); } catch {}
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
function setStatus(message, fresh=false){status.replaceChildren();const dot=el('span',fresh?'status-dot ready':'status-dot');status.append(dot,document.createTextNode(' '+message));}
function key(d){return `${d.language}:${d.text}`;}
function improveTranslation(d, text){
  if (!text) return text;
  if (/muikku|vendace/i.test(`${d.original} ${d.enName}`)) text=text.replace(/摊贩|小吃/g,'白鲑鱼');
  if (/broiler|chicken|kana/i.test(`${d.original} ${d.enName}`)) text=text.replace(/肉鸡/g,'鸡肉');
  return text;
}
function render(){
  content.replaceChildren();
  const groups=Object.keys(CAMPUS_NAMES).filter(c=>records.some(r=>r.campus===c));
  for(const group of [...new Set(records.map(x=>x.campus))])if(!groups.includes(group))groups.push(group);
  for(const campus of groups){
    const list=records.filter(r=>r.campus===campus);
    const meatCount=list.filter(r=>r.dishes.some(d=>d.kind==='meat')).length;
    const fishCount=list.filter(r=>r.dishes.some(d=>d.kind==='fish')).length;
    const section=el('details','campus');
    section.open=expandedCampuses.has(campus);
    section.addEventListener('toggle',()=>{
      if(!section.isConnected)return;
      if(section.open)expandedCampuses.add(campus);else expandedCampuses.delete(campus);
    });
    const header=el('summary','campus-heading');
    header.append(el('h2','campus-title',`${CAMPUS_NAMES[campus]||campus}${campus==='Keskusta'?'校区':''}`));
    const meta=el('span','campus-meta');
    const counts=el('span','campus-summary');
    const meat=el('span','count');meat.append(el('i','dot meat'),document.createTextNode(`${meatCount} 家有肉`));
    const fish=el('span','count');fish.append(el('i','dot fish'),document.createTextNode(`${fishCount} 家有鱼`));
    counts.append(meat,fish);meta.append(counts);
    if(list.every(r=>!r.dishes.length))meta.append(el('span','missing-summary','暂无菜单'));
    const arrow=el('span','campus-arrow','⌄');arrow.setAttribute('aria-hidden','true');meta.append(arrow);
    header.append(meta);section.append(header);
    const table=el('table','menu-table');
    const thead=el('thead');const heading=el('tr');
    for(const label of ['食堂','肉类','鱼 / 海鲜']){const th=el('th','',label);th.scope='col';heading.append(th);}
    thead.append(heading);table.append(thead);
    const tbody=el('tbody');
    for(const restaurant of list){
      const row=el('tr');const name=el('th','restaurant-name');name.scope='row';
      name.append(el('span','name-text',restaurant.name));
      if(restaurant.staff)name.append(el('span','staff-tag','员工 / 教师'));
      row.append(name);
      if(!restaurant.dishes.length){const empty=el('td','no-menu','暂无菜单');empty.colSpan=2;row.append(empty);}
      else{
        for(const kind of ['meat','fish']){
          const cell=el('td',`dish-cell ${kind}`);const dishes=restaurant.dishes.filter(d=>d.kind===kind);
          if(!dishes.length)cell.append(el('span','none','没有找到'));
          else{
            const listEl=el('ul','dish-list');
            for(const dish of dishes){
              const item=el('li','dish');const translated=improveTranslation(dish,translations[key(dish)]);
              const fallback=dish.enName||dish.original;
              item.append(el('span','dish-name',translated||(translating?'正在翻译…':fallback)));
              if(translated || translating || (fallback!==dish.original && !translating)) item.append(el('span','original',dish.original));
              if(!translated&&!translating)item.append(el('span','untranslated','中文暂不可用'));
              listEl.append(item);
            }
            cell.append(listEl);
          }
          row.append(cell);
        }
      }
      tbody.append(row);
    }
    table.append(tbody);section.append(table);content.append(section);
  }
  if(!groups.length)content.append(el('div','state','今天暂无餐厅菜单。'));
}
function decode(s){const t=document.createElement('textarea');t.innerHTML=s;return t.value;}
async function translateAll(version){
  const needed=new Map();
  for(const r of records)for(const d of r.dishes)if((d.kind==='meat'||d.kind==='fish')&&!translations[key(d)])needed.set(key(d),{text:d.text,language:d.language});
  if(!needed.size)return;
  translating=true;render();
  const batches=[];
  for(const language of ['fi','en']){
    let batch=[],bytes=0;
    for(const item of needed.values()){
      if(item.language!==language)continue;
      const size=new TextEncoder().encode(item.text).length+1;
      if(batch.length&&bytes+size>380){batches.push(batch);batch=[];bytes=0;}
      batch.push(item);bytes+=size;
    }
    if(batch.length)batches.push(batch);
  }
  for(let start=0;start<batches.length;start+=3){
    await Promise.all(batches.slice(start,start+3).map(async batch=>{
      try{
        const params=new URLSearchParams({q:batch.map(x=>x.text).join('\n'),langpair:`${batch[0].language}|zh-CN`});
        const response=await fetch(`https://api.mymemory.translated.net/get?${params}`,{signal:AbortSignal.timeout(15000)});
        if(!response.ok)return;
        const data=await response.json();if(data.responseStatus!==200||data.quotaFinished)return;
        const result=decode(String(data.responseData?.translatedText||'')).split(/\r?\n/).map(x=>x.trim());
        if(result.length!==batch.length)return;
        batch.forEach((x,i)=>{if(result[i])translations[`${x.language}:${x.text}`]=result[i];});
      }catch{}
    }));
    if(version!==run)return;
    render();
  }
  if(version!==run)return;
  translating=false;try{localStorage.setItem(CACHE,JSON.stringify(translations));}catch{}render();
}
async function load(){
  const version=++run;translating=false;const today=todayParts();currentDate=today.iso;
  dateNode.textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Europe/Helsinki',month:'long',day:'numeric',weekday:'long'}).format(new Date());
  setStatus('正在获取官方菜单…');refreshButton.disabled=true;
  content.innerHTML='<div class="state"><div class="spinner"></div><h3>正在查看今天的菜单</h3><p>从 UniCafe 获取最新信息…</p></div>';
  try{
    async function get(language){const response=await fetch(`${API}?lang=${language}`,{cache:'no-store',signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('menu');const value=await response.json();if(!Array.isArray(value))throw Error('menu');return value;}
    const [fi,en]=await Promise.all([get('fi'),get('en').catch(()=>[])]);
    if(version!==run)return;
    records=buildRecords(fi,en,today.token);render();
    const time=new Intl.DateTimeFormat('zh-CN',{timeZone:'Europe/Helsinki',hour:'2-digit',minute:'2-digit'}).format(new Date());
    setStatus(`已更新 ${time} · 芬兰时间`,true);translateAll(version);
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
setInterval(()=>{if(todayParts().iso!==currentDate)load();},60000);
setInterval(load,15*60*1000);
