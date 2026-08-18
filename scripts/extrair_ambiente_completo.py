#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Extrai o ambiente completo do export InPaaS e mantém um recorte DURR separado.

Estrutura gerada:

exports/original/
  core_pattern.csv
  formulario.csv

referencias/ambiente-completo/
  core-pattern/<ds_key>.js
  formularios/<ds_key>/...

ambiente-atual/durr/
  core-pattern/<ds_key>.js
  formularios/<ds_key>/...

manifest/
  exports.json
  core-pattern-completo.json
  formularios-completo.json
  core-pattern-durr.json
  formularios-durr.json
  namespaces.json
  referencias-integracao.json
  resumo.md

docs/
  ARQUITETURA_DURR.md

O script:
- não altera os CSVs originais;
- identifica CORE_PATTERN e FORMULARIO pelo cabeçalho;
- extrai TODOS os patterns para referência;
- mantém um recorte DURR separado;
- gera índice de referências relacionadas a integração/compra/arquivo;
- grava o documento de arquitetura DURR sem sobrescrevê-lo caso já exista.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from collections import Counter
from pathlib import Path


CORE_HEADER = 'id_pattern";ds_key";ds_patternname"'
FORM_HEADER = 'id_formulario";ds_formulario";ds_key"'

RECORD_START = re.compile(
    r'(?m)^"\d+";"[^"\r\n]*";"[^"\r\n]*";'
)

REFERENCE_TERMS = (
    "integracao",
    "import",
    "export",
    "compra",
    "beneficio",
    "flex",
    "flash",
    "arquivo",
    "file",
    "excel",
    "xlsx",
    "csv",
    "folha",
)

ARCHITECTURE_DOC = """# Arquitetura DURR

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
"""


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig", errors="replace")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def detect_export(path: Path) -> str | None:
    with path.open("r", encoding="utf-8-sig", errors="replace") as handle:
        header = handle.readline()

    if CORE_HEADER in header:
        return "core_pattern"

    if FORM_HEADER in header:
        return "formulario"

    return None


def discover_exports(repo_root: Path) -> dict[str, Path]:
    found: dict[str, Path] = {}

    candidates = list(repo_root.glob("*.csv"))

    original_dir = repo_root / "exports" / "original"
    if original_dir.exists():
        candidates.extend(original_dir.glob("*.csv"))

    for path in sorted(set(candidates)):
        export_type = detect_export(path)
        if not export_type:
            continue

        # Prefere arquivo da raiz quando existe.
        if export_type not in found or path.parent == repo_root:
            found[export_type] = path

    missing = {"core_pattern", "formulario"} - set(found)
    if missing:
        raise RuntimeError(
            "Não encontrei os dois exports esperados. "
            f"Faltando: {', '.join(sorted(missing))}"
        )

    return found


def split_records(text: str) -> list[str]:
    matches = list(RECORD_START.finditer(text))
    records: list[str] = []

    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        records.append(text[match.start():end])

    return records


def quoted_prefix_regex(field_count: int) -> re.Pattern[str]:
    return re.compile(
        r"^" + r";".join([r'"([^"]*)"' for _ in range(field_count)]) + r";",
        re.S,
    )


def simple_suffix_regex(field_count: int) -> re.Pattern[str]:
    return re.compile(
        r'";' + r";".join([r'"([^"]*)"' for _ in range(field_count)]) + r";\s*$",
        re.S,
    )


def normalize_export_value(value: str) -> str | None:
    return None if value == "null" else value


def key_to_path(key: str) -> Path:
    parts = [part for part in key.split(".") if part]
    return Path(*parts)


def parse_core_record(record: str) -> dict:
    prefix = quoted_prefix_regex(10).match(record)
    if not prefix:
        raise ValueError("prefixo CORE_PATTERN não reconhecido")

    rest = record[prefix.end():]

    suffix = simple_suffix_regex(5).search(rest)
    if not suffix:
        raise ValueError("sufixo CORE_PATTERN não reconhecido")

    source = rest[:suffix.start()]
    if not source.startswith('"'):
        raise ValueError("tx_patternsource sem delimitador inicial")

    values = prefix.groups()
    metadata = suffix.groups()

    return {
        "id_pattern": values[0],
        "ds_key": values[1],
        "ds_patternname": values[2],
        "id_patternengine": values[3],
        "id_patterntype": values[4],
        "id_module": values[5],
        "do_allowanon": values[6],
        "nr_majorversion": normalize_export_value(values[7]),
        "nr_minorversion": normalize_export_value(values[8]),
        "do_finalversion": values[9],
        "tx_patternsource": source[1:],
        "dt_created": normalize_export_value(metadata[0]),
        "id_usercreated": normalize_export_value(metadata[1]),
        "dt_updated": normalize_export_value(metadata[2]),
        "id_userupdated": normalize_export_value(metadata[3]),
        "ds_recordthumbprint": normalize_export_value(metadata[4]),
    }


