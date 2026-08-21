# Importação Contábil

Projeto web modular para preparar, conciliar e transformar dados financeiros em lançamentos de importação contábil.

## Arquitetura

Cada processo é independente e terá sua própria página, regras e JavaScript. Um processo poderá ser usado sozinho ou alimentar o processo seguinte.

### Processo 01 — Normalização dos arquivos

Status: **em implementação / primeira versão funcional para CSV e TXT delimitado**.

Entrada:
- arquivo do banco;
- relatório do cliente.

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

1. Normalização dos arquivos
2. Fechamento diário banco × relatório
3. Desmembramento dos pagamentos
4. Identificação das notas fiscais
5. Identificação das contas contábeis
6. Identificação do histórico
7. Validação final
8. Layout de importação

## Segurança

O repositório é público. Não envie arquivos reais de clientes, extratos, CNPJs, CPFs, notas fiscais ou qualquer informação confidencial para o GitHub. Os arquivos processados pela interface ficam no navegador; a aplicação não possui backend nesta versão.
