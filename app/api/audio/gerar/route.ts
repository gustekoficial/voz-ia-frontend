import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const backendUrl = process.env.BACKEND_URL;
  const backendKey = process.env.BACKEND_API_KEY;

  if (!backendUrl || !backendKey) {
    return NextResponse.json(
      { erro: "Backend não configurado (BACKEND_URL / BACKEND_API_KEY)." },
      { status: 500 }
    );
  }

  let texto: unknown;
  try {
    const body = await req.json();
    texto = body.texto;
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  if (typeof texto !== "string" || !texto.trim()) {
    return NextResponse.json({ erro: "Texto vazio." }, { status: 400 });
  }

  try {
    const resp = await fetch(`${backendUrl}/api/gerar-audio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": backendKey,
      },
      body: JSON.stringify({ texto: texto.trim() }),
    });

    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    console.error("Erro ao contatar backend:", err);
    return NextResponse.json(
      {
        erro:
          "Não foi possível conectar ao backend. Verifique se seu PC está ligado, o servidor (uvicorn) rodando e o túnel ativo.",
      },
      { status: 502 }
    );
  }
}
