(function(){
  // Leitores e normalizadores puros do Processo 01. Sem acesso ao DOM para
  // permitir teste automatizado fora do navegador.
  function parseDelimited(text){
    const cleaned=String(text??'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'),lines=cleaned.split('\n').filter(x=>x.trim());
    if(!lines.length)return[];
    const candidates=[';','\t',','],delimiter=candidates.map(d=>({d,s:lines.slice(0,10).reduce((n,l)=>n+countOutsideQuotes(l,d),0)})).sort((a,b)=>b.s-a.s)[0].d;
    const rows=[];let row=[],field='',quoted=false;
    for(let i=0;i<cleaned.length;i++){const ch=cleaned[i],next=cleaned[i+1];if(ch==='"'){if(quoted&&next==='"'){field+='"';i++}else quoted=!quoted}else if(ch===delimiter&&!quoted){row.push(field);field=''}else if(ch==='\n'&&!quoted){row.push(field);rows.push(row);row=[];field=''}else field+=ch}
    if(field.length||row.length){row.push(field);rows.push(row)}return rows;
  }
  function countOutsideQuotes(line,d){let q=false,n=0;for(const ch of line){if(ch==='"')q=!q;else if(ch===d&&!q)n++}return n}
  function parseOfx(text){
    const blocks=String(text??'').match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>)/gi)||[];
    const headers=['DTPOSTED','MEMO','TRNAMT','FITID'];
    const get=(b,t)=>{const m=b.match(new RegExp('<'+t+'>([^<\\r\\n]+)','i'));return m?m[1].trim():''};
    return [headers,...blocks.map(b=>[get(b,'DTPOSTED').slice(0,8),get(b,'MEMO')||get(b,'NAME'),get(b,'TRNAMT'),get(b,'FITID')])];
  }
  // Aceita 1.234,56 (BR), 1,234.56 (US), 1.234 e 1.234.567 (milhar BR sem
  // decimais) e valores negativos escritos com sinal ou entre parênteses.
  // Devolve 0 para célula vazia e null quando o texto não é um número.
  function parseMoney(input){
    let s=String(input??'').trim();if(!s)return 0;
    const negative=/^-/.test(s)||/^\(.*\)$/.test(s);
    s=s.replace(/[R$€£\s()]/g,'');
    const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
    if(comma>dot)s=s.replace(/\./g,'').replace(',','.');
    else if(dot>comma&&comma>=0)s=s.replace(/,/g,'');
    else if(comma>=0)s=s.replace(',','.');
    else if(/^-?\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
    s=s.replace(/[^0-9.\-]/g,'');
    if(!s||!Number.isFinite(Number(s)))return null;
    const n=Number(s);return negative?-Math.abs(n):n;
  }
  function normalizeDate(input){
    const s=String(input??'').trim();if(!s)return{value:'',valid:true};
    let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if(m){let y=m[3];if(y.length===2)y=Number(y)>=70?'19'+y:'20'+y;const d=validDate(Number(y),Number(m[2]),Number(m[1]));return{value:d?String(m[1]).padStart(2,'0')+'/'+String(m[2]).padStart(2,'0')+'/'+y:s,valid:d}}
    m=s.match(/^(\d{4})[\/\-.]?(\d{2})[\/\-.]?(\d{2})/);
    if(m){const d=validDate(+m[1],+m[2],+m[3]);return{value:d?m[3]+'/'+m[2]+'/'+m[1]:s,valid:d}}
    return{value:s,valid:false};
  }
  function validDate(y,m,d){const x=new Date(y,m-1,d);return x.getFullYear()===y&&x.getMonth()===m-1&&x.getDate()===d}
  function normalizeText(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')}
  function guessColumn(headers,hints){const normalized=headers.map(normalizeText);for(const hint of hints){const exact=normalized.findIndex(h=>h===normalizeText(hint));if(exact>=0)return exact}for(const hint of hints){const partial=normalized.findIndex(h=>h.includes(normalizeText(hint)));if(partial>=0)return partial}return-1}
  window.ContabilParsers={parseDelimited,parseOfx,parseMoney,normalizeDate,validDate,normalizeText,guessColumn};
})();
