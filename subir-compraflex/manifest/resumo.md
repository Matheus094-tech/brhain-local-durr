# Pacote de subida — Compra de Benefício Flex

Pacote físico de entrega das 6 classes novas da rotina de Compra de Benefício
Flex/FlexCard. Origem: `ambiente-atual/durr/core-pattern/durr/main/dev/business/`
(cópias — os arquivos originais dessa pasta **não** foram movidos/removidos).

A Compra de Benefício Flex **não é iniciada por REST**. O fluxo real é
iniciado por um botão da tela de `BRH_COMPRA_BENEFICIO`, no padrão legado de
classes de botão (`actions`/`invoke`). `RESTCompraBeneficio` foi removida do
escopo desta entrega.

## Classes

Nomes dos patterns no InPaaS levam prefixo `Business` para as classes sob
`durr.main.dev.business.*`, seguindo o padrão já usado por
`BusinessElegibilidade`/`BusinessElegibilidadeFlex`. A classe de botão não
leva o prefixo (segue o padrão de classes de botão do legado).

| Classe (Nome no InPaaS) | Key completa | Status | Responsabilidade resumida |
|---|---|---|---|
| CompraBeneficioBotoes | `durr.main.dev.business.comprabeneficiobotoes` | Novo | Classe de botão da tela de `BRH_COMPRA_BENEFICIO` (`getActions`/`invoke`, padrão `brhain.rh.beneficio.compraBeneficios.botoes`). Disponibiliza só o botão "Calcular" (`botao-calcular`) na V1. Fina: valida o ID da compra e delega para CompraBeneficio — sem SQL, sem regra Flex. |
| BusinessCompraBeneficio | `durr.main.dev.business.comprabeneficio` | Novo | Dispatcher genérico: relê a compra/produto/tipo de produto no banco (nunca confia em `params.data`), identifica a estratégia por `BRH_TIPO_PRODUTO.DS_NOME` (sem hardcode de ID) e despacha para o processador específico. |
| BusinessCompraFlex | `durr.main.dev.business.compraflex` | Novo | Regra específica Flex: idempotência, benefícios vigentes por produto/empresa/filial/operadora do cabeçalho, valor da compra vindo de `BRH_CONTRATO_PLANO_CATEGORIA_FLEX`, monta detalhe/linha, gera o arquivo, persiste detalhes e só então finaliza o cabeçalho (`OP_STATUS`: 2 no início, 3 só no sucesso completo). |
| BusinessUtilsCompraFlex | `durr.main.dev.business.utilscompraflex` | Novo | Funções puras: normalização de CPF/CNPJ, competência (`MMAAAA`, com `MM/AAAA` como compatibilidade), regra de vigência (limite superior exclusivo), mapeamento plano→bucket Flash, montagem de linha, mensagens de erro. |
| BusinessArquivoCompraFlex | `durr.main.dev.business.arquivocompraflex` | Novo | Gera o arquivo XLSX no layout Flash a partir de linhas prontas, via `plusoftcrm.libs.main.excel`. Sem acesso a `BRH_BENEFICIO`. |
| BusinessTestCompraFlex | `durr.main.dev.business.testcompraflex` | Novo | Harness de DEV: massas, histórico de elegibilidade, execução real da elegibilidade, execução da compra pelo entrypoint real (`CompraBeneficioBotoes.invoke`), validação de benefícios/detalhes/arquivo. |

Nenhuma classe alterada de um sistema pré-existente — todas são novas nesta
entrega. `RESTCompraBeneficio` foi criada, revisada e **removida** ainda
dentro deste ciclo de desenvolvimento, após correção arquitetural: o entrypoint
real é o botão, não a REST.

### Correção funcional — fonte do valor da compra e NR_DIAS_COMPRA

