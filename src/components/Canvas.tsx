import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Shape, ShapeType, Tool, UserCursor } from '../types';
import { DEFAULT_STROKE_WIDTH } from '../constants';
import { addShapeToRemote, updateCursorRemote, updateShapeInRemote, deleteShapeFromRemote } from '../services/firebase';
import { v4 as uuidv4 } from 'uuid';

interface CanvasProps {
  roomId: string;
  shapes: Shape[];
  activeTool: Tool;
  setTool: (tool: Tool) => void;
  cursors: UserCursor[];
  userId: string;
  userName: string;
  userColor: string;
  selectedShapeId: string | null;
  onSelectShape: (id: string | null) => void;
  currentStroke: string;
  currentFill: string;
}

// Helper for interaction states
enum InteractionMode {
  NONE,
  DRAWING,
  PANNING,
  MOVING_SHAPE,
  RESIZING_SHAPE,
}

// Helper: Distance squared from point p to segment v-w
const distToSegmentSquared = (p: {x:number, y:number}, v: {x:number, y:number}, w: {x:number, y:number}) => {
    const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
    if (l2 === 0) return Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + Math.pow(p.y - (v.y + t * (w.y - v.y)), 2);
};

const Canvas = forwardRef<SVGSVGElement, CanvasProps>(({ 
  roomId,
  shapes, 
  activeTool, 
  setTool, 
  cursors, 
  userId, 
  userName, 
  userColor,
  selectedShapeId,
  onSelectShape,
  currentStroke,
  currentFill
}, ref) => {
  const internalSvgRef = useRef<SVGSVGElement>(null);
  // Expose internal ref to parent via forwardRef
  useImperativeHandle(ref, () => internalSvgRef.current!, []);

  // State
  const [interactionMode, setInteractionMode] = useState<InteractionMode>(InteractionMode.NONE);
  const [draftShape, setDraftShape] = useState<Shape | null>(null);
  
  // For Moving/Resizing
  const [initialClickPos, setInitialClickPos] = useState({ x: 0, y: 0 });
  const [initialShapeState, setInitialShapeState] = useState<Shape | null>(null);
  
  // Zoom and Pan State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Eraser State
  const [eraserHoverId, setEraserHoverId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number, y: number } | null>(null);

  // Track shapes currently being erased to prevent double-deletes during optimistic updates
  const erasingIds = useRef<Set<string>>(new Set());

  // Handle Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true);
      }
      if ((e.code === 'Delete' || e.code === 'Backspace') && selectedShapeId) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault(); // Prevent browser back nav
        await deleteShapeFromRemote(roomId, selectedShapeId);
        onSelectShape(null);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        if (interactionMode === InteractionMode.PANNING) {
            setInteractionMode(InteractionMode.NONE);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [roomId, selectedShapeId, interactionMode, onSelectShape]);

  // Clear erasing lock when shapes update (confirmation from server)
  useEffect(() => {
      erasingIds.current.clear();
  }, [shapes]);

  // Convert Screen Coordinates to World Coordinates
  const toWorld = (clientX: number, clientY: number) => {
    if (!internalSvgRef.current) return { x: 0, y: 0 };
    const rect = internalSvgRef.current.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    
    return {
      x: (screenX - pan.x) / zoom,
      y: (screenY - pan.y) / zoom
    };
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault(); // Prevent native browser zoom
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const newZoom = Math.min(Math.max(0.1, zoom + delta), 5); // Limit zoom 0.1x to 5x

    const rect = internalSvgRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const worldX = (mouseX - pan.x) / zoom;
    const worldY = (mouseY - pan.y) / zoom;

    const newPanX = mouseX - worldX * newZoom;
    const newPanY = mouseY - worldY * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  // Helper to check if a point hits a shape
  const checkHit = (s: Shape, x: number, y: number, hitPadding: number) => {
      
      if (s.type === ShapeType.RECTANGLE) {
          // Check if point is inside rectangle, expanding by eraser radius (hitPadding)
          return x >= s.x - hitPadding && x <= s.x + (s.width || 0) + hitPadding && 
                 y >= s.y - hitPadding && y <= s.y + (s.height || 0) + hitPadding;
      } else if (s.type === ShapeType.CIRCLE) {
          const dx = x - s.x;
          const dy = y - s.y;
          // Check distance to center vs radius + eraser radius
          return dx*dx + dy*dy <= Math.pow((s.radius || 0) + hitPadding, 2);
      } else if (s.type === ShapeType.TEXT) {
          if (s.text) {
              const w = s.text.length * 12; 
              const h = 24; 
              return x >= s.x - hitPadding && x <= s.x + w + hitPadding && 
                     y >= s.y - h - hitPadding && y <= s.y + hitPadding;
          }
      } else if (s.type === ShapeType.LINE && s.points && s.points.length >= 4) {
          // Account for translation offset due to moving
          const offsetX = s.x - s.points[0];
          const offsetY = s.y - s.points[1];
          const localX = x - offsetX;
          const localY = y - offsetY;

          // Check distance to segment vs eraser radius + half stroke width
          const halfStroke = (s.strokeWidth || DEFAULT_STROKE_WIDTH) / 2;
          const threshold = hitPadding + halfStroke;
          const thresholdSq = threshold * threshold;

          const p1 = { x: s.points[0], y: s.points[1] };
          const p2 = { x: s.points[2], y: s.points[3] };
          if (distToSegmentSquared({x: localX, y: localY}, p1, p2) < thresholdSq) {
              return true;
          }
      } else if (s.type === ShapeType.PENCIL && s.points && s.points.length >= 2) {
           // Account for translation offset due to moving
           const offsetX = s.x - s.points[0];
           const offsetY = s.y - s.points[1];
           const localX = x - offsetX;
           const localY = y - offsetY;

           const halfStroke = (s.strokeWidth || DEFAULT_STROKE_WIDTH) / 2;
           const threshold = hitPadding + halfStroke;
           const thresholdSq = threshold * threshold;

           const points = s.points;
           for (let j = 0; j < points.length - 2; j += 2) {
                 const p1 = { x: points[j], y: points[j+1] };
                 const p2 = { x: points[j+2], y: points[j+3] };
                 if (distToSegmentSquared({x: localX, y: localY}, p1, p2) < thresholdSq) {
                     return true;
                 }
           }
      }
      return false;
  };

  const attemptErase = (x: number, y: number) => {
      const hitPadding = 10 / zoom;
      
      // Check shapes in reverse order (top to bottom)
      for (let i = shapes.length - 1; i >= 0; i--) {
          const s = shapes[i];
          if (erasingIds.current.has(s.id)) continue;

          // 1. Partial Erasing for Pencil Strokes
          if (s.type === ShapeType.PENCIL && s.points && s.points.length >= 4) {
             const points = s.points;
             
             // Calculate local coordinates for hit testing against raw points
             const offsetX = s.x - points[0];
             const offsetY = s.y - points[1];
             const localX = x - offsetX;
             const localY = y - offsetY;

             // Calculate threshold including stroke width
             const halfStroke = (s.strokeWidth || DEFAULT_STROKE_WIDTH) / 2;
             const threshold = hitPadding + halfStroke;
             const thresholdSq = threshold * threshold;

             const newPaths: number[][] = [];
             let currentPath: number[] = [points[0], points[1]];
             let isModified = false;
             
             // Check every segment
             for (let j = 0; j < points.length - 2; j += 2) {
                 const p1 = { x: points[j], y: points[j+1] };
                 const p2 = { x: points[j+2], y: points[j+3] };
                 
                 // If eraser hits this segment (check in local space)
                 if (distToSegmentSquared({x: localX, y: localY}, p1, p2) < thresholdSq) {
                     isModified = true;
                     
                     // End current path here if it has enough points to be visible
                     if (currentPath.length >= 4) {
                         newPaths.push(currentPath);
                     }
                     // Start new path at next point (creating a gap)
                     currentPath = [points[j+2], points[j+3]];
                 } else {
                     // Not hit, continue path
                     currentPath.push(points[j+2], points[j+3]);
                 }
             }
             
             // Add final segment
             if (currentPath.length >= 4) {
                 newPaths.push(currentPath);
             }

             if (isModified) {
                 erasingIds.current.add(s.id);
                 // Delete original
                 deleteShapeFromRemote(roomId, s.id);
                 
                 // Add new fragments
                 newPaths.forEach(pts => {
                     // Calculate correct X/Y for new shape to maintain visual position
                     // The visual offset must remain constant: newX - newPts[0] = offsetX
                     const newShape = {
                         ...s,
                         id: uuidv4(),
                         points: pts,
                         x: pts[0] + offsetX,
                         y: pts[1] + offsetY
                     };
                     addShapeToRemote(roomId, newShape);
                 });
                 return; // Stop after one interaction
             }
          } 
          // 2. Object Erasing for Primitives
          else {
              if (checkHit(s, x, y, hitPadding)) {
                  erasingIds.current.add(s.id);
                  deleteShapeFromRemote(roomId, s.id);
                  return;
              }
          }
      }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!internalSvgRef.current) return;
    
    // 1. Handle Panning (Spacebar or Middle Click)
    if (isSpacePressed || e.button === 1) {
      setInteractionMode(InteractionMode.PANNING);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const { x, y } = toWorld(e.clientX, e.clientY);

    // 2. Handle Eraser
    if (activeTool === Tool.ERASER) {
        setInteractionMode(InteractionMode.DRAWING); // Use drawing mode to track interaction state
        e.currentTarget.setPointerCapture(e.pointerId);
        attemptErase(x, y);
        return;
    }

    // 3. Handle Creation (if not selecting)
    if (activeTool !== Tool.SELECT) {
        if (activeTool === Tool.AI_MAGIC) return;

        setInteractionMode(InteractionMode.DRAWING);
        setInitialClickPos({ x, y });
        
        // Initialize with default safe values
        const newShape: Shape = {
            id: uuidv4(),
            type: activeTool === Tool.RECTANGLE ? ShapeType.RECTANGLE : 
                  activeTool === Tool.CIRCLE ? ShapeType.CIRCLE : 
                  activeTool === Tool.LINE ? ShapeType.LINE :
                  activeTool === Tool.PENCIL ? ShapeType.PENCIL : ShapeType.RECTANGLE,
            x: x,
            y: y,
            width: 0,
            height: 0,
            radius: 0,
            points: activeTool === Tool.PENCIL || activeTool === Tool.LINE ? [x, y, x, y] : [],
            text: '', // Explicitly initialize
            // For Pencil/Line, fill is none. For others, use currentFill.
            fill: (activeTool === Tool.PENCIL || activeTool === Tool.LINE) ? 'none' : currentFill,
            stroke: currentStroke,
            strokeWidth: DEFAULT_STROKE_WIDTH,
            createdAt: Date.now()
        };

        if (activeTool === Tool.TEXT) {
            const text = prompt("Enter text:");
            if (text) {
                newShape.type = ShapeType.TEXT;
                newShape.text = text;
                newShape.stroke = 'none';
                newShape.fill = currentStroke; 
                addShapeToRemote(roomId, newShape);
            }
            setInteractionMode(InteractionMode.NONE);
            return;
        }

        setDraftShape(newShape);
        e.currentTarget.setPointerCapture(e.pointerId);
        
        if (selectedShapeId) onSelectShape(null);
        return;
    }
    
    // 4. Handle Background Click (Deselect)
    onSelectShape(null);
  };

  const handleShapePointerDown = (e: React.PointerEvent, shapeId: string) => {
    if (activeTool === Tool.ERASER) {
        // Just calculate and erase, stop prop to prevent background handler but we still need coordinates
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        // Start "erasing" interaction
        setInteractionMode(InteractionMode.DRAWING); 
        const { x, y } = toWorld(e.clientX, e.clientY);
        attemptErase(x, y);
        return;
    }

    if (activeTool !== Tool.SELECT || isSpacePressed) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    const shape = shapes.find(s => s.id === shapeId);
    if (!shape) return;

    onSelectShape(shapeId);
    setInteractionMode(InteractionMode.MOVING_SHAPE);
    
    const { x, y } = toWorld(e.clientX, e.clientY);
    setInitialClickPos({ x, y });
    setInitialShapeState({ ...shape });
  };

  const handleResizePointerDown = (e: React.PointerEvent) => {
      if (activeTool !== Tool.SELECT) return;
      e.stopPropagation();
      const shape = shapes.find(s => s.id === selectedShapeId);
      if (shape) {
          setInteractionMode(InteractionMode.RESIZING_SHAPE);
          setInitialShapeState({ ...shape });
          const { x, y } = toWorld(e.clientX, e.clientY);
          setInitialClickPos({ x, y });
          e.currentTarget.setPointerCapture(e.pointerId);
      }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!internalSvgRef.current) return;

    if (interactionMode === InteractionMode.PANNING) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const { x, y } = toWorld(e.clientX, e.clientY);

    // ERASER LOGIC: Custom cursor & Hover detection
    if (activeTool === Tool.ERASER) {
        // Update screen cursor position
        const rect = internalSvgRef.current!.getBoundingClientRect();
        setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        
        // Update hover detection
        const hitPadding = 10 / zoom;
        let foundId = null;
        for (let i = shapes.length - 1; i >= 0; i--) {
            const s = shapes[i];
            if (erasingIds.current.has(s.id)) continue;
            if (checkHit(s, x, y, hitPadding)) {
                foundId = s.id;
                break;
            }
        }
        setEraserHoverId(foundId);

        // Actual erasing if mouse down
        if (interactionMode === InteractionMode.DRAWING) {
            attemptErase(x, y);
        }
    } else {
        if (cursorPos) setCursorPos(null);
        if (eraserHoverId) setEraserHoverId(null);
    }

    if (Math.random() > 0.8) { 
        updateCursorRemote(roomId, {
            id: userId,
            name: userName,
            color: userColor,
            x, 
            y,
            lastActive: Date.now()
        });
    }

    if (interactionMode === InteractionMode.NONE) return;

    // DRAWING
    if (interactionMode === InteractionMode.DRAWING && draftShape) {
        let updatedShape = { ...draftShape };

        if (activeTool === Tool.PENCIL) {
            // Simply append new points
            const newPoints = [...(draftShape.points || []), x, y];
            updatedShape.points = newPoints;
        } else if (activeTool === Tool.LINE) {
            updatedShape.points = [draftShape.points![0], draftShape.points![1], x, y];
        } else {
            const width = x - initialClickPos.x;
            const height = y - initialClickPos.y;
            
            if (activeTool === Tool.RECTANGLE) {
                updatedShape.width = Math.abs(width);
                updatedShape.height = Math.abs(height);
                updatedShape.x = width > 0 ? initialClickPos.x : x;
                updatedShape.y = height > 0 ? initialClickPos.y : y;
            } else if (activeTool === Tool.CIRCLE) {
                updatedShape.radius = Math.sqrt(width * width + height * height);
            }
        }
        setDraftShape(updatedShape);
    }

    // MOVING
    if (interactionMode === InteractionMode.MOVING_SHAPE && selectedShapeId && initialShapeState) {
        const dx = x - initialClickPos.x;
        const dy = y - initialClickPos.y;
        
        const updatedShape = {
            ...initialShapeState,
            x: initialShapeState.x + dx,
            y: initialShapeState.y + dy
        };

        if (Math.random() > 0.5) { 
             updateShapeInRemote(roomId, selectedShapeId, { x: updatedShape.x, y: updatedShape.y });
        }
    }

    // RESIZING
    if (interactionMode === InteractionMode.RESIZING_SHAPE && selectedShapeId && initialShapeState) {
        const dx = x - initialClickPos.x;
        const dy = y - initialClickPos.y;
        
        if (initialShapeState.type === ShapeType.RECTANGLE) {
            const newWidth = Math.max(10, (initialShapeState.width || 0) + dx);
            const newHeight = Math.max(10, (initialShapeState.height || 0) + dy);
            updateShapeInRemote(roomId, selectedShapeId, { width: newWidth, height: newHeight });
        } else if (initialShapeState.type === ShapeType.CIRCLE) {
            const newRadius = Math.max(5, (initialShapeState.radius || 0) + dx);
            updateShapeInRemote(roomId, selectedShapeId, { radius: newRadius });
        }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);

    // Capture state before resetting
    const shapeToSave = draftShape ? { ...draftShape } : null;
    const currentTool = activeTool;
    const currentMode = interactionMode;

    // Reset UI immediately to stop drawing interactions
    setInteractionMode(InteractionMode.NONE);
    setDraftShape(null);
    setInitialShapeState(null);

    if (currentTool === Tool.ERASER) return; // Nothing to save

    // Save to Database
    if (currentMode === InteractionMode.DRAWING && shapeToSave) {
        if (currentTool === Tool.PENCIL) {
             let points = shapeToSave.points || [];
             // Ensure visible dot if only 1 point captured
             if (points.length === 2) {
                 points = [...points, points[0] + 1, points[1] + 1];
                 shapeToSave.points = points;
             }
             
             if (points.length >= 4) {
                 addShapeToRemote(roomId, shapeToSave);
             }
        } else if (currentTool === Tool.LINE) {
            if (shapeToSave.points && shapeToSave.points.length === 4) {
                const dx = shapeToSave.points[2] - shapeToSave.points[0];
                const dy = shapeToSave.points[3] - shapeToSave.points[1];
                if (Math.sqrt(dx*dx+dy*dy) > 5) {
                    addShapeToRemote(roomId, shapeToSave);
                }
            }
        } else {
            // Rect/Circle validation
            if ((shapeToSave.width && shapeToSave.width > 5) || (shapeToSave.radius && shapeToSave.radius > 5)) {
               addShapeToRemote(roomId, shapeToSave);
            }
        }
    }
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
      handlePointerUp(e);
      setCursorPos(null); // Hide cursor when leaving canvas
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const getCursorStyle = () => {
    if (interactionMode === InteractionMode.PANNING || isSpacePressed) return 'grab';
    if (activeTool === Tool.ERASER) return 'none'; // Hide default cursor for custom eraser
    if (interactionMode === InteractionMode.MOVING_SHAPE) return 'move';
    if (interactionMode === InteractionMode.RESIZING_SHAPE) return 'nwse-resize';
    if (activeTool === Tool.SELECT) return 'default';
    return 'crosshair';
  };

  const renderPencilOrLine = (shape: Shape) => {
      if (!shape.points || shape.points.length < 2) return null;
      
      const startX = shape.points[0];
      const startY = shape.points[1];
      const translateX = shape.x - startX;
      const translateY = shape.y - startY;

      let d = "";
      if (shape.type === ShapeType.LINE && shape.points.length >= 4) {
          d = `M ${shape.points[0]} ${shape.points[1]} L ${shape.points[2]} ${shape.points[3]}`;
      } else {
          d = `M ${shape.points[0]} ${shape.points[1]}`;
          for (let i = 2; i < shape.points.length; i += 2) {
              d += ` L ${shape.points[i]} ${shape.points[i+1]}`;
          }
      }

      return (
          <g transform={`translate(${translateX}, ${translateY})`}>
              <path d={d} stroke={shape.stroke} strokeWidth={shape.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
      );
  };

  const renderDraftPencilOrLine = (shape: Shape) => {
      if (!shape.points || shape.points.length < 2) return null;
      let d = "";
      if (shape.type === ShapeType.LINE && shape.points.length >= 4) {
         d = `M ${shape.points[0]} ${shape.points[1]} L ${shape.points[2]} ${shape.points[3]}`;
      } else {
         d = `M ${shape.points[0]} ${shape.points[1]}`;
         for (let i = 2; i < shape.points.length; i += 2) {
            d += ` L ${shape.points[i]} ${shape.points[i+1]}`;
         }
      }
      return <path d={d} stroke={shape.stroke} strokeWidth={shape.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  }

  const renderSelectionOverlay = () => {
      if (!selectedShapeId) return null;
      const shape = shapes.find(s => s.id === selectedShapeId);
      if (!shape) return null;

      const padding = 5;
      const style = { fill: "none", stroke: "#3B82F6", strokeWidth: 1.5, strokeDasharray: "4,4" };
      const handleStyle = { fill: "#fff", stroke: "#3B82F6", strokeWidth: 1.5, cursor: "nwse-resize" };
      
      let bounds = { x: 0, y: 0, w: 0, h: 0 };

      if (shape.type === ShapeType.RECTANGLE && shape.width && shape.height) {
          bounds = { x: shape.x, y: shape.y, w: shape.width, h: shape.height };
      } else if (shape.type === ShapeType.CIRCLE && shape.radius) {
          bounds = { x: shape.x - shape.radius, y: shape.y - shape.radius, w: shape.radius * 2, h: shape.radius * 2 };
      } else if (shape.type === ShapeType.TEXT && shape.text) {
          bounds = { x: shape.x, y: shape.y - 20, w: shape.text.length * 12, h: 24 };
      } else if ((shape.type === ShapeType.PENCIL || shape.type === ShapeType.LINE) && shape.points) {
           const startX = shape.points[0];
           const startY = shape.points[1];
           const translateX = shape.x - startX;
           const translateY = shape.y - startY;

           const xs = shape.points.filter((_, i) => i % 2 === 0).map(val => val + translateX);
           const ys = shape.points.filter((_, i) => i % 2 !== 0).map(val => val + translateY);
           
           if (xs.length > 0 && ys.length > 0) {
               const minX = Math.min(...xs);
               const maxX = Math.max(...xs);
               const minY = Math.min(...ys);
               const maxY = Math.max(...ys);
               bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
           }
      }

      return (
          <g>
             <rect 
                x={bounds.x - padding} 
                y={bounds.y - padding} 
                width={bounds.w + padding*2} 
                height={bounds.h + padding*2} 
                {...style} 
                pointerEvents="none"
             />
             {(shape.type === ShapeType.RECTANGLE || shape.type === ShapeType.CIRCLE) && (
                 <rect
                    x={bounds.x + bounds.w + padding - 4}
                    y={bounds.y + bounds.h + padding - 4}
                    width={8}
                    height={8}
                    {...handleStyle}
                    onPointerDown={handleResizePointerDown}
                 />
             )}
          </g>
      );
  };

  return (
    <div className="w-full h-full bg-white relative overflow-hidden">
      {/* Grid Background */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
            backgroundImage: 'radial-gradient(circle, #6366f1 1px, transparent 1px)',
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`
        }}
      />

      {/* Zoom Controls */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 bg-white p-2 rounded-lg shadow-md border border-gray-200 select-none">
        <button onClick={() => setZoom(z => Math.max(0.1, z - 0.2))} className="p-1 hover:bg-gray-100 rounded text-gray-600">
           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
        </button>
        <span className="text-xs font-medium w-12 text-center text-gray-600">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(5, z + 0.2))} className="p-1 hover:bg-gray-100 rounded text-gray-600">
           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        </button>
        <div className="w-px h-4 bg-gray-200 mx-1"></div>
        <button onClick={handleResetView} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-1">
          Reset
        </button>
      </div>

      <div className="absolute top-20 left-1/2 transform -translate-x-1/2 pointer-events-none">
         {isSpacePressed && (
           <div className="bg-black/75 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm animate-pulse">
             Drag to Pan
           </div>
         )}
      </div>

      <svg
        ref={internalSvgRef}
        className="w-full h-full touch-none"
        style={{ cursor: getCursorStyle() }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {shapes.map((shape) => (
                <g 
                    key={shape.id} 
                    onPointerDown={(e) => handleShapePointerDown(e, shape.id)}
                    opacity={activeTool === Tool.ERASER && shape.id === eraserHoverId ? 0.3 : 1}
                >
                    {shape.type === ShapeType.RECTANGLE && (
                        <rect
                            x={shape.x}
                            y={shape.y}
                            width={shape.width}
                            height={shape.height}
                            fill={shape.fill}
                            stroke={shape.stroke}
                            strokeWidth={shape.strokeWidth}
                        />
                    )}
                    {shape.type === ShapeType.CIRCLE && (
                        <circle
                            cx={shape.x}
                            cy={shape.y}
                            r={shape.radius}
                            fill={shape.fill}
                            stroke={shape.stroke}
                            strokeWidth={shape.strokeWidth}
                        />
                    )}
                    {(shape.type === ShapeType.PENCIL || shape.type === ShapeType.LINE) && shape.points && (
                        renderPencilOrLine(shape)
                    )}
                    {shape.type === ShapeType.TEXT && (
                        <text
                            x={shape.x}
                            y={shape.y}
                            fill={shape.fill}
                            fontSize="20"
                            fontFamily="sans-serif"
                            style={{ userSelect: 'none', whiteSpace: 'pre' }}
                        >
                            {shape.text}
                        </text>
                    )}
                </g>
            ))}

            {renderSelectionOverlay()}

            {draftShape && (
                <g opacity="0.6">
                {draftShape.type === ShapeType.RECTANGLE && (
                    <rect
                        x={draftShape.x}
                        y={draftShape.y}
                        width={draftShape.width}
                        height={draftShape.height}
                        fill={draftShape.fill}
                        stroke={draftShape.stroke}
                        strokeWidth={draftShape.strokeWidth}
                    />
                )}
                {draftShape.type === ShapeType.CIRCLE && (
                    <circle
                        cx={draftShape.x}
                        cy={draftShape.y}
                        r={draftShape.radius}
                        fill={draftShape.fill}
                        stroke={draftShape.stroke}
                        strokeWidth={draftShape.strokeWidth}
                    />
                )}
                {(draftShape.type === ShapeType.PENCIL || draftShape.type === ShapeType.LINE) && draftShape.points && (
                    renderDraftPencilOrLine(draftShape)
                )}
            </g>
            )}

            {cursors.map(c => (
                <g key={c.id} style={{ transform: `translate(${c.x}px, ${c.y}px)`, transition: 'transform 0.1s linear' }} pointerEvents="none">
                    <path
                        d="M0 0l10 15l-4-2l2 6l-3 1l-2-6l-3 2z"
                        fill={c.color}
                        stroke="white"
                        strokeWidth="1"
                    />
                    <text x="12" y="15" fontSize="12" fill={c.color} fontWeight="bold">{c.name}</text>
                </g>
            ))}
        </g>
        
        {/* Custom Eraser Cursor Overlay */}
        {activeTool === Tool.ERASER && cursorPos && (
            <g transform={`translate(${cursorPos.x}, ${cursorPos.y})`} pointerEvents="none">
                {/* Visual circle roughly matching hit area */}
                <circle 
                    r={10} 
                    fill="rgba(255, 255, 255, 0.4)" 
                    stroke="#EF4444" 
                    strokeWidth={2}
                    className="drop-shadow-sm"
                />
                {/* Crosshair center */}
                <line x1={-3} y1={0} x2={3} y2={0} stroke="#EF4444" strokeWidth={1} />
                <line x1={0} y1={-3} x2={0} y2={3} stroke="#EF4444" strokeWidth={1} />
            </g>
        )}
      </svg>
    </div>
  );
});

export default Canvas;