def parse_form_prefix_suffix(record: str) -> tuple[dict, str]:
    prefix = quoted_prefix_regex(9).match(record)
    if not prefix:
        raise ValueError("prefixo FORMULARIO não reconhecido")

    rest = record[prefix.end():]
    suffix = simple_suffix_regex(11).search(rest)
    if not suffix:
        raise ValueError("sufixo FORMULARIO não reconhecido")

    payload = rest[:suffix.start()]
    if not payload.startswith('"'):
        raise ValueError("payload do formulário sem delimitador inicial")

    values = prefix.groups()
    trailing = suffix.groups()

    metadata = {
        "id_formulario": values[0],
        "ds_formulario": values[1],
        "ds_key": values[2],
        "ds_labelkey": normalize_export_value(values[3]),
        "id_module": normalize_export_value(values[4]),
        "id_pattern": normalize_export_value(values[5]),
        "do_inactive": normalize_export_value(values[6]),
        "id_objetobd": normalize_export_value(values[7]),
        "id_permission": normalize_export_value(values[8]),
        "ds_styleclass": normalize_export_value(trailing[0]),
        "do_allowanon": normalize_export_value(trailing[1]),
        "nr_majorversion": normalize_export_value(trailing[2]),
        "nr_minorversion": normalize_export_value(trailing[3]),
        "do_finalversion": normalize_export_value(trailing[4]),
        "ds_signature": normalize_export_value(trailing[5]),
        "dt_created": normalize_export_value(trailing[6]),
        "id_usercreated": normalize_export_value(trailing[7]),
        "dt_updated": normalize_export_value(trailing[8]),
        "id_userupdated": normalize_export_value(trailing[9]),
        "ds_recordthumbprint": normalize_export_value(trailing[10]),
    }

    return metadata, payload[1:]


def parse_form_payload(payload: str) -> tuple[dict, str]:
    parts = payload.split('";"')

    if len(parts) == 3:
        return {
            "tx_html": normalize_export_value(parts[0]),
            "tx_css": normalize_export_value(parts[1]),
            "tx_javascript": normalize_export_value(parts[2]),
        }, "parsed"

    return {
        "tx_html": None,
        "tx_css": None,
        "tx_javascript": None,
    }, "raw-only"


def write_text(path: Path, text: str | None) -> None:
    if text is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def extract_core_items(source: Path) -> tuple[list[dict], list[str]]:
    text = read_text(source)
    items = []
    warnings = []

    for record in split_records(text):
        try:
            items.append(parse_core_record(record))
        except ValueError as exc:
            warnings.append(str(exc))

    return items, warnings


def extract_form_items(source: Path) -> tuple[list[dict], list[str]]:
    text = read_text(source)
    items = []
    warnings = []

    for record in split_records(text):
        try:
            metadata, payload = parse_form_prefix_suffix(record)
            fields, parse_status = parse_form_payload(payload)
            item = dict(metadata)
            item.update(fields)
            item["parse_status"] = parse_status
            item["raw_payload"] = payload if parse_status == "raw-only" else None
            item["raw_record"] = record
            items.append(item)

            if parse_status == "raw-only":
                warnings.append(
                    f"{metadata['ds_key']}: payload mantido como raw "
                    "porque contém separadores ambíguos"
                )
        except ValueError as exc:
            warnings.append(str(exc))

    return items, warnings


def write_core_snapshot(
    repo_root: Path,
    items: list[dict],
    destination: Path,
    prefix_filter: str | None = None,
) -> list[dict]:
    manifest = []

    for item in items:
        if prefix_filter and not item["ds_key"].startswith(prefix_filter):
            continue

        relative = key_to_path(item["ds_key"]).with_suffix(".js")
        target = destination / relative
        write_text(target, item["tx_patternsource"])

        metadata = {
            key: value
            for key, value in item.items()
            if key != "tx_patternsource"
        }
        metadata["arquivo"] = target.relative_to(repo_root).as_posix()
        metadata["source_length"] = len(item["tx_patternsource"])
        manifest.append(metadata)

    return manifest


