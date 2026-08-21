# Importação de Afastados — resumo de subida

## Patterns criados

| Nome InPaaS | Key | Arquivo | Responsabilidade |
|---|---|---|---|
| ImportAfastados | `durr.main.dev.integracao.importafastados` | `novos/importafastados.js` | Leitura do Excel via `onrecord`, monta o DTO da linha e delega ao núcleo de negócio. |
| BusinessImportAfastados | `durr.main.dev.integracao.businessImportAfastados` | `novos/businessImportAfastados.js` | Núcleo de negócio: localizar empresa/colaborador, obter/criar tipo de afastamento, criar/atualizar/ignorar afastamento. Usado tanto pela leitura de Excel (linha a linha) quanto pelo lote REST. |
| UtilsImportAfastados | `durr.main.dev.integracao.utilsimportafastados` | `novos/utilsimportafastados.js` | Parsing de data DD/MM/AAAA específico deste layout, normalização de nome de tipo, extração de código do tipo, montagem/registro do relatório de importação. |
| BusinessTestImportAfastados | `durr.main.dev.integracao.testimportafastados` | `novos/testimportafastados.js` | Bateria de testes controlados contra dados reais de DEV (sem mocks), seguindo o padrão `run()`/`adicionar()`/`adicionarResumo()` já usado em `brhain.rh.beneficio.elegibilidade.teste`. |

## Pattern alterado

| Nome InPaaS | Key | Arquivo | Alteração |
|---|---|---|---|
| RESTImport | `durr.main.dev.integracao.restimport` | `alterados/restimport.js` | Adicionado endpoint `POST /importafastados`, delegando para `BusinessImportAfastados.importAfastados`, no mesmo padrão de delegação já usado por `/importfolha`. |

## Tabelas acessadas

- `BRH_EMPRESA` — leitura (Knex), resolução por `DS_CODIGOFOLHA`.
- `BRH_COLABORADOR` — leitura (Knex), resolução por `ID_BRH_EMPRESA` + `DS_MATRICULA`. Nunca criado/alterado por esta rotina.
- `BRH_FILIAL` — leitura (Knex), apenas para o aviso best-effort de divergência de estabelecimento.
- `BRH_TIPO_AFASTAMENTO` — leitura (Knex) e escrita (DAO/`getDao`), resolução por `ID_BRH_GRUPO_ECONOMICO` + `DS_NOME` (trim + case-insensitive).
- `BRH_AFASTAMENTO` — leitura (Knex) e escrita (DAO/`getDao`), chave funcional `ID_BRH_COLABORADOR` + `ID_BRH_TIPO_AFASTAMENTO` + `DT_INICIO`.

Todo SELECT usa Knex; todo INSERT/UPDATE/DELETE usa `inpaas.core.entity.dao` via `getDao()`, sem exceções.

## Regras principais implementadas

