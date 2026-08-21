document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="../../assets/css/tools.css">');
let closingRows=ContabilStore.active()?.dailyClosing||[],search='',filter='all';
const records=()=>ContabilStore.active()?.records||[];
document.getElementById('run-closing').addEventListener('click',runClosing);
document.getElementById('export-closing').addEventListener('click',exportClosing);
document.getElementById('closing-search').addEventListener('input',e=>{search=e.target.value.toLowerCase();render()});
document.getElementById('closing-filter').addEventListener('change',e=>{filter=e.target.value;render()});
function runClosing(){
  const rows=records();if(!rows.length){status('Nenhum dado normalizado foi salvo. Volte ao Processo 01 e salve o resultado no lote.','error');return}
  const tolerance=parseTolerance(document.getElementById('tolerance').value),byDate=new Map();
  rows.forEach(r=>{const date=r.data||'Sem data';if(!byDate.has(date))byDate.set(date,{date,banco:[],relatorio:[]});const group=r.origem==='banco'?'banco':'relatorio';byDate.get(date)[group].push(r)});
  closingRows=[...byDate.values()].map(x=>{const bank=x.banco.reduce((s,r)=>s+Number(r.valor||0),0),report=x.relatorio.reduce((s,r)=>s+Number(r.valor||0),0),diff=bank-report;let state=!x.banco.length||!x.relatorio.length?'incompleto':Math.abs(diff)<=tolerance?'conciliado':'divergente';return{date:x.date,bankCount:x.banco.length,bankTotal:bank,reportCount:x.relatorio.length,reportTotal:report,difference:diff,status:state}}).sort((a,b)=>dateSort(a.date)-dateSort(b.date));
  ContabilStore.setClosing(closingRows);render();const divergent=closingRows.filter(r=>r.status==='divergente').length,incomplete=closingRows.filter(r=>r.status==='incompleto').length;status(divergent||incomplete?'Fechamento concluído com '+divergent+' divergência(s) e '+incomplete+' data(s) incompleta(s).':'Fechamento concluído sem divergências. ',divergent||incomplete?'':'ok')
}
function parseTolerance(v){const n=Number(String(v).replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.abs(n):.01}
function dateSort(v){const m=String(v).match(/(\d{2})\/(\d{2})\/(\d{4})/);return m?new Date(+m[3],+m[2]-1,+m[1]).getTime():Number.MAX_SAFE_INTEGER}
function visible(){return closingRows.filter(r=>(filter==='all'||r.status===filter)&&(!search||r.date.toLowerCase().includes(search)))}
function render(){
  const rows=visible(),body=document.getElementById('closing-body');body.innerHTML=rows.length?rows.map(rowHtml).join(''):'<tr><td colspan="7" class="empty">Nenhuma data para exibir.</td></tr>';
  document.getElementById('closing-mobile').innerHTML=rows.map(cardHtml).join('');
  const reconciled=closingRows.filter(r=>r.status==='conciliado').length,divergent=closingRows.filter(r=>r.status==='divergente').length,totalDiff=closingRows.reduce((s,r)=>s+r.difference,0);
  document.getElementById('closing-summary').innerHTML=metric('Datas analisadas',closingRows.length)+metric('Conciliadas',reconciled)+metric('Divergentes',divergent)+metric('Diferença total',money(totalDiff));
  document.getElementById('closing-count').textContent=rows.length+' data(s)';document.getElementById('export-closing').disabled=!closingRows.length
}
function rowHtml(r){return'<tr><td>'+r.date+'</td><td>'+r.bankCount+'</td><td>'+money(r.bankTotal)+'</td><td>'+r.reportCount+'</td><td>'+money(r.reportTotal)+'</td><td>'+money(r.difference)+'</td><td>'+chip(r.status)+'</td></tr>'}
function cardHtml(r){return'<article class="mobile-record"><div class="mobile-record-head"><strong>'+r.date+'</strong>'+chip(r.status)+'</div><dl><div><dt>Banco</dt><dd>'+money(r.bankTotal)+' · '+r.bankCount+'</dd></div><div><dt>Relatório</dt><dd>'+money(r.reportTotal)+' · '+r.reportCount+'</dd></div><div><dt>Diferença</dt><dd>'+money(r.difference)+'</dd></div></dl></article>'}
function chip(s){const cls=s==='conciliado'?'ok':s==='divergente'?'error':'warn';return'<span class="status-chip '+cls+'">'+({conciliado:'Conciliado',divergente:'Divergente',incompleto:'Incompleto'}[s]||s)+'</span>'}
function metric(l,v){return'<div class="metric"><small>'+l+'</small><strong>'+v+'</strong></div>'}
function money(n){return Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function status(message,type=''){const el=document.getElementById('closing-status');el.textContent=message;el.className=('notice '+type).trim()}
function exportClosing(){const header=['DATA','QTD_BANCO','TOTAL_BANCO','QTD_RELATORIO','TOTAL_RELATORIO','DIFERENCA','STATUS'],lines=[header,...closingRows.map(r=>[r.date,r.bankCount,decimal(r.bankTotal),r.reportCount,decimal(r.reportTotal),decimal(r.difference),r.status])].map(cols=>cols.join(';')),blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='contabil-flow-fechamento-diario.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);ContabilStore.addAudit('Fechamento exportado',closingRows.length+' datas')}
function decimal(n){return Number(n||0).toFixed(2).replace('.',',')}
if(records().length)status(records().length+' registros disponíveis. Configure a tolerância e execute o fechamento.','ok');else status('Nenhum dado salvo. Volte ao Processo 01 para normalizar e salvar o lote.','error');
render();
