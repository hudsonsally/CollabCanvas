import React, { useEffect, useState, useRef } from 'react';
import { initFirebase, subscribeToShapes, subscribeToCursors, addShapeToRemote, clearCanvasRemote, updateShapeInRemote, deleteShapeFromRemote, createRoomRemote } from './services/firebase';
import { initializeAuth, signOut } from './services/authService';
import { Shape, Tool, UserCursor, ShapeType } from './types';
import { USER_COLORS, DEFAULT_FILL, DEFAULT_STROKE } from './constants';
import Canvas from './components/Canvas';
import Toolbar from './components/Toolbar';
import AiSidebar from './components/AiSidebar';
import PropertiesPanel from './components/PropertiesPanel';
import JoinRoom from './components/JoinRoom';
import Login from './components/Login';
import { useAuth } from './contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';

const USER_ID = Math.random().toString(36).substr(2, 9);
const USER_COLOR = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
const NAMES = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Casey', 'Riley'];
const USER_NAME = NAMES[Math.floor(Math.random() * NAMES.length)];

// Helper to get room ID from URL
const getRoomIdFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room');
};

const App: React.FC = () => {
    const { user, isLoading: authLoading } = useAuth();
    const [roomId, setRoomId] = useState<string | null>(getRoomIdFromUrl());
    const [shapes, setShapes] = useState<Shape[]>([]);
    const [cursors, setCursors] = useState<UserCursor[]>([]);
    const [activeTool, setActiveTool] = useState<Tool>(Tool.SELECT);
    const [isAiOpen, setIsAiOpen] = useState(false);
    const [firebaseError, setFirebaseError] = useState(false);
    const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [showLogin, setShowLogin] = useState(false);

    // Color & Style State
    const [strokeColor, setStrokeColor] = useState<string>('#000000');
    const [fillColor, setFillColor] = useState<string>('transparent');
    const [strokeWidth, setStrokeWidth] = useState<number>(3);
    const [eraserSize, setEraserSize] = useState<number>(10);

    const svgRef = useRef<SVGSVGElement>(null);

    // Initialize auth on component mount
    useEffect(() => {
        initializeAuth();
        initFirebase();
    }, []);

    // Handle joining a room with invite code
    const handleJoinRoom = (inviteCode: string) => {
        const newRoomId = inviteCode.trim();
        setRoomId(newRoomId);
        // Update URL with the room parameter
        const newUrl = `${window.location.pathname}?room=${newRoomId}`;
        window.history.replaceState({}, '', newUrl);
    };

    const handleCreateRoom = async () => {
        if (!user) {
            setShowLogin(true);
            return;
        }

        const newRoomId = uuidv4().slice(0, 8);
        try {
            await createRoomRemote(newRoomId);
            handleJoinRoom(newRoomId);
        } catch (error) {
            console.error('Failed to create room:', error);
        }
    };

    const handleShowLogin = () => {
        setShowLogin(true);
    };

    useEffect(() => {
        if (user) {
            setShowLogin(false);
        }
    }, [user]);

    // Sync Room ID with URL
    useEffect(() => {
        if (roomId) {
            const params = new URLSearchParams(window.location.search);
            if (params.get('room') !== roomId) {
                const newUrl = `${window.location.pathname}?room=${roomId}`;
                window.history.replaceState({}, '', newUrl);
            }
        }
    }, [roomId]);

    useEffect(() => {
        if (!roomId) return; // Don't initialize Firebase until we have a room

        const db = initFirebase();
        if (!db) {
            setFirebaseError(true);
            setShapes([]);
            return;
        }

        const unsubscribeShapes = subscribeToShapes(roomId, (newShapes) => {
            setShapes(newShapes);
        });

        const unsubscribeCursors = subscribeToCursors(roomId, USER_ID, (newCursors) => {
            setCursors(newCursors);
        });

        return () => {
            unsubscribeShapes();
            unsubscribeCursors();
        };
    }, [roomId]);

    const handleToolChange = (tool: Tool) => {
        setActiveTool(tool);
        if (tool !== Tool.SELECT) {
            setSelectedShapeId(null);
        }
        if (tool === Tool.AI_MAGIC) {
            setIsAiOpen(true);
        }
    };

    const handleAiClose = () => {
        setIsAiOpen(false);
        setActiveTool(Tool.SELECT);
    };

    const handleAddGeneratedShapes = (generatedShapes: Partial<Shape>[]) => {
        generatedShapes.forEach(partial => {
            const newShape: Shape = {
                id: uuidv4(),
                type: (partial.type as ShapeType) || ShapeType.RECTANGLE,
                x: partial.x || 100,
                y: partial.y || 100,
                width: partial.width || 50,
                height: partial.height || 50,
                radius: partial.radius || 25,
                text: partial.text || '',
                fill: partial.fill || fillColor,
                stroke: partial.stroke || strokeColor,
                strokeWidth: 2,
                createdAt: Date.now(),
                points: partial.points
            };
            if (newShape.type === ShapeType.CIRCLE && !newShape.radius) newShape.radius = 30;

            if (firebaseError) {
                setShapes(prev => [...prev, newShape]);
            } else {
                addShapeToRemote(roomId!, newShape);
            }
        });
    };

    const handleUpdateShape = (updates: Partial<Shape>) => {
        if (selectedShapeId) {
            updateShapeInRemote(roomId!, selectedShapeId, updates);
        }
    };

    const handleDeleteShape = async () => {
        if (selectedShapeId) {
            await deleteShapeFromRemote(roomId!, selectedShapeId);
            setSelectedShapeId(null);
        }
    };

    const handleBringToFront = () => {
        if (selectedShapeId) {
            updateShapeInRemote(roomId!, selectedShapeId, { createdAt: Date.now() });
        }
    };

    const handleSendToBack = () => {
        if (selectedShapeId && shapes.length > 0) {
            const minTime = Math.min(...shapes.map(s => s.createdAt));
            updateShapeInRemote(roomId!, selectedShapeId, { createdAt: minTime - 1000 });
        }
    };

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleExport = () => {
        if (!svgRef.current) return;
        const svgData = new XMLSerializer().serializeToString(svgRef.current);
        const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `canvas-${roomId}-${Date.now()}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleSignOut = async () => {
        try {
            await signOut();
        } catch (error) {
            console.error('Failed to sign out:', error);
        }
    };

    const selectedShape = shapes.find(s => s.id === selectedShapeId);

    // Show loading screen while checking authentication
    if (authLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-gray-900 mb-4">CollabCanvas</h1>
                    <p className="text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    // If the user specifically requested login, show the login page
    if (showLogin && !user) {
        return <Login />;
    }

    // If no room ID, show join room page
    if (!roomId) {
        return <JoinRoom onJoinRoom={handleJoinRoom} onCreateRoom={handleCreateRoom} onShowLogin={handleShowLogin} user={user} />;
    }

    return (
        <div className="w-full h-full flex flex-col overflow-hidden bg-gray-100">
            <div className="absolute top-4 right-4 z-50 flex gap-2 items-center">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${!firebaseError ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    <span className="text-xs font-medium text-gray-500">{!firebaseError ? 'Online' : 'Offline'}</span>
                </div>

                {/* Share Button moved here for visibility */}
                <button
                    onClick={handleShare}
                    className={`px-3 py-1 rounded-full text-xs font-medium shadow-sm border transition-colors flex items-center gap-1 ${copied
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white border-transparent'
                        }`}
                >
                    {copied ? (
                        <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            Copied!
                        </>
                    ) : (
                        <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Invite
                        </>
                    )}
                </button>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-sm border border-gray-200">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: USER_COLOR }}></span>
                        <span className="text-xs font-medium text-gray-600">{user?.email || `${USER_NAME} (Guest)`}</span>
                    </div>
                    {user ? (
                        <button
                            onClick={handleSignOut}
                            className="px-3 py-1 rounded-full text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                            Sign Out
                        </button>
                    ) : (
                        <button
                            onClick={handleShowLogin}
                            className="px-3 py-1 rounded-full text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                            Sign In
                        </button>
                    )}
                </div>
            </div>

            <Toolbar
                activeTool={activeTool}
                setTool={handleToolChange}
                onClear={() => !firebaseError && clearCanvasRemote(roomId)}
                onExport={handleExport}
                strokeColor={strokeColor}
                setStrokeColor={setStrokeColor}
                fillColor={fillColor}
                setFillColor={setFillColor}
                strokeWidth={strokeWidth}
                setStrokeWidth={setStrokeWidth}
                eraserSize={eraserSize}
                setEraserSize={setEraserSize}
            />

            {selectedShape && (
                <PropertiesPanel
                    selectedShape={selectedShape}
                    onUpdate={handleUpdateShape}
                    onDelete={handleDeleteShape}
                    onBringToFront={handleBringToFront}
                    onSendToBack={handleSendToBack}
                />
            )}

            <div className="flex-1 relative">
                <Canvas
                    ref={svgRef}
                    roomId={roomId}
                    shapes={shapes}
                    activeTool={activeTool}
                    setTool={handleToolChange}
                    cursors={cursors}
                    userId={USER_ID}
                    userName={USER_NAME}
                    userColor={USER_COLOR}
                    selectedShapeId={selectedShapeId}
                    onSelectShape={setSelectedShapeId}
                    currentStroke={strokeColor}
                    currentFill={fillColor}
                    currentStrokeWidth={strokeWidth}
                    currentEraserSize={eraserSize}
                />

                <AiSidebar
                    isOpen={isAiOpen}
                    onClose={handleAiClose}
                    onAddShapes={handleAddGeneratedShapes}
                    currentShapes={shapes}
                />
            </div>
        </div>
    );
};

export default App;