import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { MessageCircle, Send, X } from 'lucide-react';
import * as THREE from 'three';
import { LivePlayer, LivePlayerState, LivePlayerCallbacks } from '../player/livePlayer.tsx';

// Responsive container hook
function useResponsiveScale() {
  const [cameraSettings, setCameraSettings] = useState({ position: [0, 1, 6], fov: 65 });
  const [isPortrait, setIsPortrait] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const updateCameraSettings = () => {
      if (!containerRef.current) return;
      
      // Check orientation
      const portrait = window.innerHeight > window.innerWidth;
      setIsPortrait(portrait);
      
      // Calculate optimal camera settings for 3D model to fit with 15% margin
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      
      // Model bounding box approximation (radio + controls + equalizers)
      const modelWidth = 10; // approximate world units
      const modelHeight = 8; // approximate world units
      
      // Available viewport with safe areas
      const availableWidth = vw * 0.9;
      const availableHeight = vh * 0.8;
      
      // Calculate required distance to fit model with 15% margin
      const aspectRatio = availableWidth / availableHeight;
      const modelAspectRatio = modelWidth / modelHeight;
      
      let fov, distance;
      
      if (aspectRatio > modelAspectRatio) {
        // Height constrained
        fov = portrait ? 75 : 65;
        distance = (modelHeight * 1.15) / (2 * Math.tan((fov * Math.PI / 180) / 2));
      } else {
        // Width constrained
        fov = portrait ? 85 : 75;
        distance = (modelWidth * 1.15) / (2 * Math.tan((fov * Math.PI / 180) / 2) * aspectRatio);
      }
      
      // Clamp values to reasonable ranges
      fov = Math.max(45, Math.min(90, fov));
      distance = Math.max(4, Math.min(12, distance));
      
      setCameraSettings({
        position: [0, portrait ? 0.5 : 1, distance],
        fov: fov
      });
    };
    
    const debouncedUpdate = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateCameraSettings, 60);
    };
    
    // Initial calculation
    updateCameraSettings();
    
    // Set up ResizeObserver
    const resizeObserver = new ResizeObserver(debouncedUpdate);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    // Listen to window resize and orientation changes
    window.addEventListener('resize', debouncedUpdate);
    window.addEventListener('orientationchange', debouncedUpdate);
    
    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', debouncedUpdate);
      window.removeEventListener('orientationchange', debouncedUpdate);
    };
  }, []);
  
  return { cameraSettings, isPortrait, containerRef };
}

// Cyberpunk Sound Effects
const createCyberpunkSounds = () => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  const playBeep = (frequency: number, duration: number, type: OscillatorType = 'sine') => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = type;
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  };
  
  const playChord = (frequencies: number[], duration: number) => {
    frequencies.forEach(freq => playBeep(freq, duration, 'square'));
  };
  
  return {
    playButton: () => {
      // Futuristic activation sound
      playBeep(800, 0.1, 'square');
      setTimeout(() => playBeep(1200, 0.15, 'sine'), 50);
    },
    
    nextTrack: () => {
      // Ascending cyberpunk beep
      playBeep(600, 0.08, 'sawtooth');
      setTimeout(() => playBeep(900, 0.08, 'sawtooth'), 80);
      setTimeout(() => playBeep(1200, 0.12, 'sine'), 160);
    },
    
    prevTrack: () => {
      // Descending cyberpunk beep
      playBeep(1200, 0.08, 'sawtooth');
      setTimeout(() => playBeep(900, 0.08, 'sawtooth'), 80);
      setTimeout(() => playBeep(600, 0.12, 'sine'), 160);
    },
    
    volumeUp: () => {
      // Rising power sound
      playChord([400, 800], 0.1);
    },
    
    volumeDown: () => {
      // Falling power sound
      playChord([800, 400], 0.1);
    },
    
    knobClick: () => {
      // Mechanical click with digital overtone
      playBeep(300, 0.05, 'square');
      setTimeout(() => playBeep(1500, 0.03, 'sine'), 20);
    }
  };
};

