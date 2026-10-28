import { describe, expect, it } from "vitest";
import { CellReader } from "@/server/imports/cells";

const read = (cells: Record<string, string>) => new CellReader(cells);
const today = new Date(Date.UTC(2026, 9, 19));

describe("CellReader", () => {
  it("reads required and optional text", () => {
    const r = read({ a: "  hi ", b: "" });
    expect(r.required("a")).toBe("hi");
    expect(r.optional("b")).toBeUndefined();
    expect(r.required("b")).toBeUndefined();
    expect(r.messages).toEqual([{ level: "error", column: "b", message: "Required." }]);
  });

  it("keeps Markdown line breaks", () => {
    expect(read({ q: "\nline 1\n\nline 2\n" }).markdown("q")).toBe("line 1\n\nline 2");
  });

  it("validates whole numbers and ranges", () => {
    const r = read({ a: "12", b: "1.5", c: "700" });
    expect(r.int("a")).toBe(12);
    expect(r.int("b")).toBeUndefined();
    expect(r.int("c", { max: 600 })).toBeUndefined();
    expect(r.messages.map((m) => m.column)).toEqual(["b", "c"]);
  });

  it("maps choices case-insensitively", () => {
    const r = read({ d: "Medium", e: "impossible" });
    const choices = { easy: 1, medium: 2 };
    expect(r.choice("d", choices)).toBe(2);
    expect(r.choice("e", choices)).toBeUndefined();
    expect(r.messages[0]?.message).toMatch(/Use one of: easy, medium/);
  });

  it("splits pipe lists and drops blanks", () => {
    expect(read({ t: " a | b ||c " }).list("t")).toEqual(["a", "b", "c"]);
  });

  it("validates dates strictly", () => {
    const r = read({ ok: "2026-02-28", bad: "2026-02-30", wrong: "28/02/2026" });
    expect(r.date("ok")?.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(r.date("bad")).toBeUndefined();
    expect(r.date("wrong")).toBeUndefined();
    expect(r.messages).toHaveLength(2);
  });

  it("reads months, newest first, and rejects future ones", () => {
    const r = read({ m: "2025-09|2026-08|2026-08", f: "2027-01", x: "2026-13" });
    expect(r.months("m", today)).toEqual(["2026-08", "2025-09"]);
    r.months("f", today);
    r.months("x", today);
    expect(r.messages.map((m) => m.column)).toEqual(["f", "x"]);
  });

  it("accepts only http(s) links", () => {
    const r = read({ a: "https://example.com/x", b: "javascript:alert(1)", c: "example.com" });
    expect(r.url("a")).toBe("https://example.com/x");
    expect(r.url("b")).toBeUndefined();
    expect(r.url("c")).toBeUndefined();
  });

  it("validates slugs and IDs", () => {
    const r = read({ s: "time-work", bad: "Time Work", id: "QA-PCT-0001", badId: "QA PCT" });
    expect(r.slug("s")).toBe("time-work");
    expect(r.slug("bad")).toBeUndefined();
    expect(r.externalId("id")).toBe("QA-PCT-0001");
    expect(r.externalId("badId")).toBeUndefined();
  });
});
