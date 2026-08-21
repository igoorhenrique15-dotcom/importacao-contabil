# Processo 02 — Fechamento diário

## Entrada

Registros do banco e relatório salvos pelo Processo 01.

## Regra

1. Agrupar registros por data.
2. Somar o valor de cada origem.
3. Calcular `diferença = banco - relatório`.
4. Classificar como conciliado quando a diferença absoluta estiver dentro da tolerância.
5. Classificar como divergente quando exceder a tolerância.
6. Classificar como incompleto quando existir somente uma das fontes.

## Saída

Resumo por data com quantidades, totais, diferença e status, disponível para
consulta responsiva e exportação em CSV.