1. **Empresa**: coluna `Empresa` do arquivo = `BRH_EMPRESA.DS_CODIGOFOLHA`. Empresa não encontrada → erro de linha. Sentinela "Todas" explicitamente excluído mesmo que por algum motivo tivesse o código informado.
2. **Colaborador**: nunca criado. Localizado por `ID_BRH_EMPRESA` + `DS_MATRICULA`. Zero resultados → erro "Colaborador não encontrado."; mais de um → erro de ambiguidade (linha não processada em nenhum dos dois casos).
3. **Filial**: `ID_BRH_FILIAL` do afastamento sempre vem do colaborador localizado. `Código do Estabelecimento` do arquivo só gera um **aviso** (não bloqueia) quando resolve para uma filial diferente da do colaborador, via `BRH_FILIAL.DS_CODIGOFOLHA`.
4. **Tipo de afastamento**: busca por `ID_BRH_GRUPO_ECONOMICO` (do colaborador) + `DS_NOME` (trim + case-insensitive). Se não existir, cria via DAO preservando o nome completo recebido (ex.: `"FE - Férias"`) e extraindo o prefixo curto para `DS_CODIGOFOLHA` (ex.: `"FE"`) quando o padrão `CODIGO - Nome` é reconhecido. Conflito de código sem conflito de nome gera aviso, sem duplicar.
5. **Datas**: `Data de Afastamento` → `DT_INICIO`. `Data de Retorno` é o primeiro dia trabalhado → `DT_TERMINO = Data de Retorno - 1 dia`. Sem Data de Retorno → `DT_TERMINO = 9999-12-31` (aberto; `BRH_AFASTAMENTO.DT_TERMINO` é `NOT NULL` neste ambiente — ver seção "Execução real em DEV — 5ª rodada"). `Número de Dias` é validado contra `DataRetorno - DataAfastamento` quando ambos existem; divergência → erro de linha, nada é persistido.
6. **Idempotência**: chave funcional `ID_BRH_COLABORADOR + ID_BRH_TIPO_AFASTAMENTO + DT_INICIO`. Já existe e é idêntico (mesmo `DT_TERMINO` e `NR_QUANTIDADE`, tratando `null` e `9999-12-31` como equivalentes de "aberto") → nenhuma escrita, linha reportada como já sincronizada. Já existe e mudou → `UPDATE` apenas de `DT_TERMINO`/`NR_QUANTIDADE`. Não existe → `INSERT`.
7. **Relatório**: `totalRecebidos`, `totalCriados`, `totalAtualizados`, `totalSemAlteracao`, `totalFalhas`, `avisos[]`, `erros[]`, identificando cada entrada pela matrícula da linha.

## Divergência técnica identificada e resolvida (não é regra de negócio do prompt)

O utilitário existente `utilsimportfolha.converterDataBr` interpreta a primeira parte da data como mês. As datas do layout de afastados estão gravadas como **texto** dentro do `.xlsx` (confirmado no XML: `type="s"`, não é data nativa do Excel) no formato `DD/MM/AAAA`. Reaproveitar `converterDataBr` inverteria dia/mês nesta rotina. Foi implementado um parser dedicado (`converterDataAfastamento`) em `UtilsImportAfastados`, sem alterar o utilitário existente do ImportFolha (fora de escopo). Essa conclusão foi validada cruzando ~50 linhas do arquivo modelo real: em toda linha com `Data de Retorno` preenchida, `Número de Dias == DataRetorno − DataAfastamento` exatamente, sem exceção.

## Estabelecimento/Filial — decisão confirmada com o usuário

Não há dado real de `BRH_FILIAL` no snapshot DURR (só código-fonte). O campo `DS_CODIGOFOLHA` em `BRH_FILIAL` é usado de forma consistente em múltiplas rotinas legadas BRHAIN (mesmo schema `BRH_`) para resolver "código de folha da filial". Decisão confirmada com o usuário: validação best-effort com aviso — `ID_BRH_FILIAL` sempre vem do colaborador; se `BRH_FILIAL` resolver por `DS_CODIGOFOLHA` e divergir da filial do colaborador, gera aviso (não bloqueia).

## Campos do layout sem destino nesta V1

`Nome` (mantido apenas para identificar a linha em log/relatório), `Função`, `Centro de Resultado`, `Descrição de Centro de Resultado`, `Data de Admissão`, `Motivo Interno do Afastamento`, `Data Previsão Perícia INSS`, `Protocolo Agendamento Perícia`, `Número Benefício`. Não persistidos — sem entidade/campo comprovado no DURR para recebê-los nesta demanda.

## Casos de teste (`BusinessTestImportAfastados.run()`)

Executa contra um colaborador real localizado dinamicamente em DEV (empresa `DS_CODIGOFOLHA=1`), sem hardcode de matrícula. Cria e remove ao final apenas registros com prefixo `ZZ_TESTE_IMPORTAFASTADOS` (tipos) e os afastamentos de teste criados (por ID capturado em cada cenário), em bloco `try/finally`.

