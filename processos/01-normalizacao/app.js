document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="../../assets/css/tools.css">');
const {parseDelimited,parseOfx,parseMoney,normalizeDate,guessColumn}=window.ContabilParsers;
const sourceState={banco:freshSource(),relatorio:freshSource()};
const fields=[
  {key:'data',label:'Data',hints:['data','dt','date','movimento','lancamento','dtposted']},
  {key:'descricao',label:'Descrição',hints:['descricao','historico','memo','nome','favorecido','cliente','name']},
  {key:'valor',label:'Valor',hints:['valor','vlr','amount','total','trnamt']},
  {key:'debito',label:'Débito',hints:['debito','debit']},
  {key:'credito',label:'Crédito',hints:['credito','credit']},
  {key:'documento',label:'Documento / NF',hints:['documento','doc','nota','nf','numero','fitid','checknum']}
];
let page=1,query='',restoredRows=[];
const pageSize=50;
function freshSource(){return{raw:[],headers:[],rows:[],file:null,fileName:'',issues:[],buffer:null,sheets:[],sheet:0}}
['banco','relatorio'].forEach(source=>{
  const input=document.getElementById('file-'+source),zone=input.closest('.dropzone');
  input.addEventListener('change',e=>loadFile(source,e.target.files[0]));
  zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('dragging')});
  zone.addEventListener('dragleave',()=>zone.classList.remove('dragging'));
  zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('dragging');loadFile(source,e.dataTransfer.files[0])});
  document.getElementById('normalize-'+source).addEventListener('click',()=>normalize(source));
  document.getElementById('reset-'+source).addEventListener('click',()=>reset(source));
  document.getElementById('save-template-'+source).addEventListener('click',()=>saveTemplate(source));
});
document.getElementById('export-all').addEventListener('click',exportCsv);
document.getElementById('save-lot').addEventListener('click',saveToLot);
document.getElementById('search-output').addEventListener('input',e=>{query=e.target.value.toLowerCase();page=1;renderOutput()});
document.getElementById('prev-page').addEventListener('click',()=>{if(page>1){page--;renderOutput()}});
document.getElementById('next-page').addEventListener('click',()=>{page++;renderOutput()});
document.getElementById('restore-saved').addEventListener('click',restoreSaved);
const existing=ContabilStore.active()?.records||[];
if(existing.length)document.getElementById('resume-banner').classList.add('show');

