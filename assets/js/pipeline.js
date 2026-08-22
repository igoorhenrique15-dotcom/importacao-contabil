(function(){
  // O estado gravado no navegador guarda apenas a entrada: os lançamentos
  // normalizados do Processo 01 e a configuração de cada etapa. Tudo o que é
  // derivado — a saída de cada processo — é recalculado sob demanda.
  //
  // Guardar as oito saídas custava 4,3 MB para mil lançamentos e estourava o
  // limite do navegador antes de um mês de trabalho. Guardando só a entrada,
  // dez mil lançamentos ocupam 3,2 MB. Como os motores são rápidos, refazer a
  // cadeia inteira é mais barato do que armazená-la.
  const eng=()=>window.ContabilEngines;
  // Cache por objeto de lote, e não por identificador: dois lotes distintos
  // nunca compartilham entrada, e `rev` distingue as revisões de um mesmo
  // lote — `updatedAt` tem resolução de milissegundo e duas gravações
  // seguidas podiam devolver o resultado anterior.
  let cache=new WeakMap();
  function bucket(lot){if(!cache.has(lot))cache.set(lot,new Map());return cache.get(lot)}
  function chave(lot,step){return step+':'+(lot.rev??lot.updatedAt??'')}
  // Saída da etapa pedida, pronta para servir de entrada à seguinte.
  function upTo(lot,step){
    if(step<=1)return lot.records||[];
    const b=bucket(lot),k=chave(lot,step);
    if(b.has(k))return b.get(k);
    const anterior=upTo(lot,step-1);
    let saida=anterior;
    const cfg=lot.configs?.[step]||{};
    if(step===2)saida=eng().closeDaily(anterior,cfg).records;
    if(step===3)saida=eng().splitPayments(anterior,cfg).records;
    if(step===4)saida=eng().matchDocuments(anterior,cfg).records;
    if(step===5)saida=eng().applyAccounts(anterior,cfg);
    if(step===6)saida=eng().generateHistory(anterior,cfg);
    if(step===7)saida=eng().validate(anterior);
    b.set(k,saida);
    return saida;
  }
  // Resultado completo de uma etapa, com os extras que a tela precisa
  // (as correspondências do 03 e do 04, o resumo por data do 02).
  function resultOf(lot,step){
    const entrada=upTo(lot,step-1),cfg=lot.configs?.[step]||{};
    if(step===2)return eng().closeDaily(entrada,cfg);
    if(step===3)return eng().splitPayments(entrada,cfg);
    if(step===4)return eng().matchDocuments(entrada,cfg);
    if(step===8)return eng().buildLayout(upTo(lot,7),cfg);
    return upTo(lot,step);
  }
  function clear(){cache=new WeakMap()}
  window.ContabilPipeline={upTo,resultOf,clear};
})();
