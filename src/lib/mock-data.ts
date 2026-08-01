// Mock data generator for steps 1-8 (skip-to-step-9 mode)
import { IEDBResult } from './step5-7-epitopes';

const MOCK_PEPTIDES = [
  'SIINFEKL', 'GLYDGMEH', 'RYLNDPLL', 'TPVPLLPY', 'KLVVVDGCV',
  'YNTSVLQAQ', 'GILGFVFTL', 'SSYRRPVGI', 'LYPDPSKEL', 'KLVPFPEVY',
  'TITDQVPAVK', 'YLKGPPAAL', 'EIYNGSLYV', 'AYILSLSFS', 'LSPDDVDLV',
  'VFNDNDVRV', 'AYHQSSLSY', 'LLTSVPAEK', 'LTYWDPYF', 'EVLNPKTGF',
];

const MOCK_MHCI_COLUMNS = [
  'peptide', 'start', 'end', 'length', 'allele', 'peptide_index',
  'median_percentile', 'netmhcpan_el_core', 'netmhcpan_el_icore',
  'netmhcpan_el_score', 'netmhcpan_el_percentile',
  'netmhcpan_ba_core', 'netmhcpan_ba_icore', 'netmhcpan_ba_ic50', 'netmhcpan_ba_percentile',
  'score', 'proteasome_score', 'tap_score', 'mhc_score', 'processing_score', 'total_score',
];

const MOCK_MHCII_COLUMNS = [
  'peptide', 'start', 'end', 'length', 'allele', 'peptide_index',
  'median_percentile', 'netmhciipan_el_core', 'netmhciipan_el_icore',
  'netmhciipan_el_score', 'netmhciipan_el_percentile',
];

const MOCK_ALLELES_MHCI = [
  'HLA-A*02:01', 'HLA-A*02:03', 'HLA-A*24:02', 'HLA-A*11:01',
  'HLA-B*07:02', 'HLA-B*35:01', 'HLA-B*40:01', 'HLA-A*03:01',
];

const MOCK_ALLELES_MHCII = [
  'HLA-DRB1*04:01', 'HLA-DRB1*07:01', 'HLA-DRB1*15:01', 'HLA-DRB1*03:01',
];

function rand(min: number, max: number) {
  return Math.round((Math.random() * (max - min) + min) * 10000) / 10000;
}

function generateMockMHCIRows(onlyNovel = false): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < MOCK_PEPTIDES.length; i++) {
    const pep = MOCK_PEPTIDES[i];
    const allele = MOCK_ALLELES_MHCI[i % MOCK_ALLELES_MHCI.length];
    const start = 100 + i * 3;
    const end = start + pep.length - 1;
    const medianPerc = rand(0.1, 3.0);
    const elScore = rand(0.5, 2.0);
    const elPerc = rand(0.01, 5.0);
    const baIC50 = rand(10, 500);
    const baPerc = rand(0.05, 8.0);
    const immScore = rand(0.1, 0.9);
    const protoScore = rand(0.3, 0.9);
    const tapScore = rand(0.2, 0.8);
    const mhcScore = rand(0.4, 0.95);
    const procScore = rand(0.3, 0.85);
    const totalScore = rand(0.35, 0.9);

    rows.push([
      pep, String(start), String(end), String(pep.length), allele, String(i + 1),
      String(medianPerc), pep.substring(0, 9), pep.substring(0, 9),
      String(elScore), String(elPerc),
      pep.substring(0, 9), pep.substring(0, 9), String(baIC50), String(baPerc),
      String(immScore), String(protoScore), String(tapScore), String(mhcScore), String(procScore), String(totalScore),
    ]);
  }
  return rows;
}

function generateMockMHCIIRows(): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < MOCK_PEPTIDES.length; i++) {
    const pep = MOCK_PEPTIDES[i];
    const allele = MOCK_ALLELES_MHCII[i % MOCK_ALLELES_MHCII.length];
    const start = 100 + i * 3;
    const end = start + pep.length - 1;
    const medianPerc = rand(0.5, 10.0);
    const elScore = rand(0.1, 1.5);
    const elPerc = rand(0.5, 15.0);

    rows.push([
      pep, String(start), String(end), String(pep.length), allele, String(i + 1),
      String(medianPerc), pep.substring(0, 15), pep.substring(0, 15),
      String(elScore), String(elPerc),
    ]);
  }
  return rows;
}

