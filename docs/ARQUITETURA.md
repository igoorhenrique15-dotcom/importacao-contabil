# Arquitetura do fluxo

## Lote

Cada trabalho possui um identificador local e os campos:

- cliente;
- competência;
- banco e conta;
- sistema contábil de destino;
- etapa atual e status das oito etapas;
- registros normalizados;
- resultado do fechamento diário;
- modelos de mapeamento;
- trilha das últimas ações.

O estado é salvo no navegador sob a chave versionada `contabil-flow:v2`. Nesta
fase não existe transmissão para servidor. O limite operacional é de 10.000
registros salvos por lote.

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
