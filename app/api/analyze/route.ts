import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { getClient, parseModelJson, AnthropicAuthError, anthropicAuthError } from "@/lib/anthropic";
import { guardApiRequest, safeErrorResponse } from "@/lib/api-guard";
import { buildProfiledAnalysisPrompt } from "@/lib/prompts";
import { toImageBlock, type ImageBlock } from "@/lib/images";
import { resolveModel } from "@/lib/models";
import type { AnalyzeRequestBody, ListingResult } from "@/lib/types";

export const maxDuration = 60;

const ANALYSIS_MODEL = "claude-sonnet-4-6";
const MAX_IMAGES = 12;

// ---- COST ESTIMATE (approx, you can tune later) ----
// These are rough averages; real cost depends on token usage.
const COST_PER_INPUT_TOKEN = 0.000003;   // Sonnet approx
const COST_PER_OUTPUT_TOKEN = 0.000015;

function estimateCost(inputTokens = 0, outputTokens = 0) {
  return (
    inputTokens * COST_PER_INPUT_TOKEN +
    outputTokens * COST_PER_OUTPUT_TOKEN
  );
}

function toImageBlocks(images: AnalyzeRequestBody["images"]): ImageBlock[] {
  const blocks: ImageBlock[] = [];
  for (const img of images.slice(0, MAX_IMAGES)) {
    const block = toImageBlock(img);
    if (block) blocks.push(block);
  }
  return blocks;
}

function firstText(resp: Anthropic.Message): string {
  const block = resp.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : "";
}

export async function POST(req: NextRequest) {
  const denied = guardApiRequest(req);
  if (denied) return denied;

  let body: AnalyzeRequestBody;

  try {
    body = (await req.json()) as AnalyzeRequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.images) || body.images.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Please add at least one photo." },
      { status: 400 }
    );
  }

  const imageBlocks = toImageBlocks(body.images);

  if (imageBlocks.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No readable photos found. Use JPG, PNG, or WebP." },
      { status: 400 }
    );
  }

  let client: Anthropic;

  try {
    client = getClient();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }

  try {
    const systemPrompt = buildProfiledAnalysisPrompt("hard_goods");

    const resp = await client.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 1800,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: "Analyze these photos and return ONLY valid listing JSON.",
            },
          ],
        },
      ],
    });

    const text = firstText(resp);
    const listing = parseModelJson<ListingResult>(text);

    // -----------------------------
    // 💰 COST METER (simple + useful)
    // -----------------------------
    const usage = (resp as any).usage;

    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;

    const estimatedCost = estimateCost(inputTokens, outputTokens);

    return NextResponse.json({
      ok: true,
      listing,
      usage: {
        inputTokens,
        outputTokens,
        estimatedCostUsd: Number(estimatedCost.toFixed(4)),
      },
    });
  } catch (e) {
    const fatal = anthropicAuthError(e);
    if (fatal) {
      return NextResponse.json(
        { ok: false, error: fatal.message },
        { status: fatal.status }
      );
    }

    return safeErrorResponse(
      "analyze",
      e,
      "Something went wrong analyzing photos — please try again."
    );
  }
}
