# Folha Oficial DURR — Titular + Dependente + Desligamento

Pacote de deploy para as importações oficiais de Folha (Titular, Dependente) e Desligamento do DURR.

## Arquitetura — estratégias dedicadas por layout

Cada layout tem sua própria estratégia dedicada, que **nunca tenta o outro tipo**:

- `ImportFolhaTitular` (`durr.main.dev.integracao.importfolhatitular`) — sempre Titular. Sem validação de quantidade de colunas (acesso posicional seguro via `obterColuna`, retorna `null` para posição ausente); valida campos obrigatórios via `BusinessImportFolha`.
- `ImportFolhaDependente` (`durr.main.dev.integracao.importfolhadependente`) — sempre Dependente. Mesma regra de acesso seguro e delegação de validação.
- `ImportFolha` (`durr.main.dev.integracao.importfolha`) — **wrapper legado**, preservado só para compatibilidade com layouts antigos que ainda apontem para essa JKey. Roteia por `to.columns.length <= 12` (Dependente) / `> 12` (Titular) e delega para as duas estratégias novas. A quantidade física de colunas varia por linha (POI só grava células até a última preenchida), por isso o corte de 12 é só um roteador — cada estratégia valida seus próprios campos obrigatórios depois, não a quantidade física recebida.

Os layouts oficiais novos (Folha - Titular, Folha - Dependente) devem ser configurados apontando diretamente para `importfolhatitular`/`importfolhadependente`, não para `importfolha`.

## Patterns alterados

| Nome InPaaS | Key | Arquivo | Responsabilidade |
|---|---|---|---|
| ImportFolha | `durr.main.dev.integracao.importfolha` | `alterados/importfolha.js` | Wrapper legado — roteia por `to.columns.length <= 12` (Dependente) / `> 12` (Titular) e delega para `ImportFolhaTitular`/`ImportFolhaDependente`. `onfinish` chama `UtilsImportFolha.finalizarContadoresImportacao`. |
| BusinessImportFolha | `durr.main.dev.integracao.businessImportFolha` | `alterados/businessImportFolha.js` | Núcleo de negócio de Titular (`processarColaborador`, criar/atualizar seletivamente) e de Dependente avulso (`processarDependenteAvulso`). Expõe `registrarHistoricoElegibilidade`, `obterIdGrupoEconomico` e `resolverOuCriarSituacao` para reuso por Desligamento. Resolve/cria `BRH_SITUACAO_COLABORADOR` (Situação) e `BRH_GRAU_PARENTESCO` (Grau de Parentesco) via resolvedores dedicados (ver seções específicas abaixo). |
| UtilsImportFolha | `durr.main.dev.integracao.utilsimportfolha` | `alterados/utilsimportfolha.js` | Parser de data do layout oficial (`converterDataOficial`), normalização de CEP, `formatarDiagnostico` (log estruturado `[TAG][STATUS]`), `calcularIdade` (para `BRH_DEPENDENTE.NR_IDADE`) e `finalizarContadoresImportacao` (fechamento de contadores da importação). |
| RESTImport | `durr.main.dev.integracao.restimport` | `alterados/restimport.js` | Endpoint `POST /importdesligamento`, mesmo padrão de delegação de `/importafastados`. |

## Patterns novos

