import React, { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  CameraOff,
  QrCode,
  X,
  FlipHorizontal,
  Zap,
  ZapOff,
  CheckCircle2,
  AlertCircle,
  Upload,
  RefreshCw,
  Sparkles,
  Info
} from 'lucide-react';
import { Attendee, CheckInResponse } from '../types';

interface ScannerViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (attendeeIdOrQr: string) => Promise<CheckInResponse>;
  attendees: Attendee[];
}

export const ScannerViewModal: React.FC<ScannerViewModalProps> = ({
  isOpen,
  onClose,
  onScan,
  attendees
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);

  const [isProcessingDetection, setIsProcessingDetection] = useState<boolean>(false);
  const [lastScannedResult, setLastScannedResult] = useState<{
    code: string;
    attendee?: Attendee;
    response?: CheckInResponse;
    timestamp: number;
  } | null>(null);

  const [continuousMode, setContinuousMode] = useState<boolean>(false);
  const [scanStatusMessage, setScanStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Play audio chime on successful detection
  const playBeep = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.12); // High chime

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.16);

      // Haptic feedback if supported
      if (typeof navigator.vibrate === 'function') {
        navigator.vibrate([40, 30, 80]);
      }
    } catch {
      // Audio context might be restricted before user gesture
    }
  }, []);

  // Stop camera tracks safely
  const stopCamera = useCallback(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    setCameraActive(false);
    setTorchOn(false);
  }, []);

  // Start camera stream
  const startCamera = useCallback(async (deviceId?: string) => {
    stopCamera();
    setCameraError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported by your browser environment.');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true'); // Required for iOS Safari
        await videoRef.current.play();
      }

      setCameraActive(true);

      // Check if torch/flashlight is supported
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities: any = track.getCapabilities?.() || {};
        setTorchSupported(Boolean(capabilities.torch));
      }

      // Enumerate available video devices
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const vDevices = devices.filter((d) => d.kind === 'videoinput');
        setVideoDevices(vDevices);
        if (!selectedDeviceId && track) {
          const currentSettings = track.getSettings();
          if (currentSettings.deviceId) {
            setSelectedDeviceId(currentSettings.deviceId);
          }
        }
      } catch {
        // Enumerate fallback
      }
    } catch (err: any) {
      console.error('Camera initialization error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera access in your browser settings to scan badges.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No video camera device was detected on this system.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError('Camera is currently in use by another application or tab.');
      } else {
        setCameraError(`Unable to start camera: ${err.message || 'Unknown camera error'}`);
      }
      setCameraActive(false);
    }
  }, [selectedDeviceId, stopCamera]);

  // Toggle Flashlight/Torch
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const newTorchState = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: newTorchState }]
      });
      setTorchOn(newTorchState);
    } catch (err) {
      console.warn('Torch control failed:', err);
    }
  };

  // Flip camera between environment and user
  const flipCamera = () => {
    if (videoDevices.length <= 1) return;
    const currentIndex = videoDevices.findIndex((d) => d.deviceId === selectedDeviceId);
    const nextIndex = (currentIndex + 1) % videoDevices.length;
    const nextDevice = videoDevices[nextIndex];
    if (nextDevice) {
      setSelectedDeviceId(nextDevice.deviceId);
      startCamera(nextDevice.deviceId);
    }
  };

  // Execute check-in logic upon detecting a QR payload
  const handleDetectedCode = useCallback(async (rawPayload: string) => {
    if (isProcessingDetection) return;
    setIsProcessingDetection(true);
    playBeep();

    // Extract ID (e.g. ATT-101 from SOLSTICE:ATT-101 or JSON or plain text)
    let attendeeId = rawPayload.trim();
    const match = rawPayload.match(/ATT-\d+/i) || rawPayload.match(/SOLSTICE:(ATT-\d+)/i);
    if (match) {
      attendeeId = match[1] || match[0];
    }

    const matchedAttendee = attendees.find(
      (a) => a.id.toLowerCase() === attendeeId.toLowerCase() || rawPayload.includes(a.id)
    );

    setScanStatusMessage(`Detecting badge: ${matchedAttendee ? matchedAttendee.name : attendeeId}...`);

    try {
      const response = await onScan(attendeeId);

      setLastScannedResult({
        code: rawPayload,
        attendee: matchedAttendee,
        response,
        timestamp: Date.now()
      });

      if (response.success) {
        setScanStatusMessage(`✓ Check-In Enqueued! Printing Job: ${response.job?.id || 'Active'}`);
      } else {
        setScanStatusMessage(`${response.message}`);
      }

      // If continuous mode is OFF and scan succeeded or already checked in, auto close after brief confirmation
      if (!continuousMode && response.success) {
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        // Cooldown for next scan in continuous mode
        setTimeout(() => {
          setIsProcessingDetection(false);
          setScanStatusMessage(null);
        }, 2200);
      }
    } catch (err: any) {
      setScanStatusMessage(`Scan error: ${err?.message || 'Network failure'}`);
      setTimeout(() => {
        setIsProcessingDetection(false);
      }, 2000);
    }
  }, [isProcessingDetection, attendees, onScan, continuousMode, onClose, playBeep]);

  // Frame processing loop
  useEffect(() => {
    if (!isOpen || !cameraActive) return;

    let isScanningFrame = false;

    const scanFrame = () => {
      const video = videoRef.current;
      const overlay = overlayCanvasRef.current;

      if (
        video &&
        video.readyState === video.HAVE_ENOUGH_DATA &&
        !isProcessingDetection
      ) {
        if (!isScanningFrame) {
          isScanningFrame = true;

          // Prepare internal processing canvas
          if (!canvasRef.current) {
            canvasRef.current = document.createElement('canvas');
          }
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });

          if (ctx) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert'
            });

            // Draw targeting frame on overlay canvas
            if (overlay) {
              overlay.width = video.clientWidth || 320;
              overlay.height = video.clientHeight || 240;
              const oCtx = overlay.getContext('2d');
              if (oCtx) {
                oCtx.clearRect(0, 0, overlay.width, overlay.height);

                if (qrCode) {
                  const scaleX = overlay.width / canvas.width;
                  const scaleY = overlay.height / canvas.height;

                  // Draw detected bounding box
                  oCtx.beginPath();
                  oCtx.moveTo(qrCode.location.topLeftCorner.x * scaleX, qrCode.location.topLeftCorner.y * scaleY);
                  oCtx.lineTo(qrCode.location.topRightCorner.x * scaleX, qrCode.location.topRightCorner.y * scaleY);
                  oCtx.lineTo(qrCode.location.bottomRightCorner.x * scaleX, qrCode.location.bottomRightCorner.y * scaleY);
                  oCtx.lineTo(qrCode.location.bottomLeftCorner.x * scaleX, qrCode.location.bottomLeftCorner.y * scaleY);
                  oCtx.closePath();
                  oCtx.lineWidth = 4;
                  oCtx.strokeStyle = '#10B981'; // Green detection border
                  oCtx.stroke();
                }
              }
            }

            if (qrCode && qrCode.data) {
              handleDetectedCode(qrCode.data);
            }
          }
          isScanningFrame = false;
        }
      }

      animationFrameId.current = requestAnimationFrame(scanFrame);
    };

    animationFrameId.current = requestAnimationFrame(scanFrame);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isOpen, cameraActive, isProcessingDetection, handleDetectedCode]);

  // Manage camera lifecycle when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      startCamera(selectedDeviceId);
    } else {
      stopCamera();
      setIsProcessingDetection(false);
      setLastScannedResult(null);
      setScanStatusMessage(null);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera, selectedDeviceId]);

  // Handle uploaded image file decoding (backup for environments without live webcam)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
        if (qrCode && qrCode.data) {
          handleDetectedCode(qrCode.data);
        } else {
          setScanStatusMessage('No valid QR code was detected in the uploaded image.');
          setTimeout(() => setScanStatusMessage(null), 3000);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    // Reset file input value
    e.target.value = '';
  };

  if (!isOpen) return null;

  return (
    <div
      id="scanner-view-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="scanner-view-modal"
        className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 sticky top-0 z-20">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <span>Scanner View</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Live Vision
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Hold an attendee QR badge up to your camera
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Torch button if supported */}
            {torchSupported && cameraActive && (
              <button
                id="btn-toggle-torch"
                onClick={toggleTorch}
                className={`p-2 rounded-xl border text-xs transition ${
                  torchOn
                    ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
                title="Toggle Torch"
              >
                {torchOn ? <Zap className="w-4 h-4 fill-current" /> : <ZapOff className="w-4 h-4" />}
              </button>
            )}

            {/* Flip Camera button if multiple video inputs exist */}
            {videoDevices.length > 1 && cameraActive && (
              <button
                id="btn-flip-camera"
                onClick={flipCamera}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition"
                title="Switch Camera"
              >
                <FlipHorizontal className="w-4 h-4" />
              </button>
            )}

            {/* Close button */}
            <button
              id="btn-close-scanner"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition"
              title="Close Scanner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video Viewport Container */}
        <div className="relative bg-black flex items-center justify-center min-h-[300px] sm:min-h-[340px] overflow-hidden">
          {/* Live Video Element */}
          <video
            ref={videoRef}
            className={`w-full h-full object-cover max-h-[380px] ${
              !cameraActive ? 'hidden' : 'block'
            }`}
            muted
            playsInline
            autoPlay
          />

          {/* Canvas for highlighting detected QR polygon */}
          <canvas
            ref={overlayCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
          />

          {/* Optical Targeting Viewfinder Overlay */}
          {cameraActive && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6 z-10">
              {/* Scan Reticle Box */}
              <div
                className={`relative w-56 h-56 sm:w-64 sm:h-64 rounded-3xl transition-all duration-300 flex items-center justify-center ${
                  isProcessingDetection
                    ? 'border-4 border-emerald-400 shadow-[0_0_35px_rgba(16,185,129,0.5)] bg-emerald-500/10'
                    : 'border-2 border-dashed border-amber-400/80 shadow-[0_0_20px_rgba(245,158,11,0.25)] bg-slate-950/20'
                }`}
              >
                {/* 4 Corner Markers */}
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl-xl" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr-xl" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl-xl" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br-xl" />

                {/* Sweeping Laser Line */}
                {!isProcessingDetection && (
                  <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_12px_#f59e0b] animate-bounce" />
                )}

                {isProcessingDetection ? (
                  <div className="flex flex-col items-center justify-center space-y-2 bg-slate-900/90 px-4 py-3 rounded-2xl border border-emerald-400">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 animate-pulse" />
                    <span className="text-xs font-mono font-bold text-emerald-300">
                      Badge Detected!
                    </span>
                  </div>
                ) : (
                  <div className="text-center opacity-70">
                    <QrCode className="w-10 h-10 text-amber-400/60 mx-auto" />
                    <span className="text-[10px] font-mono text-slate-300 mt-2 block uppercase tracking-wider">
                      Align QR in frame
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Camera Error or Off State */}
          {!cameraActive && (
            <div className="p-8 text-center max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 mx-auto">
                <CameraOff className="w-8 h-8" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-200">
                  {cameraError ? 'Camera Access Required' : 'Starting Camera Stream...'}
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  {cameraError || 'Requesting camera permissions from browser...'}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  id="btn-retry-camera"
                  onClick={() => startCamera(selectedDeviceId)}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center space-x-2 transition shadow-md"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Camera</span>
                </button>

                <button
                  id="btn-upload-qr"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs flex items-center space-x-2 transition"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload QR Image</span>
                </button>
              </div>
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            className="hidden"
          />
        </div>

        {/* Dynamic Status / Feedback Bar */}
        {scanStatusMessage && (
          <div
            id="scanner-status-banner"
            className={`px-4 py-2.5 text-xs font-mono flex items-center justify-between border-t border-b ${
              scanStatusMessage.startsWith('✓')
                ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                : scanStatusMessage.includes('error') || scanStatusMessage.includes('No valid')
                ? 'bg-rose-950/80 border-rose-800 text-rose-300'
                : 'bg-amber-950/80 border-amber-800 text-amber-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 flex-shrink-0 animate-spin" />
              <span>{scanStatusMessage}</span>
            </div>
            {lastScannedResult?.attendee && (
              <span className="font-bold text-white uppercase text-[10px]">
                {lastScannedResult.attendee.name}
              </span>
            )}
          </div>
        )}

        {/* Bottom Quick Test QR Codes & Options */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-300">
                Quick Test Registration Codes
              </span>
            </div>

            <label className="flex items-center space-x-2 cursor-pointer select-none">
              <input
                id="checkbox-continuous-mode"
                type="checkbox"
                checked={continuousMode}
                onChange={(e) => setContinuousMode(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-amber-500 focus:ring-amber-400 border-slate-700 bg-slate-800"
              />
              <span className="text-[11px] text-slate-400 font-mono">
                Continuous Kiosk Mode
              </span>
            </label>
          </div>

          {/* Quick Clickable Attendee Codes to simulate camera detecting attendee QR */}
          <div className="grid grid-cols-3 gap-2">
            {attendees.slice(0, 3).map((attendee) => (
              <button
                key={attendee.id}
                id={`btn-sample-scan-${attendee.id}`}
                onClick={() => handleDetectedCode(`SOLSTICE:${attendee.id}`)}
                disabled={isProcessingDetection}
                className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-400/60 text-left transition group disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-amber-400">
                    {attendee.id}
                  </span>
                  <QrCode className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 transition" />
                </div>
                <div className="text-xs font-bold text-slate-200 group-hover:text-white truncate mt-1">
                  {attendee.name.split(' ')[0]}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {attendee.status === 'CHECKED_IN' ? '✓ Checked-In' : attendee.status}
                </div>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
            <span>Point camera at any printed badge or phone screen</span>
            <button
              id="btn-upload-file-fallback"
              onClick={() => fileInputRef.current?.click()}
              className="text-amber-400 hover:text-amber-300 font-medium underline flex items-center space-x-1"
            >
              <Upload className="w-3 h-3" />
              <span>Upload QR file</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
