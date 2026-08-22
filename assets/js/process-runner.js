(function(){
  const PREVIEW_LIMIT=500;
  const step=Number(document.body.dataset.process),store=window.ContabilStore,eng=window.ContabilEngines;if(!store||!eng||step<3)return;
  document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="../../assets/css/engine.css"><link rel="stylesheet" href="../../assets/css/tools.css">');
  const host=document.querySelector('.empty-state');if(!host)return;const pageBadge=document.querySelector('.topbar .badge');if(pageBadge){pageBadge.textContent='Motor disponível';pageBadge.classList.add('badge-live')}host.className='engine-shell';host.id='engine-workspace';
  const lot=store.ensure();let rules=lot.configs?.[5]?.rules||defaultRules(),layoutResult=null;
  host.innerHTML='<div class="engine-head"><div><span class="step-label">MOTOR DO PROCESSO</span><h2>'+titles()[step]+'</h2><p>'+descriptions()[step]+'</p></div><span class="status-chip '+(lot.steps[step]==='complete'?'ok':'warn')+'" id="engine-state">'+statusLabel(lot.steps[step])+'</span></div><div id="engine-controls"></div><div id="engine-message" class="notice" role="status" aria-live="polite">Configure as regras e execute o processo.</div><div id="engine-result" class="engine-result" hidden></div>';
  renderControls();if(lot.steps?.[step]!=='pending'&&lot.records?.length)try{renderResult(window.ContabilPipeline.resultOf(lot,step))}catch{}
  function renderControls(){
    const box=document.getElementById('engine-controls');
    if(step===3)box.innerHTML=configWrap('<div class="form-field"><label for="engine-tolerance">Tolerância (R$)</label><input id="engine-tolerance" inputmode="decimal" value="'+(lot.configs?.[3]?.tolerance??'0,01')+'"></div>')+actions('Executar desmembramento');
    if(step===4)box.innerHTML=configWrap('<div class="form-field"><label for="match-tolerance">Tolerância de valor (R$)</label><input id="match-tolerance" inputmode="decimal" value="'+(lot.configs?.[4]?.tolerance??'0,01')+'"></div>')+actions('Identificar documentos');
    if(step===5){box.innerHTML='<div class="engine-config"><div class="form-field"><label for="rule-keyword">Palavra-chave</label><input id="rule-keyword" placeholder="Ex.: fornecedor"></div><div class="form-field"><label for="rule-debit">Conta de débito</label><input id="rule-debit" placeholder="Ex.: 2.1.01.001"></div><div class="form-field"><label for="rule-credit">Conta de crédito</label><input id="rule-credit" placeholder="Ex.: 1.1.01.001"></div></div><div class="engine-actions"><button id="add-rule" type="button" class="secondary">Adicionar regra</button><button id="run-engine" type="button">Classificar contas</button></div><div id="rule-list" class="rule-list"></div>';renderRules();document.getElementById('add-rule').addEventListener('click',addRule)}
    if(step===6)box.innerHTML=configWrap('<div class="form-field full-field"><label for="history-template">Modelo do histórico</label><input id="history-template" value="'+attr(lot.configs?.[6]?.template||'PAGAMENTO {descricao} - DOC {documento}')+'"></div>')+'<p class="engine-note">Campos disponíveis: {descricao}, {documento}, {data}, {valor} e {cliente}.</p>'+actions('Gerar históricos');
    if(step===7)box.innerHTML='<div class="privacy-note"><b>✓</b><span>A validação confere data, descrição, valor, contas, histórico, duplicidades e avisos das etapas anteriores.</span></div>'+actions('Executar validação');
    if(step===8)box.innerHTML=configWrap('<div class="form-field"><label for="layout-system">Layout de destino</label><select id="layout-system"><option value="generico">CSV genérico</option><option value="dominio">Domínio</option><option value="alterdata">Alterdata</option></select></div>')+'<div class="engine-actions"><button id="run-engine" type="button">Gerar layout</button><button id="download-layout" type="button" class="secondary" disabled>Baixar arquivo</button></div>';
    document.getElementById('run-engine')?.addEventListener('click',run);document.getElementById('download-layout')?.addEventListener('click',downloadLayout)
  }
  function run(){
    const base=inputs();if(!base.length){message('Este processo ainda não possui dados de entrada. Conclua e salve as etapas anteriores.','error');return}
    try{let result,config={},state='complete';
      if(step===3){config={tolerance:parseBR(document.getElementById('engine-tolerance').value)};result=eng.splitPayments(base,config);if(!result.matches.length)state='warning'}
      if(step===4){config={tolerance:parseBR(document.getElementById('match-tolerance').value)};result=eng.matchDocuments(base,config);if(result.matches.some(x=>x.status!=='confirmado'))state='warning'}
      if(step===5){config={rules};result=eng.applyAccounts(base,config);if(result.some(x=>x.statusAccount==='pendente'))state='warning'}
      if(step===6){config={template:document.getElementById('history-template').value,client:lot.client};result=eng.generateHistory(base,config)}
      if(step===7){result=eng.validate(base);if(result.some(x=>x.validationStatus!=='valido'))state='warning'}
      if(step===8){const c=eng.reconcileTotals(base,{tolerance:.01});if(!c.confere)throw new Error('O lote não confere com o extrato ('+money(c.diferenca)+' de diferença). Revise o Processo 03 antes de exportar.');config={system:document.getElementById('layout-system').value};layoutResult=eng.buildLayout(base,config);result=layoutResult;if(!result.count)state='warning'}
      store.setProcessResult(step,result,state,config);setEngineState(state);renderResult(result);message(successMessage(result,state),state==='complete'?'ok':'')
    }catch(err){message(err.message||'Não foi possível executar este processo.','error')}
  }
  // A entrada de cada etapa e a saida da anterior, reconstruida a partir dos
  // registros normalizados e das configuracoes salvas.
  function inputs(){
    if(!lot.records?.length)return[];
    if(lot.steps?.[step-1]==='pending')return[];
    return window.ContabilPipeline.upTo(lot,step-1);
  }
  function renderResult(result){
    const box=document.getElementById('engine-result');box.hidden=false;
    if(step===3)box.innerHTML=result.matches.length?table(['Data','Pagamento bancário','Valor','Itens encontrados','Diferença','Status'],result.matches.map(r=>[esc(r.date),esc(r.bankDescription),money(r.bankValue),r.parts.map(p=>esc(p.description)+' ('+money(p.value)+')').join('<br>'),money(r.difference),chip('Desmembrado','ok')])):'<div class="engine-empty">Nenhum pagamento agrupado foi identificado automaticamente. Todos os lançamentos seguem preservados para a próxima etapa.</div>';
    if(step===4){
      const rec=eng.reconcileTotals(result.records,lot.configs?.[4]||{});
      box.innerHTML=postingSummary(result.records,rec)
        +table(['Data','Movimento bancário','Documento','Correspondência','Confiança','Status'],result.matches.map(r=>[esc(r.date),esc(r.bankDescription),esc(r.document||'—'),esc(r.matchedDescription||'Não encontrada'),'<span class="confidence">'+r.confidence+'%</span>',chip(r.status==='confirmado'?'Confirmado':r.status==='revisar'?'Revisar':'Sem correspondência',r.status==='confirmado'?'ok':r.status==='revisar'?'warn':'error')]));
    }
    if(step===5)box.innerHTML=table(['Descrição','Valor','Débito','Crédito','Regra','Status'],result.slice(0,PREVIEW_LIMIT).map(r=>[esc(r.descricao),money(r.valor),esc(r.accountDebit||'—'),esc(r.accountCredit||'—'),esc(r.accountRule||'—'),chip(r.statusAccount==='classificado'?'Classificado':'Pendente',r.statusAccount==='classificado'?'ok':'warn')]),result.length);
    if(step===6)box.innerHTML=table(['Data','Documento','Histórico gerado','Status'],result.slice(0,PREVIEW_LIMIT).map(r=>[esc(r.data),esc(r.documento||'—'),esc(r.history),chip('Gerado','ok')]),result.length);
    if(step===7){const valid=result.filter(r=>r.validationStatus==='valido').length,warn=result.filter(r=>r.validationStatus==='aviso').length,error=result.filter(r=>r.validationStatus==='erro').length;const pend=result.filter(r=>r.validationStatus==='pendente').length,conf=eng.reconcileTotals(result,{tolerance:.01});box.innerHTML='<div class="validation-grid"><div class="validation-card"><strong>'+valid+'</strong><span>válidos</span></div><div class="validation-card"><strong>'+warn+'</strong><span>com avisos</span></div><div class="validation-card"><strong>'+error+'</strong><span>com erros</span></div><div class="validation-card"><strong>'+pend+'</strong><span>não contabilizados</span></div></div>'+reconcileBox(conf)+table(['Data','Descrição','Valor','Resultado','Detalhes'],result.slice(0,PREVIEW_LIMIT).map(r=>[esc(r.data),esc(r.descricao),money(r.valor),chip(r.validationStatus,r.validationStatus==='valido'?'ok':r.validationStatus==='aviso'?'warn':'error'),esc([...r.validationErrors,...r.validationWarnings].join(' · ')||'Sem pendências')]),result.length)}
    if(step===8){layoutResult=result;box.innerHTML='<div class="validation-grid"><div class="validation-card"><strong>'+result.count+'</strong><span>lançamentos liberados</span></div><div class="validation-card"><strong>'+esc(result.system)+'</strong><span>layout selecionado</span></div></div><pre class="layout-preview">'+esc(result.content.split('\r\n').slice(0,8).join('\n'))+'</pre>';document.getElementById('download-layout').disabled=!result.count}
  }
  function renderRules(){const list=document.getElementById('rule-list');list.innerHTML=rules.map((r,i)=>'<div class="rule-row"><span><strong>'+esc(r.keyword)+'</strong></span><span>Débito: '+esc(r.debit)+'</span><span>Crédito: '+esc(r.credit)+'</span><button type="button" class="rule-remove" data-remove="'+i+'" aria-label="Remover regra '+esc(r.keyword)+'">×</button></div>').join('');list.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{rules.splice(Number(b.dataset.remove),1);renderRules()}))}
  function addRule(){const keyword=document.getElementById('rule-keyword').value.trim(),debit=document.getElementById('rule-debit').value.trim(),credit=document.getElementById('rule-credit').value.trim();if(!keyword||!debit||!credit){message('Preencha palavra-chave, débito e crédito.','error');return}rules.push({keyword,debit,credit});['rule-keyword','rule-debit','rule-credit'].forEach(id=>document.getElementById(id).value='');renderRules();message('Regra adicionada. Execute a classificação para aplicá-la.')}
  function downloadLayout(){if(!layoutResult?.count)return;const blob=new Blob([layoutResult.content],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='contabil-flow-'+layoutResult.system+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);store.addAudit('Layout final exportado',layoutResult.count+' lançamentos')}
  // O contador precisa ver, antes de exportar, se o que vai para o arquivo
  // corresponde ao que de fato entrou ou saiu da conta.
  function reconcileBox(c){
    const cls=c.confere?'ok':'error';
    return'<div class="reconcile '+cls+'"><div class="reconcile-head"><strong>'+(c.confere?'O lote confere com o extrato':'O lote NÃO confere com o extrato')+'</strong>'
      +(c.pendencias?'<span class="reconcile-pend">'+c.pendencias+' lançamento(s) do relatório sem contrapartida, fora do arquivo</span>':'')+'</div>'
      +'<dl class="reconcile-grid"><div><dt>Movimentou na conta</dt><dd>'+money(c.extrato)+'</dd></div>'
      +'<div><dt>Vai ser contabilizado</dt><dd>'+money(c.contabilizado)+'</dd></div>'
      +'<div><dt>Diferença</dt><dd class="'+(c.confere?'':'diff-bad')+'">'+money(c.diferenca)+'</dd></div></dl></div>';
  }
  function postingSummary(records,c){
    const conta=records.filter(r=>r.posting==='lancamento').length,
      agreg=records.filter(r=>r.posting==='agregador').length,
      espelho=records.filter(r=>r.posting==='espelho').length,
      pend=records.filter(r=>r.posting==='pendencia').length;
    return'<div class="validation-grid"><div class="validation-card"><strong>'+conta+'</strong><span>viram lançamento</span></div>'
      +'<div class="validation-card"><strong>'+agreg+'</strong><span>pagamentos agrupados</span></div>'
      +'<div class="validation-card"><strong>'+espelho+'</strong><span>já lançados pelo relatório</span></div>'
      +'<div class="validation-card"><strong>'+pend+'</strong><span>pendências</span></div></div>'+reconcileBox(c);
  }
  function table(headers,rows,total){return'<div class="table-wrap"><table class="result-table"><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(cols=>'<tr>'+cols.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+truncated(rows.length,total)}
  function truncated(shown,total){return total>shown?'<p class="engine-note">Exibindo '+shown+' de '+total+' lançamentos. O resultado completo segue salvo no lote e é usado pela próxima etapa.</p>':''}
  function actions(label){return'<div class="engine-actions"><button id="run-engine" type="button">'+label+'</button></div>'}
  function configWrap(inner){return'<div class="engine-config">'+inner+'</div>'}
  function message(text,type=''){const el=document.getElementById('engine-message');el.textContent=text;el.className=('notice '+type).trim()}
  function setEngineState(state){const el=document.getElementById('engine-state');el.textContent=statusLabel(state);el.className='status-chip '+(state==='complete'?'ok':'warn')}
  function successMessage(result,state){if(step===3)return result.records.length+' lançamentos seguiram adiante; '+result.matches.length+' pagamento(s) agrupado(s) identificado(s).';if(step===4){const c=eng.reconcileTotals(result.records,{tolerance:.01});return result.records.filter(r=>r.posting==='lancamento').length+' lançamento(s) contábeis identificados de '+result.records.length+' registros. '+(c.confere?'O total confere com o extrato.':'Atenção: o total não confere com o extrato.')}if(step===5)return result.filter(r=>r.statusAccount==='classificado').length+' de '+result.length+' lançamento(s) classificados.';if(step===6)return result.length+' histórico(s) gerado(s).';if(step===7){const c=eng.reconcileTotals(result,{tolerance:.01});return result.filter(r=>r.validationStatus==='valido').length+' de '+result.filter(r=>r.validationStatus!=='pendente').length+' lançamento(s) aprovados sem avisos. '+(c.confere?'O lote confere com o extrato.':'O lote NÃO confere com o extrato: '+money(c.diferenca)+' de diferença.')}return result.count+' lançamento(s) preparados para exportação.'}
  function defaultRules(){return[{keyword:'tarifa',debit:'4.1.01.001',credit:'1.1.01.001'},{keyword:'fornecedor',debit:'2.1.01.001',credit:'1.1.01.001'},{keyword:'recebimento',debit:'1.1.01.001',credit:'3.1.01.001'},{keyword:'cliente',debit:'1.1.01.001',credit:'3.1.01.001'}]}
  function titles(){return{3:'Desmembrar pagamentos agrupados',4:'Identificar documentos e notas',5:'Classificar contas por regras',6:'Gerar históricos padronizados',7:'Validar o lote completo',8:'Gerar arquivo de importação'}}
  function descriptions(){return{3:'Procura combinações entre um pagamento bancário e múltiplos itens do relatório na mesma data.',4:'Cruza documento, valor, data e descrição para calcular a confiança da correspondência.',5:'Aplica regras por palavra-chave e mantém pendências visíveis para revisão.',6:'Usa um modelo configurável para gerar o histórico de cada lançamento.',7:'Bloqueia registros sem campos essenciais e destaca duplicidades e avisos.',8:'Converte apenas os registros validados para o layout escolhido.'}}
  function statusLabel(s){return s==='complete'?'Concluído':s==='warning'?'Com pendências':'Não executado'}
  function parseBR(v){const n=Number(String(v).replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.abs(n):.01}
  function money(n){return Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
  function chip(text,type){return'<span class="status-chip '+type+'">'+esc(text)+'</span>'}
  function esc(v){return String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
  function attr(v){return esc(v).replace(/'/g,'&#39;')}
})();
