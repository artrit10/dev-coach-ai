import { describe, expect, it } from "vitest";
import { createDailyBudget } from "./budget.js";

describe("createDailyBudget", () => {
  it("allows requests up to the limit, then refuses", () => {
    const budget = createDailyBudget(2);
    expect([budget.take(), budget.take(), budget.take()]).toEqual([true, true, false]);
  });

  it("resets on a new UTC day", () => {
    let now = new Date("2026-10-27T23:59:00Z");
    const budget = createDailyBudget(1, () => now);
    expect(budget.take()).toBe(true);
    expect(budget.take()).toBe(false);
    now = new Date("2026-10-28T00:01:00Z");
    expect(budget.take()).toBe(true);
  });

  it("allows nothing when the limit is 0", () => {
    expect(createDailyBudget(0).take()).toBe(false);
  });
});
