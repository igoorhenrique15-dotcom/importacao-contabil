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

// Extrato do Itaú: um SISPAG aglutinando dois fornecedores, mais uma tarifa.
const CSV_BANCO='DATA;HISTORICO;VALOR;DOCUMENTO\n05/03/2026;SISPAG FORNECEDORES;-10.000,00;\n05/03/2026;TARIFA PACOTE SERVICOS;-45,90;\n';
// Relatório: o detalhe por fornecedor, mais um título ainda não pago.
const CSV_REL='DATA;DESCRICAO;VALOR;DOCUMENTO\n05/03/2026;FORNECEDOR JOAO;-5.000,00;NF-100\n05/03/2026;FERRO VELHO;-5.000,00;NF-200\n05/03/2026;FORNECEDOR AINDA NAO PAGO;-800,00;NF-300\n';

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
  // Os arquivos de teste são de março; sem informar a competência, a
  // validação (corretamente) marcaria tudo como fora do período.
  await page.evaluate(()=>window.ContabilStore.updateLot({client:'Metalúrgica ACME',period:'2026-03',bank:'Itaú',system:'Questor'}));
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
  check('5 linhas normalizadas',linhas===5,'linhas='+linhas);
  const totalBanco=await page.locator('#summary .metric').nth(1).innerText();
  check('total do banco usa o milhar brasileiro',totalBanco.includes('10.045,90'),totalBanco);
  const avisos=await page.locator('#summary .metric').nth(3).innerText();
  check('nenhum aviso de valor inválido',avisos.trim().endsWith('0'),avisos.replace(/\n/g,' '));
  await page.click('#save-lot');
  check('salvou no lote',(await page.innerText('#status')).includes('salvo no lote'),await page.innerText('#status'));

  console.log('\nprocesso 02 — fechamento');
  await page.goto(base+'/processos/02-fechamento/');
  await page.click('#run-closing');
  const datas=await page.locator('#closing-body tr').count();
  check('uma data analisada',datas===1,'datas='+datas);

  console.log('\nprocessos 03 a 08 — motores');
  for(const [slug,step] of [['03-desmembramento',3],['04-notas-fiscais',4],['05-contas-contabeis',5],['06-historico',6],['07-validacao',7],['08-layout-importacao',8]]){
    await page.goto(base+'/processos/'+slug+'/');
    await page.waitForSelector('#run-engine');
    await page.click('#run-engine');
    await page.waitForSelector('#engine-result:not([hidden])');
    const msg=(await page.innerText('#engine-message')).replace(/\n/g,' ');
    check('processo 0'+step+' executou',!/não possui dados de entrada|Não foi possível/.test(msg),msg);
    if(step===3)check('desmembrou o SISPAG em dois fornecedores',msg.includes('1 pagamento'),msg);
    if(step===4){
      check('o total confere com o extrato',msg.includes('confere com o extrato')&&!msg.includes('não confere'),msg);
      check('a conferência aparece na tela',await page.locator('.reconcile.ok').count()===1);
      const cards=await page.locator('.validation-card').allInnerTexts();
      check('3 registros viram lançamento',/^3\D/.test(cards[0].replace(/\n/g,' ')),cards.join(' | '));
      check('1 pagamento agrupado fora do arquivo',/^1\D/.test(cards[1].replace(/\n/g,' ')),cards.join(' | '));
      check('1 pendência sinalizada',/^1\D/.test(cards[3].replace(/\n/g,' ')),cards.join(' | '));
    }
    if(step===5){
      // A classificação precisa alcançar os três lançamentos reais.
      for(const [kw,d,c] of [['joao','2.1.01.001','1.1.01.002'],['ferro','2.1.01.002','1.1.01.002'],['tarifa','4.1.01.005','1.1.01.002']]){
        await page.fill('#rule-keyword',kw);await page.fill('#rule-debit',d);await page.fill('#rule-credit',c);
        await page.click('#add-rule');
      }
      await page.click('#run-engine');
      await page.waitForSelector('#engine-result:not([hidden])');
    }
    if(step===7){
      check('validação aprovou lançamentos',/[1-9]\d* de \d+ lançamento\(s\) aprovados/.test(msg),msg);
      // Trocar a competência precisa fazer os mesmos lançamentos virarem aviso.
      await page.evaluate(()=>window.ContabilStore.updateLot({period:'2026-09'}));
      await page.click('#run-engine');
      await page.waitForSelector('#engine-result:not([hidden])');
      // Registros que não viram lançamento não recebem aviso, então a busca é
      // na tabela toda e não na primeira linha.
      const tabela=await page.locator('.result-table tbody').innerText();
      check('lançamento fora da competência é sinalizado',/fora da compet/i.test(tabela),tabela.replace(/\n/g,' | ').slice(0,200));
      check('e o aviso nomeia a competência do lote',/09\/2026/.test(tabela),tabela.replace(/\n/g,' | ').slice(0,200));
      await page.evaluate(()=>window.ContabilStore.updateLot({period:'2026-03'}));
      await page.click('#run-engine');
      await page.waitForSelector('#engine-result:not([hidden])');
      check('e volta a aprovar com a competência certa',/[1-9]\d* de \d+ lançamento\(s\) aprovados/.test(await page.innerText('#engine-message')),await page.innerText('#engine-message'));
      check('o lote confere com o extrato',msg.includes('confere com o extrato')&&!msg.includes('NÃO confere'),msg);
      const grid=await page.locator('.reconcile-grid dd').allInnerTexts();
      check('a conferência mostra o valor do extrato',grid[0].includes('10.045,90'),grid.join(' | '));
      check('e a diferença é zero',/0,00/.test(grid[2]),grid.join(' | '));
    }
    if(step===8){
      check('layout gerado com lançamentos',/[1-9]\d* lançamento\(s\) preparados/.test(msg),msg);
      const preview=await page.innerText('.layout-preview');
      check('prévia traz o cabeçalho do layout',preview.includes('DATA;DEBITO;CREDITO'),preview.split('\n')[0]);
      check('o SISPAG agregador não vai para o arquivo',!preview.includes('SISPAG'),preview);
      check('o valor sai positivo, sem sinal',!/;-\d/.test(preview),preview);
      check('botão de download liberado',!(await page.isDisabled('#download-layout')));
    }
  }

  console.log('\ncorreção manual na tela');
  await page.goto(base+'/processos/05-contas-contabeis/');
  await page.waitForSelector('.edit-cell',{timeout:10000});
  {
    const celulas=page.locator('[data-campo="accountDebit"]');
    check('as contas são editáveis',await celulas.count()===3,String(await celulas.count()));
    // Corrige a conta de débito da primeira linha.
    const alvo=celulas.first();
    await alvo.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('2.1.99.999');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.edit-cell.corrigido',{timeout:5000});
    check('a correção é marcada na tela',await page.locator('.edit-cell.corrigido').count()>=1);
    check('e avisa que o arquivo já considera',(await page.innerText('#engine-message')).includes('Correção salva'),await page.innerText('#engine-message'));
  }
  await page.goto(base+'/processos/08-layout-importacao/');
  await page.waitForSelector('#run-engine');
  await page.click('#run-engine');
  await page.waitForSelector('.layout-preview',{timeout:10000});
  check('a conta corrigida chega ao arquivo final',(await page.innerText('.layout-preview')).includes('2.1.99.999'),await page.innerText('.layout-preview'));

  // Forçar uma linha a sair do arquivo precisa quebrar a conferência.
  await page.goto(base+'/processos/04-notas-fiscais/');
  await page.waitForSelector('.posting-select',{timeout:10000});
  {
    // Escolhe um lançamento sem nenhuma correção — em qualquer etapa — para
    // que desfazer atinja só esta linha. O botão desfaz tudo da linha, então
    // uma linha já corrigida antes perderia aquela correção junto.
    const alvo=await page.evaluate(()=>{
      for(const tr of document.querySelectorAll('.result-table tbody tr')){
        const sel=tr.querySelector('.posting-select');
        if(sel&&sel.value==='lancamento'&&!tr.querySelector('[data-reset]'))return sel.dataset.posting;
      }
      return null;
    });
    check('há lançamento sem correção para ajustar',!!alvo,String(alvo));
    await page.locator('[data-posting="'+alvo+'"]').selectOption('pendencia');
    await page.waitForSelector('.reconcile.error',{timeout:5000});
    check('retirar um lançamento quebra a conferência na hora',await page.locator('.reconcile.error').count()===1);
    // Desfazer exatamente essa linha devolve o estado anterior.
    await page.locator('[data-reset="'+alvo+'"]').click();
    await page.waitForSelector('.reconcile.ok',{timeout:5000});
    check('desfazer a correção volta a conferir',await page.locator('.reconcile.ok').count()===1);
    check('a correção da conta feita antes continua na linha dela',await page.locator('[data-reset]').count()>=1,String(await page.locator('[data-reset]').count()));
  }
  await page.goto(base+'/processos/08-layout-importacao/');
  await page.waitForSelector('#run-engine');
  {
    // Com o lote conferindo de novo, a exportação volta a ser permitida.
    await page.click('#run-engine');
    await page.waitForSelector('.layout-preview',{timeout:10000});
    check('exportação liberada com o lote conferindo',!(await page.isDisabled('#download-layout')));
  }

  console.log('\npersistência: o resultado sobrevive a recarregar');
  // Nada derivado é gravado, então recarregar precisa reconstruir a cadeia.
  await page.goto(base+'/processos/08-layout-importacao/');
  await page.waitForSelector('#engine-result:not([hidden])',{timeout:10000});
  {
    const preview=await page.innerText('.layout-preview');
    check('o arquivo final é reconstruído sozinho ao abrir a página',preview.includes('DATA;DEBITO;CREDITO'),preview.split('\n')[0]);
    check('e continua sem o SISPAG',!preview.includes('SISPAG'),preview);
  }
  await page.goto(base+'/processos/07-validacao/');
  await page.waitForSelector('.reconcile-grid dd',{timeout:10000});
  {
    const grid=await page.locator('.reconcile-grid dd').allInnerTexts();
    check('a conferência é reconstruída com o valor certo',grid[0].includes('10.045,90'),grid.join(' | '));
    const overrides=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('contabil-flow:v2')).lots)[0].overrides||{});
    const contas=Object.values(overrides).filter(o=>o.accountDebit==='2.1.99.999').length;
    check('a conta corrigida à mão foi gravada e sobrevive',contas===1,JSON.stringify(overrides));
  }
  {
    const tamanho=await page.evaluate(()=>{const v=localStorage.getItem('contabil-flow:v2');return v?v.length:0});
    check('o estado gravado é pequeno ('+tamanho+' bytes)',tamanho>0&&tamanho<20000,String(tamanho));
    const gravado=await page.evaluate(()=>JSON.parse(localStorage.getItem('contabil-flow:v2')));
    const lot=Object.values(gravado.lots)[0];
    check('nada derivado foi para o disco',lot.processResults===undefined&&lot.dailyClosing===undefined,Object.keys(lot).join(','));
    check('as configurações foram gravadas',!!lot.configs&&!!lot.configs['5'],JSON.stringify(lot.configs||{}).slice(0,120));
  }

  console.log('\nregressão: restaurar e normalizar de novo');
  // Restaurar o lote e normalizar o mesmo arquivo duplicava os lançamentos.
  await page.goto(base+'/processos/01-normalizacao/');
  await page.waitForSelector('#restore-saved');
  await page.click('#restore-saved');
  const antes=await page.locator('#output-body tr').count();
  await page.setInputFiles('#file-banco',{name:'banco.csv',mimeType:'text/csv',buffer:Buffer.from(CSV_BANCO,'utf8')});
  await page.waitForSelector('#mapping-banco select');
  await page.click('#normalize-banco');
  const depois=await page.locator('#output-body tr').count();
  check('renormalizar não soma linhas ao que foi restaurado',depois===antes,'antes='+antes+' depois='+depois);
  check('e avisa que substituiu a origem',(await page.innerText('#status')).includes('substituídos'),await page.innerText('#status'));
  await page.click('#save-lot');
  const gravados=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('contabil-flow:v2')).lots)[0].records.length);
  check('o lote gravado não duplica',gravados===5,'gravados='+gravados);

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
