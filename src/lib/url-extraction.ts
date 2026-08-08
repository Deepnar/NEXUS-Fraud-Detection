import crypto from "crypto";

const URL_CANDIDATE_REGEX = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

export type ExtractedUrlInput = {
  rawUrl: string;
  normalizedUrl: string;
  normalizedHash: string;
  host: string | null;
};

export function extractUrls(input: string): ExtractedUrlInput[] {
  const matches = input.match(URL_CANDIDATE_REGEX) ?? [];
  const seen = new Set<string>();
  const urls: ExtractedUrlInput[] = [];

  for (const rawMatch of matches) {
    const rawUrl = rawMatch.replace(/[.,!?;:]+$/g, "");

    try {
      const parsed = new URL(rawUrl);
      parsed.hash = "";
      const normalizedUrl = parsed.toString();

      if (seen.has(normalizedUrl)) {
        continue;
      }

      seen.add(normalizedUrl);
      urls.push({
        rawUrl,
        normalizedUrl,
        normalizedHash: hashUrl(normalizedUrl),
        host: parsed.hostname.toLowerCase(),
      });
    } catch {
      continue;
    }
  }

  return urls;
}

function hashUrl(normalizedUrl: string) {
  return crypto.createHash("sha256").update(normalizedUrl).digest("hex");
}

export function titleFromMessage(message: string) {
  const clean = message.replace(/\s+/g, " ").trim();
  if (!clean) {
    return "New fraud analysis";
  }

  return clean.length > 72 ? `${clean.slice(0, 69)}...` : clean;
}
