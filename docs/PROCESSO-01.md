# Processo 01 — Normalização dos arquivos

## Objetivo

Receber arquivos do banco e/ou relatório do cliente e transformar colunas diferentes em uma estrutura comum, sem fazer conciliação e sem alterar o arquivo original.

## Entrada atual

- CSV separado por `;`, `,` ou tabulação;
- TXT delimitado nos mesmos formatos.

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
6. Datas `DD/MM/AAAA` e `AAAA-MM-DD` são padronizadas para `DD/MM/AAAA`.
7. Se houver uma coluna única de valor, ela é preservada em `VALOR`.
8. Se houver somente débito e crédito, `VALOR = CRÉDITO - DÉBITO`.
9. Banco e relatório podem ser usados separadamente.
10. A saída pode ser exportada em CSV separado por ponto e vírgula.

## Fora do escopo deste processo

- conferir se banco e relatório fecham;
- desmembrar pagamentos;
- identificar notas fiscais;
- identificar contas contábeis;
- definir histórico;
- gerar layout final de importação.

Esses itens pertencem aos processos seguintes.

## Próximas melhorias do próprio Processo 01

Antes de considerar esta etapa concluída, validar com arquivos reais anonimizados e, se necessário, adicionar leitores específicos para OFX, XLS/XLSX e formatos recorrentes de relatórios de clientes.
