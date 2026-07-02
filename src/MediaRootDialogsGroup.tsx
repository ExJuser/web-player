import type { ComponentProps } from "react";

import { FolderAccessDialog } from "./FolderAccessDialog";
import {
  ExistingMediaRootDialog,
  MediaRootLabelDialog,
  MediaRootLocalPathDialogView,
} from "./MediaRootPromptDialogs";

type MediaRootDialogsGroupProps = {
  existingRoot: ComponentProps<typeof ExistingMediaRootDialog> | null;
  folderAccess: ComponentProps<typeof FolderAccessDialog>;
  label: ComponentProps<typeof MediaRootLabelDialog> | null;
  localPath: ComponentProps<typeof MediaRootLocalPathDialogView> | null;
};

export function MediaRootDialogsGroup({
  existingRoot,
  folderAccess,
  label,
  localPath,
}: MediaRootDialogsGroupProps) {
  return (
    <>
      {label ? <MediaRootLabelDialog {...label} /> : null}
      {existingRoot ? <ExistingMediaRootDialog {...existingRoot} /> : null}
      {localPath ? <MediaRootLocalPathDialogView {...localPath} /> : null}
      <FolderAccessDialog {...folderAccess} />
    </>
  );
}