| Nome InPaaS | Key | Arquivo | Responsabilidade |
|---|---|---|---|
| ImportFolhaTitular | `durr.main.dev.integracao.importfolhatitular` | `novos/importfolhatitular.js` | Estratégia dedicada a Folha - Titular (32 posições). Mapeia posições e chama `BusinessImportFolha.processarColaborador`. `onfinish` chama `finalizarContadoresImportacao`. |
| ImportFolhaDependente | `durr.main.dev.integracao.importfolhadependente` | `novos/importfolhadependente.js` | Estratégia dedicada a Folha - Dependente (11 posições). Mapeia posições e chama `BusinessImportFolha.processarDependenteAvulso`. `onfinish` chama `finalizarContadoresImportacao`. |
| ImportDesligamento | `durr.main.dev.integracao.importdesligamento` | `novos/importdesligamento.js` | Leitura posicional (9 colunas) do layout oficial de Desligamento. Os dois cabeçalhos "Nome" do arquivo não colidem porque o acesso é sempre por posição. `onfinish` chama `finalizarContadoresImportacao` (via `UtilsImportDesligamento`). |
| BusinessImportDesligamento | `durr.main.dev.integracao.businessImportDesligamento` | `novos/businessImportDesligamento.js` | Localiza colaborador por Empresa+Matrícula (nunca cria); resolve/cria `BRH_TIPO_EVENTO` e `BRH_MOTIVO_EVENTO`; resolve Situação "Demitido"; atualiza `DT_DESLIGAMENTO`/`ID_BRH_TIPO_EVENTO`/`ID_BRH_MOTIVO_EVENTO`/`ID_BRH_SITUACAO_COLABORADOR`; idempotente; reaproveita `registrarHistoricoElegibilidade` de `BusinessImportFolha` com `DS_EVENTO='Desligamento'`. |
| UtilsImportDesligamento | `durr.main.dev.integracao.utilsimportdesligamento` | `novos/utilsimportdesligamento.js` | Wrapper fino sobre `UtilsImportFolha`, mais `normalizarValorComparacaoData` próprio e `finalizarContadoresImportacao` (delegação fina). |
| BusinessTestImportFolha | `durr.main.dev.integracao.testimportfolha` | `novos/testimportfolha.js` | Suíte de testes de Titular, Dependente, Grau de Parentesco, Situação, dispatch e contadores contra DEV real. Cria e remove sua própria massa marcada (`ZZ_TESTE_IMPORTFOLHA*`). |
| BusinessTestImportDesligamento | `durr.main.dev.integracao.testimportdesligamento` | `novos/testimportdesligamento.js` | Suíte de testes de Desligamento (Tipo Evento, Motivo Evento, Situação Demitido, idempotência, contadores) contra DEV real. Cria e remove seu próprio titular de teste. |

## Bugs corrigidos em UtilsImportFolha

1. **`mapeamentoCodigoFolha`/`mapeamentoCodigoFolhaOuCriar` acessavam o resultado em UPPERCASE** (ex.: `resultado['ID_BRH_EMPRESA']`), mas resultados de `getDao().find()` são lowercase neste runtime. Corrigido para `resultado[colunaRetorno.toLowerCase()]`.
2. **`mapeamentoCodigoFolhaOuCriar` gravava via Knex**, violando a regra do projeto (SELECT→Knex, escrita→DAO). Corrigido para `getDao(entidade).insert(...)`.

## Contador de Sucessos (`BRH_DATAIMP_IMPORTLOG.NR_REGISTROSSUCESSO`)

O motor genérico de importação (`brhain.rh.integracao.businessdelegate.dataimportutils.js`, não alterado nesta entrega) incrementa `importlog["nr_recordssuccess"]` a cada linha processada sem exceção, mas o campo físico real da entidade é `NR_REGISTROSSUCESSO` — confirmado por uso consistente em múltiplas rotinas legadas do mesmo produto e pelo business delegate do formulário "Logs da importação" (`brhain/rh/integracao/businessdelegate/formlogerror.js`, que lê `importlog["nr_registrossucesso"]`). Como `nr_recordssuccess` nunca foi um atributo real da entidade, o contador de sucesso sempre ficava em `0` na tela.

**Correção feita nas strategies DURR** (não no motor genérico, que é compartilhado por outras ~30 rotinas de importação do produto, fora do escopo desta entrega): `UtilsImportFolha.finalizarContadoresImportacao(importlog)` recalcula `NR_REGISTROSSUCESSO = max(0, NR_REGISTROS - NR_FALHAS)` e grava no campo correto. Chamado no `onfinish` de `ImportFolha`, `ImportFolhaTitular`, `ImportFolhaDependente` e `ImportDesligamento` — todos compartilham o mesmo motor genérico e o mesmo bug. `onfinish` é invocado antes do `UPDATE` final em `BRH_DATAIMP_IMPORTLOG`, mutando o mesmo objeto por referência.

**Semântica do contador**: linha sem exceção lançada = sucesso (`CRIADO`, `ATUALIZADO`, `SEM_ALTERACAO` e dependente cadastrado sem CPF contam como sucesso). `SUCESSOS = TOTAL - FALHAS` captura essa semântica sem precisar contar sucesso manualmente em `BusinessImportFolha`/`BusinessImportDesligamento`.

Validado por `BusinessTestImportFolha` (497/1→496, 497/0→497, 10/10→0, 0/0→0, `null`/`undefined`→0) e por `BusinessTestImportDesligamento`.

## Titular — layout oficial (32 posições, `BHRAIN FUNCIONARIOS ATIVOS.xlsx`)

