import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import ResultPage from './pages/ResultPage';

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="h-screen w-screen overflow-hidden select-none">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/lobby/:roomCode" element={<LobbyPage />} />
          <Route path="/game/:roomCode" element={<GamePage />} />
          <Route path="/results/:roomCode" element={<ResultPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
