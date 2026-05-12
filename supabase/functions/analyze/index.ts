// Edge function: routes each clinical task to the AI engine that fits best,
// with automatic fallback chain when a provider is rate-limited (429) or down.
// Gemini     → raciocínio clínico profundo (executar, atualizar, proximos)
// OpenAI     → comunicação clínica estruturada (soap, educacao)
// Grok       → evidência atual com busca web em tempo real (evidencia)
// OpenRouter → painel de segunda opinião / auditoria crítica (auditoria)
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Mode = "executar" | "atualizar" | "soap" | "proximos" | "educacao" | "evidencia" | "auditoria";
type Engine = "gemini" | "openai" | "grok" | "openrouter" | "nvidia";

const BASE_RULES = `Você é o MedConsult OS — copiloto clínico de reumatologia para uso EXCLUSIVO por médico (Dr. João Otávio Rennó Grilo). Você NÃO substitui consulta, exame físico, protocolos locais nem julgamento clínico. Responda SEMPRE em português do Brasil, de forma estruturada, sóbria e objetiva.

Regras invioláveis:
- Não invente dados. Se faltar informação, diga "dado ausente".
- Não use identificadores de paciente. Se aparecerem, ignore-os.
- Não afirme diagnóstico definitivo: trabalhe com hipóteses, fenótipos e probabilidades qualitativas.
- Sinalize claramente red flags e urgência (P0 imediato / P1 24h / P2 dias / P3 ambulatorial) quando relevante.`;

const PROMPTS: Record<Mode, string> = {
  executar: `${BASE_RULES}

Você está em **TRIAGEM PRÉ-ATENDIMENTO**. Gere análise estruturada em Markdown com estes títulos exatos:

## 1. Resumo executivo
## 2. Prioridade clínica (P0/P1/P2/P3)
## 3. Red flags e racional
## 4. Classificação fenotípica
(artrite inflamatória / doença do tecido conjuntivo–Sjögren–lúpus / espondiloartrite / artrite por cristais / OA-mecânica / fibromialgia-nociplástica / infecção-neoplasia-sistêmico)
## 5. Diagnóstico diferencial (ranqueado, com prós e contras)
## 6. Interpretação de exames laboratoriais e de imagem
## 7. O que está faltando
## 8. Exame físico dirigido sugerido
## 9. Otimização de exames (evitar excesso)
## 10. Limitações e aviso de segurança`,

  atualizar: `${BASE_RULES}

Você está **DURANTE A CONSULTA** — atualize o raciocínio integrando anamnese, exame físico, contagem articular e hipóteses do médico. Markdown com:

## 1. Como o exame físico mudou as hipóteses
## 2. Diferencial reordenado (com pesos qualitativos)
## 3. Achados que reforçam / refutam cada hipótese
## 4. Lacunas que ainda precisam ser fechadas
## 5. Próximo passo imediato sugerido
## 6. Limitações`,

  proximos: `${BASE_RULES}

Gere **PRÓXIMOS PASSOS** clínicos pragmáticos. Markdown com:

## 1. Exames a solicitar (com justificativa e o que cada um descarta/confirma)
## 2. Encaminhamentos necessários
## 3. Medicação inicial sugerida (classe, racional, alertas — sem dose definitiva)
## 4. Janela de retorno e gatilhos de retorno antecipado
## 5. O que monitorar entre consultas
## 6. Limitações`,

  soap: `${BASE_RULES}

Gere uma **NOTA SOAP** clínica pronta para prontuário, técnica e enxuta. Markdown com:

## S — Subjetivo
## O — Objetivo (incluir sinais vitais, contagem articular, achados)
## A — Avaliação (síndrome / hipóteses ranqueadas / estratificação de risco)
## P — Plano (exames, terapêutica, educação, retorno, red flags a vigiar)

Linguagem médica formal. Sem floreios. Sem dados identificáveis.`,

  educacao: `${BASE_RULES}

Gere **ORIENTAÇÃO AO PACIENTE** em linguagem acessível, calorosa e clara (5ª–8ª série). Markdown com:

## O que está acontecendo com você
## O que vamos investigar e por quê
## O que você pode fazer agora
## Sinais de alerta — procure atendimento imediato se…
## Quando voltaremos a conversar
## Perguntas frequentes

Sem jargão. Sem promessas. Sem diagnóstico definitivo.`,

  evidencia: `${BASE_RULES}

Você é o módulo de **EVIDÊNCIA ATUAL EM TEMPO REAL**. Use busca web ao vivo para trazer literatura, guidelines e alertas regulatórios recentes (priorize últimos 24 meses) relevantes ao caso. Markdown com:

## 1. Pergunta clínica derivada do caso
## 2. Guidelines vigentes (ACR, EULAR, SBR, NICE) — ano e ponto-chave
## 3. Estudos recentes relevantes (≤24 meses) — desenho, n, achado, link
## 4. Alertas de fármacos / interações / segurança (FDA, EMA, ANVISA)
## 5. Síntese aplicada a este caso
## 6. Lacunas de evidência
## 7. Fontes (lista com URLs)

Sempre cite a fonte ao lado de cada afirmação. Se não encontrar evidência robusta, diga explicitamente.`,

  auditoria: `${BASE_RULES}

Você é o **AUDITOR CLÍNICO INDEPENDENTE — segunda opinião**. Sua missão é revisar criticamente o caso e quaisquer saídas anteriores das outras IAs. Atue como revisor sênior cético: não concorde por inércia. Markdown com:

## 1. Veredito geral (concordo / concordo com ressalvas / discordo)
## 2. Hipóteses negligenciadas ou subvalorizadas
## 3. Possíveis alucinações ou afirmações sem suporte
## 4. Red flags ou contraindicações que podem ter passado
## 5. Vieses cognitivos identificados (ancoragem, disponibilidade, fechamento prematuro)
## 6. Riscos de segurança do paciente (medicação, exame, conduta)
## 7. Recomendação final ao médico — o que mudar antes de executar

Seja direto, técnico e implacável com erros. Sem bajulação.`,
};

