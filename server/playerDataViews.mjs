const startupFields = [
  "version",
  "items",
  "favorites",
  "videoRatings",
  "videoComments",
  "videoTags",
  "actorProfiles",
  "actorTagDefinitions",
  "videoActorOverrides",
  "videoStats",
  "watchActivity",
  "tagMergeDecisions",
  "danmakuPreferences",
  "preferences",
  "settings",
  "metadata",
];

const deferredFields = [
  "videoHighlights",
  "videoEditSegments",
  "embeddedSubtitles",
  "danmakuSelections",
  "duplicateDetection",
  "duplicateDetections",
];

function selectFields(store, fields) {
  if (!store) return null;
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(store, field)).map((field) => [field, store[field]]));
}

export function createPlayerStartupData(store) {
  return selectFields(store, startupFields);
}

export function createPlayerDeferredData(store) {
  return selectFields(store, deferredFields);
}
