"use client";

import { useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
type StatusAudio = "pendente" | "processando" | "concluido" | "erro";
type FaseAudio =
  | "aguardando"
  | "gerando_voz"
  | "masterizando"
  | "concluido"
  | "erro";

const FASE_INFO: Record<FaseAudio, { label: string; sub: string }> = {
  aguardando: { label: "Aguardando GPU…", sub: "na fila de processamento" },
  gerando_voz: { label: "Gerando voz…", sub: "frase a frase com XTTS v2" },
  masterizando: { label: "Masterizando…", sub: "compressão e normalização" },
  concluido: { label: "Concluído", sub: "" },
  erro: { label: "Erro", sub: "algo deu errado" },
};

// ── Root ──────────────────────────────────────────────────────────────────────
export default function Home() {
  // Etapa 1 — tema
  const [tema, setTema] = useState("");
  const [gerandoRoteiro, setGerandoRoteiro] = useState(false);
  const [erroRoteiro, setErroRoteiro] = useState<string | null>(null);
  const [gerandoTema, setGerandoTema] = useState(false);
  const [temasAutomaticos, setTemasAutomaticos] = useState<string[]>([]);

  // Etapa 2 — roteiro
  const [roteiro, setRoteiro] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [etapaAtual, setEtapa] = useState<1 | 2 | 3>(1);

  // Etapa 3 — áudio
  const [jobId, setJobId] = useState<string | null>(null);
  const [statusAudio, setStatusAudio] = useState<StatusAudio | null>(null);
  const [faseAudio, setFaseAudio] = useState<FaseAudio>("aguardando");
  const [progresso, setProgresso] = useState("0/0");
  const [erroAudio, setErroAudio] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const nPalavras = roteiro.trim() ? roteiro.trim().split(/\s+/).length : 0;

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function gerarTemaAutomatico() {
    setGerandoTema(true);
    setTemasAutomaticos([]);
    setErroRoteiro(null);
    try {
      const r = await fetch("/api/tema-automatico", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) {
        setErroRoteiro(d.erro ?? "Falha ao buscar tendências.");
        return;
      }
      setTemasAutomaticos(d.temas ?? []);
    } catch {
      setErroRoteiro(
        "Não foi possível buscar tendências. Verifique sua conexão.",
      );
    } finally {
      setGerandoTema(false);
    }
  }

  async function gerarRoteiro() {
    if (!tema.trim()) return;
    setGerandoRoteiro(true);
    setErroRoteiro(null);
    try {
      const r = await fetch("/api/roteiro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErroRoteiro(d.erro ?? "Falha ao gerar roteiro.");
        return;
      }
      setRoteiro(d.roteiro);
      setEtapa(2);
    } catch {
      setErroRoteiro("Não foi possível conectar ao servidor.");
    } finally {
      setGerandoRoteiro(false);
    }
  }

  async function copiarRoteiro() {
    try {
      await navigator.clipboard.writeText(roteiro);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function gerarAudio() {
    if (!roteiro.trim()) return;
    setErroAudio(null);
    setStatusAudio("pendente");
    setFaseAudio("aguardando");
    setProgresso("0/0");
    setSegundos(0);
    setEtapa(3);
    try {
      const r = await fetch("/api/audio/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: roteiro }),
      });
      const d = await r.json();
      if (!r.ok || !d.job_id) {
        setStatusAudio("erro");
        setErroAudio(d.erro ?? "Falha ao iniciar a geração de áudio.");
        return;
      }
      setJobId(d.job_id);
    } catch {
      setStatusAudio("erro");
      setErroAudio(
        "Não foi possível conectar ao backend. Confirme que seu PC e o túnel estão ativos.",
      );
    }
  }

  function reiniciar() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    setTema("");
    setRoteiro("");
    setJobId(null);
    setStatusAudio(null);
    setFaseAudio("aguardando");
    setProgresso("0/0");
    setErroAudio(null);
    setSegundos(0);
    setTemasAutomaticos([]);
    setErroRoteiro(null);
    setEtapa(1);
  }

  // ── Side effects ──────────────────────────────────────────────────────────────

  // Cronômetro
  useEffect(() => {
    if (statusAudio === "pendente" || statusAudio === "processando") {
      timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [statusAudio]);

  // Polling de status
  useEffect(() => {
    if (!jobId) return;
    async function checar() {
      try {
        const r = await fetch(`/api/audio/status/${jobId}`, {
          cache: "no-store",
        });
        const d = await r.json();
        if (!r.ok) {
          setStatusAudio("erro");
          setErroAudio(d.erro ?? "Falha ao consultar status.");
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }
        setStatusAudio(d.status);
        setFaseAudio(d.fase ?? "aguardando");
        setProgresso(d.progresso ?? "0/0");
        if (d.status === "concluido" || d.status === "erro") {
          if (d.erro) setErroAudio(d.erro);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        setStatusAudio("erro");
        setErroAudio("Conexão com o backend perdida durante o processamento.");
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }
    checar();
    pollRef.current = setInterval(checar, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId]);

  function fmtTempo(s: number) {
    return `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-8 sm:py-14">
      <div className="w-full max-w-xl">
        {/* Cabeçalho */}
        <header className="mb-8">
          <p className="font-mono text-[11px] tracking-[0.3em] text-ambar uppercase mb-2">
            Pipeline de narração
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tight text-papel leading-none">
            Voz IA
          </h1>
          <p className="text-cinzafita mt-2 text-sm">
            Um tema entra. Um roteiro e uma narração com sua voz saem.
          </p>
        </header>

        {/* Trilha */}
        <TrilhaProgresso etapaAtual={etapaAtual} />

        <div className="space-y-3 mt-6">
          {/* ── 01 Tema ───────────────────────────────────────────────────── */}
          <Painel
            numero="01"
            titulo="Tema"
            ativo={etapaAtual === 1}
            concluido={etapaAtual > 1}
            onEditar={etapaAtual > 1 ? () => setEtapa(1) : undefined}
          >
            {etapaAtual === 1 ? (
              <div className="space-y-3">
                <textarea
                  value={tema}
                  onChange={(e) => setTema(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter")
                      gerarRoteiro();
                  }}
                  placeholder="Sobre o que é o vídeo? Ex: curiosidades sobre o oceano profundo"
                  rows={3}
                  className="w-full bg-carvao border border-cinzafita/30 rounded-lg p-3 text-papel placeholder:text-cinzafita/50 focus:outline-none focus:ring-2 focus:ring-ambar/60 resize-none text-sm leading-relaxed"
                />

                {/* Sugestão */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={gerarTemaAutomatico}
                    disabled={gerandoTema || gerandoRoteiro}
                    className="font-mono text-xs text-cinzafita hover:text-ambar transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 min-h-[36px]"
                  >
                    <SpinOrStar spin={gerandoTema} />
                    {gerandoTema
                      ? "buscando tendências…"
                      : "sugerir tema do dia"}
                  </button>
                  {tema.length > 0 && (
                    <span className="font-mono text-[10px] text-cinzafita/40">
                      {tema.length} chars
                    </span>
                  )}
                </div>

                {temasAutomaticos.length > 0 && (
                  <div className="space-y-1.5">
                    {temasAutomaticos.map((t, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setTema(t);
                          setTemasAutomaticos([]);
                        }}
                        className="w-full text-left px-3 py-3 rounded-lg border border-cinzafita/20 text-cinzafita text-xs hover:border-ambar/50 hover:text-papel hover:bg-ambar/5 active:scale-[0.99] transition font-mono leading-relaxed"
                      >
                        <span className="text-ambar mr-2">→</span>
                        {t}
                      </button>
                    ))}
                  </div>
                )}

                {erroRoteiro && (
                  <div className="text-erro text-xs bg-erro/10 border border-erro/20 rounded-lg px-3 py-2.5">
                    {erroRoteiro}
                  </div>
                )}

                <button
                  onClick={gerarRoteiro}
                  disabled={!tema.trim() || gerandoRoteiro}
                  className="w-full h-11 rounded-lg bg-ambar text-carvao font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98] transition flex items-center justify-center gap-2"
                >
                  {gerandoRoteiro ? (
                    <>
                      <Spinner />
                      Escrevendo roteiro…
                    </>
                  ) : (
                    "Gerar roteiro →"
                  )}
                </button>

                {tema.trim() && !gerandoRoteiro && (
                  <p className="text-center font-mono text-[10px] text-cinzafita/35">
                    ⌘↵ ou Ctrl↵ para gerar
                  </p>
                )}
              </div>
            ) : (
              <p className="text-cinzafita text-sm line-clamp-1">{tema}</p>
            )}
          </Painel>

          {/* ── 02 Roteiro ────────────────────────────────────────────────── */}
          <Painel
            numero="02"
            titulo="Roteiro"
            ativo={etapaAtual === 2}
            concluido={etapaAtual > 2}
            bloqueado={etapaAtual < 2}
            onEditar={etapaAtual > 2 ? () => setEtapa(2) : undefined}
          >
            {etapaAtual >= 2 &&
              (etapaAtual === 2 ? (
                <div className="space-y-3">
                  <textarea
                    value={roteiro}
                    onChange={(e) => setRoteiro(e.target.value)}
                    rows={8}
                    className="w-full bg-carvao border border-cinzafita/30 rounded-lg p-3 text-papel focus:outline-none focus:ring-2 focus:ring-ambar/60 resize-none font-mono text-sm leading-relaxed"
                  />

                  <ContadorPalavras count={nPalavras} />

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setEtapa(1)}
                      className="font-mono text-xs text-cinzafita hover:text-ambar transition-colors min-h-[36px] flex items-center"
                    >
                      ← outro tema
                    </button>
                    <button
                      onClick={copiarRoteiro}
                      className="font-mono text-xs text-cinzafita hover:text-ambar transition-colors ml-auto min-h-[36px] flex items-center gap-1.5"
                    >
                      {copiado ? (
                        <>
                          <IconCheck />
                          copiado
                        </>
                      ) : (
                        <>
                          <IconCopy />
                          copiar
                        </>
                      )}
                    </button>
                  </div>

                  <button
                    onClick={gerarAudio}
                    disabled={!roteiro.trim()}
                    className="w-full h-11 rounded-lg bg-ambar text-carvao font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98] transition"
                  >
                    Gerar áudio →
                  </button>
                </div>
              ) : (
                <p className="text-cinzafita text-sm line-clamp-2">{roteiro}</p>
              ))}
          </Painel>

          {/* ── 03 Áudio ──────────────────────────────────────────────────── */}
          <Painel
            numero="03"
            titulo="Áudio"
            ativo={etapaAtual === 3}
            bloqueado={etapaAtual < 3}
          >
            {etapaAtual === 3 && (
              <PainelAudio
                status={statusAudio}
                fase={faseAudio}
                progresso={progresso}
                erro={erroAudio}
                jobId={jobId}
                tempo={fmtTempo(segundos)}
                onTentarNovamente={gerarAudio}
                onReiniciar={reiniciar}
              />
            )}
          </Painel>
        </div>

        <footer className="mt-10 text-center font-mono text-[10px] text-cinzafita/35 leading-relaxed">
          o áudio é gerado no seu computador
          <br className="sm:hidden" /> — mantenha-o ligado durante o processo
        </footer>
      </div>
    </main>
  );
}

// ── Trilha de progresso ───────────────────────────────────────────────────────

function TrilhaProgresso({ etapaAtual }: { etapaAtual: 1 | 2 | 3 }) {
  const etapas: { n: 1 | 2 | 3; label: string }[] = [
    { n: 1, label: "Tema" },
    { n: 2, label: "Roteiro" },
    { n: 3, label: "Áudio" },
  ];
  return (
    <div className="flex items-center gap-0" aria-hidden="true">
      {etapas.map((e, i) => (
        <div key={e.n} className="flex items-center flex-1 gap-0">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div
              className={`h-2 w-2 rounded-full transition-colors ${
                e.n < etapaAtual
                  ? "bg-ambar"
                  : e.n === etapaAtual
                    ? "bg-ambar ring-2 ring-ambar/30"
                    : "bg-cinzafita/25"
              }`}
            />
            <span
              className={`font-mono text-[9px] tracking-wider transition-colors ${
                e.n <= etapaAtual ? "text-ambar" : "text-cinzafita/30"
              }`}
            >
              {e.label}
            </span>
          </div>
          {i < etapas.length - 1 && (
            <div
              className={`h-px flex-1 mb-3 mx-1 transition-colors ${
                e.n < etapaAtual ? "bg-ambar/50" : "bg-cinzafita/15"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Painel ────────────────────────────────────────────────────────────────────

function Painel({
  numero,
  titulo,
  ativo,
  concluido,
  bloqueado,
  onEditar,
  children,
}: {
  numero: string;
  titulo: string;
  ativo?: boolean;
  concluido?: boolean;
  bloqueado?: boolean;
  onEditar?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-xl border transition-all ${
        ativo
          ? "border-ambar/40 bg-painel shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
          : "border-cinzafita/12 bg-painel/40"
      } ${bloqueado ? "opacity-35 pointer-events-none select-none" : ""}`}
    >
      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <span
          className={`font-mono text-xs shrink-0 ${ativo ? "text-ambar" : "text-cinzafita/60"}`}
        >
          {numero}
        </span>
        <h2 className="font-display text-sm tracking-wide uppercase text-papel">
          {titulo}
        </h2>
        {concluido && (
          <span className="ml-auto font-mono text-[9px] text-fitaverde uppercase tracking-wider flex items-center gap-1">
            <IconCheck size={10} />
            concluído
          </span>
        )}
        {onEditar && !ativo && (
          <button
            onClick={onEditar}
            className="ml-auto font-mono text-[10px] text-cinzafita/50 hover:text-ambar transition-colors underline underline-offset-2"
          >
            editar
          </button>
        )}
      </div>
      <div className="px-5 pb-5 pt-1">{children}</div>
    </section>
  );
}

// ── Contador de palavras ──────────────────────────────────────────────────────

function ContadorPalavras({ count }: { count: number }) {
  const ideal = 90;
  const pct = Math.min((count / ideal) * 100, 100);
  const cor =
    count === 0
      ? "bg-cinzafita/20"
      : count < 50
        ? "bg-cinzafita/50"
        : count <= ideal
          ? "bg-fitaverde"
          : "bg-erro";
  const label =
    count === 0
      ? ""
      : count < 50
        ? "adicione mais conteúdo"
        : count <= ideal
          ? "tamanho ideal"
          : "roteiro longo — pode ser cortado";

  return (
    <div className="space-y-1.5">
      <div className="h-1 bg-cinzafita/15 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${cor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-[10px]">
        <span className="text-cinzafita">{count} palavras</span>
        <span
          className={`${count > ideal ? "text-erro" : count >= 50 ? "text-fitaverde/80" : "text-cinzafita/50"}`}
        >
          {label || "ideal: 70–90"}
        </span>
      </div>
    </div>
  );
}

// ── Painel de Áudio ───────────────────────────────────────────────────────────

function PainelAudio({
  status,
  fase,
  progresso,
  erro,
  jobId,
  tempo,
  onTentarNovamente,
  onReiniciar,
}: {
  status: StatusAudio | null;
  fase: FaseAudio;
  progresso: string;
  erro: string | null;
  jobId: string | null;
  tempo: string;
  onTentarNovamente: () => void;
  onReiniciar: () => void;
}) {
  if (status === "erro") {
    return (
      <div className="space-y-3">
        <div className="bg-erro/10 border border-erro/25 rounded-lg px-4 py-3">
          <p className="text-erro text-sm font-mono text-xs leading-relaxed">
            {erro ?? "Algo deu errado."}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={onTentarNovamente}
            className="flex-1 h-11 rounded-lg bg-ambar text-carvao font-semibold text-sm hover:brightness-110 active:scale-[0.98] transition"
          >
            Tentar novamente
          </button>
          <button
            onClick={onReiniciar}
            className="flex-1 h-11 rounded-lg border border-cinzafita/30 text-cinzafita text-sm hover:border-ambar/50 hover:text-papel active:scale-[0.98] transition"
          >
            Começar do zero
          </button>
        </div>
      </div>
    );
  }

  if (status === "concluido" && jobId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-fitaverde" />
          <span className="font-mono text-xs text-fitaverde uppercase tracking-wide">
            narração pronta · {tempo}
          </span>
        </div>

        {/* Player customizado */}
        <PlayerAudio src={`/api/audio/download/${jobId}/mp3`} />

        {/* Downloads */}
        <div className="flex gap-2">
          <a
            href={`/api/audio/download/${jobId}/wav`}
            className="flex-1 h-10 flex items-center justify-center rounded-lg border border-cinzafita/25 text-papel text-xs font-mono hover:border-ambar/50 hover:text-ambar active:scale-[0.98] transition"
          >
            ↓ WAV
          </a>
          <a
            href={`/api/audio/download/${jobId}/mp3`}
            className="flex-1 h-10 flex items-center justify-center rounded-lg border border-cinzafita/25 text-papel text-xs font-mono hover:border-ambar/50 hover:text-ambar active:scale-[0.98] transition"
          >
            ↓ MP3
          </a>
          <button
            onClick={onReiniciar}
            className="flex-1 h-10 flex items-center justify-center rounded-lg bg-ambar/10 border border-ambar/30 text-ambar text-xs font-mono hover:bg-ambar/20 active:scale-[0.98] transition"
          >
            + novo
          </button>
        </div>
      </div>
    );
  }

  // pendente / processando
  const info = FASE_INFO[fase] ?? FASE_INFO.aguardando;
  const [pAtual, pTotal] = progresso.split("/").map(Number);
  const pctProgresso =
    fase === "masterizando" ? 100 : pTotal > 0 ? (pAtual / pTotal) * 100 : 0;
  const mostrarFrases = fase === "gerando_voz" && pTotal > 0;

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-erro animate-rec-pulse shrink-0" />
        <span className="font-mono text-xs text-erro uppercase tracking-wide">
          rec · {tempo}
        </span>
        {mostrarFrases && (
          <span className="font-mono text-xs text-cinzafita ml-auto">
            {pAtual}/{pTotal}
          </span>
        )}
      </div>

      {/* Fase atual */}
      <div>
        <p className="text-papel text-sm font-semibold">{info.label}</p>
        {info.sub && (
          <p className="text-cinzafita text-xs font-mono mt-0.5">{info.sub}</p>
        )}
      </div>

      {/* Barra de progresso */}
      <div className="space-y-1.5">
        <div className="h-1 bg-cinzafita/15 rounded-full overflow-hidden">
          <div
            className="h-full bg-ambar/70 rounded-full transition-all duration-500"
            style={{ width: fase === "aguardando" ? "8%" : `${pctProgresso}%` }}
          />
        </div>
        {mostrarFrases && (
          <p className="font-mono text-[10px] text-cinzafita/50">
            frase {pAtual} de {pTotal}
          </p>
        )}
      </div>

      {/* Visualizador animado */}
      <div className="flex items-end gap-[3px] h-8" aria-hidden="true">
        {Array.from({ length: 20 }).map((_, i) => (
          <span
            key={i}
            className="flex-1 bg-ambar/60 rounded-sm animate-bar-bounce"
            style={{
              height: "100%",
              animationDelay: `${(i % 5) * 0.14}s`,
              animationPlayState: fase === "aguardando" ? "paused" : "running",
              opacity: fase === "aguardando" ? 0.3 : 1,
            }}
          />
        ))}
      </div>

      <p className="text-cinzafita text-xs leading-relaxed">
        {fase === "aguardando" && "Aguardando a GPU ficar disponível…"}
        {fase === "gerando_voz" &&
          "Gerando cada frase com sua voz. Não feche esta aba."}
        {fase === "masterizando" &&
          "Quase pronto — aplicando compressão e normalizando o volume."}
      </p>
    </div>
  );
}

// ── Player de Áudio Customizado ───────────────────────────────────────────────

function PlayerAudio({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [tocando, setToc] = useState(false);
  const [pct, setPct] = useState(0);
  const [atual, setAtual] = useState(0);
  const [total, setTotal] = useState(0);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    tocando ? a.pause() : a.play();
    setToc(!tocando);
  }

  function onTimeUpdate() {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    setAtual(a.currentTime);
    setPct((a.currentTime / a.duration) * 100);
  }

  function onEnded() {
    setToc(false);
    setPct(0);
    setAtual(0);
  }

  function buscar(clientX: number) {
    const el = progressRef.current;
    const a = audioRef.current;
    if (!el || !a) return;
    const rect = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    a.currentTime = p * a.duration;
  }

  function fmt(s: number) {
    return `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(s % 60)
      .toString()
      .padStart(2, "0")}`;
  }

  return (
    <div className="bg-carvao border border-cinzafita/20 rounded-xl p-4">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={() => setTotal(audioRef.current?.duration ?? 0)}
        onEnded={onEnded}
        className="hidden"
      />

      <div className="flex items-center gap-3">
        {/* Play/Pause */}
        <button
          onClick={toggle}
          aria-label={tocando ? "Pausar" : "Reproduzir"}
          className="h-11 w-11 rounded-full bg-ambar text-carvao flex items-center justify-center hover:brightness-110 active:scale-95 transition shrink-0"
        >
          {tocando ? <IconPause /> : <IconPlay />}
        </button>

        {/* Barra + tempo */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div
            ref={progressRef}
            className="h-2 bg-cinzafita/15 rounded-full cursor-pointer relative group"
            onClick={(e) => buscar(e.clientX)}
            onTouchStart={(e) => buscar(e.touches[0].clientX)}
          >
            <div
              className="absolute inset-y-0 left-0 bg-ambar rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-ambar border-2 border-carvao opacity-0 group-hover:opacity-100 transition -translate-x-1/2"
              style={{ left: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between font-mono text-[10px] text-cinzafita/60">
            <span>{fmt(atual)}</span>
            <span>{fmt(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Ícones inline ─────────────────────────────────────────────────────────────

function IconPlay() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-4 h-4 translate-x-[1px]"
    >
      <path d="M3 2.5l11 5.5-11 5.5V2.5z" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
      <rect x="3" y="2" width="4" height="12" rx="1" />
      <rect x="9" y="2" width="4" height="12" rx="1" />
    </svg>
  );
}

function IconCheck({ size = 12 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      style={{ width: size, height: size }}
    >
      <path d="M2.5 8l4 4 7-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="w-3 h-3"
    >
      <rect x="5" y="5" width="9" height="9" rx="1.5" />
      <path
        d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function SpinOrStar({ spin }: { spin: boolean }) {
  return spin ? <Spinner /> : <span className="text-ambar text-xs">✦</span>;
}
