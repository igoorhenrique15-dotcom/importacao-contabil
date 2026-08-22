(function(){
  const round=n=>Math.round((Number(n)||0)*100)/100,abs=n=>Math.abs(Number(n)||0),cents=n=>Math.round((Number(n)||0)*100);
  const MAX_PARTS=5,CANDIDATE_LIMIT=300,SEARCH_BUDGET=150000;
  // Toda a busca acontece em centavos inteiros, para não depender de ponto
  // flutuante. Duas e três parcelas — a esmagadora maioria dos pagamentos
  // agrupados — são resolvidas de forma exata e barata; só a partir de quatro
  // parcelas entra a busca em profundidade, que é limitada por orçamento.
  function combinations(items,target,tolerance,max=MAX_PARTS){
    const goal=Math.abs(cents(target)),tol=Math.max(0,cents(tolerance));
    if(!goal||items.length<2)return null;
    const asc=items.map(item=>({item,v:Math.abs(cents(item.valor))})).sort((a,b)=>a.v-b.v);
    const found=pairSum(asc,0,asc.length-1,goal,tol)||tripleSum(asc,goal,tol)||deepSum(asc,goal,tol,max);
    return found?found.map(x=>x.item):null;
  }
  // Dois ponteiros sobre a lista crescente. O(n).
  function pairSum(asc,lo,hi,goal,tol){
    while(lo<hi){const sum=asc[lo].v+asc[hi].v;if(sum>goal+tol)hi--;else if(sum<goal-tol)lo++;else return[asc[lo],asc[hi]]}
    return null;
  }
  // Fixa a menor parcela e resolve o resto com dois ponteiros. O(n²).
  function tripleSum(asc,goal,tol){
    for(let i=0;i<asc.length-2;i++){
      if(asc[i].v>goal+tol)break;
      const rest=pairSum(asc,i+1,asc.length-1,goal-asc[i].v,tol);
      if(rest)return[asc[i],...rest];
    }
    return null;
  }
  // Quatro ou mais parcelas: busca do maior para o menor valor, podando por
  // alcance restante e por estouro do alvo, com teto de nós visitados.
  function deepSum(asc,goal,tol,max){
    if(max<4)return null;
    const desc=asc.slice().reverse(),n=desc.length,reach=new Array(n+1).fill(0);
    for(let i=n-1;i>=0;i--)reach[i]=reach[i+1]+desc[i].v;
    let visits=0,found=null;const picked=[];
    (function walk(start,sum){
      if(found||visits++>SEARCH_BUDGET)return;
      if(picked.length>=4&&Math.abs(sum-goal)<=tol){found=picked.map(i=>desc[i]);return}
      if(picked.length===max||sum-goal>tol)return;
      for(let i=start;i<n;i++){
        if(sum+reach[i]<goal-tol)return;
        if(sum+desc[i].v-goal>tol)continue;
        picked.push(i);walk(i+1,sum+desc[i].v);picked.pop();
        if(found)return;
      }
    })(0,0);
    return found;
  }
  function splitPayments(records,{tolerance=.01}={}){
    const banks=records.filter(r=>r.origem==='banco'),reports=records.filter(r=>r.origem==='relatorio'),used=new Set(),matches=[],tol=Math.max(0,cents(tolerance));
    banks.forEach(bank=>{
      const target=cents(bank.valor);if(!target)return;
      const sign=Math.sign(target),limit=Math.abs(target)+tol;
      const candidates=reports.filter(r=>r.data===bank.data&&!used.has(r.id)&&Math.sign(cents(r.valor))===sign&&Math.abs(cents(r.valor))<=limit).sort((a,b)=>Math.abs(cents(b.valor))-Math.abs(cents(a.valor))).slice(0,CANDIDATE_LIMIT);
      const parts=combinations(candidates,bank.valor,tolerance);
      if(parts){parts.forEach(p=>used.add(p.id));matches.push({id:'split-'+bank.id,date:bank.data,bankId:bank.id,bankDescription:bank.descricao,bankValue:bank.valor,parts:parts.map(p=>({id:p.id,description:p.descricao,value:p.valor,document:p.documento})),distributed:round(parts.reduce((s,p)=>s+Number(p.valor||0),0)),difference:round(Number(bank.valor)-parts.reduce((s,p)=>s+Number(p.valor||0),0)),status:'desmembrado'})}
    });
    const byBank=new Map(matches.map(m=>[m.bankId,m])),byPart=new Map(matches.flatMap(m=>m.parts.map(p=>[p.id,m.bankId]))),enriched=records.map(record=>{const match=byBank.get(record.id),parent=byPart.get(record.id);return{...record,splitStatus:match?'desmembrado':parent?'item_desmembrado':'nao_aplicavel',splitParts:match?.parts||[],splitParentId:parent||null,processedThrough:3}});
    return{records:enriched,matches};
  }
  // Um casamento só é aceito a partir de 45 pontos, e a pontuação só chega lá
  // por dois caminhos: documento igual (55) ou valor mais data (30+15). Todo
  // par que possa ser aceito está, portanto, num destes dois índices — varrer
  // o relatório inteiro para cada movimento bancário é desperdício.
  //
  // Efeito colateral aceito: um par rejeitado deixa de exibir a confiança
  // parcial que tinha. Mostrar "30%" ao lado de "sem correspondência" só
  // confundia.
  const FAIXA_CENTAVOS=1000;
  // Fechamento diário (Processo 02). Vive aqui, e não na página, para que a
  // cadeia possa ser reconstruída sem passar pela interface.
  function closeDaily(records,{tolerance=.01}={}){
    const tol=Math.max(0,cents(tolerance)),porData=new Map();
    records.forEach(r=>{
      const data=r.data||'Sem data';
      if(!porData.has(data))porData.set(data,{date:data,banco:[],relatorio:[]});
      porData.get(data)[r.origem==='banco'?'banco':'relatorio'].push(r);
    });
    const rows=[...porData.values()].map(x=>{
      const banco=x.banco.reduce((s,r)=>s+cents(r.valor),0),relatorio=x.relatorio.reduce((s,r)=>s+cents(r.valor),0),diff=banco-relatorio;
      return{date:x.date,bankCount:x.banco.length,bankTotal:banco/100,reportCount:x.relatorio.length,reportTotal:relatorio/100,
        difference:diff/100,status:!x.banco.length||!x.relatorio.length?'incompleto':Math.abs(diff)<=tol?'conciliado':'divergente'};
    }).sort((a,b)=>ordemData(a.date)-ordemData(b.date));
    const porDia=new Map(rows.map(d=>[d.date,d]));
    const enriched=records.map(record=>{const dia=porDia.get(record.data)||{status:'incompleto',difference:0};
      return{...record,closingStatus:dia.status,dailyDifference:dia.difference,processedThrough:2}});
    return{rows,records:enriched};
  }
  function ordemData(v){const m=String(v).match(/(\d{2})\/(\d{2})\/(\d{4})/);return m?new Date(+m[3],+m[2]-1,+m[1]).getTime():Number.MAX_SAFE_INTEGER}
  function matchDocuments(records,{tolerance=.01}={}){
    const banks=records.filter(r=>r.origem==='banco'),reports=records.filter(r=>r.origem==='relatorio'),used=new Set();
    const tol=Math.max(0,cents(tolerance)),porDocumento=new Map(),porData=new Map();
    reports.forEach(r=>{
      const doc=norm(r.documento);
      if(doc){if(!porDocumento.has(doc))porDocumento.set(doc,[]);porDocumento.get(doc).push(r)}
      const dia=r.data||'';if(!porData.has(dia))porData.set(dia,new Map());
      const porValor=porData.get(dia),v=Math.abs(cents(r.valor));
      if(!porValor.has(v))porValor.set(v,[]);porValor.get(v).push(r);
    });
    const matches=banks.map(bank=>{
      const vistos=new Set(),candidatos=[];
      const add=r=>{if(r&&!used.has(r.id)&&!vistos.has(r.id)){vistos.add(r.id);candidatos.push(r)}};
      const doc=norm(bank.documento);
      if(doc)(porDocumento.get(doc)||[]).forEach(add);
      const porValor=porData.get(bank.data||'');
      if(porValor){
        const alvo=Math.abs(cents(bank.valor));
        // Tolerância grande deixa a faixa de centavos cara; aí sai mais barato
        // percorrer o dia inteiro.
        if(tol<=FAIXA_CENTAVOS)for(let v=alvo-tol;v<=alvo+tol;v++)(porValor.get(v)||[]).forEach(add);
        else porValor.forEach(lista=>lista.forEach(add));
      }
      let best=null,score=0;
      candidatos.forEach(report=>{let s=0;if(bank.documento&&report.documento&&norm(bank.documento)===norm(report.documento))s+=55;if(abs(abs(bank.valor)-abs(report.valor))<=tolerance)s+=30;if(bank.data&&bank.data===report.data)s+=15;if(norm(bank.descricao)&&norm(report.descricao)&&similar(norm(bank.descricao),norm(report.descricao))>.45)s+=10;if(s>score){score=s;best=report}});
      if(best&&score>=45)used.add(best.id);
      return{id:'doc-'+bank.id,bankId:bank.id,bankDescription:bank.descricao,bankValue:bank.valor,date:bank.data,document:(score>=45&&best?.documento)||bank.documento||'',matchedId:score>=45&&best?best.id:null,matchedDescription:score>=45&&best?best.descricao:'',confidence:Math.min(100,score),status:score>=80?'confirmado':score>=45?'revisar':'sem_correspondencia'};
    });
    const byBank=new Map(matches.map(m=>[m.bankId,m])),enriched=records.map(record=>{const match=byBank.get(record.id);return{...record,documento:record.documento||match?.document||'',documentMatchId:match?.matchedId||null,documentConfidence:match?.confidence??null,documentStatus:match?.status||'origem',processedThrough:4}});
    return{records:classifyPosting(enriched,matches),matches};
  }
  // Decide o que vira lançamento contábil.
  //
  // O extrato prova que o dinheiro se moveu; o relatório diz a quem e por quê.
  // Quando os dois descrevem o mesmo fato, o lançamento sai do relatório, que
  // é onde estão o fornecedor, o documento e a natureza da despesa.
  //
  // - banco desmembrado (um SISPAG que agrupa vários pagamentos): não vira
  //   lançamento — quem vira são os itens que o compõem;
  // - banco já casado com um item do relatório: não vira lançamento, seria o
  //   mesmo fato contado duas vezes;
  // - banco sem contrapartida (tarifa, IOF, débito automático): vira
  //   lançamento, porque só existe no extrato;
  // - item do relatório vinculado a um movimento bancário: vira lançamento;
  // - item do relatório sem contrapartida no extrato: fica pendente, porque
  //   não houve movimentação financeira correspondente.
  function classifyPosting(records,matches=[]){
    const espelhados=new Set(matches.filter(m=>m.matchedId).map(m=>m.matchedId));
    const casados=new Set(matches.filter(m=>m.matchedId).map(m=>m.bankId));
    return records.map(record=>{
      let posting,motivo='';
      if(record.origem==='banco'){
        if(record.splitStatus==='desmembrado'){posting='agregador';motivo='Pagamento agrupado: os itens que o compõem é que viram lançamento.'}
        else if(casados.has(record.id)){posting='espelho';motivo='Já lançado pelo relatório, que traz o detalhe do documento.'}
        else{posting='lancamento';motivo='Movimento que só existe no extrato.'}
      }else{
        if(record.splitStatus==='item_desmembrado'){posting='lancamento';motivo='Item de um pagamento agrupado no extrato.'}
        else if(espelhados.has(record.id)){posting='lancamento';motivo='Vinculado a um movimento do extrato.'}
        else{posting='pendencia';motivo='Sem movimentação correspondente no extrato.'}
      }
      return{...record,posting,postingMotivo:motivo,contabilizavel:posting==='lancamento'};
    });
  }
  // Confere se o que será exportado corresponde ao que de fato saiu ou entrou
  // na conta. É o controle que impede o arquivo final de duplicar valor.
  function reconcileTotals(records,{tolerance=.01}={}){
    const extrato=records.filter(r=>r.origem==='banco').reduce((s,r)=>s+cents(r.valor),0);
    const contabilizado=records.filter(r=>isPostable(r)).reduce((s,r)=>s+cents(r.valor),0);
    const diferenca=contabilizado-extrato;
    return{extrato:extrato/100,contabilizado:contabilizado/100,diferenca:diferenca/100,
      confere:Math.abs(diferenca)<=Math.max(0,cents(tolerance)),
      pendencias:records.filter(r=>r.posting==='pendencia').length};
  }
  // Lotes gravados antes desta regra não têm o campo; nesse caso o registro
  // segue contabilizável, como era antes.
  function isPostable(r){return r.posting===undefined?true:r.posting==='lancamento'}
  function applyAccounts(records,{rules=[]}={}){
    return records.map(record=>{const text=norm([record.descricao,record.documento].join(' '));const rule=rules.find(r=>text.includes(norm(r.keyword)));return{...record,accountDebit:rule?.debit||'',accountCredit:rule?.credit||'',accountRule:rule?.keyword||'',statusAccount:rule?'classificado':'pendente'}})
  }
  function generateHistory(records,{template='PAGAMENTO {descricao} - DOC {documento}',client=''}={}){
    return records.map(r=>({...r,history:template.replace(/\{(descricao|documento|data|valor|cliente)\}/g,(_,key)=>({descricao:r.descricao||'',documento:r.documento||'',data:r.data||'',valor:money(r.valor),cliente:client}[key]||'')).replace(/\s+/g,' ').replace(/-\s*$/,'').trim(),statusHistory:'gerado'}))
  }
  function validate(records){
    const seen=new Map();return records.map(r=>{
      const errors=[],warnings=[];
      // Quem não vira lançamento não precisa de conta nem de histórico: é
      // pendência de revisão ou linha já representada por outro registro.
      if(!isPostable(r))return{...r,validationErrors:[],validationWarnings:r.posting==='pendencia'?[r.postingMotivo||'Sem contrapartida no extrato']:[],validationStatus:'pendente'};
      if(!r.data)errors.push('Data obrigatória');
      if(!r.descricao)errors.push('Descrição obrigatória');
      if(!Number.isFinite(Number(r.valor))||Number(r.valor)===0)errors.push('Valor inválido');
      if(!r.accountDebit)errors.push('Conta de débito ausente');
      if(!r.accountCredit)errors.push('Conta de crédito ausente');
      if(r.accountDebit&&r.accountDebit===r.accountCredit)errors.push('Débito e crédito na mesma conta');
      if(!r.history)errors.push('Histórico ausente');
      const key=[r.data,r.documento,round(r.valor)].join('|');
      if(seen.has(key))warnings.push('Possível duplicidade');
      seen.set(key,true);
      if(r.issues?.length)warnings.push(...r.issues);
      return{...r,validationErrors:errors,validationWarnings:warnings,validationStatus:errors.length?'erro':warnings.length?'aviso':'valido'};
    })
  }
  function buildLayout(records,{system='generico'}={}){
    const layouts={generico:{delimiter:';',header:['DATA','DEBITO','CREDITO','VALOR','HISTORICO','DOCUMENTO'],row:r=>[r.data,r.accountDebit,r.accountCredit,decimal(Math.abs(r.valor)),r.history,r.documento]},dominio:{delimiter:';',header:['DATA','CONTA_DEBITO','CONTA_CREDITO','VALOR','HISTORICO','DOCUMENTO'],row:r=>[r.data,r.accountDebit,r.accountCredit,decimal(Math.abs(r.valor)),r.history,r.documento]},alterdata:{delimiter:';',header:['DT_LCTO','CTA_DEBITO','CTA_CREDITO','VLR_LCTO','HISTORICO','NR_DOCUMENTO'],row:r=>[r.data,r.accountDebit,r.accountCredit,decimal(Math.abs(r.valor)),r.history,r.documento]}};const layout=layouts[system]||layouts.generico,valid=records.filter(r=>isPostable(r)&&(r.validationStatus==='valido'||r.validationStatus==='aviso'));const lines=[layout.header,...valid.map(layout.row)].map(cols=>cols.map(csvCell).join(layout.delimiter));return{system,rows:valid,count:valid.length,content:'\uFEFF'+lines.join('\r\n')}}
  function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
  function similar(a,b){const aa=new Set(a.split(' ')),bb=new Set(b.split(' ')),common=[...aa].filter(x=>bb.has(x)).length;return common/Math.max(1,new Set([...aa,...bb]).size)}
  function money(n){return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
  function decimal(n){return Number(n||0).toFixed(2).replace('.',',')}
  function csvCell(v){const s=String(v??'');return/[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
  window.ContabilEngines={closeDaily,splitPayments,matchDocuments,classifyPosting,reconcileTotals,applyAccounts,generateHistory,validate,buildLayout,money,decimal};
})();
