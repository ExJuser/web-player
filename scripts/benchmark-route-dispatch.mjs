// API 路由正则分发基准：每请求全量执行 25 次匹配（旧） vs 惰性按需匹配（新）。
// 真实 middleware 的 if-else 链按顺序执行：静态路由在命中 url.pathname === 分支前
// 只执行位于其之前的参数化匹配；新实现里参数化匹配各自"命中即停"。
// 用法：node scripts/benchmark-route-dispatch.mjs
import { readFile } from "node:fs/promises";

// 从插件源码提取 routePatterns 对象字面量求值，保证与真实实现一致。
const pluginSource = await readFile(new URL("../server/playerDataApiPlugin.mjs", import.meta.url), "utf8");
const patternsStart = pluginSource.indexOf("const routePatterns = {");
const patternsEnd = pluginSource.indexOf("};", patternsStart) + 1;
const patternsLiteral = pluginSource.slice(patternsStart + "const routePatterns = ".length, patternsEnd);
const routePatterns = (0, eval)(`(${patternsLiteral})`);
const patternNames = Object.keys(routePatterns);
const totalPatterns = patternNames.length;

// 各路由在真实 if-else 链中命中所执行的参数化匹配次数（按链顺序数出）：
// - /api/mosaics：首个分支即静态命中 → 0 次
// - /api/player-data/global：global 分支之前有 mosaicAsset/mosaicProject/media/compatibleMedia → 4 次
// - /api/player-data/progress/x：progress 分支之前共 9 个参数化匹配 → 9 次
// - 未知路由：全部 25 次
const ROUTES = [
  { label: "/api/mosaics（静态首分支）", pathname: "/api/mosaics", newMatches: 0 },
  { label: "/api/player-data/global（静态中段）", pathname: "/api/player-data/global", newMatches: 4 },
  { label: "/api/player-data/progress/x（参数）", pathname: "/api/player-data/progress/root%7Cvideo%7C1%7C2", newMatches: 9 },
  { label: "/api/nonexistent（未知）", pathname: "/api/nonexistent", newMatches: 25 },
];

function matchesForPathnameLazy(pathname, limit) {
  let count = 0;
  for (let index = 0; index < limit; index += 1) {
    count += 1;
    if (pathname.match(routePatterns[patternNames[index]])) break;
  }
  return count;
}

function matchesForPathnameEager(pathname) {
  for (const name of patternNames) pathname.match(routePatterns[name]);
}

const ITERATIONS = 200000;

function time(label, fn) {
  const startedAt = performance.now();
  fn();
  const elapsedMs = performance.now() - startedAt;
  console.log(`${label.padEnd(44)} ${(elapsedMs / ITERATIONS * 1000).toFixed(2)} µs/请求`);
  return elapsedMs;
}

console.log(`路由模式数: ${totalPatterns}；迭代: ${ITERATIONS}`);
console.log("-".repeat(64));
for (const { label, pathname, newMatches } of ROUTES) {
  const oldMs = time(`[${label}] 旧：全量 ${totalPatterns} 次`, () => {
    for (let index = 0; index < ITERATIONS; index += 1) matchesForPathnameEager(pathname);
  });
  const newMs = time(`[${label}] 新：惰性 ${newMatches} 次`, () => {
    for (let index = 0; index < ITERATIONS; index += 1) {
      matchesForPathnameLazy(pathname, newMatches);
    }
  });
  const countReduction = ((1 - newMatches / totalPatterns) * 100).toFixed(0);
  const timeReduction = oldMs > 0 ? ((1 - newMs / oldMs) * 100).toFixed(0) : "0";
  console.log(`  → 匹配次数 ${totalPatterns} → ${newMatches}（${countReduction}% 减少）；耗时 ${timeReduction}% 减少`);
  console.log("-".repeat(64));
}
console.log("注：µs 级收益是路由分发的理论下界；实际收益还包括正则字面量不再每次请求重建（模式集中在模块顶层编译一次）。");
