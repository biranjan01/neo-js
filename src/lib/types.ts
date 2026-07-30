// Core types for the Srishti Neoantigen Pipeline

export interface ParsedMutation {
  Position: number;
  Ref_AA: string;
  Alt_AA: string;
  Canonical_Mutation: string;
  Sample?: string;
  AA_Mutation: string;
}

export interface MutationFrequency {
  Position: number;
  Ref_AA: string;
  Alt_AA: string;
  Patient_Count: number;
  MAF: number;
  is_hotspot: boolean;
}

export interface PipelineJob {
  id: string;
  geneName: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  currentStep: number;
  totalSteps: number;
  stepName: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  results?: PipelineResults;
}

export interface PipelineResults {
  missense_simple: ParsedMutation[];
  mutation_summary: MutationFrequency[];
  totalRawRows: number;
  totalMissense: number;
  uniquePositions: number;
  hotspotCount: number;
}

export interface StepProgress {
  step: number;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  message?: string;
}