1. Tipo já existe pelo nome → reaproveita o ID, não cria tipo novo.
2. Tipo não existe → cria `BRH_TIPO_AFASTAMENTO`, usa o ID criado no afastamento.
3. Várias linhas com o mesmo tipo novo → apenas um `BRH_TIPO_AFASTAMENTO` criado.
4. Reprocessar a mesma linha → não duplica o afastamento (`semAlteracao`).
5. Afastamento aberto → criado com `DT_TERMINO = 9999-12-31`; segunda carga com retorno atualiza o mesmo `ID_BRH_AFASTAMENTO`, com `DT_TERMINO = Data de Retorno - 1 dia`.
6. Colaborador inexistente → erro de linha, sem criar colaborador nem afastamento.
7. Empresa inexistente → erro de linha.
8. Data inválida → erro de linha, nada persistido.
9. Número de dias divergente → erro de linha, nada persistido.
10. Diferença de caixa/espaço no nome do tipo → reaproveita o mesmo tipo, sem duplicar.

Se não houver nenhum colaborador para `DS_CODIGOFOLHA=1` no ambiente onde o teste rodar, os casos dependentes de colaborador real são marcados como `NAO_APLICAVEL` (mesmo padrão usado em `brhain.rh.beneficio.elegibilidade.teste`), e apenas o caso de empresa inexistente é executado.

## Execução real em DEV — 1ª rodada e correção aplicada

`BusinessTestImportAfastados.run()` foi executado em DEV. Resultado da 1ª rodada: 4/14 sucesso, 10 falhas, todas com a mesma causa raiz:

```
Erro ao processar afastamento: (tiposDoGrupo || []).filter is not a function
```

O resultado do Knex `.find()` neste runtime InPaaS/Nashorn não é um `Array` nativo (não implementa `.filter`/`.map`) — só oferece `.length` e acesso indexado. Essa mesma armadilha já existia documentada no código legado (`brhain.rh.gestao.utils.afastamento.js`, função `validarSuspensaoBeneficio`): um `.forEach()` está comentado no meio do arquivo e substituído por um `for` indexado, exatamente pelo mesmo motivo.

Corrigido em `obterOuCriarTipoAfastamento` (`businessImportAfastados.js`) e em `limparDadosDeTeste` (`testimportafastados.js`): as buscas por `.filter(...)[0]` e o `.forEach(...)` sobre resultado de `.find()` foram substituídos por loop `for` indexado, sem alterar nenhuma regra de negócio. Os 4 casos que não passam por `obterOuCriarTipoAfastamento` (Casos 6, 7, 8 e 9) já haviam passado na 1ª rodada, confirmando que o bug estava isolado nessa função.

## Execução real em DEV — 2ª rodada e divergência de schema encontrada

Após a correção do `.filter`, os 4 casos que não criam tipo (6, 7, 8, 9) continuaram passando e os 10 restantes passaram a falhar todos com:

```
error.entity.attribute.notnull — entity: BRH_TIPO_AFASTAMENTO, field: DS_CODIGOFOLHA
```

**Divergência real encontrada:** `BRH_TIPO_AFASTAMENTO.DS_CODIGOFOLHA` é `NOT NULL` neste ambiente. O prompt original (seção 9) trata a extração de código como opcional ("é permitido extrair o prefixo... quando o padrão é reconhecido"), sem prever o caso de nome sem prefixo reconhecível. Isso nunca afeta o layout real de afastados — os 7 tipos confirmados no arquivo modelo (`FE`, `AT`, `BE`, `RC`, `SC`, `LM`, `LR`) seguem 100% o padrão `CODIGO - Nome`. O erro só apareceu porque os nomes de tipo usados no teste (`ZZ_TESTE_IMPORTAFASTADOS - ...`) tinham um prefixo com underscore/mais de 10 caracteres, que não bate com o padrão reconhecido.

**Impacto:** sem correção, uma linha real cujo `Tipo de Afastamento` não seguisse `CODIGO - Nome` quebraria com uma exceção de banco crua (`error.entity.attribute.notnull`) em vez de um erro de linha tratado.

**Correção aplicada** em `obterOuCriarTipoAfastamento` (`businessImportAfastados.js`): quando nenhum código é reconhecível no nome do tipo, a linha agora é rejeitada como erro de negócio ("Tipo de afastamento sem código reconhecível...") *antes* de tentar o `INSERT`, em vez de deixar a validação de banco estourar. Não há mudança de comportamento para o layout real (sempre com código reconhecível). Os nomes de tipo no teste que efetivamente criam `BRH_TIPO_AFASTAMENTO` foram ajustados para seguir o mesmo padrão `CODIGO - Nome` do layout real (ex.: `"ZA - ZZ_TESTE_IMPORTAFASTADOS Automatizado"`), e o filtro de limpeza do teste passou a buscar o marcador `ZZ_TESTE_IMPORTAFASTADOS` como substring do nome (antes buscava só como prefixo).

