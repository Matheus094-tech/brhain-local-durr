#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Extrai o snapshot DURR de exports CSV do InPaaS.

Uso:
    python scripts/extrair_durr.py
    python scripts/extrair_durr.py --prefix durr.
    python scripts/extrair_durr.py --repo-root "D:/caminho/repo"

O script:
- identifica automaticamente CORE_PATTERN e FORMULARIO pelo cabeçalho;
- preserva os CSVs originais em exports/original;
- extrai apenas chaves com o prefixo configurado (default: durr.);
- grava patterns em ambiente-atual/core-pattern;
- grava formulários em ambiente-atual/formularios;
- gera manifests e resumo;
- não altera os CSVs originais.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path


CORE_HEADER = 'id_pattern";ds_key";ds_patternname"'
FORM_HEADER = 'id_formulario";ds_formulario";ds_key"'

RECORD_START = re.compile(
    r'(?m)^"\d+";"[^"\r\n]*";"[^"\r\n]*";'
)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


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

    for path in sorted(repo_root.glob("*.csv")):
        export_type = detect_export(path)
        if export_type:
            if export_type in found:
                raise RuntimeError(
                    f"Mais de um export do tipo {export_type} encontrado: "
                    f"{found[export_type].name} e {path.name}"
                )
            found[export_type] = path

    missing = {"core_pattern", "formulario"} - set(found)
    if missing:
        raise RuntimeError(
            "Não encontrei os dois exports esperados no diretório raiz. "
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


def key_to_path(key: str) -> Path:
    parts = [part for part in key.split(".") if part]
    return Path(*parts)


def normalize_export_value(value: str) -> str | None:
    return None if value == "null" else value


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

    source = source[1:]

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
        "tx_patternsource": source,
        "dt_created": normalize_export_value(metadata[0]),
        "id_usercreated": normalize_export_value(metadata[1]),
        "dt_updated": normalize_export_value(metadata[2]),
        "id_userupdated": normalize_export_value(metadata[3]),
        "ds_recordthumbprint": normalize_export_value(metadata[4]),
    }