| # (0-idx) | Cabeçalho oficial | Campo interno | Observação |
|---|---|---|---|
|0| Empresa - Código | `CodigoEmpresa` | `BRH_EMPRESA.DS_CODIGOFOLHA` |
|1| Matrícula | `MatriculaColaborador` | |
|2| CPF | `CPF` | normalizado 11 dígitos, obrigatório |
|3| Nome | `NomeCompletoColaborador`/`NomeSocialColaborador` | |
|4| Data de Nascimento | `DataNascimento` | `converterDataOficial` |
|5| Sexo | `Sexo` | |
|6| Estado Civil - Nome | `EstadoCivil` | `BRH_ESTADO_CIVIL.DS_CODIGOFOLHA` = valor textual, cria se ausente |
|7| Nome da Mãe | `NomeMae` | |
|8| Nome do Pai | `NomePai` | |
|9| PIS | — | lido, não persistido (V1) |
|10| CTPS Nro/Série/UF | — | lido, não persistido (V1) |
|11| Vínculo Empregatício - Código | `CodigoVinculoEmpregaticio` | `BRH_VINCULO_EMPREGATICIO.DS_CODIGOFOLHA`, cria se ausente |
|12| Vínculo Empregatício - Nome | `VinculoNome` | nome do cadastro criado |
|13| Função - Código | `CodigoCargo` | `BRH_CARGO.DS_CODIGOFOLHA`, cria se ausente |
|14| Função - Nome | `Cargo` | nome do cadastro criado |
|15| Identidade - Número | `RG` | |
|16| Situação sem Data | `SituacaoColaborador` | `BRH_SITUACAO_COLABORADOR.DS_CODIGOFOLHA` — resolve ou cria automaticamente (ver seção "Situação do Colaborador") |
|17| Sindicato - Código | — | **ignorado** |
|18| Sindicato - Razão Social | `Sindicato` | nome do `BRH_SINDICATO` |
|19| Categoria Profissional - Cód | `CodigoSindicato` | **é o `DS_CODIGOFOLHA` de `BRH_SINDICATO`** neste layout |
|20| Categoria Profissional - Nome | — | **ignorado** |
|21| Data da Admissão | `DataAdmissao` | `converterDataOficial` |
|22| E-Mail | `EmailCorporativo` | |
|23-29| Endereço (Logradouro/Número/Complemento/Bairro/CEP/Município/UF) | `*Pessoal` | CEP normalizado para 8 dígitos com zero à esquerda; Município/UF não persistidos |
|30| Banco - Nome | `NomeBanco` | texto livre |
|31| Banco - Código BACEN | `Banco` | texto livre, exatamente como recebido (ex.: `"33"`, sem completar para `"033"`) |

## Cadastros auxiliares — regra geral

Buscar sempre por `DS_CODIGOFOLHA`. Se existir, usa o ID existente (mesmo que o nome recebido divirja — gera aviso, não renomeia, não duplica). Se não existir, cria com `DS_CODIGOFOLHA` + `DS_NOME`, usando o único `ID_BRH_GRUPO_ECONOMICO` do ambiente quando a entidade possuir esse campo. Aplicado a `BRH_CARGO`, `BRH_VINCULO_EMPREGATICIO`, `BRH_SINDICATO`, `BRH_ESTADO_CIVIL` via o helper genérico `mapeamentoCodigoFolhaOuCriar`.

`BRH_SITUACAO_COLABORADOR` e `BRH_GRAU_PARENTESCO` seguem a mesma busca-por-código/não-duplica/não-renomeia, mas **não** usam o helper genérico — cada uma tem um resolvedor dedicado porque exige um campo adicional Lista de Opções (`OP_TIPO`/`OP_TIPOGRAUPARENTESCO`) que as demais entidades não têm, e não possuem `OP_ATIVO`.

## Situação do Colaborador (`Situação sem Data`)

`BRH_SITUACAO_COLABORADOR` exige `ID_BRH_GRUPO_ECONOMICO`, `DS_NOME`, `DS_CODIGOFOLHA` e `OP_TIPO` (Lista de Opções); não possui `OP_ATIVO`. `OP_TIPO` é uma classificação **técnica**, não o nome da situação — várias situações de afastamento distintas podem legitimamente compartilhar o mesmo `OP_TIPO`.

