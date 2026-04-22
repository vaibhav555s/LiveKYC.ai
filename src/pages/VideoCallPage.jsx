import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import {
  Video, VideoOff, Lock, Upload, Download,
  CheckCircle2, ShieldCheck, Zap, Activity,
  Fingerprint, ScanFace, Banknote, Mic,
  AlertTriangle, RefreshCw, User, Check,
  Star, Shield, FileText
} from 'lucide-react';
import useAudioCapture from '../hooks/useAudioCapture.js';
import useAIState from '../hooks/useAIState.js';
import { useAuth } from '../context/AuthContext';
import {
  subscribeOrchestrator,
  getOrchestratorState,
  triggerAadhaarVerify,
  retryAadhaarUpload,
  updateOffer,
  triggerConsent,
  finalizeNegotiation,
  PHASES,
  setUserId,
  rehydrateSession,
} from '../modules/orchestration/sessionOrchestrator.js';
import { processVideoFrame } from '../modules/interaction/liveInteraction.js';
import { fetchApplicationState, unlockApplication, uploadMedia } from '../services/dbService.js';

/* ─── Helpers ────────────────────────────────────────── */
function calcEMI(principal, annualRate, months) {
  const r = annualRate / 12 / 100;
  if (r === 0) return Math.round(principal / months);
  return Math.round(principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1));
}
function fmtINR(n) {
  if (n == null || n === '') return '₹0';
  let num = Number(n);
  if (isNaN(num) && typeof n === 'string') {
    num = Number(n.replace(/[^0-9.-]/g, ''));
  }
  if (isNaN(num)) num = 0;
  return '₹' + num.toLocaleString('en-IN');
}

/* ─── Animated Number Component ─────────────────────── */
function AnimatedNumber({ value, type = 'number' }) {
  const spring = useSpring(value, { mass: 0.8, stiffness: 75, damping: 15 });
  const display = useTransform(spring, (current) => {
    if (type === 'currency') return fmtINR(Math.round(current));
    if (type === 'percent') return current.toFixed(1) + '%';
    if (type === 'mo') return Math.round(current) + ' mo';
    return Math.round(current);
  });

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span>{display}</motion.span>;
}

/* ─── Color Tokens ──────────────────────────────────── */
const C = {
  bg: '#0A0A0A',
  panel: '#0f0f0f',
  border: 'rgba(255,255,255,0.05)',
  borderHi: 'rgba(255,255,255,0.08)',
  text: '#ffffff',
  textSub: 'rgba(255,255,255,0.6)',
  textMuted: 'rgba(255,255,255,0.25)',
  purple: '#7c3aed',
  purpleLight: '#a78bfa',
  green: '#10B981',
  red: '#EF4444',
};

/* ─── Progress Steps ───────────────────────────────── */
const STEPS = [
  { phase: PHASES.CHAT, icon: Fingerprint, label: 'IDENTIFY' },
  { phase: PHASES.AADHAAR_UPLOAD, icon: Upload, label: 'VERIFY' },
  { phase: PHASES.FACE_SCAN, icon: ScanFace, label: 'BIOMETRIC' },
  { phase: PHASES.OFFER, icon: Banknote, label: 'OFFER' },
  { phase: PHASES.CONSENT, icon: ShieldCheck, label: 'CONSENT' },
];

function phaseToStep(phase) {
  const order = [
    PHASES.CHAT,
    PHASES.AADHAAR_UPLOAD, PHASES.AADHAAR_VERIFY, PHASES.AADHAAR_DONE,
    PHASES.FACE_SCAN, PHASES.FACE_DONE,
    PHASES.BUREAU,
    PHASES.OFFER,
    PHASES.CONSENT,
    PHASES.COMPLETE,
  ];
  const idx = order.indexOf(phase);
  if (idx < 1) return 1;
  if (idx < 4) return 2;
  if (idx < 6) return 3;
  if (idx < 8) return 4;
  return 5;
}

