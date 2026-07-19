const actorCoverWidth = 480;
const actorCoverHeight = 270;
const maxActorCoverUploadBytes = 20 * 1024 * 1024;

export async function createUploadedActorCoverBlob(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("请选择有效的图片文件。");
  if (file.size > maxActorCoverUploadBytes) throw new Error("封面图片不能超过 20 MB。");

  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = actorCoverWidth;
    canvas.height = actorCoverHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理封面图片。");

    const targetRatio = actorCoverWidth / actorCoverHeight;
    const sourceRatio = bitmap.width / bitmap.height;
    const sourceWidth = sourceRatio > targetRatio ? bitmap.height * targetRatio : bitmap.width;
    const sourceHeight = sourceRatio > targetRatio ? bitmap.height : bitmap.width / targetRatio;
    const sourceX = (bitmap.width - sourceWidth) / 2;
    const sourceY = (bitmap.height - sourceHeight) / 2;
    context.fillStyle = "#111827";
    context.fillRect(0, 0, actorCoverWidth, actorCoverHeight);
    context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, actorCoverWidth, actorCoverHeight);

    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("封面图片压缩失败。")),
      "image/jpeg",
      0.86,
    ));
  } finally {
    bitmap.close();
  }
}
