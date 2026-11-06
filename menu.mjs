export const CAMPUS_NAMES = {Keskusta:'市中心',Meilahti:'Meilahti',Viikki:'Viikki',Kumpula:'Kumpula','Töölö':'Töölö',Muut:'其他'};
export function todayParts(now=new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Helsinki',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {...parts,iso:`${parts.year}-${parts.month}-${parts.day}`, token:`${parts.day}.${parts.month}.`};
}
export function helsinkiMinutes(now=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Helsinki',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return Number(parts.hour)*60+Number(parts.minute);
}
// Matches the category and colour logic used by UniCafe's menu application
// as inspected on 2026-11-06. Orange means lunch or special, not meat.
export function officialMarks(dish) {
  const flags=Array.isArray(dish.meta?.['0']) ? dish.meta['0'] : [];
  const allergens=Array.isArray(dish.meta?.['1']) ? dish.meta['1'] : [];
  const extra=Array.isArray(dish.meta?.['2']) ? dish.meta['2'] : [];
  const containsFish=allergens.some(x=>/kala|fish|fisk/i.test(String(x))) || extra.some(x=>/kala/i.test(String(x)));
  const containsCrustaceans=allergens.some(x=>/äyriä|crustacean/i.test(String(x)));
  const containsMolluscs=allergens.some(x=>/nilviä|mollus/i.test(String(x)));
  // UniCafe documents Veg as vegan. Do not guess that unlisted abbreviations
  // such as K or VE have the same meaning as at other food providers.
  const vegetarian=/^kasvislounas$/i.test(String(dish.price?.name||'').trim());
  return {vegan:flags.includes('Veg'),vegetarian,containsFish,containsCrustaceans,containsMolluscs};
}
export function classifyDish(dish) {
  const marks=officialMarks(dish);
  const priceName=String(dish.price?.name||'');
  let category=marks.vegan?'vegan':marks.vegetarian?'vegetarian':'lunch';
  if(marks.containsFish)category='fish';
  if(priceName==='Makeasti'||priceName==='Jälkiruoka')category='dessert';
  if(priceName.toLowerCase().includes('erikoinen'))category='special';
  if(priceName.toLowerCase().includes('tiedote'))category='notice';
  if(priceName.toLowerCase().includes('lisäke'))category='side';
  return category==='fish'?'fish':category==='lunch'||category==='special'?'orange':'other';
}
// Recognize explicit meat wording, while avoiding common Finnish compounds
// that otherwise produce false positives, e.g. porkkana (carrot) and kananmuna (egg).
function stripBrothComponents(text) {
  const pattern=/[\p{L}-]*(?:liemijauhe|liemitiiviste|liemi|aromi|gelatiini)[\p{L}-]*\s*[(\[]/giu;
  let out='',last=0,match;
  while((match=pattern.exec(text))){
    out+=text.slice(last,match.index);let i=pattern.lastIndex,depth=1;
    while(i<text.length&&depth){const c=text[i++];if(c==='('||c==='[')depth++;else if(c===')'||c===']')depth--;}
    if(depth)return out+' ';
    out+=' ';last=i;pattern.lastIndex=i;
  }
  return out+text.slice(last);
}
function searchableMeatText(text) {
  return stripBrothComponents(String(text||'').normalize('NFKC').toLowerCase())
    .replace(/(?:saattaa|voi)\s+sisältää[^.!?;\])]*|may\s+contain[^.!?;\])]*/giu,' ')
    .replace(/(?:ei\s+sisällä|ilman)\s+[^.!?;\])]*/giu,' ')
    .replace(/porkkana[\p{L}-]*|kanad[\p{L}-]*|kanan?mun[\p{L}-]*|kananrasv[\p{L}-]*|lihan?korvik[\p{L}-]*|härkäpap[\p{L}-]*/giu,' ')
    .replace(/(?:kasvis|kasvi|vege|vego|soija|herne|vegaan)[\p{L}-]*?(?:makkara|liha|pekoni|kana|chorizo|pepperoni|bratwurst)[\p{L}-]*/giu,' ')
    .replace(/[\p{L}-]*(?:liemijauhe|liemitiiviste|liemi|aromi)[\p{L}-]*/giu,' ')
    .replace(/(?:chicken|beef|pork)\s+(?:stock|broth|flavou?r)[\p{L}-]*/giu,' ');
}
const MEAT_WORDS=[
  ['鸡肉',/(?:broiler[\p{L}-]*|kana[\p{L}-]*|\bchicken\b)/iu],
  ['猪肉',/(?:pors[\p{L}-]*|possu[\p{L}-]*|sianliha[\p{L}-]*|kinkku[\p{L}-]*|pekoni[\p{L}-]*|\bpork\b|\bbacon\b|\bham\b)/iu],
  ['牛肉',/(?:naudan\s*(?:liha|filee|paisti|pihvi|jauhe|suikale)[\p{L}-]*|nauta(?:liha|filee|paisti|pihvi|jauhe|suikale)[\p{L}-]*|häränliha[\p{L}-]*|\bbeef\b)/iu],
  ['火鸡肉',/(?:kalkkun[\p{L}-]*|\bturkey\b)/iu],
  ['羊肉',/(?:lammas(?!maito|juusto)[\p{L}-]*|lampaan\s*(?:liha|filee|paisti|pihvi|jauhe|suikale)[\p{L}-]*|karitsa[\p{L}-]*|\blamb\b)/iu],
  ['其他肉类',/(?:jauheliha[\p{L}-]*|(?:^|[^\p{L}])liha(?:pull|pyöryk|kastik|suikale|piirak|mureke|pihv|pala)[\p{L}-]*|\bmeat\b)/iu]
];
function findMeat(text){
  const cleaned=searchableMeatText(text);
  for(const [animal,pattern] of MEAT_WORDS){const match=cleaned.match(pattern);if(match)return {animal,term:match[0].trim().replace(/^[^\p{L}]+/u,'')};}
  return null;
}
export function detectMeat(dish) {
  const marks=officialMarks(dish);
  if(marks.vegan||marks.vegetarian)return {status:'excluded',reason:'官方素食标记'};
  if(['Makeasti','Jälkiruoka'].includes(String(dish.price?.name||'')))return {status:'excluded',reason:'官方甜点'};
  const title=String(dish.name||'');
  // An explicit plant-based name without an official flag is ambiguous, not a meat hit.
  const explicitlyPlantBased=/(?:vegaan|vegan|plant[- ]based|kasvipohjainen|lihattom)/iu.test(title);
  const ingredientHit=explicitlyPlantBased?null:findMeat(dish.ingredients);
  const titleHit=explicitlyPlantBased?null:findMeat(title);
  if(titleHit)return {status:'identified',source:'菜名',...titleHit};
  if(ingredientHit)return {status:'identified',source:'配料',...ingredientHit};
  const orange=classifyDish(dish)==='orange';
  return {status:orange?'uncertain':'excluded',reason:orange?'没有明确肉类线索':'其他菜单类别'};
}