Achado em teste real de DEV: `BRH_COMPRA_BENEFICIO_DETALHE.NR_DIAS_COMPRA` é
obrigatório, e a fonte funcional do valor da Compra Flex não é
`BRH_BENEFICIO.VL_VALOR` (snapshot da última elegibilidade) — é a
configuração **atual** de `BRH_CONTRATO_PLANO_CATEGORIA_FLEX`.

- `CompraFlex.obterValorCompraFlex(idContratoPlano)` centraliza a soma:
  consulta `BRH_CONTRATO_PLANO_CATEGORIA_FLEX` por `ID_BRH_CONTRATO_PLANO`,
  exige ao menos 1 categoria (lança erro se não houver — capturado e
  logado por colaborador afetado via `obterValorCompraFlexCache`, sem
  abortar a compra inteira), soma `NR_VALOR` sem filtrar por `OP_CATEGORIA`
  (todas as categorias do contrato/plano compõem o total nesta V1) e
  arredonda. Resultado é cacheado por contrato/plano (só existem 2 na
  compra) para não repetir a consulta por colaborador.
- `VL_BENEFICIO` e `VL_COMPRA` em `BRH_COMPRA_BENEFICIO_DETALHE` usam esse
  total, não mais `candidato.vl_valor`.
- `BRH_BENEFICIO.VL_VALOR` passou a ser **só validação auxiliar**: se
  divergir da soma atual das categorias, um `logger.warn` é emitido (com
  IDs de benefício/contrato-plano e os dois valores) e a soma das
  categorias prevalece — nunca o contrário.
- `NR_DIAS_COMPRA` é persistido como `0` em todo detalhe — Compra Flex não
  tem cálculo proporcional por dias úteis/admissão/faltas/feriados.
- Configuração comprovada em DEV: contrato/plano 8 (Refeição) = 910 + 320 =
  **1230**; contrato/plano 9 (Multibenefícios) = 910 + 320 + 615 = **1845**.
- `TestCompraFlex`: `validarBeneficioColaborador` e `validarDetalhesCompra`
  agora compartilham `somarCategoriasFlex(idContratoPlano)` (independente da
  implementação de produção, para validar de fora) e `validarDetalhesCompra`
  passou a exigir `config` (com fallback automático) para checar, por
  colaborador, `VL_COMPRA == soma das categorias` e `NR_DIAS_COMPRA == 0`,
  além da checagem já existente de `VL_COMPRATOTAL`.

### Limpeza agressiva de comentários (todas as 6 classes)

Critério aplicado: comentário não documenta implementação nem histórico da
investigação — só regra de negócio não dedutível do código, sentinela
"Todas" (quando não expressável no nome), workaround pontual de API do
InPaaS ou mapeamento técnico cuja origem não é dedutível. Máximo 1 linha por
comentário mantido.

| Arquivo | Removidos | Restantes |
|---|---|---|
| `comprabeneficio.js` | 2 | 0 |
| `comprabeneficiobotoes.js` | 0 (1 encurtado) | 1 |
| `compraflex.js` | 7 (vários encurtados) | 7 |
| `utilscompraflex.js` | 4 (2 encurtados) | 3 |
| `arquivocompraflex.js` | 0 (1 encurtado) | 1 |
| `testcompraflex.js` | 8 (2 encurtados) | 3 |

Comentários que restaram, por arquivo:

**comprabeneficio.js** — nenhum.

**comprabeneficiobotoes.js**:
```
// params.data não é usado: CompraBeneficio relê tudo do banco.
```

**compraflex.js**:
```
// BRH_COMPRA_BENEFICIO.OP_STATUS: 1 agendado, 2 execução, 3 finalizado.
// Sem BRH_COMPRA_BENEFICIO_PRODUTO: compra Flex é sempre pelo produto do cabeçalho.
// "Todas" é sentinela (DS_RAZAOSOCIAL) e não restringe empresa/filial/operadora.
// Um colaborador só pode ter um plano Flex nesta compra; mantém o primeiro.
// NR_DIAS_COMPRA é obrigatório na tabela; Compra Flex não tem cálculo proporcional.
// Valor vem de BRH_CONTRATO_PLANO_CATEGORIA_FLEX, não de BRH_BENEFICIO.VL_VALOR.
```
(6 linhas de comentário — a tabela acima conta 7 removidos partindo do
estado anterior a esta rodada, incluindo os que foram reescritos/encurtados
em vez de simplesmente apagados.)