function generateCanonicalRows(mutatedRows: string[][], mutatedCols: string[]): string[][] {
  const pepIdx = mutatedCols.indexOf('peptide');
  const alleleIdx = mutatedCols.indexOf('allele');
  const canonRows: string[][] = [];
  const seen = new Set<string>();

  for (const row of mutatedRows) {
    const pep = row[pepIdx];
    const allele = row[alleleIdx];
    const key = `${pep}|${allele}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const canonPep = pep.substring(0, Math.max(pep.length - 1, 3));
    canonRows.push([...row]);
    canonRows[canonRows.length - 1][pepIdx] = canonPep;
  }
  return canonRows;
}

export interface MockDataResult {
  stats: {
    totalRawRows: number;
    totalMissense: number;
    uniquePositions: number;
    hotspotCount: number;
    totalSamples: number;
  };
  topMutations: Array<{
    Position: number;
    Ref_AA: string;
    Alt_AA: string;
    Patient_Count: number;
    MAF: number;
    is_hotspot: boolean;
  }>;
  refSeq: string;
  mutSeq: string;
  msaAlignment: string;
  msaLength: number;
  mhciCanon: IEDBResult;
  mhciMut: IEDBResult;
  mhciiCanon: IEDBResult;
  mhciiMut: IEDBResult;
}

export function generateMockData(geneName: string): MockDataResult {
  const refSeq = 'MSDVAIVCQHTRGLYCLAFSNSKNIIGKLTVNLIDINGFHPDTLQIMFLLIYRNNIKGDLLIALHSYVQPRRSDLYYLSTLDTDLVLHLFSTLRQKLQPILNQYLQSPHNIIRLILGDTNKNYLRIDNIHFPLFLRLKLHTILRPIKNLHFLLQILRNNKLQDLLHLYSILHSGHHPSLSTDLKQLLHCITYILHSLGFHTTSYLLQKLLHPKNLHLSLGLLHNLRHLNIQHLNISGLLHLQNLKELHLDSNLLKCVPKLHTLILGNNKLKSLPLHVFSKLQHLSLHGNRLRILDLHSNNLTTLPPHLAELHLDDNLVHSLALHARNLKNLILSNNKLTHLPLHLAKLQELSLHGNRLKSLPLHLAELQHLSLHGNRLKSLPLHLAELQHLSLHGNRLKSLPLHLAELQHLSLHGNRLKSLPLHLAELQHLSLHGN';
  const mutSeq = refSeq.split('').map((aa, i) => {
    if (i === 102) return 'R';
    if (i === 104) return 'H';
    if (i === 118) return 'C';
    if (i === 345) return 'E';
    if (i === 542) return 'K';
    if (i === 545) return 'R';
    if (i === 887) return 'Q';
    if (i === 1043) return 'E';
    if (i === 1047) return 'R';
    if (i === 1108) return 'E';
    return aa;
  }).join('');

  const msaLen = refSeq.length;
  // Proper FASTA alignment — sequences of same length (point mutations only, no indels)
  // Line-wrapped at 60 chars for readability
  const wrapFasta = (name: string, seq: string, lineLen = 60) => {
    const lines: string[] = [`>${name}`];
    for (let i = 0; i < seq.length; i += lineLen) lines.push(seq.substring(i, i + lineLen));
    return lines.join('\n');
  };
  const msaAlignment = [wrapFasta(`ref_${geneName}`, refSeq), wrapFasta(`${geneName}_mutated`, mutSeq)].join('\n');

  const mhciMutRows = generateMockMHCIRows(false);
  const mhciCanonRows = generateCanonicalRows(mhciMutRows, MOCK_MHCI_COLUMNS);
  const mhciiMutRows = generateMockMHCIIRows();
  const mhciiCanonRows = generateCanonicalRows(mhciiMutRows, MOCK_MHCII_COLUMNS);

  return {
    stats: {
      totalRawRows: 48293,
      totalMissense: 3847,
      uniquePositions: 2156,
      hotspotCount: 12,
      totalSamples: 1227,
    },
    topMutations: [
      { Position: 1047, Ref_AA: 'E', Alt_AA: 'K', Patient_Count: 892, MAF: 0.0312, is_hotspot: true },
      { Position: 545, Ref_AA: 'E', Alt_AA: 'K', Patient_Count: 654, MAF: 0.0228, is_hotspot: true },
      { Position: 1043, Ref_AA: 'E', Alt_AA: 'K', Patient_Count: 543, MAF: 0.0189, is_hotspot: true },
      { Position: 1047, Ref_AA: 'E', Alt_AA: 'V', Patient_Count: 321, MAF: 0.0112, is_hotspot: false },
      { Position: 542, Ref_AA: 'E', Alt_AA: 'K', Patient_Count: 298, MAF: 0.0104, is_hotspot: true },
      { Position: 887, Ref_AA: 'H', Alt_AA: 'Y', Patient_Count: 267, MAF: 0.0093, is_hotspot: false },
      { Position: 1047, Ref_AA: 'E', Alt_AA: 'D', Patient_Count: 234, MAF: 0.0082, is_hotspot: false },
      { Position: 345, Ref_AA: 'E', Alt_AA: 'K', Patient_Count: 198, MAF: 0.0069, is_hotspot: true },
      { Position: 545, Ref_AA: 'E', Alt_AA: 'Q', Patient_Count: 176, MAF: 0.0061, is_hotspot: false },
      { Position: 102, Ref_AA: 'H', Alt_AA: 'R', Patient_Count: 154, MAF: 0.0054, is_hotspot: false },
      { Position: 1108, Ref_AA: 'E', Alt_AA: 'K', Patient_Count: 143, MAF: 0.0050, is_hotspot: true },
      { Position: 118, Ref_AA: 'R', Alt_AA: 'H', Patient_Count: 132, MAF: 0.0046, is_hotspot: false },
      { Position: 1043, Ref_AA: 'E', Alt_AA: 'D', Patient_Count: 121, MAF: 0.0042, is_hotspot: false },
      { Position: 542, Ref_AA: 'E', Alt_AA: 'V', Patient_Count: 109, MAF: 0.0038, is_hotspot: false },
      { Position: 887, Ref_AA: 'H', Alt_AA: 'R', Patient_Count: 98, MAF: 0.0034, is_hotspot: false },
      { Position: 545, Ref_AA: 'E', Alt_AA: 'D', Patient_Count: 87, MAF: 0.0030, is_hotspot: false },
      { Position: 345, Ref_AA: 'E', Alt_AA: 'Q', Patient_Count: 76, MAF: 0.0026, is_hotspot: false },
      { Position: 1047, Ref_AA: 'E', Alt_AA: 'G', Patient_Count: 65, MAF: 0.0023, is_hotspot: false },
      { Position: 1108, Ref_AA: 'E', Alt_AA: 'Q', Patient_Count: 54, MAF: 0.0019, is_hotspot: false },
      { Position: 102, Ref_AA: 'H', Alt_AA: 'Y', Patient_Count: 43, MAF: 0.0015, is_hotspot: false },
    ],
    refSeq,
    mutSeq,
    msaAlignment,
    msaLength: msaLen,
    mhciCanon: {
      success: true,
      columns: MOCK_MHCI_COLUMNS,
      rows: mhciCanonRows,
    },
    mhciMut: {
      success: true,
      columns: MOCK_MHCI_COLUMNS,
      rows: mhciMutRows,
    },
    mhciiCanon: {
      success: true,
      columns: MOCK_MHCII_COLUMNS,
      rows: mhciiCanonRows,
    },
    mhciiMut: {
      success: true,
      columns: MOCK_MHCII_COLUMNS,
      rows: mhciiMutRows,
    },
  };
}
