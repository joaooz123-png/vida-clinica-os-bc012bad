// Minimal, safe markdown renderer for clinical AI output.
// Supports: ## h2, ### h3, **bold**, `code`, lists (-, *, 1.), paragraphs, line breaks.
import { useMemo } from "react";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function inline(s: string) {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return out;
}
function render(md: string) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let para: string[] = [];
  const flushPara = () => { if (para.length) { html.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const flushList = () => { if (listType) { html.push(`</${listType}>`); listType = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushList(); continue; }
    const h2 = line.match(/^##\s+(.*)/);
    const h3 = line.match(/^###\s+(.*)/);
    const ul = line.match(/^[-*]\s+(.*)/);
    const ol = line.match(/^\d+\.\s+(.*)/);
    if (h2) { flushPara(); flushList(); html.push(`<h2>${inline(h2[1])}</h2>`); continue; }
    if (h3) { flushPara(); flushList(); html.push(`<h3>${inline(h3[1])}</h3>`); continue; }
    if (ul) { flushPara(); if (listType !== "ul") { flushList(); html.push("<ul>"); listType = "ul"; } html.push(`<li>${inline(ul[1])}</li>`); continue; }
    if (ol) { flushPara(); if (listType !== "ol") { flushList(); html.push("<ol>"); listType = "ol"; } html.push(`<li>${inline(ol[1])}</li>`); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return html.join("\n");
}

export function Markdown({ children }: { children: string }) {
  const html = useMemo(() => render(children || ""), [children]);
  return <div className="prose-clinical" dangerouslySetInnerHTML={{ __html: html }} />;
}
