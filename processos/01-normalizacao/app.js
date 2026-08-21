const state={banco:{raw:[],headers:[],rows:[],file:null},relatorio:{raw:[],headers:[],rows:[],file:null}};
const fields=[
  {key:'data',label:'Data',hints:['data','dt','date','movimento','lancamento']},
  {key:'descricao',label:'Descrição',hints:['descricao','descrição','historico','histórico','memo','nome','favorecido','cliente']},
  {key:'valor',label:'Valor',hints:['valor','vlr','amount','total']},
  {key:'debito',label:'Débito',hints:['debito','débito','debit']},
  {key:'credito',label:'Crédito',hints:['credito','crédito','credit']},
  {key:'documento',label:'Documento / NF',hints:['documento','doc','nota','nf','numero','número']}
];

['banco','relatorio'].forEach(source=>{
  document.getElementById(`file-${source}`).addEventListener('change',e=>loadFile(source,e.target.files[0]));
  document.getElementById(`normalize-${source}`).addEventListener('click',()=>normalize(source));
  document.getElementById(`reset-${source}`).addEventListener('click',()=>reset(source));
});
document.getElementById('export-all').addEventListener('click',exportCsv);

async function loadFile(source,file){
  if(!file)return;
  const text=await file.text();
  const parsed=parseDelimited(text);
  if(parsed.length<2){setStatus(`Não foi possível identificar linhas suficientes em ${file.name}.`,'error');return;}
  state[source].file=file;
  state[source].headers=parsed[0].map((h,i)=>String(h||`COLUNA_${i+1}`).trim());
  state[source].raw=parsed.slice(1).filter(row=>row.some(v=>String(v).trim()!==''));
  state[source].rows=[];
  document.getElementById(`name-${source}`).textContent=`${file.name} · ${state[source].raw.length} linhas`;
  buildMapping(source);
  document.getElementById(`normalize-${source}`).disabled=false;
  document.getElementById(`reset-${source}`).disabled=false;
  renderOutput();
  setStatus(`Arquivo ${file.name} carregado. Confira o mapeamento e clique em Normalizar.`);
}

function parseDelimited(text){
  const cleaned=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  const sample=cleaned.split('\n').slice(0,8);
  const candidates=[';','\t',','];
  const delimiter=candidates.map(d=>({d,score:sample.reduce((n,l)=>n+countOutsideQuotes(l,d),0)})).sort((a,b)=>b.score-a.score)[0].d;
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<cleaned.length;i++){
    const ch=cleaned[i],next=cleaned[i+1];
    if(ch==='"'){
      if(quoted&&next==='"'){field+='"';i++;}
      else quoted=!quoted;
    }else if(ch===delimiter&&!quoted){row.push(field);field='';}
    else if(ch==='\n'&&!quoted){row.push(field);rows.push(row);row=[];field='';}
    else field+=ch;
  }
  if(field.length||row.length){row.push(field);rows.push(row);}
  return rows;
}
function countOutsideQuotes(line,delimiter){let q=false,n=0;for(let i=0;i<line.length;i++){if(line[i]==='"')q=!q;else if(line[i]===delimiter&&!q)n++;}return n;}

function buildMapping(source){
  const box=document.getElementById(`mapping-${source}`);box.innerHTML='';
  fields.forEach(f=>{
    const wrap=document.createElement('div');wrap.className='field';
    const label=document.createElement('label');label.textContent=f.label;
    const select=document.createElement('select');select.id=`map-${source}-${f.key}`;
    select.innerHTML='<option value="">— não usar —</option>'+state[source].headers.map((h,i)=>`<option value="${i}">${escapeHtml(h)}</option>`).join('');
    const guess=guessColumn(state[source].headers,f.hints);if(guess>=0)select.value=String(guess);
    wrap.append(label,select);box.appendChild(wrap);
  });
}
function guessColumn(headers,hints){
  const normalized=headers.map(normalizeText);
  for(const hint of hints){const exact=normalized.findIndex(h=>h===normalizeText(hint));if(exact>=0)return exact;}
  for(const hint of hints){const partial=normalized.findIndex(h=>h.includes(normalizeText(hint)));if(partial>=0)return partial;}
  return -1;
}
function normalizeText(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}

