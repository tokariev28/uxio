const PRIVATE_HOST_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?)$/i;

/**
 * Returns an error string if the URL is unsafe for outbound requests,
 * or null if it is safe to fetch.
 * Allows both http:// and https://. Blocks private/internal IPs and non-standard ports.
 */
export function isUnsafeUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "Please provide a valid URL (e.g. https://apollo.io)";
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "Only HTTP and HTTPS URLs are allowed";
  }
  if (!parsed.hostname.includes(".")) {
    return "Please provide a valid URL (e.g. https://apollo.io)";
  }
  if (PRIVATE_HOST_RE.test(parsed.hostname)) {
    return "Private or internal URLs are not allowed";
  }
  // Allow only standard ports (443 for https, 80 for http)
  const standardPort = parsed.protocol === "https:" ? "443" : "80";
  if (parsed.port && parsed.port !== standardPort) {
    return "Non-standard ports are not allowed";
  }
  return null;
}
