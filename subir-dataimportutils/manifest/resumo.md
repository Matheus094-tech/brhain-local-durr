# Fix DS_CHAVEESTRATEGICA null em BRH_DATAIMP_IMPORTACAO — resumo de subida

## Contexto

Durante a validação em DEV da Importação de Afastados, foi identificado que `BRH_DATAIMP_IMPORTACAO.DS_CHAVEESTRATEGICA` fica `null` mesmo quando `BRH_DATAIMP_LAYOUT.DS_CHAVEESTRATEGICA` está correto. A execução da estratégia funciona normalmente porque `importData()` relê a chave diretamente de `BRH_DATAIMP_LAYOUT` a cada execução — este bug afeta apenas o dado gravado em `BRH_DATAIMP_IMPORTACAO` (histórico/auditoria), não a execução da importação em si.

Este pattern é compartilhado por **todos** os layouts de importação do BRHAIN/DURR, não é específico da Importação de Afastados.

## Pattern alterado

| Nome InPaaS | Key | Arquivo | Alteração |
|---|---|---|---|
| BusinessdelegateDataimportutils | `brhain.rh.integracao.businessdelegate.dataimportutils` | `alterados/dataimportutils.js` | Em `postImport(data)`, adicionada 1 linha propagando `layout.chaveestrategica` para `data.chaveestrategica` antes do `defaultPostDataEncoded(data, "BRH_DATAIMP_IMPORTACAO")`. |

## Diff aplicado

```diff
     data.brh_dataimp_layoutId = layout.id;
     data.id = null;
     data.entidadeprincipal = layout.entidadeprincipal;
-
+    data.chaveestrategica = layout.chaveestrategica;

     data = crmUtilsBusinessDelegate.defaultPostDataEncoded(data, CONST_DATAIMP_IMPORT);
```

## Confirmação do alias `chaveestrategica` (verificado, não assumido)

1. `saveLayout()` retorna `modelEncode(...)` de `BRH_DATAIMP_LAYOUT` (via `defaultPostDataEncoded`). O encode genérico da plataforma (`_modelEncode` em `businessdelegate/utils.js`) remove o prefixo de tipo (`ds_`, `id_`...) e mantém o resto em minúsculas.
2. Evidência direta no mesmo fluxo: `DS_ENTIDADEPRINCIPAL` já vira `layout.entidadeprincipal`, usado na linha anterior do próprio `postImport`.
3. Evidência independente em `brhain.rh.integracao.utils.js`, função `iniciarImportacao` (o próprio chamador de `postImport` neste fluxo): monta `dadosLayout` com `'BDL.DS_CHAVEESTRATEGICA as chaveestrategica'` explicitamente.

## Outras propriedades do layout não propagadas (reportado, não alterado)

`dadosLayout` (montado em `iniciarImportacao`) também inclui `layout` (nome), `inativo` (`DO_INATIVO`) e `chave` (`DS_CHAVE`), nenhum copiado para `BRH_DATAIMP_IMPORTACAO` hoje. Não há evidência no código disponível localmente de que algo leia esses campos em `BRH_DATAIMP_IMPORTACAO` — escopo não ampliado por decisão explícita.

## Impactos

- Mudança aditiva (1 linha), não remove/altera nenhum campo já propagado.
- Afeta todos os layouts que passam por `postImport` — toda importação criada após o deploy passa a gravar `DS_CHAVEESTRATEGICA` corretamente.
- Registros já existentes com `DS_CHAVEESTRATEGICA = null` não são corrigidos retroativamente por esta mudança.
- Não altera o comportamento de execução das importações (`importData()` já funciona hoje, pois relê a chave direto do layout).

## Origem do arquivo

Copiado de `referencias/ambiente-completo/core-pattern/brhain/rh/integracao/businessdelegate/dataimportutils.js` (snapshot somente leitura, não versionado) para `ambiente-atual/durr/core-pattern/brhain/rh/integracao/businessdelegate/dataimportutils.js`, onde a alteração foi aplicada. Hash SHA-256 conferido idêntico entre `ambiente-atual/` e `alterados/`.

## Validações executadas

- `node --check` no arquivo alterado — OK.
- Hash SHA-256 do arquivo em `alterados/` conferido contra o arquivo final em `ambiente-atual/` — idêntico.

## Pendências

- Confirmar em DEV, após aplicar a alteração, que uma nova importação grava `BRH_DATAIMP_IMPORTACAO.DS_CHAVEESTRATEGICA` corretamente.
- Decidir se registros antigos com `DS_CHAVEESTRATEGICA = null` precisam de correção retroativa (fora do escopo desta alteração).
