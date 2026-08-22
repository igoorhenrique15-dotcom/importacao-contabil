const fs=require('fs'),path=require('path');
const {suite,check,eq,ok}=require('./harness');
const root=path.join(__dirname,'..');
const htmlFiles=['index.html',...fs.readdirSync(path.join(root,'processos')).map(d=>path.join('processos',d,'index.html'))];
const jsFiles=fs.readdirSync(path.join(root,'assets/js')).map(f=>path.join('assets/js',f))
  .concat(['processos/01-normalizacao/app.js','processos/02-fechamento/app.js']);

module.exports=function(){
  suite('sintaxe dos scripts');
  jsFiles.forEach(f=>{
    let erro='';
    try{new Function(fs.readFileSync(path.join(root,f),'utf8'))}catch(e){erro=e.message}
    check(f+' compila',!erro,erro);
  });

  suite('referências das páginas');
  htmlFiles.forEach(f=>{
    const html=fs.readFileSync(path.join(root,f),'utf8'),dir=path.dirname(path.join(root,f));
    const refs=[...html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)].map(m=>m[1])
      .filter(r=>!/^(https?:|mailto:|data:)/.test(r)&&!r.endsWith('/'));
    const faltando=refs.filter(r=>!fs.existsSync(path.resolve(dir,r)));
    check(f+' referencia apenas arquivos existentes',!faltando.length,faltando.join(', '));
  });

  suite('carregamento dos módulos');
  {
    const p1=fs.readFileSync(path.join(root,'processos/01-normalizacao/index.html'),'utf8');
    ok('processo 01 carrega parsers.js antes de app.js',p1.indexOf('parsers.js')>=0&&p1.indexOf('parsers.js')<p1.indexOf('"app.js"'));
    ok('processo 01 carrega core.js antes de app.js',p1.indexOf('core.js')<p1.indexOf('"app.js"'));
    for(const step of [3,4,5,6,7,8]){
      const dir=fs.readdirSync(path.join(root,'processos')).find(d=>d.startsWith(String(step).padStart(2,'0')));
      const html=fs.readFileSync(path.join(root,'processos',dir,'index.html'),'utf8');
      ok('processo 0'+step+' declara data-process',html.includes('data-process="'+step+'"'),dir);
      ok('processo 0'+step+' carrega engines.js e process-runner.js',html.includes('engines.js')&&html.includes('process-runner.js'),dir);
      ok('processo 0'+step+' carrega process-runner.js depois de engines.js',html.indexOf('engines.js')<html.indexOf('process-runner.js'),dir);
    }
  }

  suite('conteúdo do painel');
  {
    const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
    ok('nenhum card promete etapa futura',!/Ver contrato|Estrutura pronta|Próxima automação/.test(home));
    eq('oito cards de processo',(home.match(/class="process-card/g)||[]).length,8);
    const slugs=fs.readdirSync(path.join(root,'processos')).sort();
    slugs.forEach(s=>ok('painel aponta para '+s,home.includes('processos/'+s+'/')));
  }
};
