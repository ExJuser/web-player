import { useCallback, useState, type Dispatch, type DragEvent, type MutableRefObject, type SetStateAction } from "react";

import type {
  DataTransferItemWithHandle,
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
  PlayerPersistentSettings,
} from "./playerTypes";
import { savePlayerSetting } from "./playerStorage";

type UseMediaLibraryInputControllerOptions = {
  loadDirectoryMedia: (
    directory: FileSystemDirectoryHandle,
    options?: { remember?: boolean; promptForLabel?: boolean; restored?: boolean },
  ) => Promise<void>;
  loadFileMedia: (files: FileList | File[], messageSuffix?: string) => Promise<void>;
  playerSettingsRef: MutableRefObject<PlayerPersistentSettings>;
  setSkipFolderAccessPrompt: Dispatch<SetStateAction<boolean>>;
  setIsScanning: Dispatch<SetStateAction<boolean>>;
  setMessage: (message: string) => void;
  skipFolderAccessPrompt: boolean;
};

export function useMediaLibraryInputController({
  loadDirectoryMedia,
  loadFileMedia,
  playerSettingsRef,
  setSkipFolderAccessPrompt,
  setIsScanning,
  setMessage,
  skipFolderAccessPrompt,
}: UseMediaLibraryInputControllerOptions) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);

  const showDirectoryPickerUnsupportedMessage = useCallback(() => {
    setIsScanning(false);
    setIsFolderDialogOpen(false);
    setMessage("当前浏览器不支持无上传确认的文件夹选择，请使用支持 File System Access API 的浏览器。");
  }, [setIsScanning, setMessage]);

  const chooseMediaLibraryDirectory = useCallback(async () => {
    if (!window.showDirectoryPicker) {
      showDirectoryPickerUnsupportedMessage();
      return;
    }

    try {
      const directory = await window.showDirectoryPicker({ mode: "read" });
      await loadDirectoryMedia(directory, { remember: true, promptForLabel: true });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setMessage("已取消新增媒体库");
      } else {
        setMessage("新增媒体库失败，请确认浏览器权限后重试。");
      }
    } finally {
      setIsScanning(false);
    }
  }, [loadDirectoryMedia, setIsScanning, setMessage, showDirectoryPickerUnsupportedMessage]);

  const requestAddMediaLibrary = useCallback(() => {
    if (!window.showDirectoryPicker) {
      showDirectoryPickerUnsupportedMessage();
      return;
    }

    if (skipFolderAccessPrompt) {
      void chooseMediaLibraryDirectory();
      return;
    }

    setIsFolderDialogOpen(true);
  }, [chooseMediaLibraryDirectory, showDirectoryPickerUnsupportedMessage, skipFolderAccessPrompt]);

  const handleDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setIsDragActive(false);

      try {
        const items = Array.from(event.dataTransfer.items) as DataTransferItemWithHandle[];
        const handles = (
          await Promise.all(items.map((item) => item.getAsFileSystemHandle?.() ?? Promise.resolve(null)))
        ).filter((handle): handle is FileSystemDirectoryHandle | FileSystemFileHandle => Boolean(handle));
        const directory = handles.find((handle): handle is FileSystemDirectoryHandle => handle.kind === "directory");
        if (directory) {
          await loadDirectoryMedia(directory, { remember: true, promptForLabel: true });
          return;
        }

        const handleFiles = await Promise.all(
          handles
            .filter((handle): handle is FileSystemFileHandle => handle.kind === "file")
            .map((handle) => handle.getFile()),
        );
        const droppedFiles = handleFiles.length ? handleFiles : Array.from(event.dataTransfer.files);
        if (!droppedFiles.length) {
          setMessage("当前浏览器不支持拖入文件夹，请使用“新增媒体库”。");
          return;
        }

        await loadFileMedia(droppedFiles, "拖拽文件的播放进度仅在本次会话保留");
      } catch {
        setMessage("无法读取拖入的媒体，请确认浏览器权限后重试。");
      } finally {
        setIsScanning(false);
      }
    },
    [loadDirectoryMedia, loadFileMedia, setIsScanning, setMessage],
  );

  const updateSkipFolderAccessPrompt = useCallback((checked: boolean) => {
    setSkipFolderAccessPrompt(checked);
    playerSettingsRef.current = {
      ...playerSettingsRef.current,
      skipFolderAccessPrompt: checked,
    };
    savePlayerSetting("skipFolderAccessPrompt", checked).catch(() => {
      setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
    });
  }, [playerSettingsRef, setMessage]);

  return {
    chooseMediaLibraryDirectory,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    isDragActive,
    isFolderDialogOpen,
    requestAddMediaLibrary,
    setIsFolderDialogOpen,
    updateSkipFolderAccessPrompt,
  };
}
