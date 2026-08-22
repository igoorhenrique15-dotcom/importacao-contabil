const {loadBrowserModules,suite,eq,ok}=require('./harness');
// O módulo referencia DOMParser e DecompressionStream apenas dentro das
// funções que leem o arquivo; as puras rodam sem navegador.
const X=loadBrowserModules('assets/js/xlsx.js').ContabilXlsx;

module.exports=function(){
  suite('XLSX — datas seriais');
  eq('primeiro dia da contagem',X.serialParaData(1),'01/01/1900');
  eq('véspera do dia fantasma',X.serialParaData(59),'28/02/1900');
  // O serial 60 é o 29/02/1900, dia que nunca existiu: o Excel o mantém por
  // compatibilidade e a contagem fica um dia adiantada a partir dali.
  eq('o 29/02/1900 fantasma não vira data inválida',X.serialParaData(60),'28/02/1900');
  eq('depois do fantasma a contagem alinha',X.serialParaData(61),'01/03/1900');
  eq('data recente',X.serialParaData(45658),'01/01/2025');
  eq('outra data recente',X.serialParaData(46081),'28/02/2026');
  eq('virada de mês',X.serialParaData(46082),'01/03/2026');
  eq('serial zero não é data',X.serialParaData(0),null);
  eq('serial negativo não é data',X.serialParaData(-5),null);
  eq('serial absurdo não é data',X.serialParaData(9999999),null);
  eq('texto não é data',X.serialParaData(NaN),null);

  suite('XLSX — referências de célula');
  eq('primeira coluna',X.indiceDaColuna('A1'),0);
  eq('segunda coluna',X.indiceDaColuna('B2'),1);
  eq('última de uma letra',X.indiceDaColuna('Z9'),25);
  eq('primeira de duas letras',X.indiceDaColuna('AA1'),26);
  eq('segunda de duas letras',X.indiceDaColuna('AB1'),27);
  eq('coluna distante',X.indiceDaColuna('BA1'),52);
  eq('linha alta não confunde',X.indiceDaColuna('C1048576'),2);
  eq('referência inválida',X.indiceDaColuna('123'),-1);
  eq('referência vazia',X.indiceDaColuna(''),-1);
};
