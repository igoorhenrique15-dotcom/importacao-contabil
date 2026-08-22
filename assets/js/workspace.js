(function(){
  if(!window.ContabilStore)return;
  const store=window.ContabilStore,lot=store.ensure(),main=document.querySelector('main');
  document.body.insertAdjacentHTML('afterbegin','<a class="skip-link" href="#main-content">Pular para o conteúdo</a>');
  if(main&&!main.id)main.id='main-content';
  const shell=document.querySelector('.shell');
  if(!shell)return;
  const topbar=shell.querySelector('.topbar');
  const bar=document.createElement('section');bar.className='lot-bar';bar.setAttribute('aria-label','Contexto do lote');bar.innerHTML=lotMarkup(lot);
  (topbar?topbar.after(bar):shell.prepend(bar));
  const backup=document.createElement('div');backup.className='modal-backdrop';backup.id='backup-modal';
  backup.innerHTML='<section class="lot-modal" role="dialog" aria-modal="true" aria-labelledby="backup-title">'
    +'<div class="modal-head"><div><span class="step-label">CÓPIA DE SEGURANÇA</span><h2 id="backup-title">Backup do lote</h2>'
    +'<p class="helper">Tudo fica neste navegador. Limpar os dados do site ou trocar de computador apaga o trabalho — o backup é a única forma de levá-lo junto.</p></div>'
    +'<button class="icon-button" type="button" data-close-backup aria-label="Fechar">×</button></div>'
    +'<div class="privacy-note"><b>!</b><span>O arquivo de backup contém os lançamentos do cliente. Guarde-o com o mesmo cuidado dos arquivos originais e não o envie para o repositório.</span></div>'
    +'<div id="backup-status" class="notice" role="status" aria-live="polite">Exporte antes de fechar o mês ou de limpar o navegador.</div>'
    +'<div class="modal-actions"><label class="button secondary" for="import-lot">Importar backup</label>'
    +'<input id="import-lot" type="file" accept="application/json,.json" hidden>'
    +'<button type="button" data-export-lot>Exportar este lote</button></div></section>';
  document.body.appendChild(backup);
  const modal=document.createElement('div');modal.className='modal-backdrop';modal.id='lot-modal';modal.innerHTML=modalMarkup(lot);modal.querySelector('.lot-modal').insertAdjacentHTML('beforeend',auditMarkup(lot));document.body.appendChild(modal);
  bind();
  bindBackup();
  renderProgress();
  window.addEventListener('contabil:save',e=>{const el=document.querySelector('.save-state');if(el){el.textContent='Salvo agora';setTimeout(()=>el.textContent='Salvamento automático',1800)}});
  function lotMarkup(x){const initials=(x.client||'NC').split(/\s+/).slice(0,2).map(v=>v[0]).join('').toUpperCase();return '<div class="lot-info"><span class="lot-avatar">'+esc(initials)+'</span><div class="lot-copy"><strong>'+esc(x.client||'Novo cliente')+'</strong><div class="lot-meta"><span>'+esc(formatPeriod(x.period))+'</span><span>'+esc(x.bank||'Banco não informado')+'</span><span>'+esc(x.system||'Sistema não informado')+'</span></div></div></div><div class="lot-actions"><span class="save-state">Salvamento automático</span>'+lotPicker(x)+'<button class="compact ghost" type="button" data-backup>Backup</button><button class="compact ghost" type="button" data-edit-lot>Editar lote</button></div>'}
  function lotPicker(atual){
    const lotes=store.listLots();
    return'<select class="lot-select" data-switch-lot aria-label="Lote em edição">'
      +lotes.map(l=>'<option value="'+esc(l.id)+'"'+(l.id===atual.id?' selected':'')+'>'+esc((l.client||'Sem cliente')+' · '+formatPeriod(l.period))+'</option>').join('')
      +'<option value="__novo__">+ Novo lote</option></select>';
  }
  function modalMarkup(x){return '<section class="lot-modal" role="dialog" aria-modal="true" aria-labelledby="lot-title"><div class="modal-head"><div><span class="step-label">CONTEXTO DO TRABALHO</span><h2 id="lot-title">Dados do lote</h2><p class="helper">Essas informações acompanham todas as etapas e ficam somente neste dispositivo.</p></div><button class="icon-button" type="button" data-close-modal aria-label="Fechar">×</button></div><form id="lot-form"><div class="form-grid"><div class="form-field full-field"><label for="lot-client">Empresa ou cliente</label><input id="lot-client" name="client" required value="'+attr(x.client)+'"></div><div class="form-field"><label for="lot-period">Competência</label><input id="lot-period" name="period" type="month" required value="'+attr(x.period)+'"></div><div class="form-field"><label for="lot-bank">Banco</label><input id="lot-bank" name="bank" value="'+attr(x.bank)+'" placeholder="Ex.: Itaú"></div><div class="form-field"><label for="lot-account">Conta</label><input id="lot-account" name="account" value="'+attr(x.account)+'" placeholder="Agência e conta"></div><div class="form-field"><label for="lot-system">Sistema contábil</label><select id="lot-system" name="system"><option value="">Selecione</option>'+['Domínio','Alterdata','Prosoft','Sage','Contmatic','Outro'].map(v=>'<option '+(x.system===v?'selected':'')+'>'+v+'</option>').join('')+'</select></div></div><div class="privacy-note" style="margin-top:18px"><b>✓</b><span>Os dados e arquivos continuam processados localmente. Nenhuma informação contábil é enviada para servidores nesta versão.</span></div><div class="modal-actions"><button type="button" class="secondary" data-close-modal>Cancelar</button><button type="submit">Salvar contexto</button></div></form></section>'}
  function bind(){document.querySelector('[data-edit-lot]').addEventListener('click',open);modal.querySelectorAll('[data-close-modal]').forEach(x=>x.addEventListener('click',close));modal.addEventListener('click',e=>{if(e.target===modal)close()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('open'))close()});modal.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));store.updateLot(data);bar.innerHTML=lotMarkup(store.active());bindBar();close();renderProgress()});bindBar()}
  function bindBar(){
    bar.querySelector('[data-edit-lot]').addEventListener('click',open);
    bar.querySelector('[data-backup]').addEventListener('click',()=>{backup.classList.add('open');setTimeout(()=>backup.querySelector('[data-export-lot]').focus(),20)});
    bar.querySelector('[data-switch-lot]').addEventListener('change',e=>{
      const valor=e.target.value;
      if(valor==='__novo__'){store.createLot({client:'Novo cliente',period:new Date().toISOString().slice(0,7)})}
      else store.switchLot(valor);
      location.reload();
    });
  }
  function bindBackup(){
    backup.querySelectorAll('[data-close-backup]').forEach(b=>b.addEventListener('click',fecharBackup));
    backup.addEventListener('click',e=>{if(e.target===backup)fecharBackup()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&backup.classList.contains('open'))fecharBackup()});
    backup.querySelector('[data-export-lot]').addEventListener('click',()=>{
      const dados=store.exportLot();if(!dados)return;
      const atual=store.active();
      const nome='lote-'+slug(atual.client||'sem-cliente')+'-'+(atual.period||'sem-competencia')+'.json';
      const blob=new Blob([JSON.stringify(dados,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=nome;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      store.addAudit('Backup exportado',(atual.records||[]).length+' lançamento(s)');
      avisoBackup('Backup salvo como '+nome,'ok');
    });
    backup.querySelector('#import-lot').addEventListener('change',async e=>{
      const arquivo=e.target.files[0];if(!arquivo)return;
      e.target.value='';
      if(arquivo.size>20*1024*1024){avisoBackup('O arquivo excede 20 MB.','error');return}
      try{
        const lote=store.importLot(JSON.parse(await arquivo.text()));
        avisoBackup('Lote “'+lote.client+'” importado com '+lote.records.length+' lançamento(s). Recarregando…','ok');
        setTimeout(()=>location.reload(),900);
      }catch(err){avisoBackup(err instanceof SyntaxError?'O arquivo não é um JSON válido.':err.message,'error')}
    });
  }
  function fecharBackup(){backup.classList.remove('open');bar.querySelector('[data-backup]')?.focus()}
  function avisoBackup(texto,tipo=''){const el=backup.querySelector('#backup-status');el.textContent=texto;el.className=('notice '+tipo).trim()}
  function slug(v){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'lote'}
  function open(){modal.classList.add('open');setTimeout(()=>modal.querySelector('input').focus(),20)}
  function close(){modal.classList.remove('open');bar.querySelector('[data-edit-lot]').focus()}
  function renderProgress(){let existing=shell.querySelector('.workflow-progress');if(existing)existing.remove();const step=Number(document.body.dataset.process||0);if(!step)return;const current=store.active();const done=Object.values(current.steps).filter(x=>x==='complete'||x==='warning').length;const progress=document.createElement('section');progress.className='workflow-progress';progress.innerHTML='<div class="workflow-progress-head"><span>Progresso do lote</span><strong>'+done+' de 8 etapas concluídas</strong></div><div class="workflow-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="8" aria-valuenow="'+done+'"><i style="width:'+(done/8*100)+'%"></i></div>';bar.after(progress)}
  function auditMarkup(x){return '<section style="margin-top:24px"><span class="step-label">ATIVIDADE RECENTE</span><div class="audit-list">'+(x.audit||[]).slice(0,5).map(a=>'<div class="audit-item"><span>✓</span><div><strong>'+esc(a.action)+'</strong><div class="helper">'+esc(a.detail)+'</div></div><time>'+new Date(a.at).toLocaleString('pt-BR')+'</time></div>').join('')+'</div></section>'}
  function formatPeriod(v){if(!v)return'Competência não informada';const [y,m]=v.split('-');return m&&y?m+'/'+y:v}
  function esc(v){return String(v||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
  function attr(v){return esc(v).replace(/'/g,'&#39;')}
})();
