// Local-only prototype storage. No PHI. Anonymous learning base.
export type Phase = "pre" | "consulta" | "pos";

export interface PreAttendance {
  queixaPrincipal: string;
  narrativa: string;
  duracao: string;
  dor: number;
  rigidezManha: number;
  padrao: string[];
  areas: string[];
  fadiga: number;
  sono: number;
  cognicao: number;
  somaticos: number;
  redFlags: string[];
  conjuntivo: string[];
  espondilo: string[];
  cristal: string[];
  labs: string;
  imagens: string;
}

export interface Consultation {
  anamnese: string;
  examFisico: string;
  jointCount: { tender: number; swollen: number };
  vitais: string;
  medicacoes: string;
  hipoteses: string;
  decisaoCompartilhada: string;
  plano: string;
}

export interface PostConsultation {
  diagnosticoFinal: string;
  confianca: number;
  mudouAposExame: string;
  examesPedidos: string;
  conduta: string;
  educacao: string;
  retorno: string;
  desfechoRetorno: string;
  feedbackIA: string;
  correcaoMedico: string;
}

export interface Outputs {
  triage?: string;
  consultationAssessment?: string;
  soap?: string;
  nextSteps?: string;
  patientEducation?: string;
}

export interface CaseSession {
  localCaseId: string;
  createdAt: string;
  updatedAt: string;
  preAttendance: Partial<PreAttendance>;
  consultation: Partial<Consultation>;
  postConsultation: Partial<PostConsultation>;
  outputs: Outputs;
  learningFeedback: {
    usefulnessScore?: number;
    physicianCorrections?: string;
    finalSyndrome?: string;
    outcomeAtFollowUp?: string;
    aiErrors?: string;
    unnecessarySuggestions?: string;
    missedFindings?: string;
  };
  timeline: { date: string; phase: Phase; title: string; summary: string; tags: string[] }[];
}

const KEY = "medconsult-os.cases.v1";

export function loadCases(): CaseSession[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch { return []; }
}
export function saveCases(cases: CaseSession[]) {
  localStorage.setItem(KEY, JSON.stringify(cases));
}
export function newCase(): CaseSession {
  const now = new Date().toISOString();
  return {
    localCaseId: "C-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
    createdAt: now,
    updatedAt: now,
    preAttendance: {},
    consultation: {},
    postConsultation: {},
    outputs: {},
    learningFeedback: {},
    timeline: [],
  };
}
export function upsertCase(c: CaseSession) {
  const all = loadCases();
  const idx = all.findIndex((x) => x.localCaseId === c.localCaseId);
  c.updatedAt = new Date().toISOString();
  if (idx >= 0) all[idx] = c; else all.unshift(c);
  saveCases(all);
}
