# Content Templates

Copy these files, replace the example rows with real content, and upload them in the admin panel. The full rules for every column are in [../data-import.md](../data-import.md).

All example rows are valid and can be imported as-is for testing. `acme-tech` is a made-up company; don't publish it.

## Files and upload order

```
templates/
├── taxonomy.csv                    1. subjects → topics → subtopics (131 launch topics)
├── passages.csv                    2. shared passages / DI tables used by several questions
├── mcq/                            5. one file per subject, all with the SAME columns
│   ├── quantitative-aptitude.csv
│   ├── logical-reasoning.csv
│   ├── verbal-ability.csv
│   ├── data-interpretation.csv
│   ├── operating-systems.csv
│   ├── dbms.csv
│   ├── computer-networks.csv
│   ├── oops.csv
│   ├── dsa.csv
│   ├── programming-languages.csv   (C, C++, Java, Python, JS output questions)
│   └── pseudocode.csv              (pseudocode / output prediction, as in service-company tests)
├── coding/
│   └── coding-problems-single-file.csv  6. one row per problem: statement, solution, tests, companies
└── companies/                      3–4. import before questions (they name companies)
    ├── companies.csv               company profile, eligibility and sources
    └── company-process.csv         rounds and test sections, one row per section

Older multi-file formats (still accepted):
    coding/coding-problems.csv + coding-testcases.csv + coding-solutions.csv
    companies/company-rounds.csv + company-sections.csv + company-sources.csv
    companies/company-question-map.csv   (optional: per-company months, rounds, report counts)
```

## Question types

| `type` | Use for | `correct` looks like |
|---|---|---|
| `single` | One correct option | `B` |
| `multiple` | Select all that apply | `A\|C\|D` |
| `numeric` | Type the answer (no options) | `42` (use `tolerance` for decimals) |

Add a `code` and `code_language` to any type for output prediction, pseudocode or SQL questions. Add a `passage_id` for reading comprehension or data interpretation sets.

## Reusing questions across companies

A question is written once and lists the companies that ask it. To use `QA-PCT-0001` for TCS, Infosys and Wipro, fill its `companies` cell with `tcs|infosys|wipro` (and `asked_in`, e.g. `2026-08`, if you know when). The same works for coding problems.

For different months per company, the round, or how many candidates reported it, add rows to the optional `company-question-map.csv`:

```
company,item_type,item_id,round_order,asked_in,report_count
tcs,mcq,QA-PCT-0001,1,2026-08,12
wipro,mcq,QA-PCT-0001,1,2025-11,3
```

Mock tests for a company are built from its sections' topics (`company-process.csv`), so a company with good section data gets mocks even before any questions are mapped to it.

## ID conventions

`<SUBJECT PREFIX>-<TOPIC CODE>-<4 digits>`, e.g. `QA-PCT-0001`, `LR-BR-0012`, `CODE-ARR-0001`, `PSG-DI-0003`. IDs are permanent: never reuse or renumber them. Re-uploading a row with the same ID updates it.

## Tips for authors

- Work in Google Sheets or Excel and export as CSV (UTF-8). Line breaks inside cells are fine.
- Write explanations that teach the method, not just state the answer.
- Use `source = memory-based` only for questions recalled from real exams, and always rewrite them in your own words.
- Keep one topic per question. Use `tags` for anything extra (e.g. `shortcut`, `formula`).