Resolvido por `resolverTipoSituacao` + `criarSituacaoColaborador` em `businessImportFolha.js`, **não** generalizado para o helper `mapeamentoCodigoFolhaOuCriar`. `DS_CODIGOFOLHA`/`DS_NOME` sempre recebem o valor bruto recebido em "Situação sem Data":

```
Situação sem Data = "Férias"
→ busca BRH_SITUACAO_COLABORADOR.DS_CODIGOFOLHA = "Férias"
→ se existir, usa o ID existente (não recria, não renomeia)
→ se não existir:
   → resolve OP_TIPO: "Férias" tem classificação específica (afastamento) → "2"
   → cria: { ID_BRH_GRUPO_ECONOMICO, DS_NOME: "Férias", DS_CODIGOFOLHA: "Férias", OP_TIPO: "2" }
→ usa o ID (existente ou recém-criado)
```

**Tabela `OP_TIPO`** (comparação normalizada: trim, uppercase, acentos removidos):

| Valor recebido | `OP_TIPO` |
|---|---|
| Ativo | `0` |
| Inativo | `1` |
| Admissão | `3` |
| Licença Militar | `F` |
| Rejeitado | `O` |
| Licença Remunerada | `P` |
| Aposentado | `R` |
| Suspenso | `S` |
| Demitido | `T` |
| Licença Não Remunerada | `U` |
| Não compareceu | `X` |
| Afastado / Férias / Licença Médica / Auxílio Doença / Atestado Médico / Licença Maternidade | `2` |

**Fallback**: qualquer situação textual preenchida fora da tabela → `OP_TIPO = "2"`, cria normalmente e registra aviso funcional (não bloqueia). Situação vazia é a única exceção que gera erro funcional (`[TITULAR][NAO_PROCESSADO]`).

Falha técnica na criação é reempacotada com contexto completo (`Situação`, `Código folha`, `OP_TIPO`, mensagem real do banco) antes de subir ao catch de `processarColaborador`.

## Grau de Parentesco (`BRH_GRAU_PARENTESCO.OP_TIPOGRAUPARENTESCO`)

Mesma particularidade de Situação: `BRH_GRAU_PARENTESCO` exige `ID_BRH_GRUPO_ECONOMICO`, `DS_NOME`, `DS_CODIGOFOLHA` e `OP_TIPOGRAUPARENTESCO` (Lista de Opções). Resolvido por `resolverGrauParentesco` + `resolverTipoGrauParentesco` + `criarGrauParentesco` em `businessImportFolha.js`, espelhando o padrão de Situação — **não** generalizado para `mapeamentoCodigoFolhaOuCriar`. `normalizarChaveClassificacaoTecnica` é compartilhada entre os dois resolvedores.

```
Parentesco = "Guarda Pro", Código = "7"
→ busca BRH_GRAU_PARENTESCO.DS_CODIGOFOLHA = "7"
→ se existir:
   → nome igual: usa o ID existente
   → nome diferente: usa o ID existente mesmo assim (código vence), não renomeia, registra aviso de divergência
→ se não existir:
   → resolve OP_TIPOGRAUPARENTESCO: "Guarda Pro" tem classificação específica → "3"
   → cria: { ID_BRH_GRUPO_ECONOMICO, DS_CODIGOFOLHA: "7", DS_NOME: "Guarda Pro", OP_TIPOGRAUPARENTESCO: "3" }
→ usa o ID (existente ou recém-criado)
```

**Tabela `OP_TIPOGRAUPARENTESCO`** (mesma normalização de acentos):

| Valor recebido | `OP_TIPOGRAUPARENTESCO` |
|---|---|
| Titular | `6` |
| Filho / Filha / Filho(a) | `3` |
| Guarda Judicial / Guarda Pro / Guarda Provisória | `3` |
| Cônjuge / Conjuge | `2` |
| Companheiro / Companheira / Companheiro(a) | `1` |
| Enteado / Enteada / Enteado(a) | `4` |
| Tutor / Tutora | `8` |
| Pai / Mãe / Pais | `P` |
| Ex-Cônjuge / Irmão / Irmã / Outros | `0` |

**Fallback**: qualquer parentesco textual fora da tabela → `OP_TIPOGRAUPARENTESCO = "0"`, cria com o nome real recebido (nunca substituído por "Outros") e registra aviso funcional (não bloqueia).

A obrigatoriedade "Grau de Parentesco não encontrado" continua como rede de segurança — só dispara se o código vier vazio no arquivo.

