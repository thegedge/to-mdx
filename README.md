# `to-mdx`

A tool for converting things to MDX (Markdown + React).

> [!NOTE]
> If you're here for the Ruby version, it exists on an older commit:
> [3c05e67d96cb85980e917f3370dddfc0bebdd009](https://github.com/thegedge/to-mdx/tree/old-ruby-version)

## Requirements

- Node.js 23.5+
- pnpm

## Installation

```bash
pnpm install
```

## Usage

```bash
./bin/to-mdx [options] path/to/file/to/convert.{odp,key}
```

The bin runs sandboxed via Node's permission model. `bin/to-mdx` is a thin
launcher that resolves the paths a conversion needs, then re-execs the real entry
under `--permission` with a tailored allow-list:

- **reads**: the package directory (code + dependencies), the input file, and the
  output project root;
- **writes**: the output project root only (the nearest ancestor with `.git`, else
  the current directory);
- **denied**: everything else — out-of-scope files, spawning child processes,
  native addons, workers, and WASI (the converter needs none of them).

The launcher only parses argv (never the untrusted input file), so it is safe to
run un-sandboxed.

### Options

- `--use-heuristics`: Use heuristics to determine classnames and eliminate positioning divs
- `--use-llm-detection`: Use a local LLM (fallback to regex) to detect code-snippet languages, validated against starry-night
- `-h, --help`: Show help message

## Conversions

### Open Document Presentation (ODP)

Generates the following:

- An MDX file in `src/pages/presentations/` with the format `YYYY-MM-DD_presentation_title.mdx`
- Images extracted to `src/static/img/presentations/YYYY-MM-DD_presentation_title/`

### Apple Keynote (`.key`)

Modern Keynote files (Keynote 6+, iWork '13 onward) store content as Snappy-compressed
Protobuf in `Index/*.iwa`. The schemas are community-reverse-engineered and version-dependent,
so conversion is best-effort.

Generates the same output layout as ODP (MDX in `src/pages/presentations/`, images in
`src/static/img/presentations/`).
