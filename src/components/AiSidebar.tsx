import React, { useState } from 'react';
import { generateShapesFromPrompt, explainDrawing } from '../services/geminiService';
import { Shape } from '../types';

interface AiSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onAddShapes: (shapes: Partial<Shape>[]) => void;
  currentShapes: Shape[];
}

const AiSidebar: React.FC<AiSidebarProps> = ({ isOpen, onClose, onAddShapes, currentShapes }) => {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    try {
      const shapes = await generateShapesFromPrompt(prompt);
      onAddShapes(shapes);
      setPrompt('');
    } catch (error) {
      alert("Failed to generate shapes. Check API configuration.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyze = async () => {
    setIsLoading(true);
    try {
       const text = await explainDrawing(currentShapes);
       setAnalysis(text);
    } catch(e) {
        setAnalysis("Error.");
    } finally {
        setIsLoading(false);
    }
  }

  return (
    <div className="absolute right-4 top-4 bottom-4 w-80 bg-white rounded-2xl shadow-xl border border-gray-200 flex flex-col z-50 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-indigo-50">
        <h3 className="font-semibold text-indigo-900 flex items-center gap-2">
          <span className="text-xl">✨</span> Gemini Design
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <div className="mb-6">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Generative Canvas
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want to draw (e.g., 'A simple house with a sun')"
            className="w-full p-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none resize-none h-24"
          />
          <button
            onClick={handleGenerate}
            disabled={isLoading || !prompt}
            className="mt-2 w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex justify-center items-center gap-2"
          >
            {isLoading ? (
               <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Thinking...</>
            ) : (
               "Generate Shapes"
            )}
          </button>
        </div>

        <div className="border-t border-gray-100 pt-6">
           <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Canvas Intelligence
          </label>
          <p className="text-xs text-gray-400 mb-3">Ask Gemini to analyze the current drawing context.</p>
           <button
            onClick={handleAnalyze}
            disabled={isLoading}
            className="w-full bg-white border border-indigo-200 text-indigo-700 py-2 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-colors"
          >
            Explain Drawing
          </button>
          {analysis && (
              <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-100 text-sm text-green-800 animate-fade-in">
                  {analysis}
              </div>
          )}
        </div>
      </div>

      <div className="p-3 bg-gray-50 text-xs text-center text-gray-400 border-t border-gray-100">
        Powered by Google Gemini 2.5 Flash
      </div>
    </div>
  );
};

export default AiSidebar;