## Datas

`UtilsImportFolha.converterDataOficial` reconhece 3 formatos, nesta ordem: serial Excel puro (dígitos), ISO (`AAAA-MM-DD`), e `M/d/yy` (formato confirmado do `DataFormatter`/Apache POI para o layout oficial — mês/dia sem zero à esquerda, ano com 2 dígitos, ex.: `"12/4/97"`, `"8/10/26"`).

**Pivô de século fixo**: `yy < 50 → 20yy`, `yy >= 50 → 19yy`.

**Serial Excel**: construção 100% local (`new Date(1899, 11, 30 + serial)`) — evita o deslocamento de 1 dia que ocorre em servidores com timezone negativo (UTC-3) ao usar aritmética `Date.UTC()`/epoch em milissegundos.

**`BRH_DEPENDENTE.NR_IDADE`**: campo obrigatório (confirmado pelo legado `brhain/rh/integracao/dependente.js`). `UtilsImportFolha.calcularIdade(dataNascimento)` calcula a idade (diferença de anos, ajustada se o aniversário ainda não ocorreu no ano corrente) e popula `montarPayloadDependente`.

**Comparação semântica de `DT_NASCIMENTO`**: `BRH_DEPENDENTE.DT_NASCIMENTO`, lido via Knex, pode retornar como objeto Java nativo (não `instanceof Date`, não `typeof 'string'`). `normalizarValorComparacao` (`businessImportFolha.js`) extrai `AAAA-MM-DD` via regex sobre a representação em texto de qualquer valor não-`Date`, garantindo que a comparação de datas (usada em `possuiAlteracaoDependente` e `localizarDependentesPorChaveAlternativa`) opere sempre sobre o dia civil, independente do tipo de objeto devolvido pelo driver.

## UPDATE seletivo (não apaga dados)

`montarPayloadColaborador(colaborador, somenteInformados)` — quando `somenteInformados=true` (usado em UPDATE), cada campo só entra no payload se a origem estava preenchida. Campos ausentes na carga não aparecem no objeto passado ao `DAO.update()`, preservando o valor já gravado.

O gatilho de UPDATE é o critério de elegibilidade: `id_brh_empresa`, `id_brh_filial`, `id_brh_grade`, `id_brh_cargo`, `id_brh_departamento`, `id_brh_sindicato`. Vínculo Empregatício **não** é campo de elegibilidade — alterá-lo sozinho não dispara `ATUALIZADO`.

## Dependente — layout oficial (11 posições, `BHRAIN DEPENDENTES ATIVOS.xlsx`)

| # (0-idx) | Cabeçalho oficial | Campo interno |
|---|---|---|
|0| Empresa - Código | `CodigoEmpresa` |
|1| Matrícula | `MatriculaTitular` |
|2| Nome | (contexto de log apenas) |
|3| CPF | `CPFTitular` — validação, não cria titular |
|4| Parentesco - Código | `CodigoGrauParentesco` |
|5| Parentesco | `GrauParentesco` |
|6| CPF Dependente | `CPF` — **opcional** (`BRH_DEPENDENTE.DS_CPF` é nullable) |
|7| Nome Dependente | `Nome` |
|8| Data de Nascimento Dependente | `DataNascimento` |
|9| Sexo Dependente | `Sexo` |
|10| Nome da Mãe Dependente | — não persistido |

Titular localizado por `BRH_EMPRESA.DS_CODIGOFOLHA + BRH_COLABORADOR.DS_MATRICULA`; nunca cria titular. CPF do titular (quando informado) validado contra o cadastro — divergência bloqueia a linha com erro funcional.

## Dependente sem CPF

`BRH_DEPENDENTE.DS_CPF` é nullable; CPF não está em `CAMPOS_OBRIGATORIOS_DEPENDENTE`. Continuam obrigatórios: Empresa, Matrícula do titular, Titular localizado, Nome, Parentesco, Data de Nascimento, Sexo.

**Identidade dupla:**
- **Com CPF**: `ID_BRH_COLABORADOR + DS_CPF`.
- **Sem CPF**: `ID_BRH_COLABORADOR + ID_BRH_GRAU_PARENTESCO + DS_NOME (normalizado) + DT_NASCIMENTO`. Mais de 1 correspondência → `[DEPENDENTE][NAO_PROCESSADO]` por ambiguidade, nunca escolhe arbitrariamente.

