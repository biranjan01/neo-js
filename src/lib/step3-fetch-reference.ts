// Step 3: Fetch reference protein sequence from UniProt/Ensembl/NCBI

export interface Step3Result {
  success: boolean;
  sequence: string;
  accession: string;
  source: string;
  length: number;
  error?: string;
}

function parseFasta(text: string): string {
  return text
    .split('\n')
    .filter((l) => !l.startsWith('>'))
    .join('')
    .replace(/\s/g, '');
}

async function fetchUniProt(geneName: string): Promise<Step3Result | null> {
  try {
    const url = `https://rest.uniprot.org/uniprotkb/search?query=gene:${geneName}+AND+organism_id:9606+AND+reviewed:true&format=json&size=1`;
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) return null;

    const data = await r.json();
    const results = data.results || [];
    if (results.length === 0) return null;

    const seq = results[0]?.sequence?.value || '';
    const acc = results[0]?.primaryAccession || '';
    if (!seq) return null;

    return {
      success: true,
      sequence: seq,
      accession: acc,
      source: 'UniProt',
      length: seq.length,
    };
  } catch {
    return null;
  }
}

async function fetchEnsembl(geneName: string): Promise<Step3Result | null> {
  try {
    // Step 1: Gene symbol → transcript ID
    const lookupUrl = `https://rest.ensembl.org/lookup/symbol/homo_sapiens/${geneName}`;
    const lookupR = await fetch(lookupUrl, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    if (!lookupR.ok) return null;

    const lookupData = await lookupR.json();
    let transcriptId = '';

    if (typeof lookupData.canonical_transcript === 'string') {
      transcriptId = lookupData.canonical_transcript;
    } else if (lookupData.canonical_transcript?.id) {
      transcriptId = lookupData.canonical_transcript.id;
    } else if (lookupData.Transcript) {
      for (const t of lookupData.Transcript) {
        if (t.biotype === 'protein_coding') {
          transcriptId = t.id;
          if (t.is_canonical) break;
        }
      }
    }

    if (!transcriptId) return null;
    transcriptId = transcriptId.split('.')[0];

    // Step 2: Transcript → protein ID
    const txUrl = `https://rest.ensembl.org/lookup/id/${transcriptId}?expand=1`;
    const txR = await fetch(txUrl, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    if (!txR.ok) return null;

    const txData = await txR.json();
    const proteinId = txData.Translation?.id;
    if (!proteinId) return null;

    // Step 3: Protein ID → sequence
    const seqUrl = `https://rest.ensembl.org/sequence/id/${proteinId}?type=protein`;
    const seqR = await fetch(seqUrl, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    if (!seqR.ok) return null;

    const seqData = await seqR.json();
    const seq = seqData.seq;
    if (!seq) return null;

    return {
      success: true,
      sequence: seq,
      accession: proteinId,
      source: 'Ensembl',
      length: seq.length,
    };
  } catch {
    return null;
  }
}

async function fetchNCBI(geneName: string): Promise<Step3Result | null> {
  try {
    // Search for protein
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=protein&term=${geneName}[Gene]+AND+human[Organism]+AND+refseq[Filter]&retmax=1&retmode=json`;
    const searchR = await fetch(searchUrl, { signal: AbortSignal.timeout(30000) });
    if (!searchR.ok) return null;

    const searchData = await searchR.json();
    const ids = searchData.esearchresult?.idlist || [];
    if (ids.length === 0) return null;

    // Fetch FASTA
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=protein&id=${ids[0]}&rettype=fasta&retmode=text`;
    const fetchR = await fetch(fetchUrl, { signal: AbortSignal.timeout(30000) });
    if (!fetchR.ok) return null;

    const fastaText = await fetchR.text();
    const seq = parseFasta(fastaText);
    if (!seq || seq.length < 20) return null;

    const header = fastaText.split('\n')[0] || `ref_${geneName}`;

    return {
      success: true,
      sequence: seq,
      accession: header,
      source: 'NCBI',
      length: seq.length,
    };
  } catch {
    return null;
  }
}

/**
 * Step 3: Fetch reference protein sequence
 * Tries UniProt → Ensembl → NCBI in order
 */
export async function step3FetchReference(geneName: string): Promise<Step3Result> {
  console.log(`Fetching reference sequence for ${geneName}...`);

  // Try UniProt first
  console.log('  Trying UniProt...');
  const uniprot = await fetchUniProt(geneName);
  if (uniprot) {
    console.log(`  OK: ${uniprot.length} aa from UniProt (${uniprot.accession})`);
    return uniprot;
  }

  // Try Ensembl
  console.log('  Trying Ensembl...');
  const ensembl = await fetchEnsembl(geneName);
  if (ensembl) {
    console.log(`  OK: ${ensembl.length} aa from Ensembl (${ensembl.accession})`);
    return ensembl;
  }

  // Try NCBI
  console.log('  Trying NCBI...');
  const ncbi = await fetchNCBI(geneName);
  if (ncbi) {
    console.log(`  OK: ${ncbi.length} aa from NCBI (${ncbi.accession})`);
    return ncbi;
  }

  return {
    success: false,
    sequence: '',
    accession: '',
    source: '',
    length: 0,
    error: `Could not fetch reference for ${geneName} from any source`,
  };
}

/**
 * Generate mutated sequence by applying the highest-frequency mutation
 * at each position. Ref_AA is corrected to match the actual wild-type
 * so compound mutations (e.g., R43H when wild-type is L) are treated
 * as L→H. Stop codons (Alt_AA = '*') are excluded.
 */
export function generateMutatedSequence(
  reference: string,
  mutations: { Position: number; Ref_AA: string; Alt_AA: string; Patient_Count?: number }[]
): string {
  const seq = reference.split('');

  // Group by position, pick highest frequency Alt_AA (skip stop codons)
  const bestAltAtPos = new Map<number, { Alt_AA: string; count: number }>();

  for (const mut of mutations) {
    const pos = mut.Position - 1; // 0-indexed
    if (pos < 0 || pos >= seq.length) continue;
    if (mut.Alt_AA === '*') continue; // skip stop codons
    const count = mut.Patient_Count ?? 1;
    const existing = bestAltAtPos.get(pos);
    if (!existing || count > existing.count) {
      bestAltAtPos.set(pos, { Alt_AA: mut.Alt_AA, count });
    }
  }

  let applied = 0;
  for (const [pos, mut] of bestAltAtPos) {
    if (seq[pos] !== mut.Alt_AA) {
      seq[pos] = mut.Alt_AA;
      applied++;
    }
  }

  console.log(`  Applied ${applied} mutations to ${seq.length} aa reference`);
  return seq.join('');
}

/**
 * Create FASTA string
 */
export function toFASTA(header: string, sequence: string): string {
  // Wrap lines at 80 characters
  const lines: string[] = [`>${header}`];
  for (let i = 0; i < sequence.length; i += 80) {
    lines.push(sequence.slice(i, i + 80));
  }
  return lines.join('\n');
}
