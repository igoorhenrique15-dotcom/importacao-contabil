const {loadBrowserModules,suite,eq,ok}=require('./harness');
const P=loadBrowserModules('assets/js/parsers.js').ContabilParsers;

module.exports=function(){
  suite('parseMoney');
  eq('1.234,56 no padrão brasileiro',P.parseMoney('1.234,56'),1234.56);
  eq('1,234.56 no padrão americano',P.parseMoney('1,234.56'),1234.56);
  eq('milhar brasileiro sem decimais',P.parseMoney('1.234'),1234);
  eq('milhar brasileiro com dois pontos',P.parseMoney('1.234.567'),1234567);
  eq('decimal simples com ponto',P.parseMoney('1234.56'),1234.56);
  eq('decimal simples com vírgula',P.parseMoney('12,5'),12.5);
  eq('valor entre parênteses é negativo',P.parseMoney('(50,25)'),-50.25);
  eq('negativo com sinal e milhar',P.parseMoney('-1.500,00'),-1500);
  eq('símbolo de moeda e espaço',P.parseMoney('R$ 2.000,00'),2000);
  eq('célula vazia vale zero',P.parseMoney(''),0);
  eq('texto não numérico é inválido',P.parseMoney('abc'),null);
  eq('nulo vale zero',P.parseMoney(null),0);

  suite('normalizeDate');
  eq('DD/MM/AAAA',P.normalizeDate('05/03/2026'),{value:'05/03/2026',valid:true});
  eq('D/M/AAAA recebe zero à esquerda',P.normalizeDate('5/3/2026'),{value:'05/03/2026',valid:true});
  eq('AAAA-MM-DD vira DD/MM/AAAA',P.normalizeDate('2026-03-05'),{value:'05/03/2026',valid:true});
  eq('AAAAMMDD do OFX',P.normalizeDate('20260305'),{value:'05/03/2026',valid:true});
  eq('ano de dois dígitos após 1970',P.normalizeDate('05/03/98'),{value:'05/03/1998',valid:true});
  eq('ano de dois dígitos recente',P.normalizeDate('05/03/26'),{value:'05/03/2026',valid:true});
  eq('data inexistente é sinalizada',P.normalizeDate('31/02/2026').valid,false);
  eq('vazio é aceito',P.normalizeDate(''),{value:'',valid:true});
  eq('texto livre preserva o original',P.normalizeDate('sem data'),{value:'sem data',valid:false});

  suite('parseDelimited');
  eq('detecta ponto e vírgula',P.parseDelimited('A;B\n1;2'),[['A','B'],['1','2']]);
  eq('detecta vírgula',P.parseDelimited('A,B\n1,2'),[['A','B'],['1','2']]);
  eq('detecta tabulação',P.parseDelimited('A\tB\n1\t2'),[['A','B'],['1','2']]);
  eq('respeita separador dentro de aspas',P.parseDelimited('A;B\n"x;y";2'),[['A','B'],['x;y','2']]);
  eq('aspas duplas escapadas',P.parseDelimited('A;B\n"diz ""oi""";2'),[['A','B'],['diz "oi"','2']]);
  eq('quebra de linha dentro de aspas',P.parseDelimited('A;B\n"linha\n2";x'),[['A','B'],['linha\n2','x']]);
  eq('remove BOM do início',P.parseDelimited('﻿A;B\n1;2')[0][0],'A');
  eq('aceita CRLF',P.parseDelimited('A;B\r\n1;2'),[['A','B'],['1','2']]);
  eq('texto vazio devolve lista vazia',P.parseDelimited(''),[]);

  suite('parseOfx');
  const ofx='<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260305120000[-3:BRT]<TRNAMT>-150.75<FITID>ABC1<MEMO>PAGAMENTO FORNECEDOR</STMTTRN><STMTTRN><DTPOSTED>20260306<TRNAMT>200.00<FITID>ABC2<NAME>RECEBIMENTO</STMTTRN></BANKTRANLIST></OFX>';
  const rows=P.parseOfx(ofx);
  eq('cabeçalho fixo',rows[0],['DTPOSTED','MEMO','TRNAMT','FITID']);
  eq('duas transações lidas',rows.length,3);
  eq('data cortada em 8 dígitos',rows[1][0],'20260305');
  eq('usa MEMO quando existe',rows[1][1],'PAGAMENTO FORNECEDOR');
  eq('cai para NAME sem MEMO',rows[2][1],'RECEBIMENTO');
  eq('valor negativo preservado',rows[1][2],'-150.75');
  eq('arquivo sem transações',P.parseOfx('<OFX></OFX>'),[['DTPOSTED','MEMO','TRNAMT','FITID']]);

  suite('guessColumn');
  const headers=['Data Mov.','Histórico','Valor (R$)','Nº Documento'];
  eq('acha a data',P.guessColumn(headers,['data','dt']),0);
  eq('acha a descrição por sinônimo',P.guessColumn(headers,['descricao','historico']),1);
  eq('acha o valor ignorando acentos e símbolos',P.guessColumn(headers,['valor']),2);
  eq('acha o documento',P.guessColumn(headers,['documento','doc']),3);
  eq('sem correspondência devolve -1',P.guessColumn(headers,['inexistente']),-1);
  eq('prefere igualdade exata a parcial',P.guessColumn(['Valor Total','Valor'],['valor']),1);
  ok('normalizeText remove acentos',P.normalizeText('Histórico Nº 1')==='historicon1',P.normalizeText('Histórico Nº 1'));
};
