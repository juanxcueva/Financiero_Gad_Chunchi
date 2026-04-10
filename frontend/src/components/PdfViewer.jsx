import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineXMark, HiOutlineArrowDownTray } from 'react-icons/hi2';

export default function PdfViewer({ pdfUrl, numeroOrden, onClose }) {
  const [loading, setLoading] = useState(true);
  const [showFallback, setShowFallback] = useState(false);
  const [viewerProgress, setViewerProgress] = useState(8);

  useEffect(() => {
    setLoading(true);
    setShowFallback(false);
    setViewerProgress(8);

    // Simulated progress while the browser renders the embedded PDF.
    const progressTimer = setInterval(() => {
      setViewerProgress((prev) => {
        if (prev >= 95) return prev;
        if (prev < 60) return prev + 7;
        if (prev < 85) return prev + 3;
        return prev + 1;
      });
    }, 180);

    // If the browser PDF plugin does not render quickly, show fallback actions.
    const timer = setTimeout(() => {
      setShowFallback(true);
    }, 2500);

    return () => {
      clearTimeout(timer);
      clearInterval(progressTimer);
    };
  }, [pdfUrl]);

  const getViewerStage = (percent) => {
    if (percent >= 100) return 'Documento listo';
    if (percent >= 75) return 'Renderizando vista';
    if (percent >= 35) return 'Procesando archivo';
    return 'Preparando visor';
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `comprobante_${numeroOrden}.pdf`;
    link.setAttribute('type', 'application/pdf');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenInTab = () => {
    window.open(pdfUrl, '_blank');
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="w-11/12 h-5/6 max-w-5xl glass neon-border rounded-3xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200/20 dark:border-white/10">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Comprobante N° {numeroOrden}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Visor de PDF - Descarga disponible
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleOpenInTab}
                title="Abrir en una nueva pestaña"
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <HiOutlineArrowDownTray className="w-4 h-4" />
                Abrir pestaña
              </button>
              <button
                onClick={handleDownload}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <HiOutlineArrowDownTray className="w-4 h-4" />
                Descargar
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
              >
                <HiOutlineXMark className="w-6 h-6 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
          </div>

          {/* PDF Viewer */}
          <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-dark-900 relative">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100/90 dark:bg-dark-900/90">
                <div className="text-center w-[320px] max-w-[85vw] rounded-2xl border border-cyan-300/30 dark:border-cyan-400/20 bg-white/85 dark:bg-dark-800/80 px-4 py-4 shadow-lg">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-cyan-400 border-t-transparent" />
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Cargando PDF...</p>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-gray-200/80 dark:bg-white/10 overflow-hidden relative">
                    <motion.div
                      className="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${viewerProgress}%` }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                    />
                    <motion.div
                      className="absolute top-0 bottom-0 w-10 bg-white/35 blur-[2px]"
                      initial={{ x: -50 }}
                      animate={{ x: 320 }}
                      transition={{ duration: 1.05, repeat: Infinity, ease: 'linear' }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">{getViewerStage(viewerProgress)}</span>
                    <span className="font-semibold text-cyan-500">{viewerProgress}%</span>
                  </div>
                </div>
              </div>
            )}

            <iframe
              src={`${pdfUrl}#toolbar=1&navpanes=0&view=FitH`}
              title={`Comprobante ${numeroOrden}`}
              className="w-full h-full border-0"
              onLoad={() => {
                setViewerProgress(100);
                setShowFallback(false);
                setTimeout(() => setLoading(false), 180);
              }}
            />

            {showFallback && loading && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-lg bg-white/95 dark:bg-dark-700 border border-gray-300 dark:border-white/10 text-sm text-gray-700 dark:text-gray-300 shadow-lg">
                Si no aparece el PDF, usa "Abrir pestaña" o "Descargar".
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