Confirmado pelo usuário após validação real em DEV: a `DS_CHAVEESTRATEGICA` do layout está correta (o processamento chega até as validações de empresa/colaborador/tipo em `BusinessdelegateDataimportutils`) e não precisa de nova investigação.

## Execução real em DEV — 3ª rodada: onfinish ausente

`BusinessdelegateDataimportutils` chama `strategySource.onfinish(importlog)` sempre que a estratégia existe, sem checar `hasOwnProperty('onfinish')`. `ImportAfastados.onfinish` existia mas tinha corpo vazio (retornava `undefined`).

**Correção aplicada** em `importafastados.js`: `onfinish(importlog)` agora retorna `importlog`, mesmo padrão mínimo coerente com o restante da integração.

O log `"Erro ao invocar o método onfinish, estratégia: undefined"` não indica key ausente — o logger legado do delegate imprime `layout["nr_sequencia"]` nessa mensagem, por isso aparece `undefined`. O `BusinessdelegateDataimportutils` legado não foi alterado.

## Execução real em DEV — 4ª rodada: campos undefined vindos do Knex sem `.select()`

Na importação da massa real, o DAO travou no `INSERT` de `BRH_AFASTAMENTO`:

```
error.entity.attribute.notnull — entity: BRH_AFASTAMENTO, field: ID_BRH_EMPRESA
```

**Causa raiz confirmada:** nenhum acesso do código usa uppercase (`.ID_...`) — todo acesso já era lowercase. O problema é que toda consulta Knex que **não** usa `.select(...)` explícito (`localizarEmpresa`, `localizarColaborador`, o filial em `validarEstabelecimento`, `tiposDoGrupo` em `obterOuCriarTipoAfastamento`, `localizarAfastamentoExistente`, e as consultas equivalentes em `testimportafastados.js`) devolvia objetos cujos campos ficavam `undefined` ao serem lidos em lowercase. Como os únicos pontos que checavam esses resultados testavam apenas a existência do objeto (`if (!empresa)`, `lista.length`), nunca o valor dos campos, o `undefined` passou despercebido até o `INSERT`.

Confirmado com código DURR já validado (`ambiente-atual/durr/core-pattern/durr/main/dev/business/elegibilidade.js:31-56`, `obterParametrosColaborador`): usa `.select('C.ID_BRH_EMPRESA', ...)` explícito e acessa `colaborador.id_brh_empresa` lowercase — funciona porque o `.select()` é explícito.

**Correção aplicada:**
- `.select(...)` explícito adicionado em todas as consultas Knex de `businessImportAfastados.js` e `testimportafastados.js` (só as colunas efetivamente usadas).
- `montarDadosAfastamento` e `validarEstabelecimento` passaram a usar `empresa.id_brh_empresa` (já resolvida e validada) em vez de `colaborador.id_brh_empresa`, conforme o fluxo real: `Empresa do arquivo → resolve BRH_EMPRESA → localiza colaborador por ID_BRH_EMPRESA + matrícula`.
- Validação funcional adicionada em `processarAfastamento`, antes do `INSERT`: se `empresa.id_brh_empresa`, `colaborador.id_brh_colaborador` ou `tipoAfastamento.id_brh_tipo_afastamento` não resolverem, a linha vira erro funcional em vez de tentar o `INSERT`.

Reexecução da importação da massa real em DEV após as quatro correções (`.filter`, `DS_CODIGOFOLHA`, `onfinish`, `.select()`) criou corretamente 3 dos 4 registros da massa (Paulo/FE e as duas linhas de Jorge/AT), confirmando resolução de empresa, colaborador, tipo, parsing de datas, `Data Retorno - 1 dia`, localização de afastamento existente e criação via DAO.

## Execução real em DEV — 5ª rodada: DT_TERMINO obrigatório em afastamento aberto

