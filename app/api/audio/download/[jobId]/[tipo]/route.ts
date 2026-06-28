import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string; tipo: string } }
) {
  const backendUrl = process.env.BACKEND_URL;
  const backendKey = process.env.BACKEND_API_KEY;

  if (!backendUrl || !backendKey) {
    return NextResponse.json(
      { erro: "Backend não configurado." },
      { status: 500 }
    );
  }

  if (params.tipo !== "wav" && params.tipo !== "mp3") {
    return NextResponse.json({ erro: "Tipo inválido." }, { status: 400 });
  }

  const resp = await fetch(
    `${backendUrl}/api/download/${params.jobId}/${params.tipo}`,
    { headers: { "X-API-Key": backendKey }, cache: "no-store" }
  );

  if (!resp.ok) {
    return NextResponse.json(
      { erro: "Áudio ainda não disponível." },
      { status: resp.status }
    );
  }

  const buffer = await resp.arrayBuffer();
  const contentType = params.tipo === "wav" ? "audio/wav" : "audio/mpeg";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="audio.${params.tipo}"`,
    },
  });
}
