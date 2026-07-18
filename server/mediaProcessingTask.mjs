export function createMediaProcessingTaskGate() {
  let activeTask = null;
  return {
    acquire(kind) {
      if (activeTask) throw new Error("已有影片处理任务正在运行。");
      const token = Symbol(kind);
      activeTask = { kind, token };
      return () => {
        if (activeTask?.token === token) activeTask = null;
      };
    },
    activeKind() {
      return activeTask?.kind ?? null;
    },
  };
}
