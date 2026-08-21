# Motores dos processos 03 a 08

Todos os motores são executados localmente no navegador e salvam seus resultados
no lote ativo.

## 03 — Desmembramento

Procura, na mesma data, combinações de dois a cinco itens do relatório cuja
soma corresponda a um pagamento bancário dentro da tolerância configurada.

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

## Limites atuais

As regras entregues são determinísticas e configuráveis. Integrações com APIs,
OCR de notas, plano de contas remoto, autenticação e processamento Python
exigem um backend e não são compatíveis com execução exclusiva no GitHub Pages.
