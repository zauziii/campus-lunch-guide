// Exact dish names only: never infer a full translation from isolated words.
const COMMON_DISHES=[
  ['Chicken bolognese','鸡肉肉酱'],
  ['Fried vendaces & remoulade sauce','煎白鲑配雷莫拉德酱'],
  ['Fish bites, remoulade','酥脆鱼块配雷莫拉德酱'],
  ['Butter chicken','黄油鸡肉'],
  ['Saithe in pesto sauce','青鳕配罗勒酱'],
  ['Lemon fish with orange remoulade','柠檬鱼配橙香雷莫兰酱'],
  ['Shiitake and parmesan pizza, truffle oil and rucola','香菇帕尔马奶酪披萨，配松露油和芝麻菜'],
  ['Tuna Bowl','金枪鱼碗']
];
function normalize(value){return String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');}
const COMMON_MAP=new Map(COMMON_DISHES.map(([name,translation])=>[normalize(name),translation]));
export function localDishTranslation(name){return COMMON_MAP.get(normalize(name))||'';}
// UniCafe's English feed occasionally returns untranslated Finnish titles.
// Avoid treating clearly Finnish food words as English; this is conservative
// and cannot determine the language of every short or mixed-language title.
export function hasFinnishMenuWording(name){
  const text=String(name||'').normalize('NFKC').toLowerCase();
  return /(?:^|[^\p{L}])(?:kana[\p{L}]*|broileri[\p{L}]*|liha[\p{L}]*|jauheliha[\p{L}]*|kermainen|kermaisa|rapeat|peruna[\p{L}]*|kasvis[\p{L}]*|tomaatti[\p{L}]*|sitruuna[\p{L}]*|tonnikala[\p{L}]*|katkarapu[\p{L}]*|ahven[\p{L}]*|kalap[\p{L}]*|savulohi[\p{L}]*|salaatti[\p{L}]*|uunimakkara[\p{L}]*|paistettu[\p{L}]*)/iu.test(text)
    || /(?:keitto|kastikke|kastiketta|pyöryk|pihvi|kermaviili|salaattijuusto|savulohi|inkivääri|ateria|majoneesi|perunamuussi|porkkanaa)/iu.test(text);
}
export function isUsableChineseTranslation(value){
  return typeof value==='string'&&/[\u3400-\u9fff]/u.test(value)&&!/quota exceeded|translation failed/i.test(value);
}