**INSERT sem CPF**: `DS_CPF = null` — nunca `''`, `'-'`, `'0'` ou `'00000000000'`.

**CPF chegando numa carga futura**: busca primeiro pela identidade principal; se não achar, cai para a chave alternativa. Encontrando exatamente 1, atualiza o mesmo registro preenchendo `DS_CPF` — nunca cria um segundo.

**Proteção contra apagar CPF já cadastrado**: carga posterior sem CPF preserva o CPF já existente (mesma regra de UPDATE seletivo do Titular).

**Log**: dependente criado/atualizado sem CPF nunca é falha — aviso funcional ("Dependente cadastrado sem CPF." / "Dependente permanece sem CPF."), `resultado.sucesso` permanece `true`.

## Desligamento — layout oficial (9 posições, `BHRAIN DESLIGAMENTOS.xlsx`)

| # (0-idx) | Cabeçalho oficial | Campo interno |
|---|---|---|
|0| Empresa - Código | `CodigoEmpresa` |
|1| Matrícula | `Matricula` |
|2| Nome (colaborador) | `Nome` (contexto de log) |
|3| CPF | `CPF` — validação contra cadastro |
|4| Data de Desligamento | `DataDesligamento` |
|5| Código (motivo) | `MotivoCodigo` → `BRH_MOTIVO_EVENTO.DS_CODIGOFOLHA` |
|6| Nome (motivo) | `MotivoNome` → `BRH_MOTIVO_EVENTO.DS_NOME` |
|7| Vínculo Empregatício - Código | `VinculoCodigo` — só validação/aviso |
|8| Vínculo Empregatício - Nome | `VinculoNome` |

Os dois cabeçalhos "Nome" não geram ambiguidade — o acesso a `to.columns` é sempre posicional.

### Tipo Evento / Motivo Evento

`BRH_MOTIVO_EVENTO` exige `ID_BRH_TIPO_EVENTO` (não opcional); `BRH_TIPO_EVENTO` exige `ID_BRH_GRUPO_ECONOMICO`/`DS_NOME`/`DS_CODIGOFOLHA`. Um Tipo Evento (classificação macro, ex.: "Demissão") agrupa vários Motivos Evento específicos (pedido de demissão, término de contrato, dispensa sem justa causa, etc.).

**Tipo Evento de Desligamento** (`obterOuCriarTipoEventoDesligamento`): a planilha não fornece código de Tipo Evento — só Código/Nome do Motivo — então a rotina usa uma chave técnica determinística própria do DURR:

```
A) busca BRH_TIPO_EVENTO.DS_CODIGOFOLHA = 'DESLIGAMENTO' → usa se existir
B) senão, busca cadastro equivalente por DS_NOME em ('Demissão', 'Desligamento') → usa e avisa se existir
C) senão, cria: { ID_BRH_GRUPO_ECONOMICO, DS_CODIGOFOLHA: 'DESLIGAMENTO', DS_NOME: 'Demissão' }
```

**Motivo Evento** (`resolverOuCriarMotivoEvento`): identidade = `ID_BRH_TIPO_EVENTO + DS_CODIGOFOLHA` (nunca só o código — o mesmo código pode existir sob outro Tipo Evento sem relação com Desligamento). Nome divergente do cadastro existente → código vence, aviso de divergência, não renomeia, não duplica. Um código igual cadastrado sob outro Tipo Evento nunca é reaproveitado nem sobrescrito.

**Situação "Demitido"**: reaproveita `BusinessImportFolha.resolverOuCriarSituacao` — busca por `DS_CODIGOFOLHA='Demitido'`, cria com `OP_TIPO='T'` se não existir. Nenhuma lógica paralela de Situação.

**Ordem de execução** (nunca faz UPDATE parcial sem todos os IDs resolvidos): validar linha → localizar colaborador → obter/criar Tipo Evento → obter/criar Motivo Evento → obter/criar/resolver Situação Demitido → `UPDATE BRH_COLABORADOR` (`DT_DESLIGAMENTO`, `ID_BRH_TIPO_EVENTO`, `ID_BRH_MOTIVO_EVENTO`, `ID_BRH_SITUACAO_COLABORADOR`) → registrar histórico de elegibilidade.

**Idempotência**: mesma data + mesmo tipo + mesmo motivo + mesma situação → `SEM_ALTERACAO`, nenhum novo histórico, nenhum Tipo/Motivo Evento recriado. Qualquer campo diferente → atualiza e cria novo `BRH_ELEGIBILIDADE_HISTORICO`.

