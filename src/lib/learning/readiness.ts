// Readiness for a company (PRD 4.7, 8.6): mastery of the topics its tests cover, weighted by
// how much test time each topic is likely to take (D-060).

export type SectionInput = { minutes: number; topicIds: string[] };

/**
 * Weight per topic: each test section's minutes are shared evenly by its topics. Minutes, not
 * question counts, so a coding section (two problems in 45 minutes) counts as much as an MCQ
 * section of the same length. A topic in several sections adds up.
 */
export function topicWeights(sections: SectionInput[]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const section of sections) {
    if (section.topicIds.length === 0) continue;
    const share = section.minutes / section.topicIds.length;
    for (const topicId of section.topicIds)
      weights.set(topicId, (weights.get(topicId) ?? 0) + share);
  }
  return weights;
}

export type Readiness = {
  /** 0–100, or null when the company has no test sections to measure against. */
  score: number | null;
  /** Topics that would raise readiness most, largest gain first. */
  focus: { topicId: string; mastery: number; gain: number }[];
};

export function computeReadiness(
  weights: Map<string, number>,
  mastery: Map<string, number>,
): Readiness {
  const total = [...weights.values()].reduce((sum, w) => sum + w, 0);
  if (total === 0) return { score: null, focus: [] };

  let achieved = 0;
  const focus: Readiness["focus"] = [];
  for (const [topicId, weight] of weights) {
    const score = mastery.get(topicId) ?? 0;
    achieved += weight * score;
    // Possible readiness gain if this topic reached full mastery.
    focus.push({ topicId, mastery: score, gain: (weight * (100 - score)) / total });
  }
  focus.sort((a, b) => b.gain - a.gain || a.mastery - b.mastery);
  return { score: Math.round(achieved / total), focus: focus.filter((f) => f.gain > 0) };
}

export type ReadinessBand = "low" | "building" | "ready";

export function readinessBand(score: number): ReadinessBand {
  if (score >= 70) return "ready";
  if (score >= 40) return "building";
  return "low";
}
