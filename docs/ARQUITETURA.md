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

## Segurança e privacidade

Arquivos e dados são processados localmente. Não devem ser adicionados ao
repositório. Caso o projeto passe a usar armazenamento remoto, a próxima
arquitetura deverá prever autenticação, segregação por cliente, criptografia,
política de retenção e adequação à LGPD antes de receber dados reais.
