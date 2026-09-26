# LAYOUT
> Owner: designer. How screens are built at each viewport. QA compares
> screenshots to this file; "usable" is not the standard, "as specified" is.

## Frame
- Content max-width: TODO(designer) px. Page gutters: TODO(designer) at 390 / 768 / 1440 / 1920.
- Columns: TODO(designer) (e.g. 4 at 390, 8 at 768, 12 at 1440) and gap token.
- Vertical rhythm: TODO(designer) section gap, group gap, item gap (tokens).

## Breakpoint behavior
| Pattern | 390×844 | 768×1024 | 1440×900 | 1920×1080 |
|---|---|---|---|---|
| Navigation | TODO(designer) | | | |
| Lists / tables | TODO(designer) (e.g. cards stack at 390, table from 768) | | | |
| Forms | TODO(designer) (single column, sticky primary action at 390?) | | | |
| Secondary panels | TODO(designer) (hidden, sheet, or side column) | | | |

## Hard rules
- No horizontal page scroll at 390.
- Titles may wrap to at most TODO(designer) lines at 390; otherwise shorten the copy.
- Primary action visible without scrolling on the core screen at 390.
