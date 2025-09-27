import React, { useState, useCallback, useEffect, useRef } from 'react';
import { RequirementDetail, ComplianceResult, Status } from './types';
import { extractEntities, verifyRequirements } from './services/geminiService';
import FileUploadCard from './components/FileUploadCard';
import ResultsDisplay from './components/ResultsDisplay';
import Spinner from './components/Spinner';
import Header from './components/Header';
import PdfViewer from './components/PdfViewer';
import AnalyticsDashboard from './components/AnalyticsDashboard'; // <-- ИМПОРТ

type AppStep = 'EXTRACT' | 'VERIFY' | 'DONE';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(() => (localStorage.getItem('appStep') as AppStep) || 'EXTRACT');
  const [analysisResults, setAnalysisResults] = useState<(RequirementDetail | ComplianceResult)[] | null>(
    () => JSON.parse(localStorage.getItem('analysisResults') || 'null')
  );
  
  const [requirementsFile, setRequirementsFile] = useState<File | null>(null);
  const [verificationFile, setVerificationFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [extractionLimit, setExtractionLimit] = useState<number | undefined>();
  const [pdfPage, setPdfPage] = useState<number | null>(null);
  const [headers, setHeaders] = useState<Record<keyof ComplianceResult, string>>({
    id: "ID",
    parameter: "Параметр",
    requirement: "Требование",
    source: "Источник",
    notes: "Примечания",
    actualValue: "Факт. значение",
    status: "Статус",
    explanation: "Пояснение ИИ",
    pageNumber: "Стр."
  });

  // --- НОВОЕ: Логика таймера ---
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isLoading) {
      setTimer(0);
      timerRef.current = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isLoading]);
  // --- КОНЕЦ ЛОГИКИ ТАЙМЕРА ---

  useEffect(() => {
    localStorage.setItem('appStep', step);
    if (analysisResults) {
      localStorage.setItem('analysisResults', JSON.stringify(analysisResults));
    } else {
      localStorage.removeItem('analysisResults');
    }
  }, [step, analysisResults]);

  const handleExtraction = useCallback(async () => {
    if (!requirementsFile) {
      setError('Пожалуйста, загрузите документ с требованиями.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setAnalysisResults(null);
    try {
      const results = await extractEntities(requirementsFile, extractionLimit);
      if (results && results.length > 0) {
        setAnalysisResults(results);
        setStep('VERIFY');
      } else {
        setError('Не удалось извлечь требования из документа.');
      }
    } catch (err: any) {
      setError((err as Error).message || 'Произошла ошибка при извлечении.');
    } finally {
      setIsLoading(false);
    }
  }, [requirementsFile, extractionLimit]);

  const handleVerification = useCallback(async () => {
    if (!verificationFile || !analysisResults) {
      setError('Загрузите документ для верификации.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const results = await verifyRequirements(verificationFile, analysisResults as RequirementDetail[]);
      if (results && results.length > 0) {
        setAnalysisResults(results);
        setStep('DONE');
      } else {
        setError('Верификация завершена, но совпадений не найдено.');
      }
    } catch (err: any) {
      setError((err as Error).message || 'Произошла ошибка во время верификации.');
    } finally {
      setIsLoading(false);
    }
  }, [verificationFile, analysisResults]);
    
  const handleStartOver = useCallback(() => {
    setStep('EXTRACT');
    setAnalysisResults(null);
    setRequirementsFile(null);
    setVerificationFile(null);
    setError(null);
    setPdfPage(null);
    localStorage.removeItem('appStep');
    localStorage.removeItem('analysisResults');
  }, []);

  // ... (остальные хендлеры остаются без изменений) ...
  const handleResultUpdate = useCallback((index: number, field: keyof ComplianceResult, value: string) => {
    setAnalysisResults(prevResults => {
      if (!prevResults) return null;
      const newResults = [...prevResults];
      (newResults[index] as any)[field] = value;
      return newResults;
    });
  }, []);

  const handleHeaderUpdate = useCallback((field: keyof ComplianceResult, value: string) => {
    setHeaders(prevHeaders => ({ ...prevHeaders, [field]: value }));
  }, []);

  const handleDeleteResult = useCallback((idToDelete: number) => {
    setAnalysisResults(prevResults => (prevResults || []).filter(result => result.id !== idToDelete));
  }, []);

  const handleAddRow = useCallback(() => {
    setAnalysisResults(prevResults => {
      const results = prevResults || [];
      const newId = results.length > 0 ? Math.max(...results.map(r => r.id)) + 1 : 1;
      const newRow = step === 'DONE'
        ? { id: newId, parameter: '', requirement: '', source: '', notes: '', actualValue: '', status: Status.NOT_FOUND, explanation: '', pageNumber: 0 }
        : { id: newId, parameter: '', requirement: '', source: '', notes: '' };
      return [...results, newRow];
    });
  }, [step]);
    
  const handleExport = useCallback(() => {
     if (!analysisResults) return;

    const escapeCsv = (str: string | number) => {
        const text = String(str);
        if (text.includes(',') || text.includes('"') || text.includes('\n')) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    };
      
    const headerKeys = Object.keys(headers).filter(k => k !== 'pageNumber') as (keyof ComplianceResult)[];
    const headerRow = headerKeys.map(key => escapeCsv(headers[key])).join(',');
    
    const dataRows = analysisResults.map(row => {
        return headerKeys.map(key => {
            if (key in row) {
                return escapeCsv(row[key as keyof typeof row]);
            }
            return '';
        }).join(',');
    }).join('\n');

    const csvContent = `\uFEFF${headerRow}\n${dataRows}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'verification_results.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [analysisResults, headers]);
    
  const handleGoToPage = useCallback((page: number) => {
      setPdfPage(page);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 font-sans">
      <main className="container mx-auto px-4 py-8">
        <Header />
        
        <div className="max-w-7xl mx-auto mt-8">
           <div className={`grid grid-cols-1 ${step !== 'EXTRACT' ? 'md:grid-cols-2' : ''} gap-8 mb-8`}>
            <FileUploadCard
              id="req-upload"
              title="Шаг 1: Документ с требованиями"
              description="Загрузите PDF или изображение с ТЗ."
              file={requirementsFile}
              onFileSelect={setRequirementsFile}
            />
            {step !== 'EXTRACT' && (
              <FileUploadCard
                id="ver-upload"
                title="Шаг 2: Техническая документация"
                description="Загрузите PDF для проверки."
                file={verificationFile}
                onFileSelect={(file) => { setVerificationFile(file); setPdfPage(1); }}
                accept="application/pdf"
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
             {step === 'EXTRACT' && (
                <>
                    <div className="flex items-center gap-3">
                        <label htmlFor="limit-input" className="text-slate-400 text-sm flex-shrink-0">Лимит строк:</label>
                        <input
                            id="limit-input"
                            type="number"
                            min="1"
                            value={extractionLimit || ''}
                            onChange={(e) => setExtractionLimit(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                            placeholder="Все"
                            className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg focus:ring-sky-500 focus:border-sky-500 w-24 p-2.5"
                        />
                    </div>
                    <button
                        onClick={handleExtraction}
                        disabled={!requirementsFile || isLoading}
                        className="bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold py-3 px-12 rounded-lg transition-all duration-300 shadow-lg shadow-sky-900/50 transform hover:scale-105 w-full sm:w-auto"
                    >
                        {isLoading ? 'Извлечение...' : 'Извлечь требования'}
                    </button>
                </>
             )}
             {step === 'VERIFY' && (
                 <button
                    onClick={handleVerification}
                    disabled={!verificationFile || isLoading}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold py-3 px-12 rounded-lg transition-all duration-300 shadow-lg shadow-emerald-900/50 transform hover:scale-105"
                >
                    {isLoading ? 'Верификация...' : 'Проверить соответствие'}
                </button>
             )}
             {step === 'DONE' && (
                <button
                    onClick={handleExport}
                    disabled={!analysisResults || analysisResults.length === 0}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold py-3 px-12 rounded-lg transition-all duration-300 shadow-lg shadow-indigo-900/50 transform hover:scale-105"
                >
                    Экспорт в CSV
                </button>
             )}
             {step !== 'EXTRACT' && (
                <button
                    onClick={handleStartOver}
                    className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-3 px-12 rounded-lg transition-all"
                >
                    Начать заново
                </button>
             )}
          </div>

          {error && (
            <div className="mt-8 bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-center">
              <span className="font-bold">Ошибка:</span> {error}
            </div>
          )}

          {isLoading && <Spinner mode={step === 'EXTRACT' ? 'extraction' : 'verification'} timer={timer} />}

          {/* --- НОВОЕ: Отображение дашборда с метриками --- */}
          {step === 'DONE' && analysisResults && (
             <AnalyticsDashboard results={analysisResults as ComplianceResult[]} />
          )}
          
          <div className={`mt-8 grid ${verificationFile && (step === 'VERIFY' || step === 'DONE') ? 'grid-cols-1 lg:grid-cols-2 gap-8' : 'grid-cols-1'}`}>
            <div className="lg:col-span-1">
              {analysisResults && analysisResults.length > 0 && (
                <ResultsDisplay
                  results={analysisResults}
                  headers={headers}
                  isVerified={step === 'DONE' || (step === 'VERIFY' && analysisResults.length > 0 && 'status' in analysisResults[0])}
                  onUpdate={handleResultUpdate}
                  onHeaderUpdate={handleHeaderUpdate}
                  onDelete={handleDeleteResult}
                  onAddRow={handleAddRow}
                  onGoToPage={handleGoToPage}
                />
              )}
            </div>
            {verificationFile && (step === 'VERIFY' || step === 'DONE') && (
              <div className="lg:col-span-1">
                <PdfViewer file={verificationFile} page={pdfPage} />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;