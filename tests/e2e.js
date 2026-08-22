#!/usr/bin/env node
// Percorre o fluxo 01 → 08 em um navegador real, servindo o site estático a
// partir da raiz do repositório.
//
//   npm install playwright-core   (ou playwright)
//   node tests/e2e.js
//
// Sem o pacote instalado o teste é pulado, não quebrado. A suíte padrão
// (node tests/run.js) não depende de navegador.
const path=require('path'),fs=require('fs'),http=require('http');
const ROOT=path.join(__dirname,'..');
let chromium;
try{chromium=require(process.env.PLAYWRIGHT_MODULE||'playwright-core').chromium}
catch{try{chromium=require('playwright').chromium}catch{
  console.log('playwright-core não instalado — teste de navegador pulado.');
  process.exit(0);
}}
// Usa o Chromium já presente no ambiente quando houver, senão o do Playwright.
function chromiumPath(){
  if(process.env.CHROMIUM_PATH)return process.env.CHROMIUM_PATH;
  const base=process.env.PLAYWRIGHT_BROWSERS_PATH;
  if(base&&fs.existsSync(base)){
    const dir=fs.readdirSync(base).filter(d=>/^chromium-/.test(d)).sort().pop();
    if(dir){const exe=path.join(base,dir,'chrome-linux','chrome');if(fs.existsSync(exe))return exe}
  }
  return undefined;
}
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.ico':'image/x-icon','.png':'image/png'};
const server=http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p.endsWith('/'))p+='index.html';
  const file=path.join(ROOT,p);
  if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end('nf')}
  res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});

const CSV_BANCO='DATA;HISTORICO;VALOR;DOCUMENTO\n05/03/2026;PAGAMENTO FORNECEDOR ACME;-1.500,00;NF-100\n05/03/2026;TARIFA BANCARIA;-45,90;\n06/03/2026;RECEBIMENTO CLIENTE BETA;2.300,50;NF-200\n';
const CSV_REL='DATA;DESCRICAO;VALOR;DOCUMENTO\n05/03/2026;FORNECEDOR ACME PARCELA 1;-500,00;NF-100\n05/03/2026;FORNECEDOR ACME PARCELA 2;-1.000,00;NF-100\n05/03/2026;TARIFA BANCARIA;-45,90;\n06/03/2026;CLIENTE BETA;2.300,50;NF-200\n';

let fails=0;
const check=(name,cond,detail)=>{console.log((cond?'  ok   ':'  FAIL ')+name+(cond?'':' :: '+detail));if(!cond)fails++};

(async()=>{
  await new Promise(r=>server.listen(0,r));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:chromiumPath(),args:['--no-sandbox']});
  const ctx=await browser.newContext();
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});

  console.log('\npainel');
  await page.goto(base+'/index.html');
  check('título carrega',(await page.title()).includes('Contábil Flow'),await page.title());
  check('8 cards de processo',await page.locator('.process-card').count()===8);

  console.log('\nprocesso 01 — normalização');
  await page.goto(base+'/processos/01-normalizacao/');
  await page.setInputFiles('#file-banco',{name:'banco.csv',mimeType:'text/csv',buffer:Buffer.from(CSV_BANCO,'utf8')});
  await page.waitForSelector('#mapping-banco select');
  check('mapeou a data automaticamente',await page.inputValue('#map-banco-data')==='0',await page.inputValue('#map-banco-data'));
  check('mapeou a descrição automaticamente',await page.inputValue('#map-banco-descricao')==='1');
  check('mapeou o valor automaticamente',await page.inputValue('#map-banco-valor')==='2');
  await page.click('#normalize-banco');
  await page.setInputFiles('#file-relatorio',{name:'relatorio.csv',mimeType:'text/csv',buffer:Buffer.from(CSV_REL,'utf8')});
  await page.waitForSelector('#mapping-relatorio select');
  await page.click('#normalize-relatorio');
  const linhas=await page.locator('#output-body tr').count();
  check('7 linhas normalizadas',linhas===7,'linhas='+linhas);
  const totalBanco=await page.locator('#summary .metric').nth(1).innerText();
  check('total do banco usa o milhar brasileiro',totalBanco.includes('754,60'),totalBanco);
  const avisos=await page.locator('#summary .metric').nth(3).innerText();
  check('nenhum aviso de valor inválido',avisos.trim().endsWith('0'),avisos.replace(/\n/g,' '));
  await page.click('#save-lot');
  check('salvou no lote',(await page.innerText('#status')).includes('salvo no lote'),await page.innerText('#status'));

  console.log('\nprocesso 02 — fechamento');
  await page.goto(base+'/processos/02-fechamento/');
  await page.click('#run-closing');
  const datas=await page.locator('#closing-body tr').count();
  check('duas datas analisadas',datas===2,'datas='+datas);
  check('fechamento sem divergência',(await page.innerText('#closing-status')).includes('sem divergências'),await page.innerText('#closing-status'));

  console.log('\nprocessos 03 a 08 — motores');
  for(const [slug,step] of [['03-desmembramento',3],['04-notas-fiscais',4],['05-contas-contabeis',5],['06-historico',6],['07-validacao',7],['08-layout-importacao',8]]){
    await page.goto(base+'/processos/'+slug+'/');
    await page.waitForSelector('#run-engine');
    await page.click('#run-engine');
    await page.waitForSelector('#engine-result:not([hidden])');
    const msg=(await page.innerText('#engine-message')).replace(/\n/g,' ');
    check('processo 0'+step+' executou',!/não possui dados de entrada|Não foi possível/.test(msg),msg);
    if(step===3)check('desmembrou o pagamento de 1.500,00',msg.includes('1 pagamento'),msg);
    if(step===7)check('validação aprovou lançamentos',/[1-9]\d* de \d+ lançamento\(s\) aprovados/.test(msg),msg);
    if(step===8){
      check('layout gerado com lançamentos',/[1-9]\d* lançamento\(s\) preparados/.test(msg),msg);
      const preview=await page.innerText('.layout-preview');
      check('prévia traz o cabeçalho do layout',preview.includes('DATA;DEBITO;CREDITO'),preview.split('\n')[0]);
      check('botão de download liberado',!(await page.isDisabled('#download-layout')));
    }
  }

  console.log('\nescape de conteúdo do arquivo');
  const CSV_XSS='DATA;DESCRICAO;VALOR\n<img src=x onerror=window.__xss=1>;"<b>NEGRITO</b>";-10,00\n';
  await page.goto(base+'/processos/01-normalizacao/');
  await page.setInputFiles('#file-banco',{name:'x.csv',mimeType:'text/csv',buffer:Buffer.from(CSV_XSS,'utf8')});
  await page.waitForSelector('#mapping-banco select');
  await page.click('#normalize-banco');
  await page.click('#save-lot');
  await page.goto(base+'/processos/02-fechamento/');
  await page.click('#run-closing');
  check('data maliciosa não injeta HTML no fechamento',await page.evaluate(()=>!window.__xss&&!document.querySelector('#closing-body img')));
  const celula=await page.locator('#closing-body tr td').first().innerText();
  check('data maliciosa aparece como texto',celula.includes('<img'),celula);

  console.log('\nerros de página');
  check('nenhum erro de JavaScript',errors.length===0,errors.join(' | '));

  await browser.close();server.close();
  console.log('\n'+(fails?fails+' verificação(ões) falharam':'todas as verificações de navegador passaram'));
  process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
