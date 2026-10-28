# Content Import Specification

How admins upload all platform content through CSV files. This is the contract between content authors and the import code. Change it only together with a decision in [decisions.md](decisions.md) (D-010, D-025).

Ready-to-fill templates with example rows: [templates/](templates/) (see [templates/README.md](templates/README.md)).

---


Organising content for many subjects and companies (folder layout, tiers, IDs, review flow): [content-workflow.md](content-workflow.md). A complete importable example of every file: [mock-data/](../mock-data/README.md).

## 1. Principles

1. **One CSV per subject for MCQs.** Every MCQ file uses the **same standard columns**, so one importer handles all of them.
2. **A question is written once and tagged with companies.** Questions belong to topics, not companies. The optional `companies` column (e.g. `tcs|infosys`) tags a question or coding problem with every company that asks it, so the same question is **reused** for TCS, Infosys and others without duplicating it (D-054).
3. **Everything is referenced by stable slugs and IDs**, never by database IDs:
   - subjects, topics and subtopics by slug (from `taxonomy.csv`),
   - companies by slug,
   - questions, passages and problems by author-chosen `external_id` (optional for MCQs and coding problems: see 4.3 and 4.4).
4. **Idempotent, and duplicates are refused.** Re-uploading a row with an existing `external_id` updates it instead of creating a duplicate, and an unchanged row is skipped, so re-uploading a whole edited file saves only what changed. The same question (or coding statement) under a different ID is an error. Changing a published item creates a new version that goes back to review.
5. **Nothing goes live from an upload.** Every imported item is a **Draft** until reviewed and published.
6. **Validate everything, import what's valid.** The preview shows errors for each row. Valid rows can be imported; invalid rows are downloaded as a CSV with an `error` column to fix and re-upload.
7. **Traceable.** Every upload is an `ImportBatch`: who, when, the original file, and counts (created, updated, failed). A batch whose items are still drafts can be rolled back.
8. **Few files.** One file per kind of content: companies, company rounds and sections, one MCQ file per subject (or topic), and one coding file with everything about each problem in its row (D-054).

## 2. General CSV rules (all files)

- UTF-8 encoding, comma-separated, first row is the header. Column order doesn't matter; header names must match exactly.
- Cells with commas, quotes or line breaks must be wrapped in double quotes. A double quote inside a cell is written `""`. Excel and Google Sheets do this automatically.
- **Lists inside a cell** are separated by `|` (pipe), e.g. `arrays|hashing`.
- Empty optional cells are left blank.
- Text fields support **Markdown**. Math uses LaTeX: `$...$` inline, `$$...$$` block.
- Dates: `YYYY-MM-DD`. Months: `YYYY-MM`.
- XLSX is accepted anywhere a CSV is: the first sheet, same columns.
- **Column names are checked strictly.** A missing required column *or* an unknown column (e.g. a typo like `qestion`) rejects the whole file with a message listing them.
- Images: upload a ZIP containing the CSV plus an `assets/` folder, and reference images by file name (section 4.3).

## 3. Import order

Files depend on each other. Import in this order (the importer rejects rows that reference something missing):

| # | File(s) | Depends on |
|---|---|---|
| 1 | `taxonomy.csv` | — |
| 2 | `passages.csv` | — |
| 3 | `companies/companies.csv` (profiles and sources) | — |
| 4 | `companies/company-process.csv` (rounds and sections) | companies, taxonomy |
| 5 | `mcq/<subject>.csv` (any order) | taxonomy, passages, companies (for the `companies` column) |
| 6 | `coding/coding-problems.csv` (one file, one row per problem) | taxonomy, companies |

That's the whole set (D-054). Re-upload any file whenever you edit it: unchanged rows are skipped, so only what you changed is saved. The **Download current data** card on the Imports page gives you every file back with IDs filled in, so nobody needs to keep their own copies.

Older multi-file formats still import (listed under "Older multi-file formats"): `coding-problems.csv` + `coding-testcases.csv` + `coding-solutions.csv` (4.4b), `company-rounds.csv` + `company-sections.csv` + `company-sources.csv` (4.5b), and `company-question-map.csv` (4.6).

## 4. Files

### 4.1 `taxonomy.csv`: subjects, topics, subtopics

