import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, User, Users, Swords, History } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <nav className="bg-[#16213e] border-b border-[#0f3460] px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-white no-underline">
          <Swords className="w-6 h-6 text-amber-400" />
          ChessGame
        </Link>

        <div className="flex items-center gap-1">
          <Link
            to="/"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-300 hover:bg-[#1a1a2e] hover:text-white transition no-underline"
          >
            <Swords className="w-4 h-4" />
            Play
          </Link>
          <Link
            to="/friends"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-300 hover:bg-[#1a1a2e] hover:text-white transition no-underline"
          >
            <Users className="w-4 h-4" />
            Friends
          </Link>
          <Link
            to="/games"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-300 hover:bg-[#1a1a2e] hover:text-white transition no-underline"
          >
            <History className="w-4 h-4" />
            Games
          </Link>
          <Link
            to={`/profile/${user.username}`}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-300 hover:bg-[#1a1a2e] hover:text-white transition no-underline"
          >
            <User className="w-4 h-4" />
            {user.username}
            <span className="text-xs text-amber-400">({user.rating})</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-400 hover:bg-red-900/30 hover:text-red-400 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </nav>
  );
}
