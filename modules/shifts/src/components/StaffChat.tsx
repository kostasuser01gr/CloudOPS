import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Send, Hash, Info, MessageSquare, AlertTriangle, CheckCircle } from 'lucide-react';

export const StaffChat: React.FC = () => {
  const { 
    chatMessages, chatThreads, sendMessage, createThread, 
    currentUser, selectedBranch 
  } = useStore();
  
  const [input, setInput] = useState('');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatThreads, activeThreadId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const msg = input;
    setInput('');
    await sendMessage(msg, selectedBranch, activeThreadId || undefined);
  };

  const currentMessages = activeThreadId 
    ? chatThreads.find(t => t.id === activeThreadId)?.messages || []
    : chatMessages;

  return (
    <div className="card chat-layout" style={{ display: 'flex', height: '600px', padding: 0, overflow: 'hidden' }}>
      {/* Thread Sidebar */}
      <div className="chat-sidebar" style={{ width: '240px', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', fontWeight: 'bold', fontSize: '0.875rem', borderBottom: '1px solid var(--border-color)' }}>
          Operational Channels
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <button 
            className={`nav-item ${!activeThreadId ? 'active' : ''}`}
            onClick={() => setActiveThreadId(null)}
            style={{ width: '100%', borderRadius: 0, border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
          >
            <Hash size={16} /> #general-ops
          </button>
          
          <div style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
            Incident Threads
          </div>
          {chatThreads.map(thread => (
            <button 
              key={thread.id}
              className={`nav-item ${activeThreadId === thread.id ? 'active' : ''}`}
              onClick={() => setActiveThreadId(thread.id)}
              style={{ width: '100%', borderRadius: 0, border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
            >
              <MessageSquare size={16} /> {thread.title}
            </button>
          ))}
        </div>
        {currentUser?.role !== 'Staff' && (
          <button 
            className="btn btn-outline" 
            style={{ margin: '8px', fontSize: '0.75rem' }}
            onClick={() => {
              const title = prompt('Thread Title (e.g. Damage Car ABC-123)');
              if (title) createThread(title, 'Damage');
            }}
          >
            + New Incident
          </button>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="chat-main" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {activeThreadId ? <MessageSquare size={20} color="var(--primary-color)" /> : <Hash size={20} color="#64748b" />}
            <span style={{ fontWeight: 'bold' }}>
              {activeThreadId ? chatThreads.find(t => t.id === activeThreadId)?.title : `${selectedBranch}-ops`}
            </span>
          </div>
          {activeThreadId && (
            <div className="badge" style={{ fontSize: '0.7rem', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 4 }}>
              Active Incident
            </div>
          )}
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {currentMessages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#64748b', marginTop: 60 }}>
              <Info size={40} style={{ opacity: 0.5, marginBottom: 8 }} />
              <p>No messages yet. Start the conversation.</p>
            </div>
          )}
          {currentMessages.map(msg => (
            <div key={msg.id} style={{ display: 'flex', gap: 12, maxWidth: '85%', alignSelf: msg.senderId === currentUser?.id ? 'flex-end' : 'flex-start', flexDirection: msg.senderId === currentUser?.id ? 'row-reverse' : 'row' }}>
              <div style={{ 
                width: '32px', height: '32px', borderRadius: '50%', background: msg.isAiResponse ? 'var(--primary-color)' : '#e2e8f0', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', color: msg.isAiResponse ? 'white' : '#64748b', flexShrink: 0 
              }}>
                {msg.isAiResponse ? 'AI' : msg.senderName.charAt(0)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: msg.senderId === currentUser?.id ? 'flex-end' : 'flex-start' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: 4 }}>
                  {msg.senderName} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div style={{ 
                  background: msg.isAiResponse ? 'var(--primary-bg)' : (msg.senderId === currentUser?.id ? 'var(--primary-color)' : '#f1f5f9'),
                  color: msg.senderId === currentUser?.id ? 'white' : 'var(--text-color)',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  fontSize: '0.9rem',
                  border: msg.isAiResponse ? '1px solid var(--primary-color)' : 'none',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}>
                  {msg.content}
                  {msg.tags && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
                      {msg.tags.map(tag => (
                        <span key={tag} style={{ fontSize: '0.7rem', fontWeight: 'bold', background: 'rgba(0,0,0,0.1)', padding: '2px 6px', borderRadius: 4 }}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSend} style={{ padding: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 8 }}>
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={currentUser?.role === 'Super-Admin' ? "Command system with /ai..." : "Type message (use @Role to ping)..."}
            style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
          />
          <button type="submit" className="btn btn-primary icon-only" disabled={!input.trim()} style={{ width: '48px', height: '48px' }}>
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
};