def write_form_snapshot(
    repo_root: Path,
    items: list[dict],
    destination: Path,
    prefix_filter: str | None = None,
) -> list[dict]:
    manifest = []

    for item in items:
        if prefix_filter and not item["ds_key"].startswith(prefix_filter):
            continue

        folder = destination / key_to_path(item["ds_key"])
        folder.mkdir(parents=True, exist_ok=True)

        files = {
            "html": None,
            "css": None,
            "javascript": None,
            "raw_payload": None,
            "raw_record": None,
        }

        if item["parse_status"] == "parsed":
            if item["tx_html"] is not None:
                write_text(folder / "index.html", item["tx_html"])
                files["html"] = (folder / "index.html").relative_to(repo_root).as_posix()

            if item["tx_css"] is not None:
                write_text(folder / "style.css", item["tx_css"])
                files["css"] = (folder / "style.css").relative_to(repo_root).as_posix()

            if item["tx_javascript"] is not None:
                write_text(folder / "script.js", item["tx_javascript"])
                files["javascript"] = (folder / "script.js").relative_to(repo_root).as_posix()
        else:
            write_text(folder / "payload.raw.txt", item["raw_payload"])
            files["raw_payload"] = (folder / "payload.raw.txt").relative_to(repo_root).as_posix()

        # Sempre preserva o registro bruto para auditoria.
        write_text(folder / "registro.raw.txt", item["raw_record"])
        files["raw_record"] = (folder / "registro.raw.txt").relative_to(repo_root).as_posix()

        metadata = {
            key: value
            for key, value in item.items()
            if key not in {
                "tx_html",
                "tx_css",
                "tx_javascript",
                "raw_payload",
                "raw_record",
            }
        }
        metadata["arquivos"] = files
        write_json(folder / "metadata.json", metadata)

        manifest.append(metadata)

    return manifest


def build_reference_index(core_manifest: list[dict], form_manifest: list[dict]) -> list[dict]:
    references = []

    for item in core_manifest:
        haystack = (
            item["ds_key"] + " " + item["ds_patternname"]
        ).lower()

        matched = sorted({
            term for term in REFERENCE_TERMS if term in haystack
        })

        if matched:
            references.append({
                "tipo": "pattern",
                "ds_key": item["ds_key"],
                "nome": item["ds_patternname"],
                "termos": matched,
                "arquivo": item["arquivo"],
            })

    for item in form_manifest:
        haystack = (
            item["ds_key"] + " " + item["ds_formulario"]
        ).lower()

        matched = sorted({
            term for term in REFERENCE_TERMS if term in haystack
        })

        if matched:
            references.append({
                "tipo": "formulario",
                "ds_key": item["ds_key"],
                "nome": item["ds_formulario"],
                "termos": matched,
                "arquivos": item["arquivos"],
            })

    return sorted(
        references,
        key=lambda value: (value["tipo"], value["ds_key"].lower()),
    )


def make_namespace_manifest(core_manifest, form_manifest):
    core_counter = Counter(
        item["ds_key"].split(".")[0]
        for item in core_manifest
        if item["ds_key"]
    )
    form_counter = Counter(
        item["ds_key"].split(".")[0]
        for item in form_manifest
        if item["ds_key"]
    )

    namespaces = sorted(
        set(core_counter) | set(form_counter),
        key=str.lower,
    )

    return [
        {
            "namespace": namespace,
            "patterns": core_counter.get(namespace, 0),
            "formularios": form_counter.get(namespace, 0),
        }
        for namespace in namespaces
    ]


def make_summary(
    exports: dict[str, Path],
    core_all,
    forms_all,
    core_durr,
    forms_durr,
    namespaces,
    references,
    warnings,
):
    lines = [
        "# Snapshot completo do ambiente",
        "",
        "## Originais",
        "",
        f"- CORE_PATTERN: `{exports['core_pattern'].name}`",
        f"- FORMULARIO: `{exports['formulario'].name}`",
        "",
        "## Extração",
        "",
        f"- Patterns no snapshot completo: **{len(core_all)}**",
        f"- Formulários no snapshot completo: **{len(forms_all)}**",
        f"- Patterns DURR: **{len(core_durr)}**",
        f"- Formulários DURR: **{len(forms_durr)}**",
        f"- Referências candidatas de integração/compra/arquivo: **{len(references)}**",
        "",
        "## Organização",
        "",
        "- `referencias/ambiente-completo`: contexto completo do export.",
        "- `ambiente-atual/durr`: recorte do código DURR.",
        "- `docs/ARQUITETURA_DURR.md`: regras arquiteturais obrigatórias.",
        "- `manifest/referencias-integracao.json`: atalhos para referências úteis.",
        "",
        "## Namespaces",
        "",
    ]

    for item in namespaces:
        lines.append(
            f"- `{item['namespace']}`: "
            f"{item['patterns']} patterns, "
            f"{item['formularios']} formulários"
        )

    if warnings:
        lines.extend([
            "",
            "## Avisos",
            "",
            "Os registros abaixo não foram descartados. "
            "Quando o payload não pôde ser dividido com segurança, "
            "o conteúdo bruto foi preservado.",
            "",
        ])

        for warning in warnings:
            lines.append(f"- {warning}")

    lines.append("")
    return "\n".join(lines)


