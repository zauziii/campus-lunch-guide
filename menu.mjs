export const CAMPUS_NAMES = {'City Centre':'市中心',Keskusta:'市中心',Meilahti:'Meilahti',Viikki:'Viikki',Kumpula:'Kumpula','Töölö':'Töölö',Otaniemi:'Otaniemi',Muut:'其他'};
export function todayParts(now=new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Helsinki',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {...parts,iso:`${parts.year}-${parts.month}-${parts.day}`, token:`${parts.day}.${parts.month}.`};
}
// Move by calendar days after determining the Helsinki date. Using UTC noon
// avoids daylight-saving transitions changing the selected calendar date.
export function shiftDateParts(iso,offset=0){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))||!Number.isInteger(offset))throw new RangeError('Invalid menu date');
  const date=new Date(`${iso}T12:00:00Z`);
  if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==iso)throw new RangeError('Invalid menu date');
  date.setUTCDate(date.getUTCDate()+offset);
  const selected=date.toISOString().slice(0,10);
  return {iso:selected,token:`${selected.slice(8,10)}.${selected.slice(5,7)}.`};
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
  // A precautionary trace warning is not the same as a declared ingredient.
  const declared=allergens.filter(x=>!/^\s*(?:may\s+contain|saattaa\s+sisältää)/i.test(String(x)));
  const containsFish=declared.some(x=>/kala|fish|fisk/i.test(String(x))) || extra.some(x=>/kala|fish|fisk/i.test(String(x)));
  const containsCrustaceans=declared.some(x=>/äyriä|crustacean/i.test(String(x)));
  const containsMolluscs=declared.some(x=>/nilviä|mollus/i.test(String(x)));
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
// Recognize explicit meat wording in the English feed. Some fields in that
// feed still contain Finnish, so retain their existing safe recognition rules.
function stripBrothComponents(text) {
  const pattern=/(?:[\p{L}-]*(?:liemijauhe|liemitiiviste|liemi|aromi|gelatiini)[\p{L}-]*|(?:chicken|beef|pork|turkey|poultry|meat)\s+(?:stock|broth|bouillon|flavou?r(?:ing)?)(?:\s+powder)?)\s*[(\[]/giu;
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
    .replace(/\b(?:chicken|beef|pork|turkey|poultry)\s+(?:fat|stock|broth|bouillon|flavou?r(?:ing)?)(?:\s+powder)?\b/giu,' ');
}
const MEAT_WORDS=[
  ['鸡肉',/(?:broiler[\p{L}-]*|kana[\p{L}-]*|\bchicken\b)/iu],
  ['猪肉',/(?:pors[\p{L}-]*|possu[\p{L}-]*|sianliha[\p{L}-]*|kinkku[\p{L}-]*|pekoni[\p{L}-]*|\bpork\b|\bbacon\b|\bham\b)/iu],
  ['牛肉',/(?:naudan\s*(?:liha|filee|paisti|pihvi|jauhe|suikale)[\p{L}-]*|nauta(?:liha|filee|paisti|pihvi|jauhe|suikale)[\p{L}-]*|häränliha[\p{L}-]*|\b(?:beef|veal)\b)/iu],
  ['火鸡肉',/(?:kalkkun[\p{L}-]*|\bturkey\b)/iu],
  ['羊肉',/(?:lammas(?!maito|juusto)[\p{L}-]*|lampaan\s*(?:liha|filee|paisti|pihvi|jauhe|suikale)[\p{L}-]*|karitsa[\p{L}-]*|\blamb\b)/iu],
  ['其他肉类',/(?:jauheliha[\p{L}-]*|(?:^|[^\p{L}])liha(?:pull|pyöryk|kastik|suikale|piirak|mureke|pihv|pala)[\p{L}-]*|\b(?:meat(?:balls?|loaf)?|poultry|duck|reindeer|venison)\b)/iu]
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
  const explicitlyPlantBased=/(?:vegaan|vegan|vegetarian|veggie|plant[- ]based|meat[- ]?free|meatless|kasvipohjainen|lihattom|kanaton)/iu.test(title);
  const ingredientHit=explicitlyPlantBased?null:findMeat(dish.ingredients);
  const titleHit=explicitlyPlantBased?null:findMeat(title);
  if(titleHit)return {status:'identified',source:'菜名',...titleHit};
  if(ingredientHit)return {status:'identified',source:'配料',...ingredientHit};
  const orange=classifyDish(dish)==='orange';
  return {status:orange?'uncertain':'excluded',reason:orange?'没有明确肉类线索':'其他菜单类别'};
}

const WEEKDAYS=new Map([
  ['ma',0],['mon',0],['monday',0],['ti',1],['tue',1],['tues',1],['tuesday',1],
  ['ke',2],['wed',2],['wednesday',2],['to',3],['thu',3],['thur',3],['thurs',3],['thursday',3],
  ['pe',4],['fri',4],['friday',4],['la',5],['sat',5],['saturday',5],['su',6],['sun',6],['sunday',6]
]);
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
  const m=String(label||'').trim().toLowerCase().match(/^([a-z]+)(?:\s*[-–—]\s*([a-z]+))?$/);
  if(!m)return false;
  const start=WEEKDAYS.get(m[1]),end=m[2]?WEEKDAYS.get(m[2]):start;
  if(start===undefined||end===undefined)return false;
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

// Keep restaurants with unknown hours and upcoming lunch in the day's view.
function isLunchAvailable(restaurant,minutes){
  const hours=restaurant?.lunchHours;
  if(hours?.status==='closed')return false;
  if(['regular','exception'].includes(hours?.status)&&Number.isInteger(hours.endMinutes)&&hours.endMinutes>=0&&hours.endMinutes<1440&&Number.isInteger(minutes)&&minutes>=0&&minutes<1440)return minutes<hours.endMinutes;
  return true;
}

// Keep uncertain dishes and unknown hours visible: neither means meat-free or closed.
export function shouldDisplayRestaurant(restaurant,minutes){
  const dishes=Array.isArray(restaurant?.dishes)?restaurant.dishes:[];
  return isLunchAvailable(restaurant,minutes)&&dishes.some(d=>d?.meat?.status==='identified'||d?.meat?.status==='uncertain'||d?.fish===true);
}

// The message concerns the remaining menus, independently of dishes that need review.
export function emptyMenuState(records,minutes){
  const all=Array.isArray(records)?records:[];
  const candidates=all.filter(r=>isLunchAvailable(r,minutes));
  const dishes=candidates.flatMap(r=>Array.isArray(r?.dishes)?r.dishes:[]);
  if(!dishes.length){
    if(!candidates.length&&all.some(r=>r?.dishes?.length))
      return {kind:'lunch-ended',title:'当前没有可显示的食堂',detail:'午餐时段已结束或食堂暂停营业。'};
    return {kind:'no-menu',title:'今天暂无菜单信息',detail:'官方菜单可能尚未更新，或食堂暂停营业。'};
  }
  if(dishes.some(d=>d?.meat?.status==='identified'||d?.fish===true))return null;
  return {kind:'no-match',title:'今天暂未发现肉或鱼'};
}

// The official site's query parameter selects the restaurant. The old
// /restaurants/... permalink currently redirects to the default restaurant.
export function officialRestaurantUrl(slug){
  if(typeof slug!=='string'||! /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return '';
  const url=new URL('https://unicafe.fi/');
  url.searchParams.set('restaurant',slug);
  return url.href;
}

export function buildRecords(restaurants, token, iso=todayParts().iso) {
  return restaurants.map(r=>{
    const menu=(r.menuData?.menus||[]).find(m=>String(m.date||'').includes(token));
    const dishes=(menu?.data||[]).map(d=>{
      if(!d?.name)return null;
      const original=String(d.name).trim();
      const marks=officialMarks(d);
      return {original,meat:detectMeat(d),fish:marks.containsFish||marks.containsCrustaceans||marks.containsMolluscs,marks};
    }).filter(Boolean);
    return {slug:r.slug,name:r.title,campus:r.location?.[0]?.name||'Muut',address:r.address||r.menuData?.address||'',staff:/henkilöstö|opettajien|\bstaff\b|\bteachers?\b/i.test(r.title||''),lunchHours:resolveTodayLunchHours(r.menuData?.visitingHours,iso),dishes};
  });
}

const FISH_NAME=/(?:\b(?:fish|salmon|trout|cod|saithe|pollock|herring|tuna|perch|pike|vendace|anchov(?:y|ies)|whitefish|plaice)\b|(?:^|[^\p{L}])[\p{L}-]*(?:kala|lohi|seiti|seit[äa]|muikku|ahven|turska|tonnikala|silakka|silli|kuha)[\p{L}-]*)/iu;
const CRUSTACEAN_NAME=/(?:\b(?:shrimp|prawns?|crab|lobster|crustaceans?)\b|(?:^|[^\p{L}])[\p{L}-]*(?:katkarapu|äyriäi)[\p{L}-]*)/iu;
const MOLLUSC_NAME=/(?:\b(?:molluscs?|mussels?|oysters?|squid|octopus|scallops?)\b|(?:^|[^\p{L}])[\p{L}-]*(?:simpukka|mustekala|nilviäi)[\p{L}-]*)/iu;
function declaredFoodText(value){
  return String(value||'').replace(/(?:may\s+contain|saattaa\s+sisältää|voi\s+sisältää)[^.!?;]*/giu,' ')
    // "Ranskalaiset / ranskalaisia" (French fries) contains the letters
    // "kala" but is not a Finnish fish name.
    .replace(/(?:^|[^\p{L}])ranskala[\p{L}-]*/giu,' ')
    .replace(/(?:fish[- ]free|seafood[- ]free|kalaton|ilman\s+kalaa)[\p{L}-]*/giu,' ');
}
function foodProperties(item){return Array.isArray(item?.properties)?item.properties.map(x=>String(x).trim().toLowerCase()):[];}

// Official recipes and ingredients have priority; explicit dish titles are a
// separate, weaker signal. Absence of a match does not establish meat-free food.
export function classifyAaltoDish(item){
  const name=String(item?.name||'').trim(),category=String(item?.category||'');
  const properties=foodProperties(item),vegetarian=properties.some(x=>['vv','veg','vegan','vegetarian'].includes(x))
    ||/(?:\bvegan\b|\bvegetarian\b|veg(etaar|aan|aaninen)|kasvislounas|kasviskeitto)/iu.test(`${category} ${name}`);
  const info=[...(Array.isArray(item?.components)?item.components:[]),...(Array.isArray(item?.ingredients)?item.ingredients:[])].join(' ');
  const declared=[...(Array.isArray(item?.allergens)?item.allergens:[])].map(declaredFoodText).join(' ');
  const sourceText=declaredFoodText(info),titleText=declaredFoodText(name);
  const marks={containsFish:FISH_NAME.test(declared),containsCrustaceans:CRUSTACEAN_NAME.test(declared),containsMolluscs:MOLLUSC_NAME.test(declared)};
  const fishInSource=FISH_NAME.test(sourceText),crustaceanInSource=CRUSTACEAN_NAME.test(sourceText),molluscInSource=MOLLUSC_NAME.test(sourceText);
  const fishInTitle=FISH_NAME.test(titleText),crustaceanInTitle=CRUSTACEAN_NAME.test(titleText),molluscInTitle=MOLLUSC_NAME.test(titleText);
  const sourceMeat=detectMeat({name:'',ingredients:sourceText,meta:{},price:{}});
  const titleMeat=detectMeat({name:titleText,ingredients:'',meta:{},price:{}});
  if(vegetarian||/(?:dessert|jälkiruoka|jalkiruoka)/iu.test(category)){
    return {original:name,meat:{status:'excluded',reason:'官方素食或甜点标记'},fish:false,marks:{containsFish:false,containsCrustaceans:false,containsMolluscs:false},source:item?.source};
  }
  let meat=sourceMeat.status==='identified'?{...sourceMeat,source:'食材信息'}:titleMeat.status==='identified'?{...titleMeat,source:'菜名'}:{status:'uncertain',reason:'信息不足'};
  const officialFish=marks.containsFish||marks.containsCrustaceans||marks.containsMolluscs;
  const sourceFish=fishInSource||crustaceanInSource||molluscInSource;
  const titleFish=fishInTitle||crustaceanInTitle||molluscInTitle;
  const fish=officialFish||sourceFish||titleFish;
  const fishEvidence=officialFish?'官方过敏原':sourceFish?'食材信息':titleFish?'菜名':'';
  if(fish&&meat.status==='uncertain')meat={status:'excluded',reason:'已识别为鱼或海鲜'};
  return {original:name,meat,fish,fishEvidence,source:item?.source,marks:{
    containsFish:marks.containsFish||fishInSource||fishInTitle,
    containsCrustaceans:marks.containsCrustaceans||crustaceanInSource||crustaceanInTitle,
    containsMolluscs:marks.containsMolluscs||molluscInSource||molluscInTitle
  }};
}

function aaltoHours(day,weekly,iso){
  const h=day?.lunchHours;
  if(Number.isInteger(h?.start)&&Number.isInteger(h?.end)&&h.start>=0&&h.end<=1440&&h.start<h.end){
    const txt=`${String(Math.floor(h.start/60)).padStart(2,'0')}:${String(h.start%60).padStart(2,'0')}–${String(Math.floor(h.end/60)).padStart(2,'0')}:${String(h.end%60).padStart(2,'0')}`;
    return {status:'regular',label:`午餐 ${txt} · 官网`,startMinutes:h.start,endMinutes:h.end};
  }
  const date=new Date(`${iso}T12:00:00Z`),index=(date.getUTCDay()+6)%7;
  const hours=Array.isArray(weekly)?String(weekly[index]||''):'';
  const match=hours.match(/^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/);
  if(match){const [,a,b,c,d]=match.map(Number);if(a<24&&c<24&&b<60&&d<60&&a*60+b<c*60+d){const txt=`${String(a).padStart(2,'0')}:${String(b).padStart(2,'0')}–${String(c).padStart(2,'0')}:${String(d).padStart(2,'0')}`;return {status:'regular',label:`营业 ${txt} · 常规参考`,startMinutes:a*60+b,endMinutes:c*60+d};}}
  return {status:'unknown',label:'时间请查看官网'};
}

export function buildAaltoRecords(snapshot,iso=todayParts().iso){
  if(!snapshot||!Array.isArray(snapshot.restaurants))return [];
  return snapshot.restaurants.filter(r=>r&&Number.isSafeInteger(r.id)).map(r=>{
    const day=r.menus&&typeof r.menus==='object'?r.menus[iso]:null;
    const dishes=(Array.isArray(day?.dishes)?day.dishes:[]).filter(d=>typeof d?.name==='string'&&d.name.trim()).map(classifyAaltoDish);
    let url='';try{const parsed=new URL(String(r.url||''));if(parsed.protocol==='https:')url=parsed.href;}catch{}
    return {slug:`aalto-${r.id}`,name:String(r.name||''),campus:'Otaniemi',address:String(r.address||''),staff:false,
      officialUrl:url,sourceAvailable:r.sourceAvailable!==false,hasMenu:!!day,lunchHours:aaltoHours(day,r.weeklyHours,iso),dishes};
  });
}
