// Carrega os módulos de navegador (IIFE que publicam em `window`) dentro do
// Node, sem transformação e sem dependências externas.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
function loadBrowserModules(...files){
  const win={};
  for(const file of files)new Function('window',fs.readFileSync(path.join(root,file),'utf8'))(win);
  return win;
}
let passed=0,failed=0,current='';
const failures=[];
function suite(name){current=name;console.log('\n'+name)}
function check(name,ok,detail){
  if(ok){passed++;console.log('  ok   '+name)}
  else{failed++;failures.push(current+' › '+name+(detail?'\n       '+detail:''));console.log('  FAIL '+name+(detail?'\n       '+detail:''))}
}
function eq(name,actual,expected){
  const a=JSON.stringify(actual),e=JSON.stringify(expected);
  check(name,a===e,a===e?'':'esperado '+e+', obtido '+a);
}
function ok(name,value,detail){check(name,!!value,value?'':detail||'')}
function report(){
  console.log('\n'+passed+' passaram, '+failed+' falharam');
  if(failed){console.log('\nFalhas:');failures.forEach(f=>console.log('  - '+f))}
  process.exit(failed?1:0);
}
module.exports={loadBrowserModules,suite,check,eq,ok,report};
