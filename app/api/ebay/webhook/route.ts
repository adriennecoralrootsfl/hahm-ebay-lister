export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  // eBay verification check (Marketplace Account Deletion)
  if (body?.challenge_code) {
    return new Response(
      JSON.stringify({ challengeResponse: body.challenge_code }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response("OK", { status: 200 });
}

export async function GET() {
  return new Response("OK", { status: 200 });
}