function normalize(source){
  const mapping={};fields.forEach(f=>{const v=document.getElementById(`map-${source}-${f.key}`).value;mapping[f.key]=v===''?null:Number(v);});
  if(mapping.data===null&&mapping.descricao===null&&mapping.valor===null&&mapping.debito===null&&mapping.credito===null){setStatus('Mapeie pelo menos uma coluna útil antes de normalizar.','error');return;}
  state[source].rows=state[source].raw.map((row,index)=>{
    const get=key=>mapping[key]===null?'':String(row[mapping[key]]??'').trim();
    const debit=parseMoney(get('debito'));const credit=parseMoney(get('credito'));const direct=parseMoney(get('valor'));
    const hasDirect=get('valor')!=='';
    return {origem:source,linha:index+2,data:normalizeDate(get('data')),descricao:get('descricao'),valor:hasDirect?direct:credit-debit,debito:debit,credito:credit,documento:get('documento')};
  }).filter(r=>r.data||r.descricao||r.valor||r.debito||r.credito||r.documento);
  renderOutput();
  setStatus(`${source==='banco'?'Banco':'Relatório'} normalizado: ${state[source].rows.length} registros.`,'ok');
}

function parseMoney(input){
  let s=String(input??'').trim();if(!s)return 0;
  let negative=/^\s*-/.test(s)||/^\(.*\)$/.test(s);
  s=s.replace(/[R$€£\s()]/g,'');
  const lastComma=s.lastIndexOf(','),lastDot=s.lastIndexOf('.');
  if(lastComma>lastDot)s=s.replace(/\./g,'').replace(',','.');
  else if(lastDot>lastComma&&lastComma>=0)s=s.replace(/,/g,'');
  else if(lastComma>=0)s=s.replace(',','.');
  s=s.replace(/[^0-9.\-]/g,'');
  const n=Number(s);if(!Number.isFinite(n))return 0;
  return negative?-Math.abs(n):n;
}
function normalizeDate(input){
  const s=String(input??'').trim();if(!s)return '';
  let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if(m){let y=m[3];if(y.length===2)y=Number(y)>=70?`19${y}`:`20${y}`;return `${String(m[1]).padStart(2,'0')}/${String(m[2]).padStart(2,'0')}/${y}`;}
  m=s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);if(m)return `${String(m[3]).padStart(2,'0')}/${String(m[2]).padStart(2,'0')}/${m[1]}`;
  return s;
}

function renderOutput(){
  const rows=[...state.banco.rows,...state.relatorio.rows];
  const body=document.getElementById('output-body');
  if(!rows.length)body.innerHTML='<tr><td colspan="7" class="empty">Nenhum dado normalizado.</td></tr>';
  else body.innerHTML=rows.slice(0,1000).map(r=>`<tr><td>${r.origem}</td><td>${escapeHtml(r.data)}</td><td>${escapeHtml(r.descricao)}</td><td>${money(r.valor)}</td><td>${money(r.debito)}</td><td>${money(r.credito)}</td><td>${escapeHtml(r.documento)}</td></tr>`).join('');
  const totalBanco=state.banco.rows.reduce((s,r)=>s+r.valor,0),totalRel=state.relatorio.rows.reduce((s,r)=>s+r.valor,0);
  document.getElementById('summary').innerHTML=`<div class="metric"><small>Registros normalizados</small><strong>${rows.length}</strong></div><div class="metric"><small>Total banco</small><strong>${money(totalBanco)}</strong></div><div class="metric"><small>Total relatório</small><strong>${money(totalRel)}</strong></div>`;
  document.getElementById('export-all').disabled=!rows.length;
}
function reset(source){
  state[source]={raw:[],headers:[],rows:[],file:null};
  document.getElementById(`file-${source}`).value='';document.getElementById(`name-${source}`).textContent='Nenhum arquivo selecionado';document.getElementById(`mapping-${source}`).innerHTML='';document.getElementById(`normalize-${source}`).disabled=true;document.getElementById(`reset-${source}`).disabled=true;renderOutput();setStatus(`${source==='banco'?'Banco':'Relatório'} removido.`);
}
function exportCsv(){
  const rows=[...state.banco.rows,...state.relatorio.rows];if(!rows.length)return;
  const header=['ORIGEM','LINHA_ORIGINAL','DATA','DESCRICAO','VALOR','DEBITO','CREDITO','DOCUMENTO'];
  const lines=[header,...rows.map(r=>[r.origem,r.linha,r.data,r.descricao,decimalBR(r.valor),decimalBR(r.debito),decimalBR(r.credito),r.documento])].map(cols=>cols.map(csvCell).join(';'));
  const blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='processo-01-normalizado.csv';a.click();URL.revokeObjectURL(url);
}
function csvCell(v){const s=String(v??'');return /[;"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function decimalBR(n){return Number(n||0).toFixed(2).replace('.',',');}
function money(n){return Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function escapeHtml(v){return String(v??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}
function setStatus(message,type=''){const el=document.getElementById('status');el.textContent=message;el.className=`notice ${type}`.trim();}

renderOutput();
