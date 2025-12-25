import React from 'react';
import { useState } from 'react';
import FuturisticMusicPlayer from './components/FuturisticMusicPlayer';
import SplashScreen from './components/SplashScreen';

function App() {
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  return <FuturisticMusicPlayer />;
}

export default App;