# Motores dos processos 03 a 08

Todos os motores são executados localmente no navegador, recebem a versão
produzida pela etapa anterior e salvam uma nova versão enriquecida no lote.

## 03 — Desmembramento

Procura, na mesma data, combinações de dois a cinco itens do relatório cuja
soma corresponda a um pagamento bancário dentro da tolerância configurada.

Regras da busca:

- só entram itens com o mesmo sinal do pagamento, para que um crédito e um
  débito não se anulem e produzam um agrupamento sem sentido contábil;
- toda a aritmética é feita em centavos inteiros, sem ponto flutuante;
- combinações de duas e de três parcelas são resolvidas de forma exata por
  varredura com dois ponteiros, e são testadas primeiro — o menor agrupamento
  possível é o escolhido;
- de quatro a cinco parcelas entra uma busca em profundidade com poda por
  alcance restante e por estouro do alvo, limitada por um teto de nós
  visitados;
- cada pagamento considera no máximo 300 candidatos, os de maior valor.

Os dois últimos limites tornam o pior caso previsível: sem eles a busca era
exponencial e travava a aba do navegador em lotes reais.

## 04 — Documentos e notas

Calcula confiança de correspondência usando documento, valor, data e
similaridade da descrição. Resultados podem ser confirmados, exigir revisão ou
ficar sem correspondência. O documento do candidato só é adotado quando a
correspondência é aceita (confiança a partir de 45), para que uma tarifa
bancária não herde a nota fiscal de um fornecedor.

Ao final, `classifyPosting` decide o que vira lançamento contábil — ver
[ARQUITETURA.md](ARQUITETURA.md). É aqui que a informação está completa: o
Processo 03 já registrou os desmembramentos e este registrou as
correspondências.

## 05 — Contas contábeis

Aplica regras configuráveis por palavra-chave. Cada regra define uma conta de
débito e uma de crédito. Lançamentos sem regra permanecem pendentes.

Quando mais de uma regra bate, **vence a mais específica** — a de palavra-chave
mais longa — e não a primeira cadastrada. Com `pagamento` e
`pagamento fornecedor` na lista, um pagamento a fornecedor cai na segunda,
independentemente da ordem de digitação.

As regras são guardadas por cliente: um lote novo da mesma empresa já abre com
as regras do lote anterior.

## 06 — Histórico

Gera históricos por modelo. Campos disponíveis: descrição, documento, data,
valor e cliente.

O histórico é cortado no limite configurado (255 caracteres por padrão) e o
corte é sinalizado na validação. Sistemas contábeis limitam esse campo, e
descobrir o corte na hora da importação é pior do que vê-lo antes.

## 07 — Validação

Confere data, descrição, valor, contas, histórico, avisos anteriores e recusa
débito e crédito na mesma conta.

Duplicidade só é apontada quando o **mesmo documento** aparece na mesma data e
valor. Sem documento não há aviso: duas tarifas ou duas TEDs de mesmo valor no
mesmo dia são normais, e marcá-las como suspeitas só ensinava a ignorar todos
os avisos.

Lançamentos com data fora da competência do lote também viram aviso — é erro
clássico de fechamento e passava despercebido. O resultado separa
registros válidos, com avisos, com erros e não contabilizados.

Registros que não viram lançamento (`agregador`, `espelho`, `pendencia`) saem
como `pendente` e não são cobrados por conta ou histórico — eles não vão para o
arquivo.

A etapa também exibe a conferência do lote contra o extrato.

## 08 — Layout

Gera CSV somente com registros marcados como `lancamento` e liberados pela
validação. A exportação é recusada quando o lote não confere com o extrato.

O valor sai sempre positivo; a direção vem das contas de débito e crédito.

> **Atenção:** os três layouts atuais (`generico`, `dominio`, `alterdata`) não
> seguem especificação oficial de nenhum software — os nomes de campo foram
> escolhidos por semelhança. O destino real deste projeto é o **Questor**, e o
> layout dele ainda precisa ser implementado a partir da documentação oficial
> ou de um arquivo modelo que o sistema aceite. Enquanto isso não acontecer, o
> arquivo gerado serve para conferência, não para importação.

## Correção manual

Os Processos 04, 05 e 06 permitem corrigir o resultado direto na tabela — se um
registro vai para o arquivo, as contas e o histórico. A correção vale sobre a
regra automática e sobrevive a reexecutar a etapa. Ver
[ARQUITETURA.md](ARQUITETURA.md).

## Prévia dos resultados

As tabelas dos processos 05, 06 e 07 exibem no máximo 500 lançamentos e
informam quando há mais. O lote guarda o resultado completo, e é ele que
alimenta a etapa seguinte.

## Limites atuais

As regras entregues são determinísticas e configuráveis. Integrações com APIs,
OCR de notas, plano de contas remoto, autenticação e processamento Python
exigem um backend e não são compatíveis com execução exclusiva no GitHub Pages.