**utilscompraflex.js**:
```
// BRH_BENEFICIO.OP_STATUS: 1/2 vigente para compra; 3/4 não entram.
// DS_CODIGOOPERADORA VR=Refeição, MULTI=Multibenefícios; nome do plano é fallback.
// Bucket oposto recebe string "0": plusoftcrm.libs.main.excel trata 0 numérico como vazio.
```

**arquivocompraflex.js**:
```
// Ordem oficial do layout Flash; buckets não usados na V1 ficam em branco.
```

**testcompraflex.js**:
```
// O testador de métodos do InPaaS Studio chama cada função isolada, não só via run().
// elegibilidadeFlex processa todos os pendentes globalmente; por isso valida antes.
// Opt-in — não é chamada automaticamente por run().
```

## Validações estáticas (rodadas nesta entrega)

### `node --check`

| Arquivo | Resultado |
|---|---|
| comprabeneficio.js | OK |
| comprabeneficiobotoes.js | OK |
| compraflex.js | OK |
| utilscompraflex.js | OK |
| arquivocompraflex.js | OK |
| testcompraflex.js | OK |

### `git diff --check` (whitespace, sobre o diff staged de `ambiente-atual/.../business/`)

Sem problemas reportados (saída vazia).

### Integridade do pacote (`sha256sum`)

Os 6 arquivos em `subir-compraflex/novos/` foram comparados byte a byte
(SHA-256) com as versões finais em `ambiente-atual/durr/core-pattern/durr/main/dev/business/`:
todos **idênticos**.

### Bug real encontrado em execução DEV (`inpaas_devstudio_rest_testsuite`)

Ao invocar `validarPreCondicoes` de fato no InPaaS DEV, ocorreu:

```
TypeError: pendentes.filter is not a function
  at validarPreCondicoes (durr_main_dev_business_testcompraflex:138)
```

**Causa raiz:** neste engine (Nashorn/GraalVM sobre Java), o retorno de
`knex(...).find()` é um `java.util.List`, não um Array JS genuíno. `List` tem
`.forEach()` (bridge nativo do Java 8) mas **não** tem `.filter()`/`.map()`/
`.reduce()`. Todo código que chamava esses métodos diretamente sobre o
resultado de `.find()` quebraria em runtime.

**Correção aplicada:** adicionada `UtilsCompraFlex.paraArray(listaOuArray)` —
converte o resultado para um Array JS real usando `.forEach()` (o único
método comprovadamente seguro em ambos os casos). Aplicada em **todo** ponto
do pacote que chama `.find()` (não só o que quebrou):

- `compraflex.js`: `obterContratoPlanosConfigurados`, `buscarBeneficiosCandidatos`;
- `testcompraflex.js`: `resolverConfiguracaoFlex` (contratoPlanos),
  `validarPreCondicoes` (pendentes), `validarBeneficioColaborador`
  (categorias), `validarDetalhesCompra` (detalhes).

Chamadas a `.findFirst()` (linha única) não foram afetadas — só retornam um
objeto ou nulo, nunca uma lista. Arquivos legados pré-existentes
(`elegibilidade.js`, `elegibilidadeflex.js`) não foram tocados: usam apenas
`.forEach()`/`for` clássico sobre os resultados, que já é seguro.

### 2º bug real encontrado em execução DEV (`inpaas_devstudio_rest_testsuite`)

```
TypeError: Cannot read property "refeicao" from undefined
  at criarCompraTeste (durr_main_dev_business_testcompraflex:339)
```