One row per subtopic, or per topic when it has no subtopics. The full launch taxonomy is in the template.

| Column | Required | Rules |
|---|---|---|
| `subject_slug` | Yes | e.g. `quantitative-aptitude` |
| `subject_name` | Yes | e.g. `Quantitative Aptitude` |
| `topic_slug` | Yes | **Unique across all subjects**, e.g. `percentages` |
| `topic_name` | Yes | e.g. `Percentages` |
| `subtopic_slug` | No | Unique within its topic, e.g. `successive-change` |
| `subtopic_name` | No | Required if `subtopic_slug` is given |
| `order` | No | Display order of the topic within its subject (integer) |

Slugs are permanent identifiers. Names can be changed later without breaking references; slugs cannot.

### 4.2 `passages.csv`: shared context for several questions

For reading comprehension, data interpretation tables or charts, and puzzle sets.

| Column | Required | Rules |
|---|---|---|
| `external_id` | Yes | e.g. `PSG-DI-0001` |
| `title` | Yes | Admin-only label |
| `body` | Yes | Markdown: text, tables, images |

### 4.3 MCQ files: `mcq/<subject>.csv` (standard format)

One file per subject. Launch files:

| File | Subject slug | ID prefix |
|---|---|---|
| `quantitative-aptitude.csv` | `quantitative-aptitude` | `QA-` |
| `logical-reasoning.csv` | `logical-reasoning` | `LR-` |
| `verbal-ability.csv` | `verbal-ability` | `VA-` |
| `data-interpretation.csv` | `data-interpretation` | `DI-` |
| `operating-systems.csv` | `operating-systems` | `OS-` |
| `dbms.csv` | `dbms` | `DB-` |
| `computer-networks.csv` | `computer-networks` | `CN-` |
| `oops.csv` | `oops` | `OOP-` |
| `dsa.csv` | `dsa` | `DSA-` |
| `programming-languages.csv` | `programming-languages` | `PRG-` |
| `pseudocode.csv` | `pseudocode` | `PSC-` |

A new subject needs only a new taxonomy entry and a new file with the same columns. No code change.

**Standard columns (identical in every MCQ file):**

| Column | Required | Rules |
|---|---|---|
| `external_id` | Recommended | Unique and permanent. Format `<PREFIX><TOPIC>-<NNNN>`, e.g. `QA-PCT-0001`. Letters, digits, `-`. **If blank:** the row is matched to the same question already saved (same text, options, code and passage), or gets a stable ID made from its content (`quantitative-aptitude-3f9a1c2b7d10`). Download the subject (Imports › Download current data) to see the IDs; editing a question's text without its ID makes a new question. |
| `subject` | Yes | Subject slug. Must be the same in every row of a file. |
| `topic` | Yes | Topic slug from the taxonomy, belonging to this subject |
| `subtopic` | No | Subtopic slug under that topic |
| `type` | Yes | `single` (one correct option), `multiple` (one or more correct), `numeric` (typed number) |
| `question` | Yes | Markdown + LaTeX. Images: `![alt](assets/file.png)` (ZIP upload) |
| `code` | No | Code snippet shown under the question (output prediction, pseudocode, SQL). Plain text, keep line breaks. |
| `code_language` | If `code` | `c`, `cpp`, `java`, `python`, `javascript`, `sql`, `pseudocode` (for syntax highlighting) |
| `option_a` … `option_e` | Yes for `single` / `multiple` | 2–5 options. Leave unused ones empty. No duplicates. Empty for `numeric`. |
| `correct` | Yes | `single`: one letter (`B`). `multiple`: letters joined with `\|` (`A\|C\|D`). `numeric`: a number (`12.5`). |
| `tolerance` | No | `numeric` only: allowed absolute difference (e.g. `0.01`). Default `0`. |
| `explanation` | Yes | Markdown + LaTeX. Explain *why*, not just the answer. |
| `difficulty` | Yes | `easy`, `medium`, `hard` |
| `expected_time_sec` | Yes | Integer 10–600 |
| `passage_id` | No | `external_id` from `passages.csv` |
| `tags` | No | Free tags joined with `\|` (e.g. `formula\|shortcut`) |
| `source` | Yes | `original`, or `memory-based` for questions recalled from real exams (always rewritten in our own words) |
| `companies` | No | Company slugs that ask this question, joined with `\|` (e.g. `tcs\|infosys`). **When the column is in the file, it is the full list:** companies left out are unlinked (the preview says so). Leave the column out of the file to keep links as they are. |
| `asked_in` | No | Months it was reported asked, `YYYY-MM` joined with `\|`. Applies to every company in `companies`. Blank keeps the months already saved. |

