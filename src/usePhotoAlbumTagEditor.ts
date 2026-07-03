import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { savePhotoAlbumTags } from "./photoAlbumStorage";
import {
  mergeTags,
  normalizeTagKey,
  parseTagInput,
} from "./tagUtils";
import type { PhotoAlbum } from "./playerTypes";

type UsePhotoAlbumTagEditorParams = {
  photoAlbumTagsRef: MutableRefObject<Record<string, string[]>>;
  photoAlbums: PhotoAlbum[];
  setPhotoAlbumTags: Dispatch<SetStateAction<Record<string, string[]>>>;
};

export function usePhotoAlbumTagEditor({
  photoAlbumTagsRef,
  photoAlbums,
  setPhotoAlbumTags,
}: UsePhotoAlbumTagEditorParams) {
  const [editorAlbumId, setEditorAlbumId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [message, setMessage] = useState("");

  const editorAlbum = useMemo(
    () => photoAlbums.find((album) => album.id === editorAlbumId) ?? null,
    [editorAlbumId, photoAlbums],
  );

  const closeEditor = useCallback(() => {
    setEditorAlbumId(null);
  }, []);

  const openEditor = useCallback((album: PhotoAlbum) => {
    setEditorAlbumId(album.id);
    setTagInput("");
    setMessage("");
  }, []);

  const replaceTags = useCallback(
    (album: PhotoAlbum, nextTags: string[], successMessage: string) => {
      const parsedTags = parseTagInput(nextTags.join(" "));
      const nextAlbumTags = {
        ...photoAlbumTagsRef.current,
        [album.id]: parsedTags,
      };
      if (!parsedTags.length) delete nextAlbumTags[album.id];
      photoAlbumTagsRef.current = nextAlbumTags;
      setPhotoAlbumTags(nextAlbumTags);
      setMessage(successMessage);
      void savePhotoAlbumTags(album.id, parsedTags).catch(() => {
        setMessage("图集标签保存失败。");
      });
    },
    [photoAlbumTagsRef, setPhotoAlbumTags],
  );

  const addTags = useCallback(() => {
    if (!editorAlbum) return;
    const incomingTags = parseTagInput(tagInput);
    if (!incomingTags.length) {
      setMessage("请输入至少一个标签。");
      return;
    }
    const existingTags = photoAlbumTagsRef.current[editorAlbum.id] ?? [];
    const nextTags = mergeTags(existingTags, incomingTags);
    replaceTags(editorAlbum, nextTags, `已保存 ${nextTags.length} 个标签。`);
    setTagInput("");
  }, [editorAlbum, photoAlbumTagsRef, replaceTags, tagInput]);

  const removeTag = useCallback(
    (tag: string) => {
      if (!editorAlbum) return;
      const removedKey = normalizeTagKey(tag);
      const nextTags = (photoAlbumTagsRef.current[editorAlbum.id] ?? []).filter((item) => normalizeTagKey(item) !== removedKey);
      replaceTags(editorAlbum, nextTags, nextTags.length ? `已移除标签“${tag}”。` : "已清空图集标签。");
    },
    [editorAlbum, photoAlbumTagsRef, replaceTags],
  );

  return {
    addTags,
    closeEditor,
    editorAlbum,
    message,
    openEditor,
    removeTag,
    setTagInput,
    tagInput,
  };
}
