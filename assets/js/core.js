(function(){
  const KEY='contabil-flow:v2',LIMITE=10000;
  const empty=()=>({version:2,activeLotId:null,lots:{},preferences:{pageSize:50}});
  function uid(prefix='id'){return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)}
  function load(){try{const parsed=JSON.parse(localStorage.getItem(KEY));if(parsed?.version!==2)return empty();Object.values(parsed.lots||{}).forEach(lot=>{delete lot.processResults;delete lot.dailyClosing;lot.configs=lot.configs||{};lot.audit=lot.audit||[];lot.steps=lot.steps||{1:'pending',2:'pending',3:'pending',4:'pending',5:'pending',6:'pending',7:'pending',8:'pending'}});return parsed}catch{return empty()}}
  let state=load();
  // Os resultados de cada etapa nao vao para o disco: sao reconstruidos por
  // ContabilPipeline a partir dos registros normalizados e das configuracoes.
  // Guarda-los custava oito copias do lote e estourava o limite do navegador.
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));window.dispatchEvent(new CustomEvent('contabil:save',{detail:{at:new Date().toISOString()}}));return true}catch{window.dispatchEvent(new CustomEvent('contabil:storage-error'));return false}}
  function createLot(data={}){const id=uid('lote'),now=new Date().toISOString();state.lots[id]={id,client:data.client||'',period:data.period||'',bank:data.bank||'',account:data.account||'',system:data.system||'',createdAt:now,updatedAt:now,rev:1,currentStep:1,steps:{1:'in_progress',2:'pending',3:'pending',4:'pending',5:'pending',6:'pending',7:'pending',8:'pending'},records:[],configs:{},audit:[{id:uid('aud'),at:now,action:'Lote criado',detail:'Contexto inicial registrado'}],templates:{}};state.activeLotId=id;persist();return state.lots[id]}
  function active(){return state.activeLotId?state.lots[state.activeLotId]||null:null}
  function ensure(){return active()||createLot({client:'Novo cliente',period:new Date().toISOString().slice(0,7)})}
  function updateLot(data){const lot=ensure();Object.assign(lot,data,{updatedAt:new Date().toISOString()});addAudit('Contexto atualizado','Dados gerais do lote foram salvos',false);persist();return lot}
  function addAudit(action,detail='',save=true){const lot=ensure();lot.audit.unshift({id:uid('aud'),at:new Date().toISOString(),action,detail});lot.audit=lot.audit.slice(0,100);if(save)persist()}
  function invalidateAfter(lot,step){lot.rev=(lot.rev||0)+1;window.ContabilPipeline?.clear();lot.configs=lot.configs||{};for(let i=Number(step)+1;i<=8;i++){delete lot.configs[i];lot.steps[i]='pending'}lot.currentStep=Math.min(8,Number(step)+1)}
  function setRecords(records,source){if(records.length>LIMITE)throw new Error('O lote excede o limite local de '+LIMITE.toLocaleString('pt-BR')+' registros. Divida o processamento.');const lot=ensure();lot.records=records;invalidateAfter(lot,1);lot.steps[1]='complete';lot.updatedAt=new Date().toISOString();addAudit('Normalização salva',records.length+' registros · '+source,false);if(!persist())throw new Error('Não foi possível salvar o lote neste dispositivo. Exporte o CSV para preservar o resultado.')}
  function setClosing(rows,config={}){const lot=ensure();invalidateAfter(lot,2);lot.configs[2]=config;lot.steps[2]=rows.some(r=>r.status==='divergente'||r.status==='incompleto')?'warning':'complete';addAudit('Fechamento diário executado',rows.length+' datas analisadas',false);if(!persist())throw new Error('Não foi possível salvar o fechamento neste dispositivo.')}
  function setProcessResult(step,result,status='complete',config={}){const lot=ensure();lot.configs=lot.configs||{};invalidateAfter(lot,step);lot.configs[step]=config;lot.steps[step]=status;lot.updatedAt=new Date().toISOString();const count=Array.isArray(result)?result.length:Array.isArray(result?.records)?result.records.length:'Resultado';addAudit('Processo '+String(step).padStart(2,'0')+' executado',count+(typeof count==='number'?' lançamento(s) transformado(s)':''),false);if(!persist())throw new Error('Não foi possível salvar o resultado neste dispositivo.');return result}
  function setStep(step,status){const lot=ensure();lot.steps[step]=status;lot.currentStep=Math.max(lot.currentStep,step);persist()}
  function switchLot(id){if(state.lots[id]){state.activeLotId=id;persist();return state.lots[id]}}
  function removeLot(id){delete state.lots[id];if(state.activeLotId===id)state.activeLotId=Object.keys(state.lots)[0]||null;persist()}
  function listLots(){return Object.values(state.lots).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}
  function saveTemplate(name,value){const lot=ensure();lot.templates[name]=value;persist()}
  function getTemplate(name){return ensure().templates[name]}
  window.ContabilStore={uid,active,ensure,createLot,updateLot,addAudit,setRecords,setClosing,setProcessResult,setStep,switchLot,removeLot,listLots,saveTemplate,getTemplate,get state(){return state}};
})();