const WEEKDAYS=['ma','ti','ke','to','pe','la','su'];
function validMonthDay(day,month) {
  const d=new Date(Date.UTC(2024,month-1,day));
  return month>=1&&month<=12&&day>=1&&d.getUTCMonth()===month-1&&d.getUTCDate()===day;
}
// The API currently gives exception dates without a year, e.g. 28.10 and
// 19.-24.10. Return null for formats we cannot interpret safely.
function matchesException(label,iso) {
  const value=String(label||'').replace(/\s/g,'');
  const [year,month,day]=iso.split('-').map(Number);
  let m=value.match(/^(\d{1,2})\.(\d{1,2})\.?$/);
  if(m){const d=+m[1],mo=+m[2];return validMonthDay(d,mo)?day===d&&month===mo:null;}
  m=value.match(/^(\d{1,2})\.?(?:-|–|—)(\d{1,2})\.(\d{1,2})\.?$/);
  if(m){const start=+m[1],end=+m[2],mo=+m[3];return validMonthDay(start,mo)&&validMonthDay(end,mo)&&start<=end?month===mo&&day>=start&&day<=end:null;}
  m=value.match(/^(\d{1,2})\.(\d{1,2})\.?(?:-|–|—)(\d{1,2})\.(\d{1,2})\.?$/);
  if(m){
    const startDay=+m[1],startMonth=+m[2],endDay=+m[3],endMonth=+m[4];
    if(!validMonthDay(startDay,startMonth)||!validMonthDay(endDay,endMonth))return null;
    const today=Date.UTC(year,month-1,day);
    for(const startYear of [year-1,year,year+1]){
      const start=Date.UTC(startYear,startMonth-1,startDay);
      const crossesYear=endMonth<startMonth||(endMonth===startMonth&&endDay<startDay);
      const end=Date.UTC(startYear+(crossesYear?1:0),endMonth-1,endDay);
      if(today>=start&&today<=end)return true;
    }
    return false;
  }
  return null;
}
function matchesWeekday(label,weekday){
  const m=String(label||'').trim().toLowerCase().match(/^(ma|ti|ke|to|pe|la|su)(?:\s*[-–—]\s*(ma|ti|ke|to|pe|la|su))?$/);
  if(!m)return false;
  const start=WEEKDAYS.indexOf(m[1]),end=m[2]?WEEKDAYS.indexOf(m[2]):start;
  return start<=end?weekday>=start&&weekday<=end:weekday>=start||weekday<=end;
}
function describeLunch(item,exception){
  const raw=String(item.hours||'').trim();
  if(item.closedException===true||/^(suljettu|closed)$/i.test(raw))return {status:'closed',label:exception?'午餐暂停 · 特殊时间':'午餐暂停 · 常规'};
  const match=raw.match(/^(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})$/);
  if(!match)return null;
  const [,a,b,c,d]=match.map(Number);
  if(a>23||c>23||b>59||d>59||a*60+b>=c*60+d)return null;
  const time=`${String(a).padStart(2,'0')}:${String(b).padStart(2,'0')}–${String(c).padStart(2,'0')}:${String(d).padStart(2,'0')}`;
  return {status:exception?'exception':'regular',label:`午餐 ${time} · ${exception?'特殊时间':'常规'}`,startMinutes:a*60+b,endMinutes:c*60+d};
}
export function resolveTodayLunchHours(visitingHours,iso){
  const unknown={status:'unknown',label:'午餐时间未提供'};
  const items=visitingHours?.lounas?.items;
  const date=new Date(`${iso}T12:00:00Z`);
  if(!Array.isArray(items)||!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==iso)return unknown;
  const exceptions=items.filter(item=>item.exception===true);
  const matched=[];
  for(const item of exceptions){
    const match=matchesException(item.label,iso);
    if(match===null)return {status:'unknown',label:'午餐时间请查看官网'};
    if(match)matched.push(item);
  }
  const weekday=(date.getUTCDay()+6)%7;
  const relevant=matched.length?matched:items.filter(item=>item.exception!==true&&matchesWeekday(item.label,weekday));
  if(!relevant.length)return unknown;
  const descriptions=relevant.map(item=>describeLunch(item,matched.length>0));
  if(descriptions.some(x=>!x))return {status:'unknown',label:'午餐时间请查看官网'};
  if(descriptions.some(x=>x.label!==descriptions[0].label))return {status:'unknown',label:'午餐时间请查看官网'};
  return descriptions[0];
}

