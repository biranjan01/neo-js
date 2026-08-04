import { NextRequest, NextResponse } from 'next/server';

const CBIO_STUDIES: Record<string, string[]> = {
  breast: ['brca_tcga_pan_can_atlas_2018', 'brca_metabric2012'],
  lung: ['luad_tcga_pan_can_atlas_2018', 'lusc_tcga_pan_can_atlas_2018'],
  colon: ['coadread_tcga_pan_can_atlas_2018'],
  rectal: ['coadread_tcga_pan_can_atlas_2018'],
  prostate: ['prad_tcga_pan_can_atlas_2018'],
  ovarian: ['ov_tcga_pan_can_atlas_2018'],
  glioblastoma: ['gbm_tcga_pan_can_atlas_2018'],
  'head and neck': ['hnsc_tcga_pan_can_atlas_2018'],
  thyroid: ['thca_tcga_pan_can_atlas_2018'],
  kidney: ['kirp_tcga_pan_can_atlas_2018', 'kich_tcga_pan_can_atlas_2018', 'kirc_tcga_pan_can_atlas_2018'],
  endometrial: ['ucec_tcga_pan_can_atlas_2018'],
  brain: ['lgg_tcga_pan_can_atlas_2018', 'gbm_tcga_pan_can_atlas_2018'],
  pancreas: ['paad_tcga_pan_can_atlas_2018'],
  melanoma: ['skcm_tcga_pan_can_atlas_2018'],
  liver: ['lihc_tcga_pan_can_atlas_2018'],
  stomach: ['stad_tcga_pan_can_atlas_2018'],
  bladder: ['blca_tcga_pan_can_atlas_2018'],
  esophageal: ['esca_tcga_pan_can_atlas_2018'],
  sarcoma: ['sarc_tcga_pan_can_atlas_2018'],
  adrenal: ['acc_tcga_pan_can_atlas_2018'],
  uterine: ['ucs_tcga_pan_can_atlas_2018', 'ucec_tcga_pan_can_atlas_2018'],
  cervical: ['cesc_tcga_pan_can_atlas_2018'],
  mesothelioma: ['meso_tcga_pan_can_atlas_2018'],
  pheochromocytoma: ['pcpg_tcga_pan_can_atlas_2018'],
  lymphoma: ['dlbc_tcga_pan_can_atlas_2018'],
  testicular: ['tgct_tcga_pan_can_atlas_2018'],
  cholangiocarcinoma: ['chol_tcga_pan_can_atlas_2018'],
  'uveal melanoma': ['uvm_tcga_pan_can_atlas_2018'],
};

const GENE_IDS: Record<string, number> = {
  TP53: 7157, PIK3CA: 5290, KRAS: 3845, BRAF: 673,
  EGFR: 1956, PTEN: 5728, APC: 324, RB1: 5925,
  CDH1: 999, BCL2: 596, MYC: 4609, ERBB2: 2064,
  FBXW7: 7979, CDKN2A: 1029, ARID1A: 8286, ATM: 472,
  BRCA1: 672, BRCA2: 675, IDH1: 3417, IDH2: 3418,
  ALK: 238, ROS1: 6098, RET: 5979, NRAS: 4893,
  HRAS: 3265, MAP2K1: 5604, MAP2K2: 5605, NF1: 4763,
  NF2: 4771, VHL: 7428, SMAD4: 4089, STK11: 6794,
  CTNNB1: 1499, NOTCH1: 4851, FGFR3: 2261, FGFR2: 2263,
  AKT1: 207, MTOR: 2475, TSC1: 7248, TSC2: 7249,
  JAK2: 3717, ABL1: 25, FLT3: 2322, KIT: 3815,
  PDGFRA: 5156, MET: 4233, ERBB3: 2065, ERBB4: 2066,
  DDR2: 4921, MAPK1: 5594, MAPK3: 5595,
  MAX: 4149, SMARCB1: 6598, SMARCA4: 6597, ARID1B: 57492,
  SETD2: 29072, KMT2A: 4297, KMT2D: 79812, NSD1: 64324,
};

export async function POST(req: NextRequest) {
  try {
    const { gene, cancer_type } = await req.json();

    const entrez = GENE_IDS[gene?.toUpperCase()];
    if (!entrez) {
      return NextResponse.json({ error: `Gene ${gene} not in database` }, { status: 400 });
    }

    let studies = CBIO_STUDIES[cancer_type?.toLowerCase()];
    if (!studies) {
      for (const [key, vals] of Object.entries(CBIO_STUDIES)) {
        if (cancer_type?.toLowerCase().includes(key) || key.includes(cancer_type?.toLowerCase() || '')) {
          studies = vals;
          break;
        }
      }
    }
    if (!studies) {
      return NextResponse.json({ error: `Cancer type '${cancer_type}' not found` }, { status: 400 });
    }

    const body = {
      molecularProfileIds: studies.map(s => `${s}_mutations`),
      entrezGeneIds: [entrez],
    };

    const r = await fetch('https://www.cbioportal.org/api/mutations/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (!r.ok) throw new Error(`cBioPortal API error: ${r.status}`);
    const data = await r.json();

    if (!data || data.length === 0) {
      return NextResponse.json({ error: `No mutations found for ${gene} in ${cancer_type}` }, { status: 404 });
    }

    const rows: { 'Gene Name': string; 'Sample Name': string; 'CDS Mutation': string; 'AA Mutation': string }[] = [];
    const seen = new Set<string>();

    for (const m of data) {
      const sample = m.sampleId || '';
      const pc = m.proteinChange || '';
      const aa = pc && !pc.startsWith('p.') ? `p.${pc}` : pc;
      const key = `${sample}|${aa}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push({ 'Gene Name': gene.toUpperCase(), 'Sample Name': sample, 'CDS Mutation': '', 'AA Mutation': aa });
      }
    }

    const header = 'Gene Name,Sample Name,CDS Mutation,AA Mutation';
    const csvRows = rows.map(r => `${r['Gene Name']},${r['Sample Name']},${r['CDS Mutation']},${r['AA Mutation']}`);
    const csv = [header, ...csvRows].join('\n');

    return NextResponse.json({
      csv,
      total: rows.length,
      samples: new Set(rows.map(r => r['Sample Name'])).size,
      source: 'cBioPortal',
      gene: gene.toUpperCase(),
      cancer_type,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'cBioPortal query failed' }, { status: 500 });
  }
}
