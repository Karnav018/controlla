import React, { useState, useEffect, useRef } from 'react';
import { useGame, Message } from '../context/GameContext';
import { ThumbsUpIcon, ThumbsDownIcon } from './Icons';

export default function Chat() {
  const { messages, sendMessage, sendReaction, isDrawer, gameState, currentRound, drawerId } = useGame();
  const [inputText, setInputText] = useState('');
  const [hasVoted, setHasVoted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset reaction vote status on new round or drawer change
  useEffect(() => {
    setHasVoted(false);
  }, [currentRound, drawerId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isDrawer) return;
    sendMessage(inputText.trim());
    setInputText('');
  };

  const handleReaction = (type: 'like' | 'dislike') => {
    if (hasVoted || isDrawer || gameState !== 'DRAWING') return;
    setHasVoted(true);
    sendReaction(type);
  };

  return (
    <div className="flex flex-col h-full panel bg-[var(--paper)] overflow-hidden">
      
      {/* Header */}
      <div className="p-3 bg-white border-b-2 border-[var(--ink)] font-extrabold text-sm font-display text-[var(--ink)] flex justify-between items-center">
        <span>GUESS & CHAT</span>
        {gameState === 'DRAWING' && !isDrawer && (
          <span className="text-[10px] font-mono text-[var(--coral)] uppercase">Live Round</span>
        )}
      </div>

      {/* Reaction Bar for Viewers (1-Time Vote Per Round) */}
      {gameState === 'DRAWING' && !isDrawer && (
        <div className="p-2 bg-white border-b-2 border-[var(--ink)] flex items-center justify-between gap-2">
          <span className="text-[10px] font-extrabold uppercase text-[var(--ink)] opacity-75">
            {hasVoted ? 'Vote Submitted' : 'Rate Drawing:'}
          </span>
          <div className="flex gap-2 flex-1">
            <button
              onClick={() => handleReaction('like')}
              disabled={hasVoted}
              className={`btn flex-1 py-1 px-2.5 font-bold text-xs flex items-center justify-center gap-1 transition-all ${
                hasVoted 
                  ? 'bg-gray-100 text-gray-400 opacity-60 border-gray-300 cursor-not-allowed shadow-none' 
                  : 'bg-emerald-500 text-white hover:bg-emerald-600 border-[var(--ink)]'
              }`}
              title={hasVoted ? 'You can only vote once per round' : 'Like this drawing'}
            >
              <ThumbsUpIcon size={14} />
              <span>Like</span>
            </button>
            <button
              onClick={() => handleReaction('dislike')}
              disabled={hasVoted}
              className={`btn flex-1 py-1 px-2.5 font-bold text-xs flex items-center justify-center gap-1 transition-all ${
                hasVoted 
                  ? 'bg-gray-100 text-gray-400 opacity-60 border-gray-300 cursor-not-allowed shadow-none' 
                  : 'bg-rose-500 text-white hover:bg-rose-600 border-[var(--ink)]'
              }`}
              title={hasVoted ? 'You can only vote once per round' : 'Dislike this drawing'}
            >
              <ThumbsDownIcon size={14} />
              <span>Dislike</span>
            </button>
          </div>
        </div>
      )}

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollable text-xs font-body">
        {messages.map((msg: Message) => {
          if (msg.type === 'system') {
            return (
              <div key={msg.id} className="text-center py-1 px-2 my-1 rounded bg-gray-100 text-gray-600 font-bold italic text-[11px] border border-gray-300">
                {msg.text}
              </div>
            );
          }
          if (msg.type === 'guess') {
            return (
              <div key={msg.id} className="text-center py-1.5 px-2 my-1 rounded-lg bg-[var(--leaf)] text-white font-bold text-xs shadow-xs border border-[var(--ink)]">
                🎉 {msg.text}
              </div>
            );
          }
          if (msg.type === 'like') {
            return (
              <div key={msg.id} className="flex items-center gap-1.5 py-1 px-2 my-0.5 rounded-lg bg-emerald-50 text-emerald-800 font-bold text-[11px] border border-emerald-300">
                <ThumbsUpIcon size={13} className="text-emerald-600 shrink-0" />
                <span><strong>{msg.sender}</strong> {msg.text}</span>
              </div>
            );
          }
          if (msg.type === 'dislike') {
            return (
              <div key={msg.id} className="flex items-center gap-1.5 py-1 px-2 my-0.5 rounded-lg bg-rose-50 text-rose-800 font-bold text-[11px] border border-rose-300">
                <ThumbsDownIcon size={13} className="text-rose-600 shrink-0" />
                <span><strong>{msg.sender}</strong> {msg.text}</span>
              </div>
            );
          }
          return (
            <div key={msg.id} className="flex flex-col bg-white p-2 rounded-lg border border-[var(--ink)]">
              <span className="font-extrabold text-[var(--coral)] text-[11px]">
                {msg.sender}:
              </span>
              <span className="text-[var(--ink)] break-words text-xs">
                {msg.text}
              </span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <form onSubmit={handleSubmit} className="p-2.5 bg-white border-t-2 border-[var(--ink)] flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={isDrawer}
          placeholder={isDrawer ? "You are Picasso! Draw now..." : "Type your guess here..."}
          className="input flex-1 text-xs py-1.5 px-3 border border-[var(--ink)] disabled:bg-gray-100 disabled:opacity-70"
        />
        <button 
          type="submit" 
          disabled={isDrawer || !inputText.trim()}
          className="btn btn-sky text-xs py-1.5 px-3 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
