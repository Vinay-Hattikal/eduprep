import { describe, expect, it } from "vitest";
import { formatPaise } from "@/lib/format";
import {
  isSettingKey,
  parseSettingInput,
  resolveSettingValue,
  SETTING_KEYS,
  SETTINGS,
  settingInputValue,
} from "@/server/services/settings/registry";

describe("settings registry", () => {
  it("seeds the D-026 placeholder prices in paise", () => {
    expect(SETTINGS["pricing.companyPack"].defaultValue).toBe(19_900);
    expect(SETTINGS["pricing.proHalfYearly"].defaultValue).toBe(1_49_900);
    expect(SETTINGS["interviews.systemDesign"].defaultValue).toBe(2_49_900);
    expect(SETTINGS["payouts.interviewerSharePercent"].defaultValue).toBe(70);
  });

  it("has valid defaults for every setting", () => {
    for (const key of SETTING_KEYS) {
      const { defaultValue } = SETTINGS[key];
      expect(resolveSettingValue(key, defaultValue)).toBe(defaultValue);
    }
  });

  it("falls back to the default when the stored value is invalid", () => {
    expect(resolveSettingValue("limits.freeMcqPerDay", "lots")).toBe(25);
    expect(resolveSettingValue("payouts.interviewerSharePercent", 150)).toBe(70);
    expect(resolveSettingValue("pricing.companyPack", undefined)).toBe(19_900);
  });

  it("recognises setting keys", () => {
    expect(isSettingKey("pricing.companyPack")).toBe(true);
    expect(isSettingKey("toString")).toBe(false);
  });
});

describe("parseSettingInput", () => {
  it("converts rupees to paise for money", () => {
    expect(parseSettingInput("pricing.companyPack", "249")).toBe(24_900);
    expect(parseSettingInput("pricing.companyPack", "1,499.50")).toBe(1_49_950);
  });

  it("keeps integers and percents as typed", () => {
    expect(parseSettingInput("limits.freeMcqPerDay", "30")).toBe(30);
    expect(parseSettingInput("payouts.interviewerSharePercent", "75")).toBe(75);
  });

  it.each([
    ["payouts.interviewerSharePercent", "101"],
    ["limits.freeMcqPerDay", "-1"],
    ["limits.freeMcqPerDay", "2.5"],
    ["pricing.companyPack", "abc"],
    ["pricing.companyPack", ""],
    ["pricing.companyPack", "1.999"],
  ] as const)("rejects %s = %j", (key, input) => {
    expect(parseSettingInput(key, input)).toBeNull();
  });
});

describe("display helpers", () => {
  it("shows money in rupees", () => {
    expect(settingInputValue("pricing.proHalfYearly", 1_49_900)).toBe("1499");
    expect(settingInputValue("pricing.proHalfYearly", 1_49_950)).toBe("1499.50");
    expect(formatPaise(1_49_900)).toBe("₹1,499");
  });
});