**Errors (row rejected):**
- **Exact duplicate:** the same question (text, options, code and passage, ignoring case, spacing and formatting) as another row of the file, or as a saved question with a different ID.
- Unknown company in `companies`.
- Missing required field. Unknown `type`, `difficulty`, `code_language`.
- `subject` differs from the rest of the file, or unknown topic/subtopic, or the topic belongs to another subject.
- `correct` points to an empty option. A `single` question has more than one letter. A `numeric` answer is not a number.
- Duplicate options (compared after trimming and lower-casing).
- `passage_id` or image not found.
- `external_id` repeated in the same file, or already used by another subject.

**Warnings (row imported, flagged in the preview):**
- Question text very similar to an existing question (possible duplicate).
- Explanation shorter than 20 characters.
- `expected_time_sec` far from the topic average.

### 4.4 Coding problems: one file, one row per problem

`coding/coding-problems.csv` (template `coding/coding-problems-single-file.csv`). Each row holds everything about one problem. The row is the full truth for its problem: re-importing replaces its tests and code with what the row says.

| Columns | Required | Rules |
|---|---|---|
| `external_id` | No | e.g. `CODE-ARR-0001`. **If blank:** the problem with this `slug` keeps its ID; a new problem uses the slug as its ID. |
| `title`, `slug`, `difficulty`, `topics`, `statement`, `input_format`, `output_format`, `constraints`, `time_limit_ms`, `memory_limit_mb`, `languages`, `scoring`, `checker`, `source`, `hint_1`–`hint_3`, `editorial` | As in 4.4b | Same rules as the problem columns below |
| `solution_language`, `solution_code` | Yes | The reference solution. Must pass every test before the problem can be published. |
| `brute_language`, `brute_code` | No | A slower solution, run as a cross-check |
| `starter_c`, `starter_cpp`, `starter_java`, `starter_python`, `starter_javascript` | No | Code shown in the editor. Only for languages in `languages`. |
| `sample_1_input`, `sample_1_output`, `sample_1_explanation` … `sample_3_…` | 1 sample required | Shown in the statement. Exact stdin/stdout, line breaks kept. |
| `test_1_input`, `test_1_output` … `test_20_…` | 5 hidden tests required | Hidden tests. A test with an input needs an output. |
| `companies`, `asked_in` | No | As in 4.3 |

**Errors:** everything in 4.4b, plus: the same statement as another problem (exact duplicate), starter code for a language the problem doesn't allow, a test with input but no output.
**Warnings:** a test cell of exactly 32,767 characters (Excel cuts longer cells: the test is probably incomplete), code or tests the row will remove, a problem that had more tests than the columns hold (it was probably imported as a ZIP).

**Big tests:** more than 20 hidden tests, or tests too large for a spreadsheet cell, use the ZIP package (below). The Download current data export leaves such problems out, so editing the export can't cut their tests.

### 4.4b Coding problems: three CSVs (older format) or a ZIP package

Coding problems are split across three files, linked by `problem_id`.

**`coding/coding-problems.csv`**

| Column | Required | Rules |
|---|---|---|
| `external_id` | Yes | e.g. `CODE-ARR-0001` |
| `title` | Yes | e.g. `Pair With Target Sum` |
| `slug` | Yes | URL slug, unique |
| `difficulty` | Yes | `easy`, `medium`, `hard` |
| `topics` | Yes | Topic slugs from the `dsa` subject, joined with `\|` |
| `statement` | Yes | Markdown problem description |
| `input_format` | Yes | Markdown |
| `output_format` | Yes | Markdown |
| `constraints` | Yes | Markdown, e.g. `$1 \le n \le 10^5$` |
| `time_limit_ms` | Yes | e.g. `2000` |
| `memory_limit_mb` | Yes | e.g. `256` |
| `languages` | Yes | Allowed: `c\|cpp\|java\|python\|javascript` |
| `scoring` | Yes | `all_or_nothing`, or `per_test` (partial score per passed test, as in some company online assessments) |
| `checker` | Yes | `exact`, `ignore_whitespace`, `float:1e-6` |
| `hint_1`, `hint_2`, `hint_3` | No | Revealed one at a time |
| `editorial` | No | Markdown explanation of the approach |
| `source` | Yes | `original` or `memory-based` |

