import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { LogIn, Key, User as UserIcon, Fingerprint, ShieldCheck } from 'lucide-react';

export const LoginForm: React.FC = () => {
  const { login } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);

  useEffect(() => {
    // Simulate detecting biometric hardware
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      setIsBiometricSupported(true);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const success = login(username, password);
    if (!success) {
      setError('Invalid credentials.');
    }
  };

  const handleBiometricLogin = () => {
    // Simulate FaceID/Fingerprint scan
    const btn = document.querySelector('.btn-biometric');
    if (btn) btn.classList.add('scanning');
    
    setTimeout(() => {
      login('Konstantina Tzanidaki', 'kz123456');
    }, 1200);
  };

  return (
    <div style={{ 
      display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', 
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', padding: '20px' 
    }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '40px 32px', borderRadius: '24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ 
            display: 'inline-flex', padding: '16px', background: 'var(--primary-bg)', 
            borderRadius: '20px', color: 'var(--primary-color)', marginBottom: '16px' 
          }}>
            <ShieldCheck size={40} />
          </div>
          <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800 }}>ShiftWise OS</h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '8px' }}>Internal Fleet & Workforce Portal</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="input-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>
              <UserIcon size={14} /> Username
            </label>
            <input 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
              placeholder="e.g. Konstantina Tzanidaki"
              required
            />
          </div>
          <div className="input-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>
              <Key size={14} /> Password
            </label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
              placeholder="••••••••"
              required
            />
          </div>
          
          {error && <div style={{ color: 'var(--error-color)', fontSize: '0.85rem', textAlign: 'center', background: '#fef2f2', padding: '10px', borderRadius: '8px' }}>{error}</div>}
          
          <button type="submit" className="btn btn-primary" style={{ padding: '16px', borderRadius: '12px', fontSize: '1rem' }}>
            <LogIn size={20} /> Access Hub
          </button>

          {isBiometricSupported && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>OR</span>
                <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
              </div>
              <button 
                type="button" 
                onClick={handleBiometricLogin}
                className="btn btn-outline btn-biometric"
                style={{ width: '100%', padding: '14px', borderRadius: '12px', gap: '12px', borderColor: 'var(--primary-color)', color: 'var(--primary-color)' }}
              >
                <Fingerprint size={24} /> <span>Biometric Unlock</span>
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
