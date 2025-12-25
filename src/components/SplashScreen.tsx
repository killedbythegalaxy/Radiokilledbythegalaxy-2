import React, { useState, useEffect, useRef } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedData = () => {
      setIsLoading(false);
      
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setNeedsUserInteraction(false);
          })
          .catch(() => {
            setNeedsUserInteraction(true);
          });
      }
    };

    const handleEnded = () => {
      setTimeout(() => {
        onComplete();
      }, 500);
    };

    const handleError = () => {
      setIsLoading(false);
      setHasError(true);
      setTimeout(() => {
        onComplete();
      }, 2000);
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    const loadTimeout = setTimeout(() => {
      if (isLoading) {
        setHasError(true);
        setIsLoading(false);
        setTimeout(() => {
          onComplete();
        }, 1000);
      }
    }, 8000);

    return () => {
      clearTimeout(loadTimeout);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
    };
  }, [onComplete, isLoading]);

  const startVideo = () => {
    const video = videoRef.current;
    if (!video) return;

    video.play().then(() => {
      setNeedsUserInteraction(false);
    }).catch(() => {
      setTimeout(() => {
        onComplete();
      }, 2000);
    });
  };

  if (hasError) {
    return (
      <div className="splash-container">
        <div className="splash-error">
          <div className="error-content">
            <div className="error-icon">🚀</div>
            <h2>Loading...</h2>
            <p>Continuing to main app...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="splash-container">
      {isLoading && (
        <div className="splash-loading">
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <h2>Welcome Player A!</h2>
            <p>Loading CAT SUPERMAN...</p>
          </div>
        </div>
      )}

      <div className="video-wrapper">
        <video
          ref={videoRef}
          className="splash-video"
          playsInline
          preload="auto"
        >
          <source src="/cat.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>

        <div className="text-overlay">
          <div className="overlay-text">
            Powered by introversion, loneliness, and the motto "Don't panic."
          </div>
        </div>
      </div>

      {needsUserInteraction && !isLoading && (
        <div className="tap-to-start">
          <button onClick={startVideo} className="start-button">
            Tap to start
          </button>
        </div>
      )}
    </div>
  );
}