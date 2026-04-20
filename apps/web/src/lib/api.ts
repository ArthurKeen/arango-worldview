export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

function describeFetchError(err: unknown) {
  if (err instanceof Error) return err.message || String(err);
  return String(err);
}

export async function postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Failed to fetch ${API_URL}${path}. Is the API running and reachable? (NEXT_PUBLIC_API_URL)\n${describeFetchError(err)}`,
    );
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as TResponse;
}

export async function getJson<TResponse>(path: string): Promise<TResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method: "GET" });
  } catch (err) {
    throw new Error(
      `Failed to fetch ${API_URL}${path}. Is the API running and reachable? (NEXT_PUBLIC_API_URL)\n${describeFetchError(err)}`,
    );
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as TResponse;
}