**Causa raiz:** o testador de métodos do InPaaS Studio invoca cada função
exportada de `TestCompraFlex` **isoladamente**, não encadeada via `run()`.
Funções como `criarCompraTeste(config, colaboradores)` esperavam receber
`config`/`colaboradores` já resolvidos por uma chamada anterior
(`resolverConfiguracaoFlex()`/`prepararMassas()`), o que não existe quando a
função é chamada sozinha — `colaboradores` chegava `undefined`.

**Correção aplicada:** toda função exportada que dependia de `config`/
`colaboradores` agora é autossuficiente — resolve o que falta internamente:

- `config` ausente → `resolverConfiguracaoFlex()` (relê tudo do banco de novo);
- `colaboradores` ausente → `obterColaboradoresTeste()` (busca os dois
  colaboradores de teste pela matrícula fixa, sem precisar recriá-los);
- se as massas ainda não existirem, lança `UserException` com mensagem clara
  ("Rode prepararMassas() antes desta função") em vez de `TypeError` cru;
- `idCompra`/`resultadoCompra.fileId` ausentes também passaram a lançar
  mensagem de negócio explícita, em vez de erro nativo.

`run()` não foi afetado — já passava os argumentos explicitamente em todas as
chamadas, então os fallbacks nunca disparam nesse fluxo.

### Correção funcional/arquitetural — BRH_COMPRA_BENEFICIO_PRODUTO removida da Compra Flex

Ao testar a compra real em DEV, o sistema retornava:

```
Compra Flex sem contrato/plano configurado em BRH_COMPRA_BENEFICIO_PRODUTO.
```

**Causa raiz:** essa validação partia de uma suposição do prompt original que
não corresponde ao formulário real de Compra de Benefício neste DURR. O
cabeçalho de `BRH_COMPRA_BENEFICIO` (Status, Grupo econômico, Empresa,
Filial, Operadora, Produto = Flex, Mês Referência, Tipo de compra, Tipo Folha
Pagamento, Data envio/crédito/geração, arquivos) **não tem** seleção de
contrato/planos — a compra é sempre do produto Flex, e os N
produtos/categorias que compõem o benefício já formaram
`BRH_BENEFICIO.VL_VALOR` na elegibilidade. `BRH_COMPRA_BENEFICIO_PRODUTO`
não faz parte da configuração da Compra Flex neste ambiente.

**Correção aplicada:**

- **Query nova para selecionar benefícios da compra** (`CompraFlex.buscarBeneficiosCandidatos`):
  parte do produto do cabeçalho, não de uma tabela de configuração:
  ```
  BRH_BENEFICIO BE
    JOIN BRH_CONTRATO_PLANO CP ON CP.ID_BRH_CONTRATO_PLANO = BE.ID_BRH_CONTRATO_PLANO
    JOIN BRH_CONTRATO C        ON C.ID_BRH_CONTRATO = BE.ID_BRH_CONTRATO
    JOIN BRH_COLABORADOR COL   ON COL.ID_BRH_COLABORADOR = BE.ID_BRH_COLABORADOR
    JOIN BRH_EMPRESA EMP       ON EMP.ID_BRH_EMPRESA = COL.ID_BRH_EMPRESA
  WHERE C.ID_BRH_PRODUTO = <BRH_COMPRA_BENEFICIO.ID_BRH_PRODUTO>
  ```
  seguido dos filtros opcionais do próprio cabeçalho (abaixo).

