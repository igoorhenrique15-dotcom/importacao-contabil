# Arquitetura do fluxo

## Lote

Cada trabalho possui um identificador local e os campos:

- cliente;
- competência;
- banco e conta;
- sistema contábil de destino;
- etapa atual e status das oito etapas;
- registros normalizados;
- configuração de cada etapa (tolerâncias, regras de conta, modelo de
  histórico, layout de destino);
- modelos de mapeamento;
- trilha das últimas ações.

O estado é salvo no navegador sob a chave versionada `contabil-flow:v2`. Nesta
fase não existe transmissão para servidor.

## O que é gravado e o que é recalculado

Só a **entrada** vai para o disco: os lançamentos normalizados do Processo 01,
a configuração de cada etapa, o status das etapas e a trilha de auditoria. A
saída de cada processo é **derivada** e reconstruída sob demanda por
`assets/js/pipeline.js`, a partir da entrada e das configurações.

Guardar as oito saídas custava 4,3 MB para mil lançamentos e estourava o teto
de 5 MB do `localStorage` antes de um mês de trabalho. Guardando só a entrada,
dez mil lançamentos ocupam 3,2 MB. Como os motores são rápidos, refazer a
cadeia inteira (cerca de 1 s para dez mil lançamentos, com cache em memória
depois disso) é mais barato do que armazená-la.

## Correção manual

Nenhum motor acerta sempre. Uma correção feita na tela é gravada em
`lot.overrides[idDoLançamento]` e **faz parte da entrada**, não do resultado:
`pipeline.js` a reaplica ao fim de cada etapa, então reexecutar o Processo 05
não desfaz uma conta corrigida à mão. Quem revisou sabe mais que a regra.

Dá para corrigir conta de débito e crédito (Processo 05), histórico (Processo
06) e se um registro vai ou não para o arquivo (Processo 04). Forçar uma linha
a sair do arquivo faz a conferência contra o extrato acusar a diferença na
hora — a correção não escapa do controle.

O botão de desfazer remove **todas** as correções daquele lançamento, não só a
da etapa em que se está.

Renormalizar gera identificadores novos, então as correções da versão anterior
deixam de casar com qualquer lançamento e são descartadas — o descarte fica
registrado na trilha. Sem isso elas ficariam gravadas para sempre, ocupando
espaço e sem efeito.

Editar o contexto do lote também invalida o que já foi calculado, porque a
competência entra na validação.

As regras de conta do Processo 05 são guardadas por cliente, em
`state.rulesByClient`, e não dentro do lote: o plano de contas de uma empresa
não muda de um mês para o outro. Um lote novo do mesmo cliente já abre com as
regras do lote anterior.

Consequência prática: **os motores precisam ser determinísticos**. Mesma
entrada e mesma configuração têm de produzir sempre a mesma saída, senão o que
o usuário vê ao reabrir a página difere do que ele viu ao executar. Um teste
cobre isso.

O limite operacional é de 10.000 registros por lote — medido, não estimado.

## Contrato do lançamento normalizado

Cada registro contém:

- `id`: identificador rastreável;
- `origem`: banco ou relatório;
- `arquivo` e `linha`: referência à entrada;
- `data`, `descricao`, `valor`, `debito`, `credito`, `documento`;
- `status`: válido ou com aviso;
- `issues`: inconsistências encontradas;
- `original`: valores relevantes antes da normalização.

## Status das etapas

- `pending`: ainda não iniciada;
- `in_progress`: em execução;
- `complete`: concluída;
- `warning`: concluída com pendências.

## Encadeamento processual

O lote possui um único conjunto lógico de lançamentos. Cada etapa recebe a
saída persistida da anterior, preserva os campos existentes e acrescenta sua
transformação:

`01 → 02 → 03 → 04 → 05 → 06 → 07 → 08`

- 01 cria os registros normalizados;
- 02 acrescenta status e diferença do fechamento diário;
- 03 acrescenta vínculos do desmembramento;
- 04 acrescenta documento, confiança e correspondência;
- 05 acrescenta contas e regra aplicada;
- 06 acrescenta o histórico;
- 07 acrescenta erros, avisos e aprovação;
- 08 converte a última versão validada no layout final.

Ao executar novamente uma etapa, os resultados das etapas posteriores são
invalidados para impedir que uma exportação antiga seja usada com dados novos.

## O que vira lançamento contábil

O extrato prova que o dinheiro se moveu; o relatório diz a quem e por quê.
Quando os dois descrevem o mesmo fato, o lançamento sai do relatório, que é
onde estão o fornecedor, o documento e a natureza da despesa. Cada registro
recebe um campo `posting`:

| `posting` | Origem | Situação | Vai para o arquivo? |
| --- | --- | --- | --- |
| `lancamento` | relatório | vinculado a um movimento do extrato | sim |
| `lancamento` | banco | sem contrapartida no relatório (tarifa, IOF, débito automático) | sim |
| `agregador` | banco | pagamento agrupado que foi desmembrado | não — quem vai são os itens |
| `espelho` | banco | já lançado pelo relatório | não — seria o mesmo fato duas vezes |
| `pendencia` | relatório | sem movimentação correspondente no extrato | não — fica para revisão |

Exemplo. O extrato do Itaú traz `SISPAG FORNECEDORES 10.000,00` numa linha só,
e o relatório detalha `João 5.000,00` e `Ferro Velho 5.000,00`. O arquivo final
recebe **dois** lançamentos, um por fornecedor, cada um com sua conta e sua
nota. A linha do SISPAG não entra: ela é o agregador.

## Conferência contra o extrato

`reconcileTotals` compara a soma dos registros marcados como `lancamento` com a
movimentação do extrato. Só passam adiante lotes em que os dois valores batem
dentro da tolerância — é o controle que impede o arquivo de duplicar valor. O
Processo 08 recusa a exportação quando o lote não confere.

O valor exportado é sempre positivo: a direção do lançamento vem das contas de
débito e crédito, não do sinal.

## Backup e vários lotes

Tudo vive no navegador, então limpar os dados do site ou trocar de computador
apagaria o trabalho. A barra do lote traz **Backup**, que exporta o lote inteiro
em JSON — lançamentos, configurações, correções manuais e trilha — e importa de
volta criando um lote novo, sem sobrescrever o atual.

O arquivo importado vem de fora e é tratado como tal: formato conferido, tipos
validados campo a campo e limite de lançamentos respeitado antes de qualquer
coisa entrar no estado.

O seletor ao lado troca de lote e cria lotes novos, para atender mais de um
cliente no mesmo navegador.

> O backup contém lançamentos do cliente. Guarde-o com o mesmo cuidado dos
> arquivos originais e nunca o adicione ao repositório.

## Exportação por etapa

Cada processo exporta a própria saída em CSV, com as colunas acumuladas até
ali, para conferência fora do sistema. O Processo 08 exporta o layout final.

## Conteúdo vindo dos arquivos

Descrições, documentos e datas saem do arquivo do usuário e podem conter
qualquer texto — inclusive marcação HTML, já que uma data não reconhecida
preserva o texto original da célula. Todo valor de origem externa é escapado
antes de ser inserido na página. Ao acrescentar uma coluna a qualquer tabela,
passe o valor pela função de escape do módulo.

## Segurança e privacidade

Arquivos e dados são processados localmente. Não devem ser adicionados ao
repositório. Caso o projeto passe a usar armazenamento remoto, a próxima
arquitetura deverá prever autenticação, segregação por cliente, criptografia,
política de retenção e adequação à LGPD antes de receber dados reais.
