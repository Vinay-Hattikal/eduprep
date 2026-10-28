import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ImportFileError, parseCsv, parseImportFile, toCsv } from "@/server/imports/parse";

const csv = (text: string) => strToU8(text);

describe("parseCsv", () => {
  it("reads quoted cells with commas, quotes, pipes and line breaks", () => {
    const { headers, rows } = parseCsv(csv('id,text,tags\nQ1,"Hello, ""world""\nline 2",a|b\n'));
    expect(headers).toEqual(["id", "text", "tags"]);
    expect(rows).toEqual([
      { rowNumber: 2, cells: { id: "Q1", text: 'Hello, "world"\nline 2', tags: "a|b" } },
    ]);
  });

  it("never mistakes pipes for the delimiter", () => {
    const { rows } = parseCsv(csv("a,b\nx|y|z,1|2\n"));
    expect(rows[0]?.cells).toEqual({ a: "x|y|z", b: "1|2" });
  });

  it("strips a UTF-8 BOM and skips blank lines", () => {
    const { headers, rows } = parseCsv(csv("﻿a,b\n1,2\n\n3,4\n"));
    expect(headers).toEqual(["a", "b"]);
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 4]);
  });

  it.each([
    ["", /empty/],
    ["a,b\n", /no rows/],
    ["a,a\n1,2\n", /appears twice/],
    ["a,b\n1,2,3\n", /more cells/],
    ['a,b\n"1,2\n', /never closed/],
  ])("rejects %j", (text, message) => {
    expect(() => parseCsv(csv(text))).toThrow(message);
  });

  it("rejects text that isn't UTF-8", () => {
    expect(() => parseCsv(new Uint8Array([0x61, 0x0a, 0xff, 0xfe]))).toThrow(/UTF-8/);
  });
});

describe("parseImportFile", () => {
  it("reads a ZIP with one CSV and an assets folder", async () => {
    const zip = zipSync({
      "batch/questions.csv": strToU8("a\n1\n"),
      "batch/assets/chart.png": new Uint8Array([1, 2, 3]),
      "__MACOSX/batch/._questions.csv": strToU8("junk"),
    });
    const file = await parseImportFile("batch.zip", zip, { allowZip: true });
    expect(file.rows).toHaveLength(1);
    expect([...file.assets.keys()]).toEqual(["chart.png"]);
  });

  it("rejects ZIPs with no table, two tables or non-image assets", async () => {
    const none = zipSync({ "assets/a.png": new Uint8Array([1]) });
    const two = zipSync({ "a.csv": strToU8("a\n1\n"), "b.csv": strToU8("a\n1\n") });
    const script = zipSync({ "a.csv": strToU8("a\n1\n"), "assets/x.js": strToU8("alert(1)") });
    await expect(parseImportFile("x.zip", none, { allowZip: true })).rejects.toThrow(/exactly one/);
    await expect(parseImportFile("x.zip", two, { allowZip: true })).rejects.toThrow(/exactly one/);
    await expect(parseImportFile("x.zip", script, { allowZip: true })).rejects.toThrow(/only PNG/);
  });

  it("rejects ZIPs where not allowed and unknown file types", async () => {
    const zip = zipSync({ "a.csv": strToU8("a\n1\n") });
    await expect(parseImportFile("x.zip", zip, { allowZip: false })).rejects.toBeInstanceOf(
      ImportFileError,
    );
    await expect(parseImportFile("x.txt", csv("a\n1\n"), { allowZip: true })).rejects.toThrow(
      /\.csv/,
    );
  });
});

it("writes CSV with quoting for the failed-rows download", () => {
  expect(toCsv(["a", "error"], [{ a: "x, y", error: 'say "hi"' }])).toBe(
    'a,error\r\n"x, y","say ""hi"""',
  );
});
