# Importação Contábil

Projeto web modular para preparar, conciliar e transformar dados financeiros em lançamentos de importação contábil.

## Arquitetura

Cada processo é independente e terá sua própria página, regras e JavaScript. Um processo poderá ser usado sozinho ou alimentar o processo seguinte.

### Processo 01 — Normalização dos arquivos

Status: **estrutura responsiva completa / primeira versão funcional do Processo 01 para CSV e TXT delimitado**.

## Interface

- painel responsivo para computador e celular;
- navegação completa entre os oito processos;
- estrutura de entrada, processamento e saída preparada para as próximas automações;
- menu móvel e estados acessíveis;
- Processo 01 funcional para normalização, validação, retomada e exportação local;
- Processo 02 funcional para fechamento diário banco × relatório;
- Processos 03 a 08 com motores locais funcionais e resultados persistidos;
- contexto do lote e progresso persistidos somente no navegador;
- contrato de dados compartilhado e trilha de auditoria local.

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
2. Fechamento diário banco × relatório — **primeira automação funcional**
3. Desmembramento dos pagamentos — **motor funcional**
4. Identificação das notas fiscais — **motor funcional**
5. Identificação das contas contábeis — **motor funcional**
6. Identificação do histórico — **motor funcional**
7. Validação final — **motor funcional**
8. Layout de importação — **motor funcional**

## Segurança

O repositório é público. Não envie arquivos reais de clientes, extratos, CNPJs, CPFs, notas fiscais ou qualquer informação confidencial para o GitHub. Os arquivos processados pela interface ficam no navegador; a aplicação não possui backend nesta versão.