/* ─── Typewriter ────────────────────────────────────── */
function Typewriter({ phase, overrideText }) {
  const captions = {
    [PHASES.CHAT]: ['Listening to your response...', 'Extracting financial data...', 'Analyzing your profile...'],
    [PHASES.AADHAAR_UPLOAD]: ['Waiting for Aadhaar upload...', 'Document verification ready...'],
    [PHASES.AADHAAR_VERIFY]: ['Reading Aadhaar document...', 'Fetching identity data...', 'Cross-referencing fields...'],
    [PHASES.AADHAAR_DONE]: ['Identity verified successfully...', 'Proceeding to biometric check...'],
    [PHASES.FACE_SCAN]: ['Scanning facial features...', 'Analyzing age from camera...', 'Comparing with document...'],
    [PHASES.FACE_DONE]: ['Biometric check complete...', 'Running credit assessment...'],
    [PHASES.BUREAU]: ['Connecting to credit bureau...', 'Pulling credit report...', 'Evaluating eligibility...'],
    [PHASES.OFFER]: ['Generating personalised offer...', 'Structuring loan terms...'],
    [PHASES.CONSENT]: ['Capturing verbal consent...', 'Generating audit trail...'],
    [PHASES.COMPLETE]: ['Session complete. Disbursement queued...'],
  };
  const list = captions[phase] || captions[PHASES.CHAT];
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('');
  const [charIdx, setCharIdx] = useState(0);
  const [done, setDone] = useState(false);
  
  const currentPhrase = overrideText || list[idx % list.length];

  useEffect(() => { 
    setIdx(0); 
    setText(''); 
    setCharIdx(0); 
    setDone(false); 
  }, [phase, overrideText]);

  useEffect(() => {
    if (done && !overrideText) {
      const t = setTimeout(() => { 
        setIdx(i => i + 1); 
        setText(''); 
        setCharIdx(0); 
        setDone(false); 
      }, 3000);
      return () => clearTimeout(t);
    }
    if (charIdx < currentPhrase.length) {
      const t = setTimeout(() => { 
        setText(currentPhrase.slice(0, charIdx + 1)); 
        setCharIdx(c => c + 1); 
      }, 25);
      return () => clearTimeout(t);
    } else { 
      setDone(true); 
    }
  }, [charIdx, currentPhrase, done, overrideText]);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-[2px]">
        {[1, 0.6, 0.8].map((op, i) => (
          <motion.div
            key={i}
            animate={{ height: overrideText ? ['8px', '20px', '8px'] : ['4px', '12px', '4px'] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            style={{ 
              width: 1.5, 
              background: overrideText ? '#fff' : C.purple, 
              opacity: op, 
              borderRadius: 1 
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 13, color: C.textSub, fontStyle: 'italic' }}>
        {text}
      </span>
    </div>
  );
}

/* ─── Speaking Bars ─────────────────────────────────── */
function SpeakingBars() {
  return (
    <div className="flex items-end gap-[3px] h-6 mb-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <motion.div
          key={i}
          animate={{ height: [`${30 + Math.random() * 40}%`, `${70 + Math.random() * 30}%`, `${30 + Math.random() * 40}%`] }}
          transition={{ duration: 0.6 + Math.random() * 0.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: 1.5, borderRadius: 1, backgroundColor: C.purple }}
        />
      ))}
    </div>
  );
}

/* ─── Confidence Badge ─────────────────────────────── */
function ConfBadge({ level }) {
  const cfg = {
    High: { color: C.green, bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)' },
    Medium: { color: C.yellow, bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)' },
    Low: { color: C.red, bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)' },
  }[level] || { color: C.textMuted, bg: 'rgba(71,85,105,0.12)', border: 'rgba(71,85,105,0.25)' };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, flexShrink: 0 }}>
      {level}
    </span>
  );
}

/* ─── Camera Frame ──────────────────────────────────── */
function CameraFrame({ isVideoOn, onCameraReady, onStreamReady, phase }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);

  const intervalRef = useRef(null);

  useEffect(() => {
    let active = null;
    const clearFrameInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    if (isVideoOn) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(s => {
          active = s;
          setStream(s);
          if (videoRef.current) videoRef.current.srcObject = s;
          onStreamReady?.(s);
          onCameraReady?.();
        })
        .catch(() => onCameraReady?.());
    } else {
      stream?.getTracks().forEach(t => t.stop());
      setStream(null);
      clearFrameInterval();
      onCameraReady?.();
    }

    return () => {
      active?.getTracks().forEach(t => t.stop());
      clearFrameInterval();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideoOn]);

  const hasScanned = useRef(false);
  useEffect(() => {
    if (phase !== PHASES.FACE_SCAN) {
      hasScanned.current = false;
    }

    if (phase === PHASES.FACE_SCAN && isVideoOn && videoRef.current && canvasRef.current && !hasScanned.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        hasScanned.current = true;
        // Wait 800ms for the user to settle into the frame
        const timeout = setTimeout(() => {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frameData = canvas.toDataURL('image/jpeg', 0.8);
          processVideoFrame(frameData).catch(console.error);
        }, 800);
        return () => clearTimeout(timeout);
      }
    }
  }, [phase, isVideoOn]);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1, background: '#0D0D14' }}>
      <video ref={videoRef} autoPlay playsInline muted
        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: isVideoOn && stream ? 1 : 0, transition: 'opacity 0.5s', transform: 'scaleX(-1)' }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {(!isVideoOn || !stream) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <VideoOff size={48} style={{ color: 'rgba(255,255,255,0.1)' }} />
        </div>
      )}
    </div>
  );
}

