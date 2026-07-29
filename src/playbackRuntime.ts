import { useRef, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";

export type PlaybackSnapshot = {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
};

type Listener = () => void;

export type PlaybackRuntimeApi = {
  getSnapshot: () => PlaybackSnapshot;
  getCurrentTime: () => number;
  getDuration: () => number;
  getIsPlaying: () => boolean;
  reset: () => void;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  setDuration: Dispatch<SetStateAction<number>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  subscribe: (listener: Listener) => () => void;
  subscribeDuration: (listener: Listener) => () => void;
  subscribePlaying: (listener: Listener) => () => void;
};

const initialSnapshot: PlaybackSnapshot = {
  currentTime: 0,
  duration: 0,
  isPlaying: false,
};

function resolveUpdate<Value>(current: Value, update: SetStateAction<Value>) {
  return typeof update === "function"
    ? (update as (previous: Value) => Value)(current)
    : update;
}

export function createPlaybackRuntime(initial: Partial<PlaybackSnapshot> = {}): PlaybackRuntimeApi {
  let snapshot = { ...initialSnapshot, ...initial };
  const listeners = new Set<Listener>();
  const durationListeners = new Set<Listener>();
  const playingListeners = new Set<Listener>();

  const notify = (specificListeners?: Set<Listener>) => {
    listeners.forEach((listener) => listener());
    specificListeners?.forEach((listener) => listener());
  };
  const subscribeTo = (target: Set<Listener>) => (listener: Listener) => {
    target.add(listener);
    return () => target.delete(listener);
  };

  const setCurrentTime: PlaybackRuntimeApi["setCurrentTime"] = (update) => {
    const currentTime = resolveUpdate(snapshot.currentTime, update);
    if (Object.is(currentTime, snapshot.currentTime)) return;
    snapshot = { ...snapshot, currentTime };
    notify();
  };
  const setDuration: PlaybackRuntimeApi["setDuration"] = (update) => {
    const duration = resolveUpdate(snapshot.duration, update);
    if (Object.is(duration, snapshot.duration)) return;
    snapshot = { ...snapshot, duration };
    notify(durationListeners);
  };
  const setIsPlaying: PlaybackRuntimeApi["setIsPlaying"] = (update) => {
    const isPlaying = resolveUpdate(snapshot.isPlaying, update);
    if (Object.is(isPlaying, snapshot.isPlaying)) return;
    snapshot = { ...snapshot, isPlaying };
    notify(playingListeners);
  };

  return {
    getSnapshot: () => snapshot,
    getCurrentTime: () => snapshot.currentTime,
    getDuration: () => snapshot.duration,
    getIsPlaying: () => snapshot.isPlaying,
    reset: () => {
      const durationChanged = snapshot.duration !== 0;
      const playingChanged = snapshot.isPlaying;
      if (snapshot.currentTime === 0 && !durationChanged && !playingChanged) return;
      snapshot = initialSnapshot;
      notify();
      if (durationChanged) durationListeners.forEach((listener) => listener());
      if (playingChanged) playingListeners.forEach((listener) => listener());
    },
    setCurrentTime,
    setDuration,
    setIsPlaying,
    subscribe: subscribeTo(listeners),
    subscribeDuration: subscribeTo(durationListeners),
    subscribePlaying: subscribeTo(playingListeners),
  };
}

export function usePlaybackRuntime() {
  const runtimeRef = useRef<PlaybackRuntimeApi | null>(null);
  if (!runtimeRef.current) runtimeRef.current = createPlaybackRuntime();
  return runtimeRef.current;
}

export function usePlaybackSnapshot(runtime: PlaybackRuntimeApi) {
  return useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
}

export function usePlaybackDuration(runtime: PlaybackRuntimeApi) {
  return useSyncExternalStore(runtime.subscribeDuration, runtime.getDuration, runtime.getDuration);
}

export function usePlaybackPlaying(runtime: PlaybackRuntimeApi) {
  return useSyncExternalStore(runtime.subscribePlaying, runtime.getIsPlaying, runtime.getIsPlaying);
}
