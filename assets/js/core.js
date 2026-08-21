(function(){
  const KEY='contabil-flow:v2';
  const empty=()=>({version:2,activeLotId:null,lots:{},preferences:{pageSize:50}});
  function uid(prefix='id'){return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)}
  function load(){try{const parsed=JSON.parse(localStorage.getItem(KEY));if(parsed?.version!==2)return empty();Object.values(parsed.lots||{}).forEach(lot=>{lot.processResults=lot.processResults||{};lot.configs=lot.configs||{};lot.audit=lot.audit||[];lot.steps=lot.steps||{1:'pending',2:'pending',3:'pending',4:'pending',5:'pending',6:'pending',7:'pending',8:'pending'}});return parsed}catch{return empty()}}
  let state=load();
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));window.dispatchEvent(new CustomEvent('contabil:save',{detail:{at:new Date().toISOString()}}));return true}catch{window.dispatchEvent(new CustomEvent('contabil:storage-error'));return false}}
  function createLot(data={}){const id=uid('lote'),now=new Date().toISOString();state.lots[id]={id,client:data.client||'',period:data.period||'',bank:data.bank||'',account:data.account||'',system:data.system||'',createdAt:now,updatedAt:now,currentStep:1,steps:{1:'in_progress',2:'pending',3:'pending',4:'pending',5:'pending',6:'pending',7:'pending',8:'pending'},records:[],dailyClosing:[],processResults:{},configs:{},audit:[{id:uid('aud'),at:now,action:'Lote criado',detail:'Contexto inicial registrado'}],templates:{}};state.activeLotId=id;persist();return state.lots[id]}
  function active(){return state.activeLotId?state.lots[state.activeLotId]||null:null}
  function ensure(){return active()||createLot({client:'Novo cliente',period:new Date().toISOString().slice(0,7)})}
  function updateLot(data){const lot=ensure();Object.assign(lot,data,{updatedAt:new Date().toISOString()});addAudit('Contexto atualizado','Dados gerais do lote foram salvos',false);persist();return lot}
  function addAudit(action,detail='',save=true){const lot=ensure();lot.audit.unshift({id:uid('aud'),at:new Date().toISOString(),action,detail});lot.audit=lot.audit.slice(0,100);if(save)persist()}
  function setRecords(records,source){if(records.length>10000)throw new Error('O lote excede o limite local de 10.000 registros. Divida o processamento.');const lot=ensure();lot.records=records;lot.steps[1]='complete';lot.currentStep=Math.max(lot.currentStep,2);lot.updatedAt=new Date().toISOString();addAudit('Normalização salva',records.length+' registros · '+source,false);if(!persist())throw new Error('Não foi possível salvar o lote neste dispositivo. Exporte o CSV para preservar o resultado.')}
  function setClosing(rows){const lot=ensure();lot.dailyClosing=rows;lot.steps[2]=rows.some(r=>r.status==='divergente')?'warning':'complete';lot.currentStep=Math.max(lot.currentStep,3);addAudit('Fechamento diário executado',rows.length+' datas analisadas',false);persist()}
  function setProcessResult(step,result,status='complete',config={}){const lot=ensure();lot.processResults=lot.processResults||{};lot.configs=lot.configs||{};lot.processResults[step]=result;lot.configs[step]=config;lot.steps[step]=status;lot.currentStep=Math.max(lot.currentStep,Math.min(8,Number(step)+1));lot.updatedAt=new Date().toISOString();addAudit('Processo '+String(step).padStart(2,'0')+' executado',Array.isArray(result)?result.length+' resultado(s)':'Resultado salvo',false);if(!persist())throw new Error('Não foi possível salvar o resultado neste dispositivo.');return result}
  function setStep(step,status){const lot=ensure();lot.steps[step]=status;lot.currentStep=Math.max(lot.currentStep,step);persist()}
  function switchLot(id){if(state.lots[id]){state.activeLotId=id;persist();return state.lots[id]}}
  function removeLot(id){delete state.lots[id];if(state.activeLotId===id)state.activeLotId=Object.keys(state.lots)[0]||null;persist()}
  function listLots(){return Object.values(state.lots).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}
  function saveTemplate(name,value){const lot=ensure();lot.templates[name]=value;persist()}
  function getTemplate(name){return ensure().templates[name]}
  window.ContabilStore={uid,active,ensure,createLot,updateLot,addAudit,setRecords,setClosing,setProcessResult,setStep,switchLot,removeLot,listLots,saveTemplate,getTemplate,get state(){return state}};
})();
