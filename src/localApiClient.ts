export type LocalApiErrorResponse = {
  statusText: string;
  json: () => Promise<unknown>;
};

export async function readLocalApiErrorMessage(response: LocalApiErrorResponse) {
  let message = response.statusText;
  try {
    const payload = (await response.json()) as { error?: string };
    message = payload.error || message;
  } catch {
    // Keep status text when the local API does not return JSON.
  }
  return message;
}
