# Arquitetura DURR

## Regra principal de organização

Toda rotina relacionada a integração no DURR permanece sob a mesma key:

`durr.main.dev.integracao`

As classes são diferenciadas pelo nome, e não pela criação de novos níveis de key.

Exemplos existentes:

- `durr.main.dev.integracao.restimport`
- `durr.main.dev.integracao.importfolha`
- `durr.main.dev.integracao.businessImportFolha`
- `durr.main.dev.integracao.utilsimportfolha`

## Regra para novas integrações

Para a rotina de Compra Flex, NÃO criar namespaces como:

- `durr.main.dev.utils`
- `durr.main.dev.file`
- `durr.main.dev.rest`
- `durr.main.dev.business.compraflex`

As novas classes de integração devem permanecer em:

`durr.main.dev.integracao`

alterando apenas o nome da classe/pattern.

Os nomes definitivos da Compra Flex devem ser definidos a partir das referências reais existentes no ambiente, sem inventar um novo padrão arquitetural.

## Padrão de implementação

- Seguir o estilo e as convenções já utilizadas pelo DURR.
- Preservar o formato de módulos/IIFE encontrado nas classes atuais.
- Utilizar `plusoftcrm.libs.main.source` conforme as referências existentes.
- Reutilizar padrões existentes de logger, require, tratamento de erro e retorno.
- Não migrar a implementação para uma arquitetura externa ou mais moderna se isso quebrar o padrão DURR.
- Referências de outras keys podem ser consultadas para entender regras de compra, geração de arquivo, integrações e utilidades, mas o código novo do DURR deve respeitar a arquitetura DURR.

## Compra Flex - responsabilidade inicial

O desenvolvimento deverá ser estruturado a partir das responsabilidades já definidas:

1. classe de leitura/manipulação do arquivo;
2. REST que recebe o objeto;
3. Utils com validações/regras de negócio;
4. orquestração da compra, caso o padrão existente indique uma classe separada.

Todas as classes que fizerem parte dessa integração devem permanecer sob `durr.main.dev.integracao`.

## Uso das referências completas

A pasta `referencias/ambiente-completo` é somente contexto técnico do ambiente exportado.

Ela pode ser usada para localizar:

- rotinas de compra existentes;
- integrações atuais;
- geração/leitura de arquivos;
- padrões de Excel/CSV;
- chamadas REST;
- validações de negócio;
- bibliotecas e helpers já disponíveis.

Essas referências NÃO autorizam copiar a arquitetura de outra key para o DURR.

Quando houver conflito entre uma referência externa e o padrão DURR, prevalece o padrão DURR.
