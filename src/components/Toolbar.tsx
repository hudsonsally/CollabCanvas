import React, { useState } from 'react';
import { Tool } from '../types';

interface ToolbarProps {
  activeTool: Tool;
  setTool: (tool: Tool) => void;
  onClear: () => void;
  onExport: () => void;
  strokeColor: string;
  setStrokeColor: (color: string) => void;
  fillColor: string;
  setFillColor: (color: string) => void;
  strokeWidth: number;
  setStrokeWidth: (width: number) => void;
  eraserSize: number;
  setEraserSize: (size: number) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  setTool,
  onClear,
  onExport,
  strokeColor,
  setStrokeColor,
  fillColor,
  setFillColor,
  strokeWidth,
  setStrokeWidth,
  eraserSize,
  setEraserSize
}) => {
  const tools = [
    { id: Tool.SELECT, label: 'Select', icon: 'M3 15l6-6 4 4 6-6M3 9v12h12' },
    { id: Tool.PENCIL, label: 'Pencil', icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' },
    { id: Tool.BRUSH, label: 'Brush', icon: 'M7 21a4 4 0 01-4-4v-1.545c0-1.637.64-3.21 1.785-4.385l9.286-9.522a3.02 3.02 0 014.28 0 3.125 3.125 0 010 4.383l-9.286 9.523A6.297 6.297 0 017 21z M12 6l6 6' },
    { id: Tool.HIGHLIGHTER, label: 'Highlighter', icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732H4v5h5L19 7l-3.768-3.768z' },
    { id: Tool.SPRAY, label: 'Spray Can', icon: 'M10 5a2 2 0 014 0v2h-4V5zM7 9a1 1 0 011-1h8a1 1 0 011 1v12a2 2 0 01-2 2H9a2 2 0 01-2-2V9zm4-5h2z M10 11v6 M14 11v6 M12 11v6 M8 7v2 M16 7v2' },
    { id: Tool.ERASER, label: 'Eraser', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
    { id: Tool.LINE, label: 'Line', icon: 'M4 20L20 4' },
    { id: Tool.RECTANGLE, label: 'Rect', icon: 'M4 4h16v16H4z' },
    { id: Tool.CIRCLE, label: 'Circle', icon: 'M12 2a10 10 0 100 20 10 10 0 000-20z' },
    { id: Tool.TEXT, label: 'Text', icon: 'M4 6h16M4 12h16M4 18h10' },
    { id: Tool.AI_MAGIC, label: 'AI Magic', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  ];

  return (
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white rounded-full shadow-lg px-4 py-2 flex items-center gap-2 border border-gray-200 z-50 select-none">
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => setTool(tool.id)}
          className={`p-2 rounded-full transition-colors ${activeTool === tool.id
            ? 'bg-indigo-100 text-indigo-600'
            : 'text-gray-500 hover:bg-gray-100'
            }`}
          title={tool.label}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tool.icon} />
          </svg>
        </button>
      ))}

      <div className="w-px h-6 bg-gray-200 mx-1"></div>

      {/* Brush Color */}
      <div className="flex flex-col items-center group relative" title="Brush Color">
        <div className="w-6 h-6 rounded-full overflow-hidden border border-gray-300 ring-2 ring-transparent group-hover:ring-indigo-100 transition-all">
          <input
            type="color"
            value={strokeColor}
            onChange={(e) => setStrokeColor(e.target.value)}
            className="w-[150%] h-[150%] -translate-x-1/4 -translate-y-1/4 cursor-pointer p-0 border-0"
          />
        </div>
        <span className="text-[10px] text-gray-400 absolute -bottom-3 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Stroke</span>
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1"></div>

      {/* Stroke Width / Eraser Size Selection */}
      <div className="flex items-center gap-1 group relative bg-gray-50 rounded-full px-1 py-1 border border-gray-100">
        <button onClick={() => activeTool === Tool.ERASER ? setEraserSize(10) : setStrokeWidth(2)} className={`p-1 w-6 h-6 flex items-center justify-center rounded-full transition-colors ${((activeTool === Tool.ERASER && eraserSize === 10) || (activeTool !== Tool.ERASER && strokeWidth === 2)) ? 'bg-indigo-100' : 'hover:bg-gray-200'}`} title={activeTool === Tool.ERASER ? "Regular" : "Thin"}>
          <div className={`w-3 h-0.5 rounded-full ${((activeTool === Tool.ERASER && eraserSize === 10) || (activeTool !== Tool.ERASER && strokeWidth === 2)) ? 'bg-indigo-600' : 'bg-gray-400'}`}></div>
        </button>
        <button onClick={() => activeTool === Tool.ERASER ? setEraserSize(25) : setStrokeWidth(6)} className={`p-1 w-6 h-6 flex items-center justify-center rounded-full transition-colors ${((activeTool === Tool.ERASER && eraserSize === 25) || (activeTool !== Tool.ERASER && strokeWidth === 6)) ? 'bg-indigo-100' : 'hover:bg-gray-200'}`} title={activeTool === Tool.ERASER ? "Big" : "Medium"}>
          <div className={`w-3 h-[4px] rounded-full ${((activeTool === Tool.ERASER && eraserSize === 25) || (activeTool !== Tool.ERASER && strokeWidth === 6)) ? 'bg-indigo-600' : 'bg-gray-500'}`}></div>
        </button>
        <button onClick={() => activeTool === Tool.ERASER ? setEraserSize(50) : setStrokeWidth(12)} className={`p-1 w-6 h-6 flex items-center justify-center rounded-full transition-colors ${((activeTool === Tool.ERASER && eraserSize === 50) || (activeTool !== Tool.ERASER && strokeWidth === 12)) ? 'bg-indigo-100' : 'hover:bg-gray-200'}`} title={activeTool === Tool.ERASER ? "Large" : "Thick"}>
          <div className={`w-3 h-2 rounded-full ${((activeTool === Tool.ERASER && eraserSize === 50) || (activeTool !== Tool.ERASER && strokeWidth === 12)) ? 'bg-indigo-600' : 'bg-gray-600'}`}></div>
        </button>
        <span className="text-[10px] text-gray-400 absolute -bottom-4 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Size</span>
      </div>

      {/* Fill Color */}
      <div className="flex items-center gap-1 group relative bg-gray-50 rounded-full pl-1 pr-1 py-1 border border-gray-100">
        <button
          onClick={() => setFillColor('transparent')}
          className={`w-4 h-4 rounded-full border flex items-center justify-center ${fillColor === 'transparent' ? 'border-red-400 bg-red-50' : 'border-gray-300 hover:border-red-300'}`}
          title="No Fill"
        >
          <div className="w-full h-px bg-red-400 transform rotate-45"></div>
        </button>
        <div className="w-6 h-6 rounded-full overflow-hidden border border-gray-300" title="Fill Color">
          <input
            type="color"
            value={fillColor === 'transparent' ? '#ffffff' : fillColor}
            onChange={(e) => setFillColor(e.target.value)}
            className="w-[150%] h-[150%] -translate-x-1/4 -translate-y-1/4 cursor-pointer p-0 border-0"
          />
        </div>
        <span className="text-[10px] text-gray-400 absolute -bottom-4 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Fill</span>
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1"></div>

      {/* Export & Clear */}
      <button
        onClick={onExport}
        className="p-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
        title="Export SVG"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </button>
      <button
        onClick={onClear}
        className="p-2 rounded-full text-red-500 hover:bg-red-50 transition-colors"
        title="Clear Canvas"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
};

export default Toolbar;