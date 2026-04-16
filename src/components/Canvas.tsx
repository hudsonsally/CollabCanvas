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
    currentStrokeWidth: number;
    currentEraserSize: number;
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
const distToSegmentSquared = (p: { x: number, y: number }, v: { x: number, y: number }, w: { x: number, y: number }) => {
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
    currentFill,
    currentStrokeWidth,
    currentEraserSize
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

    const cursorRef = useRef<SVGGElement>(null);

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

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!internalSvgRef.current) return;

        if (isSpacePressed || e.button === 1) {
            setInteractionMode(InteractionMode.PANNING);
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
            return;
        }

        const { x, y } = toWorld(e.clientX, e.clientY);

        // 2. Handle Creation (if not selecting)
        if (activeTool !== Tool.SELECT && activeTool !== Tool.AI_MAGIC) {
            setInteractionMode(InteractionMode.DRAWING);
            setInitialClickPos({ x, y });

            // Initialize with default safe values
            const newShape: Shape = {
                id: uuidv4(),
                type: activeTool === Tool.RECTANGLE ? ShapeType.RECTANGLE :
                    activeTool === Tool.CIRCLE ? ShapeType.CIRCLE :
                        activeTool === Tool.LINE ? ShapeType.LINE :
                            activeTool === Tool.HIGHLIGHTER ? ShapeType.HIGHLIGHTER :
                                activeTool === Tool.ERASER ? ShapeType.ERASER :
                                    activeTool === Tool.BRUSH ? ShapeType.BRUSH :
                                        activeTool === Tool.SPRAY ? ShapeType.SPRAY :
                                            activeTool === Tool.PENCIL ? ShapeType.PENCIL : ShapeType.RECTANGLE,
                x: x,
                y: y,
                width: 0,
                height: 0,
                radius: 0,
                points: (activeTool === Tool.PENCIL || activeTool === Tool.LINE || activeTool === Tool.HIGHLIGHTER || activeTool === Tool.ERASER || activeTool === Tool.BRUSH || activeTool === Tool.SPRAY) ? [x, y, x, y] : [],
                text: '', // Explicitly initialize
                // For Pencil/Line/Highlighter/Eraser/Brush/Spray, fill is none. For others, use currentFill.
                fill: (activeTool === Tool.PENCIL || activeTool === Tool.LINE || activeTool === Tool.HIGHLIGHTER || activeTool === Tool.ERASER || activeTool === Tool.BRUSH || activeTool === Tool.SPRAY) ? 'none' : currentFill,
                stroke: activeTool === Tool.ERASER ? '#ffffff' : currentStroke,
                strokeWidth: activeTool === Tool.HIGHLIGHTER ? currentStrokeWidth * 3 :
                    activeTool === Tool.ERASER ? currentEraserSize : currentStrokeWidth,
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
        if ((activeTool !== Tool.SELECT && activeTool !== Tool.AI_MAGIC) || isSpacePressed) return;
        e.stopPropagation();

        const shape = shapes.find(s => s.id === shapeId);
        if (!shape) return;

        onSelectShape(shapeId);
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

        // ERASER LOGIC: Custom cursor explicitly set to DOM node to avoid 30fps React render lagging
        if (activeTool === Tool.ERASER) {
            const rect = internalSvgRef.current!.getBoundingClientRect();
            if (cursorRef.current) {
                cursorRef.current.setAttribute("transform", `translate(${e.clientX - rect.left}, ${e.clientY - rect.top})`);
            }
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

            if (activeTool === Tool.PENCIL || activeTool === Tool.HIGHLIGHTER || activeTool === Tool.ERASER || activeTool === Tool.BRUSH || activeTool === Tool.SPRAY) {
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

        // Save to Database
        if (currentMode === InteractionMode.DRAWING && shapeToSave) {
            if (currentTool === Tool.PENCIL || currentTool === Tool.HIGHLIGHTER || currentTool === Tool.ERASER || currentTool === Tool.BRUSH || currentTool === Tool.SPRAY) {
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
                    if (Math.sqrt(dx * dx + dy * dy) > 5) {
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
        if (cursorRef.current) cursorRef.current.setAttribute("transform", `translate(-9999, -9999)`);
    };

    const handleResetView = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    const getCursorStyle = () => {
        if (interactionMode === InteractionMode.PANNING || isSpacePressed) return 'grab';
        if (activeTool === Tool.ERASER) return 'none'; // Hide default cursor for custom eraser
        if (activeTool === Tool.SELECT || activeTool === Tool.AI_MAGIC) return 'default';
        return 'crosshair';
    };

    const renderSprayArea = (shape: Shape) => {
        if (!shape.points || shape.points.length < 2) return null;

        const startX = shape.points[0];
        const startY = shape.points[1];
        const translateX = shape.x - startX;
        const translateY = shape.y - startY;

        // Pseudo-random deterministic generator based on point coordinate
        const pseudoRandom = (seed: number) => {
            let t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };

        const radius = shape.strokeWidth;
        const dots = [];

        // Generate 15 dots per recorded point for heavier ink flow
        for (let i = 0; i < shape.points.length; i += 2) {
            const px = shape.points[i];
            const py = shape.points[i + 1];

            for (let j = 0; j < 15; j++) {
                const seed1 = px * 1000 + py + j;
                const seed2 = py * 1000 + px + j * 5;
                const r = pseudoRandom(seed1) * radius;
                const theta = pseudoRandom(seed2) * Math.PI * 2;
                const dotX = px + r * Math.cos(theta);
                const dotY = py + r * Math.sin(theta);

                const rDrop = pseudoRandom(seed1 + 99) < 0.15 ? 2.5 : 1.5;
                dots.push(<circle key={`${i}-${j}`} cx={dotX} cy={dotY} r={rDrop} fill={shape.stroke} opacity={0.6} />);
            }
        }

        return (
            <g transform={`translate(${translateX}, ${translateY})`}>
                {dots}
            </g>
        );
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
                d += ` L ${shape.points[i]} ${shape.points[i + 1]}`;
            }
        }

        return (
            <g transform={`translate(${translateX}, ${translateY})`}>
                <path
                    d={d}
                    stroke={shape.stroke}
                    strokeWidth={shape.strokeWidth}
                    fill="none"
                    strokeLinecap={shape.type === ShapeType.ERASER ? "round" : "round"}
                    strokeLinejoin={shape.type === ShapeType.ERASER ? "round" : "round"}
                    style={shape.type === ShapeType.HIGHLIGHTER ? { mixBlendMode: 'multiply', opacity: 0.6 } : undefined}
                />
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
                d += ` L ${shape.points[i]} ${shape.points[i + 1]}`;
            }
        }
        return <path
            d={d}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth}
            fill="none"
            strokeLinecap={shape.type === ShapeType.ERASER ? "round" : "round"}
            strokeLinejoin={shape.type === ShapeType.ERASER ? "round" : "round"}
            style={shape.type === ShapeType.HIGHLIGHTER ? { mixBlendMode: 'multiply', opacity: 0.6 } : undefined}
        />;
    }

    const renderSelectionOverlay = () => {
        if (!selectedShapeId) return null;
        const shape = shapes.find(s => s.id === selectedShapeId);
        if (!shape) return null;

        const padding = 5;
        const style = { fill: "none", stroke: "#3B82F6", strokeWidth: 1.5, strokeDasharray: "4,4" };

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
                    width={bounds.w + padding * 2}
                    height={bounds.h + padding * 2}
                    {...style}
                    pointerEvents="none"
                />
            </g>
        );
    };

    const renderedShapes = React.useMemo(() => {
        return shapes.map((shape) => (
            <g
                key={shape.id}
                onPointerDown={(e) => handleShapePointerDown(e, shape.id)}
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
                {(shape.type === ShapeType.SPRAY) && shape.points && (
                    renderSprayArea(shape)
                )}
                {(shape.type === ShapeType.PENCIL || shape.type === ShapeType.LINE || shape.type === ShapeType.HIGHLIGHTER || shape.type === ShapeType.ERASER || shape.type === ShapeType.BRUSH) && shape.points && (
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
        ));
    }, [shapes]);

    return (
        <div className="w-full h-full bg-white relative overflow-hidden">
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
                    {renderedShapes}

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
                            {(draftShape.type === ShapeType.SPRAY) && draftShape.points && (
                                renderSprayArea(draftShape)
                            )}
                            {(draftShape.type === ShapeType.PENCIL || draftShape.type === ShapeType.LINE || draftShape.type === ShapeType.HIGHLIGHTER || draftShape.type === ShapeType.ERASER || draftShape.type === ShapeType.BRUSH) && draftShape.points && (
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

                {/* Custom Eraser Cursor Overlay explicitly bypassing React State */}
                <g
                    ref={cursorRef}
                    pointerEvents="none"
                    style={{ display: activeTool === Tool.ERASER ? 'block' : 'none' }}
                >
                    {/* Visual circle matching eraser stroke width */}
                    <circle
                        r={currentEraserSize / 2}
                        fill="rgba(255, 255, 255, 0.4)"
                        stroke="#000000"
                        strokeWidth={1}
                        className="drop-shadow-sm"
                    />
                </g>
            </svg>

            {/* Grid Background Rendered ON TOP of SVG so Eraser doesn't hide it */}
            <div
                className="absolute inset-0 pointer-events-none opacity-10"
                style={{
                    backgroundImage: 'radial-gradient(circle, #6366f1 1px, transparent 1px)',
                    backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
                    backgroundPosition: `${pan.x}px ${pan.y}px`,
                    zIndex: 10
                }}
            />
        </div>
    );
});

export default Canvas;