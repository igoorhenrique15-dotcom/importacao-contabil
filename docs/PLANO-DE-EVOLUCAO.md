# Plano de evolução — de protótipo a arquivo que o sistema aceita

O fluxo das oito etapas roda ponta a ponta. O que falta não é interface: é o
arquivo final estar contabilmente correto e o sistema de destino aceitá-lo.

## Diagnóstico

Quatro defeitos medidos no código em `main`, todos reproduzidos localmente.

### 1. O arquivo final duplica o valor — contabilmente errado

O Processo 03 identifica corretamente que um pagamento de R$ 1.500,00
corresponde a duas parcelas do relatório. Ninguém consome esse resultado: o
Processo 08 exporta o pagamento **e** as duas parcelas como três lançamentos.

| Origem | Descrição | Valor |
| --- | --- | ---: |
| banco | PAGTO FORNECEDOR ACME | −1.500,00 |
| relatório | ACME PARCELA 1 | −500,00 |
| relatório | ACME PARCELA 2 | −1.000,00 |
| | **total exportado** | **−3.000,00** |
| | **saiu do banco de verdade** | **−1.500,00** |

### 2. A validação não confere partida dobrada — contabilmente errado

O Processo 07 confere se os campos estão preenchidos. Não confere a soma dos
débitos contra a soma dos créditos. Um lote desbalanceado passa como válido.

O mesmo teste mostra que o valor é exportado negativo. Em arquivo de importação
contábil o valor é sempre positivo; a direção vem das contas.

### 3. O limite de 10.000 lançamentos era falso — CORRIGIDO

O estado vai para o `localStorage` (teto de 5 MB) e o lote guarda uma cópia
enriquecida dos lançamentos para cada uma das oito etapas.

| Lançamentos | Estado gravado | Cabe em 5 MB? |
| ---: | ---: | --- |
| 500 | 2,4 MB | sim |
| 1.000 | 4,8 MB | no limite |
| 2.000 | 9,6 MB | estoura |
| 5.000 | 24,0 MB | estoura |

Na prática o trabalho era perdido a partir de ~1.000 lançamentos. Com o estado
reduzido à entrada, 10.000 lançamentos ocupam 3,2 MB e o limite virou real.

### 4. O Processo 04 crescia ao quadrado — CORRIGIDO

`matchDocuments` comparava cada movimento bancário com todos os itens do
relatório. Mesmo defeito que o Processo 03 tinha. Depois da indexação, 4.000
lançamentos levam 15 ms e 10.000 levam 130 ms.

| Lançamentos | Aba travada |
| ---: | ---: |
| 500 | 0,3 s |
| 1.000 | 1,3 s |
| 2.000 | 5,1 s |
| 4.000 | 20,7 s |
| 10.000 | ~2 min (estimado) |

## Fases

A ordem não é negociável: não adianta acelerar um cálculo que entrega número
errado, nem ajustar o layout antes de decidir o que é lançamento.

### Fase 0 — Parar de produzir número errado — CONCLUÍDA

- [x] Regra do que vira lançamento implementada em `classifyPosting`, com os
      quatro casos (`lancamento`, `agregador`, `espelho`, `pendencia`) descritos
      em [ARQUITETURA.md](ARQUITETURA.md).
- [x] O Processo 08 exporta só registros marcados como `lancamento`.
- [x] Item de relatório sem contrapartida no extrato vira pendência.
- [x] `reconcileTotals` confere o total contabilizado contra a movimentação do
      extrato; o Processo 08 recusa a exportação quando não bate.
- [x] Valor exportado sempre positivo.
- [x] Corrigido de quebra: uma tarifa bancária herdava a nota fiscal de um
      fornecedor, porque o documento do melhor candidato era adotado mesmo com
      confiança abaixo do corte.

**Verificado:** no caso `SISPAG FORNECEDORES 10.000,00` com João e Ferro Velho a
5.000,00 cada, mais uma tarifa de 45,90 e um título ainda não pago, o arquivo
final passou de 3 lançamentos somando R$ 20.045,90 para **3 lançamentos somando
R$ 10.045,90** — exatamente o que se moveu na conta.

### Observação sobre partida dobrada

No modelo atual cada linha é um lançamento com uma conta de débito, uma de
crédito e um valor, então débitos e créditos se igualam por construção — a
conferência seria sempre verdadeira e não provaria nada. O controle que de fato
faltava, e que foi implementado, é a soma do que será contabilizado contra a
movimentação do extrato. Quando o modelo passar a aceitar lançamento com
múltiplas partidas, a conferência de partida dobrada passa a ser necessária.

### Fase 1 — Falar a língua do Questor

