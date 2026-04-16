import React from 'react';
import { Shape, ShapeType } from '../types';

interface PropertiesPanelProps {
  selectedShape: Shape;
  onUpdate: (updates: Partial<Shape>) => void;
  onDelete: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedShape,
  onUpdate,
  onDelete,
  onBringToFront,
  onSendToBack,
}) => {
  const isLineOrPencil = selectedShape.type === ShapeType.LINE || selectedShape.type === ShapeType.PENCIL;
  const isText = selectedShape.type === ShapeType.TEXT;

  return (
    <div className="absolute top-20 right-4 bg-white p-4 rounded-xl shadow-xl border border-gray-200 w-64 max-w-xs md:w-72 lg:w-80 z-40 animate-in fade-in slide-in-from-right-5 duration-200 overflow-y-auto max-h-[calc(100vh-120px)]">
      <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wider">Properties</h3>
        <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
          {selectedShape.type}
        </span>
      </div>

      <div className="space-y-4">
        {/* Stroke Color */}
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-600 font-medium">Stroke</label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-mono">{selectedShape.stroke}</span>
            <input
              type="color"
              value={selectedShape.stroke === 'none' ? '#000000' : selectedShape.stroke}
              onChange={(e) => onUpdate({ stroke: e.target.value })}
              className="w-8 h-8 rounded-full border-0 cursor-pointer overflow-hidden"
            />
          </div>
        </div>

        {/* Fill Color (Not for Line/Pencil) */}
        {!isLineOrPencil && (
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-600 font-medium">Fill</label>
            <div className="flex items-center gap-2">
               <button 
                 onClick={() => onUpdate({ fill: 'transparent' })}
                 className={`w-6 h-6 rounded-full border ${selectedShape.fill === 'transparent' ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-gray-300'} flex items-center justify-center bg-white`}
                 title="Transparent"
               >
                 <div className="w-full h-px bg-red-500 transform rotate-45"></div>
               </button>
              <input
                type="color"
                value={selectedShape.fill === 'transparent' ? '#ffffff' : selectedShape.fill}
                onChange={(e) => onUpdate({ fill: e.target.value })}
                className="w-8 h-8 rounded-full border-0 cursor-pointer overflow-hidden"
              />
            </div>
          </div>
        )}

        {/* Stroke Width */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-sm text-gray-600 font-medium">Thickness</label>
            <span className="text-xs text-gray-400">{selectedShape.strokeWidth}px</span>
          </div>
          <input
            type="range"
            min="1"
            max="20"
            value={selectedShape.strokeWidth}
            onChange={(e) => onUpdate({ strokeWidth: parseInt(e.target.value) })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
        </div>

        {/* Text Content (Only for Text) */}
        {isText && (
            <div>
                <label className="text-sm text-gray-600 font-medium mb-1 block">Content</label>
                <input 
                    type="text" 
                    value={selectedShape.text || ''} 
                    onChange={(e) => onUpdate({ text: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:border-indigo-500 focus:outline-none"
                />
            </div>
        )}

        <div className="border-t border-gray-100 pt-4 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
                <button onClick={onBringToFront} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded transition-colors">
                    Bring Front
                </button>
                <button onClick={onSendToBack} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded transition-colors">
                    Send Back
                </button>
            </div>
            <button 
                onClick={onDelete}
                className="w-full px-3 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 rounded transition-colors flex items-center justify-center gap-2"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Delete Shape
            </button>
        </div>
      </div>
    </div>
  );
};

export default PropertiesPanel;