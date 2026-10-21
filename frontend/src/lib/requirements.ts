import type { JobRequirements, RequirementInput } from "../api/types";

export const MAX_REQUIREMENTS = 80;

export interface EditableRequirement extends RequirementInput {
  key: string;
  category: string;
  evidence: string;
  custom: boolean;
}

let keySeq = 0;
export const nextKey = () => `req-${++keySeq}`;

export function toEditable(job: JobRequirements): EditableRequirement[] {
  return job.skills.map((s) => ({
    key: nextKey(),
    skill: s.skill,
    importance: s.importance,
    alternatives: s.alternatives,
    category: s.categoryLabel || s.category,
    evidence: s.evidence,
    custom: s.custom,
  }));
}
