import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Markdown } from "@/components/Markdown";
import {
  ArrowLeft, BookOpen, Brain, ChevronDown, ChevronUp, Copy, Loader2,
  Lock, Microscope, Search, Sparkles, Trash2,
} from "lucide-react";

interface LitQuery {
  id: string;
  question: string;
  context?: string;
  answer: string;
  model: string;
  createdAt: string;
}

const STORAGE_KEY = "medconsult-os.literature.v1";
const SUGGESTIONS = [
  "Metotrexato vs leflunomida em monoterapia para AR moderada — qual escolher de primeira linha?",
  "JAK inibidores aumentam risco cardiovascular após 65 anos? Magnitude e quem evitar.",
  "Tratamento de gota refratária com pegloticase — indicação, eficácia, manejo da imunogenicidade.",
  "Espondilite axial não-radiográfica: quando iniciar anti-TNF vs IL-17?",
  "Lúpus com nefrite classe III/IV: voclosporina vs belimumabe vs MMF — evidência atual.",
];

const MODELS = [
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro · raciocínio profundo" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash · rápido" },
  { id: "openai/gpt-5", label: "GPT-5 · nuance" },
  { id: "openai/gpt-5-mini", label: "GPT-5 Mini · econômico" },
];

function loadHistory(): LitQuery[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveHistory(h: LitQuery[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(h.slice(0, 50)));
}

export default function Analise() {
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [history, setHistory] = useState<LitQuery[]>([]);
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({});
  const [showContext, setShowContext] = useState(false);
  const outputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setHistory(loadHistory()); }, []);

  useEffect(() => {
    if (!answer || typeof window === "undefined" || window.innerWidth >= 1024) return;
    requestAnimationFrame(() => outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [answer]);

  const charCount = question.length;
  const tooShort = charCount > 0 && charCount < 5;
  const tooLong = charCount > 2000;
  const canSubmit = !loading && charCount >= 5 && !tooLong;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setAnswer("");
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/literature-search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ question: question.trim(), context: context.trim(), model }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 402) throw new Error("Créditos de IA insuficientes. Adicione créditos em Configurações → Workspace → Uso.");
        if (res.status === 429) throw new Error("Limite de requisições excedido. Aguarde alguns instantes.");
        throw new Error((data as any)?.error || `Falha (HTTP ${res.status}).`);
      }
      const text = (data as any)?.analysis || "";
      setAnswer(text);
      const entry: LitQuery = {
        id: "L-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
        question: question.trim(),
        context: context.trim() || undefined,
        answer: text,
        model,
        createdAt: new Date().toISOString(),
      };
      const next = [entry, ...history];
      setHistory(next); saveHistory(next);
      toast.success("Análise concluída");
    } catch (e: any) {
      toast.error(e.message || "Falha ao buscar evidência");
    } finally {
      setLoading(false);
    }
  };

  const copyAnswer = async () => {
    try { await navigator.clipboard.writeText(answer); toast.success("Resposta copiada"); }
    catch { toast.error("Não consegui copiar"); }
  };

  const loadFromHistory = (h: LitQuery) => {
    setQuestion(h.question);
    setContext(h.context || "");
    setModel(h.model);
    setAnswer(h.answer);
    setShowContext(!!h.context);
    requestAnimationFrame(() => outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const deleteHistory = (id: string) => {
    const next = history.filter(h => h.id !== id);
    setHistory(next); saveHistory(next);
  };

  const clearAll = () => {
    if (!confirm("Apagar todo o histórico de buscas?")) return;
    setHistory([]); saveHistory([]);
    toast.success("Histórico limpo");
  };

  const groupedHistory = useMemo(() => {
    const groups: Record<string, LitQuery[]> = {};
    history.forEach(h => {
      const day = new Date(h.createdAt).toLocaleDateString("pt-BR");
      (groups[day] ||= []).push(h);
    });
    return groups;
  }, [history]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 backdrop-blur sticky top-0 z-20 bg-background/70">
        <div className="container py-4 flex flex-wrap items-center gap-3">
          <Link to="/">
            <Button size="sm" variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Workspace clínico
            </Button>
          </Link>
          <div className="flex items-center gap-3 ml-1">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-cyan)" }}>
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">
                Análise de <span className="glow-text">evidência</span>
              </h1>
              <p className="text-[11px] text-muted-foreground -mt-0.5">Busca clínica baseada em evidência · MBE · soberania local</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="border-success/40 text-success gap-1">
              <Lock className="h-3 w-3" /> Histórico local
            </Badge>
            <Link to="/aprendizado">
              <Button size="sm" variant="ghost" className="gap-2"><Brain className="h-4 w-4" /> Aprendizado</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: query form */}
        <section className="lg:col-span-5 space-y-5">
          <div className="panel space-y-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Pergunta clínica</h2>
              <span className={`ml-auto text-[10px] tabular-nums ${tooLong ? "text-destructive" : "text-muted-foreground"}`}>
                {charCount}/2000
              </span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Formato PICO recomendado</Label>
              <Textarea
                rows={5}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="Ex.: Em pacientes com AR estabelecida em uso de metotrexato, qual a eficácia do baricitinibe vs adalimumabe na resposta ACR50 em 24 semanas?"
                className={tooLong ? "border-destructive" : ""}
              />
              {tooShort && <p className="text-[11px] text-destructive">Mínimo 5 caracteres.</p>}
              {tooLong && <p className="text-[11px] text-destructive">Máximo 2000 caracteres.</p>}
            </div>

            <button
              type="button"
              onClick={() => setShowContext(v => !v)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {showContext ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Contexto adicional (opcional)
            </button>
            {showContext && (
              <Textarea
                rows={3}
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder="Ex.: paciente 68a, DRC G3a, em uso de AAS e prednisona 5 mg/d..."
              />
            )}

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Modelo</Label>
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
              >
                {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button onClick={submit} disabled={!canSubmit} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Buscar evidência
              </Button>
              {(question || context || answer) && !loading && (
                <Button variant="ghost" size="sm" onClick={() => { setQuestion(""); setContext(""); setAnswer(""); }}>
                  Limpar
                </Button>
              )}
            </div>
          </div>

          <div className="panel space-y-2">
            <div className="flex items-center gap-2">
              <Microscope className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sugestões de partida</h3>
            </div>
            <div className="space-y-1.5">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQuestion(s)}
                  className="w-full text-left text-[12px] text-foreground/80 hover:text-primary border border-border/60 hover:border-primary/40 rounded-lg p-2 transition-colors leading-snug"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Right: output + history */}
        <aside className="lg:col-span-7 space-y-5">
          <div ref={outputRef} className="panel min-h-[300px] lg:sticky lg:top-24">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <h2 className="text-sm font-semibold">Síntese de evidência</h2>
              {answer && !loading && (
                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                  {MODELS.find(m => m.id === model)?.label.split(" · ")[0] || model}
                </Badge>
              )}
              {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              {answer && !loading && (
                <Button size="sm" variant="ghost" className="ml-auto h-7 gap-1 px-2 text-[11px]" onClick={copyAnswer}>
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </Button>
              )}
            </div>

            {loading && (
              <div className="space-y-2 animate-pulse">
                <div className="h-3 w-1/3 rounded bg-secondary/60" />
                <div className="h-3 w-2/3 rounded bg-secondary/60" />
                <div className="h-3 w-1/2 rounded bg-secondary/60" />
                <div className="h-3 w-3/4 rounded bg-secondary/60" />
                <p className="text-xs text-muted-foreground pt-2">Sintetizando evidência clínica…</p>
              </div>
            )}

            {!loading && !answer && (
              <div className="text-sm text-muted-foreground leading-relaxed">
                Faça uma pergunta clínica em formato <span className="text-foreground/90 font-medium">PICO</span> (População · Intervenção · Comparador · Outcome).
                A síntese vem em Markdown estruturado: resposta direta, nível GRADE, estudos-chave, guidelines, aplicação clínica e limitações.
                <p className="mt-2 text-[11px] text-muted-foreground/70">
                  Ferramenta de apoio à decisão · não substitui julgamento clínico · sempre confirme nas fontes primárias.
                </p>
              </div>
            )}

            {!loading && answer && (
              <div className="overflow-y-auto overscroll-contain pr-2 -mr-1 max-h-[55vh] sm:max-h-[60vh] lg:max-h-[calc(100vh-12rem)]">
                <Markdown>{answer}</Markdown>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Histórico de buscas</h2>
              <Badge variant="outline" className="ml-auto text-[10px]">{history.length}</Badge>
              {history.length > 0 && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-destructive hover:text-destructive" onClick={clearAll}>
                  Limpar tudo
                </Button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Cada busca fica armazenada localmente no seu navegador. Nada sai daqui sem você decidir.
              </p>
            ) : (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                {Object.entries(groupedHistory).map(([day, items]) => (
                  <div key={day}>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">{day}</div>
                    <div className="space-y-1.5">
                      {items.map(h => {
                        const isOpen = !!openHistory[h.id];
                        return (
                          <div key={h.id} className="rounded-lg border border-border/60 p-2.5">
                            <div className="flex items-start gap-2">
                              <button
                                className="flex-1 text-left min-w-0"
                                onClick={() => setOpenHistory(s => ({ ...s, [h.id]: !isOpen }))}
                              >
                                <div className="text-[12px] text-foreground/90 leading-snug break-words">
                                  {h.question}
                                </div>
                                <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                                  <span>{new Date(h.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                                  <span>·</span>
                                  <span className="truncate">{h.model.split("/")[1] || h.model}</span>
                                </div>
                              </button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => deleteHistory(h.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            </div>
                            {isOpen && (
                              <div className="mt-2 pt-2 border-t border-border/60 space-y-2">
                                {h.context && (
                                  <div className="text-[11px] text-muted-foreground italic break-words">
                                    Contexto: {h.context}
                                  </div>
                                )}
                                <div className="max-h-64 overflow-y-auto pr-1">
                                  <Markdown>{h.answer}</Markdown>
                                </div>
                                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => loadFromHistory(h)}>
                                  Carregar no editor
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </main>

      <footer className="container py-8 text-center text-[11px] text-muted-foreground">
        Análise de evidência · MedConsult OS · ferramenta de apoio · não substitui consulta às fontes primárias
      </footer>
    </div>
  );
}
