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
ficar sem correspondência.

## 05 — Contas contábeis

Aplica regras configuráveis por palavra-chave. Cada regra define uma conta de
débito e uma de crédito. Lançamentos sem regra permanecem pendentes.

## 06 — Histórico

Gera históricos por modelo. Campos disponíveis: descrição, documento, data,
valor e cliente.

## 07 — Validação

Confere data, descrição, valor, contas, histórico, avisos anteriores e possíveis
duplicidades. O resultado separa registros válidos, com avisos e com erros.

## 08 — Layout

Gera CSV genérico, Domínio ou Alterdata somente com registros liberados pela
validação. A saída preserva data, contas, valor, histórico e documento.

## Prévia dos resultados

As tabelas dos processos 05, 06 e 07 exibem no máximo 500 lançamentos e
informam quando há mais. O lote guarda o resultado completo, e é ele que
alimenta a etapa seguinte.

## Limites atuais

As regras entregues são determinísticas e configuráveis. Integrações com APIs,
OCR de notas, plano de contas remoto, autenticação e processamento Python
exigem um backend e não são compatíveis com execução exclusiva no GitHub Pages.