- **Empresa/Filial/Operadora "Todas"**: reproduzido o padrão legado exato de
  `brhain.rh.beneficio.utils.compra.beneficio.js` (`listarFuncionariosElegiveis`):
  se o registro apontado pelo cabeçalho (`BRH_EMPRESA.DS_RAZAOSOCIAL` /
  `BRH_FILIAL.DS_RAZAOSOCIAL` / `BRH_OPERADORA.DS_NOME`) for literalmente
  `'Todas'`, o filtro correspondente **não** é aplicado; caso contrário,
  filtra normalmente por `COL.ID_BRH_EMPRESA` / `COL.ID_BRH_FILIAL` /
  `C.ID_BRH_OPERADORA`. Implementado em `representaTodas()`, reutilizada para
  as três dimensões — nenhuma semântica nova inventada.
  **Grupo econômico não foi implementado como filtro explícito**: não há
  evidência de coluna `ID_BRH_GRUPO_ECONOMICO` em `BRH_COMPRA_BENEFICIO` nos
  materiais disponíveis neste ambiente, e o campo parece servir apenas para
  popular em cascata o combo de Empresa no formulário (mesmo padrão de
  `getEmpresaPorGrupoEconomico`/`getFilialPorEmpresa` no legado) — quando a
  empresa já está gravada no cabeçalho, o grupo econômico já está implícito.
  **Pendência**: confirmar em DEV se `BRH_COMPRA_BENEFICIO` tem coluna própria
  de grupo econômico e se algum caso de uso depende dela como filtro
  independente da empresa.
- **Identificação Refeição/Multi**: continua centralizada em
  `UtilsCompraFlex.identificarDestinoPlanoFlex`, agora aplicada **por
  candidato** (usa `CP.DS_NOMEPLANO`/`CP.DS_CODIGOOPERADORA` já trazidos pelo
  join acima), não mais por uma configuração pré-carregada da compra. Um
  contrato/plano sem mapeamento **não aborta mais a compra inteira** — como
  não existe mais uma etapa de configuração para validar antecipadamente,
  esse benefício é ignorado com aviso em log, igual ao tratamento já existente
  para "colaborador sem CPF"/"empresa sem CNPJ" (mudança de comportamento
  deliberada, documentada aqui).
- **Valor exportado**: inalterado — continua `BRH_BENEFICIO.VL_VALOR`
  diretamente, sem recalcular `BRH_CONTRATO_PLANO_CATEGORIA_FLEX` na compra.
- **Um plano por colaborador**: inalterado — dedup por `id_brh_colaborador`
  já existente em `montarLinhasEDetalhes` continua garantindo isso.

**Referências a `BRH_COMPRA_BENEFICIO_PRODUTO` removidas:**
- `CompraFlex`: função `obterContratoPlanosConfigurados` (consulta) e
  `mapearContratoPlanos` (validação/abort) — **removidas por completo**; a
  exceção `MENSAGENS.compraSemProdutoConfigurado` foi **removida** de
  `UtilsCompraFlex`.
- `TestCompraFlex.criarCompraTeste`: **removido** o loop que inseria 2 linhas
  em `BRH_COMPRA_BENEFICIO_PRODUTO` (Refeição + Multibenefícios).
- `TestCompraFlex.limparMassas`: **removido** o `delete()` órfão sobre
  `BRH_COMPRA_BENEFICIO_PRODUTO` (não há mais o que limpar ali).
- Busca global confirma: nenhuma referência funcional restante nas 6 classes
  — só 2 comentários explicando textualmente por que a tabela não é usada.

### Correções de teste real em DEV (referência MMAAAA, Todas, nomes, comentários)

**1) Formato da referência — evidência real:** o botão real envia
`params.data.referencia = "092026"` — formato nativo `MMAAAA` (6 dígitos,
sem separador), não `MM/AAAA`. Corrigido em `UtilsCompraFlex`:
- `parseReferencia()` aceita `MMAAAA` como formato primário; `MM/AAAA`
  permanece aceito só como compatibilidade (outras rotinas de compra do
  legado usam esse formato).
- `intervaloCompetencia()` passou a retornar `{ inicio, fimExclusivo }` em
  vez de `{ inicio, fim }` — limite superior **exclusivo** (1º dia do mês
  seguinte: `092026` → início `2026-09-01`, `fimExclusivo` `2026-10-01`), não
  mais `23:59:59.999` do último dia. Mais simples e elimina de vez qualquer
  risco de hora/minuto na borda (já havia sido corrigido antes com
  `23:59:59.999`; a comparação por limite exclusivo é estritamente melhor).
