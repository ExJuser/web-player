import type { ComponentProps } from "react";

import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

type DeletionDialogsProps = {
  photoAlbum: ComponentProps<typeof DeleteConfirmDialog>;
  photo: ComponentProps<typeof DeleteConfirmDialog>;
  video: ComponentProps<typeof DeleteConfirmDialog>;
};

export function DeletionDialogs({ photoAlbum, photo, video }: DeletionDialogsProps) {
  return (
    <>
      <DeleteConfirmDialog {...video} />
      <DeleteConfirmDialog {...photo} />
      <DeleteConfirmDialog {...photoAlbum} />
    </>
  );
}
