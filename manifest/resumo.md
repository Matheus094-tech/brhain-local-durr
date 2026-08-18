# Snapshot completo do ambiente

## Originais

- CORE_PATTERN: `dev-durr.assertiv.com.br-dbexport-1787081109503.csv`
- FORMULARIO: `dev-durr.assertiv.com.br-dbexport-1787081130606.csv`

## Extração

- Patterns no snapshot completo: **769**
- Formulários no snapshot completo: **350**
- Patterns DURR: **10**
- Formulários DURR: **2**
- Referências candidatas de integração/compra/arquivo: **342**

## Organização

- `referencias/ambiente-completo`: contexto completo do export.
- `ambiente-atual/durr`: recorte do código DURR.
- `docs/ARQUITETURA_DURR.md`: regras arquiteturais obrigatórias.
- `manifest/referencias-integracao.json`: atalhos para referências úteis.

## Namespaces

- `brhain`: 545 patterns, 162 formulários
- `durr`: 10 patterns, 2 formulários
- `inpaas`: 147 patterns, 74 formulários
- `InpaasSchedulerValidarElegibilidadeOdonto`: 1 patterns, 0 formulários
- `plusoftcrm`: 24 patterns, 11 formulários
- `studiov2`: 35 patterns, 100 formulários
- `sync`: 2 patterns, 0 formulários
- `templatedesign`: 1 patterns, 0 formulários
- `tiny-slider`: 1 patterns, 0 formulários
- `vue-components-styles`: 0 patterns, 1 formulários
- `vue-loading`: 1 patterns, 0 formulários
- `vue-select`: 1 patterns, 0 formulários
- `vue-sfc-loader-options`: 1 patterns, 0 formulários

## Avisos

Os registros abaixo não foram descartados. Quando o payload não pôde ser dividido com segurança, o conteúdo bruto foi preservado.

- inpaas.devstudio.forms.dbexplorer-v2: payload mantido como raw porque contém separadores ambíguos
- brhain.rh.integracao.forms.dataimp_import.edit: payload mantido como raw porque contém separadores ambíguos
- plusoftcrm.libs.main.forms.select2: payload mantido como raw porque contém separadores ambíguos