function pickEngine(mode: Mode, override?: string): Engine {
  if (override === "gemini" || override === "openai" || override === "grok" || override === "openrouter" || override === "nvidia") return override;
  // Modo emergência: NVIDIA como motor principal enquanto os demais estão sem créditos.
  return "nvidia";
}

// Fallback chain — when primary is rate-limited or down, try the next available engine.
const FALLBACK: Record<Engine, Engine[]> = {
  gemini:     ["openai", "openrouter", "nvidia", "grok"],
  openai:     ["gemini", "openrouter", "nvidia", "grok"],
  grok:       ["openrouter", "nvidia", "gemini", "openai"],
  openrouter: ["gemini", "openai", "nvidia", "grok"],
  nvidia:     ["gemini", "openai", "openrouter", "grok"],
};

type CallResult =
  | { ok: true; analysis: string; provider: string; model: string; citations?: any[] }
  | { ok: false; status: number; error: string; detail?: string };

async function callGemini(system: string, user: string): Promise<CallResult> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return { ok: false, status: 500, error: "GEMINI_API_KEY ausente." };
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-pro";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("Gemini error", r.status, t);
    return { ok: false, status: r.status, error: `Gemini ${r.status}`, detail: t };
  }
  const d = await r.json();
  const analysis = d?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
  return { ok: true, analysis, provider: "google-gemini", model };
}

async function callOpenAI(system: string, user: string): Promise<CallResult> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return { ok: false, status: 500, error: "OPENAI_API_KEY ausente." };
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o";
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("OpenAI error", r.status, t);
    return { ok: false, status: r.status, error: `OpenAI ${r.status}`, detail: t };
  }
  const d = await r.json();
  return { ok: true, analysis: d?.choices?.[0]?.message?.content ?? "", provider: "openai", model };
}

async function callGrok(system: string, user: string): Promise<CallResult> {
  const key = Deno.env.get("XAI_API_KEY");
  if (!key) return { ok: false, status: 500, error: "XAI_API_KEY ausente." };
  const model = Deno.env.get("XAI_MODEL") || "grok-4-latest";
  const r = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("Grok error", r.status, t);
    return { ok: false, status: r.status, error: `Grok ${r.status}`, detail: t };
  }
  const d = await r.json();
  return { ok: true, analysis: d?.choices?.[0]?.message?.content ?? "", provider: "xai-grok", model, citations: d?.citations ?? [] };
}