// Status is based on the published lunch schedule, not stock or actual opening.
export function formatLunchHours(hours,minutes){
  if(!hours)return '午餐时间未提供';
  if(!['regular','exception'].includes(hours.status)||!Number.isInteger(hours.startMinutes)||!Number.isInteger(hours.endMinutes)||!Number.isInteger(minutes)||minutes<0||minutes>=1440)return hours.label;
  const moment=minutes<hours.startMinutes?'未开始':minutes<hours.endMinutes?'时段内':'已结束';
  return `${hours.label} · ${moment}`;
}

// Keep uncertain dishes and unknown hours visible: neither means meat-free or closed.
export function shouldDisplayRestaurant(restaurant,minutes){
  const dishes=Array.isArray(restaurant?.dishes)?restaurant.dishes:[];
  if(!dishes.some(d=>d?.meat?.status==='identified'||d?.meat?.status==='uncertain'||d?.fish===true))return false;
  const hours=restaurant?.lunchHours;
  if(hours?.status==='closed')return false;
  if(['regular','exception'].includes(hours?.status)&&Number.isInteger(hours.endMinutes)&&hours.endMinutes>=0&&hours.endMinutes<1440&&Number.isInteger(minutes)&&minutes>=0&&minutes<1440)return minutes<hours.endMinutes;
  return true;
}

