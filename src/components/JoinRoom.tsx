import React, { useState } from 'react';
import { User } from 'firebase/auth';

interface JoinRoomProps {
  user: User | null;
  onJoinRoom: (roomId: string) => void;
  onCreateRoom: () => void;
  onShowLogin: () => void;
}


const JoinRoom: React.FC<JoinRoomProps> = ({ user, onJoinRoom, onCreateRoom, onShowLogin }) => {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">CollabCanvas</h1>
          <p className="text-gray-600">Collaborative drawing made simple</p>
        </div>

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

        <div className="mt-8 space-y-4">
          {user ? (
            <>
              <button
                type="button"
                onClick={onCreateRoom}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                Create New Room
              </button>
              <p className="text-sm text-gray-500 text-center">
                Signed in as <span className="font-medium text-gray-700">{user.email}</span>. You can create rooms and invite others.
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onShowLogin}
                className="w-full bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 px-4 rounded-lg border border-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Sign In to Create Room
              </button>
              <p className="text-sm text-gray-500 text-center">
                You can still join an existing room and collaborate as a guest.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default JoinRoom;