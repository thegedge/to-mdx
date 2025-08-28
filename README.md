# `to-mdx`

A tool for converting things to MDX (Markdown + React).

> [!NOTE]
> If you're here for the Ruby version, it exists on an older commit:
> https://github.com/thegedge/to-mdx/tree/3c05e67d96cb85980e917f3370dddfc0bebdd009

## Requirements

- Node.js 22+
- npm or yarn

## Installation

```bash
npm install
```

## Usage

```bash
./bin/to-mdx [options] path/to/file/to/convert.odp
```

### Options

- `--use-heuristics`: Use heuristics to determine classnames and eliminate positioning divs
- `-h, --help`: Show help message

## Conversions

### Open Document Presentation (ODP)

Generates the following:

- An MDX file in `src/pages/presentations/` with the format `YYYY-MM-DD_presentation_title.mdx`
- Images extracted to `src/static/img/presentations/YYYY-MM-DD_presentation_title/`