// Called only when the filtered list is empty. Always inspect the complete
// day's menus so hiding restaurants after lunch cannot imply a vegan day.
export function emptyMenuState(records){
  const dishes=(Array.isArray(records)?records:[]).flatMap(r=>Array.isArray(r?.dishes)?r.dishes:[]);
  if(!dishes.length)return {kind:'no-menu',title:'今天暂无菜单信息',detail:'官方菜单可能尚未更新，或食堂暂停营业。'};
  if(dishes.some(d=>d?.meat?.status==='identified'||d?.meat?.status==='uncertain'||d?.fish===true))
    return {kind:'lunch-ended',title:'当前没有可显示的食堂',detail:'相关食堂的午餐时段已结束或暂停营业。'};
  const isUncertain=d=>!d||d.fish!==false||d.meat?.status!=='excluded';
  if(dishes.every(d=>!isUncertain(d)&&d.marks?.vegan===true))
    return {kind:'possible-vegan-day',title:'今天暂未发现肉或鱼',detail:'已获取的菜品均标为纯素，可能是 Vegan Day；请以 UniCafe 官网为准。'};
  if(dishes.every(d=>!isUncertain(d)&&(d.marks?.vegan===true||d.marks?.vegetarian===true)))
    return {kind:'vegetarian',title:'今天暂未发现肉或鱼',detail:'已获取的菜品均标为素食，请以 UniCafe 官网为准。'};
  return {kind:'no-match',title:'今天暂未识别到肉或鱼',detail:'部分菜品或菜单信息尚不完整，请以 UniCafe 官网为准。'};
}

// The official site's query parameter selects the restaurant. The old
// /restaurants/... permalink currently redirects to the default restaurant.
export function officialRestaurantUrl(slug){
  if(typeof slug!=='string'||! /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return '';
  const url=new URL('https://unicafe.fi/');
  url.searchParams.set('restaurant',slug);
  return url.href;
}

export function buildRecords(fi, en, token, iso=todayParts().iso) {
  const english=new Map((en||[]).map(r=>[r.slug,r]));
  return fi.map(r=>{
    const menu=(r.menuData?.menus||[]).find(m=>String(m.date||'').includes(token));
    const other=english.get(r.slug);
    const enMenu=(other?.menuData?.menus||[]).find(m=>String(m.date||'').includes(token));
    const fiDishes=menu?.data||[];
    const enDishes=(enMenu?.data||[]).length===fiDishes.length ? (enMenu?.data||[]) : [];
    const dishes=fiDishes.map((d,i)=>{
      if(!d?.name)return null;
      const original=String(d.name).trim(), enName=String(enDishes?.[i]?.name||'').trim();
      const language=enName&&enName.toLocaleLowerCase()!==original.toLocaleLowerCase()?'en':'fi';
      const marks=officialMarks(d);
      return {original,enName,language,text:language==='en'?enName:original,meat:detectMeat(d),fish:marks.containsFish||marks.containsCrustaceans||marks.containsMolluscs,marks};
    }).filter(Boolean);
    return {slug:r.slug,name:r.title,campus:r.location?.[0]?.name||'Muut',address:r.address||r.menuData?.address||'',staff:/henkilöstö|opettajien/i.test(r.title||''),lunchHours:resolveTodayLunchHours(r.menuData?.visitingHours,iso),dishes};
  });
}
