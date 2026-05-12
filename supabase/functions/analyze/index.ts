// Edge function: routes each clinical task to the AI engine that fits best.
// Gemini     → raciocínio clínico profundo (executar, atualizar, proximos)
// OpenAI     → comunicação clínica estruturada (soap, educacao)
// Grok       → evidência atual com busca web em tempo real (evidencia)
// OpenRouter → painel de segunda opinião / auditoria crítica (auditoria)
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Mode = "executar" | "atualizar" | "soap" | "proximos" | "educacao" | "evidencia" | "auditoria";
type Engine = "gemini" | "openai" | "grok" | "openrouter";

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
  if (override === "gemini" || override === "openai" || override === "grok" || override === "openrouter") return override;
  if (mode === "soap" || mode === "educacao") return "openai";
  if (mode === "evidencia") return "grok";
  if (mode === "auditoria") return "openrouter";
  return "gemini";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    const { preAttendance, consultation, postConsultation, mode: rawMode, provider } = payload ?? {};
    const mode: Mode = (PROMPTS as any)[rawMode] ? rawMode : "executar";
    const engine = pickEngine(mode, provider);
    const SYSTEM_PROMPT = PROMPTS[mode];

    const userContent = `Modo: ${mode}

=== PRÉ-ATENDIMENTO ===
${JSON.stringify(preAttendance ?? {}, null, 2)}

=== DURANTE A CONSULTA ===
${JSON.stringify(consultation ?? {}, null, 2)}

=== PÓS-CONSULTA ===
${JSON.stringify(postConsultation ?? {}, null, 2)}

Gere a resposta no formato obrigatório. Se uma seção não se aplicar, escreva "Não aplicável neste momento".`;

    const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };

    // ---------- GROK (xAI) — Live Search ----------
    if (engine === "grok") {
      const XAI_API_KEY = Deno.env.get("XAI_API_KEY");
      if (!XAI_API_KEY) {
        return new Response(JSON.stringify({ error: "XAI_API_KEY ausente. Configure a chave do Grok no backend." }),
          { status: 500, headers: jsonHeaders });
      }
      const model = Deno.env.get("XAI_MODEL") || "grok-4-latest";
      const aiRes = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${XAI_API_KEY}` },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
        }),
      });
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições do Grok excedido. Tente novamente em instantes." }),
          { status: 429, headers: jsonHeaders });
      }
      if (!aiRes.ok) {
        const t = await aiRes.text();
        console.error("xAI error", aiRes.status, t);
        return new Response(JSON.stringify({ error: "Falha ao consultar o Grok.", detail: t }),
          { status: 500, headers: jsonHeaders });
      }
      const data = await aiRes.json();
      const analysis = data?.choices?.[0]?.message?.content ?? "";
      const citations = data?.citations ?? [];
      return new Response(JSON.stringify({ analysis, provider: "xai-grok", model, citations, role: "evidence" }),
        { headers: jsonHeaders });
    }

    // ---------- OPENAI — comunicação clínica ----------
    if (engine === "openai") {
      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      if (!OPENAI_API_KEY) {
        return new Response(JSON.stringify({ error: "OPENAI_API_KEY ausente. Configure a chave da OpenAI no backend." }),
          { status: 500, headers: jsonHeaders });
      }
      const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o";
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
        }),
      });
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições da OpenAI excedido. Tente novamente em instantes." }),
          { status: 429, headers: jsonHeaders });
      }
      if (!aiRes.ok) {
        const t = await aiRes.text();
        console.error("OpenAI error", aiRes.status, t);
        return new Response(JSON.stringify({ error: "Falha ao consultar a OpenAI.", detail: t }),
          { status: 500, headers: jsonHeaders });
      }
      const data = await aiRes.json();
      const analysis = data?.choices?.[0]?.message?.content ?? "";
      const role = mode === "soap" ? "clinical-note" : "patient-communication";
      return new Response(JSON.stringify({ analysis, provider: "openai", model, role }),
        { headers: jsonHeaders });
    }

    // ---------- GEMINI — raciocínio clínico ----------
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY ausente. Configure a chave do Google Gemini no backend." }),
        { status: 500, headers: jsonHeaders });
    }
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-pro";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const aiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { role: "system", parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userContent }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      }),
    });
    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Limite de requisições do Gemini excedido. Tente novamente em instantes." }),
        { status: 429, headers: jsonHeaders });
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("Gemini error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "Falha ao consultar o Gemini.", detail: t }),
        { status: 500, headers: jsonHeaders });
    }
    const data = await aiRes.json();
    const analysis = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
    return new Response(JSON.stringify({ analysis, provider: "google-gemini", model, role: "clinical-reasoning" }),
      { headers: jsonHeaders });
  } catch (e) {
    console.error("analyze error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
