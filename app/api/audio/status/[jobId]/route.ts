import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const backendUrl = process.env.BACKEND_URL;
  const backendKey = process.env.BACKEND_API_KEY;

  if (!backendUrl || !backendKey) {
    return NextResponse.json(
      { erro: "Backend não configurado." },
      { status: 500 }
    );
  }

  try {
    const resp = await fetch(`${backendUrl}/api/status/${params.jobId}`, {
      headers: { "X-API-Key": backendKey },
      cache: "no-store",
    });

    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    console.error("Erro ao consultar status:", err);
    return NextResponse.json(
      { erro: "Falha ao consultar status do backend." },
      { status: 502 }
    );
  }
}