// Holographic Radio Component
function HolographicRadio({
  playerState,
  onTogglePlay,
  onGoLive,
  volume,
  setVolume,
  frequencyData,
  isMobile
}: {
  playerState: LivePlayerState;
  onTogglePlay: () => void;
  onGoLive: () => void;
  volume: number;
  setVolume: (vol: number) => void;
  frequencyData: Uint8Array;
  isMobile: boolean;
}) {
  const radioGroupRef = useRef<THREE.Group>(null);
  const equalizerRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const hologramRingRef = useRef<THREE.Mesh>(null);
  
  // Initialize cyberpunk sounds
  const sounds = useMemo(() => createCyberpunkSounds(), []);
  
  // Holographic materials
  const holographicMaterial = useMemo(() => {
    const material = new THREE.MeshPhongMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.7,
      emissive: 0x002244,
      shininess: 100,
      side: THREE.DoubleSide
    });
    return material;
  }, []);
  
  const glowMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide
    });
  }, []);
  
  const speakerMaterial = useMemo(() => {
    return new THREE.MeshPhongMaterial({
      color: 0x004466,
      transparent: true,
      opacity: 0.8,
      emissive: 0x001122
    });
  }, []);
  
  // Particle system for holographic effect
  const particleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const particleCount = isMobile ? 150 : 300;
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      const radius = 3 + Math.random() * 2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [isMobile]);
  
  const particleMaterial = useMemo(() => {
    return new THREE.PointsMaterial({
      color: 0x00ffff,
      size: 0.05,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });
  }, []);
  
  // Animation loop
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    
    // Planetary rotation (1 revolution per 12 seconds)
    if (radioGroupRef.current) {
      radioGroupRef.current.rotation.y = time * (Math.PI * 2) / 12;
      radioGroupRef.current.position.y = Math.sin(time * 0.5) * 0.1;
    }
    
    // Particle animation
    if (particlesRef.current) {
      particlesRef.current.rotation.y = time * 0.2;
      particlesRef.current.rotation.x = time * 0.1;
    }
    
    // Hologram ring animation
    if (hologramRingRef.current) {
      hologramRingRef.current.rotation.z = time * 2;
      hologramRingRef.current.scale.setScalar(1 + Math.sin(time * 3) * 0.1);
    }
    
    // Audio-reactive equalizer
    if (equalizerRef.current && frequencyData.length > 0) {
      const bands = 10;
      const step = Math.floor(frequencyData.length / bands);
      
      equalizerRef.current.children.forEach((child, index) => {
        if (child instanceof THREE.Mesh && index < bands) {
          const frequency = frequencyData[index * step] || 0;
          const normalizedFreq = frequency / 255;
          const targetScale = 0.5 + normalizedFreq * 2;
          
          // Smooth animation
          child.scale.y = THREE.MathUtils.lerp(child.scale.y, targetScale, 0.1);
          
          // Color based on frequency
          const material = child.material as THREE.MeshBasicMaterial;
          const hue = (normalizedFreq * 0.3 + time * 0.1) % 1;
          material.color.setHSL(hue, 1, 0.5 + normalizedFreq * 0.3);
        }
      });
    }
  });
  
  // Control handlers
  const togglePlay = () => {
    sounds.playButton();
    onTogglePlay();
  };
  
  const goLive = () => {
    sounds.nextTrack();
    onGoLive();
  };
  
  const reconnectLive = () => {
    sounds.prevTrack();
    onGoLive();
  };
  
  const volumeUp = () => {
    sounds.volumeUp();
    setVolume(Math.min(1, volume + 0.1));
  };
  
  const volumeDown = () => {
    sounds.volumeDown();
    setVolume(Math.max(0, volume - 0.1));
  };
  
  const handleKnobClick = () => {
    sounds.knobClick();
    togglePlay();
  };
  
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  const getStatusDisplay = () => {
    switch (playerState.status) {
      case 'INTRO':
        return 'INTRO';
      case 'LIVE_CONNECTING':
        return 'LIVE CONNECTING...';
      case 'LIVE_ON_AIR':
        return 'LIVE ON AIR';
      case 'LIVE_RECONNECTING':
        return `RECONNECT ${playerState.reconnectAttempts}/${playerState.maxReconnectAttempts}`;
      case 'LIVE_UNAVAILABLE':
        return 'LIVE UNAVAILABLE';
      default:
        return 'UNKNOWN';
    }
  };
  
  const getStatusColor = () => {
    switch (playerState.status) {
      case 'INTRO':
        return '#00ffff';
      case 'LIVE_CONNECTING':
        return '#ffff00';
      case 'LIVE_ON_AIR':
        return '#00ff00';
      case 'LIVE_RECONNECTING':
        return '#ff8800';
      case 'LIVE_UNAVAILABLE':
        return '#ff0000';
      default:
        return '#ffffff';
    }
  };
  
  return (
    <group>
      {/* Particle system */}
      <points ref={particlesRef} geometry={particleGeometry} material={particleMaterial} />
      
      {/* Hologram ring */}
      <mesh ref={hologramRingRef} position={[0, 0, 0]}>
        <torusGeometry args={[3.5, 0.05, 8, 32]} />
        <meshBasicMaterial color={0x00ffff} transparent opacity={0.4} />
      </mesh>
      
      {/* Main radio group */}
      <group ref={radioGroupRef}>
        {/* Radio body */}
        <mesh material={holographicMaterial}>
          <boxGeometry args={[2.5, 1.5, 1]} />
        </mesh>
        
        {/* Glow effect */}
        <mesh material={glowMaterial} scale={[1.1, 1.1, 1.1]}>
          <boxGeometry args={[2.5, 1.5, 1]} />
        </mesh>
        
        {/* Antenna */}
        <mesh position={[-1, 1.2, 0]} material={holographicMaterial}>
          <cylinderGeometry args={[0.02, 0.02, 1.5]} />
        </mesh>
        
        {/* Antenna tip */}
        <mesh position={[-1, 1.95, 0]} material={holographicMaterial}>
          <sphereGeometry args={[0.05]} />
        </mesh>
        
        {/* Left speaker */}
        <mesh position={[-0.8, 0, 0.51]} material={speakerMaterial}>
          <cylinderGeometry args={[0.3, 0.3, 0.1]} />
        </mesh>
        
        {/* Right speaker */}
        <mesh position={[0.8, 0, 0.51]} material={speakerMaterial}>
          <cylinderGeometry args={[0.3, 0.3, 0.1]} />
        </mesh>
        
        {/* Speaker grilles */}
        {[-0.8, 0.8].map((x, speakerIndex) => (
          <group key={speakerIndex} position={[x, 0, 0.52]}>
            {Array.from({ length: 5 }, (_, i) => (
              <mesh key={i} position={[0, (i - 2) * 0.08, 0]}>
                <boxGeometry args={[0.4, 0.02, 0.01]} />
                <meshBasicMaterial color={0x00ffff} transparent opacity={0.6} />
              </mesh>
            ))}
          </group>
        ))}
        
        {/* Control knobs */}
        <mesh 
          position={[0, -0.4, 0.51]} 
          material={holographicMaterial}
          onClick={handleKnobClick}
          onPointerOver={() => document.body.style.cursor = 'pointer'}
          onPointerOut={() => document.body.style.cursor = 'default'}
        >
          <cylinderGeometry args={[0.15, 0.15, 0.1]} />
        </mesh>
        
        <mesh 
          position={[-0.5, -0.4, 0.51]} 
          material={holographicMaterial}
          onClick={playerState.status === 'LIVE_UNAVAILABLE' ? () => {
            sounds.knobClick();
            reconnectLive();
          } : undefined}
          onPointerOver={() => document.body.style.cursor = 'pointer'}
          onPointerOut={() => document.body.style.cursor = 'default'}
        >
          <cylinderGeometry args={[0.1, 0.1, 0.08]} />
        </mesh>
        
        <mesh 
          position={[0.5, -0.4, 0.51]} 
          material={holographicMaterial}
          onClick={playerState.status !== 'LIVE_ON_AIR' ? () => {
            sounds.knobClick();
            goLive();
          } : undefined}
          onPointerOver={() => document.body.style.cursor = 'pointer'}
          onPointerOut={() => document.body.style.cursor = 'default'}
        >
          <cylinderGeometry args={[0.1, 0.1, 0.08]} />
        </mesh>
        
        {/* Display screen */}
        <mesh position={[0, 0.3, 0.51]}>
          <planeGeometry args={[1.5, 0.4]} />
          <meshBasicMaterial color={0x001122} transparent opacity={0.8} />
        </mesh>
        
        {/* Display content */}
        <Html position={[0, 0.3, 0.52]} center style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(0, 255, 255, 0.1)',
            border: '1px solid #00ffff',
            borderRadius: '4px',
            padding: '4px 8px',
            color: '#00ffff',
            fontSize: isMobile ? '8px' : '10px',
            fontFamily: 'monospace',
            textAlign: 'center',
            minWidth: isMobile ? '100px' : '120px',
            backdropFilter: 'blur(5px)',
            display: isMobile ? 'none' : 'block'
          }}>
            <div style={{ color: getStatusColor() }}>{getStatusDisplay()}</div>
            {playerState.status === 'INTRO' && (
              <div>{formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}</div>
            )}
            <div>{playerState.isPlaying ? '♪ PLAYING' : '⏸ PAUSED'}</div>
          </div>
        </Html>
        
        {/* Volume indicator */}
        <group position={[0, -0.7, 0.51]}>
          {Array.from({ length: 10 }, (_, i) => (
            <mesh 
              key={i} 
              position={[-0.45 + i * 0.1, 0, 0]}
              material={new THREE.MeshBasicMaterial({
                color: i < volume * 10 ? 0x00ff00 : 0x004400,
                transparent: true,
                opacity: 0.8
              })}
            >
              <boxGeometry args={[0.08, 0.05, 0.02]} />
            </mesh>
          ))}
        </group>
      </group>
      
      {/* Audio-reactive equalizer */}
      <group ref={equalizerRef} position={isMobile ? [0, -2, 0] : [0, -2.5, 0]}>
        {Array.from({ length: isMobile ? 8 : 10 }, (_, i) => (
          <mesh 
            key={i} 
            position={isMobile ? [-1.75 + i * 0.5, 0, 0] : [-2.25 + i * 0.5, 0, 0]}
            material={new THREE.MeshBasicMaterial({
              color: 0x00ffff,
              transparent: true,
              opacity: 0.8
            })}
          >
            <boxGeometry args={isMobile ? [0.25, 0.8, 0.25] : [0.3, 1, 0.3]} />
          </mesh>
        ))}
      </group>
      
      {/* Circular equalizer around radio */}
      <group position={[0, 0, 0]}>
        {Array.from({ length: isMobile ? 12 : 16 }, (_, i) => {
          const totalBars = isMobile ? 12 : 16;
          const angle = (i / totalBars) * Math.PI * 2;
          const radius = isMobile ? 3.5 : 4;
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;
          
          return (
            <mesh 
              key={i} 
              position={[x, 0, z]}
              rotation={[0, angle, 0]}
              material={new THREE.MeshBasicMaterial({
                color: 0x00ffff,
                transparent: true,
                opacity: 0.6
              })}
            >
              <boxGeometry args={isMobile ? [0.08, 0.8, 0.08] : [0.1, 1, 0.1]} />
            </mesh>
          );
        })}
      </group>
      
      {/* Status indicator in top right */}
      <Html position={isMobile ? [1.8, 2.2, 0] : [2.8, 3.2, 0]} center>
        <div style={{
          background: 'rgba(0, 0, 0, 0.8)',
          border: `1px solid ${getStatusColor()}`,
          borderRadius: '8px',
          padding: 'clamp(4px, 1vw, 8px) clamp(6px, 1.5vw, 12px)',
          color: getStatusColor(),
          fontSize: 'clamp(9px, 1.8vw, 12px)',
          fontFamily: 'monospace',
          textAlign: 'center',
          backdropFilter: 'blur(5px)',
          minWidth: 'clamp(70px, 15vw, 100px)',
          maxWidth: '25vw',
          marginTop: `max(env(safe-area-inset-top), 10px)`
        }}>
          {getStatusDisplay()}
        </div>
      </Html>
      
      {/* Control buttons UI */}
      <Html position={isMobile ? [0, -3.2, 0] : [0, -4.2, 0]} center>
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 'clamp(15px, 3vw, 25px)',
          alignItems: 'center',
          background: 'rgba(0, 0, 0, 0.7)',
          padding: isMobile ? 'clamp(15px, 4vw, 20px) clamp(20px, 6vw, 30px)' : 'clamp(12px, 2vw, 15px) clamp(20px, 4vw, 25px)',
          borderRadius: '15px',
          border: '1px solid #00ffff',
          backdropFilter: 'blur(10px)',
          maxWidth: 'min(90vw, 600px)',
          boxSizing: 'border-box',
          marginBottom: `max(env(safe-area-inset-bottom), 10px)`
        }}>
          {/* Main playback controls */}
          <div style={{
            display: 'flex',
            gap: 'clamp(15px, 3vw, 25px)',
            alignItems: 'center'
          }}>
            <button
              onClick={playerState.status === 'LIVE_UNAVAILABLE' ? reconnectLive : undefined}
              style={{
                background: playerState.status === 'LIVE_UNAVAILABLE' ? 'rgba(255, 0, 0, 0.2)' : 'transparent',
                border: `1px solid ${playerState.status === 'LIVE_UNAVAILABLE' ? '#ff0000' : '#666666'}`,
                color: playerState.status === 'LIVE_UNAVAILABLE' ? '#ff0000' : '#666666',
                padding: 'clamp(8px, 2vw, 12px) clamp(12px, 3vw, 16px)',
                borderRadius: '8px',
                cursor: playerState.status === 'LIVE_UNAVAILABLE' ? 'pointer' : 'not-allowed',
                fontFamily: 'monospace',
                fontSize: 'clamp(14px, 3vw, 18px)',
                minWidth: 'clamp(40px, 8vw, 50px)',
                minHeight: 'clamp(40px, 8vw, 50px)',
                touchAction: 'manipulation',
                opacity: playerState.status === 'LIVE_UNAVAILABLE' ? 1 : 0.5
              }}
              disabled={playerState.status !== 'LIVE_UNAVAILABLE'}
            >
              🔄
            </button>
            
            <button
              onClick={togglePlay}
              style={{
                background: playerState.isPlaying ? 'rgba(0, 255, 0, 0.2)' : 'rgba(0, 255, 255, 0.2)',
                border: `1px solid ${playerState.isPlaying ? '#00ff00' : '#00ffff'}`,
                color: playerState.isPlaying ? '#00ff00' : '#00ffff',
                padding: 'clamp(10px, 2.5vw, 15px) clamp(15px, 4vw, 20px)',
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: 'clamp(16px, 4vw, 24px)',
                minWidth: 'clamp(50px, 10vw, 60px)',
                minHeight: 'clamp(50px, 10vw, 60px)',
                touchAction: 'manipulation'
              }}
            >
              {playerState.isPlaying ? '⏸' : '▶'}
            </button>
            
            <button
              onClick={playerState.status !== 'LIVE_ON_AIR' ? goLive : undefined}
              style={{
                background: playerState.status === 'LIVE_ON_AIR' ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 255, 0, 0.2)',
                border: `1px solid ${playerState.status === 'LIVE_ON_AIR' ? '#00ff00' : '#ffff00'}`,
                color: playerState.status === 'LIVE_ON_AIR' ? '#00ff00' : '#ffff00',
                padding: 'clamp(8px, 2vw, 12px) clamp(12px, 3vw, 16px)',
                borderRadius: '8px',
                cursor: playerState.status !== 'LIVE_ON_AIR' ? 'pointer' : 'default',
                fontFamily: 'monospace',
                fontSize: 'clamp(14px, 3vw, 18px)',
                minWidth: 'clamp(40px, 8vw, 50px)',
                minHeight: 'clamp(40px, 8vw, 50px)',
                touchAction: 'manipulation',
                opacity: playerState.status === 'LIVE_ON_AIR' ? 0.7 : 1
              }}
              disabled={playerState.status === 'LIVE_ON_AIR'}
            >
              {playerState.status === 'LIVE_ON_AIR' ? '📡' : '🔴'}
            </button>
          </div>
          
          {/* Volume controls */}
          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'row' : 'column',
            alignItems: 'center',
            gap: 'clamp(5px, 1vw, 15px)'
          }}>
            <button
              onClick={volumeUp}
              style={{
                background: 'transparent',
                border: '1px solid #00ffff',
                color: '#00ffff',
                padding: 'clamp(4px, 1vw, 10px) clamp(8px, 2vw, 14px)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: 'clamp(12px, 3vw, 18px)',
                minWidth: 'clamp(35px, 7vw, 45px)',
                minHeight: 'clamp(35px, 7vw, 45px)',
                touchAction: 'manipulation'
              }}
            >
              +
            </button>
            
            <span style={{
              color: '#00ffff',
              fontSize: 'clamp(10px, 2vw, 14px)',
              fontFamily: 'monospace',
              minWidth: 'clamp(40px, 8vw, 50px)',
              textAlign: 'center'
            }}>
              {Math.round(volume * 100)}%
            </span>
            
            <button
              onClick={volumeDown}
              style={{
                background: 'transparent',
                border: '1px solid #00ffff',
                color: '#00ffff',
                padding: 'clamp(4px, 1vw, 10px) clamp(8px, 2vw, 14px)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: 'clamp(12px, 3vw, 18px)',
                minWidth: 'clamp(35px, 7vw, 45px)',
                minHeight: 'clamp(35px, 7vw, 45px)',
                touchAction: 'manipulation'
              }}
            >
              -
            </button>
          </div>
          
          {/* Track info for mobile */}
          {isMobile && (
            <div style={{
              color: '#00ffff',
              fontSize: 'clamp(10px, 2vw, 12px)',
              fontFamily: 'monospace',
              textAlign: 'center',
              background: 'rgba(0, 255, 255, 0.1)',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(0, 255, 255, 0.3)'
            }}>
              <div style={{ color: getStatusColor() }}>{getStatusDisplay()}</div>
              {playerState.status === 'INTRO' && (
                <div>{formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}</div>
              )}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

// Lighting setup
function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <pointLight position={[-5, 5, 5]} intensity={1.5} color="#00ffff" />
      <pointLight position={[5, -5, 5]} intensity={1.5} color="#ff00ff" />
      <pointLight position={[0, 0, 10]} intensity={1} color="#ffffff" />
    </>
  );
}

