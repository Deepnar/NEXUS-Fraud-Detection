import { z } from "zod";
import { env } from "@/lib/env";
import type { ExtractedUrlLike } from "@/lib/analysis/types";

const featureSchema = z.object({
  name: z.string(),
  value: z.number(),
  importance: z.number(),
  direction: z.enum(["risk_increasing", "risk_decreasing", "unknown"]),
});

const predictionSchema = z.object({
  task: z.enum(["message", "url"]),
  modelVersion: z.string(),
  featureVersion: z.string(),
  probability: z.number().min(0).max(1),
  calibrated: z.boolean(),
  riskLevel: z.enum(["UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  topFeatures: z.array(featureSchema),
});

const responseSchema = z.object({
  requestId: z.string(),
  message: predictionSchema.nullable(),
  urls: z.array(predictionSchema),
});

export type ModelPrediction = z.infer<typeof predictionSchema>;

export async function predictWithModel(input: {
  requestId: string;
  text: string;
  urls: ExtractedUrlLike[];
}): Promise<{ message: ModelPrediction | null; urls: ModelPrediction[] } | null> {
  if (!env.MODEL_API_URL) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.MODEL_API_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.MODEL_API_URL.replace(/\/$/, "")}/v1/predict`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.MODEL_API_SECRET ? { "x-model-api-key": env.MODEL_API_SECRET } : {}),
      },
      body: JSON.stringify({
        requestId: input.requestId,
        text: input.text,
        urls: input.urls.map((url) => url.normalizedUrl),
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return responseSchema.parse(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
