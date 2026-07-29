import type { ActiveView } from "./playerTypes";

export type ExploreSection = "overview" | "actors" | "creative";
export type ExploreFeature = "rings" | "mosaic";
export type PhotoViewerReturnTarget = "photos" | "mosaic";

export type AppRoute =
  | { kind: "home" }
  | {
      kind: "explore";
      section: ExploreSection;
      feature?: ExploreFeature;
      actorId?: string;
    }
  | { kind: "player"; videoId: string }
  | { kind: "photos" }
  | {
      kind: "photoViewer";
      albumId: string;
      imageId?: string;
      returnTo: PhotoViewerReturnTarget;
    };

const homeRoute: AppRoute = { kind: "home" };

function parseHashParts(hash: string) {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  const [rawPath = "", rawQuery = ""] = value.split("?", 2);
  const path = rawPath.replace(/\/+$/, "") || "/";
  return { path, params: new URLSearchParams(rawQuery) };
}

export function parseAppRoute(hash: string): AppRoute {
  const { path, params } = parseHashParts(hash);

  if (path === "/home") return homeRoute;
  if (path === "/explore/overview") return { kind: "explore", section: "overview" };
  if (path === "/explore/actors") {
    const actorId = params.get("actor")?.trim();
    return actorId
      ? { kind: "explore", section: "actors", actorId }
      : { kind: "explore", section: "actors" };
  }
  if (path === "/explore/creative") return { kind: "explore", section: "creative" };
  if (path === "/explore/creative/rings") {
    return { kind: "explore", section: "creative", feature: "rings" };
  }
  if (path === "/explore/creative/mosaic") {
    return { kind: "explore", section: "creative", feature: "mosaic" };
  }
  if (path === "/player") {
    const videoId = params.get("video")?.trim();
    return videoId ? { kind: "player", videoId } : homeRoute;
  }
  if (path === "/photos") return { kind: "photos" };
  if (path === "/photos/viewer") {
    const albumId = params.get("album")?.trim();
    if (!albumId) return { kind: "photos" };
    const imageId = params.get("image")?.trim();
    return {
      kind: "photoViewer",
      albumId,
      ...(imageId ? { imageId } : {}),
      returnTo: params.get("from") === "mosaic" ? "mosaic" : "photos",
    };
  }

  return homeRoute;
}

export function serializeAppRoute(route: AppRoute) {
  const params = new URLSearchParams();

  switch (route.kind) {
    case "home":
      return "#/home";
    case "explore":
      if (route.section === "overview") return "#/explore/overview";
      if (route.section === "actors") {
        if (route.actorId) params.set("actor", route.actorId);
        return `#/explore/actors${params.size ? `?${params}` : ""}`;
      }
      return route.feature
        ? `#/explore/creative/${route.feature}`
        : "#/explore/creative";
    case "player":
      params.set("video", route.videoId);
      return `#/player?${params}`;
    case "photos":
      return "#/photos";
    case "photoViewer":
      params.set("album", route.albumId);
      if (route.imageId) params.set("image", route.imageId);
      params.set("from", route.returnTo);
      return `#/photos/viewer?${params}`;
  }
}

export function activeViewForRoute(route: AppRoute): ActiveView {
  switch (route.kind) {
    case "home":
      return "home";
    case "explore":
      return "explore";
    case "player":
      return "player";
    case "photos":
      return "photos";
    case "photoViewer":
      return "photoViewer";
  }
}
