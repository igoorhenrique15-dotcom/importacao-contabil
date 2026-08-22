# Importação Contábil

Projeto web modular para preparar, conciliar e transformar dados financeiros em lançamentos de importação contábil.

## Arquitetura

Cada processo tem sua própria página, regras e JavaScript. Um processo pode ser usado sozinho ou alimentar o processo seguinte.

Status: **os oito processos têm motor funcional e encadeado**. O resultado de
cada etapa é salvo no navegador e alimenta a seguinte.

### Organização do código

| Arquivo | Responsabilidade |
| --- | --- |
| `assets/js/core.js` | Estado do lote, persistência local e invalidação em cadeia. |
| `assets/js/parsers.js` | Leitura de CSV/TXT/OFX e normalização de valores e datas. |
| `assets/js/engines.js` | Regras dos processos 02 a 08. |
| `assets/js/pipeline.js` | Reconstrói a saída de cada etapa a partir da entrada gravada. |
| `assets/js/process-runner.js` | Interface dos motores 03 a 08. |
| `assets/js/process-shell.js` | Estrutura comum das páginas 03 a 08. |
| `assets/js/workspace.js` | Barra do lote, modal de contexto e progresso. |
| `processos/01-normalizacao/app.js` | Interface do Processo 01. |
| `processos/02-fechamento/app.js` | Interface e regra do Processo 02. |

## Testes

A suíte não tem dependências. Na raiz do repositório:

```
node tests/run.js
```

Cobre os leitores de arquivo, os motores 03 a 08, o encadeamento entre etapas,
as regras de invalidação do lote e a integridade das páginas estáticas.

O teste ponta a ponta percorre o fluxo 01 → 08 em um navegador real e é
opcional:

```
npm install playwright-core
node tests/e2e.js
```

Sem o pacote instalado ele se declara pulado em vez de falhar.

## Interface

- painel responsivo para computador e celular;
- navegação completa entre os oito processos;
- entrada, regra e saída declaradas em cada etapa;
- menu móvel e estados acessíveis;
- Processo 01 funcional para normalização, validação, retomada e exportação local;
- Processo 02 funcional para fechamento diário banco × relatório;
- Processos 03 a 08 com motores locais funcionais e resultados persistidos;
- conteúdo vindo dos arquivos é sempre escapado antes de ir para a tela;
- contas, histórico e destino de cada lançamento corrigíveis na tela, com a
  correção sobrevivendo a reexecutar a etapa;
- contexto do lote e progresso persistidos somente no navegador;
- só a entrada é gravada; o resultado de cada etapa é recalculado sob demanda,
  o que faz um lote de 10.000 lançamentos caber no navegador;
- contrato de dados compartilhado e trilha de auditoria local.

Entrada:
- arquivo do banco (CSV, TXT delimitado ou OFX);
- relatório do cliente (CSV ou TXT delimitado).

Saída padronizada:
- origem;
- linha original;
- data;
- descrição;
- valor;
- débito;
- crédito;
- documento/NF.

O processo permite mapear manualmente as colunas, normaliza datas e valores e exporta um CSV padronizado. Ele **não faz conciliação** nesta etapa.

## Roadmap

Os oito processos estão implementados e encadeados:

1. Normalização dos arquivos
2. Fechamento diário banco × relatório
3. Desmembramento dos pagamentos
4. Identificação das notas fiscais
5. Identificação das contas contábeis
6. Identificação do histórico
7. Validação final
8. Layout de importação

### Estado real

O fluxo roda ponta a ponta e o arquivo final já confere com o extrato: só vão
para a exportação os registros que representam um lançamento contábil real, e a
exportação é recusada quando o total não bate.

Falta o layout do **Questor**, o sistema de destino. Os três layouts atuais não
seguem especificação oficial de software nenhum, então o arquivo gerado serve
para conferência, não para importação. Ver
[docs/PLANO-DE-EVOLUCAO.md](docs/PLANO-DE-EVOLUCAO.md).

## Segurança

O repositório é público. Não envie arquivos reais de clientes, extratos, CNPJs, CPFs, notas fiscais ou qualquer informação confidencial para o GitHub. Os arquivos processados pela interface ficam no navegador; a aplicação não possui backend nesta versão.
