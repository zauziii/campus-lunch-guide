import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {detectMeat,officialMarks,classifyAaltoDish} from '../menu.mjs';
import {isUsableChineseTranslation,localDishTranslation} from '../translation.mjs';

const MENU_URL='https://unicafe.fi/wp-json/swiss/v1/restaurants?lang=en';
// Without `from`, Azure detects the source language of each text. UniCafe's
// English feed can include Finnish or mixed-language titles.
const TRANSLATE_URL='https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=zh-Hans';
const CACHE_PATH=fileURLToPath(new URL('../data/translations.json',import.meta.url));
const AALTO_COLLECTOR=fileURLToPath(new URL('./collect-aalto.py',import.meta.url));
const runFile=promisify(execFile);

// Pre-translate published menus, including upcoming days. Use the same meat
// and fish rules as the page; translated text never affects classification.
export function collectDishNames(restaurants){
  if(!Array.isArray(restaurants))throw new Error('UniCafe returned an unexpected menu format.');
  const names=new Set();
  for(const restaurant of restaurants){
    for(const menu of Array.isArray(restaurant?.menuData?.menus)?restaurant.menuData.menus:[]){
      for(const dish of Array.isArray(menu?.data)?menu.data:[]){
        const name=typeof dish?.name==='string'?dish.name.trim():'';
        if(!name||localDishTranslation(name))continue;
        const meat=detectMeat(dish),marks=officialMarks(dish);
        if(meat.status==='identified'||meat.status==='uncertain'||marks.containsFish||marks.containsCrustaceans||marks.containsMolluscs)names.add(name);
      }
    }
  }
  return [...names];
}

export function collectAaltoDishNames(snapshot,{studentOnly=false}={}){
  const names=new Set();
  for(const restaurant of Array.isArray(snapshot?.restaurants)?snapshot.restaurants:[]){
    if(studentOnly&&restaurant?.priceCategory!=='student')continue;
    for(const day of Object.values(restaurant?.menus||{}))for(const dish of Array.isArray(day?.dishes)?day.dishes:[]){
      const name=typeof dish?.name==='string'?dish.name.trim():'';
      if(!name||localDishTranslation(name))continue;
      const classified=classifyAaltoDish(dish);
      if(classified.meat.status==='identified'||classified.meat.status==='uncertain'||classified.fish)names.add(name);
    }
  }
  return [...names];
}

export function cleanCache(data){
  const saved=Object.create(null),entries=data?.translations;
  if(entries&&typeof entries==='object'&&!Array.isArray(entries)){
    for(const [name,value] of Object.entries(entries))if(name&&isUsableChineseTranslation(value))saved[name]=value;
  }
  return saved;
}

// Keep requests well under Translator's character and array limits.
export function makeBatches(names){
  const batches=[];let current=[],size=0,skipped=0;
  for(const name of names){
    if(name.length>5000){skipped++;continue;}
    if(current.length>=50||size+name.length>20000){batches.push(current);current=[];size=0;}
    current.push(name);size+=name.length;
  }
  if(current.length)batches.push(current);
  return {batches,skipped};
}

export async function buildCache({restaurants,previous,aalto,laurus,key,region='northeurope',fetchImpl=fetch,now=new Date()}){
  if(typeof key!=='string'||!key.trim())throw new Error('Missing AZURE_TRANSLATOR_KEY. Add it to the repository Actions secrets.');
  if(typeof region!=='string'||!region.trim())throw new Error('Missing Azure Translator region.');
  const translations=cleanCache(previous),names=[...new Set([...collectDishNames(restaurants),...collectAaltoDishNames(aalto,{studentOnly:true}),...collectAaltoDishNames(laurus)])];
  const pending=names.filter(name=>!Object.hasOwn(translations,name));
  const {batches,skipped}=makeBatches(pending);let added=0,untranslated=skipped;
  for(const batch of batches){
    const response=await fetchImpl(TRANSLATE_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','Ocp-Apim-Subscription-Key':key,'Ocp-Apim-Subscription-Region':region.trim()},
      body:JSON.stringify(batch.map(text=>({Text:text}))),
      signal:AbortSignal.timeout(30000)
    });
    if(!response.ok)throw new Error(`Azure Translator returned HTTP ${response.status}. Check the key, region and quota in Azure.`);
    const result=await response.json();
    if(!Array.isArray(result)||result.length!==batch.length)throw new Error('Azure Translator returned an unexpected response.');
    for(let i=0;i<batch.length;i++){
      const value=result[i]?.translations?.[0]?.text;
      if(isUsableChineseTranslation(value)){translations[batch[i]]=value.trim();added++;}
      else untranslated++;
    }
  }
  return {version:1,updatedAt:now.toISOString(),translations,stats:{publishedNames:names.length,added,untranslated}};
}

async function readPrevious(){
  try{return JSON.parse(await readFile(CACHE_PATH,'utf8'));}
  catch(error){if(error.code==='ENOENT')return {};throw new Error('Could not read the saved translation cache.');}
}

export async function main(){
  const key=process.env.AZURE_TRANSLATOR_KEY,region=process.env.AZURE_TRANSLATOR_REGION||'northeurope';
  if(!key?.trim())throw new Error('Missing AZURE_TRANSLATOR_KEY. Add it to the repository Actions secrets.');
  const previous=await readPrevious();
  const collect=(args,old)=>runFile('python3',[AALTO_COLLECTOR,...args],{timeout:120000,maxBuffer:12*1024*1024,env:{PATH:process.env.PATH||'/usr/bin:/bin',LANG:'C.UTF-8',TZ:'Europe/Helsinki'}})
    .then(({stdout})=>{const data=JSON.parse(stdout);if(!Array.isArray(data?.restaurants))throw Error('Unexpected menu data');return data;})
    .catch(()=>old?{...old,refreshFailed:true}:{version:1,collectedAt:null,restaurants:[],refreshFailed:true});
  const aaltoPromise=collect([],previous.aalto),laurusPromise=collect(['--laurus'],previous.laurus);
  const response=await fetch(MENU_URL,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`UniCafe returned HTTP ${response.status}; the existing site has not been replaced.`);
  const restaurants=await response.json(),[aalto,laurus]=await Promise.all([aaltoPromise,laurusPromise]);
  const result=await buildCache({restaurants,previous,aalto,laurus,key,region});
  const {stats,...cache}=result;
  cache.aalto=aalto;
  cache.laurus=laurus;
  await mkdir(dirname(CACHE_PATH),{recursive:true});
  const temporary=`${CACHE_PATH}.tmp`;
  await writeFile(temporary,`${JSON.stringify(cache,null,2)}\n`,'utf8');
  await rename(temporary,CACHE_PATH);
  console.log(`Published menu names: ${stats.publishedNames}; new translations: ${stats.added}; waiting: ${stats.untranslated}.`);
  console.log(`Otaniemi restaurants: ${aalto.restaurants.length}; source update: ${aalto.refreshFailed?'unavailable':aalto.partial?'partial':'complete'}.`);
  console.log(`Main Building source update: ${laurus.refreshFailed?'unavailable':laurus.officialAvailable===false?'Kanttiinit fallback':'official'}.`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
