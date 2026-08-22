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
// Monta um .xlsx minimo em memoria: ZIP com os XML que o leitor consome.
// STORED (sem compressao) mantem o teste sem dependencia de biblioteca.
function xlsxDeTeste(){
  const enc=new (require('util').TextEncoder)();
  const arquivos=[
    ['xl/sharedStrings.xml','<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      +['DATA','DESCRICAO','VALOR','DOCUMENTO','SISPAG FORNECEDORES','TARIFA PACOTE'].map(v=>'<si><t>'+v+'</t></si>').join('')+'</sst>'],
    ['xl/styles.xml','<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>'],
    ['xl/worksheets/sheet1.xml','<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      +'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>'
      +'<row r="2"><c r="A2" s="1"><v>46081</v></c><c r="B2" t="s"><v>4</v></c><c r="C2"><v>-10000</v></c><c r="D2" t="inlineStr"><is><t>NF-100</t></is></c></row>'
      +'<row r="3"><c r="A3" s="1"><v>46081</v></c><c r="B3" t="s"><v>5</v></c><c r="C3"><v>-45.9</v></c></row>'
      +'<row r="9"><c r="A9"/></row></sheetData></worksheet>']
  ];
  const crcTable=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
  const crc32=b=>{let c=0xFFFFFFFF;for(const x of b)c=crcTable[(c^x)&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0};
  const partes=[],central=[];let offset=0;
  for(const [nome,conteudo] of arquivos){
    const dados=enc.encode(conteudo),nomeBytes=enc.encode(nome),crc=crc32(dados);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0,8);
    local.writeUInt32LE(crc,14);local.writeUInt32LE(dados.length,18);local.writeUInt32LE(dados.length,22);
    local.writeUInt16LE(nomeBytes.length,26);
    partes.push(local,Buffer.from(nomeBytes),Buffer.from(dados));
    const cd=Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);cd.writeUInt16LE(0,10);
    cd.writeUInt32LE(crc,16);cd.writeUInt32LE(dados.length,20);cd.writeUInt32LE(dados.length,24);
    cd.writeUInt16LE(nomeBytes.length,28);cd.writeUInt32LE(offset,42);
    central.push(cd,Buffer.from(nomeBytes));
    offset+=30+nomeBytes.length+dados.length;
  }
  const corpo=Buffer.concat(partes),dir=Buffer.concat(central),fim=Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50,0);fim.writeUInt16LE(arquivos.length,8);fim.writeUInt16LE(arquivos.length,10);
  fim.writeUInt32LE(dir.length,12);fim.writeUInt32LE(corpo.length,16);
  return Buffer.concat([corpo,dir,fim]);
}

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

  console.log('\nplanilha .xlsx');
  await page.goto(base+'/processos/01-normalizacao/');
  await page.setInputFiles('#file-banco',{name:'extrato.xlsx',
    mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:xlsxDeTeste()});
  await page.waitForSelector('#mapping-banco select',{timeout:8000});
  {
    check('a planilha é lida',(await page.innerText('#name-banco')).includes('2 linhas'),await page.innerText('#name-banco'));
    check('mapeia a data pelo cabeçalho',await page.inputValue('#map-banco-data')==='0');
    check('mapeia o valor pelo cabeçalho',await page.inputValue('#map-banco-valor')==='2');
    await page.click('#normalize-banco');
    const linhas=await page.locator('#output-body tr').allInnerTexts();
    check('duas linhas normalizadas (a vazia é descartada)',linhas.length===2,String(linhas.length));
    check('data serial do Excel vira DD/MM/AAAA',linhas[0].includes('28/02/2026'),linhas[0].replace(/\t/g,' | '));
    check('valor negativo preservado',linhas[0].includes('10.000,00'),linhas[0].replace(/\t/g,' | '));
    check('texto embutido na célula é lido',linhas[0].includes('NF-100'),linhas[0].replace(/\t/g,' | '));
  }

  console.log('\nexportar em cada etapa');
  for(const [slug,step] of [['03-desmembramento',3],['04-notas-fiscais',4],['05-contas-contabeis',5],['06-historico',6],['07-validacao',7]]){
    await page.goto(base+'/processos/'+slug+'/');
    await page.waitForSelector('#export-step',{timeout:8000});
    check('processo 0'+step+' tem botão de exportar',await page.locator('#export-step').count()===1);
  }

  console.log('\nbackup e troca de lote');
  await page.goto(base+'/processos/01-normalizacao/');
  await page.waitForSelector('[data-backup]');
  {
    check('a barra do lote tem seletor',await page.locator('[data-switch-lot]').count()===1);
    check('e botão de backup',await page.locator('[data-backup]').count()===1);
    await page.click('[data-backup]');
    // Captura o arquivo que o botão gera, sem depender de download real.
    const baixado=await page.evaluate(()=>new Promise(r=>{
      const orig=URL.createObjectURL;let capturado=null;
      URL.createObjectURL=b=>{capturado=b;return orig.call(URL,b)};
      document.querySelector('[data-export-lot]').click();
      setTimeout(async()=>{URL.createObjectURL=orig;r(capturado?await capturado.text():null)},300);
    }));
    check('exportar gera um arquivo',!!baixado,String(baixado).slice(0,80));
    const backup=JSON.parse(baixado);
    check('o backup se identifica',backup.formato==='contabil-flow/lote',backup.formato);
    check('e leva os lançamentos',Array.isArray(backup.lote.records)&&backup.lote.records.length>0,String(backup.lote.records?.length));
    check('junto com as correções manuais',typeof backup.lote.overrides==='object');

    // Importar o backup precisa criar um lote novo com o mesmo conteúdo.
    const antes=await page.evaluate(()=>window.ContabilStore.listLots().length);
    const resultado=await page.evaluate(dados=>{
      try{const l=window.ContabilStore.importLot(dados);return{ok:true,registros:l.records.length,cliente:l.client}}
      catch(e){return{ok:false,erro:e.message}}
    },backup);
    check('importar funciona',resultado.ok,resultado.erro||'');
    check('com os mesmos lançamentos',resultado.registros===backup.lote.records.length,String(resultado.registros));
    const depois=await page.evaluate(()=>window.ContabilStore.listLots().length);
    check('e cria um lote novo, sem sobrescrever',depois===antes+1,'antes='+antes+' depois='+depois);

    // Arquivo estranho precisa ser recusado com mensagem clara.
    const lixo=await page.evaluate(()=>{
      try{window.ContabilStore.importLot({qualquer:'coisa'});return null}catch(e){return e.message}});
    check('backup de outro formato é recusado',/não reconhecido/i.test(lixo||''),String(lixo));
    const semLancamentos=await page.evaluate(()=>{
      try{window.ContabilStore.importLot({formato:'contabil-flow/lote',lote:{client:'X'}});return null}catch(e){return e.message}});
    check('backup sem lançamentos é recusado',/não contém lançamentos/i.test(semLancamentos||''),String(semLancamentos));
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
