import { useState } from 'react';
import { FileText, Download, Eye } from 'lucide-react';
import jsPDF from 'jspdf';
import { previewPDF, downloadPDF } from '@/lib/pdf';

interface PdfButtonsProps {
  label?: string;
  buildDoc: () => Promise<jsPDF>;
  filename: string;
  compact?: boolean;
}

export const PdfButtons = ({ label = 'PDF', buildDoc, filename, compact = false }: PdfButtonsProps) => {
  const [loading, setLoading] = useState<'preview' | 'download' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (mode: 'preview' | 'download') => {
    setError(null);
    setLoading(mode);
    try {
      const doc = await buildDoc();
      if (mode === 'preview') previewPDF(doc);
      else downloadPDF(doc, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF generation failed');
    } finally {
      setLoading(null);
    }
  };

  if (compact) {
    return (
      <div className="flex flex-col gap-1.5">
        {error && <p className="text-xs text-red-600 px-1">{error}</p>}
        <div className="flex gap-2">
          <button onClick={() => run('preview')} disabled={!!loading}
            className="flex items-center gap-1.5 bg-white border border-slate-300 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-slate-50 disabled:opacity-60 transition">
            <Eye className="w-4 h-4" />
            {loading === 'preview' ? 'Opening…' : 'Preview'}
          </button>
          <button onClick={() => run('download')} disabled={!!loading}
            className="flex items-center gap-1.5 bg-sky-700 hover:bg-sky-800 text-white text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-60 transition">
            <Download className="w-4 h-4" />
            {loading === 'download' ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
        <FileText className="w-4 h-4 text-sky-600" />
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Export {label}</h3>
      </div>
      {error && <p className="px-4 pt-3 text-sm text-red-600">{error}</p>}
      <div className="p-4 flex gap-2.5">
        <button onClick={() => run('preview')} disabled={!!loading}
          className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 font-semibold py-3 rounded-xl hover:bg-slate-50 disabled:opacity-60 transition">
          <Eye className="w-5 h-5 text-sky-600" />
          {loading === 'preview' ? 'Opening…' : 'Preview PDF'}
        </button>
        <button onClick={() => run('download')} disabled={!!loading}
          className="flex-1 flex items-center justify-center gap-2 bg-sky-700 hover:bg-sky-800 text-white font-semibold py-3 rounded-xl disabled:opacity-60 transition">
          <Download className="w-5 h-5" />
          {loading === 'download' ? 'Generating…' : 'Download PDF'}
        </button>
      </div>
      <p className="px-4 pb-3 text-xs text-slate-400 text-center">{filename}</p>
    </div>
  );
};
