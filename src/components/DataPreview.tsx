'use client';

interface DataPreviewProps {
  title: string;
  columns?: string[];
  rows?: string[][];
  csvText?: string;
  maxRows?: number;
}

export function DataPreview({ title, columns, rows, csvText, maxRows = 5 }: DataPreviewProps) {
  let cols = columns || [];
  let data = rows || [];

  // Parse CSV if no columns/rows provided
  if (csvText && cols.length === 0) {
    const lines = csvText.split('\n').filter((l) => l.trim());
    if (lines.length > 0) {
      cols = lines[0].split(',');
      data = lines.slice(1, maxRows + 1).map((l) => l.split(','));
    }
  } else if (data.length > 0 && cols.length === 0) {
    // If rows have data but no columns, can't display
    return null;
  }

  const previewData = data.slice(0, maxRows);
  const totalRows = csvText
    ? csvText.split('\n').filter((l) => l.trim()).length - 1
    : rows?.length || 0;

  if (cols.length === 0 || previewData.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-gray-700/50 bg-gray-800/30">
      <div className="flex items-center justify-between border-b border-gray-700/50 px-4 py-2">
        <span className="text-xs font-medium text-gray-400">{title}</span>
        <span className="text-xs text-gray-500">
          Showing {previewData.length} of {totalRows} rows
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-700/30">
              {cols.map((col) => (
                <th key={col} className="px-3 py-1.5 text-left font-medium text-gray-400 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewData.map((row, i) => (
              <tr key={i} className="border-b border-gray-800/30 hover:bg-gray-700/20">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-1 text-gray-300 whitespace-nowrap max-w-[200px] truncate">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface FastaPreviewProps {
  title: string;
  fasta: string;
  maxLines?: number;
}

export function FastaPreview({ title, fasta, maxLines = 6 }: FastaPreviewProps) {
  if (!fasta) return null;

  const lines = fasta.split('\n');
  const preview = lines.slice(0, maxLines);
  const totalLines = lines.length;

  return (
    <div className="mt-3 rounded-lg border border-gray-700/50 bg-gray-800/30">
      <div className="flex items-center justify-between border-b border-gray-700/50 px-4 py-2">
        <span className="text-xs font-medium text-gray-400">{title}</span>
        <span className="text-xs text-gray-500">
          {totalLines} lines
        </span>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs text-gray-300">
        {preview.map((line, i) => (
          <div key={i} className={line.startsWith('>') ? 'text-emerald-400 font-bold' : ''}>
            {line.length > 100 ? line.slice(0, 100) + '...' : line}
          </div>
        ))}
        {totalLines > maxLines && (
          <div className="text-gray-500">... ({totalLines - maxLines} more lines)</div>
        )}
      </pre>
    </div>
  );
}
