/**
 * app/api/tema-automatico/route.ts
 *
 * Gera 3 sugestões de tema via Groq (llama-3.1-8b-instant).
 * Usa a mesma GROQ_API_KEY já configurada no projeto — sem dependência nova.
 *
 * Por que IA em vez de Google Trends RSS?
 *   O Google Trends bloqueia requisições vindas de IPs de data center
 *   (AWS/Vercel). A IA gera temas com o mesmo padrão viral e ainda garante
 *   que a saída já esteja no estilo psicológico correto para o roteiro.
 *
 * Fallback automático: se o Groq não responder, retorna 3 temas evergreen
 *   aleatórios — o frontend nunca vê erro.
 */

import { NextResponse } from "next/server";

// Desabilita o cache do Next.js nesta rota — garante uma chamada real ao Groq
// a cada requisição, gerando temas diferentes a cada clique ou reload.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Temas atemporais de alta retenção — usados quando a IA não responde
const EVERGREEN = [
  "por que você se sabota quando está perto do sucesso",
  "a verdade sobre solidão que ninguém quer admitir",
  "o erro que todo mundo comete ao tentar mudar de vida",
  "como o medo de decepcionar os outros está te destruindo",
  "por que você nunca se sente suficiente por dentro",
  "a mentira que você repete pra si mesmo todo dia",
  "o que a sua raiva está tentando te dizer na verdade",
  "por que você foge de tudo que realmente importa",
];

// Pool de emoções — 3 são sorteadas a cada chamada.
// Isso varia o prompt enviado ao Groq, quebrando o cache semântico
// que faz o modelo retornar a mesma resposta para prompts idênticos.
const EMOCOES = [
  "autoboicote",
  "vazio existencial",
  "síndrome do impostor",
  "apego excessivo",
  "procrastinação crônica",
  "perfeccionismo tóxico",
  "abandono emocional",
  "inveja silenciosa",
  "culpa sem motivo",
  "ciúme",
  "ansiedade social",
  "solidão mesmo rodeado de pessoas",
  "medo de rejeição",
  "baixa autoestima",
  "dependência emocional",
  "insegurança profunda",
  "raiva reprimida",
  "necessidade de aprovação",
  "medo de fracasso",
  "bloqueio criativo",
];

export async function GET() {
  const apiKey = process.env.GROQ_API_KEY;

  // Sem chave → fallback imediato
  if (!apiKey) {
    const temas = [...EVERGREEN].sort(() => Math.random() - 0.5).slice(0, 3);
    return NextResponse.json({ temas, fonte: "evergreen" });
  }

  try {
    // Sorteia 3 emoções diferentes a cada chamada — varia o prompt enviado
    // ao Groq para garantir que o cache semântico nunca seja ativado.
    const foco = [...EMOCOES]
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .join(", ");

    const resp = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 200,
        temperature: 0.92,
        messages: [
          {
            role: "system",
            content:
              "Retorne APENAS JSON válido. Sem texto, sem markdown, sem explicação.",
          },
          {
            role: "user",
            content: `Crie 3 temas diferentes para vídeos virais de reflexão psicológica no TikTok Brasil.

FOCO DESTA GERAÇÃO: ${foco}

REGRAS:
- Fala direta com "você"
- Tom emocional e provocativo — não educativo, não informativo
- Explore as emoções do FOCO acima
- Máximo 70 caracteres por tema
- Varie as estruturas entre os 3 temas:
    "por que você..."
    "a verdade sobre..."
    "o erro que todo mundo comete..."
    "como [algo] está te destruindo"
    "o que ninguém te conta sobre..."

RETORNE APENAS ESTE JSON (sem mais nada):
{"temas": ["tema 1", "tema 2", "tema 3"]}`,
          },
        ],
      }),
    });

    if (!resp.ok) {
      throw new Error(`Groq retornou HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content?.trim() ?? "";

    // Remove possíveis blocos de código markdown antes de parsear
    const clean = content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as { temas: string[] };

    if (!Array.isArray(parsed.temas) || parsed.temas.length === 0) {
      throw new Error("Resposta da IA fora do formato esperado.");
    }

    const temas = parsed.temas
      .slice(0, 3)
      .map((t: string) => t.trim())
      .filter(Boolean);

    return NextResponse.json(
      { temas, fonte: "ia" },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (err) {
    console.error("[tema-automatico] Erro ao gerar temas:", err);

    // Fallback: 3 evergreen aleatórios
    const temas = [...EVERGREEN].sort(() => Math.random() - 0.5).slice(0, 3);
    return NextResponse.json(
      { temas, fonte: "evergreen" },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  }
}
