import {
  describe as describeTest,
  expect as expectValue,
  it as itTest,
  beforeEach as setupBeforeEach,
} from "vitest";
import {
  addListToRegistry,
  getRecentListsWithMetadata,
  removeListFromRegistry,
} from "./list-registry.js";

describeTest(`list-registry`, () => {
  setupBeforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describeTest(`addListToRegistry`, () => {
    itTest(`should add a list to an empty registry`, () => {
      addListToRegistry(`list-1`);

      const stored = localStorage.getItem(`grocery-list-registry`);
      expectValue(JSON.parse(stored!)).toMatchInlineSnapshot(`
        [
          "list-1",
        ]
      `);
    });

    itTest(`should add multiple lists`, () => {
      addListToRegistry(`list-1`);
      addListToRegistry(`list-2`);
      addListToRegistry(`list-3`);

      const stored = localStorage.getItem(`grocery-list-registry`);
      expectValue(JSON.parse(stored!)).toMatchInlineSnapshot(`
        [
          "list-1",
          "list-2",
          "list-3",
        ]
      `);
    });

    itTest(`should not add duplicates`, () => {
      addListToRegistry(`list-1`);
      addListToRegistry(`list-1`);
      addListToRegistry(`list-1`);

      const stored = localStorage.getItem(`grocery-list-registry`);
      expectValue(JSON.parse(stored!)).toMatchInlineSnapshot(`
        [
          "list-1",
        ]
      `);
    });
  });

  describeTest(`removeListFromRegistry`, () => {
    itTest(`should remove a list from the registry`, () => {
      addListToRegistry(`list-1`);
      addListToRegistry(`list-2`);
      addListToRegistry(`list-3`);

      removeListFromRegistry(`list-2`);

      const stored = localStorage.getItem(`grocery-list-registry`);
      expectValue(JSON.parse(stored!)).toMatchInlineSnapshot(`
        [
          "list-1",
          "list-3",
        ]
      `);
    });

    itTest(`should handle removing a list that doesn't exist`, () => {
      addListToRegistry(`list-1`);
      addListToRegistry(`list-2`);

      removeListFromRegistry(`list-3`);

      const stored = localStorage.getItem(`grocery-list-registry`);
      expectValue(JSON.parse(stored!)).toMatchInlineSnapshot(`
        [
          "list-1",
          "list-2",
        ]
      `);
    });

    itTest(`should handle removing from an empty registry`, () => {
      removeListFromRegistry(`list-1`);

      const stored = localStorage.getItem(`grocery-list-registry`);
      expectValue(stored).toBe(`[]`);
    });
  });

  describeTest(`getRecentListsWithMetadata`, () => {
    itTest(`should return empty array for empty registry`, async () => {
      const lists = await getRecentListsWithMetadata();
      expectValue(lists).toEqual([]);
    });

    itTest(`should skip lists that don't exist in OPFS`, async () => {
      addListToRegistry(`nonexistent-list-1`);
      addListToRegistry(`nonexistent-list-2`);

      const lists = await getRecentListsWithMetadata();
      expectValue(lists).toEqual([]);
    });

    // Note: Testing with actual databases would require setting up OPFS and databases
    // For now, we test the error handling path (non-existent databases)
  });
});