- `beneficioVigenteNaCompetencia()` ajustada para `inicioVigencia >=
  intervalo.fimExclusivo` (era `> intervalo.fim`).
- Valor persistido no cabeçalho (`compra.ds_referencia`) **não é alterado**
  em nenhum ponto — só lido e convertido em memória para o cálculo da
  competência.

**2) Empresa "Todas" — confirmado com evidência real do banco DEV:**
`BRH_EMPRESA` id=1 tem `DS_RAZAOSOCIAL = 'Todas'`, `DS_NOMEFANTASIA = 'Todas'`,
`DS_CNPJ = 0`. `BRH_FILIAL` id=1 idem. `representaTodas()` foi simplificada
para checar **somente `DS_RAZAOSOCIAL`** (trim + case-insensitive), removendo
o fallback duplo (`DS_RAZAOSOCIAL`/`DS_NOMEFANTASIA`) usado antes por falta
de evidência. Nunca decide pela magnitude do ID — sempre relê o registro
real. CNPJ por linha continua vindo de
`BRH_COLABORADOR.ID_BRH_EMPRESA -> BRH_EMPRESA.DS_CNPJ` (empresa real do
colaborador, não a do cabeçalho).

**3) Filial "Todas":** mesma estratégia e mesma coluna (`DS_RAZAOSOCIAL`),
reaproveitando `representaTodas()`.

**4) Nomes dos patterns:** as 5 classes de negócio sob `durr.main.dev.business.*`
passaram a usar o prefixo `Business` no **nome** do pattern (não na key),
seguindo o padrão já existente de `BusinessElegibilidade`/
`BusinessElegibilidadeFlex`:

| Key | Nome final |
|---|---|
| `durr.main.dev.business.comprabeneficio` | `BusinessCompraBeneficio` |
| `durr.main.dev.business.compraflex` | `BusinessCompraFlex` |
| `durr.main.dev.business.utilscompraflex` | `BusinessUtilsCompraFlex` |
| `durr.main.dev.business.arquivocompraflex` | `BusinessArquivoCompraFlex` |
| `durr.main.dev.business.testcompraflex` | `BusinessTestCompraFlex` |
| `durr.main.dev.business.comprabeneficiobotoes` | `CompraBeneficioBotoes` (sem prefixo — classe de botão) |

Nomes de **arquivo** não mudaram: seguem o padrão já usado no repositório de
arquivo = sufixo da key em minúsculas (`elegibilidade.js`/
`elegibilidadeflex.js` já seguiam esse padrão antes desta entrega), não o
Nome do pattern.

**5) Limpeza de comentários:** revisão completa nas 6 classes. `CompraBeneficio`,
`CompraFlex` (business rule), `UtilsCompraFlex`, `ArquivoCompraFlex` e
`CompraBeneficioBotoes` já continham só comentários justificados (regra não
evidente, mapeamento Flash, sentinela "Todas", workaround do engine,
peculiaridade da lib de Excel, decisão técnica) — nenhum removido além de
atualizações de conteúdo. `TestCompraFlex` tinha 13 comentários de
narração/estrutura sem função explicativa real (11 divisórias de seção do
tipo `// --- N) Título ---` redundantes com nomes de função já claros, como
`validarPreCondicoes`/`prepararMassas`, mais 2 comentários que só narravam a
linha seguinte) — todos **removidos**; os 2 blocos que carregavam explicação
substantiva junto com a divisória tiveram o conteúdo preservado em formato
de comentário simples, sem a decoração de seção.

### Histórico — filtro de Empresa/Filial "Todas"

Primeira passada (sem acesso a banco real): `representaTodas()` checava duas
colunas candidatas (`DS_RAZAOSOCIAL`/`DS_NOMEFANTASIA`) por falta de
evidência de qual delas o legado usa de fato. **Superado** pela confirmação
real de DEV documentada acima — hoje `representaTodas()` usa somente
`DS_RAZAOSOCIAL`, trim + case-insensitive. Nunca decidiu pela magnitude do
ID em nenhuma das duas versões.

