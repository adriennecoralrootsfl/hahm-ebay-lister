import crypto from "crypto";

export async function GET(req: Request) {
  const url = new URL(req.url);

  const challengeCode = url.searchParams.get("challenge_code");

  if (!challengeCode) {
    return new Response("OK", { status: 200 });
  }

  const verificationToken =
    process.env.EBAY_VERIFICATION_TOKEN ||
    "swfl_lister_verification_token_2026_secure_key_7f3a9c2b";

  const endpoint =
    "https://hahm-ebay-lister-five.vercel.app/api/ebay/webhook";

  const hash = crypto.createHash("sha256");

  hash.update(challengeCode);
  hash.update(verificationToken);
  hash.update(endpoint);

  const challengeResponse = hash.digest("hex");

  return new Response(
    JSON.stringify({ challengeResponse }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export async function POST() {
  return new Response("OK", { status: 200 });
}