**`coding/coding-testcases.csv`**

| Column | Required | Rules |
|---|---|---|
| `problem_id` | Yes | `external_id` of the problem |
| `order` | Yes | 1, 2, 3… within the problem |
| `is_sample` | Yes | `yes` = shown in the statement, `no` = hidden |
| `input` | Yes | Exact stdin, line breaks preserved |
| `output` | Yes | Exact expected stdout |
| `explanation` | No | Shown under sample tests only |

At least 1 sample and 5 hidden tests per problem. Re-importing a problem's tests replaces all its tests.

**`coding/coding-solutions.csv`**

| Column | Required | Rules |
|---|---|---|
| `problem_id` | Yes | `external_id` of the problem |
| `kind` | Yes | `reference` (required, at least one), `brute` (optional, cross-check), `starter` (code shown in the editor) |
| `language` | Yes | `c`, `cpp`, `java`, `python`, `javascript` |
| `code` | Yes | Full source |

**Java:** code must declare `public class Main`. Every program reads stdin and writes stdout.

**Validation (D-034):** after the import, a background job runs every `reference` and `brute` solution against every test in the judge. The result shows on the problem's admin page ("Judge check"). A problem can't be submitted for review or published until it passes. Changing tests, solutions, limits or the checker runs the check again. Imported or edited problems always go back to draft.

**Large tests:** CSV cells are limited to about 1 MB. Problems with large tests use a ZIP package instead (import type "Coding problem package (ZIP)"). One folder per problem, any folder name:

```
problems.zip
└── pair-with-target-sum/
    ├── problem.csv              (one row, same columns as coding-problems.csv)
    ├── tests/
    │   ├── sample-1.in, sample-1.out   (samples: shown to students)
    │   └── 1.in, 1.out, 2.in, 2.out …  (hidden)
    ├── solutions/
    │   ├── reference.cpp        (required; .c .cpp .java .py .js)
    │   └── brute.py             (optional)
    └── starter/
        └── main.java            (optional, one per language)
```

Tests are ordered samples first, then by number. A package replaces the problem's tests and the solutions it contains.

### 4.5 Companies: four CSVs

**`companies/companies.csv`**

| Column | Required | Rules |
|---|---|---|
| `slug` | Yes | e.g. `tcs` |
| `name` | Yes | e.g. `Tata Consultancy Services` |
| `level` | Yes | `full`, `standard`, `generic` |
| `category` | Yes | `service`, `product`, `consulting`, `startup`, `other` |
| `hiring_for` | Yes | `fresher\|experienced`, or one of them |
| `overview` | Yes | Markdown |
| `website` | No | URL |
| `careers_url` | No | URL |
| `ctc_fresher` | No | Text, e.g. `3.4–7 LPA` |
| `ctc_experienced` | No | Text |
| `min_cgpa` | No | e.g. `6.0` |
| `min_10th_percent`, `min_12th_percent` | No | e.g. `60` |
| `max_backlogs` | No | Active backlogs allowed, e.g. `0` |
| `max_gap_years` | No | e.g. `1` |
| `branches` | No | e.g. `CSE\|IT\|ECE\|EEE` or `ANY` |
| `grad_years` | No | e.g. `2026\|2027` |
| `last_verified` | Yes | `YYYY-MM-DD` |
| `source_1_label`, `source_1_url`, `source_1_checked_on` … `source_3_…` | At least `source_1` when the file has source columns | Where the facts come from: a label (`Official careers page`), a link and the date checked (`YYYY-MM-DD`). **The columns are the full list:** sources not in the row are removed. Files without source columns leave sources alone. More than three sources: use `company-sources.csv` (older format). |

**`companies/company-process.csv`** (D-054): the hiring process, rounds and test sections together. One row per test section; an interview round without sections gets one row with the section columns blank. Write the round details (`round_name`, `round_type`, …) once, on any row of the round; the other rows of that round may leave them blank (if filled, they must match).