/* ─── Face Scan Overlay ────────────────────────────── */
function FaceScanOverlay({ overlay }) {
  if (!overlay) return null;
  return (
    <AnimatePresence>
      <motion.div
        key={overlay}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      >
        {overlay === 'scanning' && (
          <>
            {/* Scanning frame */}
            <div style={{ position: 'relative', width: 180, height: 200 }}>
              {/* Corner brackets */}
              {[{ top: 0, left: 0, borderRadius: '8px 0 0 0' }, { top: 0, right: 0, borderRadius: '0 8px 0 0' }, { bottom: 0, left: 0, borderRadius: '0 0 0 8px' }, { bottom: 0, right: 0, borderRadius: '0 0 8px 0' }].map((pos, i) => (
                <div key={i} style={{ position: 'absolute', width: 24, height: 24, borderTop: i < 2 ? `2px solid ${C.blue}` : 'none', borderBottom: i >= 2 ? `2px solid ${C.blue}` : 'none', borderLeft: i % 2 === 0 ? `2px solid ${C.blue}` : 'none', borderRight: i % 2 === 1 ? `2px solid ${C.blue}` : 'none', ...pos }} />
              ))}
              {/* Scan line */}
              <motion.div
                animate={{ top: ['10%', '90%', '10%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                style={{ position: 'absolute', left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${C.blue}, transparent)`, boxShadow: `0 0 12px ${C.blue}` }}
              />
              {/* Face dots */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ScanFace size={60} style={{ color: `rgba(59,130,246,0.3)` }} />
              </div>
            </div>
            <motion.p animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ fontSize: 13, color: C.blue, fontWeight: 600, letterSpacing: '0.08em' }}>
              SCANNING FACE...
            </motion.p>
            <p style={{ fontSize: 11, color: C.textSub }}>Analysing biometric markers from camera</p>
          </>
        )}

        {overlay === 'scan_success' && (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-3">
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 30px rgba(16,185,129,0.3)` }}>
              <CheckCircle2 size={36} style={{ color: C.green }} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.green }}>Age Matched ✓</p>
            <p style={{ fontSize: 11, color: C.textSub }}>Camera age matches Aadhaar document</p>
          </motion.div>
        )}

        {overlay === 'scan_fail' && (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-3">
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', border: `2px solid ${C.red}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={36} style={{ color: C.red }} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.red }}>Age Mismatch Flagged</p>
            <p style={{ fontSize: 11, color: C.textSub }}>Session flagged for manual review</p>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/* ─── AI Live Caption Overlay ────────────────────────── */
function LiveCaptionOverlay({ text }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const words = useMemo(() => (text ? text.split(/\s+/) : []), [text]);

  useEffect(() => {
    setVisibleCount(0);
    if (!text || words.length === 0) return;

    // Fast reveal: ~5-6 words per second
    const interval = setInterval(() => {
      setVisibleCount((prev) => {
        if (prev >= words.length) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 120);

    return () => clearInterval(interval);
  }, [text, words.length]);

  if (!text) return null;

  return (
    <div className="absolute inset-0 flex items-end justify-center pb-24 px-6 pointer-events-none z-[30]">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 5, scale: 0.95 }}
        className="px-6 py-3 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 shadow-2xl flex flex-wrap justify-center gap-x-1"
      >
        <AnimatePresence>
          {words.slice(0, visibleCount).map((word, i) => (
            <motion.span
              key={`${text}-${i}`}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="text-[18px] md:text-[22px] font-medium text-white tracking-tight"
            >
              {word}
            </motion.span>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* ─── Left Panel ────────────────────────────────────── */
function LeftPanel({ isVideoOn, setIsVideoOn, isListening, isProcessing, startRecording, stopRecording, phase, leftOverlay, onJoined, onStreamReady }) {
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [aiCaption, setAiCaption] = useState('');

  useEffect(() => {
    const onStart = (e) => {
      setIsAiSpeaking(true);
      if (e.detail?.text) setAiCaption(e.detail.text);
    };
    const onEnd = () => {
      setIsAiSpeaking(false);
      setAiCaption('');
    };

    window.addEventListener('ai_speaking_start', onStart);
    window.addEventListener('ai_speaking_end', onEnd);
    return () => { 
      window.removeEventListener('ai_speaking_start', onStart); 
      window.removeEventListener('ai_speaking_end', onEnd); 
    };
  }, []);

  useEffect(() => {
    setAiCaption('');
  }, [phase]);

  return (
    <div className="relative flex flex-col" style={{ flex: '0 0 65%', background: C.bg, overflow: 'hidden' }}>
      {/* Camera */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
        <CameraFrame isVideoOn={isVideoOn} onCameraReady={() => onJoined?.()} onStreamReady={onStreamReady} phase={phase} />
      </div>

      {/* Face scan overlay */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 15, pointerEvents: leftOverlay ? 'auto' : 'none' }}>
        <FaceScanOverlay overlay={leftOverlay} />
      </div>

      {/* AI Live Caption Overlay (CC) */}
      <AnimatePresence>
        <LiveCaptionOverlay text={aiCaption} />
      </AnimatePresence>

      {/* Center AI avatar + controls */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4" style={{ position: 'relative', zIndex: 5 }}>
        {/* Rotating Sacred Geometry Avatar */}
        <div className="relative">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
            className="text-white opacity-80"
          >
            <svg width="100" height="100" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1">
              <circle cx="50" cy="50" r="30" />
              <circle cx="50" cy="20" r="30" />
              <circle cx="50" cy="80" r="30" />
              <circle cx="24" cy="35" r="30" />
              <circle cx="76" cy="35" r="30" />
              <circle cx="24" cy="65" r="30" />
              <circle cx="76" cy="65" r="30" />
            </svg>
          </motion.div>
        </div>

        <div className="flex flex-col items-center gap-6">
          <div className="text-[14px] text-white/60 font-medium lowercase tracking-tight">
            AI Loan Officer
          </div>

          <div className="flex items-center gap-6">
            {/* Minimal controls */}
            <button
              onClick={() => setIsVideoOn(v => !v)}
              style={{
                width: 32, height: 32, borderRadius: '50%',
                border: `1px solid rgba(255,255,255,0.12)`,
                background: 'rgba(255,255,255,0.04)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.2s', color: isVideoOn ? 'white' : 'rgba(255,255,255,0.2)'
              }}
            >
              {isVideoOn ? <Video size={14} /> : <VideoOff size={14} />}
            </button>

            <div style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isAiSpeaking ? <SpeakingBars /> : (
                <button
                  disabled={isAiSpeaking || isProcessing}
                  onClick={isListening ? stopRecording : startRecording}
                  style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: isListening ? C.red : 'rgba(255,255,255,0.08)',
                    border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: isAiSpeaking || isProcessing ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {isListening ? (
                    <div className="w-4 h-4 bg-white rounded-sm" />
                  ) : (
                    <Mic size={18} color="white" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* Bottom caption bar */}
      <div className="flex items-center gap-3 px-6 py-4 bg-black" style={{ flexShrink: 0, zIndex: 10 }}>
        <div className="flex-1 min-w-0">
          <Typewriter phase={phase} />
        </div>
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   RIGHT PANEL COMPONENTS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

/* ─── Phase: CHAT ─ Dynamic KYC Extraction ────────── */
function PanelChat({ kycFields }) {
  const visibleFields = kycFields.filter(f => f.value && f.value !== '—');
  const emptyFields = kycFields.filter(f => f.value === '—' || !f.value);

  return (
    <div className="p-8 flex flex-col gap-8">
      <div>
        <h3 className="text-[28px] font-medium text-white mb-2 leading-tight">Extracting Profile</h3>
        <p className="text-[12px] text-white/50 lowercase tracking-tight">Listening to conversation and extracting identity markers.</p>
      </div>

      <div className="flex flex-col">
        <AnimatePresence>
          {visibleFields.map((f, i) => (
            <motion.div
              key={f.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="py-6 border-b border-white/5 last:border-0 flex items-center justify-between"
            >
              <div>
                <span className="text-[9px] uppercase tracking-[0.1em] text-white/30 mb-1.5 block leading-none">{f.label}</span>
                <span className="text-[16px] font-medium text-white block leading-none">{f.value}</span>
              </div>
              <div className="px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-[10px] text-violet-400 font-medium">
                {f.confidence}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {emptyFields.map((f, i) => (
          <div key={f.label} className="py-6 border-b border-white/5 last:border-0 flex items-center justify-between opacity-20">
            <div>
              <span className="text-[9px] uppercase tracking-[0.1em] text-white/30 mb-1.5 block leading-none">{f.label}</span>
              <span className="text-[16px] font-medium text-white/40 block leading-none">—</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Phase: AADHAAR_UPLOAD ──────────────────────── */
function PanelAadhaarUpload({ aadhaar }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const hasError = aadhaar?.status === 'failed';

  function handleFile(f) {
    if (!f) return;
    setFile(f);
    setTimeout(() => triggerAadhaarVerify(f), 800);
  }

  useEffect(() => {
    if (hasError) setFile(null);
  }, [hasError]);

  return (
    <div className="p-8 flex flex-col gap-10">
      <div>
        <h3 className="text-[28px] font-medium text-white mb-2 leading-tight">Verify Identity</h3>
        <p className="text-[12px] text-white/50 lowercase tracking-tight leading-relaxed">
          Upload Aadhaar document to confirm identity and extract official markers.
        </p>
      </div>

      {hasError && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-red-500/10 border border-red-500/20"
        >
          <div className="flex gap-3">
            <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[12px] font-bold text-red-400 mb-1">Upload Error</p>
              <p className="text-[11px] text-red-400/70 leading-relaxed font-medium">
                {aadhaar.error || 'Identity document was unreadable. Please provide a high-resolution capture.'}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={() => !file && inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        className={`relative h-[240px] rounded-3xl flex flex-col items-center justify-center transition-all duration-500 cursor-pointer overflow-hidden ${
          file ? 'bg-white/5 border border-white/10' : 
          hasError ? 'bg-red-500/5 border border-dashed border-red-500/20' : 
          'bg-white/[0.02] border border-dashed border-white/10'
        }`}
      >
        <input 
          type="file" 
          ref={inputRef} 
          onChange={e => handleFile(e.target.files[0])} 
          className="hidden" 
          accept="image/*,.pdf" 
        />

        <AnimatePresence mode="wait">
          {file ? (
              <motion.div 
                key="success" 
                initial={{ opacity: 0, scale: 0.9 }} 
                animate={{ opacity: 1, scale: 1 }} 
                className="flex flex-col items-center gap-3"
              >
                <div className="w-12 h-12 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <CheckCircle2 size={24} className="text-violet-400" />
                </div>
                <span className="text-[12px] text-violet-400 font-bold uppercase tracking-widest">{file.name}</span>
              </motion.div>
          ) : (
            <motion.div 
              key="upload" 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="flex flex-col items-center gap-4"
            >
              <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/5 flex items-center justify-center">
                <FileText size={28} className="text-white/20" />
              </div>
              <div className="text-center">
                <p className="text-[14px] text-white/60 font-medium lowercase">Drop file or click to upload</p>
                <p className="text-[10px] text-white/20 uppercase tracking-[0.2em] font-bold mt-2">Max 5MB • JPG, PNG, PDF</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* ─── Phase: AADHAAR_VERIFY ───────────────────────── */
function PanelAadhaarVerify() {
  const steps = ['Reading document data', 'Verifying security features', 'Cross-referencing fields', 'Extracting identity info'];
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step < steps.length - 1) {
      const t = setTimeout(() => setStep(s => s + 1), 600);
      return () => clearTimeout(t);
    }
  }, [step, steps.length]);

  return (
    <div className="p-8 flex flex-col gap-10 items-center justify-center min-h-[400px]">
      <div className="relative">
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          className="w-16 h-16 rounded-full border border-white/5 border-t-white"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Shield size={20} className="text-white opacity-40" />
        </div>
      </div>

      <div className="text-center">
        <h3 className="text-[24px] font-medium text-white mb-2">Analyzing Identity</h3>
        <AnimatePresence mode="wait">
          <motion.p key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-[12px] text-white/50 lowercase">
            {steps[step]}...
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="w-full max-w-[200px] flex flex-col gap-3 opacity-30">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-3">
             <div className={`w-1.5 h-1.5 rounded-full ${i <= step ? 'bg-white' : 'bg-white/10'}`} />
             <span className="text-[10px] uppercase tracking-wide font-medium">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Phase: AADHAAR_DONE ─────────────────────────── */
function PanelAadhaarDone({ aadhaar, kycMismatch }) {
  const fields = [
    { label: 'NAME', value: aadhaar.name, mismatch: kycMismatch?.nameMismatch },
    { label: 'DATE OF BIRTH', value: aadhaar.dob, mismatch: false },
    { label: 'AGE', value: aadhaar.age ? `${aadhaar.age} years` : 'N/A', mismatch: kycMismatch?.ageMismatch },
    { label: 'AADHAAR NUMBER', value: aadhaar.aadhaarNumber, mismatch: false },
  ];

  return (
    <div className="p-8 flex flex-col gap-10">
      <div>
        <h3 className="text-[28px] font-medium text-white mb-2 leading-tight lowercase">identity confirmed</h3>
        <p className="text-[12px] text-white/50 lowercase tracking-tight">Extracted data markers from official document.</p>
      </div>

      {kycMismatch?.flagged && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-red-500/10 border border-red-500/20"
        >
          <div className="flex gap-3 mb-3">
            <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
            <span className="text-[12px] font-bold text-red-400">KYC Mismatch Flagged</span>
          </div>
          <div className="flex flex-col gap-2">
            {kycMismatch.nameMismatch && (
              <p className="text-[11px] text-red-400/80 font-medium">Stated name "{kycMismatch.statedName}" differs from document.</p>
            )}
            {kycMismatch.ageMismatch && (
              <p className="text-[11px] text-red-400/80 font-medium">Stated age {kycMismatch.statedAge} differs from document ({kycMismatch.aadhaarAge}).</p>
            )}
          </div>
        </motion.div>
      )}

      <div className="flex flex-col">
        {fields.map((f, i) => (
          <motion.div key={f.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className={`py-6 border-b border-white/5 last:border-0 flex items-center justify-between ${f.mismatch ? 'opacity-100' : ''}`}>
            <div>
              <span className={`text-[9px] uppercase tracking-[0.1em] mb-1.5 block leading-none ${f.mismatch ? 'text-red-400' : 'text-white/30'}`}>{f.label}</span>
              <span className={`text-[16px] font-medium block leading-none ${f.mismatch ? 'text-red-400' : 'text-white'}`}>{f.value}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {kycMismatch?.flagged && (
        <button onClick={() => {}} className="mt-4 text-[12px] font-bold text-red-400 uppercase tracking-[0.1em] text-center border border-red-500/20 py-4 rounded-xl hover:bg-red-500/5 transition-colors">
          Retry Verification
        </button>
      )}
    </div>
  );
}

/* ─── Phase: FACE_SCAN / FACE_DONE ───────────────────── */
function PanelFaceScan({ faceAge, phase }) {
  const isDone = phase === PHASES.FACE_DONE;
  const isMatched = faceAge?.status === 'matched';
  const isSpoof = faceAge?.status === 'spoof';

  return (
    <div className="p-8 flex flex-col gap-10">
      <div>
        <h3 className="text-[28px] font-medium text-white mb-2 leading-tight lowercase">biometric scan</h3>
        <p className="text-[12px] text-white/50 lowercase tracking-tight">Verifying liveness and age markers via camera.</p>
      </div>

      {!isDone ? (
        <div className="flex flex-col items-center justify-center min-h-[200px] bg-white/[0.02] border border-white/5 rounded-3xl">
          <motion.div 
            animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-20 h-20 rounded-full border border-white/20 flex items-center justify-center mb-6"
          >
            <ScanFace size={32} className="text-white" />
          </motion.div>
          <span className="text-[12px] text-white/30 lowercase italic">scanning face...</span>
        </div>
      ) : (
        <div className="flex flex-col">
          {[
            { label: 'Camera Estimate', value: `${faceAge?.estimatedAge} years` },
            { label: 'Document Age', value: `${faceAge?.aadhaarAge} years` },
            { label: 'Liveness Match', value: !isSpoof ? 'verified' : 'flagged', error: isSpoof },
            { label: 'Verdict', value: isMatched ? 'pass' : 'flagged', error: !isMatched },
          ].map((row, i) => (
            <motion.div key={row.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              className="py-6 border-b border-white/5 last:border-0 flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-[0.1em] text-white/30 block leading-none">{row.label}</span>
              <span className={`text-[16px] font-medium block leading-none ${row.error ? 'text-red-400' : 'text-white'}`}>{row.value}</span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --- Phase: BUREAU -------------------------------------- */
function PanelBureau({ bureau, policy }) {
  const checks = ['Connecting to bureau', 'Pulling report', 'Evaluating history', 'Running policy engine'];
  const [step, setStep] = useState(0);
  const isFailed = bureau?.status === 'fail' || policy?.decision === 'FAIL';

  useEffect(() => {
    if (!isFailed && step < checks.length - 1) {
      const t = setTimeout(() => setStep(s => s + 1), 600);
      return () => clearTimeout(t);
    }
  }, [step, checks.length, isFailed]);

  return (
    <div className="p-8 flex flex-col gap-10">
      <div>
        <h3 className="text-[28px] font-medium text-white mb-2 leading-tight lowercase">bureau assessment</h3>
        <p className="text-[12px] text-white/50 lowercase tracking-tight">Pulling real-time credit data and risk markers.</p>
      </div>

      {isFailed ? (
        <div className="p-8 rounded-3xl bg-red-500/10 border border-red-500/20">
          <h4 className="text-[18px] font-medium text-red-400 mb-2">Policy Declined</h4>
          <p className="text-[12px] text-red-400/70 lowercase leading-relaxed">Application does not meet the necessary credit markers at this time.</p>
        </div>
      ) : step < checks.length - 1 ? (
        <div className="flex flex-col">
          {checks.map((c, i) => (
            <div key={c} className={`py-6 border-b border-white/5 last:border-0 flex items-center justify-between transition-opacity duration-500 ${step >= i ? 'opacity-100' : 'opacity-10'}`}>
              <span className="text-[14px] text-white lowercase tracking-tight">{c}</span>
              {step > i ? <Check size={14} className="text-white" strokeWidth={3} /> : step === i ? <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          {[
            { label: 'Credit Score', value: bureau?.creditScore, good: bureau?.creditScore >= 650 },
            { label: 'Active Loans', value: bureau?.activeLoans, good: true },
            { label: 'DPD History', value: bureau?.dpdHistory, good: true },
            { label: 'Written-Off', value: bureau?.writtenOffAccounts, good: bureau?.writtenOffAccounts === 0 },
          ].map((row, i) => (
            <motion.div key={row.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              className="py-6 border-b border-white/5 last:border-0 flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-[0.1em] text-white/30 block leading-none">{row.label}</span>
              <span className={`text-[16px] font-medium block leading-none ${row.good ? 'text-white' : 'text-red-400'}`}>{row.value}</span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --- Phase: OFFER -------------------------------------- */
function PanelOffer({ offer, bureau, policy, negotiation, onUpdateOffer, screenStream, setScreenStream }) {
  const emi = calcEMI(offer.amount, offer.interestRate, offer.tenure);
  const { policyLimits } = negotiation || {};

  return (
    <div className="p-8 flex flex-col gap-10">
      <div>
        <h3 className="text-[28px] font-medium text-white mb-2 leading-tight lowercase">loan offer</h3>
        <p className="text-[12px] text-white/50 lowercase tracking-tight">Structured according to bureau data and identity markers.</p>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold mb-2">Approved Limit</span>
        <div className="text-[80px] font-medium tracking-tight text-white leading-none mb-6">
          <AnimatedNumber value={offer.amount} type="currency" />
        </div>

        <div className="grid grid-cols-3 gap-8 py-8 border-y border-white/5">
          <div>
            <span className="text-[9px] uppercase tracking-[0.1em] text-white/30 block mb-2">EMI / MO</span>
            <span className="text-[18px] font-medium text-white block">₹{Math.round(emi).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-[9px] uppercase tracking-[0.1em] text-white/30 block mb-2">Rate P.A.</span>
            <span className="text-[18px] font-medium text-white block">{offer.interestRate}%</span>
          </div>
          <div>
            <span className="text-[9px] uppercase tracking-[0.1em] text-white/30 block mb-2">Tenure</span>
            <span className="text-[18px] font-medium text-white block">{offer.tenure} MO</span>
          </div>
        </div>
      </div>

      {policyLimits?.alternatives && (
        <div className="flex flex-col gap-4">
          <span className="text-[9px] uppercase tracking-[0.1em] text-white/30 font-bold">Alternative Pathways</span>
          <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
            {policyLimits.alternatives.map((alt) => {
              const isSelected = offer.amount === alt.amount && offer.tenure === alt.tenure;
              return (
                <button
                  key={alt.id}
                  onClick={() => onUpdateOffer?.(alt.amount, alt.tenure)}
                  className={`flex-none px-6 py-5 rounded-2xl transition-all duration-300 border ${
                    isSelected ? 'bg-white border-white' : 'bg-transparent border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className={`text-[15px] font-bold mb-1 ${isSelected ? 'text-black' : 'text-white'}`}>{fmtINR(alt.amount)}</div>
                  <div className={`text-[10px] lowercase tracking-tight font-medium ${isSelected ? 'text-black/50' : 'text-white/30'}`}>{alt.tenure}mo @ {alt.interestRate}%</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!screenStream ? (
        <button
          onClick={async () => {
            try {
              const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
              setScreenStream(stream);
            } catch (err) {
              console.warn('[ScreenCapture] User denied screen share:', err);
            }
          }}
          className="w-full border border-white/20 text-white py-6 rounded-2xl font-bold text-[14px] uppercase tracking-[0.2em] hover:bg-white/5 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
        >
          <span style={{ fontSize: 18 }}>🖥</span> Share Screen to Lock Terms
        </button>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-green-500/10 border border-green-500/20">
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="w-2 h-2 rounded-full bg-green-500"
            />
            <span className="text-[12px] font-bold text-green-400 uppercase tracking-[0.1em]">● Screen Recording Active</span>
          </div>
          <button
            onClick={() => finalizeNegotiation('I accept these terms')}
            className="w-full bg-white text-black py-6 rounded-2xl font-bold text-[14px] uppercase tracking-[0.2em] shadow-[0_20px_40px_rgba(255,255,255,0.1)] hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            Say "I Accept These Terms" or Click Here
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Phase: CONSENT ────────────────────────────────── */
function PanelConsent({ consent, token }) {
  function downloadAuditTrail() {
    const blob = new Blob([
      `CONSENT TRAIL — LiveKYC.ai\n\nSession ID: ${token}\nTimestamp: ${consent.timestamp}\n\nConsent Phrase: "${consent.phrase}"\n\nSHA-256 Hash: ${consent.hash}\n\nThis is a tamper-evident record. Do not modify.`
    ], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `consent-${token}.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-8 flex flex-col gap-10">
      <div>
        <h3 className="text-[28px] font-medium text-white mb-2 leading-tight lowercase">verbal consent</h3>
        <p className="text-[12px] text-white/50 lowercase tracking-tight">captured tamper-evident agreement record.</p>
      </div>

      <div className="flex flex-col gap-8">
        <div className="py-10 border-y border-white/5">
          <span className="text-[9px] uppercase tracking-[0.1em] text-white/30 block mb-6">captured phrase</span>
          <p className="text-[24px] font-medium text-white italic leading-relaxed">"{consent.phrase}"</p>
          <div className="mt-8 flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-[10px] text-white/30 lowercase tracking-tight">verified audio signature • {consent.timestamp}</span>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <span className="text-[9px] uppercase tracking-[0.1em] text-white/30 font-bold">cryptographic hash</span>
          <p className="text-[11px] font-mono text-white/30 break-all leading-relaxed bg-white/[0.02] p-5 rounded-2xl border border-white/5">{consent.hash}</p>
        </div>

        <button 
          onClick={downloadAuditTrail}
          className="text-[12px] font-bold text-white uppercase tracking-[0.1em] border border-white/10 py-5 rounded-2xl hover:bg-white/5 transition-colors"
        >
          Export Audit Trail
        </button>
      </div>
    </div>
  );
}

/* ─── Phase: COMPLETE ───────────────────────────────── */
function PanelComplete({ offer, token, proofBlob }) {
  const navigate = useNavigate();
  const emi = calcEMI(offer.amount, offer.interestRate, offer.tenure);

  return (
    <div className="p-8 flex flex-col gap-10 items-center justify-center min-h-[500px]">
      <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center mb-6 shadow-[0_20px_50px_rgba(255,255,255,0.2)]">
        <Check size={40} className="text-black" strokeWidth={3} />
      </div>

      <div className="text-center mb-6">
        <h3 className="text-[36px] font-medium text-white mb-2 tracking-tight lowercase">loan approved</h3>
        <p className="text-[14px] text-white/50 lowercase tracking-tight">Disbursement sequence has been initiated.</p>
      </div>

      <div className="grid grid-cols-3 gap-12 w-full py-12 border-y border-white/5">
        <div className="text-center">
          <span className="text-[9px] uppercase tracking-[0.1em] text-white/30 block mb-2">Amount</span>
          <span className="text-[18px] font-medium text-white block">{fmtINR(offer.amount)}</span>
        </div>
        <div className="text-center">
          <span className="text-[9px] uppercase tracking-[0.1em] text-white/30 block mb-2">EMI</span>
          <span className="text-[18px] font-medium text-white block">₹{Math.round(emi).toLocaleString()}</span>
        </div>
        <div className="text-center">
          <span className="text-[9px] uppercase tracking-[0.1em] text-white/30 block mb-2">Tenure</span>
          <span className="text-[18px] font-medium text-white block">{offer.tenure} MO</span>
        </div>
      </div>

      {!proofBlob ? (
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-violet-500/10 border border-violet-500/20 w-full justify-center">
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-violet-400"
          />
          <span className="text-[12px] font-bold text-violet-400 uppercase tracking-[0.1em]">Finalising video proof...</span>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-green-500/10 border border-green-500/20 w-full justify-center">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-[12px] font-bold text-green-400 uppercase tracking-[0.1em]">✓ Video proof secured &amp; uploaded</span>
        </div>
      )}

      <button
        onClick={() => navigate('/ops')}
        className="w-full bg-white text-black py-6 rounded-2xl font-bold text-[14px] uppercase tracking-[0.2em] shadow-[0_20px_40px_rgba(255,255,255,0.1)] hover:scale-[1.02] active:scale-[0.98] transition-all"
      >
        Open Dashboard
      </button>
    </div>
  );
}

/* ─── RIGHT PANEL (ORCHESTRATED) ─────────────────────── */
function RightPanel({ orchState, kycFields, token, proofBlob, screenStream, setScreenStream }) {
  const { phase, aadhaar, kycMismatch, faceAge, bureau, policy, offer, consent, negotiation } = orchState;
  const isScreenRecording = !!screenStream;
  const currentStep = phaseToStep(phase);

  function renderContent() {
    switch (phase) {
      case PHASES.CHAT:
        return <PanelChat kycFields={kycFields} />;
      case PHASES.AADHAAR_UPLOAD:
        return <PanelAadhaarUpload aadhaar={aadhaar} />;
      case PHASES.AADHAAR_VERIFY:
        return <PanelAadhaarVerify />;
      case PHASES.AADHAAR_DONE:
        return <PanelAadhaarDone aadhaar={aadhaar} kycMismatch={kycMismatch} />;
      case PHASES.FACE_SCAN:
        return <PanelFaceScan faceAge={faceAge} phase={phase} />;
      case PHASES.FACE_DONE:
        return <PanelFaceScan faceAge={faceAge} phase={phase} />;
      case PHASES.BUREAU:
        return <PanelBureau bureau={bureau} policy={policy} />;
      case PHASES.OFFER:
        return <PanelOffer offer={offer} bureau={bureau} policy={policy} negotiation={negotiation} onUpdateOffer={(a, t) => updateOffer(a, t)} screenStream={screenStream} setScreenStream={setScreenStream} />;
      case PHASES.CONSENT:
        return <PanelConsent consent={consent} token={token} />;
      case PHASES.COMPLETE:
        return <PanelComplete offer={offer} token={token} proofBlob={proofBlob} />;
      default:
        return <PanelChat kycFields={kycFields} />;
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ flex: 1, background: C.panel, borderLeft: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-white/5">
        <div>
          <div className="text-[9px] text-white/30 uppercase tracking-[0.2em] font-medium mb-1.5">Session ID</div>
          <div className="text-[14px] text-white font-medium tracking-tight font-mono">
            TKN-{token?.slice(0, 4).toUpperCase() || 'DEMO'}
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(124,58,237,0.5)]" />
          <span className="text-[10px] text-violet-400 font-bold tracking-tight">ENCRYPTED</span>
        </div>
      </div>


      {/* Progress stepper */}
      <div className="flex items-center px-8 py-4 border-b border-white/5 bg-black/20 overflow-x-auto scrollbar-hide">
        {STEPS.map((step, idx) => {
          const stepNum = idx + 1;
          const isPast = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          return (
            <div key={step.label} className="flex items-center">
              <div className="flex items-center gap-2 mr-6">
                <div 
                  className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                    isPast ? 'bg-white/10 text-white' : 
                    isActive ? 'bg-white text-black' : 
                    'border border-white/10 text-white/20'
                  }`}
                >
                  {isPast ? <Check size={10} strokeWidth={4} /> : stepNum}
                </div>
                <span className={`text-[9px] uppercase tracking-[0.08em] font-bold whitespace-nowrap transition-colors duration-300 ${
                  isActive ? 'text-white' : 'text-white/20'
                }`}>
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className="w-4 h-[1px] bg-white/5 mr-6" />
              )}
            </div>
          );
        })}
      </div>


      {/* Dynamic content */}
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MAIN PAGE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export default function VideoCallPage() {
  const { token } = useParams();
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [orchState, setOrchState] = useState(() => getOrchestratorState());
  const { user } = useAuth();

  // ── Screen-capture consent recording (lifted state) ─────────────────
  const [screenStream, setScreenStream] = useState(null);
  const [proofBlob, setProofBlob] = useState(null);
  const [cameraStream, setCameraStream] = useState(null);
  const recorderRef = useRef(null);

  useEffect(() => {
    if (user?.id) {
      setUserId(user.id);
    }
  }, [user]);

  // Handle rehydration if token is a UUID
  useEffect(() => {
    let currentAppId = null;
    
    async function handleRehydration() {
      if (!token) return;
      // Basic UUID regex check
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
      if (isUUID) {
        currentAppId = token;
        try {
          const appState = await fetchApplicationState(token);
          if (appState?.application) {
            await rehydrateSession(appState);
          }
        } catch (err) {
          console.error('Failed to rehydrate session:', err);
        }
      }
    }
    
    handleRehydration();
    
    // Cleanup on unmount or token change
    return () => {
       if (currentAppId) {
          unlockApplication(currentAppId).catch(err => console.error('Failed to unlock:', err));
       }
    };
  }, [token]);

  // Subscribe to orchestrator changes
  useEffect(() => {
    const unsub = subscribeOrchestrator(snap => setOrchState(snap));
    return unsub;
  }, []);

  // Force dark bg
  useEffect(() => {
    document.body.style.backgroundColor = C.bg;
    return () => { document.body.style.backgroundColor = ''; };
  }, []);

  // Audio capture
  const { isListening, isProcessing, startRecording, stopRecording } = useAudioCapture();

  // AI state (for live KYC extraction)
  const aiState = useAIState({ debounceMs: 400 });

  // ── Cross-phase recording lifecycle ─────────────────────────────────
  useEffect(() => {
    const isActivePhase =
      orchState.phase === PHASES.OFFER || orchState.phase === PHASES.CONSENT;

    // START: recording begins as soon as screenStream is available in OFFER/CONSENT
    if (isActivePhase && screenStream && !recorderRef.current) {
      const combinedStream = new MediaStream();
      // Merge screen video tracks
      screenStream.getVideoTracks().forEach(t => combinedStream.addTrack(t));
      // Merge camera microphone audio (verbal consent channel)
      if (cameraStream) {
        cameraStream.getAudioTracks().forEach(t => combinedStream.addTrack(t));
      }
      // Merge screen/tab audio if available
      screenStream.getAudioTracks().forEach(t => combinedStream.addTrack(t));

      const chunks = [];
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(combinedStream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        setProofBlob(blob);

        // ── Auto-download to user's device ───────────────────────────────
        const sessionLabel = token ? token.slice(0, 8).toUpperCase() : Date.now();
        const fileName = `consent-proof-${sessionLabel}-${Date.now()}.webm`;
        try {
          const downloadUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = downloadUrl;
          anchor.download = fileName;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          // Revoke after a short delay so the download has time to start
          setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
          console.info('[Consent] Video proof downloaded to device:', fileName);
        } catch (err) {
          console.error('[Consent] Failed to trigger download:', err);
        }

        // Shut down all captured tracks
        combinedStream.getTracks().forEach(t => t.stop());
        screenStream.getTracks().forEach(t => t.stop());
        setScreenStream(null);
        recorderRef.current = null;

        // ── Upload tamper-evident proof to Supabase Storage ──────────────
        // Path: kyc-documents/{applicationId}/consent_videos/{fileName}
        try {
          await uploadMedia('consent_videos', fileName, blob);
          console.info('[Consent] Video proof uploaded to Supabase Storage:', fileName);
        } catch (err) {
          console.error('[Consent] Failed to upload video proof:', err);
        }
      };

      recorder.start(500); // emit chunks every 500 ms
      recorderRef.current = recorder;
      console.info('[Consent] Screen recording started for phase:', orchState.phase);
    }

    // STOP: 4 s after COMPLETE phase, finalise the recording
    if (orchState.phase === PHASES.COMPLETE && recorderRef.current) {
      const stopTimer = setTimeout(() => {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
          console.info('[Consent] Screen recording stopped — COMPLETE phase.');
        }
      }, 4000);
      return () => clearTimeout(stopTimer);
    }
  }, [orchState.phase, screenStream, cameraStream]);

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:flex" style={{ position: 'fixed', top: 64, left: 0, right: 0, bottom: 0, zIndex: 10, overflow: 'hidden' }}>
        <LeftPanel
          isVideoOn={isVideoOn} setIsVideoOn={setIsVideoOn}
          isListening={isListening} isProcessing={isProcessing}
          startRecording={startRecording} stopRecording={stopRecording}
          phase={orchState.phase}
          leftOverlay={orchState.leftOverlay}
          onJoined={() => { }}
          onStreamReady={setCameraStream}
        />
        <RightPanel
          orchState={orchState}
          kycFields={aiState.kycFields}
          token={token}
          proofBlob={proofBlob}
          screenStream={screenStream}
          setScreenStream={setScreenStream}
        />
      </div>

      {/* Mobile */}
      <div className="flex md:hidden flex-col" style={{ position: 'fixed', top: 64, left: 0, right: 0, bottom: 0, zIndex: 10, overflow: 'hidden' }}>
        <div style={{ flex: '0 0 42%', position: 'relative', overflow: 'hidden' }}>
          <LeftPanel
            isVideoOn={isVideoOn} setIsVideoOn={setIsVideoOn}
            isListening={isListening} isProcessing={isProcessing}
            startRecording={startRecording} stopRecording={stopRecording}
            phase={orchState.phase}
            leftOverlay={orchState.leftOverlay}
            onJoined={() => { }}
            onStreamReady={setCameraStream}
          />
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <RightPanel
            orchState={orchState}
            kycFields={aiState.kycFields}
            token={token}
            proofBlob={proofBlob}
            screenStream={screenStream}
            setScreenStream={setScreenStream}
          />
        </div>
      </div>
    </>
  );
}
