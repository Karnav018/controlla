import { useEffect } from 'react';

function App() {
  useEffect(() => {
    window.location.href = `${window.location.protocol}//${window.location.hostname}:3000/host`;
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0c12', color: '#fff', fontFamily: 'sans-serif' }}>
      <h2>Redirecting to Controlla Scribble Game...</h2>
    </div>
  );
}

export default App;
