# Processo 01 — Normalização dos arquivos

## Objetivo

Receber arquivos do banco e/ou relatório do cliente e transformar colunas diferentes em uma estrutura comum, sem fazer conciliação e sem alterar o arquivo original.

## Entrada atual

- CSV separado por `;`, `,` ou tabulação;
- TXT delimitado nos mesmos formatos;
- OFX (extrato bancário), lido a partir dos blocos `STMTTRN`.

## Campos normalizados

- `ORIGEM`
- `LINHA_ORIGINAL`
- `DATA`
- `DESCRICAO`
- `VALOR`
- `DEBITO`
- `CREDITO`
- `DOCUMENTO`

## Regras

1. O arquivo original nunca é alterado.
2. O usuário pode mapear manualmente qualquer coluna.
3. O sistema tenta sugerir o mapeamento pelos nomes dos cabeçalhos.
4. Valores brasileiros como `1.234,56` são convertidos corretamente.
5. Valores no formato `1,234.56` também são aceitos.
6. Milhares sem decimais como `1.234` e `1.234.567` são lidos como 1234 e
   1234567, e não como valores quebrados ou inválidos.
7. Valores entre parênteses e com símbolo de moeda são aceitos; parênteses
   indicam número negativo.
8. Datas `DD/MM/AAAA`, `AAAA-MM-DD` e `AAAAMMDD` são padronizadas para
   `DD/MM/AAAA`. Datas inexistentes viram aviso e preservam o texto original.
9. Se houver uma coluna única de valor, ela é preservada em `VALOR`.
10. Se houver somente débito e crédito, `VALOR = CRÉDITO - DÉBITO`.
11. Banco e relatório podem ser usados separadamente.
12. A saída pode ser exportada em CSV separado por ponto e vírgula.

## Fora do escopo deste processo

- conferir se banco e relatório fecham;
- desmembrar pagamentos;
- identificar notas fiscais;
- identificar contas contábeis;
- definir histórico;
- gerar layout final de importação.

Esses itens pertencem aos processos seguintes.

## Restaurar e normalizar de novo

Restaurar traz para a tela os lançamentos já salvos no lote. Se depois disso um
arquivo da mesma origem for normalizado, ele **substitui** os registros
restaurados daquela origem, e a tela avisa quantos foram substituídos. Sem essa
regra, restaurar e renormalizar duplicava silenciosamente o lote.

Salvar no lote recusa a gravação se houver identificador repetido na saída — é
a última defesa contra duplicação vinda de qualquer caminho.

## Onde ficam as regras

Os leitores e normalizadores puros (`parseDelimited`, `parseOfx`, `parseMoney`,
`normalizeDate`, `guessColumn`) ficam em `assets/js/parsers.js`, sem acesso ao
DOM. `processos/01-normalizacao/app.js` cuida apenas da interface. Essa
separação existe para permitir teste automatizado fora do navegador.

## Próximas melhorias do próprio Processo 01

Validar com arquivos reais anonimizados e, se necessário, adicionar leitores
para XLS/XLSX e formatos recorrentes de relatórios de clientes.