def parse_form_record(record: str) -> dict:
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

    payload = payload[1:]
    parts = payload.split('";"')

    if len(parts) != 3:
        raise ValueError(
            "não foi possível separar tx_html/tx_css/tx_javascript "
            f"(partes encontradas: {len(parts)})"
        )

    values = prefix.groups()
    trailing = suffix.groups()

    return {
        "id_formulario": values[0],
        "ds_formulario": values[1],
        "ds_key": values[2],
        "ds_labelkey": normalize_export_value(values[3]),
        "id_module": normalize_export_value(values[4]),
        "id_pattern": normalize_export_value(values[5]),
        "do_inactive": normalize_export_value(values[6]),
        "id_objetobd": normalize_export_value(values[7]),
        "id_permission": normalize_export_value(values[8]),
        "tx_html": normalize_export_value(parts[0]),
        "tx_css": normalize_export_value(parts[1]),
        "tx_javascript": normalize_export_value(parts[2]),
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


def extract_core(source: Path, destination: Path, prefix_filter: str):
    text = read_text(source)
    manifest = []
    warnings = []

    for record in split_records(text):
        try:
            item = parse_core_record(record)
        except ValueError as exc:
            warnings.append(str(exc))
            continue

        if not item["ds_key"].startswith(prefix_filter):
            continue

        relative = key_to_path(item["ds_key"]).with_suffix(".js")
        target = destination / relative
        write_text(target, item["tx_patternsource"])

        manifest.append({
            key: value
            for key, value in item.items()
            if key != "tx_patternsource"
        } | {
            "arquivo": target.as_posix(),
            "source_length": len(item["tx_patternsource"]),
        })

    return manifest, warnings


def extract_forms(source: Path, destination: Path, prefix_filter: str):
    text = read_text(source)
    manifest = []
    warnings = []

    for record in split_records(text):
        start_match = quoted_prefix_regex(3).match(record)
        if not start_match:
            continue

        ds_key = start_match.groups()[2]
        if not ds_key.startswith(prefix_filter):
            continue

        try:
            item = parse_form_record(record)
        except ValueError as exc:
            warnings.append(f"{ds_key}: {exc}")
            continue

        folder = destination / key_to_path(item["ds_key"])
        folder.mkdir(parents=True, exist_ok=True)

        write_text(folder / "index.html", item["tx_html"])
        write_text(folder / "style.css", item["tx_css"])
        write_text(folder / "script.js", item["tx_javascript"])

        metadata = {
            key: value
            for key, value in item.items()
            if key not in {"tx_html", "tx_css", "tx_javascript"}
        }
        metadata["arquivos"] = {
            "html": (folder / "index.html").as_posix() if item["tx_html"] is not None else None,
            "css": (folder / "style.css").as_posix() if item["tx_css"] is not None else None,
            "javascript": (folder / "script.js").as_posix() if item["tx_javascript"] is not None else None,
        }
        write_json(folder / "metadata.json", metadata)

        manifest.append(metadata)

    return manifest, warnings


def make_summary(core_manifest, form_manifest, exports, warnings):
    lines = [
        "# Snapshot DURR",
        "",
        "Snapshot extraído automaticamente dos exports do InPaaS.",
        "",
        "## Exports",
        "",
        f"- CORE_PATTERN: `{exports['core_pattern'].name}`",
        f"- FORMULARIO: `{exports['formulario'].name}`",
        "",
        "## Conteúdo DURR extraído",
        "",
        f"- Patterns: **{len(core_manifest)}**",
        f"- Formulários: **{len(form_manifest)}**",
        "",
        "### Patterns",
        "",
    ]

    for item in sorted(core_manifest, key=lambda value: value["ds_key"].lower()):
        lines.append(
            f"- `{item['ds_key']}` — {item['ds_patternname']} "
            f"(tipo {item['id_patterntype']}, módulo {item['id_module']})"
        )

    lines.extend(["", "### Formulários", ""])

    for item in sorted(form_manifest, key=lambda value: value["ds_key"].lower()):
        lines.append(
            f"- `{item['ds_key']}` — {item['ds_formulario']} "
            f"(módulo {item['id_module']})"
        )

    if warnings:
        lines.extend(["", "## Avisos", ""])
        for warning in warnings:
            lines.append(f"- {warning}")

    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--repo-root",
        default=".",
        help="Raiz do repositório. Default: diretório atual.",
    )
    parser.add_argument(
        "--prefix",
        default="durr.",
        help="Prefixo de ds_key a extrair. Default: durr.",
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
    core_dir = repo_root / "ambiente-atual" / "core-pattern"
    forms_dir = repo_root / "ambiente-atual" / "formularios"
    manifest_dir = repo_root / "manifest"

    original_dir.mkdir(parents=True, exist_ok=True)
    core_dir.mkdir(parents=True, exist_ok=True)
    forms_dir.mkdir(parents=True, exist_ok=True)
    manifest_dir.mkdir(parents=True, exist_ok=True)

    copied_exports = {}
    for export_type, source in exports.items():
        target_name = (
            "core_pattern.csv"
            if export_type == "core_pattern"
            else "formulario.csv"
        )
        target = original_dir / target_name
        shutil.copy2(source, target)
        copied_exports[export_type] = target

    core_manifest, core_warnings = extract_core(
        exports["core_pattern"],
        core_dir,
        args.prefix,
    )
    form_manifest, form_warnings = extract_forms(
        exports["formulario"],
        forms_dir,
        args.prefix,
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

    for item in core_manifest:
        item["arquivo"] = str(
            Path(item["arquivo"]).relative_to(repo_root)
        ).replace("\\", "/")

    for item in form_manifest:
        for key, value in item["arquivos"].items():
            if value:
                item["arquivos"][key] = str(
                    Path(value).relative_to(repo_root)
                ).replace("\\", "/")

    write_json(manifest_dir / "exports.json", export_manifest)
    write_json(manifest_dir / "core-pattern.json", core_manifest)
    write_json(manifest_dir / "formularios.json", form_manifest)

    all_warnings = core_warnings + form_warnings
    summary = make_summary(
        core_manifest,
        form_manifest,
        exports,
        all_warnings,
    )
    write_text(manifest_dir / "resumo.md", summary)

    print("Snapshot DURR extraído com sucesso.")
    print(f"Patterns DURR: {len(core_manifest)}")
    print(f"Formulários DURR: {len(form_manifest)}")
    print(f"Resumo: {manifest_dir / 'resumo.md'}")

    if all_warnings:
        print(f"Avisos: {len(all_warnings)} (consulte o resumo)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
