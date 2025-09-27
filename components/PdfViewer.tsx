import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
// --- ИЗМЕНЕНИЕ: Исправлены пути для CSS-файлов ---
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Worker for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  file: File;
  page: number | null;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ file, page }) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    if (page && page > 0 && page <= (numPages || 0)) {
      setCurrentPage(page);
    }
  }, [page, numPages]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1);
  };

  const goToPrevPage = () => setCurrentPage(prev => (prev > 1 ? prev - 1 : 1));
  const goToNextPage = () => setCurrentPage(prev => (numPages ? (prev < numPages ? prev + 1 : numPages) : 1));

  return (
    <div className="mt-8 border border-slate-700 rounded-lg bg-slate-800/50 shadow-lg">
      <div className="p-4 bg-slate-800 flex justify-between items-center border-b border-slate-700">
        <h3 className="text-lg font-semibold text-slate-200 truncate pr-4" title={file.name}>
          {file.name}
        </h3>
        {numPages && (
          <div className="flex items-center gap-4">
            <button onClick={goToPrevPage} disabled={currentPage <= 1} className="px-3 py-1 bg-slate-700 rounded-md disabled:opacity-50 hover:bg-slate-600 transition-colors">&lt;</button>
            <span className="text-slate-400 text-sm">
              Стр. {currentPage} из {numPages}
            </span>
            <button onClick={goToNextPage} disabled={currentPage >= numPages} className="px-3 py-1 bg-slate-700 rounded-md disabled:opacity-50 hover:bg-slate-600 transition-colors">&gt;</button>
          </div>
        )}
      </div>
      <div className="max-h-[70vh] overflow-auto flex justify-center p-4">
        <Document
          file={file}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div className="text-slate-400">Загрузка документа...</div>}
          error={<div className="text-red-400">Ошибка при загрузке PDF.</div>}
        >
          <Page pageNumber={currentPage} />
        </Document>
      </div>
    </div>
  );
};

export default PdfViewer;