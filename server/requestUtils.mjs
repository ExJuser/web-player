export const maxRequestBodyBytes = 12 * 1024 * 1024;

// 带 HTTP 状态码的可预期错误：API 层用于区分客户端错误（400/404/409）
// 与真正的服务端故障（500），避免全部收敛成 500。
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function createApiError(status, message) {
  return new ApiError(status, message);
}

export function sanitizeStorageId(value) {
  if (!/^[A-Za-z0-9._~-]{1,240}$/.test(value)) {
    return null;
  }
  return value;
}

export function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxRequestBodyBytes) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

export async function parseJsonBody(request) {
  return JSON.parse((await readBody(request)).toString("utf8"));
}
