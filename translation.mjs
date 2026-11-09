// Exact dish names only: never infer a full translation from isolated words.
const COMMON_DISHES=[
  ['Chicken bolognese','鸡肉肉酱'],
  ['Fried vendaces & remoulade sauce','煎白鲑配雷莫拉德酱'],
  ['Fish bites, remoulade','酥脆鱼块配雷莫拉德酱'],
  ['Butter chicken','黄油鸡肉'],
  ['Saithe in pesto sauce','青鳕配罗勒酱'],
  ['Lemon fish with orange remoulade','柠檬鱼配橙香雷莫兰酱'],
  ['Shiitake and parmesan pizza, truffle oil and rucola','香菇帕尔马奶酪披萨，配松露油和芝麻菜'],
  ['Lihapullia Mac & Cheese','肉丸芝士通心粉'],
  ['Satay - Kana Bowl','沙爹鸡肉碗'],
  ['Tuna Bowl','金枪鱼碗']
];
function normalize(value){return String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');}
const COMMON_MAP=new Map(COMMON_DISHES.map(([name,translation])=>[normalize(name),translation]));
export function localDishTranslation(name){return COMMON_MAP.get(normalize(name))||'';}
export function isUsableChineseTranslation(value){
  return typeof value==='string'&&/[\u3400-\u9fff]/u.test(value)&&!/quota exceeded|translation failed/i.test(value);
}

// Always keep the source name available to the caller. Exact, reviewed local
// translations take priority over the Azure cache for every source language.
export function dishTranslation(name,translations={}){
  const local=localDishTranslation(name);
  if(local)return local;
  const cached=translations&&Object.hasOwn(translations,name)?translations[name]:'';
  return isUsableChineseTranslation(cached)?cached:'';
}
