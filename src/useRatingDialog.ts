import {
  useCallback,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { savePlayerVideoComment, savePlayerVideoRating } from "./playerStorage";
import type {
  VideoCommentStore,
  VideoItem,
  VideoRatingStore,
} from "./playerTypes";

type UseRatingDialogParams = {
  videosRef: MutableRefObject<VideoItem[]>;
  videoRatingsRef: MutableRefObject<VideoRatingStore>;
  videoCommentsRef: MutableRefObject<VideoCommentStore>;
  setVideoRatings: Dispatch<SetStateAction<VideoRatingStore>>;
  setVideoComments: Dispatch<SetStateAction<VideoCommentStore>>;
};

export function useRatingDialog({
  videosRef,
  videoRatingsRef,
  videoCommentsRef,
  setVideoRatings,
  setVideoComments,
}: UseRatingDialogParams) {
  const [ratingDialogVideoId, setRatingDialogVideoId] = useState<string | null>(null);
  const [ratingInput, setRatingInput] = useState("");
  const [ratingCommentInput, setRatingCommentInput] = useState("");
  const [ratingHoverValue, setRatingHoverValue] = useState<number | null>(null);
  const [ratingMessage, setRatingMessage] = useState("");

  const ratingDialogVideoName =
    videosRef.current.find((video) => video.id === ratingDialogVideoId)?.name ?? "未选择视频";

  const closeRatingDialog = useCallback(() => {
    setRatingDialogVideoId(null);
  }, []);

  const replaceVideoRating = useCallback(
    (video: VideoItem, rating: number | null) => {
      const nextVideoRatings = { ...videoRatingsRef.current };
      if (rating === null) {
        delete nextVideoRatings[video.id];
      } else {
        nextVideoRatings[video.id] = Math.min(10, Math.max(0, rating));
      }
      videoRatingsRef.current = nextVideoRatings;
      setVideoRatings(nextVideoRatings);
      savePlayerVideoRating(video.id, rating).catch(() => {
        setRatingMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
      });
    },
    [setVideoRatings, videoRatingsRef],
  );

  const replaceVideoComment = useCallback(
    (video: VideoItem, comment: string) => {
      const trimmed = comment.trim();
      const nextVideoComments = { ...videoCommentsRef.current };
      if (trimmed) {
        nextVideoComments[video.id] = trimmed;
      } else {
        delete nextVideoComments[video.id];
      }
      videoCommentsRef.current = nextVideoComments;
      setVideoComments(nextVideoComments);
      savePlayerVideoComment(video.id, trimmed).catch(() => {
        setRatingMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
      });
    },
    [setVideoComments, videoCommentsRef],
  );

  const openVideoRatingDialog = useCallback(
    (video: VideoItem) => {
      const rating = videoRatingsRef.current[video.id];
      setRatingDialogVideoId(video.id);
      setRatingInput(typeof rating === "number" ? String(rating) : "");
      setRatingCommentInput(videoCommentsRef.current[video.id] ?? "");
      setRatingHoverValue(null);
      setRatingMessage("");
    },
    [videoCommentsRef, videoRatingsRef],
  );

  const saveRatingDialogValue = useCallback(() => {
    if (!ratingDialogVideoId) return;
    const video = videosRef.current.find((item) => item.id === ratingDialogVideoId);
    if (!video) return;
    const trimmed = ratingInput.trim();
    if (!trimmed) {
      replaceVideoRating(video, null);
      replaceVideoComment(video, ratingCommentInput);
      setRatingMessage(ratingCommentInput.trim() ? "已保存评价并清除评分。" : "已清除评分。");
      setRatingDialogVideoId(null);
      return;
    }
    const rating = Number(trimmed);
    if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
      setRatingMessage("评分必须是 0 到 10。");
      return;
    }
    replaceVideoRating(video, rating);
    replaceVideoComment(video, ratingCommentInput);
    setRatingMessage(ratingCommentInput.trim() ? `已保存 ${rating} 分和评价。` : `已保存 ${rating} 分。`);
    setRatingDialogVideoId(null);
  }, [
    ratingCommentInput,
    ratingDialogVideoId,
    ratingInput,
    replaceVideoComment,
    replaceVideoRating,
    videosRef,
  ]);

  const clearRatingDialogValue = useCallback(() => {
    setRatingInput("");
    setRatingCommentInput("");
    setRatingHoverValue(null);
    const video = videosRef.current.find((item) => item.id === ratingDialogVideoId);
    if (video) {
      replaceVideoRating(video, null);
      replaceVideoComment(video, "");
    }
    setRatingMessage("已清除评分和评价。");
  }, [ratingDialogVideoId, replaceVideoComment, replaceVideoRating, videosRef]);

  return {
    clearRatingDialogValue,
    closeRatingDialog,
    isRatingDialogOpen: Boolean(ratingDialogVideoId),
    openVideoRatingDialog,
    ratingCommentInput,
    ratingDialogVideoName,
    ratingHoverValue,
    ratingInput,
    ratingMessage,
    saveRatingDialogValue,
    setRatingCommentInput,
    setRatingHoverValue,
    setRatingInput,
    setRatingMessage,
  };
}
