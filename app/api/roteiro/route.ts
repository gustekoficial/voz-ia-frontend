import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { erro: "GROQ_API_KEY não configurada no servidor." },
      { status: 500 },
    );
  }

  let tema: unknown;

  try {
    const body = await req.json();
    tema = body.tema;
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  if (typeof tema !== "string" || !tema.trim()) {
    return NextResponse.json({ erro: "Informe um tema." }, { status: 400 });
  }

  const prompt = `
Você é um roteirista especialista em vídeos virais de psicologia e reflexão para TikTok.

OBJETIVO:
Criar roteiros curtos, provocativos e de alta retenção.

ESTILO:
- fala direta com o espectador
- tom de reflexão psicológica
- não é educativo
- não é informativo
- não é lista de curiosidades

PROIBIÇÕES ABSOLUTAS:
- proibido estilo curiosidades
- proibido lista de fatos
- proibido explicação científica
- proibido tom de documentário
- proibido introdução de vídeo
- proibido "aqui vai", "nesse vídeo", "você sabia"

FORMATO OBRIGATÓRIO:
- frases curtas
- uma frase por linha
- máximo 80 palavras
- fala direta com "você"

ESTRUTURA:
1. provocação inicial
2. quebra de crença
3. reflexão direta
4. conexão com o usuário
5. insight final
6. CTA leve

IMPORTANTE:
Isso NÃO é um vídeo educativo. É um vídeo de reflexão psicológica.

TEMA:
${tema.trim()}
`;

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content:
                "Você SEMPRE responde com frases separadas por quebra de linha. Nunca escreva texto corrido.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.85,
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { erro: "Erro na Groq API", detalhes: errText },
        { status: 502 },
      );
    }

    const data = await response.json();
    const roteiro = data?.choices?.[0]?.message?.content?.trim() ?? "";

    if (!roteiro) {
      return NextResponse.json(
        { erro: "A IA não retornou nenhum texto." },
        { status: 502 },
      );
    }

    // =========================
    // 🔥 FORÇA REAL DE QUEBRA DE LINHA
    // =========================

    const textoNormalizado = roteiro
      // transforma pontos em quebra de linha
      .replace(/([.!?])\s+/g, "$1\n")
      // quebra caso venha tudo colado
      .replace(/([a-z])([A-Z])/g, "$1\n$2")
      // remove espaços duplicados
      .replace(/\s{2,}/g, " ")
      .trim();

    const linhas = textoNormalizado
      .split("\n")
      .map((l: string) => l.trim())
      .filter(Boolean)

      // remove lixo da IA
      .filter((l: string) => {
        const lixo = [
          "claro",
          "aqui está",
          "roteiro",
          "segue abaixo",
          "posso ajudar",
          "diretrizes",
        ];

        return !lixo.some((p) => l.toLowerCase().startsWith(p));
      })

      // limpeza final TTS
      .map((l: string) =>
        l.replace(/\.+/g, "").replace(/…$/, "").replace(/,$/, ""),
      )

      // remove linhas ruins
      .filter((l: string) => l.split(" ").length > 1)

      .slice(0, 8);

    const roteiroFinal = linhas.join("\n");

    return NextResponse.json({
      roteiro: roteiroFinal,
      linhas: linhas,
    });
  } catch (err) {
    console.error("Erro ao gerar roteiro:", err);
    return NextResponse.json(
      { erro: "Falha ao gerar roteiro. Tente novamente." },
      { status: 502 },
    );
  }
}
