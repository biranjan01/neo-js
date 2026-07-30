// Step 2: Mutation frequency analysis

import { ParsedMutation, MutationFrequency } from './types';

export interface Step2Result {
  success: boolean;
  summary: MutationFrequency[];
  uniquePositions: number;
  hotspotCount: number;
  totalSamples: number;
  error?: string;
}

/**
 * Step 2: Analyze mutation frequency across patients
 * Input: Missense mutations from Step 1
 * Output: Frequency summary with hotspot detection
 */
export function step2AnalyzeFrequency(
  missense: ParsedMutation[]
): Step2Result {
  if (missense.length === 0) {
    return {
      success: false,
      summary: [],
      uniquePositions: 0,
      hotspotCount: 0,
      totalSamples: 0,
      error: 'No mutations to analyze',
    };
  }

  const hasSample = missense.some((m) => m.Sample);

  // Count unique samples
  const totalSamples = hasSample
    ? new Set(missense.filter((m) => m.Sample).map((m) => m.Sample)).size
    : missense.length;

  // Group by (Position, Ref_AA, Alt_AA)
  const grouped = new Map<string, { ref: string; alt: string; pos: number; samples: Set<string> }>();

  for (const mut of missense) {
    const key = `${mut.Position}_${mut.Ref_AA}_${mut.Alt_AA}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        ref: mut.Ref_AA,
        alt: mut.Alt_AA,
        pos: mut.Position,
        samples: new Set(),
      });
    }
    const entry = grouped.get(key)!;
    if (mut.Sample) {
      entry.samples.add(mut.Sample);
    } else {
      // No sample info, count each row as unique
      entry.samples.add(`row_${mut.Position}_${mut.Ref_AA}_${mut.Alt_AA}_${entry.samples.size}`);
    }
  }

  // Convert to frequency table
  const summary: MutationFrequency[] = [];

  for (const [, entry] of grouped) {
    const patientCount = entry.samples.size;
    const maf = totalSamples > 0 ? (patientCount / totalSamples) * 100 : 0;

    summary.push({
      Position: entry.pos,
      Ref_AA: entry.ref,
      Alt_AA: entry.alt,
      Patient_Count: patientCount,
      MAF: Math.round(maf * 10000) / 10000,
      is_hotspot: patientCount >= 100,
    });
  }

  // Sort by patient count descending
  summary.sort((a, b) => b.Patient_Count - a.Patient_Count);

  const uniquePositions = new Set(summary.map((s) => s.Position)).size;
  const hotspotCount = summary.filter((s) => s.is_hotspot).length;

  console.log(`${summary.length} unique mutations, ${uniquePositions} unique positions, ${hotspotCount} hotspots, ${totalSamples} total samples`);

  return {
    success: true,
    summary,
    uniquePositions,
    hotspotCount,
    totalSamples,
  };
}

/**
 * Generate CSV string from frequency summary
 */
export function frequencyToCSV(summary: MutationFrequency[]): string {
  const header = 'Position,Ref_AA,Alt_AA,Patient_Count,MAF,is_hotspot';
  const rows = summary.map(
    (s) => `${s.Position},${s.Ref_AA},${s.Alt_AA},${s.Patient_Count},${s.MAF},${s.is_hotspot}`
  );
  return [header, ...rows].join('\n');
}

/**
 * Generate CSV string from missense mutations
 */
export function missenseToCSV(missense: ParsedMutation[]): string {
  const hasSample = missense.some((m) => m.Sample);
  const header = hasSample
    ? 'Position,Ref_AA,Alt_AA,Canonical_Mutation,AA_Mutation,Sample'
    : 'Position,Ref_AA,Alt_AA,Canonical_Mutation,AA_Mutation';

  const rows = missense.map((m) => {
    const base = `${m.Position},${m.Ref_AA},${m.Alt_AA},${m.Canonical_Mutation},${m.AA_Mutation}`;
    return hasSample ? `${base},${m.Sample || ''}` : base;
  });

  return [header, ...rows].join('\n');
}
