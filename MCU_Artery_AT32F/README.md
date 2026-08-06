# Artery AT32 KiCad symbol generator

This directory contains the source configuration and generator for the
`Artery_MCU.kicad_sym` library in the repository root. The generated library
targets KiCad 10 and covers all 26 MCU families listed on Artery's English
product index as of August 2026.

## Directory contents

| File | Purpose |
| --- | --- |
| `README.md` | Generator, source, validation, and maintenance documentation |
| `generate_kicad_symbols.js` | Downloads the vendor libraries and generates KiCad symbols |
| `kicad_generator_config.json` | Family URLs, datasheet URLs, footprint overrides, and pin assertions |
| `../Artery_MCU.kicad_sym` | Generated shared KiCad symbol library |

The directory is intentionally flat. Downloaded manufacturer archives and
intermediate files are created under the system temporary directory and
removed automatically.

## Generated symbols

Each package variant produces two symbols:

- `<device>` is a complete single-unit symbol.
- `<device> MultiUnit` separates supply and support pins into a
  **Power / Control** unit and creates one additional unit per GPIO port.

For example, `AT32F455ZxT7 MultiUnit` contains a Power / Control unit followed
by Port A, Port B, and the other available GPIO ports. Every physical pin
appears exactly once across the multi-unit symbol.

`MultiUnit` is part of the library symbol name only. Both forms use the bare
device part number, such as `AT32F455ZxT7`, for their visible `Value` property.

The complete symbols place positive supply pins at the top, ground pins at the
bottom, and functional pins on the sides. Their dimensions reserve clearance
at all corners to prevent power-pin labels from overlapping side-pin labels.

## Supported families and footprints

The current source map contains:

| Product line | Families |
| --- | --- |
| General-purpose and high-performance | AT32F011, AT32F402, AT32F403, AT32F403A, AT32F405, AT32F407, AT32F413, AT32F415, AT32F421, AT32F4212, AT32F422, AT32F423, AT32F425, AT32F426, AT32F435, AT32F437, AT32F455, AT32F456, AT32F457, AT32F490 |
| Low-power | AT32L021 |
| Automotive | AT32A403A, AT32A423 |
| Motor control | AT32M412, AT32M416 |
| Wireless | AT32WB415 |

These releases currently provide 112 package variants. The generator creates
both complete and multi-unit forms, producing 224 top-level symbols.

All variants resolve to 18 standard KiCad footprints across these package
classes:

- LQFP-32, LQFP-48, LQFP-64, LQFP-100, and LQFP-144
- QFN-20, QFN-28, QFN-32, QFN-36, and QFN-48 with exposed pads
- TSSOP-20 and TSSOP-24

The QFN vendor package specifies a 4.5 mm exposed pad. The assigned standard
KiCad footprint has the nearest exposed-pad size, 4.4 x 4.4 mm. Its exposed
pad is pad 49 and maps to `VSS`.

## Source configuration

`kicad_generator_config.json` contains one entry per MCU family:

```json
"AT32F455": {
  "componentLibraryUrl": "https://www.arterychip.com/download/JLCEDA/AT32F455_SCH_PCB_Lib_V1.2.zip",
  "datasheetUrl": "https://www.arterychip.com/download/DS/DS_AT32F455_456_457_V2.01_EN.pdf"
}
```

The generator downloads `componentLibraryUrl`, extracts all JLCEDA `.elibz`
devices from the release, and writes `datasheetUrl` into each related KiCad
symbol's `Datasheet` property. It does not download the datasheet PDF.

AT32F403 is the sole configured family without an official English datasheet.
Its symbol fields therefore reference the official Chinese V2.00 datasheet.

Add future families to the `families` map. A downloaded device name must begin
with its configured family key; generation fails if a release contains a
device assigned to the wrong family.

## Footprint resolution

The generator parses vendor package titles and maps supported packages to
standard KiCad libraries:

- LQFP packages are matched by lead count, body dimensions, and pitch.
- QFN packages are matched by lead count, body dimensions, pitch, and nearest
  exposed-pad dimensions.
- TSSOP packages are matched by lead count, body dimensions, and pitch.

If automatic matching is impossible or a reviewed alternative is preferred,
add an exact symbol-to-footprint mapping under `footprintOverrides`.
Generation fails rather than silently selecting an uncertain footprint.

## Critical pin assertions

`pinAssertions` records package-specific mappings that require explicit
regression protection. Current assertions include:

- `AT32F455CxU7` pin 49 is `VSS` for the exposed pad.
- `AT32F455ZxT7` pin 143 is `NC`.

The latter reflects the vendor V1.1 correction. Vendor release V1.2 also
adjusted the QFN finger-pad length and added Altium exports. The generated
symbols use the JLCEDA data because the vendor notes that information may be
lost during Altium export.

Add assertions for any newly discovered errata or particularly critical
package pins.

## Requirements

- Node.js
- `curl`
- `unzip`
- KiCad 10 data installed at `/usr/share/kicad`, or `KICAD_DATA_DIR` set to
  another KiCad data directory

## Regeneration

Run from the repository root:

```sh
node MCU_Artery_AT32F/generate_kicad_symbols.js
```

The command downloads all configured component releases and replaces
`Artery_MCU.kicad_sym` in the repository root.

To check that KiCad accepts the generated library:

```sh
kicad-cli sym upgrade --force \
  --output /tmp/Artery_MCU.kicad_sym \
  Artery_MCU.kicad_sym
```

## Maintenance checklist

When adding or updating a family:

1. Add or update its component-library and datasheet URLs.
2. Run the generator and review every resolved footprint.
3. Compare package pin counts and critical pins with the vendor datasheet.
4. Add footprint overrides where automatic matching is not exact.
5. Add pin assertions for errata, exposed pads, and other critical mappings.
6. Render representative complete and multi-unit symbols with
   `kicad-cli sym export svg` and inspect label spacing.
7. Commit the configuration, generator changes, documentation, and regenerated
   root library together.