### Revisão de código (`code-review high`, forkada sobre o diff)

6 achados reportados; verificados um a um contra o código real:

- **Chaves em UPPERCASE no payload de `dao.getDao().filter()/insert()/update()`**
  em `compraflex.js` — CONFIRMADO e **corrigido** (padronizado para
  `lowercase snake_case`, consistente com o restante do DAO no DURR/legado e
  com o próprio `testcompraflex.js`). O mesmo padrão incorreto existia em
  `limparMassas` de `testcompraflex.js` — também corrigido.
- **Ausência de rollback: falha na geração do arquivo deixava a compra
  travada em execução** — CONFIRMADO e **corrigido**: `CompraFlex` agora gera
  o arquivo *antes* de persistir os detalhes; se a geração falhar, nenhum
  `BRH_COMPRA_BENEFICIO_DETALHE` foi escrito e a compra continua reprocessável.
- **Borda de fim de competência à meia-noite excluía benefícios que começam
  mais tarde no último dia do mês** — CONFIRMADO e **corrigido** em
  `UtilsCompraFlex.intervaloCompetencia` (fim passa a ser 23:59:59.999).
- **Corrida entre chamadas concorrentes na checagem de idempotência** —
  CONFIRMADO como limitação real, já mitigada na medida do possível
  (reivindicação antecipada + reconfirmação imediatamente antes da escrita) e
  documentada em código: o DAO deste engine não expõe update
  condicional/lock, e nenhuma evidência no snapshot mostra uso de transação
  em nenhum pattern legado. Não foi inventada infraestrutura de transação
  sem precedente no DURR.
- **`converterNumero`/`arredondarMoeda` duplicados de
  `durr.main.dev.business.elegibilidadeflex`** — analisado; não alterado,
  pois `elegibilidadeflex.js` não exporta essas funções e alterar sua
  interface pública está fora do escopo pedido.
- **Workaround do "0" como string em `montarLinhaLayoutFlash`** — analisado;
  não alterado. Causa raiz é uma limitação de `plusoftcrm.libs.main.excel`
  (biblioteca compartilhada fora da key-base DURR); alterá-la está fora do
  escopo e do raio de impacto autorizado desta entrega.

## Pendência explícita — validação real em DEV

**A validação funcional em ambiente DEV real (InPaaS + banco de dados) ainda
NÃO foi executada.** Este repositório é um snapshot estático offline (export
de `CORE_PATTERN`/`FORMULARIO`), sem runtime InPaaS nem conexão de banco
disponível para rodar `TestCompraFlex.run()` de fato.

O que foi feito:
- validação estática de sintaxe (`node --check`) em todos os 6 arquivos;
- revisão de estilo/whitespace (`git diff --check`);
- revisão de código (achados acima) e revisão de arquitetura/regras de
  negócio contra a documentação e os patterns DURR/legado existentes no
  snapshot.

O que falta, a ser feito manualmente no InPaaS DEV antes de considerar a
rotina validada:
- publicar os 6 patterns nas keys definitivas listadas acima;
- **configurar o botão "Calcular" no formulário/tela real de
  `BRH_COMPRA_BENEFICIO`** apontando para `CompraBeneficioBotoes` — este
  pacote não inclui alteração de formulário, só o pattern de código; a
  ligação do botão na tela depende da configuração real do formulário em DEV,
  que não pôde ser inspecionada neste ambiente;
- rodar `durr.main.dev.business.testcompraflex.run()` e conferir o relatório
  retornado (benefícios gerados, `VL_COMPRATOTAL`, conteúdo do arquivo);
- validar os cenários negativos descritos no prompt original (compra
  inexistente, produto sem estratégia, contrato/plano desconhecido,
  benefício fora de vigência, reprocessamento, etc.).