def ensure_architecture_doc(path: Path) -> None:
    if path.exists():
        print(f"Arquitetura preservada, arquivo já existe: {path}")
        return

    write_text(path, ARCHITECTURE_DOC)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--repo-root",
        default=".",
        help="Raiz do repositório. Default: diretório atual.",
    )
    parser.add_argument(
        "--durr-prefix",
        default="durr.",
        help="Prefixo do recorte DURR. Default: durr.",
    )
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()

    if not (repo_root / ".git").exists():
        print(
            f"ERRO: {repo_root} não parece ser a raiz do repositório (.git ausente).",
            file=sys.stderr,
        )
        return 2

    exports = discover_exports(repo_root)

    original_dir = repo_root / "exports" / "original"
    full_core_dir = repo_root / "referencias" / "ambiente-completo" / "core-pattern"
    full_forms_dir = repo_root / "referencias" / "ambiente-completo" / "formularios"
    durr_core_dir = repo_root / "ambiente-atual" / "durr" / "core-pattern"
    durr_forms_dir = repo_root / "ambiente-atual" / "durr" / "formularios"
    manifest_dir = repo_root / "manifest"
    docs_dir = repo_root / "docs"

    for directory in (
        original_dir,
        full_core_dir,
        full_forms_dir,
        durr_core_dir,
        durr_forms_dir,
        manifest_dir,
        docs_dir,
    ):
        directory.mkdir(parents=True, exist_ok=True)

    copied_exports = {}
    for export_type, source in exports.items():
        target_name = (
            "core_pattern.csv"
            if export_type == "core_pattern"
            else "formulario.csv"
        )
        target = original_dir / target_name

        # Evita copiar o arquivo sobre ele mesmo.
        if source.resolve() != target.resolve():
            shutil.copy2(source, target)

        copied_exports[export_type] = target

    core_items, core_warnings = extract_core_items(exports["core_pattern"])
    form_items, form_warnings = extract_form_items(exports["formulario"])

    core_all = write_core_snapshot(
        repo_root,
        core_items,
        full_core_dir,
    )
    forms_all = write_form_snapshot(
        repo_root,
        form_items,
        full_forms_dir,
    )

    core_durr = write_core_snapshot(
        repo_root,
        core_items,
        durr_core_dir,
        prefix_filter=args.durr_prefix,
    )
    forms_durr = write_form_snapshot(
        repo_root,
        form_items,
        durr_forms_dir,
        prefix_filter=args.durr_prefix,
    )

    export_manifest = {
        "core_pattern": {
            "origem": exports["core_pattern"].name,
            "copia": copied_exports["core_pattern"].relative_to(repo_root).as_posix(),
            "sha256": sha256(copied_exports["core_pattern"]),
        },
        "formulario": {
            "origem": exports["formulario"].name,
            "copia": copied_exports["formulario"].relative_to(repo_root).as_posix(),
            "sha256": sha256(copied_exports["formulario"]),
        },
    }

    namespaces = make_namespace_manifest(core_all, forms_all)
    references = build_reference_index(core_all, forms_all)
    all_warnings = core_warnings + form_warnings

    write_json(manifest_dir / "exports.json", export_manifest)
    write_json(manifest_dir / "core-pattern-completo.json", core_all)
    write_json(manifest_dir / "formularios-completo.json", forms_all)
    write_json(manifest_dir / "core-pattern-durr.json", core_durr)
    write_json(manifest_dir / "formularios-durr.json", forms_durr)
    write_json(manifest_dir / "namespaces.json", namespaces)
    write_json(manifest_dir / "referencias-integracao.json", references)

    summary = make_summary(
        exports,
        core_all,
        forms_all,
        core_durr,
        forms_durr,
        namespaces,
        references,
        all_warnings,
    )
    write_text(manifest_dir / "resumo.md", summary)

    ensure_architecture_doc(docs_dir / "ARQUITETURA_DURR.md")

    print("Snapshot completo extraído com sucesso.")
    print(f"Patterns completos: {len(core_all)}")
    print(f"Formulários completos: {len(forms_all)}")
    print(f"Patterns DURR: {len(core_durr)}")
    print(f"Formulários DURR: {len(forms_durr)}")
    print(f"Referências candidatas: {len(references)}")
    print(f"Resumo: {manifest_dir / 'resumo.md'}")
    print(f"Arquitetura: {docs_dir / 'ARQUITETURA_DURR.md'}")

    if all_warnings:
        print(
            f"Avisos: {len(all_warnings)}. "
            "Os registros foram preservados em formato bruto."
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
