import { NextRequest, NextResponse } from "next/server";

const BASE_URL = (
  process.env.ENGINE_SERVICE_URL || "http://127.0.0.1:8010"
).replace(/\/+$/, "");

const ALLOWED_PATHS = new Set([
  "health",
  "validate-listing",
  "price-summary",
  "security/check-text"
]);

type Context = {
  params: Promise<{ path: string[] }>;
};

async function proxy(
  request: NextRequest,
  context: Context
) {
  const { path } = await context.params;
  const endpoint = path.join("/");

  if (!ALLOWED_PATHS.has(endpoint)) {
    return NextResponse.json(
      { error: "Endpoint tidak diizinkan." },
      { status: 404 }
    );
  }

  if (
    endpoint === "health" && request.method !== "GET" ||
    endpoint !== "health" && request.method !== "POST"
  ) {
    return NextResponse.json(
      { error: "Method tidak diizinkan." },
      { status: 405 }
    );
  }

  try {
    const url = `${BASE_URL}/${endpoint}${request.nextUrl.search}`;

    const upstream = await fetch(url, {
      method: request.method,
      headers: request.method === "POST"
        ? { "Content-Type": "application/json" }
        : undefined,
      body: request.method === "POST"
        ? await request.text()
        : undefined,
      cache: "no-store"
    });

    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json"
      }
    });
  } catch {
    return NextResponse.json(
      {
        error: "Python Engine tidak tersedia.",
        hint: "Jalankan FastAPI pada port 8010."
      },
      { status: 503 }
    );
  }
}

export async function GET(request: NextRequest, context: Context) {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: Context) {
  return proxy(request, context);
}