A única linha da massa que falhou foi o afastamento em aberto (sem Data de Retorno):

```
error.entity.attribute.notnull — entity: BRH_AFASTAMENTO, field: DT_TERMINO
```

**Divergência real encontrada:** ao contrário do assumido inicialmente, `BRH_AFASTAMENTO.DT_TERMINO` é `NOT NULL` neste ambiente. Há evidência no legado `BRH_` de afastamentos em aberto persistidos com `DT_TERMINO = 9999-12-31`.

**Correção aplicada:**
- `validarDatas` (`businessImportAfastados.js`) passou a gravar `DT_TERMINO = 9999-12-31` (via `UtilsImportAfastados.dataTerminoAberto()`) quando não há Data de Retorno, em vez de `null`. A Data de Retorno nunca é preenchida artificialmente — o sentinela existe só na persistência de `DT_TERMINO`.
- Nova função `UtilsImportAfastados.ehAfastamentoAberto(dtTermino)` centraliza o reconhecimento de "aberto", tratando tanto `null` (compatibilidade com dado legado) quanto `9999-12-31`.
- `possuiAlteracao` (`businessImportAfastados.js`) passou a usar `ehAfastamentoAberto` para não considerar `null` vs `9999-12-31` uma alteração funcional quando ambos representam "aberto" — evita `UPDATE` desnecessário ao reprocessar um afastamento legado em aberto.
- A localização de afastamento existente (`ID_BRH_COLABORADOR + ID_BRH_TIPO_AFASTAMENTO + DT_INICIO`) e a atualização por esse mesmo `ID_BRH_AFASTAMENTO` (item 6 acima) já cobriam a transição "aberto → com retorno" sem criar novo registro; nenhuma mudança adicional foi necessária nessa parte.
- `BusinessTestImportAfastados` (Caso 5a) ajustado para esperar `DT_TERMINO = 9999-12-31` em vez de `null`.

Reexecução do `run()` em DEV após esta correção revelou uma 2ª causa raiz (ver seção seguinte); a linha em aberto da massa real ainda não foi reexecutada.

## Execução real em DEV — 6ª rodada: comparação de DT_INICIO via Knex quebra no Postgres

`BusinessTestImportAfastados.run()` executado em DEV: 8 dos 14 casos falharam, todos os que passam por `localizarAfastamentoExistente`, com:

```
ERROR: operator does not exist: timestamp without time zone = character varying
Hint: No operator matches the given name and argument types. You might need to add explicit type casts.
SQL: SELECT ID_BRH_AFASTAMENTO, DT_TERMINO, NR_QUANTIDADE FROM BRH_AFASTAMENTO WHERE ID_BRH_COLABORADOR = #var_1# and ID_BRH_TIPO_AFASTAMENTO = #var_2# and DT_INICIO = #var_3# LIMIT 1
```

Os 6 casos que não chamam `localizarAfastamentoExistente` (empresa/colaborador inexistente, data inválida, número de dias divergente) continuaram passando, isolando a causa nessa função.

**Divergência real encontrada:** o Knex deste ambiente serializa o `Date` do JS passado em `.where('DT_INICIO', dtInicio)` como `character varying` no bind da query, e `DT_INICIO` é `timestamp without time zone` no Postgres — sem cast implícito entre os dois tipos, a comparação falha em runtime (não é um erro de sintaxe, só aparece na execução real contra o banco).

**Correção aplicada** em `localizarAfastamentoExistente` (`businessImportAfastados.js`): `DT_INICIO` saiu do `WHERE` do Knex. A busca agora filtra só por `ID_BRH_COLABORADOR` + `ID_BRH_TIPO_AFASTAMENTO` e o `DT_INICIO` é comparado em JS, com `UtilsImportAfastados.normalizarValorComparacaoData` (mesma função já usada em `possuiAlteracao`), no mesmo padrão de loop indexado já usado no arquivo para contornar resultado de `.find()` sem `.filter()`.

Reexecução do `run()` em DEV após esta correção: 12/14 sucesso (subiu de 6/14). Os 6 casos que dependiam de `localizarAfastamentoExistente` passaram a funcionar, incluindo a correção de `DT_TERMINO` (Casos 5a/5b). As 2 falhas restantes têm causa raiz diferente, tratada na rodada seguinte.