**Sistema de destino definido: Questor.** Os três layouts do código
(`generico`, `dominio`, `alterdata`) são inventados — os cabeçalhos
`CONTA_DEBITO` e `DT_LCTO` não vieram de nenhuma especificação, e nenhum deles
é o Questor.

- [ ] **Bloqueado:** obter a especificação oficial de importação de lançamentos
      do Questor, ou um arquivo modelo que ele já aceite hoje.
- [ ] Implementar o layout do Questor no Processo 08.
- [ ] Reescrever `buildLayout` para o layout real, incluindo campos
      obrigatórios que hoje não existem (código da empresa, centro de custo,
      filial).
- [ ] Importar o plano de contas do cliente e validar cada conta: existe? é
      analítica (aceita lançamento) ou sintética (não aceita)?
- [ ] Trocar histórico livre por código de histórico + complemento, se o
      sistema exigir.

**Pronto quando:** um arquivo gerado é importado numa empresa de teste, no
software real, sem erro.

### Fase 2 — Aguentar um lote de verdade — CONCLUÍDA

- [x] `matchDocuments` indexado por documento e por data+valor. Um casamento só
      é aceito a partir de 45 pontos, o que exige documento igual (55) ou valor
      mais data (30+15) — todo par possível está num desses dois índices.
      **4.000 lançamentos: de 20,7 s para 15 ms. 10.000: 130 ms**, com as
      mesmas correspondências de antes.
- [x] Parar de guardar as oito saídas. O disco guarda só a entrada — lançamentos
      normalizados e configurações — e `pipeline.js` reconstrói o resto sob
      demanda, com cache em memória.
- [x] Limite de 10.000 registros **passou a ser verdadeiro**: o estado gravado
      caiu de 43,9 MB para 3,2 MB nesse volume.
- [x] Corrigido no caminho: o cache do pipeline usava `id + updatedAt` como
      chave, e `updatedAt` tem resolução de milissegundo — duas gravações
      seguidas podiam servir o resultado anterior. Agora é cache por objeto de
      lote mais um contador de revisão.

**IndexedDB não foi necessário.** A troca estava no plano por causa do teto de
5 MB, mas o problema não era o `localStorage` — era guardar oito cópias do
mesmo lote. Corrigida a causa, o teto deixou de ser alcançado. Volta ao plano
se um lote precisar passar de 15.000 lançamentos.

**Verificado:** o fluxo completo roda no navegador e o resultado sobrevive a
recarregar a página, reconstruído a partir de 3.951 bytes de estado gravado.

### Fase 3 — Deixar o contador corrigir

Nenhum motor automático acerta 100%, e hoje não há como consertar sem refazer.

- [ ] Editar conta, histórico e documento linha a linha.
- [ ] Desfazer um desmembramento sugerido e refazer à mão.
- [ ] Marcar linha como revisada e protegê-la contra reprocessamento.
- [ ] Guardar as regras de conta por cliente.

**Pronto quando:** dá para corrigir uma sugestão errada sem sair da tela e sem
perder o resto do lote.

### Fase 4 — Validar contra a realidade

- [ ] Coletar extratos anonimizados dos bancos usados de verdade e transformar
      cada um em caso de teste fixo.
- [ ] Fechar um mês real pelo sistema e conferir contra o fechamento manual.
- [ ] Medir a taxa de acerto sem intervenção.

**Pronto quando:** um mês real fechado pelo sistema bate com o fechamento
manual, e a taxa de acerto é um número conhecido.

## Decisões tomadas

1. **Sistema contábil de destino: Questor.** Falta a especificação de
   importação ou um arquivo modelo — é o que bloqueia a Fase 1.
2. **No desmembramento, os itens do relatório viram lançamento**, e a linha
   aglutinada do extrato não. Implementado na Fase 0.
3. **Item de relatório sem correspondência no banco vira pendência** e fica
   fora do arquivo. Implementado na Fase 0.
4. **Continua 100% no navegador.** A Fase 2 usa IndexedDB, sem backend.

## Já concluído

- Fluxo completo das oito etapas, encadeado.
- Processo 03 corrigido: 13,8 s para 1 ms, sem perder desmembramentos.
- Leitura de CSV, TXT delimitado e OFX com milhar brasileiro correto.
- Conteúdo dos arquivos escapado antes de ir para a tela.
- 172 verificações automatizadas (`node tests/run.js`) e o fluxo completo
  testado em navegador real (`node tests/e2e.js`).
- Invalidação em cadeia entre etapas.
- Fase 0 completa: o arquivo final deixou de duplicar valor e passou a conferir
  contra o extrato antes de permitir exportação.
- Fase 2 completa: o Processo 04 deixou de travar e um mês real cabe no
  navegador, com o resultado reconstruído ao reabrir a página.