// Main component
export default function FuturisticMusicPlayer() {
  const { cameraSettings, isPortrait, containerRef } = useResponsiveScale();
  const [volume, setVolume] = useState(0.5);
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(128));
  const [isMobile, setIsMobile] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{id: number, text: string, timestamp: Date, isUser: boolean}>>([
    { id: 1, text: "Welcome to the ego chat zone! 🚀", timestamp: new Date(), isUser: false },
    { id: 2, text: "Your thoughts are safe here...", timestamp: new Date(), isUser: false }
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [playerState, setPlayerState] = useState<LivePlayerState>({
    status: 'INTRO',
    isPlaying: false,
    volume: 0.5,
    currentTime: 0,
    duration: 0,
    reconnectAttempts: 0,
    maxReconnectAttempts: 10
  });
  
  const livePlayerRef = useRef<LivePlayer | null>(null);
  
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|samsung/.test(userAgent);
      const isSmallScreen = window.innerWidth <= 768 || window.innerHeight <= 600;
      const isVerticalScreen = window.innerHeight > window.innerWidth;
      setIsMobile(isMobileDevice || isSmallScreen || isVerticalScreen);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  useEffect(() => {
    const callbacks: LivePlayerCallbacks = {
      onStateChange: (state) => {
        setPlayerState(state);
      },
      onFrequencyData: (data) => {
        setFrequencyData(data);
      },
      onTimeUpdate: (time) => {
        // Time updates handled in state
      },
      onDurationChange: (duration) => {
        // Duration updates handled in state
      }
    };
    
    livePlayerRef.current = new LivePlayer(callbacks);
    
    // Initialize only - don't auto-start
    livePlayerRef.current.init().then(() => {
      // Ready for user interaction
    }).catch(error => {
      console.error('Failed to initialize live player:', error);
    });
    
    return () => {
      livePlayerRef.current?.teardown();
    };
  }, []);
  
  useEffect(() => {
    if (livePlayerRef.current) {
      livePlayerRef.current.setVolume(volume);
    }
  }, [volume]);
  
  const handleTogglePlay = () => {
    if (livePlayerRef.current) {
      livePlayerRef.current.togglePlayPause();
    }
  };
  
  const handleGoLive = () => {
    if (livePlayerRef.current) {
      livePlayerRef.current.goLiveNow();
    }
  };
  
  const handleSendMessage = () => {
    if (newMessage.trim()) {
      const userMessage = {
        id: Date.now(),
        text: newMessage,
        timestamp: new Date(),
        isUser: true
      };
      
      setChatMessages(prev => [...prev, userMessage]);
      setNewMessage('');
      
      // Auto-reply from ego after a delay
      setTimeout(() => {
        const egoReplies = [
          "Interesting perspective... 🤔",
          "The universe is listening... ✨",
          "Your thoughts echo in the void... 🌌",
          "Processing your consciousness... 🧠",
          "The galaxy acknowledges your input... 🌟",
          "Ego.exe has received your message... 💭"
        ];
        
        const randomReply = egoReplies[Math.floor(Math.random() * egoReplies.length)];
        const egoMessage = {
          id: Date.now() + 1,
          text: randomReply,
          timestamp: new Date(),
          isUser: false
        };
        
        setChatMessages(prev => [...prev, egoMessage]);
      }, 1000 + Math.random() * 2000);
    }
  };
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  return (
    <div 
      ref={containerRef}
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: 'radial-gradient(circle at center, #001122 0%, #000000 70%)',
        // Safe area support
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)'
      }}
    >
      {/* Chat Toggle Button */}
      <div style={{
        position: 'fixed',
        top: 'max(env(safe-area-inset-top), 20px)',
        right: 'max(env(safe-area-inset-right), 20px)',
        zIndex: 1000
      }}>
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          style={{
            background: 'rgba(0, 0, 0, 0.8)',
            border: '1px solid #00ffff',
            borderRadius: '50%',
            width: '50px',
            height: '50px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#00ffff',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.3s ease'
          }}
        >
          <MessageCircle size={24} />
        </button>
      </div>

      {/* Ego Chat Panel */}
      {isChatOpen && (
        <div style={{
          position: 'fixed',
          top: 'max(env(safe-area-inset-top), 0px)',
          right: isChatOpen ? '0px' : '-400px',
          width: isMobile ? '100vw' : '400px',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.95)',
          border: isMobile ? 'none' : '1px solid #00ffff',
          borderRight: 'none',
          backdropFilter: 'blur(15px)',
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          transition: 'right 0.3s ease',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)'
        }}>
          {/* Chat Header */}
          <div style={{
            padding: '20px',
            borderBottom: '1px solid #00ffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h3 style={{
              color: '#00ffff',
              margin: 0,
              fontFamily: 'Orbitron, monospace',
              fontSize: '18px',
              fontWeight: '600'
            }}>
              EGO CHAT
            </h3>
            <button
              onClick={() => setIsChatOpen(false)}
              style={{
                background: 'transparent',
                border: '1px solid #ff0066',
                borderRadius: '4px',
                color: '#ff0066',
                padding: '5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Chat Messages */}
          <div style={{
            flex: 1,
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px'
          }}>
            {chatMessages.map((message) => (
              <div
                key={message.id}
                style={{
                  alignSelf: message.isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '80%'
                }}
              >
                <div style={{
                  background: message.isUser 
                    ? 'linear-gradient(135deg, #00ffff, #0088cc)' 
                    : 'linear-gradient(135deg, #ff0066, #cc0044)',
                  color: message.isUser ? '#000' : '#fff',
                  padding: '10px 15px',
                  borderRadius: message.isUser ? '15px 15px 5px 15px' : '15px 15px 15px 5px',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  wordWrap: 'break-word'
                }}>
                  {message.text}
                </div>
                <div style={{
                  fontSize: '10px',
                  color: '#666',
                  marginTop: '5px',
                  textAlign: message.isUser ? 'right' : 'left',
                  fontFamily: 'monospace'
                }}>
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>

          {/* Chat Input */}
          <div style={{
            padding: '20px',
            borderTop: '1px solid #00ffff',
            display: 'flex',
            gap: '10px'
          }}>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Share your thoughts with the void..."
              style={{
                flex: 1,
                background: 'rgba(0, 255, 255, 0.1)',
                border: '1px solid #00ffff',
                borderRadius: '8px',
                padding: '10px 15px',
                color: '#00ffff',
                fontSize: '14px',
                fontFamily: 'monospace',
                outline: 'none'
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!newMessage.trim()}
              style={{
                background: newMessage.trim() 
                  ? 'linear-gradient(135deg, #00ffff, #0088cc)' 
                  : 'rgba(0, 255, 255, 0.3)',
                border: '1px solid #00ffff',
                borderRadius: '8px',
                padding: '10px 15px',
                color: newMessage.trim() ? '#000' : '#666',
                cursor: newMessage.trim() ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease'
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative'
      }}>
        <div style={{
          width: '100%', 
          height: '100%',
          touchAction: 'manipulation'
        }}>
          <Canvas
            camera={{ 
              position: cameraSettings.position as [number, number, number], 
              fov: cameraSettings.fov
            }}
            gl={{
              alpha: true,
              powerPreference: isMobile ? "default" : "high-performance",
              antialias: true
            }}
            controls={false}
            style={{ 
              touchAction: 'none',
              width: '100%',
              height: '100%',
              display: 'block'
            }}
          >
            <SceneLighting />
            <HolographicRadio
              playerState={playerState}
              onTogglePlay={handleTogglePlay}
              onGoLive={handleGoLive}
              volume={volume}
              setVolume={setVolume}
              frequencyData={frequencyData}
              isMobile={isMobile}
            />
          </Canvas>
        </div>
      </div>
    </div>
  );
}