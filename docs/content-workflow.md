# Content workflow: 11 subjects and 150+ companies

How content is organised, written, checked and published at scale. Column-by-column rules for
each file are in [data-import.md](data-import.md); a complete, importable example of every file
is in [`mock-data/`](../mock-data/README.md).

## 1. The backend doesn't care how many files there are

Every row carries its own key: `external_id` for questions, problems and passages; `slug` for
companies, tracks and design questions; the company slug plus round order for rounds and
sections. An import **adds or updates** the rows it contains and never deletes anything that isn't
in the file. So:

- 1 file with 5,000 questions, or 100 files with 50 each, ends in exactly the same database.
- Importing the same file twice changes nothing ("unchanged").
- Fixing one question means re-importing only the file it's in.

Splitting files is for **people**: smaller files are easier to write, review, divide between
writers and re-import. The only order that matters is dependencies (taxonomy before questions,
questions before company maps), and the folder importer handles that.

## 2. Questions belong to topics, not companies

This is the most important rule. A percentages question asked by three companies is **one**
question, stored once, in `02-mcq/quantitative-aptitude/percentages.csv`. It lists the companies
that ask it in its `companies` column (`tcs|infosys|wipro`), with `asked_in` for when.

Never make files like `tcs-aptitude.csv` holding copies of questions. With 150 companies that
creates thousands of duplicates, splits a student's progress across copies, and turns every
correction into a search-and-replace across many files.

## 3. The folder layout

```
00-taxonomy/taxonomy.csv                  subjects → topics → subtopics (import first)
01-passages/passages.csv                  reading and DI passages
02-mcq/<subject>/<topic>.csv              one file per topic, ~50–500 questions each
03-coding/<set>.csv                       one row per problem: statement, solution, tests, companies
04-companies/companies.csv                every company: profile, eligibility and sources
04-companies/process.csv                  every company: rounds and test sections
05-tracks/role-tracks.csv
06-design/design-questions.csv
```

That is the whole layout (D-054). Questions and coding problems name the companies that ask them
in their `companies` column; there are no per-company folders. The older layout (a folder per
coding set with three files, a folder per company with four) still imports.

`npm run content:import -- <folder>` imports a whole folder in the right order, checks that every
row in `02-mcq/dbms/` really says `dbms`,
and reports any file that isn't in the layout instead of skipping it. Everything lands as
**drafts**; nothing reaches students until it's reviewed and published in admin. You can also
upload the files one at a time in admin › Imports, in the same order.

## 4. Company tiers: 150 companies are not 150 equal jobs

Use the `level` column to decide how deep each company goes, and work on the top tier first.

| Level | About how many | What to fill | Examples of the kind |
|---|---|---|---|
| `full` | 25–30 | Profile, every round and section, 2+ sources, a question map (50+ items), a company mock test | Mass recruiters most students face: the big IT service companies and the most common product companies on campus |
| `standard` | ~50 | Profile, rounds, sections, sources | Regular campus visitors |
| `generic` | the rest | Profile and rounds; practice comes from the shared topics | Occasional or regional recruiters |

Go wide before deep: get all 150 to `generic` (one `companies.csv` row and a few `process.csv` rows),
then raise companies a tier at a time, starting with whoever students target most. Admin shows
company requests from students, which tells you where to go next.

## 5. Shared exam patterns

Many companies hire through the same few assessment platforms, with near-identical sections.
Write each platform's sections once in a `_patterns/` note (not imported) and copy the rows into
each company's `sections.csv`, adjusting counts and minutes. If this grows to dozens of
companies per pattern, a small generator (pattern + company list → `sections.csv` files) is a
cheap next step.

## 6. IDs

- **Questions:** `<SUBJECT>-<TOPIC>-<NNNN>`, e.g. `QA-PCT-0101`, `OS-SCH-0207`. Subject and topic
  codes come from the table in `mock-data/README.md`.
- **Number blocks per writer:** give each writer a block per topic (writer 1: `0100–0999`,
  writer 2: `1000–1999`, ...) so two people never pick the same ID.
- **Coding:** `CODE-<THEME>-<NNNN>`, e.g. `CODE-ARR-0101`. **Passages:** `PSG-<SUBJECT>-<NNNN>`.
- **Companies:** the slug is the URL (`globex-systems`). Lowercase, hyphens, no year.
- **Never reuse or rename an ID.** Changing an ID creates a new item and orphans the old one with
  its students' progress. To remove something, archive it in admin.

## 7. The workflow

1. **Source of truth: a content repository** (a private Git repo in this layout), or a shared
   drive folder of Google Sheets exported as "CSV UTF-8" into the same layout. Git is better:
   every change has an author, a diff and a review.
2. **Owners.** One owner per subject and one per company tier. The subject owner approves
   questions; the company owner keeps profiles, patterns and sources current.
3. **Write** in the right topic or company file, with `source` filled honestly (`original`, or
   where it came from). Company facts need a row in `sources.csv`.
4. **Check** before merging: import the changed folder into a local or staging database with
   `npm run content:import`. Failing rows print with the row number and the reason.
5. **Import** to production (admin › Imports, or the script on the server). Items arrive as
   drafts with the batch recorded; a bad batch can be rolled back from admin.
6. **Publish** in admin: tick "Publish after import", or publish from admin › Drafts (several
   questions at once). Coding problems publish once they pass the judge check (D-056).
7. **Keep companies fresh.** `last_verified` on each company and `checked_on` on each source say
   when facts were confirmed. Re-verify every `full` company before each placement season
   (around June) and after students report a changed pattern.

## 8. Limits to keep in mind

- One file: up to 20,000 rows and 25 MB. Topic files of a few hundred rows are much easier to
  review.
- One MCQ file holds one subject (topics within it can mix, but one file per topic is clearer).
- Coding test cases for a problem are **replaced** as a set when that problem's rows are
  imported, so keep all of a problem's tests in one file.
- Admin › Imports takes one file at a time. For the first bulk load of 150 companies
  (about 600 company files) use `npm run content:import`. A "content pack" upload in admin (a ZIP
  of this layout, using the same ordering code) is the natural next feature.
