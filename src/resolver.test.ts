import { expect, test } from "vitest";
import { normalizeRepoUrl, parseSpec, resolve, ResolveError } from "./resolver.js";

test("parseSpec splits name from version/range/tag, handling scoped names", () => {
  expect(parseSpec("lodash")).toEqual({ name: "lodash", range: "" });
  expect(parseSpec("lodash@4.17.21")).toEqual({ name: "lodash", range: "4.17.21" });
  expect(parseSpec("express@^4")).toEqual({ name: "express", range: "^4" });
  expect(parseSpec("lodash@latest")).toEqual({ name: "lodash", range: "latest" });
  expect(parseSpec("@types/node")).toEqual({ name: "@types/node", range: "" });
  expect(parseSpec("@types/node@20.1.0")).toEqual({ name: "@types/node", range: "20.1.0" });
});

test("normalizeRepoUrl turns common package.json forms into a browsable https url", () => {
  expect(normalizeRepoUrl("git+https://github.com/a/b.git")).toBe("https://github.com/a/b");
  expect(normalizeRepoUrl({ url: "git+ssh://git@github.com/a/b.git" })).toBe("https://github.com/a/b");
  expect(normalizeRepoUrl("git://github.com/a/b.git")).toBe("https://github.com/a/b");
  expect(normalizeRepoUrl("github:a/b")).toBe("https://github.com/a/b");
  expect(normalizeRepoUrl("https://gitlab.com/a/b")).toBe("https://gitlab.com/a/b");
  expect(normalizeRepoUrl(undefined)).toBeUndefined();
  expect(normalizeRepoUrl({})).toBeUndefined();
});

test("resolves a real pinned package", async () => {
  const meta = await resolve("left-pad@1.3.0");
  expect(meta.name).toBe("left-pad");
  expect(meta.version).toBe("1.3.0");
  expect(meta.tarball).toMatch(/^https?:\/\//);
  expect(typeof meta.publishedAt).toBe("string");
}, 20000);

test("throws ResolveError for a non-existent package", async () => {
  await expect(resolve("this-pkg-should-never-exist-pkgcheck-xyz")).rejects.toBeInstanceOf(ResolveError);
}, 20000);