**`BRH_ELEGIBILIDADE_HISTORICO`**: reaproveita `BusinessImportFolha.registrarHistoricoElegibilidade` com `DS_EVENTO='Desligamento'` — dispara o mesmo scheduler de elegibilidade (`durr.main.dev.scheduler.aplicarelegibilidade` → `elegibilidadeflex`).

**Encerramento de benefício**: não implementado nesta entrega, por decisão explícita do usuário — a rotina cria o evento/histórico corretamente; o encerramento efetivo de `BRH_BENEFICIO` pertence a outra parte da plataforma.

**Vínculo divergente**: gera aviso funcional, não bloqueia o desligamento.

## Configuração dos layouts no InPaaS (a ser feita manualmente)

| Layout | JKey (`DS_CHAVEESTRATEGICA`) | Colunas | Cabeçalho |
|---|---|---|---|
| Folha - Titular | `durr.main.dev.integracao.importfolhatitular` | 32 | Y (linha 1) |
| Folha - Dependente | `durr.main.dev.integracao.importfolhadependente` | 11 | Y (linha 1) |
| Folha - Afastamento | `durr.main.dev.integracao.importafastados` | (inalterado) | — |
| Folha - Desligamento | `durr.main.dev.integracao.importdesligamento` | 9 | Y (linha 1) |

Os layouts oficiais novos usam JKeys dedicadas (`importfolhatitular`/`importfolhadependente`), não `durr.main.dev.integracao.importfolha`. Essa JKey antiga só deve continuar configurada em algum layout se já houver um layout legado dependendo dela.

## Testes — cobertura real

`BusinessTestImportFolha`/`BusinessTestImportDesligamento` chamam o núcleo de negócio diretamente (DTO) e, nos testes de dispatch e de linha real, via `onrecord`. Cobrem: criação/atualização/sem-alteração de Titular, CPF sem zero à esquerda, CPF ausente, empresa inexistente, Cargo/Vínculo/Sindicato/Estado Civil novos e reaproveitados, data serial Excel e `M/d/yy` (6 exemplos reais), CEP normalizado, UPDATE seletivo não apaga CEP/Banco, titular não encontrado, CPF do titular divergente, dispatch por limite (`<=12`/`>12`), Situação do Colaborador com `OP_TIPO` (12 casos + fallback + reaproveitamento), Dependente sem CPF (criação, reprocessamento sem duplicar, backfill de CPF, ambiguidade), Grau de Parentesco com `OP_TIPOGRAUPARENTESCO` (10 casos + fallback + reaproveitamento + divergência de nome), Tipo Evento / Motivo Evento de Desligamento (criação/reaproveitamento, identidade composta, não-sobrescrita entre Tipos diferentes, Situação Demitido, idempotência, histórico), fechamento de contadores de importação.

**Resultado da última execução real em DEV**:
- `BusinessTestImportFolha`: **80/80** (100%).
- `BusinessTestImportDesligamento`: **25/25** (100%).

**Não coberto por teste automatizado** (verificado apenas por revisão de código):
- Que "Sindicato - Código" e "Categoria Profissional - Nome" são ignoradas na leitura posicional (confirmado por inspeção de `montarTitular`).
- PIS/CTPS/Categoria Profissional (Nome) — confirmados como não persistidos.

## Pendências reais

1. **`BRH_VINCULO_EMPREGATICIO` / `BRH_ESTADO_CIVIL`**: `ID_BRH_GRUPO_ECONOMICO` assumido presente por analogia com `BRH_CARGO`/`BRH_SINDICATO` (confirmados) — não confirmado individualmente para essas duas.
2. **Categoria Profissional - Cód/Nome, Município/UF, PIS, CTPS**: fora da persistência nesta V1, por decisão de escopo.
3. **Encerramento de benefício** após desligamento: gap pré-existente na plataforma, não resolvido por esta importação (decisão explícita do usuário).
4. **Configuração física dos 4 layouts no InPaaS** ainda não realizada (ver seção de configuração acima).
5. **O bug de `nr_recordssuccess` existe no motor genérico `dataimportutils.js`** para as ~30 outras rotinas de importação do produto que o utilizam (fora do DURR) — não corrigido nesta entrega por decisão explícita (correção ficou nas strategies DURR); achado que vale reportar à equipe responsável por esse componente.
