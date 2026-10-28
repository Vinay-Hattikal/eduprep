# mock-data: the content format, by example

Every file here is a small, **importable** example of one content file, laid out the way real
content should be organised. Copy a file, keep the header row, replace the rows.

- Why it's split this way and how content moves from writer to students:
  [docs/content-workflow.md](../docs/content-workflow.md)
- Every column, allowed values and rules: [docs/data-import.md](../docs/data-import.md)
- Import the whole folder (drafts, in dependency order): `npm run content:import -- mock-data`
  (an integration test does exactly this on every test run, so these files stay valid)

The companies are **made up** (marked "EXAMPLE - not real data"). Don't publish them.

## Layout

| Folder | Files | Import type | Notes |
|---|---|---|---|
| `00-taxonomy/` | `taxonomy.csv` | Taxonomy | Subjects, topics, subtopics. Import first. |
| `01-passages/` | `passages.csv` | Passages | Reading and DI passages that questions point at with `passage_id`. |
| `02-mcq/<subject>/` | `<topic>.csv` | MCQs | One file per topic. Every row's `subject` must match the folder. |
| `03-coding/` | `<set>.csv` | Coding problems (single file) | One row per problem: statement, reference solution, starter code, samples, at least 5 hidden tests, companies. |
| `04-companies/` | `companies.csv` | Companies (profiles and sources) | One row per company, with up to three sources. |
| `04-companies/` | `process.csv` | Company rounds and sections | One row per test section; interview rounds get one row with the section columns blank. |

Question and coding files say which companies ask them in their `companies` column
(`globex-systems|initech-software`), with `asked_in` months. No per-company folders (D-054).
| `05-tracks/` | `role-tracks.csv` | Role tracks | |
| `06-design/` | `design-questions.csv` | Design questions | System and low-level design. |

What's here: 22 topic files with 3 questions each (two topics for each of the 11 subjects,
covering single-answer, multiple-answer and numeric questions, code snippets and passages), 2
coding problems with tests and solutions in one file, and 3 companies, one per level (`full`, `standard`,
`generic`).

## ID codes

Question IDs are `<SUBJECT>-<TOPIC>-<NNNN>`. Give each writer a number block per topic (writer 1
`0100–0999`, writer 2 `1000–1999`, ...). Never reuse or rename an ID.

| Subject folder | Code | Topic codes used here (add more the same way) |
|---|---|---|
| `quantitative-aptitude` | `QA` | `PCT` percentages, `TSD` time-speed-distance |
| `logical-reasoning` | `LR` | `BR` blood-relations, `NS` number-series |
| `verbal-ability` | `VA` | `SYN` synonyms, `RC` reading-comprehension |
| `data-interpretation` | `DI` | `TBL` di-tables, `CSL` di-caselets |
| `operating-systems` | `OS` | `SCH` cpu-scheduling, `PG` paging-segmentation |
| `dbms` | `DB` | `SQL` sql, `TXN` transactions |
| `computer-networks` | `CN` | `IP` ip-addressing, `TL` transport-layer |
| `oops` | `OOP` | `INH` inheritance, `ENC` encapsulation |
| `dsa` | `DSA` | `SRT` sorting, `HSH` hashing |
| `programming-languages` | `PRG` | `C` lang-c, `PY` lang-python |
| `pseudocode` | `PSC` | `LOOP` pseudo-loops, `COND` pseudo-conditionals |

Other IDs: coding `CODE-<THEME>-<NNNN>` (`CODE-ARR-0101`), passages `PSG-<SUBJECT>-<NNNN>`,
design `SD-<NNNN>` (system) and `LLD-<NNNN>` (low-level), companies by slug (`globex-systems`).

## Writing tips that save review time

- Save as **CSV UTF-8**, comma-separated. Cells with commas, quotes or line breaks are quoted
  (spreadsheet apps do this for you).
- Multiple answers and lists use `|`: `A|C`, `arrays|strings`, `CSE|IT`.
- Maths in `$...$` (KaTeX), formatting in Markdown, code in the `code` column with its
  `code_language`.
- `source` is `original` unless the question came from somewhere else; then say where.
- Explanations teach: say why the answer is right and, where useful, why the trap is wrong.
