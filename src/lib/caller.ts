/**
 * Client-side endpoint caller, replacing `zitejs/caller`.
 *
 * Zite's version POSTed to its own runtime and threw errors shaped like
 * `API call failed (500): {"statusCode":500,...}` -- Jacob saw exactly that text
 * in the browser console. We keep the same shape so any UI or habit that reads
 * it still works, and we dispatch `crew:unauthorized` on 401 so useAuth can drop
 * to the signed-out state without polling.
 */

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(`API call failed (${status}): ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

export function createCaller<Input = unknown, Output = unknown>(name: string) {
  return async function call(input?: Input): Promise<Output> {
    const res = await fetch(`/api/${name}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input ?? {}),
    });

    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('crew:unauthorized'));
      throw new ApiError(401, await safeJson(res));
    }
    if (!res.ok) throw new ApiError(res.status, await safeJson(res));
    if (res.status === 204) return undefined as Output;
    return (await res.json()) as Output;
  };
}

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}