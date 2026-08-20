import OpenAI from "openai";

let client: OpenAI | null = null;

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configurée — suggestions IA indisponibles");
  }

  if (!client) {
    client = new OpenAI({ apiKey });
  }
  return client;
}

export const OPENAI_PLANNING_MODEL = process.env.OPENAI_PLANNING_MODEL?.trim() || "gpt-4o-mini";
