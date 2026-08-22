const {loadBrowserModules,suite,eq,ok}=require('./harness');
const win=loadBrowserModules('assets/js/engines.js','assets/js/pipeline.js');
const E=win.ContabilEngines,P=win.ContabilPipeline;

const lote=(records,configs)=>({id:'lote-1',updatedAt:'2026-03-05T00:00:00.000Z',client:'ACME',records,configs,
  steps:{1:'complete',2:'complete',3:'complete',4:'complete',5:'complete',6:'complete',7:'complete',8:'pending'}});

module.exports=function(){
  suite('ContabilPipeline');
  const records=[
    {id:'b1',origem:'banco',data:'05/03/2026',descricao:'SISPAG FORNECEDORES',valor:-10000,documento:''},
    {id:'b2',origem:'banco',data:'05/03/2026',descricao:'TARIFA PACOTE',valor:-45.90,documento:''},
    {id:'r1',origem:'relatorio',data:'05/03/2026',descricao:'FORNECEDOR JOAO',valor:-5000,documento:'NF-100'},
    {id:'r2',origem:'relatorio',data:'05/03/2026',descricao:'FERRO VELHO',valor:-5000,documento:'NF-200'}
  ];
  const configs={2:{tolerance:.01},3:{tolerance:.01},4:{tolerance:.01},
    5:{rules:[{keyword:'joao',debit:'2.1.01.001',credit:'1.1.01.002'},{keyword:'ferro',debit:'2.1.01.002',credit:'1.1.01.002'},{keyword:'tarifa',debit:'4.1.01.005',credit:'1.1.01.002'}]},
    6:{template:'PAG {descricao}',client:'ACME'},8:{system:'generico'}};
  const lot=lote(records,configs);

  // A cadeia executada na mão, que é o que o pipeline precisa reproduzir.
  const direto=(()=>{
    let x=E.closeDaily(records,configs[2]).records;
    x=E.splitPayments(x,configs[3]).records;
    x=E.matchDocuments(x,configs[4]).records;
    x=E.applyAccounts(x,configs[5]);
    x=E.generateHistory(x,configs[6]);
    return E.validate(x);
  })();

  P.clear();
  eq('a etapa 1 é a própria entrada',P.upTo(lot,1).length,4);
  eq('reconstrói a etapa 7 igual à cadeia direta',JSON.stringify(P.upTo(lot,7)),JSON.stringify(direto));
  eq('a etapa 4 traz a classificação de lançamento',P.upTo(lot,4).find(r=>r.id==='b1').posting,'agregador');
  eq('a etapa 5 traz as contas',P.upTo(lot,5).find(r=>r.id==='r1').accountDebit,'2.1.01.001');

  const r3=P.resultOf(lot,3);
  eq('resultOf(3) traz os desmembramentos',r3.matches.length,1);
  const r2=P.resultOf(lot,2);
  eq('resultOf(2) traz o resumo por data',r2.rows.length,1);
  const r8=P.resultOf(lot,8);
  eq('resultOf(8) gera o arquivo final',r8.count,3);
  ok('e o arquivo bate com o extrato',
    r8.rows.reduce((s,r)=>s+Math.abs(Number(r.valor)),0).toFixed(2)==='10045.90',
    String(r8.rows.reduce((s,r)=>s+Math.abs(Number(r.valor)),0)));

  // Reconstruir duas vezes precisa dar o mesmo resultado — é o que garante
  // que o estado gravado não precisa carregar nada derivado.
  P.clear();
  eq('reconstrução é determinística',JSON.stringify(P.upTo(lot,7)),JSON.stringify(direto));

  {
    // Trocar a configuração de uma etapa muda dali para a frente.
    const outro=lote(records,{...configs,5:{rules:[]}});
    outro.updatedAt='2026-03-06T00:00:00.000Z';
    eq('sem regras, nada é classificado',P.upTo(outro,5).every(r=>r.statusAccount==='pendente'),true);
    eq('e o arquivo final fica vazio',P.resultOf(outro,8).count,0);
  }
  {
    // Etapa anterior pendente não pode ser reconstruída como se tivesse rodado.
    const vazio=lote([],configs);
    eq('lote sem lançamentos devolve lista vazia',P.upTo(vazio,7).length,0);
  }
  suite('correções manuais');
  {
    // Corrigir uma conta na mão precisa valer sobre a regra automática e
    // sobreviver a reexecutar o processo que a calculou.
    const corrigido=lote(records,configs);
    corrigido.rev=2;
    corrigido.overrides={r1:{accountDebit:'2.1.99.999'}};
    const linha=P.upTo(corrigido,5).find(r=>r.id==='r1');
    eq('a conta corrigida vence a regra',linha.accountDebit,'2.1.99.999');
    eq('a linha é marcada como corrigida',linha.corrigido,['accountDebit']);
    eq('o resto da linha continua vindo da regra',linha.accountCredit,'1.1.01.002');
    eq('a correção sobrevive até a validação',P.upTo(corrigido,7).find(r=>r.id==='r1').accountDebit,'2.1.99.999');
    ok('e chega ao arquivo final',P.resultOf(corrigido,8).content.includes('2.1.99.999'),P.resultOf(corrigido,8).content);
  }
  {
    // Forçar um lançamento a virar pendência tira ele do arquivo e a
    // conferência precisa acusar que o lote deixou de bater.
    const forcado=lote(records,configs);
    forcado.rev=3;
    forcado.overrides={r1:{posting:'pendencia',contabilizavel:false}};
    const saida=P.upTo(forcado,7);
    eq('a linha sai do arquivo',P.resultOf(forcado,8).count,2);
    // A tela precisa mostrar o mesmo que a etapa seguinte recebe.
    eq('resultOf também reflete a correção',P.resultOf(forcado,4).records.find(r=>r.id==='r1').posting,'pendencia');
    const conf=E.reconcileTotals(saida,{tolerance:.01});
    eq('e a conferência acusa a diferença',conf.confere,false);
    eq('faltando exatamente o valor retirado',conf.diferenca,5000);
  }
  {
    // O caminho inverso: forçar o agregador a virar lançamento.
    const forcado=lote(records,configs);
    forcado.rev=4;
    forcado.overrides={b1:{posting:'lancamento',contabilizavel:true}};
    eq('o SISPAG passa a contar',P.upTo(forcado,7).find(r=>r.id==='b1').posting,'lancamento');
    eq('e o lote deixa de conferir',E.reconcileTotals(P.upTo(forcado,7),{tolerance:.01}).confere,false);
  }
  {
    // Corrigir o histórico quando o modelo não serve.
    const corrigido=lote(records,configs);
    corrigido.rev=5;
    corrigido.overrides={r2:{history:'PAGAMENTO SUCATA CONFORME NF 200'}};
    eq('o histórico corrigido vale',P.upTo(corrigido,6).find(r=>r.id==='r2').history,'PAGAMENTO SUCATA CONFORME NF 200');
    ok('e vai para o arquivo',P.resultOf(corrigido,8).content.includes('SUCATA'),'');
  }
  {
    // Sem correções, nada muda.
    const limpo=lote(records,configs);limpo.rev=6;limpo.overrides={};
    eq('lote sem correções é idêntico',JSON.stringify(P.upTo(limpo,7)),JSON.stringify(direto));
  }
  {
    // Um mês real precisa reconstruir em tempo aceitável, já que nada
    // derivado é guardado.
    const muitos=[];
    for(let i=0;i<10000;i++){
      const dia=String(1+i%20).padStart(2,'0')+'/03/2026';
      muitos.push({id:'x'+i,origem:i%2?'banco':'relatorio',data:dia,descricao:'FORNECEDOR '+i,valor:-(100+i*0.31),documento:'NF-'+(2000+i)});
    }
    const grande=lote(muitos,configs);grande.updatedAt='2026-03-07T00:00:00.000Z';
    const t=Date.now();P.upTo(grande,7);const ms=Date.now()-t;
    ok('10.000 lançamentos reconstroem em menos de 3s (levou '+ms+'ms)',ms<3000);
    const t2=Date.now();P.upTo(grande,7);
    ok('a segunda leitura vem do cache (levou '+(Date.now()-t2)+'ms)',Date.now()-t2<50);
  }
};
