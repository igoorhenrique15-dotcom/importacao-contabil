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

### 3. O limite de 10.000 lançamentos é falso — trava em uso real

O estado vai para o `localStorage` (teto de 5 MB) e o lote guarda uma cópia
enriquecida dos lançamentos para cada uma das oito etapas.

| Lançamentos | Estado gravado | Cabe em 5 MB? |
| ---: | ---: | --- |
| 500 | 2,4 MB | sim |
| 1.000 | 4,8 MB | no limite |
| 2.000 | 9,6 MB | estoura |
| 5.000 | 24,0 MB | estoura |

Na prática o trabalho é perdido a partir de ~1.000 lançamentos.

### 4. O Processo 04 cresce ao quadrado — trava em uso real

`matchDocuments` compara cada movimento bancário com todos os itens do
relatório. Mesmo defeito que o Processo 03 tinha.

| Lançamentos | Aba travada |
| ---: | ---: |
| 500 | 0,3 s |
| 1.000 | 1,3 s |
| 2.000 | 5,1 s |
| 4.000 | 20,7 s |

## Fases

A ordem não é negociável: não adianta acelerar um cálculo que entrega número
errado, nem ajustar o layout antes de decidir o que é lançamento.

### Fase 0 — Parar de produzir número errado

Bloqueia todo o resto.

- [ ] Definir o que é lançamento: o extrato é o fato financeiro, o relatório é
      o detalhamento. Num desmembramento, as parcelas **substituem** o
      pagamento em vez de somar a ele.
- [ ] Marcar cada registro como contabilizável ou não no Processo 03, e fazer o
      Processo 08 respeitar essa marca em vez de exportar tudo.
- [ ] Decidir o destino do item de relatório sem contrapartida no banco.
- [ ] Conferir partida dobrada no Processo 07, por lançamento e no total do
      lote, barrando a exportação quando não fechar.
- [ ] Exportar valor sempre positivo.

**Pronto quando:** num lote de teste conhecido, a soma do arquivo final bate com
a soma do extrato e débitos = créditos.

### Fase 1 — Falar a língua do sistema de destino

Os três layouts do código são inventados. Os cabeçalhos `CONTA_DEBITO` e
`DT_LCTO` não vieram de nenhuma especificação.

- [ ] Obter a especificação oficial de importação do sistema usado, ou um
      arquivo modelo que ele já aceite.
- [ ] Reescrever `buildLayout` para o layout real, incluindo campos
      obrigatórios que hoje não existem (código da empresa, centro de custo,
      filial).
- [ ] Importar o plano de contas do cliente e validar cada conta: existe? é
      analítica (aceita lançamento) ou sintética (não aceita)?
- [ ] Trocar histórico livre por código de histórico + complemento, se o
      sistema exigir.

**Pronto quando:** um arquivo gerado é importado numa empresa de teste, no
software real, sem erro.

### Fase 2 — Aguentar um lote de verdade

- [ ] Trocar `localStorage` por IndexedDB.
- [ ] Parar de guardar oito cópias do lote: guardar os lançamentos uma vez e só
      os campos que cada etapa acrescenta.
- [ ] Indexar `matchDocuments` por documento, valor e data — mesma técnica que
      derrubou o Processo 03 de 13,8 s para 1 ms.
- [ ] Anunciar o limite real, medido.

**Pronto quando:** um mês real percorre as oito etapas sem travar e o resultado
sobrevive a recarregar a página.

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

## Decisões pendentes

Não são técnicas; dependem da rotina do escritório.

1. **Qual é o sistema contábil de destino?** A Fase 1 inteira depende da
   especificação de importação ou de um arquivo modelo.
2. **No desmembramento, o que vira lançamento?** A leitura atual é que as
   parcelas do relatório substituem o pagamento do extrato.
3. **Item de relatório sem correspondência no banco entra no arquivo?** Sem
   movimentação financeira, o provável é virar pendência.
4. **Continua 100% no navegador?** Um backend traria histórico entre máquinas e
   vários contadores no mesmo lote, junto com autenticação, criptografia,
   retenção e responsabilidade sobre dado de cliente.

## Já concluído

- Fluxo completo das oito etapas, encadeado.
- Processo 03 corrigido: 13,8 s para 1 ms, sem perder desmembramentos.
- Leitura de CSV, TXT delimitado e OFX com milhar brasileiro correto.
- Conteúdo dos arquivos escapado antes de ir para a tela.
- 172 verificações automatizadas (`node tests/run.js`) e o fluxo completo
  testado em navegador real (`node tests/e2e.js`).
- Invalidação em cadeia entre etapas.