async function loadFile(source,file){
  if(!file)return;
  if(file.size>25*1024*1024){setStatus('O arquivo excede o limite local de 25 MB. Divida-o antes de continuar.','error');return}
  try{
    aplicarLeitura(source,await lerArquivo(file),file);
    const estado=sourceState[source];
    setStatus('Arquivo '+file.name+' carregado'
      +(estado.sheets.length>1?' ('+estado.sheets.length+' abas — lendo “'+estado.sheets[estado.sheet]+'”)':'')
      +'. Confira o mapeamento antes de normalizar.');
  }catch(err){setStatus(err.message||'Não foi possível ler o arquivo.','error')}
}
// Cada formato tem seu leitor; o resto do processo trabalha sempre com linhas.
async function lerArquivo(file,sheet=0){
  if(/\.xlsx?$/i.test(file.name)||/sheet|excel/i.test(file.type||'')){
    if(/\.xls$/i.test(file.name))throw new Error('Formato .xls antigo não é suportado. Salve como .xlsx ou CSV no Excel.');
    const buffer=await file.arrayBuffer();
    const {rows,sheets,sheet:usada}=await window.ContabilXlsx.readXlsx(buffer,{sheet});
    return{rows,sheets,sheet:usada,buffer};
  }
  const text=await readText(file);
  return{rows:/\.ofx$/i.test(file.name)||/<OFX>/i.test(text)?parseOfx(text):parseDelimited(text),sheets:[],sheet:0,buffer:null};
}
// Troca a aba sem pedir o arquivo de novo.
async function trocarAba(source,indice){
  const estado=sourceState[source];if(!estado.buffer)return;
  try{
    const {rows,sheet}=await window.ContabilXlsx.readXlsx(estado.buffer,{sheet:indice});
    aplicarLeitura(source,{rows,sheets:estado.sheets,sheet,buffer:estado.buffer},estado.file);
    setStatus('Aba “'+estado.sheets[sheet]+'” carregada com '+estado.raw.length+' linha(s). Confira o mapeamento.','ok');
  }catch(err){setStatus(err.message||'Não foi possível ler esta aba.','error')}
}
function aplicarLeitura(source,leitura,file){
  const linhas=leitura.rows;
  if(linhas.length<2)throw new Error('Não foi possível identificar cabeçalho e registros.');
  Object.assign(sourceState[source],{file,fileName:file.name,buffer:leitura.buffer,sheets:leitura.sheets,sheet:leitura.sheet,
    headers:linhas[0].map((h,i)=>String(h||'COLUNA_'+(i+1)).trim()),
    raw:linhas.slice(1).filter(row=>row.some(v=>String(v).trim())),rows:[],issues:[]});
  const estado=sourceState[source];
  document.getElementById('name-'+source).textContent=file.name+(estado.sheets.length>1?' · aba '+estado.sheets[estado.sheet]:'')+' · '+estado.raw.length+' linhas';
  renderAbas(source);buildMapping(source);toggleSource(source,true);renderOutput();
}
// Planilha de cliente costuma ter varias abas; ler sempre a primeira seria
// adivinhacao.
function renderAbas(source){
  const estado=sourceState[source];
  let caixa=document.getElementById('abas-'+source);
  if(estado.sheets.length<2){if(caixa)caixa.remove();return}
  if(!caixa){
    caixa=document.createElement('div');caixa.className='field';caixa.id='abas-'+source;
    document.getElementById('mapping-'+source).before(caixa);
  }
  caixa.innerHTML='<label for="aba-'+source+'">Aba da planilha</label><select id="aba-'+source+'">'
    +estado.sheets.map((nome,i)=>'<option value="'+i+'"'+(i===estado.sheet?' selected':'')+'>'+escapeHtml(nome)+'</option>').join('')+'</select>';
  caixa.querySelector('select').addEventListener('change',e=>trocarAba(source,Number(e.target.value)));
}
function readText(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const bytes=new Uint8Array(reader.result);let text=new TextDecoder('utf-8',{fatal:false}).decode(bytes);if(text.includes('�'))text=new TextDecoder('windows-1252').decode(bytes);resolve(text)};reader.onerror=()=>reject(new Error('Falha ao ler o arquivo.'));reader.readAsArrayBuffer(file)})}
function buildMapping(source){
  const box=document.getElementById('mapping-'+source);box.innerHTML='';
  fields.forEach(f=>{const wrap=document.createElement('div');wrap.className='field';const label=document.createElement('label'),select=document.createElement('select');select.id='map-'+source+'-'+f.key;label.htmlFor=select.id;label.textContent=f.label;select.innerHTML='<option value="">— não usar —</option>'+sourceState[source].headers.map((h,i)=>'<option value="'+i+'">'+escapeHtml(h)+'</option>').join('');const guess=guessColumn(sourceState[source].headers,f.hints);if(guess>=0)select.value=String(guess);wrap.append(label,select);box.appendChild(wrap)});
  const saved=ContabilStore.getTemplate('mapping:'+source);if(saved)applyMapping(source,saved.mapping);
}
function currentMapping(source){return Object.fromEntries(fields.map(f=>{const v=document.getElementById('map-'+source+'-'+f.key).value;return[f.key,v===''?null:Number(v)]}))}
function applyMapping(source,mapping){fields.forEach(f=>{const el=document.getElementById('map-'+source+'-'+f.key);if(el&&mapping[f.key]!=null&&mapping[f.key]<sourceState[source].headers.length)el.value=String(mapping[f.key])})}
function normalize(source){
  const mapping=currentMapping(source);if(['data','descricao','valor','debito','credito'].every(k=>mapping[k]===null)){setStatus('Mapeie pelo menos uma coluna útil.','error');return}
  const issues=[];
  sourceState[source].rows=sourceState[source].raw.map((row,index)=>{
    const get=k=>mapping[k]===null?'':String(row[mapping[k]]??'').trim(),rawValue=get('valor'),rawDebit=get('debito'),rawCredit=get('credito');
    const direct=parseMoney(rawValue),debit=parseMoney(rawDebit),credit=parseMoney(rawCredit),date=normalizeDate(get('data'));
    const rowIssues=[];if(rawValue&&direct===null)rowIssues.push('Valor inválido');if(rawDebit&&debit===null)rowIssues.push('Débito inválido');if(rawCredit&&credit===null)rowIssues.push('Crédito inválido');if(get('data')&&!date.valid)rowIssues.push('Data não reconhecida');
    if(rowIssues.length)issues.push('Linha '+(index+2)+': '+rowIssues.join(', '));
    const value=rawValue?(direct??0):(credit??0)-(debit??0);
    return{id:ContabilStore.uid('lan'),origem:source,arquivo:sourceState[source].fileName,linha:index+2,data:date.value,descricao:get('descricao'),valor:value,debito:debit??0,credito:credit??0,documento:get('documento'),status:rowIssues.length?'warning':'valid',issues:rowIssues,original:{data:get('data'),valor:rawValue,debito:rawDebit,credito:rawCredit}};
  }).filter(r=>r.data||r.descricao||r.valor||r.debito||r.credito||r.documento);
  // O que acabou de ser normalizado substitui o que foi restaurado da mesma
  // origem: sem isso, restaurar e normalizar de novo duplicava o lote.
  const restauradosAntes=restoredRows.length;
  restoredRows=restoredRows.filter(r=>r.origem!==source);
  const substituidos=restauradosAntes-restoredRows.length;
  sourceState[source].issues=issues;page=1;renderOutput();
  setStatus(labelSource(source)+' normalizado: '+sourceState[source].rows.length+' registros, '+issues.length+' avisos.'
    +(substituidos?' '+substituidos+' registro(s) restaurados desta origem foram substituídos.':''),issues.length?'':'ok');
}
function allRows(){return[...sourceState.banco.rows,...sourceState.relatorio.rows,...restoredRows]}
function filteredRows(){return allRows().filter(r=>!query||[r.descricao,r.documento,r.data,r.origem].some(v=>String(v).toLowerCase().includes(query)))}
function renderOutput(){
  const rows=filteredRows(),totalPages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,totalPages);const visible=rows.slice((page-1)*pageSize,page*pageSize);
  const body=document.getElementById('output-body');body.innerHTML=visible.length?visible.map(rowHtml).join(''):'<tr><td colspan="8" class="empty">Nenhum dado encontrado.</td></tr>';
  document.getElementById('mobile-output').innerHTML=visible.map(cardHtml).join('');
  const all=allRows(),warnings=all.filter(r=>r.status==='warning').length,totalBanco=all.filter(r=>r.origem==='banco').reduce((s,r)=>s+r.valor,0),totalRel=all.filter(r=>r.origem==='relatorio').reduce((s,r)=>s+r.valor,0);
  document.getElementById('summary').innerHTML=metric('Registros',all.length)+metric('Total banco',money(totalBanco))+metric('Total relatório',money(totalRel))+metric('Avisos',warnings);
  document.getElementById('issues').innerHTML=[...sourceState.banco.issues,...sourceState.relatorio.issues].slice(0,8).map(x=>'<div class="issue-item">⚠ <span>'+escapeHtml(x)+'</span></div>').join('');
  document.getElementById('result-count').textContent=rows.length+' resultado(s)';document.getElementById('page-info').textContent='Página '+page+' de '+totalPages;document.getElementById('prev-page').disabled=page<=1;document.getElementById('next-page').disabled=page>=totalPages;['export-all','save-lot'].forEach(id=>document.getElementById(id).disabled=!all.length)
}
function rowHtml(r){return'<tr><td>'+r.origem+'</td><td>'+escapeHtml(r.data)+'</td><td>'+escapeHtml(r.descricao)+'</td><td>'+money(r.valor)+'</td><td>'+money(r.debito)+'</td><td>'+money(r.credito)+'</td><td>'+escapeHtml(r.documento)+'</td><td><span class="status-chip '+(r.status==='warning'?'warn':'ok')+'">'+(r.status==='warning'?'Revisar':'Válido')+'</span></td></tr>'}
function cardHtml(r){return'<article class="mobile-record"><div class="mobile-record-head"><strong>'+escapeHtml(r.descricao||'Sem descrição')+'</strong><span class="status-chip '+(r.status==='warning'?'warn':'ok')+'">'+(r.status==='warning'?'Revisar':'Válido')+'</span></div><dl><div><dt>Data</dt><dd>'+escapeHtml(r.data)+'</dd></div><div><dt>Valor</dt><dd>'+money(r.valor)+'</dd></div><div><dt>Origem</dt><dd>'+r.origem+'</dd></div><div><dt>Documento</dt><dd>'+escapeHtml(r.documento||'—')+'</dd></div></dl></article>'}
function metric(label,value){return'<div class="metric"><small>'+label+'</small><strong>'+value+'</strong></div>'}
function saveToLot(){const rows=allRows();
  const ids=new Set(),repetidos=rows.filter(r=>ids.has(r.id)?true:(ids.add(r.id),false));
  if(repetidos.length){setStatus('Há '+repetidos.length+' lançamento(s) repetidos na saída. Limpe as fontes e normalize novamente antes de salvar.','error');return}
  try{ContabilStore.setRecords(rows,sourceState.banco.rows.length&&sourceState.relatorio.rows.length?'banco + relatório':rows[0]?.origem||'arquivo');setStatus('Resultado salvo no lote. O Processo 02 já pode usar estes dados.','ok');document.getElementById('resume-banner').classList.add('show')}catch(err){setStatus(err.message,'error')}}
