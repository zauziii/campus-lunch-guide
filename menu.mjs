export const CAMPUS_NAMES = {Keskusta:'市中心',Meilahti:'Meilahti',Viikki:'Viikki',Kumpula:'Kumpula','Töölö':'Töölö',Muut:'其他'};
export function todayParts(now=new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Helsinki',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {...parts,iso:`${parts.year}-${parts.month}-${parts.day}`, token:`${parts.day}.${parts.month}.`};
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
  return {vegan:flags.includes('VE')||flags.includes('Veg'),vegetarian:flags.includes('K'),containsFish,containsCrustaceans,containsMolluscs};
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
  if(ingredientHit)return {status:'identified',source:'配料',...ingredientHit};
  if(titleHit)return {status:'identified',source:'菜名',...titleHit};
  const orange=classifyDish(dish)==='orange';
  return {status:orange?'uncertain':'excluded',reason:orange?'没有明确肉类线索':'其他菜单类别'};
}

export function buildRecords(fi, en, token) {
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
    return {slug:r.slug,name:r.title,campus:r.location?.[0]?.name||'Muut',address:r.address||r.menuData?.address||'',staff:/henkilöstö|opettajien/i.test(r.title||''),dishes};
  });
}
