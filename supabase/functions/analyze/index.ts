// Edge function: analyze rheumatology case (hidden prompt server-side)
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SYSTEM_PROMPT = `Você é o MedConsult OS — copiloto clínico de reumatologia para uso EXCLUSIVO por médico (Dr. João Otávio Rennó Grilo). Você NÃO substitui consulta, exame físico, protocolos locais nem julgamento clínico. Responda SEMPRE em português do Brasil, de forma estruturada, sóbria e objetiva.

Regras:
- Não invente dados. Se faltar informação, diga "dado ausente".
- Não use identificadores de paciente. Se aparecerem, ignore-os.
- Use linguagem técnica para o médico, e seção separada com linguagem acessível para o paciente.
- Não afirme diagnóstico definitivo: trabalhe com hipóteses, fenótipos e probabilidades qualitativas.
- Sinalize claramente red flags e urgência (P0 imediato / P1 24h / P2 dias / P3 ambulatorial).

Formato OBRIGATÓRIO da resposta em Markdown, com estes títulos exatos:

## 1. Resumo executivo
## 2. Prioridade clínica (P0/P1/P2/P3)
## 3. Red flags e racional
## 4. Classificação fenotípica
(artrite inflamatória / doença do tecido conjuntivo–Sjögren–lúpus / espondiloartrite / artrite por cristais / OA-mecânica / fibromialgia-nociplástica / infecção-neoplasia-sistêmico)
## 5. Diagnóstico diferencial (ranqueado, com prós e contras)
## 6. Interpretação de exames laboratoriais e de imagem
## 7. O que está faltando
## 8. Próximos passos sugeridos (antes / durante / depois da consulta)
## 9. Exame físico dirigido
## 10. Otimização de exames (evitar excesso)
## 11. Nota SOAP (apenas se houver dados de consulta)
## 12. Explicação ao paciente (linguagem acessível)
## 13. O que monitorar na próxima visita (aprendizado)
## 14. Limitações e aviso de segurança`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    const { preAttendance, consultation, postConsultation, mode, provider: rawProvider } = payload ?? {};
    const provider: "gemini" | "openai" = rawProvider === "openai" ? "openai" : "gemini";

    const userContent = `Modo solicitado: ${mode ?? "completo"}

=== PRÉ-ATENDIMENTO ===
${JSON.stringify(preAttendance ?? {}, null, 2)}

=== DURANTE A CONSULTA ===
${JSON.stringify(consultation ?? {}, null, 2)}

=== PÓS-CONSULTA ===
${JSON.stringify(postConsultation ?? {}, null, 2)}

Gere a análise no formato obrigatório. Se uma seção não se aplicar, escreva "Não aplicável neste momento".`;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY ausente. Configure a chave do Google Gemini no backend." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
      return new Response(
        JSON.stringify({ error: "Limite de requisições do Gemini excedido. Tente novamente em instantes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } },
      );
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("Gemini API error", aiRes.status, t);
      return new Response(
        JSON.stringify({ error: "Falha ao consultar o Gemini.", detail: t }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await aiRes.json();
    const analysis =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";

    return new Response(
      JSON.stringify({ analysis, provider: "google-gemini", model }),
      { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("analyze error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
