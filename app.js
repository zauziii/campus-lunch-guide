import {CAMPUS_NAMES,todayParts,shiftDateParts,helsinkiMinutes,formatLunchHours,shouldDisplayRestaurant,emptyMenuState,officialRestaurantUrl,buildRecords,buildAaltoRecords,buildLaurusRecords} from './menu.mjs?v=20261111c';
import {dishTranslation} from './translation.mjs?v=20261111b';
const API='https://unicafe.fi/wp-json/swiss/v1/restaurants';
const content=document.querySelector('#content'), status=document.querySelector('#status'), dateNode=document.querySelector('#today'), refreshButton=document.querySelector('#refresh');
let records=[], translations={}, currentDate='', run=0, visibleSignature='', university='helsinki', sourceWarning='', sourceIncomplete=false, dayOffset=0;
let hourBindings=[];
const expandedCampuses=new Set();
const expandedPending=new Set();
const expandedRestaurants=new Set();
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
function setStatus(message, fresh=false){status.replaceChildren();const dot=el('span',fresh?'status-dot ready':'status-dot');status.append(dot,document.createTextNode(' '+message));}
function translationFor(dish){
  return dishTranslation(dish.original,translations);
}
function updateLunchTimes(){
  const minutes=displayMinutes();
  for(const {node,hours} of hourBindings){
    const formatted=formatLunchHours(hours,minutes),prefix=hours.label;
    if(formatted.startsWith(`${prefix} · `))node.replaceChildren(document.createTextNode(prefix),el('span','lunch-phase',formatted.slice(prefix.length)));
    else node.textContent=formatted;
  }
}
// Future menus use their published schedule, but must not be hidden by the
// current time of day. Today's existing restaurant filtering stays unchanged.
function displayMinutes(){return dayOffset===0?helsinkiMinutes():null;}
function visibleRestaurants(){const minutes=displayMinutes();return records.filter(r=>shouldDisplayRestaurant(r,minutes));}
function selectedMenuState(){
  const state=emptyMenuState(records,displayMinutes());
  if(!state)return null;
  const day=dayOffset===0?'今天':'明天';
  if(state.kind==='no-menu'&&sourceIncomplete)return {kind:'source-incomplete',title:'菜单信息暂不完整',detail:sourceWarning||'部分餐厅暂时无法获取，请查看餐厅官网。'};
  if(state.kind==='no-menu'&&dayOffset===1)return {...state,title:'明天暂无菜单信息',detail:'菜单可能尚未公布，或尚未采集。'};
  if(state.kind==='no-match')return {...state,title:sourceWarning?`${day}已获取的菜单中暂未发现肉或鱼`:`${day}暂未发现肉或鱼`};
  if(state.kind==='lunch-ended'&&dayOffset===1)return {...state,title:'明天没有可显示的食堂',detail:'已获取的菜单显示餐厅关闭，其他餐厅可能尚未公布菜单。'};
  return state;
}
function signature(list){return JSON.stringify([list.map(r=>r.slug),selectedMenuState()?.kind]);}
function renderDish(dish, kind, restaurant){
  const translated=translationFor(dish);
  const external=restaurant.provider==='external';
  const item=el('li','dish'),title=el('span','dish-name',translated||dish.original);item.append(title);
  if(kind==='meat' && dish.meat.status==='identified'){
    const origin=dish.meat.source==='食材信息'?'食材信息':dish.meat.source==='配方信息'?'配方信息':'菜名识别';
    const evidence=external?`${origin} · ${dish.meat.animal}`:dish.meat.source==='菜名'?dish.meat.animal:`配料含肉（${dish.meat.animal}）`;
    item.append(el('span','evidence',evidence));
  }
  if(kind==='fish'){
    const labels=[];if(dish.marks.containsFish)labels.push('鱼');if(dish.marks.containsCrustaceans)labels.push('甲壳类');if(dish.marks.containsMolluscs)labels.push('贝类');
    const basis=external?(dish.fishEvidence==='菜名'?'菜名识别':dish.fishEvidence||'官方过敏原'):'官方标记';
    item.append(el('span','evidence',`${basis}：${labels.join(' / ')}`));
  }
  const original=el('span','original'),note=el('span','untranslated');item.append(original,note);
  original.textContent=translated?dish.original:'';
  note.textContent=translated?'':'中文待更新';
  return item;
}
function render(){
  content.replaceChildren();hourBindings=[];
  const visible=visibleRestaurants();visibleSignature=signature(visible);
  const groups=Object.keys(CAMPUS_NAMES).filter(c=>visible.some(r=>r.campus===c));
  for(const group of [...new Set(visible.map(x=>x.campus))])if(!groups.includes(group))groups.push(group);
  content.classList.toggle('single-campus',groups.length===1);
  const result=selectedMenuState();
  if(sourceWarning&&result?.kind!=='source-incomplete')content.append(el('p','source-warning',sourceWarning));
  if(groups.length&&result?.kind==='no-match')content.append(el('p','no-results-note',result.title));
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
    header.append(el('h2','campus-title',`${CAMPUS_NAMES[campus]||campus}${campus==='Keskusta'||campus==='City Centre'?'校区':''}`));
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
    for(const label of ['食堂','肉类（已识别）','鱼 / 海鲜']){const th=el('th','',label);th.scope='col';heading.append(th);}
    thead.append(heading);table.append(thead);const tbody=el('tbody');
    for(const restaurant of list){
      const row=el('tr');const name=el('th','restaurant-name');name.scope='row';
      const officialUrl=restaurant.provider==='external'?restaurant.officialUrl:officialRestaurantUrl(restaurant.slug);
      const restaurantName=el(officialUrl?'a':'span','name-text restaurant-link',restaurant.name);
      if(officialUrl){restaurantName.href=officialUrl;restaurantName.target='_blank';restaurantName.rel='noopener noreferrer';restaurantName.setAttribute('aria-label',`${restaurant.name}，在${restaurant.provider==='external'?'餐厅':'UniCafe'}官网打开`);restaurantName.append(el('span','restaurant-link-icon',' ↗'));}
      name.append(restaurantName);
      const information=el('details','restaurant-info');information.open=expandedRestaurants.has(restaurant.slug);
      information.addEventListener('toggle',()=>{if(!information.isConnected)return;if(information.open)expandedRestaurants.add(restaurant.slug);else expandedRestaurants.delete(restaurant.slug);});
      const summary=el('summary','restaurant-info-toggle','ⓘ');summary.setAttribute('aria-label',`查看 ${restaurant.name} 地址`);information.append(summary);
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
        else{const items=el('ul','dish-list');identified.forEach(d=>items.append(renderDish(d,'meat',restaurant)));meatCell.append(items);}
        if(pending.length){
          const panel=el('details','pending-dishes');panel.open=expandedPending.has(restaurant.slug);
          panel.addEventListener('toggle',()=>{if(!panel.isConnected)return;if(panel.open)expandedPending.add(restaurant.slug);else expandedPending.delete(restaurant.slug);});
          panel.append(el('summary','pending-toggle',`${pending.length} 道待确认`));
          const items=el('ul','dish-list');pending.forEach(d=>items.append(renderDish(d,'pending',restaurant)));panel.append(items);meatCell.append(panel);
        }
        row.append(meatCell);
        const fishCell=el('td','dish-cell fish');const fishDishes=restaurant.dishes.filter(d=>d.fish);
        if(!fishDishes.length)fishCell.append(el('span','none','未识别到鱼 / 海鲜'));
        else{const items=el('ul','dish-list');fishDishes.forEach(d=>items.append(renderDish(d,'fish',restaurant)));fishCell.append(items);}
        row.append(fishCell);
      }
      tbody.append(row);
    }
    table.append(tbody);section.append(table);content.append(section);
  }
  if(!groups.length){const state=result||{title:'当前没有可显示的食堂'},empty=el('div','state');empty.append(el('h3','',state.title));if(state.detail)empty.append(el('p','',state.detail));content.append(empty);}
  updateLunchTimes();
}
async function loadPrepared(){
  try{
    const response=await fetch(new URL('./data/translations.json',import.meta.url),{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)return {};
    const data=await response.json();
    return data&&typeof data==='object'&&!Array.isArray(data)?data:{};
  }catch{return {};}
}
async function load(){
  const version=++run,school=university,offset=dayOffset;const today=todayParts(),selected=shiftDateParts(today.iso,offset),day=offset===0?'今天':'明天';
  currentDate=today.iso;sourceWarning='';sourceIncomplete=false;
  document.querySelector('#heading-day').textContent=day;
  document.title=`吃好饭 | ${day}哪里有肉和鱼？`;
  document.querySelector('#list-note').textContent=offset===0?'已隐藏午餐结束或未找到相关菜品的食堂':'仅显示已公布且有相关菜品的食堂';
  dateNode.textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Europe/Helsinki',month:'long',day:'numeric',weekday:'long'}).format(new Date(`${selected.iso}T12:00:00Z`));
  setStatus(school==='aalto'?'正在读取已发布菜单…':'正在获取官方菜单…');refreshButton.disabled=true;
  content.innerHTML=`<div class="state"><div class="spinner"></div><h3>正在查看${day}的菜单</h3><p>正在获取菜单信息…</p></div>`;
  try{
    const [response,prepared]=await Promise.all([
      school==='helsinki'?fetch(`${API}?lang=en`,{cache:'no-store',signal:AbortSignal.timeout(25000)}).catch(()=>null):Promise.resolve(null),
      loadPrepared()
    ]);
    if(version!==run)return;
    translations=prepared?.translations&&typeof prepared.translations==='object'&&!Array.isArray(prepared.translations)?prepared.translations:{};
    if(school==='helsinki'){
      let en=null;
      try{if(response?.ok){const data=await response.json();if(Array.isArray(data))en=data;}}catch{}
      if(version!==run)return;
      records=en?buildRecords(en,selected.token,selected.iso):[];
      const city=records.find(r=>r.campus==='City Centre'||r.campus==='Keskusta')?.campus||'City Centre';
      const snapshot=prepared?.laurus,laurus=buildLaurusRecords(snapshot,selected.iso,city);
      if(!en&&!laurus.length)throw Error('menu');
      records.push(...laurus);
      const warnings=[];
      if(!en){warnings.push('UniCafe 菜单暂时无法获取');sourceIncomplete=true;}
      if(!snapshot?.collectedAt||!laurus.length){warnings.push('主楼餐厅菜单暂时无法获取');sourceIncomplete=true;}
      else if(snapshot.refreshFailed){warnings.push('主楼餐厅显示上次采集的数据');sourceIncomplete=true;}
      else if(snapshot.officialAvailable===false){warnings.push('主楼餐厅暂用 Kanttiinit 数据');sourceIncomplete=true;}
      else if(!laurus[0].hasMenu){warnings.push(`主楼餐厅${day}暂无菜单`);sourceIncomplete=true;}
      sourceWarning=warnings.length?`${warnings.join('；')}。`:'';
      const time=new Intl.DateTimeFormat('zh-CN',{timeZone:'Europe/Helsinki',hour:'2-digit',minute:'2-digit'}).format(new Date());
      setStatus(en?`UniCafe 获取 ${time}`:'主楼菜单已读取',Boolean(en));
    }else{
      const snapshot=prepared?.aalto;
      if(!snapshot?.collectedAt||!Array.isArray(snapshot.restaurants)||!snapshot.restaurants.length)throw Error('aalto');
      records=buildAaltoRecords(snapshot,selected.iso);
      if(snapshot.refreshFailed){sourceWarning='最近一次菜单更新未成功，当前显示上次的数据。';sourceIncomplete=true;}
      else if(snapshot.partial||records.some(r=>!r.sourceAvailable)){sourceWarning='部分餐厅菜单暂时无法获取，结果可能不完整。';sourceIncomplete=true;}
      else if(records.some(r=>!r.hasMenu))sourceWarning=`部分餐厅${day}暂无菜单，结果可能不完整。`;
      const date=new Date(snapshot.collectedAt);
      const time=Number.isNaN(date.getTime())?'时间未知':new Intl.DateTimeFormat('zh-CN',{timeZone:'Europe/Helsinki',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);
      setStatus(`菜单采集 ${time} · 每日定时`,!sourceIncomplete);
    }
    render();
  }catch{
    if(version!==run)return;records=[];visibleSignature=signature([]);hourBindings=[];setStatus('菜单暂时无法获取');content.innerHTML=school==='aalto'?'<div class="state error"><div class="state-icon">!</div><h3>暂时无法获取 Aalto 菜单</h3><p>请稍后重试，也可以查看 Kanttiinit。</p></div>':'<div class="state error"><div class="state-icon">!</div><h3>暂时无法获取菜单</h3><p>请稍后点击“刷新菜单”，也可以直接查看 UniCafe 官网。</p></div>';
  }finally{if(version===run)refreshButton.disabled=false;}
}
function selectUniversity(next){
  if(!['helsinki','aalto'].includes(next)||next===university)return;
  university=next;
  document.body.classList.toggle('school-aalto',next==='aalto');
  for(const button of document.querySelectorAll('[data-university]'))button.setAttribute('aria-pressed',String(button.dataset.university===next));
  const link=document.querySelector('#source-link');link.href=next==='aalto'?'https://kanttiinit.fi/':'https://unicafe.fi/';
  link.replaceChildren(document.createTextNode(next==='aalto'?'Kanttiinit 菜单 ':'UniCafe 官网 '),el('span','','↗'));
  document.querySelector('#eyebrow').textContent=next==='aalto'?'AALTO · OTANIEMI':'HELSINKI · CAMPUS';
  document.querySelector('#fish-legend').textContent='鱼 / 海鲜：识别到';
  document.querySelector('#footer-source').textContent=next==='aalto'?'非官方独立项目 · 数据来源 Kanttiinit 与餐厅官网':'非官方独立项目 · 数据来源 UniCafe / Sodexo';
  document.querySelector('#notice-details').textContent=next==='aalto'
    ?'部分餐厅提供食材或过敏原信息，其余依据菜名识别；配料可能属于酱汁或不同选项，同一餐厅可能同时计入肉类和鱼类。Aalto 菜单通常每日定时采集，“重新加载”只读取已发布的数据。营业和供应信息请核对餐厅官网。'
    :'肉类和鱼类依据菜名、配料或官方过敏原识别，可能遗漏或误判；同一餐厅可能同时计入肉类和鱼类。UniCafe 菜单实时获取；主楼菜单每日采集，刷新只会重新读取已发布的数据。详情请查看餐厅官网。';
  const refreshIcon=el('span','','↻');refreshIcon.setAttribute('aria-hidden','true');
  refreshButton.replaceChildren(refreshIcon,document.createTextNode(next==='aalto'?' 重新加载':' 刷新'));
  refreshButton.title=next==='aalto'?'重新读取已发布的菜单，不会立即重新采集餐厅数据':'重新获取 UniCafe 菜单，并读取已发布的主楼菜单';
  load();
}
function selectDay(next){
  const offset=Number(next);
  if(![0,1].includes(offset)||offset===dayOffset)return;
  dayOffset=offset;
  for(const button of document.querySelectorAll('[data-day]'))button.setAttribute('aria-pressed',String(Number(button.dataset.day)===offset));
  load();
}
for(const button of document.querySelectorAll('[data-university]'))button.addEventListener('click',()=>selectUniversity(button.dataset.university));
for(const button of document.querySelectorAll('[data-day]'))button.addEventListener('click',()=>selectDay(button.dataset.day));
refreshButton.addEventListener('click',load);load();
function updateDateAndTime(){
  if(todayParts().iso!==currentDate){load();return;}
  if(refreshButton.disabled)return;
  if(signature(visibleRestaurants())!==visibleSignature)render();
  else updateLunchTimes();
}
setInterval(updateDateAndTime,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateDateAndTime();});
setInterval(load,15*60*1000);
