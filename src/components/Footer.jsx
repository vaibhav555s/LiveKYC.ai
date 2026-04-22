import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="mt-auto py-8 px-10 border-t border-white/5 bg-black/50">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium tracking-tight text-white/90">LiveKYC.ai</span>
          <span className="hidden md:block w-1 h-1 rounded-full bg-white/20"></span>
          <span className="text-[12px] text-white/40">Built for 2026 AI Hackathon</span>
        </div>
        
        <div className="flex items-center gap-8">
          <Link to="/" className="text-[12px] text-white/40 hover:text-white/60 transition-colors">Privacy</Link>
          <Link to="/" className="text-[12px] text-white/40 hover:text-white/60 transition-colors">Terms</Link>
          <Link to="/" className="text-[12px] text-white/40 hover:text-white/60 transition-colors">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
