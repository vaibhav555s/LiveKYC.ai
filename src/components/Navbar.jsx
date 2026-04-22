import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  const navLinks = [
    { label: 'About', href: '/#about' },
    { label: 'How it Works', href: '/#how' },
    { label: 'For Whom', href: '/#whom' },
    { label: 'Dashboard', href: '/ops' },
    { label: 'Compliance', href: '/compliance' },
  ];

  const flowerOfLife = (
    <svg width="18" height="18" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="50" cy="50" r="30" />
      <circle cx="50" cy="20" r="30" />
      <circle cx="50" cy="80" r="30" />
      <circle cx="24" cy="35" r="30" />
      <circle cx="76" cy="35" r="30" />
      <circle cx="24" cy="65" r="30" />
      <circle cx="76" cy="65" r="30" />
    </svg>
  );

  return (
    <nav className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] w-fit">
      <div className="glass-nav px-6 h-12 flex items-center gap-6 whitespace-nowrap shadow-2xl">
        <Link to="/" className="flex items-center gap-2 text-white">
          <span className="opacity-80">{flowerOfLife}</span>
          <span className="text-[13px] font-medium tracking-tight">LiveKYC.ai</span>
        </Link>
        
        <div className="hidden md:flex items-center gap-5">
          {navLinks.map(link => (
            <Link
              key={link.href}
              to={link.href}
              className="text-[13px] text-white/70 hover:text-white transition-colors duration-200"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {user ? (
          <button 
            onClick={() => navigate('/dashboard')}
            className="text-[13px] font-medium text-white/80 hover:text-white px-3 py-1 rounded-full border border-white/10 hover:border-white/20 transition-all"
          >
            Dashboard
          </button>
        ) : (
          <button 
            onClick={() => navigate('/auth')}
            className="text-[13px] font-medium text-white/80 hover:text-white px-3 py-1 rounded-full border border-white/10 hover:border-white/20 transition-all"
          >
            Login
          </button>
        )}
      </div>
    </nav>
  );
}
