import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/components/Markdown";
import {
  Activity, AlertTriangle, Brain, ClipboardList, Download, FileText,
  HeartPulse, Inbox, Link2, Loader2, Lock, Microscope, Printer, Save, Sparkles, Stethoscope, Trash2, User
} from "lucide-react";
import {
  CaseSession, loadCases, newCase, upsertCase, saveCases, Phase,
} from "@/lib/caseStore";

const PADRAO = ["inflamatório", "mecânico", "nociplástico/difuso", "axial", "periférico", "monoartrite aguda", "poliartrite"];
const AREAS = ["mãos","punhos","cotovelos","ombros","cervical","dorsal","lombar","quadris","joelhos","tornozelos","pés","dedos dos pés","tórax","braços","antebraços","coxas","pernas","dor difusa"];
const RED_FLAGS = ["febre","imunossupressão","articulação quente e edemaciada","dor aguda intensa","déficit neurológico","dor torácica/dispneia","sintomas visuais","cefaleia nova >50a","claudicação mandibular","perda de peso","história de neoplasia","sinais de infecção"];
const CONJ = ["olhos secos","boca seca","fotossensibilidade","úlceras orais","Raynaud","alopecia","rash","sintomas de serosite"];
const ESPONDILO = ["lombalgia inflamatória","entesite","dactilite","psoríase","uveíte","DII","HLA-B27"];
const CRISTAL = ["ataque súbito","podagra","ataques recorrentes","ácido úrico elevado","DRC","diuréticos"];
const DURACOES = ["<6 semanas", "6 semanas–3 meses", ">3 meses"];

