import { useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';

/* ── Wavy Background Component ─────────────────── */
function WavyBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="wavy-line"
          style={{
            top: `${i * 10}%`,
            animationDelay: `${i * -0.5}s`,
            animationDuration: `${10 + i * 2}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Card 3D Component ─────────────────────────── */
function FeatureCard3D({ icon, title, description, index }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <div
      ref={ref}
      className={`card-3d-enter glass-card p-10 flex flex-col gap-6 ${isInView ? 'visible' : ''}`}
      style={{ transitionDelay: `${index * 0.1}s` }}
    >
      <div className="w-12 h-12 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-500">
        {icon}
      </div>
      <div>
        <h3 className="text-xl font-medium mb-3 text-white">{title}</h3>
        <p className="text-[15px] leading-relaxed text-white/50 max-w-[280px]">
          {description}
        </p>
      </div>
    </div>
  );
}

/* ── Word Reveal Paragraph ─────────────────────── */
function WordReveal({ text }) {
  const words = text.split(' ');
  return (
    <p className="text-[24px] leading-[1.4] font-normal flex flex-wrap gap-x-2 gap-y-1 max-w-[500px]">
      {words.map((word, i) => (
        <Word key={i} word={word} index={i} />
      ))}
    </p>
  );
}

function Word({ word, index }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 85%", "start 60%"]
  });
  
  const opacity = useTransform(scrollYProgress, [0, 1], [0.15, 0.9]);

  return (
    <motion.span
      ref={ref}
      style={{ opacity }}
      className="text-white"
    >
      {word}
    </motion.span>
  );
}

/* ── Geometric Icon ────────────────────────────── */
const FlowerOfLife = ({ size = 18, color = "currentColor", className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" stroke={color} strokeWidth="1.5" className={className}>
    <circle cx="50" cy="50" r="30" />
    <circle cx="50" cy="20" r="30" />
    <circle cx="50" cy="80" r="30" />
    <circle cx="24" cy="35" r="30" />
    <circle cx="76" cy="35" r="30" />
    <circle cx="24" cy="65" r="30" />
    <circle cx="76" cy="65" r="30" />
  </svg>
);

/* ── MAIN COMPONENT ────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  const parallaxY = useTransform(scrollYProgress, [0, 1], [0, -400]);

  const features = [
    {
      title: 'Live AI Interview',
      description: 'Experience natural conversation with our AI agent that captures KYC data through live video interaction.',
      icon: <FlowerOfLife size={24} />
    },
    {
      title: 'KYC Extraction',
      description: 'Real-time extraction and validation of identity documents during the call with zero manual entry.',
      icon: <FlowerOfLife size={24} />
    },
    {
      title: 'Fraud Detection',
      description: 'Immediate biometric and behavioral analysis to flag risks before they enter your system.',
      icon: <FlowerOfLife size={24} />
    },
    {
      title: 'Instant Approval',
      description: 'Customized loan structures generated on-the-fly based on direct behavioral assessment.',
      icon: <FlowerOfLife size={24} />
    }
  ];

  return (
    <div ref={containerRef} className="relative min-h-screen bg-[#0A0A0A] selection:bg-violet-500/30">
      
      {/* ── HERO SECTION ────────────────────────── */}
      <section className="relative h-screen flex flex-col items-center justify-center text-center px-6 overflow-hidden">
        <WavyBackground />
        
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
          className="relative z-10"
        >
          <div className="hero-heading mb-10">
            <div className="text-white">Loan Approvals.</div>
            <div className="text-white">
              Reimagined <span className="ghost-italic">with AI.</span>
            </div>
          </div>
          
          <p className="text-[16px] text-white/50 max-w-[360px] mx-auto mb-10 leading-relaxed font-normal">
            End-to-end loan onboarding through a live AI video call. 
            No forms. No branches. Approved in minutes.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => navigate('/session/demo-token-123')}
              className="btn-primary"
            >
              Start Demo
            </button>
            <button
              onClick={() => navigate('/ops')}
              className="btn-outline"
            >
              View Dashboard
            </button>
          </div>
        </motion.div>
      </section>

      {/* ── PARALLAX SCROLL SECTION ─────────────── */}
      <section className="relative py-40 overflow-hidden">
        <motion.div 
          style={{ y: parallaxY }}
          className="giant-text opacity-[0.03] pointer-events-none absolute top-1/2 left-0 -translate-y-1/2"
        >
          Verify.
        </motion.div>

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 stagger-cards">
            {features.map((f, i) => (
              <div key={i} className={i % 2 !== 0 ? 'md:mt-32' : ''}>
                <FeatureCard3D {...f} index={i} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WORD REVEAL SECTION ─────────────────── */}
      <section className="py-60 px-6">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-start justify-between gap-20">
          <div className="hero-heading opacity-[0.03] select-none">
            LiveKYC.ai
          </div>
          
          <div className="lg:mt-10">
            <WordReveal text="Complete loan onboarding through a live AI video call. No forms. No branches. Approved in minutes. Our system identifies and extracts identity markers in real-time, ensuring a seamless experience for every applicant while maintaining complete regulatory compliance." />
          </div>
        </div>
      </section>

      {/* ── STATS BAR ───────────────────────────── */}
      <section className="py-40 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-20">
            {[
              { val: '< 5 mins', label: 'Average Onboarding' },
              { val: '94%', label: 'Completion Rate' },
              { val: 'Zero', label: 'Manual Input' },
              { val: '100%', label: 'AI Driven' },
            ].map((s, i) => (
              <div key={i} className="flex flex-col gap-3">
                <div className="text-[48px] font-medium tracking-tighter text-white">{s.val}</div>
                <div className="text-[13px] text-white/50 uppercase tracking-widest">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────── */}
      <section className="py-60 px-6 text-center bg-black/50">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <div className="hero-heading mb-10 text-white">Scale Beyond Human.</div>
          <button
            onClick={() => navigate('/session/demo-token-123')}
            className="btn-primary px-12 py-5 text-lg"
          >
            Launch Demo Session
          </button>
        </motion.div>
      </section>

    </div>
  );
}
