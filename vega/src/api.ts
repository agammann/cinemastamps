export type Connection = {base: string; token: string};
export function connectionFor(
  base: string,
  saved: Connection | null,
  token?: string,
): Connection {
  const cleanBase = base.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/?#]+(?::\d+)?$/.test(cleanBase))
    throw new Error(
      'Enter a service address such as http://192.168.1.20:4320.',
    );
  return {
    base: cleanBase,
    token: token ?? (saved?.base === cleanBase ? saved.token : ''),
  };
}
export type Kind = 'great' | 'dragging' | 'confusing';
export type Stamp = {id: string; kind: Kind; time: number; note: string};
export type Review = {
  id: string;
  title: string;
  revision: number;
  source: {id: string; kind: string; name: string};
  stamps: Stamp[];
};
export const labels = {
  great: 'Great moment',
  dragging: 'Dragging',
  confusing: 'Confusing',
};
export function timecode(time: number) {
  const value = Math.max(0, Math.floor(time || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(
    value % 60,
  ).padStart(2, '0')}`;
}
export async function api(
  connection: Connection,
  route: string,
  method = 'GET',
  body?: unknown,
) {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 12000);
  try {
    const response = await fetch(`${connection.base}/api${route}`, {
      method,
      signal: abort.signal,
      headers: {
        Authorization: `Bearer ${connection.token}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
    if (!response.ok) {
      const value = await response.json().catch(() => ({}));
      const error = new Error(
        value.error || `Request failed (${response.status})`,
      ) as Error & {status?: number};
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  } finally {
    clearTimeout(timeout);
  }
}
