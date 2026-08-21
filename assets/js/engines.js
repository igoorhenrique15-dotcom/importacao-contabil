(function(){
  const round=n=>Math.round((Number(n)||0)*100)/100,abs=n=>Math.abs(Number(n)||0);
  function combinations(items,target,tolerance,max=4){
    let found=null;
    function walk(start,picked,sum){if(found)return;if(picked.length>=2&&abs(abs(sum)-abs(target))<=tolerance){found=[...picked];return}if(picked.length===max)return;for(let i=start;i<items.length;i++)walk(i+1,[...picked,items[i]],sum+Number(items[i].valor||0))}
    walk(0,[],0);return found;
  }
  function splitPayments(records,{tolerance=.01}={}){
    const banks=records.filter(r=>r.origem==='banco'),reports=records.filter(r=>r.origem==='relatorio'),used=new Set(),matches=[];
    banks.forEach(bank=>{const candidates=reports.filter(r=>r.data===bank.data&&!used.has(r.id)&&abs(r.valor)<=abs(bank.valor)+tolerance);const parts=combinations(candidates,bank.valor,tolerance,5);if(parts){parts.forEach(p=>used.add(p.id));matches.push({id:'split-'+bank.id,date:bank.data,bankId:bank.id,bankDescription:bank.descricao,bankValue:bank.valor,parts:parts.map(p=>({id:p.id,description:p.descricao,value:p.valor,document:p.documento})),distributed:round(parts.reduce((s,p)=>s+Number(p.valor||0),0)),difference:round(Number(bank.valor)-parts.reduce((s,p)=>s+Number(p.valor||0),0)),status:'desmembrado'})}});
    return matches;
  }
  function matchDocuments(records,{tolerance=.01}={}){
    const banks=records.filter(r=>r.origem==='banco'),reports=records.filter(r=>r.origem==='relatorio'),used=new Set();
    return banks.map(bank=>{let best=null,score=0;reports.filter(r=>!used.has(r.id)).forEach(report=>{let s=0;if(bank.documento&&report.documento&&norm(bank.documento)===norm(report.documento))s+=55;if(abs(abs(bank.valor)-abs(report.valor))<=tolerance)s+=30;if(bank.data&&bank.data===report.data)s+=15;if(norm(bank.descricao)&&norm(report.descricao)&&similar(norm(bank.descricao),norm(report.descricao))>.45)s+=10;if(s>score){score=s;best=report}});if(best&&score>=45)used.add(best.id);return{id:'doc-'+bank.id,bankId:bank.id,bankDescription:bank.descricao,bankValue:bank.valor,date:bank.data,document:best?.documento||bank.documento||'',matchedId:best?.id||null,matchedDescription:best?.descricao||'',confidence:Math.min(100,score),status:score>=80?'confirmado':score>=45?'revisar':'sem_correspondencia'}})
  }
  function applyAccounts(records,{rules=[]}={}){
    return records.map(record=>{const text=norm([record.descricao,record.documento].join(' '));const rule=rules.find(r=>text.includes(norm(r.keyword)));return{...record,accountDebit:rule?.debit||'',accountCredit:rule?.credit||'',accountRule:rule?.keyword||'',statusAccount:rule?'classificado':'pendente'}})
  }
  function generateHistory(records,{template='PAGAMENTO {descricao} - DOC {documento}',client=''}={}){
    return records.map(r=>({...r,history:template.replace(/\{(descricao|documento|data|valor|cliente)\}/g,(_,key)=>({descricao:r.descricao||'',documento:r.documento||'',data:r.data||'',valor:money(r.valor),cliente:client}[key]||'')).replace(/\s+/g,' ').replace(/-\s*$/,'').trim(),statusHistory:'gerado'}))
  }
  function validate(records){
    const seen=new Map();return records.map(r=>{const errors=[],warnings=[];if(!r.data)errors.push('Data obrigatória');if(!r.descricao)errors.push('Descrição obrigatória');if(!Number.isFinite(Number(r.valor))||Number(r.valor)===0)errors.push('Valor inválido');if(!r.accountDebit)errors.push('Conta de débito ausente');if(!r.accountCredit)errors.push('Conta de crédito ausente');if(!r.history)errors.push('Histórico ausente');const key=[r.data,r.documento,round(r.valor)].join('|');if(seen.has(key))warnings.push('Possível duplicidade');seen.set(key,true);if(r.issues?.length)warnings.push(...r.issues);return{...r,validationErrors:errors,validationWarnings:warnings,validationStatus:errors.length?'erro':warnings.length?'aviso':'valido'}})
  }
  function buildLayout(records,{system='generico'}={}){
    const layouts={generico:{delimiter:';',header:['DATA','DEBITO','CREDITO','VALOR','HISTORICO','DOCUMENTO'],row:r=>[r.data,r.accountDebit,r.accountCredit,decimal(r.valor),r.history,r.documento]},dominio:{delimiter:';',header:['DATA','CONTA_DEBITO','CONTA_CREDITO','VALOR','HISTORICO','DOCUMENTO'],row:r=>[r.data,r.accountDebit,r.accountCredit,decimal(r.valor),r.history,r.documento]},alterdata:{delimiter:';',header:['DT_LCTO','CTA_DEBITO','CTA_CREDITO','VLR_LCTO','HISTORICO','NR_DOCUMENTO'],row:r=>[r.data,r.accountDebit,r.accountCredit,decimal(r.valor),r.history,r.documento]}};const layout=layouts[system]||layouts.generico,valid=records.filter(r=>r.validationStatus==='valido'||r.validationStatus==='aviso');const lines=[layout.header,...valid.map(layout.row)].map(cols=>cols.map(csvCell).join(layout.delimiter));return{system,rows:valid,count:valid.length,content:'\uFEFF'+lines.join('\r\n')}}
  function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
  function similar(a,b){const aa=new Set(a.split(' ')),bb=new Set(b.split(' ')),common=[...aa].filter(x=>bb.has(x)).length;return common/Math.max(1,new Set([...aa,...bb]).size)}
  function money(n){return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
  function decimal(n){return Number(n||0).toFixed(2).replace('.',',')}
  function csvCell(v){const s=String(v??'');return/[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
  window.ContabilEngines={splitPayments,matchDocuments,applyAccounts,generateHistory,validate,buildLayout,money,decimal};
})();
