// Exact dish names only: never infer a full translation from isolated words.
const COMMON_DISHES=[
  ['Paistetut muikut ja Remouladekastike','煎白鲑配雷莫拉德酱'],
  ['Uunimakkaraa & dijondippi','烤香肠配第戎芥末蘸酱'],
  ['Broileria pestokastikkeessa','香蒜酱鸡肉'],
  ['Aurinkokuivattu tomaatti - Nyhtökaura Bowl','晒干番茄燕麦植物蛋白碗'],
  ['Kookos-kasviskeitto','椰香蔬菜汤'],
  ['Toast-/paniniateria','吐司或帕尼尼套餐'],
  ['Tonnikala Bowl','金枪鱼碗'],
  ['Kermainen savulohikeitto','奶油烟熏三文鱼汤'],
  ['Lime-persiljakalaa, tartarkastike','青柠欧芹鱼配塔塔酱'],
  ['Salaattijuusto Bowl','沙拉奶酪碗'],
  ['Savulohi Bowl','烟熏三文鱼碗'],
  ['Patonkibaari','法棍自选餐'],
  ['Carbonara-kastiketta','卡邦尼酱'],
  ['Katkarapu Bowl','虾仁碗'],
  ['Kasvis-kvinoapihvi,makean tulinen paprikamajoneesi','蔬菜藜麦饼配甜辣红椒蛋黄酱'],
  ['Kermaisa kana-Gochujan kastike','奶油鸡肉韩式辣椒酱'],
  ['Peltipizza Pepperoni-jalapeno','意式辣香肠墨西哥辣椒披萨'],
  ['Bratwurstipyöryköitä Arrabiattakastikeessa','德式香肠丸配香辣番茄酱'],
  ['Kylmäsavulohisalaattia','冷熏三文鱼沙拉'],
  ['Patonki-/Paniniateria','法棍或帕尼尼套餐'],
  ['Pizza Kana- ananas BBQ','烧烤鸡肉菠萝披萨'],
  ['Broilerinuggetit & Red curry-mango -kastiketta','鸡块配红咖喱芒果酱'],
  ['Kirjolohipyörykät ja sitruuna-kermaviilikastike','虹鳟鱼丸配柠檬酸奶油酱'],
  ['Kanakepakoita & paprikamajoneesia','鸡肉串配红椒蛋黄酱'],
  ['Kalapihvejä & pestokermaviiliä','鱼饼配香蒜酸奶油酱'],
  ['Uuniperuna kinkku-Aurajuustotäytteellä','烤土豆配火腿蓝纹奶酪馅'],
  ['Salaattibaari','自选沙拉'],
  ['Kanabolognese','鸡肉肉酱']
];
function normalize(value){return String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('fi-FI');}
const COMMON_MAP=new Map(COMMON_DISHES.map(([name,translation])=>[normalize(name),translation]));
export function localDishTranslation(name){return COMMON_MAP.get(normalize(name))||'';}
export function isUsableChineseTranslation(value){
  return typeof value==='string'&&/[\u3400-\u9fff]/u.test(value)&&!/mymemory warning|quota exceeded|translation failed/i.test(value);
}
export function inspectTranslationResponse(data,httpStatus=200,decode=x=>x){
  const status=Number(data?.responseStatus??httpStatus);
  const raw=String(data?.responseData?.translatedText||'');
  const quotaFlag=data?.quotaFinished,details=`${raw} ${String(data?.responseDetails||'')}`;
  if(httpStatus===429||status===429||quotaFlag===true||quotaFlag==='true'||quotaFlag===1||quotaFlag==='1'||/mymemory warning:.*(?:available free translations|quota)|quota (?:exceeded|finished)|too many requests/i.test(details))return {status:'quota'};
  if(httpStatus>=500||status>=500)return {status:'unavailable'};
  if(httpStatus<200||httpStatus>=300||status!==200)return {status:'invalid'};
  const text=decode(raw).trim();
  return isUsableChineseTranslation(text)?{status:'success',text}:{status:'invalid'};
}

// Send one dish per request. Stop issuing requests on a quota response or a
// repeated network outage; successful translations are delivered immediately.
export async function translateQueue(items,{request,onResult,shouldContinue=()=>true,concurrency=2}){
  let next=0,quota=false,unavailable=false,networkFailures=0;
  async function worker(){
    while(next<items.length&&!quota&&!unavailable&&shouldContinue()){
      const item=items[next++];let result;
      try{result=await request(item);}catch{result={status:'unavailable'};}
      if(!shouldContinue())return;
      if(result?.status==='quota'){quota=true;return;}
      if(result?.status==='unavailable'){
        networkFailures++;
        if(networkFailures>=2)unavailable=true;
      }else{
        networkFailures=0;
        if(result?.status==='success')onResult(item,result.text);
      }
    }
  }
  await Promise.all(Array.from({length:Math.min(Math.max(1,concurrency),items.length)},()=>worker()));
  return {quota,unavailable};
}