| Column | Required | Rules |
|---|---|---|
| `company` | Yes | Company slug |
| `round_order` | Yes | 1, 2, 3… |
| `round_name`, `round_type` | Once per round | As in `company-rounds.csv` below |
| `platform`, `duration_min`, `is_elimination`, `round_description` | No | Next to `round_name`. As in `company-rounds.csv`. |
| `section_order`, `section_name`, `section_type`, `question_count`, `minutes`, `topics` | For section rows | As in `company-sections.csv` below |
| `negative_marks`, `can_go_back` | No | As in `company-sections.csv` |

For every company in the file, **the file is its full process**: rounds and sections that aren't in it are removed (the preview lists them first). A company's rows are imported together: if one of its rows has an error, none of that company's rows are imported, so a company never ends up half-updated. Other companies in the file aren't affected.

The older format splits this across `company-rounds.csv`, `company-sections.csv` and `company-sources.csv` (below). They add and update rows but never remove any.

**`companies/company-rounds.csv`** (older format): hiring process, one row per round.

| Column | Required | Rules |
|---|---|---|
| `company` | Yes | Company slug |
| `round_order` | Yes | 1, 2, 3… |
| `round_name` | Yes | e.g. `Online Assessment` |
| `round_type` | Yes | `online-test`, `coding-test`, `group-discussion`, `technical-interview`, `hr-interview`, `managerial-interview` |
| `platform` | No | Exam platform whose interface the mock copies: `tcs-ion`, `hackerrank`, `amcat`, `mettl`, `cocubes`, `hackerearth`, `other` |
| `duration_min` | No | Integer |
| `is_elimination` | No | `yes` / `no` |
| `description` | No | Markdown |

**`companies/company-sections.csv`** (older format): sections inside test rounds (used to build mock tests).

| Column | Required | Rules |
|---|---|---|
| `company` | Yes | Company slug |
| `round_order` | Yes | Round this section belongs to |
| `section_order` | Yes | 1, 2, 3… |
| `section_name` | Yes | e.g. `Numerical Ability` |
| `section_type` | Yes | `mcq` or `coding` |
| `question_count` | Yes | Integer |
| `minutes` | Yes | Section timer |
| `negative_marks` | No | Marks deducted per wrong answer, e.g. `0.25`. Default `0`. |
| `can_go_back` | No | `yes` / `no`: whether the real exam lets you return to earlier questions |
| `topics` | Yes | Topic slugs this section covers, joined with `\|` (also used for readiness weights) |

**`companies/company-sources.csv`** (older format): every company fact needs a source.

| Column | Required | Rules |
|---|---|---|
| `company` | Yes | Company slug |
| `label` | Yes | e.g. `Official careers page` |
| `url` | Yes | URL |
| `checked_on` | Yes | `YYYY-MM-DD` |

### 4.6 `companies/company-question-map.csv`: optional extra detail for company tags

The simple way to tag questions with companies is the `companies` column of the question and coding files (4.3, 4.4). Use this file only for detail that column can't hold: different `asked_in` months per company, the round, and `report_count`. If a question file has a `companies` column, it decides *which* companies are linked, so import the question files first and this file after; listing a company here that the question file leaves out gets it unlinked at the next question upload.

One row per item–company pair. The same question can appear in as many rows (companies) as needed.

| Column | Required | Rules |
|---|---|---|
| `company` | Yes | Company slug |
| `item_type` | Yes | `mcq` or `coding` |
| `item_id` | Yes | `external_id` of the question or problem |
| `round_order` | No | Round it relates to |
| `asked_in` | No | Months it was reported asked, `YYYY-MM` joined with `\|` (shown as "Asked in Aug 2026") |
| `report_count` | No | How many candidates reported it |

Re-uploading the same `company` + `item_type` + `item_id` updates the row.

`item_type = coding` rows link coding problems (by `external_id` of the problem); the same problem can be linked to many companies.

### 4.7 `tracks/role-tracks.csv`: experienced-candidate tracks