function restoreSaved(){restoredRows=ContabilStore.active()?.records||[];sourceState.banco.rows=[];sourceState.relatorio.rows=[];renderOutput();setStatus(restoredRows.length+' registros restaurados do lote. Normalizar um arquivo novo substitui os registros da mesma origem.','ok')}
function saveTemplate(source){const name=document.getElementById('template-'+source).value.trim();if(!name){setStatus('Informe um nome para o modelo.','error');return}ContabilStore.saveTemplate('mapping:'+source,{name,mapping:currentMapping(source)});setStatus('Modelo “'+name+'” salvo para este lote.','ok')}
function toggleSource(source,on){document.getElementById('normalize-'+source).disabled=!on;document.getElementById('reset-'+source).disabled=!on;document.getElementById('template-box-'+source).hidden=!on}
function reset(source){sourceState[source]=freshSource();document.getElementById('file-'+source).value='';document.getElementById('name-'+source).textContent='Nenhum arquivo selecionado';document.getElementById('mapping-'+source).innerHTML='';document.getElementById('abas-'+source)?.remove();toggleSource(source,false);renderOutput();setStatus(labelSource(source)+' removido.')}
function exportCsv(){const rows=allRows();if(!rows.length)return;const header=['ID','ORIGEM','ARQUIVO','LINHA_ORIGINAL','DATA','DESCRICAO','VALOR','DEBITO','CREDITO','DOCUMENTO','STATUS'];const lines=[header,...rows.map(r=>[r.id,r.origem,r.arquivo,r.linha,r.data,r.descricao,decimalBR(r.valor),decimalBR(r.debito),decimalBR(r.credito),r.documento,r.status])].map(cols=>cols.map(csvCell).join(';'));const blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='contabil-flow-normalizado.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);ContabilStore.addAudit('CSV exportado',rows.length+' registros')}
function csvCell(v){const s=String(v??'');return/[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function decimalBR(n){return Number(n||0).toFixed(2).replace('.',',')}
function money(n){return Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function escapeHtml(v){return String(v??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]))}
function setStatus(message,type=''){const el=document.getElementById('status');el.textContent=message;el.className=('notice '+type).trim()}
function labelSource(s){return s==='banco'?'Banco':'Relatório'}
renderOutput();
