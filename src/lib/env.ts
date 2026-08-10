import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required" })
    .min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z
    .string({ required_error: "AUTH_SECRET is required" })
    .min(32, "AUTH_SECRET must be at least 32 characters"),
  NEXT_PUBLIC_APP_NAME: z.string().default("NEXUS Fraud Detection"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  /** Shared secret protecting the n8n automation ingest endpoints. */
  WHATSAPP_INGEST_SECRET: z.string().optional(),
  /** Optional DeepSeek API key. When set, the analysis pipeline can ask
   *  DeepSeek to explain deterministic results. n8n may own this key
   *  instead; NEXUS never requires it. */
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().url().optional(),
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),
  /** Optional Redis URL for distributed rate limits and job locks. */
  REDIS_URL: z.string().optional(),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,
  WHATSAPP_INGEST_SECRET: process.env.WHATSAPP_INGEST_SECRET,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
  REDIS_URL: process.env.REDIS_URL,
});
