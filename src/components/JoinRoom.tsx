import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface JoinRoomProps {
  onJoinRoom: (roomId: string) => void;
}

type Mode = 'join' | 'create';

const JoinRoom: React.FC<JoinRoomProps> = ({ onJoinRoom }) => {
  const [mode, setMode] = useState<Mode>('join');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedCode = inviteCode.trim();
    if (!trimmedCode) {
      setError('Please enter an invite code');
      return;
    }

    // Basic validation - room IDs are typically 8 characters (from uuidv4().slice(0, 8))
    if (trimmedCode.length < 4) {
      setError('Invite code must be at least 4 characters');
      return;
    }

    setError('');
    onJoinRoom(trimmedCode);
  };

  const handleCreateRoom = () => {
    const newRoomId = uuidv4().slice(0, 8); // Short ID for easier sharing
    onJoinRoom(newRoomId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">CollabCanvas</h1>
          <p className="text-gray-600">Collaborative drawing made simple</p>
        </div>

        {/* Mode Toggle */}
        <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
          <button
            onClick={() => setMode('join')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              mode === 'join'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Join Room
          </button>
          <button
            onClick={() => setMode('create')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              mode === 'create'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Create Room
          </button>
        </div>

        {mode === 'join' ? (
          <>
            <form onSubmit={handleJoinSubmit} className="space-y-6">
              <div>
                <label htmlFor="inviteCode" className="block text-sm font-medium text-gray-700 mb-2">
                  Invite Code
                </label>
                <input
                  type="text"
                  id="inviteCode"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Enter your invite code..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                  autoFocus
                />
                {error && (
                  <p className="mt-2 text-sm text-red-600">{error}</p>
                )}
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Join Room
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                Need an invite code? Ask the room creator to share their canvas link.
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-gray-600 mb-6">
                Create a new collaborative drawing room that others can join.
              </p>
              <button
                onClick={handleCreateRoom}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                Create New Room
              </button>
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-500">
                After creating, share the invite code with others to collaborate.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default JoinRoom;