import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, HeartPulse, Printer, Send, Copy, Check, ClipboardList, Lock, Activity, ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { PreAttendance } from "@/lib/caseStore";

const DURACOES = ["menos de 6 semanas", "6 semanas a 3 meses", "mais de 3 meses"];
const PADRAO = [
  "dor que melhora com movimento (sugere inflamatório)",
  "dor que piora com movimento (sugere mecânico)",
  "dor difusa por todo o corpo",
  "dor mais nas costas/coluna",
  "dor mais nas mãos, pés, joelhos",
  "começou em uma articulação só, de repente",
  "dor em várias articulações ao mesmo tempo",
];
const AREAS = ["mãos","punhos","cotovelos","ombros","pescoço","costas","lombar","quadris","joelhos","tornozelos","pés","dedos dos pés","dor no corpo todo"];
const RED_FLAGS = [
  "febre nos últimos dias",
  "uso de remédio que baixa a imunidade",
  "uma articulação muito quente, vermelha e inchada",
  "dor muito forte e súbita",
  "fraqueza, formigamento ou perda de força",
  "dor no peito ou falta de ar",
  "alterações na visão",
  "dor de cabeça nova e forte (acima de 50 anos)",
  "perda de peso sem explicação",
  "histórico de câncer",
  "sinais de infecção (pus, calafrios)",
];
const CONJ = ["olhos secos", "boca seca", "manchas na pele com sol", "feridas na boca", "dedos que ficam roxos no frio (Raynaud)", "queda de cabelo", "manchas na pele"];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Chips({ items, value, onChange, multi = true }: { items: string[]; value: string[]; onChange: (v: string[]) => void; multi?: boolean }) {
  const toggle = (i: string) => {
    if (!multi) return onChange([i]);
    onChange(value.includes(i) ? value.filter(x => x !== i) : [...value, i]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(i => (
        <button type="button" key={i} onClick={() => toggle(i)}
          className={`text-sm rounded-lg border px-3 py-1.5 transition ${value.includes(i) ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary/40 text-foreground/85 hover:border-primary/40"}`}>
          {i}
        </button>
      ))}
    </div>
  );
}

