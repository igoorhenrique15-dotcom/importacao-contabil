const {loadBrowserModules,suite,eq,ok}=require('./harness');
const E=loadBrowserModules('assets/js/engines.js').ContabilEngines;

let seq=0;
const bank=(data,valor,extra={})=>({id:'b'+(++seq),origem:'banco',data,descricao:'PAGAMENTO',valor,documento:'',...extra});
const report=(data,valor,extra={})=>({id:'r'+(++seq),origem:'relatorio',data,descricao:'ITEM',valor,documento:'',...extra});

module.exports=function(){
  suite('splitPayments');
  {
    const b=bank('05/03/2026',-300),parts=[report('05/03/2026',-100),report('05/03/2026',-200)];
    const out=E.splitPayments([b,...parts],{tolerance:.01});
    eq('encontra a combinação exata',out.matches.length,1);
    eq('agrupa os dois itens',out.matches[0].parts.length,2);
    eq('diferença zerada',out.matches[0].difference,0);
    eq('pagamento marcado como desmembrado',out.records.find(r=>r.id===b.id).splitStatus,'desmembrado');
    eq('itens marcados como parte',out.records.filter(r=>r.splitStatus==='item_desmembrado').length,2);
    eq('nenhum registro é perdido',out.records.length,3);
  }
  {
    const out=E.splitPayments([bank('05/03/2026',-300.01),report('05/03/2026',-100),report('05/03/2026',-200)],{tolerance:.02});
    eq('aceita diferença dentro da tolerância',out.matches.length,1);
  }
  {
    const out=E.splitPayments([bank('05/03/2026',-300.5),report('05/03/2026',-100),report('05/03/2026',-200)],{tolerance:.01});
    eq('recusa diferença acima da tolerância',out.matches.length,0);
  }
  {
    const out=E.splitPayments([bank('05/03/2026',-300),report('06/03/2026',-100),report('06/03/2026',-200)],{tolerance:.01});
    eq('não combina itens de outra data',out.matches.length,0);
  }
  {
    const out=E.splitPayments([bank('05/03/2026',-300),report('05/03/2026',-300)],{tolerance:.01});
    eq('exige pelo menos dois itens',out.matches.length,0);
  }
  {
    // Um crédito e um débito não podem "se anular" para fechar um pagamento.
    const out=E.splitPayments([bank('05/03/2026',-100),report('05/03/2026',-300),report('05/03/2026',200)],{tolerance:.01});
    eq('ignora itens de sinal oposto ao pagamento',out.matches.length,0);
  }
  {
    const shared=report('05/03/2026',-100);
    const out=E.splitPayments([bank('05/03/2026',-300),bank('05/03/2026',-300),shared,report('05/03/2026',-200),report('05/03/2026',-150)],{tolerance:.01});
    const usados=out.matches.flatMap(m=>m.parts.map(p=>p.id));
    eq('nenhum item é usado em dois desmembramentos',usados.length,new Set(usados).size);
  }
  {
    // Centavos inteiros: 0,1 + 0,2 não deve escapar da tolerância por float.
    const out=E.splitPayments([bank('05/03/2026',-0.3),report('05/03/2026',-0.1),report('05/03/2026',-0.2)],{tolerance:0});
    eq('soma exata em centavos com tolerância zero',out.matches.length,1);
  }
  {
    const out=E.splitPayments([bank('05/03/2026',0),report('05/03/2026',-100),report('05/03/2026',-200)],{tolerance:.01});
    eq('pagamento de valor zero é ignorado',out.matches.length,0);
  }
  {
    // Quatro parcelas exigem a busca em profundidade: nenhum par ou trio fecha 600.
    const parts=[report('05/03/2026',-111),report('05/03/2026',-129),report('05/03/2026',-157),report('05/03/2026',-203)];
    const out=E.splitPayments([bank('05/03/2026',-600),...parts],{tolerance:.01});
    eq('desmembra em quatro parcelas',out.matches.length&&out.matches[0].parts.length,4);
  }
  {
    const parts=[report('05/03/2026',-97),report('05/03/2026',-101),report('05/03/2026',-113),report('05/03/2026',-127),report('05/03/2026',-162)];
    const out=E.splitPayments([bank('05/03/2026',-600),...parts],{tolerance:.01});
    eq('desmembra em cinco parcelas',out.matches.length&&out.matches[0].parts.length,5);
  }
  {
    const parts=[report('05/03/2026',-100),report('05/03/2026',-200),report('05/03/2026',-300)];
    const out=E.splitPayments([bank('05/03/2026',-300),...parts],{tolerance:.01});
    eq('prefere o menor agrupamento',out.matches[0].parts.length,2);
  }
  {
    // Regressão: a busca por força bruta travava o navegador aqui.
    const recs=[bank('05/03/2026',-999999.99)];
    for(let i=0;i<400;i++)recs.push(report('05/03/2026',-((i+1)*1.07)));
    const t=Date.now();E.splitPayments(recs,{tolerance:.01});const ms=Date.now()-t;
    ok('400 candidatos sem combinação terminam em menos de 1s (levou '+ms+'ms)',ms<1000);
  }
  {
    const recs=[];
    for(let d=1;d<=20;d++){
      const data=String(d).padStart(2,'0')+'/03/2026';
      recs.push(bank(data,-600));
      recs.push(report(data,-250),report(data,-350)); // combinação real
      for(let i=0;i<150;i++)recs.push(report(data,-((i+1)*3.13))); // ruído
    }
    const t=Date.now();const out=E.splitPayments(recs,{tolerance:.01});const ms=Date.now()-t;
    ok('20 datas × 150 itens terminam em menos de 2s (levou '+ms+'ms)',ms<2000);
    ok('ainda assim encontra desmembramentos',out.matches.length>0,'matches='+out.matches.length);
  }

  suite('classifyPosting — o que vira lançamento');
  {
    // Caso real: SISPAG do Itaú agrupando dois fornecedores, mais uma tarifa
    // que só existe no extrato, mais um item do relatório ainda não pago.
    const recs=[
      bank('05/03/2026',-10000,{descricao:'SISPAG FORNECEDORES'}),
      bank('05/03/2026',-45.90,{descricao:'TARIFA PACOTE SERVICOS'}),
      report('05/03/2026',-5000,{descricao:'FORNECEDOR JOAO',documento:'NF-100'}),
      report('05/03/2026',-5000,{descricao:'FERRO VELHO',documento:'NF-200'}),
      report('05/03/2026',-800,{descricao:'AINDA NAO PAGO',documento:'NF-300'})
    ];
    let x=E.splitPayments(recs,{tolerance:.01});
    x=E.matchDocuments(x.records,{tolerance:.01});
    const by=d=>x.records.find(r=>r.descricao===d);
    eq('o SISPAG agregador não vira lançamento',by('SISPAG FORNECEDORES').posting,'agregador');
    eq('os dois fornecedores viram lançamento',[by('FORNECEDOR JOAO').contabilizavel,by('FERRO VELHO').contabilizavel],[true,true]);
    eq('a tarifa, que só existe no extrato, vira lançamento',by('TARIFA PACOTE SERVICOS').posting,'lancamento');
    eq('item sem contrapartida no extrato fica pendente',by('AINDA NAO PAGO').posting,'pendencia');
    eq('a tarifa não herda nota fiscal de terceiro',by('TARIFA PACOTE SERVICOS').documento,'');

    const rec=E.reconcileTotals(x.records,{tolerance:.01});
    eq('o total contabilizado bate com o extrato',rec.confere,true);
    eq('diferença zerada',rec.diferenca,0);
    eq('uma pendência registrada',rec.pendencias,1);

    const contas=E.applyAccounts(x.records,{rules:[
      {keyword:'joao',debit:'2.1.01.001',credit:'1.1.01.002'},
      {keyword:'ferro velho',debit:'2.1.01.002',credit:'1.1.01.002'},
      {keyword:'tarifa',debit:'4.1.01.005',credit:'1.1.01.002'}]});
    const hist=E.generateHistory(contas,{template:'PAG {descricao}',client:'ACME'});
    const val=E.validate(hist);
    eq('pendência não vira erro de conta ausente',val.find(r=>r.descricao==='AINDA NAO PAGO').validationStatus,'pendente');
    eq('o agregador também não vira erro',val.find(r=>r.descricao==='SISPAG FORNECEDORES').validationStatus,'pendente');
    const out=E.buildLayout(val,{system:'generico'});
    eq('o arquivo final tem três lançamentos',out.count,3);
    const soma=out.rows.reduce((s,r)=>s+Math.abs(Number(r.valor)),0);
    eq('a soma do arquivo bate com o que saiu da conta',soma.toFixed(2),'10045.90');
    ok('o SISPAG não aparece no arquivo',!out.content.includes('SISPAG'),out.content);
  }
  {
    // Correspondência simples 1 para 1: o mesmo fato não pode ser lançado duas vezes.
    const recs=[
      bank('05/03/2026',-500,{descricao:'PAGTO ACME',documento:'NF-1'}),
      report('05/03/2026',-500,{descricao:'ACME LTDA',documento:'NF-1'})
    ];
    let x=E.splitPayments(recs,{tolerance:.01});
    x=E.matchDocuments(x.records,{tolerance:.01});
    eq('o movimento do extrato vira espelho',x.records.find(r=>r.origem==='banco').posting,'espelho');
    eq('o lançamento sai do relatório',x.records.find(r=>r.origem==='relatorio').posting,'lancamento');
    eq('total contabilizado não duplica',E.reconcileTotals(x.records,{tolerance:.01}).confere,true);
  }
  {
    // Extrato sozinho, sem relatório nenhum: tudo é lançamento.
    let x=E.splitPayments([bank('05/03/2026',-45.90,{descricao:'TARIFA'})],{tolerance:.01});
    x=E.matchDocuments(x.records,{tolerance:.01});
    eq('sem relatório, o extrato é a fonte',x.records[0].posting,'lancamento');
    eq('e o total confere',E.reconcileTotals(x.records,{tolerance:.01}).confere,true);
  }
  {
    // A conferência precisa acusar quando o arquivo não corresponde ao extrato.
    const forjado=[{origem:'banco',valor:-1000,posting:'lancamento'},{origem:'relatorio',valor:-1000,posting:'lancamento'}];
    const rec=E.reconcileTotals(forjado,{tolerance:.01});
    eq('duplicação é detectada',rec.confere,false);
    eq('e a diferença é informada',rec.diferenca,-1000);
  }
  {
    const base={data:'05/03/2026',descricao:'X',valor:10,accountDebit:'1.1',accountCredit:'1.1',history:'H',posting:'lancamento'};
    ok('débito e crédito na mesma conta é erro',E.validate([base])[0].validationErrors.includes('Débito e crédito na mesma conta'));
  }

  suite('matchDocuments');
  {
    const b=bank('05/03/2026',-500,{documento:'NF-1234',descricao:'PAGTO ACME'});
    const r=report('05/03/2026',-500,{documento:'NF-1234',descricao:'PAGTO ACME'});
    const out=E.matchDocuments([b,r],{tolerance:.01});
    eq('documento, valor, data e descrição confirmam',out.matches[0].status,'confirmado');
    eq('confiança máxima',out.matches[0].confidence,100);
    eq('vincula o registro correspondente',out.matches[0].matchedId,r.id);
  }
  {
    const out=E.matchDocuments([bank('05/03/2026',-500),report('05/03/2026',-500)],{tolerance:.01});
    eq('valor e data sem documento pedem revisão',out.matches[0].status,'revisar');
  }
  {
    const out=E.matchDocuments([bank('05/03/2026',-500),report('09/09/2026',-77)],{tolerance:.01});
    eq('sem coincidência não há correspondência',out.matches[0].status,'sem_correspondencia');
    eq('não vincula nada',out.matches[0].matchedId,null);
  }
  {
    const out=E.matchDocuments([bank('05/03/2026',-500,{documento:'NF-1'}),report('05/03/2026',-500,{documento:'NF-1'})],{tolerance:.01});
    eq('propaga o documento para o lançamento',out.records.find(r=>r.origem==='banco').documento,'NF-1');
    eq('marca a etapa percorrida',out.records[0].processedThrough,4);
  }

  suite('applyAccounts');
  {
    const rules=[{keyword:'tarifa',debit:'4.1',credit:'1.1'}];
    const out=E.applyAccounts([{descricao:'TARIFA BANCARIA',documento:''},{descricao:'ALUGUEL',documento:''}],{rules});
    eq('aplica a regra por palavra-chave',out[0].accountDebit,'4.1');
    eq('marca como classificado',out[0].statusAccount,'classificado');
    eq('sem regra fica pendente',out[1].statusAccount,'pendente');
  }
  {
    const out=E.applyAccounts([{descricao:'Tarifa Bancária',documento:''}],{rules:[{keyword:'TARIFA',debit:'4.1',credit:'1.1'}]});
    eq('ignora acentuação e caixa',out[0].statusAccount,'classificado');
  }
  eq('sem regras nada é classificado',E.applyAccounts([{descricao:'X',documento:''}],{}).length,1);

  {
    // A ordem de digitação das regras não pode decidir a classificação.
    const regras=[{keyword:'pagamento',debit:'9.9',credit:'9.9'},{keyword:'pagamento fornecedor',debit:'2.1',credit:'1.1'}];
    eq('a regra mais específica vence, venha na ordem que vier',
      E.applyAccounts([{descricao:'PAGAMENTO FORNECEDOR ACME',documento:''}],{rules:regras})[0].accountRule,'pagamento fornecedor');
    eq('e o mesmo com a ordem invertida',
      E.applyAccounts([{descricao:'PAGAMENTO FORNECEDOR ACME',documento:''}],{rules:[...regras].reverse()})[0].accountRule,'pagamento fornecedor');
    eq('a regra genérica ainda pega o que é só dela',
      E.applyAccounts([{descricao:'PAGAMENTO DIVERSOS',documento:''}],{rules:regras})[0].accountRule,'pagamento');
    eq('regra com palavra-chave vazia é ignorada',
      E.applyAccounts([{descricao:'X',documento:''}],{rules:[{keyword:'  ',debit:'1',credit:'2'}]})[0].statusAccount,'pendente');
  }

  suite('generateHistory');
  {
    const out=E.generateHistory([{descricao:'ACME',documento:'NF-1',data:'05/03/2026',valor:-500}],{template:'PAGAMENTO {descricao} - DOC {documento}',client:'Cliente X'});
    eq('substitui os campos do modelo',out[0].history,'PAGAMENTO ACME - DOC NF-1');
    eq('marca o status',out[0].statusHistory,'gerado');
  }
  eq('remove o traço solto sem documento',E.generateHistory([{descricao:'ACME',documento:'',data:'',valor:0}],{})[0].history,'PAGAMENTO ACME - DOC');
  eq('preenche o cliente',E.generateHistory([{descricao:'X',documento:'',data:'',valor:0}],{template:'{cliente}',client:'ACME'})[0].history,'ACME');

  {
    const longo=E.generateHistory([{descricao:'X'.repeat(400),documento:'NF-1',data:'',valor:0}],{})[0];
    eq('histórico é cortado no limite padrão',longo.history.length,255);
    eq('e o corte é sinalizado',longo.historyTruncated,true);
    const curto=E.generateHistory([{descricao:'ACME',documento:'NF-1',data:'',valor:0}],{})[0];
    eq('histórico dentro do limite não é marcado',curto.historyTruncated,false);
    eq('limite configurável',E.generateHistory([{descricao:'X'.repeat(400),documento:'',data:'',valor:0}],{maxLength:40})[0].history.length,40);
  }

  suite('validate');
  {
    const base={data:'05/03/2026',descricao:'X',valor:10,accountDebit:'1',accountCredit:'2',history:'H'};
    eq('lançamento completo é válido',E.validate([base])[0].validationStatus,'valido');
    eq('sem data é erro',E.validate([{...base,data:''}])[0].validationStatus,'erro');
    eq('valor zero é erro',E.validate([{...base,valor:0}])[0].validationStatus,'erro');
    eq('sem conta de débito é erro',E.validate([{...base,accountDebit:''}])[0].validationStatus,'erro');
    eq('sem histórico é erro',E.validate([{...base,history:''}])[0].validationStatus,'erro');
    // Duplicidade só é apontada com documento repetido: duas tarifas de mesmo
    // valor no mesmo dia são normais e não podem virar aviso.
    const comDoc={...base,documento:'NF-77'};
    const dup=E.validate([comDoc,{...comDoc}]);
    eq('primeira ocorrência passa',dup[0].validationStatus,'valido');
    eq('mesmo documento, data e valor vira aviso',dup[1].validationStatus,'aviso');
    ok('e o aviso diz o que houve',dup[1].validationWarnings.some(w=>/Documento já lançado/.test(w)),dup[1].validationWarnings.join(' | '));
    const semDoc=E.validate([{...base,descricao:'TARIFA TED',valor:-15,documento:''},{...base,descricao:'TARIFA TED',valor:-15,documento:''}]);
    eq('sem documento não há falso positivo',semDoc[1].validationStatus,'valido');
    const outroValor=E.validate([comDoc,{...comDoc,valor:99}]);
    eq('mesmo documento com valor diferente não é duplicidade',outroValor[1].validationStatus,'valido');
    eq('avisos anteriores são mantidos',E.validate([{...base,issues:['Data não reconhecida']}])[0].validationWarnings.includes('Data não reconhecida'),true);
    // Competência: um lançamento de outro mês no arquivo é erro clássico de
    // fechamento e passava despercebido.
    const fora=E.validate([{...base,data:'15/11/2025'}],{period:'2026-03'});
    eq('data fora da competência vira aviso',fora[0].validationStatus,'aviso');
    ok('e o aviso nomeia a competência',fora[0].validationWarnings.some(w=>w.includes('03/2026')),fora[0].validationWarnings.join(' | '));
    eq('data dentro da competência passa',E.validate([{...base,data:'15/03/2026'}],{period:'2026-03'})[0].validationStatus,'valido');
    eq('sem competência definida não há aviso',E.validate([{...base,data:'15/11/2025'}])[0].validationStatus,'valido');
    eq('histórico cortado vira aviso',E.validate([{...base,historyTruncated:true}])[0].validationWarnings.some(w=>/cortado/.test(w)),true);
  }

  suite('buildLayout');
  {
    const recs=[
      {data:'05/03/2026',accountDebit:'1',accountCredit:'2',valor:-1234.5,history:'H1',documento:'NF-1',validationStatus:'valido'},
      {data:'06/03/2026',accountDebit:'1',accountCredit:'2',valor:10,history:'H2',documento:'',validationStatus:'aviso'},
      {data:'07/03/2026',accountDebit:'',accountCredit:'',valor:0,history:'',documento:'',validationStatus:'erro'}
    ];
    const out=E.buildLayout(recs,{system:'generico'});
    eq('exclui os registros com erro',out.count,2);
    eq('cabeçalho genérico',out.content.split('\r\n')[0].replace('﻿',''),'DATA;DEBITO;CREDITO;VALOR;HISTORICO;DOCUMENTO');
    eq('valor exportado é sempre positivo',out.content.split('\r\n')[1].split(';')[3],'1234,50');
    ok('arquivo começa com BOM',out.content.charCodeAt(0)===0xFEFF);
    eq('cabeçalho Alterdata',E.buildLayout(recs,{system:'alterdata'}).content.split('\r\n')[0].replace('﻿',''),'DT_LCTO;CTA_DEBITO;CTA_CREDITO;VLR_LCTO;HISTORICO;NR_DOCUMENTO');
    eq('sistema desconhecido cai no genérico',E.buildLayout(recs,{system:'inexistente'}).content.split('\r\n')[0].replace('﻿',''),'DATA;DEBITO;CREDITO;VALOR;HISTORICO;DOCUMENTO');
    const quoted=E.buildLayout([{...recs[0],history:'A;B "C"'}],{system:'generico'});
    ok('escapa ponto e vírgula e aspas',quoted.content.includes('"A;B ""C"""'),quoted.content);
  }

  suite('encadeamento 03 → 08');
  {
    const recs=[bank('05/03/2026',-300,{descricao:'PAGTO FORNECEDOR',documento:'NF-9'}),report('05/03/2026',-100,{descricao:'FORNECEDOR A'}),report('05/03/2026',-200,{descricao:'FORNECEDOR B'})];
    const s3=E.splitPayments(recs,{tolerance:.01});
    const s4=E.matchDocuments(s3.records,{tolerance:.01});
    const s5=E.applyAccounts(s4.records,{rules:[{keyword:'fornecedor',debit:'2.1',credit:'1.1'}]});
    const s6=E.generateHistory(s5,{template:'PAGAMENTO {descricao} - DOC {documento}',client:'ACME'});
    const s7=E.validate(s6);
    const s8=E.buildLayout(s7,{system:'dominio'});
    eq('a contagem de lançamentos se mantém',s7.length,3);
    eq('campos do processo 03 sobrevivem até o fim',s7[0].splitStatus,'desmembrado');
    eq('campos do processo 05 sobrevivem até o fim',s7[0].accountDebit,'2.1');
    ok('layout final tem lançamentos',s8.count>0,'count='+s8.count);
    ok('cada linha do CSV traz as contas',s8.content.split('\r\n').slice(1).every(l=>l.split(';')[1]==='2.1'),s8.content);
  }
};
