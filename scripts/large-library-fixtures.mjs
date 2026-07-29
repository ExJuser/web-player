export const defaultLargeLibraryVideoCount = 20_000;
export const defaultLargeLibraryPhotoCount = 500_000;

export function createLargeLibrarySearchRecords(count = defaultLargeLibraryVideoCount) {
  return Array.from({ length: count }, (_, index) => {
    const episode = String((index % 24) + 1).padStart(2, "0");
    const series = `系列 ${Math.floor(index / 24) + 1}`;
    return {
      id: `root-${index % 4}|${series}/${episode}.mkv|${1_000_000_000 + index}|${1_700_000_000_000 + index}`,
      title: `${series} 第 ${episode} 集`,
      path: `媒体库 ${index % 4}/${series}/${episode}.mkv`,
      score: index % 11,
      series,
      tags: [`标签 ${index % 200}`, index % 3 === 0 ? "中文字幕" : "高清"],
      actors: [`演员 ${index % 800}`],
      actorAliases: [`Actor ${index % 800}`],
      comment: index % 17 === 0 ? `第 ${episode} 集的备注` : "",
      highlightDescriptions: index % 13 === 0 ? [`高能片段 ${index % 50}`] : [],
      library: `媒体库 ${index % 4}`,
    };
  });
}

export function createLargeMosaicAlbums(photoCount = defaultLargeLibraryPhotoCount, albumSize = 500) {
  const albumCount = Math.ceil(photoCount / albumSize);
  return Array.from({ length: albumCount }, (_, albumIndex) => {
    const start = albumIndex * albumSize;
    const count = Math.min(albumSize, photoCount - start);
    return {
      id: `album-${albumIndex}`,
      title: `图集 ${albumIndex}`,
      images: Array.from({ length: count }, (_, imageIndex) => {
        const globalIndex = start + imageIndex;
        return {
          id: `image-${globalIndex}`,
          name: `${globalIndex}.jpg`,
          relativePath: `图集 ${albumIndex}/${globalIndex}.jpg`,
          url: `/api/media/photos/${albumIndex}/${globalIndex}.jpg`,
          size: 1_000_000 + globalIndex,
          lastModified: 1_700_000_000_000 + globalIndex,
          mediaRootId: "photos",
          index: imageIndex,
        };
      }),
    };
  });
}

export function flattenMosaicPhotoSources(albums) {
  return albums.flatMap((album) =>
    album.images.map((image) => ({
      id: `photo:${album.id}:${image.id}`,
      kind: "photo",
      label: `${album.title} · ${image.name}`,
      albumId: album.id,
      imageId: image.id,
      imageIndex: image.index,
      mediaRootId: image.mediaRootId,
      size: image.size,
      lastModified: image.lastModified,
      url: image.url,
    })),
  );
}
