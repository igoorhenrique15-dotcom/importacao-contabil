const {loadBrowserModules,suite,eq,ok}=require('./harness');

// core.js depende de localStorage, CustomEvent e dispatchEvent do navegador.
function freshStore(){
  const data=new Map();
  const win={
    localStorage:{getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)},
    CustomEvent:class{constructor(type,init){this.type=type;Object.assign(this,init)}},
    addEventListener(){},dispatchEvent(){return true}
  };
  const fs=require('fs'),path=require('path');
  new Function('window','localStorage','CustomEvent',fs.readFileSync(path.join(__dirname,'..','assets/js/core.js'),'utf8'))(win,win.localStorage,win.CustomEvent);
  return{store:win.ContabilStore,raw:data};
}
const rec=(i,origem='banco')=>({id:'r'+i,origem,data:'05/03/2026',descricao:'X'+i,valor:10,debito:0,credito:10,documento:'',status:'valid',issues:[]});

module.exports=function(){
  suite('ContabilStore');
  {
    const {store}=freshStore();
    const lot=store.createLot({client:'ACME',period:'2026-03'});
    eq('lote criado fica ativo',store.active().id,lot.id);
    eq('etapa 1 começa em andamento',lot.steps[1],'in_progress');
    eq('demais etapas começam pendentes',lot.steps[8],'pending');
    ok('trilha registra a criação',lot.audit.length===1,JSON.stringify(lot.audit));
  }
  {
    const {store}=freshStore();
    store.createLot({client:'ACME'});
    store.setRecords([rec(1),rec(2)],'banco');
    eq('normalização conclui a etapa 1',store.active().steps[1],'complete');
    eq('os lançamentos normalizados são guardados',store.active().records.length,2);
  }
  {
    const {store}=freshStore();
    store.createLot({client:'ACME'});
    store.setRecords([rec(1)],'banco');
    store.setClosing([{date:'05/03/2026',status:'conciliado',difference:0}],{tolerance:.01});
    store.setProcessResult(5,[rec(1)],'complete',{rules:[{keyword:'x',debit:'1',credit:'2'}]});
    store.setProcessResult(6,[rec(1)],'complete',{template:'T'});
    eq('etapa 6 concluída',store.active().steps[6],'complete');
    // Reexecutar a etapa 5 precisa invalidar 6, 7 e 8.
    store.setProcessResult(5,[rec(1),rec(2)],'complete',{rules:[]});
    eq('etapa 6 volta a pendente',store.active().steps[6],'pending');
    eq('configuração da etapa 6 é descartada',store.active().configs[6],undefined);
    eq('etapa 5 permanece concluída',store.active().steps[5],'complete');
    eq('a configuração da etapa 5 fica guardada',Array.isArray(store.active().configs[5].rules),true);
  }
  {
    const {store}=freshStore();
    store.createLot({client:'ACME'});
    store.setRecords([rec(1)],'banco');
    store.setProcessResult(4,{records:[rec(1)],matches:[]},'complete',{tolerance:.01});
    // Renormalizar precisa derrubar tudo o que veio depois.
    store.setRecords([rec(1),rec(2)],'banco');
    eq('etapa 4 é invalidada por nova normalização',store.active().steps[4],'pending');
    eq('configuração da etapa 4 é descartada',store.active().configs[4],undefined);
  }
  {
    // O que é derivado não pode ir para o disco: era isso que estourava o
    // limite do navegador antes de um mês de trabalho.
    const {store,raw}=freshStore();
    store.createLot({client:'ACME'});
    store.setRecords([rec(1),rec(2)],'banco');
    store.setProcessResult(5,[rec(1),rec(2)],'complete',{rules:[]});
    const gravado=JSON.parse(raw.get('contabil-flow:v2'));
    const lot=Object.values(gravado.lots)[0];
    eq('resultados derivados não são gravados',lot.processResults,undefined);
    eq('o resumo por data também não',lot.dailyClosing,undefined);
    eq('os lançamentos normalizados são gravados uma vez',lot.records.length,2);
    eq('as configurações são gravadas',typeof lot.configs[5],'object');
  }
  {
    const {store}=freshStore();
    store.createLot({client:'ACME'});
    let erro='';
    try{store.setRecords(new Array(10001).fill(0).map((_,i)=>rec(i)),'banco')}catch(e){erro=e.message}
    ok('recusa mais de 10.000 registros',/10\.000/.test(erro),erro);
  }
  {
    const {store}=freshStore();
    const a=store.createLot({client:'A'}),b=store.createLot({client:'B'});
    eq('dois lotes coexistem',store.listLots().length,2);
    store.switchLot(a.id);
    eq('troca de lote ativo',store.active().client,'A');
    store.removeLot(a.id);
    eq('remoção deixa o outro lote ativo',store.active().id,b.id);
  }
  {
    // Regras de conta acompanham o cliente, nao o lote.
    const {store}=freshStore();
    const regras=[{keyword:'ferro velho',debit:'2.1.01.002',credit:'1.1.01.002'}];
    store.createLot({client:'Metalurgica ACME',period:'2026-03'});
    store.saveClientRules(regras);
    eq('as regras voltam para o mesmo cliente',store.clientRules(),regras);
    store.createLot({client:'Metalurgica ACME',period:'2026-04'});
    eq('e valem no lote do mes seguinte',store.clientRules(),regras);
    store.createLot({client:'Outra Empresa',period:'2026-04'});
    eq('mas nao vazam para outro cliente',store.clientRules(),null);
    store.createLot({client:'  metalurgica acme  ',period:'2026-05'});
    eq('caixa e espaco nao criam cliente novo',store.clientRules(),regras);
  }
  {
    const {store}=freshStore();
    store.createLot({client:'ACME'});
    store.saveTemplate('mapping:banco',{name:'Itaú',mapping:{data:0,valor:2}});
    eq('modelo de mapeamento é recuperado',store.getTemplate('mapping:banco').mapping.valor,2);
  }
  {
    const {store,raw}=freshStore();
    store.createLot({client:'ACME'});
    store.setRecords([rec(1)],'banco');
    ok('estado é gravado na chave versionada',raw.has('contabil-flow:v2'),[...raw.keys()].join(','));
    eq('versão do estado',JSON.parse(raw.get('contabil-flow:v2')).version,2);
  }
  {
    const {store}=freshStore();
    store.createLot({client:'ACME'});
    const antes=store.active().audit.length;
    store.addAudit('Teste','detalhe');
    eq('trilha cresce',store.active().audit.length,antes+1);
    eq('entrada mais recente vem primeiro',store.active().audit[0].action,'Teste');
  }
};
