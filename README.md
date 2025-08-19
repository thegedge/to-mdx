# `to-mdx`

A Ruby script for converting things to MDX (Markdown + React).

## Requirements

- Ruby 3.0+
- Bundler
- Git repository (for project root detection)

## Installation

1. Install dependencies:

   ```bash
   bundle install
   ```

2. Run the converter:
   ```bash
   ./bin/to-mdx presentation.odp
   ```

## Usage

```bash
./bin/to-mdx path/to/file/to/convert.odp
```

## Conversions

### Open Document Presentation (ODP)

Generates the following

- An MDX file in `src/pages/presentations/` with the format `YYYY_MM_DD_presentation_title.mdx`
- Images extracted to `src/static/img/presentations/YYYY_MM_DD_presentation_title/`
