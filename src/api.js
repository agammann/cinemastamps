export async function api(connection, route, options = {}) {
  const headers = {
    ...(connection?.token
      ? { Authorization: `Bearer ${connection.token}` }
      : {}),
    ...options.headers,
  };
  if (options.body && !(options.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const response = await fetch(`${connection?.base || ""}/api${route}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    throw new Error(value.error || `Request failed (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}
export function download(reviewText, format) {
  if (window.CinemaNative) {
    const result = window.CinemaNative.exportReview(reviewText, format);
    if (result.startsWith("ERROR:")) throw new Error(result);
    return result;
  }
  const blob = new Blob([reviewText], {
    type: format === "json" ? "application/json" : "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cinemastamps-review.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "Review downloaded.";
}
export function mediaUrl(review, connection) {
  if (review.source.kind === "upload")
    return `${connection.base}/api/video?token=${encodeURIComponent(connection.token)}&v=${review.source.id}`;
  return review.source.url;
}
