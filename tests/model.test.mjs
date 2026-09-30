import test from "node:test";
import assert from "node:assert/strict";
import {
  exportReview,
  newReview,
  timecode,
  validStamp,
  validateVideoUrl,
} from "../shared/model.mjs";
test("timecode handles hours, zero and invalid values", () => {
  assert.equal(timecode(0), "00:00");
  assert.equal(timecode(61.9), "01:01");
  assert.equal(timecode(3661), "01:01:01");
  assert.equal(timecode(NaN), "00:00");
});
test("exports sort feedback, preserve precise times and exclude connection credentials", () => {
  const review = newReview();
  review.token = "secret";
  review.stamps = [
    { id: "b", kind: "great", time: 12.345, note: 'Good, "timing"\nKeep it' },
    { id: "a", kind: "confusing", time: 2, note: "=SUM(A1)" },
  ];
  const csv = exportReview(review, "csv");
  assert.ok(csv.indexOf("Confusing") < csv.indexOf("Great moment"));
  assert.ok(csv.includes("12.345"));
  assert.ok(csv.includes('""timing""'));
  assert.ok(csv.includes("'=SUM"));
  const json = JSON.parse(exportReview(review, "json"));
  assert.equal(json.token, undefined);
  assert.equal(json.stamps[1].time, 12.345);
});
test("rejects invalid time and executable video URL schemes", () => {
  assert.equal(
    Boolean(validStamp({ id: "a", kind: "great", time: -1, note: "" })),
    false,
  );
  assert.throws(() => validateVideoUrl("javascript:alert(1)"));
  assert.throws(() =>
    validateVideoUrl("https://user:password@example.com/movie.mp4"),
  );
  assert.equal(
    validateVideoUrl("https://example.com/movie.mp4"),
    "https://example.com/movie.mp4",
  );
});
