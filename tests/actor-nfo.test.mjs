import assert from "node:assert/strict";
import test from "node:test";

import { findMatchingNfoName, parseActorNfoBytes } from "../src/actorNfoCore.mjs";

const encode = (value) => new TextEncoder().encode(value);

test("parses repeated actor names, filters non-actors, decodes entities, and deduplicates", () => {
  const result = parseActorNfoBytes(encode(`<?xml version="1.0"?>
    <movie>
      <actor><name>はやのうた</name><type>Actor</type></actor>
      <actor><name> Alice &amp; Bob </name></actor>
      <actor><name>はやのうた</name><type>actor</type></actor>
      <actor><name>未知演员</name></actor>
      <actor><name>导演</name><type>Director</type></actor>
    </movie>`), "movie.nfo");

  assert.deepEqual(result, { fileName: "movie.nfo", names: ["はやのうた", "Alice & Bob"], status: "parsed" });
});

test("rejects doctypes and reports malformed actor blocks", () => {
  assert.equal(parseActorNfoBytes(encode("<!DOCTYPE movie><movie />")).status, "invalid");
  assert.equal(parseActorNfoBytes(encode("<movie><actor><name>A</name></movie>")).status, "invalid");
});

test("matches only same-basename nfo files without case sensitivity", () => {
  assert.equal(findMatchingNfoName("Movie.MKV", ["movie.NFO", "other.nfo"]), "movie.NFO");
  assert.equal(findMatchingNfoName("Movie.MKV", ["other.nfo"]), null);
});
