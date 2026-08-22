(function(){
  // Leitor mínimo de XLSX. Um .xlsx é um ZIP com XML dentro, e o navegador já
  // traz o que é preciso: DecompressionStream para o deflate e DOMParser para
  // o XML. Sem dependência externa, que o projeto não tem como carregar.
  //
  // Lê apenas o necessário para virar tabela: a primeira planilha, as strings
  // compartilhadas e o formato das células de data. Fórmulas não são
  // calculadas — o valor lido é o último que o Excel gravou.
  const td=new TextDecoder('utf-8');

  // Devolve as linhas da aba pedida e a lista de abas na ordem em que
  // aparecem no Excel, para que a pagina possa oferecer a escolha.
  async function readXlsx(buffer,{sheet=0}={}){
    const arquivos=await unzip(new Uint8Array(buffer));
    const abas=listarAbas(arquivos);
    if(!abas.length)throw new Error('A planilha não contém abas legíveis.');
    const indice=Math.min(Math.max(0,Number(sheet)||0),abas.length-1);
    const conteudo=arquivos[abas[indice].arquivo];
    if(!conteudo)throw new Error('A aba “'+abas[indice].nome+'” não pôde ser lida.');
    const strings=lerSharedStrings(arquivos['xl/sharedStrings.xml']);
    const datas=lerFormatosDeData(arquivos['xl/styles.xml']);
    return{rows:lerLinhas(conteudo,strings,datas),sheets:abas.map(a=>a.nome),sheet:indice};
  }

  // ---------- ZIP ----------
  async function unzip(bytes){
    const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const fim=acharCentralDirectory(dv,bytes.length);
    if(fim<0)throw new Error('Arquivo não é uma planilha .xlsx válida.');
    let ponteiro=dv.getUint32(fim+16,true);
    const total=dv.getUint16(fim+10,true),arquivos={};
    for(let i=0;i<total;i++){
      if(dv.getUint32(ponteiro,true)!==0x02014b50)break;
      const metodo=dv.getUint16(ponteiro+10,true),
        tamanhoComprimido=dv.getUint32(ponteiro+20,true),
        tamanhoNome=dv.getUint16(ponteiro+28,true),
        tamanhoExtra=dv.getUint16(ponteiro+30,true),
        tamanhoComentario=dv.getUint16(ponteiro+32,true),
        inicioLocal=dv.getUint32(ponteiro+42,true),
        nome=td.decode(bytes.subarray(ponteiro+46,ponteiro+46+tamanhoNome));
      if(interessa(nome)){
        const nomeLocal=dv.getUint16(inicioLocal+26,true),extraLocal=dv.getUint16(inicioLocal+28,true),
          inicio=inicioLocal+30+nomeLocal+extraLocal,
          bruto=bytes.subarray(inicio,inicio+tamanhoComprimido);
        arquivos[nome]=metodo===0?td.decode(bruto):td.decode(await inflate(bruto));
      }
      ponteiro+=46+tamanhoNome+tamanhoExtra+tamanhoComentario;
    }
    return arquivos;
  }
  function interessa(nome){
    return nome==='xl/sharedStrings.xml'||nome==='xl/styles.xml'||nome==='xl/workbook.xml'||nome==='xl/_rels/workbook.xml.rels'||/^xl\/worksheets\/sheet\d+\.xml$/.test(nome);
  }
  // O comentário final do ZIP tem tamanho variável, então a assinatura do
  // End of Central Directory é procurada de trás para frente.
  function acharCentralDirectory(dv,tamanho){
    for(let i=tamanho-22;i>=0&&i>tamanho-65558;i--)if(dv.getUint32(i,true)===0x06054b50)return i;
    return -1;
  }
  async function inflate(bytes){
    if(typeof DecompressionStream!=='function')throw new Error('Este navegador não consegue abrir .xlsx. Exporte a planilha como CSV.');
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // ---------- XML ----------
  function xml(texto){
    const doc=new DOMParser().parseFromString(texto,'application/xml');
    if(doc.querySelector('parsererror'))throw new Error('A planilha está corrompida ou em formato não suportado.');
    return doc;
  }
  // A ordem das abas esta no workbook, nao no nome do arquivo: reordenar abas
  // no Excel nao renomeia sheet1.xml, entao confiar no numero fazia o leitor
  // pegar a aba errada em silencio.
  function listarAbas(arquivos){
    const disponiveis=Object.keys(arquivos).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    const workbook=arquivos['xl/workbook.xml'],rels=arquivos['xl/_rels/workbook.xml.rels'];
    if(workbook){
      try{
        const alvos=new Map();
        if(rels)[...xml(rels).getElementsByTagName('Relationship')].forEach(r=>{
          const destino=r.getAttribute('Target')||'';
          alvos.set(r.getAttribute('Id'),'xl/'+destino.replace(/^\/?xl\//,'').replace(/^\.\//,''));
        });
        const abas=[...xml(workbook).getElementsByTagName('sheet')].map((sheet,i)=>{
          const id=sheet.getAttribute('r:id')||sheet.getAttributeNS?.('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
          const arquivo=alvos.get(id);
          return{nome:sheet.getAttribute('name')||'Planilha '+(i+1),arquivo:arquivo&&arquivos[arquivo]?arquivo:null};
        }).filter(a=>a.arquivo);
        if(abas.length)return abas;
      }catch{/* workbook ilegivel: cai para a ordem dos arquivos */}
    }
    return disponiveis.sort((a,b)=>Number(a.match(/(\d+)/)[1])-Number(b.match(/(\d+)/)[1]))
      .map((arquivo,i)=>({nome:'Planilha '+(i+1),arquivo}));
  }
  function lerSharedStrings(texto){
    if(!texto)return[];
    return [...xml(texto).getElementsByTagName('si')].map(si=>
      [...si.getElementsByTagName('t')].map(t=>t.textContent).join(''));
  }
  // Uma data no Excel é um número; só o formato da célula distingue 45000 de
  // uma data. Os formatos 14 a 22 são de data/hora por definição, e os
  // personalizados são reconhecidos pelo padrão do código.
  function lerFormatosDeData(texto){
    const datas=new Set();
    if(!texto)return datas;
    const doc=xml(texto),personalizados=new Set();
    [...doc.getElementsByTagName('numFmt')].forEach(f=>{
      const codigo=f.getAttribute('formatCode')||'';
      if(/[dmyhs]/i.test(codigo)&&!/\[/.test(codigo))personalizados.add(f.getAttribute('numFmtId'));
    });
    const estilos=doc.getElementsByTagName('cellXfs')[0];
    if(!estilos)return datas;
    [...estilos.getElementsByTagName('xf')].forEach((xf,i)=>{
      const id=xf.getAttribute('numFmtId');
      if((Number(id)>=14&&Number(id)<=22)||personalizados.has(id))datas.add(i);
    });
    return datas;
  }
  function lerLinhas(texto,strings,formatosDeData){
    const doc=xml(texto),linhas=[];
    [...doc.getElementsByTagName('row')].forEach(row=>{
      const celulas=[];let maior=-1;
      [...row.getElementsByTagName('c')].forEach(c=>{
        const coluna=indiceDaColuna(c.getAttribute('r')||'');
        if(coluna<0)return;
        celulas[coluna]=valorDaCelula(c,strings,formatosDeData);
        if(coluna>maior)maior=coluna;
      });
      for(let i=0;i<=maior;i++)if(celulas[i]===undefined)celulas[i]='';
      linhas.push(celulas);
    });
    // O Excel guarda linhas vazias; elas não são registros.
    while(linhas.length&&!linhas[linhas.length-1].some(v=>String(v).trim()))linhas.pop();
    return linhas;
  }
  function indiceDaColuna(ref){
    const letras=String(ref).match(/^([A-Z]+)/);
    if(!letras)return -1;
    let n=0;for(const ch of letras[1])n=n*26+(ch.charCodeAt(0)-64);
    return n-1;
  }
  function valorDaCelula(c,strings,formatosDeData){
    const tipo=c.getAttribute('t'),estilo=Number(c.getAttribute('s')||0);
    if(tipo==='inlineStr')return [...c.getElementsByTagName('t')].map(t=>t.textContent).join('');
    const v=c.getElementsByTagName('v')[0];
    if(!v)return'';
    const bruto=v.textContent;
    if(tipo==='s')return strings[Number(bruto)]??'';
    if(tipo==='b')return bruto==='1'?'VERDADEIRO':'FALSO';
    if(tipo==='e')return bruto;
    if(tipo==='str')return bruto;
    if(formatosDeData.has(estilo)){
      const data=serialParaData(Number(bruto));
      if(data)return data;
    }
    return bruto;
  }
  // O Excel conta dias a partir de 31/12/1899 e trata 1900 como bissexto, um
  // ano que não existiu como tal: o serial 60 é o 29/02/1900 fantasma, e a
  // partir dele a contagem fica um dia adiantada.
  function serialParaData(serial){
    if(!Number.isFinite(serial)||serial<1||serial>2958465)return null;
    const dias=Math.floor(serial),ajustado=dias>59?dias-1:dias;
    const d=new Date(Date.UTC(1899,11,31));
    d.setUTCDate(d.getUTCDate()+ajustado);
    return String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear();
  }
  window.ContabilXlsx={readXlsx,listarAbas,serialParaData,indiceDaColuna};
})();