| Column | Required | Rules |
|---|---|---|
| `slug` | Yes | e.g. `backend-java` |
| `name` | Yes | e.g. `Backend (Java)` |
| `description` | Yes | One or two sentences |
| `audience` | Yes | `experienced`, `fresher` or `both` |
| `topics` | Yes | Topic slugs from any subject, joined with `\|` |
| `interview_types` | No | Interview type slugs (`hr`, `technical-fresher`, `company-specific`, `sde-experienced`, `system-design`), joined with `\|` |
| `order` | No | Sort order |
| `roadmap` | Yes | Markdown plan, e.g. week by week |

Tracks are live on import (like the taxonomy).

### 4.8 `design/design-questions.csv`: system design and low-level design

| Column | Required | Rules |
|---|---|---|
| `external_id` | Yes | e.g. `SD-0001`, `LLD-0001` |
| `slug` | Yes | URL slug, unique |
| `kind` | Yes | `system_design` or `low_level_design` |
| `title` | Yes | e.g. `Design a URL shortener` |
| `difficulty` | Yes | `easy`, `medium`, `hard` |
| `prompt` | Yes | Markdown: the question as asked |
| `requirements` | Yes | Markdown: functional and scale requirements |
| `approach` | Yes | Markdown: outline of a good answer |
| `tradeoffs` | Yes | Markdown: what to discuss |
| `follow_ups` | No | Markdown |
| `companies` | No | Company slugs where it was asked, joined with `\|` |
| `tracks` | No | Role track slugs, joined with `\|` |

Imported as drafts; publish them in admin › Design questions.

## 5. Mock test blueprints

Tests aren't imported. They're built in the admin (Content › Mock tests), usually with **Draft mock** from a company's `company-sections.csv` rows. A blueprint says, per section, how many items to draw from each topic (optionally by difficulty). Publishing checks that every rule can be drawn from published questions, or validated and published coding problems. Each student gets their own draw when they start. Rules and engine details: D-036.

## 6. Pipeline (implementation)

Code: `src/server/imports/` (one importer per file type in `definitions/`, the flow in `pipeline.ts`).

```
Upload file on /admin/imports (admin chooses the file type; max 25 MB)
  → store the original in storage, create an ImportBatch, queue a "validate" job
  → [worker] parse (CSV / XLSX / ZIP) and check the column names
  → [worker] validate every row; resolve slugs and external_ids to database IDs
  → [worker] same external_id → update or "no change"; similar text (pg_trgm ≥ 80%) → warning
  → [coding only, Phase 4] run reference solutions in the judge
  → preview page: counts, every row with its errors and warnings, download rows with errors
  → admin confirms → queue a "commit" job
  → [worker] validate again against the current database, then write drafts
             in transactions of 500 rows, store images, record versions and the audit log
  → report: new / updated / no change / not imported, failed-rows CSV
```

Rows with errors in the preview are skipped, never written. A row that was valid in the preview but fails at commit time (something changed in between) is marked failed. Jobs run in the background worker (`npm run worker`; `npm run dev` starts it) and are retried if the worker crashes (D-029).

**Undo:** a completed MCQ or passage import can be rolled back while every question it touched is still the draft that import created. Rollback deletes new items and restores the previous version of updated ones. Other import types (taxonomy, companies) are corrected by importing a fixed file.

### Two ways to import (D-054)

- **Add and update** (default, everyone): new rows are created, changed rows updated, unchanged rows skipped. Nothing is removed (except what a row itself says: a coding row's tests, a company's process, an item's company list).
- **Replace all** (super admins; companies, coding problems, MCQs): the file becomes the full set. For MCQs the scope is the file's subject; for coding problems and companies it's all of them. Items in scope but missing from the file are **archived**, never deleted: students no longer see them, and their attempts, submissions and history stay. The preview lists what will be archived; confirming needs `REPLACE` typed. Before anything changes, a backup of everything in scope (in the same file format) is saved on the import's page. A replace can't be undone with the Undo button; import the backup to bring archived items back as drafts. Importing an archived item in any mode brings it back as a draft.

### Download current data

Imports › Download current data exports companies, rounds and sections, coding problems and each subject's MCQs in the upload format, with IDs filled in. Re-importing an export unchanged changes nothing. Coding problems that don't fit the single-file columns (see 4.4) are left out of the export.

**Published content:** an import never publishes. If it changes a published or in-review question, that question goes back to draft for review (D-010, D-030).