## Execução real em DEV — 7ª rodada: comparação de ID por `===` entre tipos numéricos distintos

Após a 6ª rodada, restaram 2 falhas — Caso 4 e Caso 5b — mas em ambas o `detalhes` do resultado mostrava o comportamento correto (mesmo `ID_BRH_AFASTAMENTO`, ação `semAlteracao`/`atualizado`, sem duplicar). A causa não era de negócio, e sim do teste: as asserções comparavam `r3.idAfastamento === r1.idAfastamento` (e equivalente em 5b) com `===` estrito.

**Causa raiz:** `r1.idAfastamento` vem do objeto mutado pelo `DAO.insert()` (`criarAfastamento`); `r3.idAfastamento`/`r2.idAfastamento` (branches `semAlteracao`/`atualizado`) vêm de um registro lido via Knex (`localizarAfastamentoExistente`/`atualizarAfastamento`). Nesse runtime Nashorn, os dois caminhos produzem tipos Java subjacentes diferentes para o mesmo valor numérico (ex.: Integer vs. Long/BigDecimal), então `===` retorna `false` mesmo com o mesmo valor. A rotina de produção nunca compara IDs entre si (só `DT_TERMINO`/`NR_QUANTIDADE` em `possuiAlteracao`), então esse problema é exclusivo do teste.

**Correção aplicada** em `testimportafastados.js` (Casos 4 e 5b): as comparações passaram a usar `Number(r3.idAfastamento) === Number(r1.idAfastamento)`, coagindo ambos os lados para número primitivo antes de comparar.

Reexecução do `run()` em DEV após esta correção ainda está pendente de confirmação.

## Pendências

- Confirmar em DEV que os 14 casos do `BusinessTestImportAfastados.run()` passam após todas as correções acima (`DT_TERMINO` em aberto, `DT_INICIO` no `WHERE`, comparação de ID no teste).
- Confirmar em DEV que a linha em aberto da massa real agora é criada com `DT_TERMINO = 9999-12-31`.
- Duplicidades pré-existentes em `BRH_AFASTAMENTO`/`BRH_TIPO_AFASTAMENTO` (se houver) não são corrigidas por esta importação — apenas reportadas via as consultas de auditoria abaixo.

## Validações estáticas executadas

- `node --check` em todos os `.js` novos/alterados — todos OK.
- `git diff --check` — sem erros de espaço em branco (apenas aviso informativo de LF/CRLF do Git, sem impacto).
- `git status --short` conferido — nenhum arquivo de `exports/original/`, `referencias/ambiente-completo/` ou `dev-*-dbexport-*.csv` staged ou alterado.
- Hash (SHA-256) de cada arquivo em `novos/` e `alterados/` conferido byte a byte contra o arquivo final em `ambiente-atual/durr/core-pattern/durr/main/dev/integracao/` — idênticos.

## SQLs de auditoria de duplicidade

Afastamentos duplicados pela chave funcional:

```sql
SELECT
    ID_BRH_COLABORADOR,
    ID_BRH_TIPO_AFASTAMENTO,
    DT_INICIO,
    COUNT(*) AS QTDE
FROM BRH_AFASTAMENTO
GROUP BY
    ID_BRH_COLABORADOR,
    ID_BRH_TIPO_AFASTAMENTO,
    DT_INICIO
HAVING COUNT(*) > 1;
```

Tipos de afastamento duplicados pelo nome normalizado:

```sql
SELECT
    ID_BRH_GRUPO_ECONOMICO,
    UPPER(TRIM(DS_NOME)) AS NOME_NORMALIZADO,
    COUNT(*) AS QTDE
FROM BRH_TIPO_AFASTAMENTO
GROUP BY
    ID_BRH_GRUPO_ECONOMICO,
    UPPER(TRIM(DS_NOME))
HAVING COUNT(*) > 1;
```

Rodar antes e depois de qualquer carga/teste em DEV. Duplicidades pré-existentes não são corrigidas automaticamente por esta rotina.
