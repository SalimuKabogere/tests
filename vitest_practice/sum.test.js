import { test, expect } from "vitest";
import { add } from "./sum.js";

test("sum of 1 and 2 to be 3", () => {
    expect(add(1, 2)).toBe(3);
})