async function callOpenRouter(system: string, user: string): Promise<CallResult> {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) return { ok: false, status: 500, error: "OPENROUTER_API_KEY ausente." };
  const model = Deno.env.get("OPENROUTER_MODEL") || "anthropic/claude-sonnet-4.5";
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://vida-clinica-copiloto.lovable.app",
      "X-Title": "MedConsult OS",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("OpenRouter error", r.status, t);
    return { ok: false, status: r.status, error: `OpenRouter ${r.status}`, detail: t };
  }
  const d = await r.json();
  return { ok: true, analysis: d?.choices?.[0]?.message?.content ?? "", provider: "openrouter", model };
}

async function callNvidia(system: string, user: string): Promise<CallResult> {
  const key = Deno.env.get("NVIDIA_API_KEY");
  if (!key) return { ok: false, status: 500, error: "NVIDIA_API_KEY ausente." };
  const model = Deno.env.get("NVIDIA_MODEL") || "nvidia/llama-3.1-nemotron-70b-instruct";
  const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 4096,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("NVIDIA error", r.status, t);
    return { ok: false, status: r.status, error: `NVIDIA ${r.status}`, detail: t };
  }
  const d = await r.json();
  return { ok: true, analysis: d?.choices?.[0]?.message?.content ?? "", provider: "nvidia-nim", model };
}

const CALL: Record<Engine, (s: string, u: string) => Promise<CallResult>> = {
  gemini: callGemini,
  openai: callOpenAI,
  grok: callGrok,
  openrouter: callOpenRouter,
  nvidia: callNvidia,
};

const ROLE_OF: Record<Engine, string> = {
  gemini: "clinical-reasoning",
  openai: "clinical-communication",
  grok: "live-evidence",
  openrouter: "audit",
  nvidia: "open-model-reasoning",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };

  try {
    const payload = await req.json();
    const { preAttendance, consultation, postConsultation, mode: rawMode, provider } = payload ?? {};
    const mode: Mode = (PROMPTS as any)[rawMode] ? rawMode : "executar";
    const primary = pickEngine(mode, provider);
    const SYSTEM_PROMPT = PROMPTS[mode];

    const userContent = `Modo: ${mode}

=== PRÉ-ATENDIMENTO ===
${JSON.stringify(preAttendance ?? {}, null, 2)}

=== DURANTE A CONSULTA ===
${JSON.stringify(consultation ?? {}, null, 2)}

=== PÓS-CONSULTA ===
${JSON.stringify(postConsultation ?? {}, null, 2)}

Gere a resposta no formato obrigatório. Se uma seção não se aplicar, escreva "Não aplicável neste momento".`;

    // Try primary, then fallback chain on 429 / 5xx / missing-key (500).
    const chain: Engine[] = [primary, ...FALLBACK[primary]];
    const attempts: { engine: Engine; status: number; error: string }[] = [];

    for (const engine of chain) {
      const res = await CALL[engine](SYSTEM_PROMPT, userContent);
      if (res.ok) {
        const fellBack = engine !== primary;
        return new Response(
          JSON.stringify({
            analysis: res.analysis,
            provider: res.provider,
            model: res.model,
            role: ROLE_OF[engine],
            citations: res.citations,
            engineUsed: engine,
            primaryEngine: primary,
            fellBack,
            fallbackNote: fellBack ? `Motor primário (${primary}) indisponível — resposta gerada por ${engine}.` : undefined,
            attempts: fellBack ? attempts : undefined,
          }),
          { headers: jsonHeaders }
        );
      }
      attempts.push({ engine, status: res.status, error: res.error });
      // Only fall back on transient/quota errors; on real 4xx (e.g. 400 bad request) stop.
      const transient = res.status === 429 || res.status === 402 || res.status >= 500 || res.status === 503;
      if (!transient) {
        return new Response(
          JSON.stringify({ error: `Falha em ${engine}: ${res.error}`, detail: res.detail, attempts }),
          { status: res.status, headers: jsonHeaders }
        );
      }
    }

    // All providers exhausted.
    return new Response(
      JSON.stringify({
        error: "Todos os motores de IA estão temporariamente indisponíveis (limite ou créditos). Aguarde alguns minutos.",
        attempts,
      }),
      { status: 503, headers: jsonHeaders }
    );
  } catch (e) {
    console.error("analyze error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: jsonHeaders });
  }
});