function ChipGroup({ items, value, onChange, multi = true }: { items: string[]; value: string[]; onChange: (v: string[]) => void; multi?: boolean }) {
  const toggle = (i: string) => {
    if (!multi) { onChange([i]); return; }
    onChange(value.includes(i) ? value.filter(x => x !== i) : [...value, i]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(i => (
        <button type="button" key={i} className={`chip ${value.includes(i) ? "chip-active" : ""}`} onClick={() => toggle(i)}>{i}</button>
      ))}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

export default function Index() {
  const [cases, setCases] = useState<CaseSession[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("pre");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");

  // initialize
  useEffect(() => {
    const all = loadCases();
    if (all.length === 0) {
      const n = newCase();
      upsertCase(n);
      setCases([n]);
      setActiveId(n.localCaseId);
    } else {
      setCases(all);
      setActiveId(all[0].localCaseId);
    }
  }, []);

  const active = useMemo(() => cases.find(c => c.localCaseId === activeId), [cases, activeId]);

  const update = (patch: Partial<CaseSession>) => {
    if (!active) return;
    const next = { ...active, ...patch } as CaseSession;
    const all = cases.map(c => c.localCaseId === active.localCaseId ? next : c);
    setCases(all);
    upsertCase(next);
  };
  const updatePre = (patch: any) => update({ preAttendance: { ...active?.preAttendance, ...patch } });
  const updateCons = (patch: any) => update({ consultation: { ...active?.consultation, ...patch } });
  const updatePos = (patch: any) => update({ postConsultation: { ...active?.postConsultation, ...patch } });

  const addTimeline = (title: string, summary: string, p: Phase, tags: string[] = []) => {
    if (!active) return;
    const tl = [...(active.timeline || []), { date: new Date().toISOString(), phase: p, title, summary, tags }];
    update({ timeline: tl });
  };

  const runAI = async (mode: "executar" | "atualizar" | "soap" | "proximos" | "educacao") => {
    if (!active) return;
    setLoading(true);
    setAnalysis("");
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          mode,
          preAttendance: active.preAttendance,
          consultation: active.consultation,
          postConsultation: active.postConsultation,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 402) throw new Error("Créditos de IA insuficientes. Adicione créditos em Configurações → Workspace → Uso.");
        if (res.status === 429) throw new Error("Limite de requisições excedido. Aguarde alguns instantes e tente novamente.");
        throw new Error((data as any)?.error || `Falha na análise (HTTP ${res.status}).`);
      }
      const text = (data as any)?.analysis ?? "";
      setAnalysis(text);
      const out: any = { ...active.outputs };
      if (mode === "executar") out.triage = text;
      else if (mode === "atualizar") out.consultationAssessment = text;
      else if (mode === "soap") out.soap = text;
      else if (mode === "proximos") out.nextSteps = text;
      else if (mode === "educacao") out.patientEducation = text;
      update({ outputs: out });
      addTimeline(
        mode === "executar" ? "Triagem pré-atendimento" :
        mode === "atualizar" ? "Raciocínio atualizado em consulta" :
        mode === "soap" ? "Nota SOAP gerada" :
        mode === "proximos" ? "Próximos passos gerados" : "Orientação ao paciente",
        text.split("\n").slice(0, 3).join(" "), phase
      );
      toast.success("Análise gerada");
    } catch (e: any) {
      toast.error(e.message || "Falha ao executar análise");
    } finally {
      setLoading(false);
    }
  };

  const exportLearning = () => {
    const anonymized = cases.map(c => ({
      localCaseId: c.localCaseId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      preAttendance: { ...c.preAttendance, narrativa: undefined, queixaPrincipal: undefined },
      consultation: { ...c.consultation, anamnese: undefined, examFisico: undefined },
      postConsultation: c.postConsultation,
      learningFeedback: c.learningFeedback,
      timelineCount: c.timeline?.length ?? 0,
    }));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), schema: "medconsult-os.v1.anon", cases: anonymized }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `medconsult-os-aprendizado-anonimo-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Aprendizado anônimo exportado");
  };

  const newCaseAction = () => {
    const n = newCase();
    const all = [n, ...cases];
    setCases(all); saveCases(all); setActiveId(n.localCaseId); setPhase("pre"); setAnalysis("");
  };
  const deleteCase = (id: string) => {
    const all = cases.filter(c => c.localCaseId !== id);
    setCases(all); saveCases(all);
    if (activeId === id) setActiveId(all[0]?.localCaseId || "");
  };

  // Sections filled? — gates the single Executar button.
  const filled = useMemo(() => {
    if (!active) return { pre: false, consulta: false, pos: false, any: false, list: [] as string[] };
    const p = active.preAttendance;
    const c = active.consultation;
    const o = active.postConsultation;
    const pre = !!(p.queixaPrincipal || p.narrativa || (p.padrao?.length) || (p.areas?.length) || (p.redFlags?.length) || p.labs || p.imagens);
    const consulta = !!(c.anamnese || c.examFisico || c.hipoteses || c.plano || (c.jointCount?.tender ?? 0) > 0 || (c.jointCount?.swollen ?? 0) > 0);
    const pos = !!(o.diagnosticoFinal || o.conduta || o.examesPedidos || o.feedbackIA || o.correcaoMedico);
    const list: string[] = [];
    if (pre) list.push("Pré-atendimento");
    if (consulta) list.push("Consulta");
    if (pos) list.push("Pós-consulta");
    return { pre, consulta, pos, any: pre || consulta || pos, list };
  }, [active]);

  // Stats for learning dashboard
  const stats = useMemo(() => {
    const total = cases.length;
    const withRedFlags = cases.filter(c => (c.preAttendance.redFlags?.length || 0) > 0).length;
    const corrections = cases.filter(c => !!c.learningFeedback.physicianCorrections).length;
    const usefulness = cases.map(c => c.learningFeedback.usefulnessScore).filter(Boolean) as number[];
    const avgUseful = usefulness.length ? (usefulness.reduce((a, b) => a + b, 0) / usefulness.length).toFixed(1) : "—";
    return { total, withRedFlags, corrections, avgUseful };
  }, [cases]);

  if (!active) return null;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border/60 backdrop-blur sticky top-0 z-20 bg-background/70">
        <div className="container py-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-cyan)" }}>
              <HeartPulse className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">
                MedConsult <span className="glow-text">OS</span>
              </h1>
              <p className="text-[11px] text-muted-foreground -mt-0.5">Protocolo Vida · Rheumatology Clinical OS</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="border-success/40 text-success gap-1"><Lock className="h-3 w-3" /> Modo sem identificação</Badge>
            <Badge variant="outline" className="border-primary/40 text-primary">Dr. João Otávio Rennó Grilo</Badge>
            <a href="/aprendizado"><Button size="sm" variant="ghost" className="gap-2"><Brain className="h-4 w-4" /> Base de aprendizado</Button></a>
            <Button size="sm" variant="outline" onClick={newCaseAction}>+ Novo caso</Button>
          </div>
        </div>
        {/* Phase stepper */}
        <div className="container pb-3 -mt-1">
          <div className="flex gap-1 rounded-xl border border-border/60 bg-secondary/40 p-1">
            {[
              { k: "pre", label: "A · Pré-atendimento", icon: ClipboardList },
              { k: "consulta", label: "B · Durante a consulta", icon: Stethoscope },
              { k: "pos", label: "C · Pós-consulta · Aprendizado", icon: Brain },
            ].map((s, i) => {
              const Icon = s.icon as any;
              const active = phase === s.k;
              return (
                <button key={s.k} onClick={() => setPhase(s.k as Phase)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition ${active ? "bg-primary/15 text-primary shadow-[var(--shadow-glow)]" : "text-muted-foreground hover:text-foreground"}`}>
                  <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{["A","B","C"][i]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Privacy banner */}
      <div className="container mt-4">
        <div className="panel border-warning/40 flex items-start gap-3" style={{ background: "linear-gradient(160deg, hsl(38 60% 12%), hsl(220 28% 9%))" }}>
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed text-foreground/90">
            <strong className="text-warning">Privacidade & Segurança:</strong> não insira nome, CPF, telefone, endereço ou qualquer dado identificável. Protótipo local LGPD/GDPR by-design — armazenamento apenas no navegador. Esta ferramenta é um copiloto clínico para uso médico e <em>não substitui</em> consulta, exame físico, protocolos locais ou julgamento clínico. Em red flags, atue conforme protocolos de urgência.
          </div>
        </div>
      </div>

      {/* Body */}
      <main className="container py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: forms */}
        <section className="lg:col-span-7 space-y-5">
          <Tabs value={phase} onValueChange={(v) => setPhase(v as Phase)}>
            <TabsList className="hidden">
              <TabsTrigger value="pre">A</TabsTrigger>
              <TabsTrigger value="consulta">B</TabsTrigger>
              <TabsTrigger value="pos">C</TabsTrigger>
            </TabsList>

            {/* PRE */}
            <TabsContent value="pre" className="space-y-4 m-0">
              <div className="panel space-y-4">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Pré-atendimento — triagem estruturada</h2>
                </div>
                <Field label="Queixa principal">
                  <Input value={active.preAttendance.queixaPrincipal || ""} onChange={e => updatePre({ queixaPrincipal: e.target.value })} placeholder="Ex.: poliartralgia simétrica há 8 semanas" />
                </Field>
                <Field label="Narrativa livre">
                  <Textarea rows={3} value={active.preAttendance.narrativa || ""} onChange={e => updatePre({ narrativa: e.target.value })} placeholder="Como começou, evolução, fatores de melhora/piora..." />
                </Field>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Duração">
                    <ChipGroup items={DURACOES} value={active.preAttendance.duracao ? [active.preAttendance.duracao] : []} onChange={v => updatePre({ duracao: v[0] })} multi={false} />
                  </Field>
                  <Field label={`Dor (0–10): ${active.preAttendance.dor ?? 0}`}>
                    <Slider value={[active.preAttendance.dor ?? 0]} max={10} step={1} onValueChange={v => updatePre({ dor: v[0] })} />
                  </Field>
                  <Field label={`Rigidez matinal (min): ${active.preAttendance.rigidezManha ?? 0}`}>
                    <Slider value={[active.preAttendance.rigidezManha ?? 0]} max={180} step={5} onValueChange={v => updatePre({ rigidezManha: v[0] })} />
                  </Field>
                </div>
                <Field label="Padrão clínico">
                  <ChipGroup items={PADRAO} value={active.preAttendance.padrao || []} onChange={v => updatePre({ padrao: v })} />
                </Field>
                <Field label="Áreas dolorosas (mapa corporal)">
                  <ChipGroup items={AREAS} value={active.preAttendance.areas || []} onChange={v => updatePre({ areas: v })} />
                </Field>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {([["fadiga","Fadiga"],["sono","Sono"],["cognicao","Cognição"],["somaticos","Somáticos"]] as const).map(([k, l]) => (
                    <Field key={k} label={`${l} (0–3): ${(active.preAttendance as any)[k] ?? 0}`}>
                      <Slider value={[(active.preAttendance as any)[k] ?? 0]} max={3} step={1} onValueChange={v => updatePre({ [k]: v[0] })} />
                    </Field>
                  ))}
                </div>
                <Field label="Red flags">
                  <ChipGroup items={RED_FLAGS} value={active.preAttendance.redFlags || []} onChange={v => updatePre({ redFlags: v })} />
                </Field>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Sintomas conjuntivo/sicca">
                    <ChipGroup items={CONJ} value={active.preAttendance.conjuntivo || []} onChange={v => updatePre({ conjuntivo: v })} />
                  </Field>
                  <Field label="Espondiloartrite">
                    <ChipGroup items={ESPONDILO} value={active.preAttendance.espondilo || []} onChange={v => updatePre({ espondilo: v })} />
                  </Field>
                  <Field label="Cristais/gota">
                    <ChipGroup items={CRISTAL} value={active.preAttendance.cristal || []} onChange={v => updatePre({ cristal: v })} />
                  </Field>
                </div>
                <Field label="Laboratório (texto livre)" hint="Ex.: VHS 42, PCR 18, FR negativo, anti-CCP +, FAN 1:320 nuclear pontilhado fino, C3 baixo...">
                  <Textarea rows={3} value={active.preAttendance.labs || ""} onChange={e => updatePre({ labs: e.target.value })} />
                </Field>
                <Field label="Imagem (texto livre)">
                  <Textarea rows={2} value={active.preAttendance.imagens || ""} onChange={e => updatePre({ imagens: e.target.value })} />
                </Field>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button onClick={() => runAI("executar")} disabled={loading || !filled.any} className="gap-2">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Executar análise
                  </Button>
                  {filled.any ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground">Enviando:</span>
                      {filled.list.map(s => (
                        <Badge key={s} variant="outline" className="border-primary/40 text-primary text-[10px]">{s}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Preencha ao menos um campo da triagem para habilitar.</p>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* CONSULTA */}
            <TabsContent value="consulta" className="space-y-4 m-0">
              <div className="panel space-y-4">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Durante a consulta</h2>
                </div>
                <Field label="Anamnese (livre)">
                  <Textarea rows={4} value={active.consultation.anamnese || ""} onChange={e => updateCons({ anamnese: e.target.value })} />
                </Field>
                <Field label="Exame físico dirigido (reumatologia)">
                  <Textarea rows={4} value={active.consultation.examFisico || ""} onChange={e => updateCons({ examFisico: e.target.value })} placeholder="Articulações dolorosas/edemaciadas, mãos, punhos, ombros, coluna/SI, enteses, pele, mucosas, oftalmo, neuro, cardiopulmonar, edema..." />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label={`Articulações dolorosas: ${active.consultation.jointCount?.tender ?? 0}`}>
                    <Slider value={[active.consultation.jointCount?.tender ?? 0]} max={68} step={1} onValueChange={v => updateCons({ jointCount: { ...(active.consultation.jointCount || {swollen:0}), tender: v[0] } })} />
                  </Field>
                  <Field label={`Articulações edemaciadas: ${active.consultation.jointCount?.swollen ?? 0}`}>
                    <Slider value={[active.consultation.jointCount?.swollen ?? 0]} max={66} step={1} onValueChange={v => updateCons({ jointCount: { ...(active.consultation.jointCount || {tender:0}), swollen: v[0] } })} />
                  </Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Sinais vitais"><Input value={active.consultation.vitais || ""} onChange={e => updateCons({ vitais: e.target.value })} placeholder="PA, FC, T, SpO2..." /></Field>
                  <Field label="Medicações atuais & contraindicações"><Input value={active.consultation.medicacoes || ""} onChange={e => updateCons({ medicacoes: e.target.value })} /></Field>
                </div>
                <Field label="Hipóteses / impressão">
                  <Textarea rows={2} value={active.consultation.hipoteses || ""} onChange={e => updateCons({ hipoteses: e.target.value })} />
                </Field>
                <Field label="Decisão compartilhada / preferências">
                  <Textarea rows={2} value={active.consultation.decisaoCompartilhada || ""} onChange={e => updateCons({ decisaoCompartilhada: e.target.value })} />
                </Field>
                <Field label="Plano discutido">
                  <Textarea rows={2} value={active.consultation.plano || ""} onChange={e => updateCons({ plano: e.target.value })} />
                </Field>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button onClick={() => runAI("atualizar")} disabled={loading} className="gap-2"><Sparkles className="h-4 w-4" /> Atualizar raciocínio</Button>
                  <Button variant="secondary" onClick={() => runAI("soap")} disabled={loading} className="gap-2"><FileText className="h-4 w-4" /> Gerar SOAP</Button>
                  <Button variant="secondary" onClick={() => runAI("proximos")} disabled={loading} className="gap-2"><ClipboardList className="h-4 w-4" /> Próximos passos</Button>
                  <Button variant="secondary" onClick={() => runAI("educacao")} disabled={loading} className="gap-2"><HeartPulse className="h-4 w-4" /> Orientação ao paciente</Button>
                </div>
              </div>
            </TabsContent>

            {/* POS */}
            <TabsContent value="pos" className="space-y-4 m-0">
              <div className="panel space-y-4">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Pós-consulta & aprendizado contínuo</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Diagnóstico/síndrome de trabalho"><Input value={active.postConsultation.diagnosticoFinal || ""} onChange={e => updatePos({ diagnosticoFinal: e.target.value })} /></Field>
                  <Field label={`Confiança (0–10): ${active.postConsultation.confianca ?? 0}`}>
                    <Slider value={[active.postConsultation.confianca ?? 0]} max={10} step={1} onValueChange={v => updatePos({ confianca: v[0] })} />
                  </Field>
                </div>
                <Field label="O que mudou após o exame físico"><Textarea rows={2} value={active.postConsultation.mudouAposExame || ""} onChange={e => updatePos({ mudouAposExame: e.target.value })} /></Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Exames solicitados"><Textarea rows={2} value={active.postConsultation.examesPedidos || ""} onChange={e => updatePos({ examesPedidos: e.target.value })} /></Field>
                  <Field label="Conduta escolhida"><Textarea rows={2} value={active.postConsultation.conduta || ""} onChange={e => updatePos({ conduta: e.target.value })} /></Field>
                </div>
                <Field label="Educação entregue ao paciente"><Textarea rows={2} value={active.postConsultation.educacao || ""} onChange={e => updatePos({ educacao: e.target.value })} /></Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Retorno (data/intervalo)"><Input value={active.postConsultation.retorno || ""} onChange={e => updatePos({ retorno: e.target.value })} placeholder="Ex.: 6 semanas" /></Field>
                  <Field label="Desfecho no retorno"><Input value={active.postConsultation.desfechoRetorno || ""} onChange={e => updatePos({ desfechoRetorno: e.target.value })} placeholder="Melhor / estável / pior" /></Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Feedback sobre a IA" hint="ajudou? perdeu algo? alucinou? sub/superestimou urgência?">
                    <Textarea rows={3} value={active.postConsultation.feedbackIA || ""} onChange={e => updatePos({ feedbackIA: e.target.value })} />
                  </Field>
                  <Field label="O que o médico corrigiu">
                    <Textarea rows={3} value={active.postConsultation.correcaoMedico || ""} onChange={e => updatePos({ correcaoMedico: e.target.value })} />
                  </Field>
                </div>
                <Field label={`Utilidade da IA (0–10): ${active.learningFeedback.usefulnessScore ?? 0}`}>
                  <Slider value={[active.learningFeedback.usefulnessScore ?? 0]} max={10} step={1}
                    onValueChange={v => update({ learningFeedback: { ...active.learningFeedback, usefulnessScore: v[0] } })} />
                </Field>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button onClick={() => { update({ learningFeedback: { ...active.learningFeedback, physicianCorrections: active.postConsultation.correcaoMedico, finalSyndrome: active.postConsultation.diagnosticoFinal, outcomeAtFollowUp: active.postConsultation.desfechoRetorno } }); addTimeline("Evolução salva", "Aprendizado anônimo registrado", "pos"); toast.success("Evolução anônima salva localmente"); }} className="gap-2"><Save className="h-4 w-4" /> Salvar evolução anônima</Button>
                  <Button variant="secondary" onClick={exportLearning} className="gap-2"><Download className="h-4 w-4" /> Exportar aprendizado anônimo</Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                  {[
                    { label: "Casos", value: stats.total, icon: Microscope },
                    { label: "Com red flags", value: stats.withRedFlags, icon: AlertTriangle },
                    { label: "Correções médico", value: stats.corrections, icon: Brain },
                    { label: "Utilidade média IA", value: stats.avgUseful, icon: Activity },
                  ].map(s => {
                    const I = s.icon as any;
                    return (
                      <div key={s.label} className="rounded-lg border border-border/60 bg-secondary/40 p-3">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs"><I className="h-3.5 w-3.5" /> {s.label}</div>
                        <div className="text-2xl font-semibold mt-1">{s.value}</div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground pt-2">
                  Base de aprendizado clínico local/anônima. Protótipo preparado para aprendizado supervisionado futuro; não treina modelo automaticamente com dados identificáveis.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </section>

        {/* Right: outputs + timeline + cases */}
        <aside className="lg:col-span-5 space-y-5">
          {(() => {
            const display =
              analysis ||
              active.outputs.patientEducation ||
              active.outputs.nextSteps ||
              active.outputs.soap ||
              active.outputs.consultationAssessment ||
              active.outputs.triage ||
              "";
            return (
              <div className="panel min-h-[300px]">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Saída da IA — copiloto clínico</h2>
                  {display && !loading && <Badge variant="outline" className="ml-auto text-[10px] border-primary/40 text-primary">Markdown</Badge>}
                  {loading && <Loader2 className="h-4 w-4 animate-spin text-primary ml-auto" />}
                </div>
                {loading && (
                  <div className="space-y-2 animate-pulse">
                    <div className="h-3 w-1/3 rounded bg-secondary/60" />
                    <div className="h-3 w-2/3 rounded bg-secondary/60" />
                    <div className="h-3 w-1/2 rounded bg-secondary/60" />
                    <div className="h-3 w-3/4 rounded bg-secondary/60" />
                    <p className="text-xs text-muted-foreground pt-2">Gerando análise estruturada…</p>
                  </div>
                )}
                {!loading && !display && (
                  <div className="text-sm text-muted-foreground">
                    Preencha a triagem e clique em <span className="text-primary font-medium">Executar análise</span>. A resposta virá em Markdown estruturado: prioridade clínica, red flags, fenótipo, diferencial ranqueado, exames, próximos passos, SOAP e orientação ao paciente.
                  </div>
                )}
                {!loading && display && (
                  <ScrollArea className="h-[60vh] pr-3">
                    <Markdown>{display}</Markdown>
                  </ScrollArea>
                )}
              </div>
            );
          })()}

          <div className="panel">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Linha do tempo clínica</h2>
              <Badge variant="outline" className="ml-auto text-[10px]">Caso {active.localCaseId}</Badge>
            </div>

            {/* Evolution snapshot — Pré → Consulta → Pós */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {([
                {
                  k: "pre", label: "Pré", icon: ClipboardList,
                  color: "text-cyan-300 border-cyan-500/30 bg-cyan-500/5",
                  lines: [
                    active.preAttendance.queixaPrincipal && `Queixa: ${active.preAttendance.queixaPrincipal}`,
                    typeof active.preAttendance.dor === "number" && `Dor ${active.preAttendance.dor}/10`,
                    active.preAttendance.duracao && `Duração ${active.preAttendance.duracao}`,
                    active.preAttendance.padrao?.length && `Padrão: ${active.preAttendance.padrao.join(", ")}`,
                    active.preAttendance.redFlags?.length ? `⚠ ${active.preAttendance.redFlags.length} red flag(s)` : null,
                  ].filter(Boolean) as string[],
                },
                {
                  k: "consulta", label: "Consulta", icon: Stethoscope,
                  color: "text-primary border-primary/30 bg-primary/5",
                  lines: [
                    (active.consultation.jointCount?.tender || active.consultation.jointCount?.swollen)
                      ? `Articul.: ${active.consultation.jointCount?.tender ?? 0} dolorosas / ${active.consultation.jointCount?.swollen ?? 0} edemaciadas`
                      : null,
                    active.consultation.hipoteses && `Hipótese: ${active.consultation.hipoteses}`,
                    active.consultation.examFisico && `Exame físico registrado`,
                    active.consultation.plano && `Plano discutido`,
                  ].filter(Boolean) as string[],
                },
                {
                  k: "pos", label: "Pós", icon: Brain,
                  color: "text-warning border-warning/30 bg-warning/5",
                  lines: [
                    active.postConsultation.diagnosticoFinal && `Dx: ${active.postConsultation.diagnosticoFinal}`,
                    typeof active.postConsultation.confianca === "number" && active.postConsultation.confianca > 0 && `Confiança ${active.postConsultation.confianca}/10`,
                    active.postConsultation.conduta && `Conduta definida`,
                    active.postConsultation.retorno && `Retorno: ${active.postConsultation.retorno}`,
                    active.postConsultation.desfechoRetorno && `Desfecho: ${active.postConsultation.desfechoRetorno}`,
                  ].filter(Boolean) as string[],
                },
              ] as const).map((s) => {
                const I = s.icon as any;
                return (
                  <div key={s.k} className={`rounded-lg border p-2 ${s.color}`}>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                      <I className="h-3 w-3" /> {s.label}
                    </div>
                    {s.lines.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground/70 mt-1.5 italic">vazio</div>
                    ) : (
                      <ul className="mt-1.5 space-y-0.5">
                        {s.lines.map((l, i) => (
                          <li key={i} className="text-[11px] text-foreground/85 leading-snug line-clamp-2">{l}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Chronological events grouped by phase */}
            {(() => {
              const order: Phase[] = ["pre", "consulta", "pos"];
              const phaseMeta: Record<Phase, { label: string; icon: any; dot: string; ring: string }> = {
                pre: { label: "Pré-atendimento", icon: ClipboardList, dot: "bg-cyan-400", ring: "ring-cyan-400/30" },
                consulta: { label: "Durante a consulta", icon: Stethoscope, dot: "bg-primary", ring: "ring-primary/30" },
                pos: { label: "Pós-consulta · aprendizado", icon: Brain, dot: "bg-warning", ring: "ring-warning/30" },
              };
              const events = active.timeline || [];
              if (events.length === 0) {
                return (
                  <p className="text-xs text-muted-foreground">
                    Sem eventos cronológicos ainda. Cada execução de IA, geração de SOAP e salvamento de evolução é registrado aqui automaticamente.
                  </p>
                );
              }
              return (
                <div className="space-y-4">
                  {order.map((p) => {
                    const evs = events.filter((e) => e.phase === p).sort((a, b) => +new Date(a.date) - +new Date(b.date));
                    if (evs.length === 0) return null;
                    const Pi = phaseMeta[p].icon;
                    return (
                      <div key={p}>
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                          <Pi className="h-3 w-3" /> {phaseMeta[p].label}
                          <span className="text-foreground/40">· {evs.length}</span>
                        </div>
                        <ol className="relative border-l border-border/60 ml-1.5 space-y-2.5">
                          {evs.map((t, i) => (
                            <li key={i} className="ml-4">
                              <div className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ${phaseMeta[p].dot} ring-4 ${phaseMeta[p].ring}`} />
                              <div className="text-[10px] text-muted-foreground tabular-nums">{new Date(t.date).toLocaleString("pt-BR")}</div>
                              <div className="text-sm font-medium leading-tight">{t.title}</div>
                              {t.summary && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.summary}</div>}
                              {t.tags?.length ? (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {t.tags.map((tg) => (
                                    <Badge key={tg} variant="outline" className="text-[9px] py-0 px-1.5">{tg}</Badge>
                                  ))}
                                </div>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          <div className="panel">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Casos locais (anônimos)</h2>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-auto">
              {cases.map(c => (
                <div key={c.localCaseId} className={`flex items-center gap-2 rounded-lg border p-2 ${c.localCaseId === activeId ? "border-primary/60 bg-primary/5" : "border-border/60"}`}>
                  <button className="flex-1 text-left" onClick={() => { setActiveId(c.localCaseId); setAnalysis(""); }}>
                    <div className="text-sm font-medium">{c.localCaseId} · {c.preAttendance.queixaPrincipal || "sem queixa"}</div>
                    <div className="text-[11px] text-muted-foreground">{new Date(c.updatedAt).toLocaleString("pt-BR")}</div>
                  </button>
                  <Button size="icon" variant="ghost" onClick={() => deleteCase(c.localCaseId)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      <footer className="container py-8 text-center text-[11px] text-muted-foreground">
        MedConsult OS — embrião clínico do UHS Health OS / Projeto Vida · uso médico, não substitui consulta presencial · LGPD/GDPR by-design
      </footer>
    </div>
  );
}
