import assert from "node:assert/strict";
import test from "node:test";
import { compareStudentNamesByLastName } from "../lib/studentNameSort";

test("student names sort by last name and then first name", () => {
  const names = ["Ada Lovelace", "John Smith", "Grace Hopper", "Alice Smith", "Katherine Johnson"];

  assert.deepEqual(names.sort(compareStudentNamesByLastName), [
    "Grace Hopper",
    "Katherine Johnson",
    "Ada Lovelace",
    "Alice Smith",
    "John Smith",
  ]);
});

test("student name sorting supports Last, First format and email fallbacks", () => {
  const students = [
    { name: "", email: "zoe@example.test" },
    { name: "Huang, Jason", email: "jason@example.test" },
    { name: "Amy Adams", email: "amy@example.test" },
  ];

  students.sort((left, right) => compareStudentNamesByLastName(left.name, right.name, left.email, right.email));

  assert.deepEqual(students.map((student) => student.email), [
    "amy@example.test",
    "jason@example.test",
    "zoe@example.test",
  ]);
});