export default function Questionario() {
  const [data, setData] = useState<Partial<PreAttendance>>({
    dor: 0, rigidezManha: 0, fadiga: 0, sono: 0, padrao: [], areas: [], redFlags: [], conjuntivo: [],
    vitais: {},
  });
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);

  const u = (patch: Partial<PreAttendance>) => setData(d => ({ ...d, ...patch }));
  const uv = (patch: Partial<NonNullable<PreAttendance["vitais"]>>) => setData(d => ({ ...d, vitais: { ...(d.vitais || {}), ...patch } }));

  const code = useMemo(() => {
    const payload = { ...data, preenchidoPor: "paciente", preenchidoEm: new Date().toISOString() };
    try {
      // base64url for safe transport
      const json = JSON.stringify(payload);
      const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      return `MCO1-${b64}`;
    } catch { return ""; }
  }, [data]);

  const submit = () => {
    if (!data.queixaPrincipal && !data.narrativa) {
      toast.error("Descreva pelo menos a queixa principal antes de enviar.");
      return;
    }
    setSubmitted(true);
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 50);
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Código copiado. Envie ao seu médico.");
    setTimeout(() => setCopied(false), 1800);
  };

  const whatsapp = () => {
    const text = encodeURIComponent(
      `Olá Dr. João, segue meu questionário pré-consulta:\n\n` +
      `Queixa: ${data.queixaPrincipal || "—"}\nDuração: ${data.duracao || "—"}\nDor (0-10): ${data.dor ?? 0}\n\n` +
      `Código de importação MedConsult OS:\n${code}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-background">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-card { border: 1px solid #ccc !important; box-shadow: none !important; }
        }
      `}</style>

      {/* Header */}
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-20 no-print">
        <div className="container py-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-cyan)" }}>
              <HeartPulse className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Questionário <span className="glow-text">pré-consulta</span></h1>
              <p className="text-[11px] text-muted-foreground -mt-0.5">Reumatologia · Dr. João Otávio Rennó Grilo</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="border-success/40 text-success gap-1"><Lock className="h-3 w-3" /> Sem identificação</Badge>
            <Link to="/">
              <Button size="sm" variant="ghost" className="gap-2"><ArrowLeft className="h-4 w-4" /> Workspace clínico</Button>
            </Link>
            <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-2"><Printer className="h-4 w-4" /> Imprimir</Button>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-3xl space-y-5">
        {/* Print header */}
        <div className="hidden print:block border-b pb-3 mb-2">
          <h1 className="text-xl font-bold">Questionário pré-consulta — Reumatologia</h1>
          <p className="text-sm">Dr. João Otávio Rennó Grilo · MedConsult OS</p>
        </div>

        {/* Intro */}
        <div className="panel print-card">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm text-foreground/90 leading-relaxed">
              Este questionário ajuda seu médico a chegar mais preparado à consulta. Leva cerca de <strong>5 minutos</strong>.
              Suas respostas <strong>não são enviadas automaticamente</strong>: ao final, você receberá um código (ou impressão)
              para entregar ao consultório. Não inclua nome, CPF ou dados pessoais.
            </div>
          </div>
        </div>

        {/* Queixa */}
        <section className="panel print-card space-y-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Sua queixa</h2>
          </div>
          <Field label="Qual o principal motivo da consulta?">
            <Input value={data.queixaPrincipal || ""} onChange={e => u({ queixaPrincipal: e.target.value })} placeholder="Ex.: dor nas mãos há 2 meses" />
          </Field>
          <Field label="Conte com suas palavras como tudo começou e como evoluiu">
            <Textarea rows={4} value={data.narrativa || ""} onChange={e => u({ narrativa: e.target.value })} placeholder="Quando começou, o que melhora, o que piora, se já tomou algum remédio..." />
          </Field>
          <Field label="Há quanto tempo você sente isso?">
            <Chips items={DURACOES} value={data.duracao ? [data.duracao] : []} onChange={v => u({ duracao: v[0] })} multi={false} />
          </Field>
        </section>

        {/* Sintomas */}
        <section className="panel print-card space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Como é a dor</h2>
          </div>
          <Field label={`Intensidade da dor hoje (0 = sem dor, 10 = pior dor): ${data.dor ?? 0}`}>
            <Slider value={[data.dor ?? 0]} max={10} step={1} onValueChange={v => u({ dor: v[0] })} />
          </Field>
          <Field label={`Rigidez ao acordar (em minutos): ${data.rigidezManha ?? 0}`} hint="Tempo até as articulações 'soltarem' pela manhã">
            <Slider value={[data.rigidezManha ?? 0]} max={180} step={5} onValueChange={v => u({ rigidezManha: v[0] })} />
          </Field>
          <Field label="Como é o seu padrão de dor (pode marcar mais de um)">
            <Chips items={PADRAO} value={data.padrao || []} onChange={v => u({ padrao: v })} />
          </Field>
          <Field label="Onde dói (pode marcar mais de um)">
            <Chips items={AREAS} value={data.areas || []} onChange={v => u({ areas: v })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={`Cansaço/fadiga (0–3): ${data.fadiga ?? 0}`}>
              <Slider value={[data.fadiga ?? 0]} max={3} step={1} onValueChange={v => u({ fadiga: v[0] })} />
            </Field>
            <Field label={`Qualidade do sono (0 = ótimo, 3 = péssimo): ${data.sono ?? 0}`}>
              <Slider value={[data.sono ?? 0]} max={3} step={1} onValueChange={v => u({ sono: v[0] })} />
            </Field>
          </div>
        </section>

        {/* Sinais de alarme */}
        <section className="panel print-card space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-warning" />
            <h2 className="text-base font-semibold">Sinais de alerta</h2>
          </div>
          <p className="text-xs text-muted-foreground">Marque o que se aplica a você nos últimos dias. Se algo aqui está acontecendo agora, considere atendimento urgente.</p>
          <Chips items={RED_FLAGS} value={data.redFlags || []} onChange={v => u({ redFlags: v })} />
          <Field label="Outros sintomas que você sente">
            <Chips items={CONJ} value={data.conjuntivo || []} onChange={v => u({ conjuntivo: v })} />
          </Field>
        </section>

        {/* Sinais vitais */}
        <section className="panel print-card space-y-3">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Sinais vitais (se você tiver)</h2>
          </div>
          <p className="text-xs text-muted-foreground">Opcional. Se aferiu pressão, temperatura ou tem dados recentes, registre aqui.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Pressão arterial">
              <Input placeholder="120/80" value={data.vitais?.pa || ""} onChange={e => uv({ pa: e.target.value })} />
            </Field>
            <Field label="Freq. cardíaca (bpm)">
              <Input type="number" inputMode="numeric" value={data.vitais?.fc ?? ""} onChange={e => uv({ fc: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Freq. respiratória (irpm)">
              <Input type="number" inputMode="numeric" value={data.vitais?.fr ?? ""} onChange={e => uv({ fr: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Temperatura (°C)">
              <Input type="number" step="0.1" inputMode="decimal" value={data.vitais?.temperatura ?? ""} onChange={e => uv({ temperatura: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="SpO₂ (%)">
              <Input type="number" inputMode="numeric" value={data.vitais?.spo2 ?? ""} onChange={e => uv({ spo2: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Peso (kg) / Altura (cm)">
              <div className="flex gap-2">
                <Input type="number" placeholder="kg" value={data.vitais?.peso ?? ""} onChange={e => uv({ peso: e.target.value ? Number(e.target.value) : undefined })} />
                <Input type="number" placeholder="cm" value={data.vitais?.altura ?? ""} onChange={e => uv({ altura: e.target.value ? Number(e.target.value) : undefined })} />
              </div>
            </Field>
          </div>
          <Field label="Observação livre (opcional)">
            <Textarea rows={2} value={data.vitais?.obs || ""} onChange={e => uv({ obs: e.target.value })} placeholder="Algo mais que queira contar antes da consulta" />
          </Field>
        </section>

        {/* Submit */}
        <section className="panel print-card no-print">
          {!submitted ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={submit} className="gap-2"><Send className="h-4 w-4" /> Concluir e gerar código</Button>
              <Button variant="outline" onClick={() => window.print()} className="gap-2"><Printer className="h-4 w-4" /> Imprimir minhas respostas</Button>
              <p className="text-xs text-muted-foreground">Nada é enviado automaticamente — você decide como entregar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-success">
                <Check className="h-5 w-5" />
                <span className="font-semibold">Pronto. Envie este código ao consultório.</span>
              </div>
              <Textarea readOnly value={code} rows={4} className="font-mono text-xs" />
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={copyCode} className="gap-2">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copiar código</Button>
                <Button variant="outline" onClick={whatsapp} className="gap-2"><Send className="h-4 w-4" /> Enviar por WhatsApp</Button>
                <Button variant="outline" onClick={() => window.print()} className="gap-2"><Printer className="h-4 w-4" /> Imprimir</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                O médico cola este código no MedConsult OS para importar suas respostas. Nenhum dado seu trafega por servidores nesta etapa — o transporte é por você.
              </p>
            </div>
          )}
        </section>

        <footer className="text-center text-[11px] text-muted-foreground pb-6">
          MedConsult OS · Protocolo Vida · este questionário não substitui consulta médica
        </footer>
      </main>
    </div>
  );
}
