export enum ShapeType {
  RECTANGLE = 'rectangle',
  CIRCLE = 'circle',
  TEXT = 'text',
  LINE = 'line',
  PENCIL = 'pencil',
  HIGHLIGHTER = 'highlighter',
  ERASER = 'eraser',
  BRUSH = 'brush',
  SPRAY = 'spray',
}

export interface Shape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  text?: string;
  points?: number[]; // For freehand pencil and lines
  fill: string;
  stroke: string;
  strokeWidth: number;
  createdAt: number;
}

export interface UserCursor {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  lastActive: number;
}

export enum Tool {
  SELECT = 'select',
  RECTANGLE = 'rectangle',
  CIRCLE = 'circle',
  TEXT = 'text',
  LINE = 'line',
  PENCIL = 'pencil',
  HIGHLIGHTER = 'highlighter',
  ERASER = 'eraser',
  BRUSH = 'brush',
  SPRAY = 'spray',
  AI_MAGIC = 'ai_magic',
}

export interface CanvasState {
  shapes: Shape[];
  cursors: UserCursor[];
}