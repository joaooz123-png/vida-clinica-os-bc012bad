import { useMemo } from "react";
import { Link } from "react-router-dom";
import { loadCases, saveCases } from "@/lib/caseStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity, AlertTriangle, ArrowLeft, Brain, Download, HeartPulse,
  Lock, Microscope, Sparkles, Trash2, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

function freqMap(items: string[]) {
  const m = new Map<string, number>();
  items.forEach((i) => m.set(i, (m.get(i) || 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-foreground/90">{label}</span>
        <span className="text-muted-foreground tabular-nums">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--gradient-cyan)" }} />
      </div>
    </div>
  );
}

function Stat({ icon: I, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/30 p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
        <I className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="text-3xl font-semibold mt-2 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export default function Learning() {
  const cases = loadCases();

  const m = useMemo(() => {
    const total = cases.length;
    const withRedFlags = cases.filter((c) => (c.preAttendance.redFlags?.length || 0) > 0).length;
    const corrections = cases.filter((c) => !!(c.postConsultation.correcaoMedico || c.learningFeedback.physicianCorrections)).length;

    const useful = cases.map((c) => c.learningFeedback.usefulnessScore).filter((x): x is number => typeof x === "number");
    const avgUseful = useful.length ? useful.reduce((a, b) => a + b, 0) / useful.length : 0;
    const usefulHist = [0, 0, 0, 0, 0]; // 0-2, 3-4, 5-6, 7-8, 9-10
    useful.forEach((v) => {
      const i = v <= 2 ? 0 : v <= 4 ? 1 : v <= 6 ? 2 : v <= 8 ? 3 : 4;
      usefulHist[i]++;
    });

    const phenotypes = freqMap(cases.flatMap((c) => c.preAttendance.padrao || []));
    const redFlags = freqMap(cases.flatMap((c) => c.preAttendance.redFlags || []));
    const finalDx = freqMap(
      cases.map((c) => c.postConsultation.diagnosticoFinal || c.learningFeedback.finalSyndrome || "").filter(Boolean),
    );
    const outcomes = freqMap(cases.map((c) => c.postConsultation.desfechoRetorno || "").filter(Boolean));

    const aiRuns = cases.reduce((acc, c) => acc + (c.timeline?.filter((t) => /IA|SOAP|raciocínio|Próximos|Orientação|Triagem/i.test(t.title)).length || 0), 0);
    const lastUpdated = cases.map((c) => c.updatedAt).sort().slice(-1)[0];

    return { total, withRedFlags, corrections, avgUseful, usefulHist, phenotypes, redFlags, finalDx, outcomes, aiRuns, lastUpdated };
  }, [cases]);

  const exportAll = () => {
    const anonymized = cases.map((c) => ({
      localCaseId: c.localCaseId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      preAttendance: { ...c.preAttendance, narrativa: undefined, queixaPrincipal: undefined },
      consultation: { ...c.consultation, anamnese: undefined, examFisico: undefined },
      postConsultation: c.postConsultation,
      learningFeedback: c.learningFeedback,
      timelineCount: c.timeline?.length ?? 0,
    }));
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), schema: "medconsult-os.v1.anon", cases: anonymized }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medconsult-os-aprendizado-anonimo-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Aprendizado anônimo exportado");
  };

  const wipe = () => {
    if (!confirm("Apagar TODOS os casos locais? Esta ação não pode ser desfeita.")) return;
    saveCases([]);
    toast.success("Base local apagada");
    setTimeout(() => window.location.reload(), 400);
  };

  const maxPheno = m.phenotypes[0]?.[1] || 1;
  const maxRF = m.redFlags[0]?.[1] || 1;
  const maxDx = m.finalDx[0]?.[1] || 1;
  const maxOut = m.outcomes[0]?.[1] || 1;
  const maxHist = Math.max(...m.usefulHist, 1);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border/60 backdrop-blur sticky top-0 z-20 bg-background/70">
        <div className="container py-4 flex flex-wrap items-center gap-3">
          <Link to="/analise">
            <Button size="sm" variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar para análise
            </Button>
          </Link>
          <div className="flex items-center gap-3 ml-2">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-cyan)" }}>
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Base de aprendizado <span className="glow-text">local</span></h1>
              <p className="text-[11px] text-muted-foreground -mt-0.5">Soberania clínica · dados ficam no seu navegador</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="border-success/40 text-success gap-1"><Lock className="h-3 w-3" /> 100% local · LGPD by-design</Badge>
            <Button size="sm" variant="secondary" onClick={exportAll} className="gap-2"><Download className="h-4 w-4" /> Exportar</Button>
            <Button size="sm" variant="ghost" onClick={wipe} className="gap-2 text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /> Limpar</Button>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {m.total === 0 ? (
          <div className="panel text-center py-16">
            <Sparkles className="h-8 w-8 text-primary mx-auto mb-3" />
            <h2 className="text-base font-semibold">Sua base ainda está vazia.</h2>
            <p className="text-sm text-muted-foreground mt-1">Atenda casos no fluxo clínico — cada execução de IA, SOAP e evolução alimenta esta base anônima.</p>
            <Link to="/analise" className="inline-block mt-4">
              <Button className="gap-2"><HeartPulse className="h-4 w-4" /> Iniciar primeiro caso</Button>
            </Link>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat icon={Microscope} label="Casos" value={m.total} sub={m.lastUpdated ? `último: ${new Date(m.lastUpdated).toLocaleDateString("pt-BR")}` : undefined} />
              <Stat icon={AlertTriangle} label="Com red flags" value={m.withRedFlags} sub={`${Math.round((m.withRedFlags / m.total) * 100)}% dos casos`} />
              <Stat icon={Brain} label="Correções do médico" value={m.corrections} sub={`${Math.round((m.corrections / m.total) * 100)}% dos casos`} />
              <Stat icon={Activity} label="Utilidade média IA" value={m.avgUseful ? m.avgUseful.toFixed(1) : "—"} sub="escala 0–10" />
              <Stat icon={TrendingUp} label="Execuções IA" value={m.aiRuns} sub="eventos no histórico" />
            </section>

            {/* Distributions */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="panel">
                <div className="flex items-center gap-2 mb-3">
                  <Microscope className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Fenótipos clínicos</h2>
                  <Badge variant="outline" className="ml-auto text-[10px]">{m.phenotypes.length} categorias</Badge>
                </div>
                {m.phenotypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum padrão registrado ainda.</p>
                ) : (
                  <ScrollArea className="max-h-72 pr-3">
                    <div className="space-y-2.5">
                      {m.phenotypes.map(([k, v]) => <Bar key={k} label={k} value={v} max={maxPheno} />)}
                    </div>
                  </ScrollArea>
                )}
              </div>

              <div className="panel">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <h2 className="text-sm font-semibold">Red flags mais frequentes</h2>
                  <Badge variant="outline" className="ml-auto text-[10px]">{m.redFlags.length} sinais</Badge>
                </div>
                {m.redFlags.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum red flag registrado.</p>
                ) : (
                  <ScrollArea className="max-h-72 pr-3">
                    <div className="space-y-2.5">
                      {m.redFlags.map(([k, v]) => <Bar key={k} label={k} value={v} max={maxRF} />)}
                    </div>
                  </ScrollArea>
                )}
              </div>

              <div className="panel">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Diagnósticos / síndromes finais</h2>
                </div>
                {m.finalDx.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum diagnóstico final registrado ainda.</p>
                ) : (
                  <ScrollArea className="max-h-72 pr-3">
                    <div className="space-y-2.5">
                      {m.finalDx.map(([k, v]) => <Bar key={k} label={k} value={v} max={maxDx} />)}
                    </div>
                  </ScrollArea>
                )}
              </div>

              <div className="panel">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Distribuição da utilidade da IA</h2>
                </div>
                <div className="space-y-2.5">
                  {[
                    ["0–2 (pouco útil)", m.usefulHist[0]],
                    ["3–4", m.usefulHist[1]],
                    ["5–6", m.usefulHist[2]],
                    ["7–8", m.usefulHist[3]],
                    ["9–10 (muito útil)", m.usefulHist[4]],
                  ].map(([k, v]) => <Bar key={k as string} label={k as string} value={v as number} max={maxHist} />)}
                </div>
                {m.outcomes.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-border/60">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Desfechos no retorno</div>
                    <div className="space-y-2.5">
                      {m.outcomes.map(([k, v]) => <Bar key={k} label={k} value={v} max={maxOut} />)}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <p className="text-[11px] text-muted-foreground text-center pt-2">
              Base de conhecimento clínico-pessoal · armazenada em <code>localStorage</code> · pronta para futura curadoria supervisionada · nada sai do seu dispositivo sem exportação manual.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
