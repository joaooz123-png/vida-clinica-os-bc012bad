// Literature / evidence search powered by Lovable AI Gateway.
// Returns a structured, evidence-based clinical summary with citations.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const SYSTEM_PROMPT = `Você é um médico-pesquisador especialista em medicina baseada em evidências, treinado para responder perguntas clínicas com rigor científico.

REGRAS:
- Responda SEMPRE em português brasileiro, em Markdown estruturado.
- Estruture a resposta em seções fixas:
  1. **Resposta direta** (1–3 frases, conclusão prática)
  2. **Nível de evidência** (GRADE: alta / moderada / baixa / muito baixa, com justificativa)
  3. **Síntese da evidência** (estudos-chave, populações, desfechos, NNT/NNH quando aplicável)
  4. **Guidelines relevantes** (cite sociedade, ano, recomendação)
  5. **Aplicação clínica** (em quem usar, em quem não usar, monitorização)
  6. **Limitações & lacunas** (o que ainda não se sabe)
  7. **Referências sugeridas** (lista numerada com autor/título/ano/journal — sem inventar DOIs ou links se não tiver certeza)
- Se a pergunta for vaga, peça refinamento na primeira linha antes de responder.
- NUNCA invente referências ou números. Se não souber, diga "evidência insuficiente / não localizada nesta sessão".
- Sinalize claramente quando a recomendação for baseada em consenso de especialistas (vs. ensaio clínico).
- Foque em reumatologia, medicina interna e clínica geral salvo solicitação contrária.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const question = String(body?.question || "").trim();
    const context = String(body?.context || "").trim();
    const model = String(body?.model || "google/gemini-2.5-pro");

    if (!question || question.length < 5) {
      return new Response(JSON.stringify({ error: "Pergunta clínica obrigatória (mín. 5 caracteres)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (question.length > 2000) {
      return new Response(JSON.stringify({ error: "Pergunta excede 2000 caracteres." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userContent = context
      ? `## Pergunta clínica\n${question}\n\n## Contexto adicional\n${context}`
      : `## Pergunta clínica\n${question}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.2,
      }),
    });

    if (res.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos de IA insuficientes." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: `Falha no provedor (HTTP ${res.status}): ${txt.slice(0, 300)}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const analysis = data?.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ analysis, model, provider: "lovable-ai" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
