// eslint-disable-next-line @typescript-eslint/no-shadow
import { beforeEach, describe, expect, it } from "vitest";
import { createNewList } from "./create-list.js";

describe(`createNewList`, () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it(`should generate a valid UUID`, async () => {
    const listId = await createNewList();

    // UUID v4 regex pattern
    const uuidPattern =
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu;
    expect(uuidPattern.test(listId)).toBe(true);
  });

  it(`should add the new list to the registry`, async () => {
    const listId = await createNewList();

    const stored = localStorage.getItem(`grocery-list-registry`);
    expect(JSON.parse(stored!)).toEqual([listId]);
  });

  it(`should create unique UUIDs for multiple lists`, async () => {
    const listId1 = await createNewList();
    const listId2 = await createNewList();
    const listId3 = await createNewList();

    expect(listId1).not.toBe(listId2);
    expect(listId2).not.toBe(listId3);
    expect(listId1).not.toBe(listId3);

    const stored = localStorage.getItem(`grocery-list-registry`);
    expect(JSON.parse(stored!)).toEqual([listId1, listId2, listId3]);
  });
});
