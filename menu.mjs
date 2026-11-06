export const CAMPUS_NAMES = {Keskusta:'市中心',Meilahti:'Meilahti',Viikki:'Viikki',Kumpula:'Kumpula','Töölö':'Töölö',Muut:'其他'};
export function todayParts(now=new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Helsinki',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {...parts,iso:`${parts.year}-${parts.month}-${parts.day}`, token:`${parts.day}.${parts.month}.`};
}
export function classifyDish(dish, english='') {
  const flags=dish.meta?.['0'] || [], allergens=dish.meta?.['1'] || [];
  const name=`${dish.name||''} ${english}`.toLowerCase();
  // Official vegetarian/vegan flags take precedence over meat-like names such as vegan chorizo.
  if (flags.some(x=>/^(veg|ve|k)$/i.test(x))) return 'veggie';
  if (allergens.some(x=>/kala|fish|fisk|äyriä|shellfish/i.test(x)) || /\bkala|kalap|kalafile|lohi|tonnikala|kirjolohi|muikku|seiti|katkarapu|salmon|fish|trout|shrimp|prawn|tuna|vendace/i.test(name)) return 'fish';
  const ingredients=String(dish.ingredients||'').slice(0,1400).toLowerCase();
  if (/broiler|chicken|pork|beef|bacon|sausage|turkey|\bham\b|poultry|kana|kinkku|pekoni|pors|nauta|jauheliha|makkara|liha|chorizo|bratwurst|pepperoni|carbonara/i.test(name) || /broilerin|broileri|kananliha|porsaan|naudan|sianliha|jauheliha|pekoni|kinkku/i.test(ingredients)) return 'meat';
  return 'other';
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
      return {original,enName,language,text:language==='en'?enName:original,kind:classifyDish(d,enName)};
    }).filter(Boolean);
    return {slug:r.slug,name:r.title,campus:r.location?.[0]?.name||'Muut',address:r.address||r.menuData?.address||'',staff:/henkilöstö|opettajien/i.test(r.title||''),dishes};
  });
}
