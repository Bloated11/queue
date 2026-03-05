import React, { useState, useEffect, useRef } from 'react';
import { 
    MessageSquare, 
    X, 
    Send, 
    Bot, 
    User, 
    MinusCircle, 
    RefreshCcw,
    Sparkles
} from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const Chatbot = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { 
            text: "Hi! I'm your Campus AI. I can help you check your ticket status, list departments, or find the best time to visit. What can I do for you?", 
            sender: 'bot',
            options: [
                { label: '🎟️ My Ticket', value: 'my ticket status' },
                { label: '🏢 Departments', value: 'list departments' },
                { label: '🚦 Queue Status', value: 'is it busy' }
            ]
        }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async (text = input) => {
        if (!text.trim()) return;

        const userMessage = { text, sender: 'user' };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const token = localStorage.getItem('token');
            const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
            let role = storedUser.role || localStorage.getItem('role') || 'guest';
            let userId = storedUser.id || storedUser._id || localStorage.getItem('guestToken') || 'anonymous';

            if (token && (userId === 'anonymous' || !userId)) {
                try {
                    // Simple JWT decode to get ID
                    const base64Url = token.split('.')[1];
                    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                    }).join(''));
                    const decoded = JSON.parse(jsonPayload);
                    userId = decoded.id;
                } catch (e) {
                    console.error("Token decode error:", e);
                }
            }
            
            const response = await axios.post(`${import.meta.env.VITE_API_URL}/chatbot/query`, {
                message: text,
                userId: userId,
                role: role
            });

            const botMessage = {
                text: response.data.response,
                sender: 'bot',
                options: response.data.options || []
            };

            setMessages(prev => [...prev, botMessage]);
        } catch (error) {
            console.error('Chatbot error:', error);
            setMessages(prev => [...prev, { 
                text: "Sorry, I'm having trouble connecting to the server. Please try again later.", 
                sender: 'bot' 
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleOptionClick = (optionValue) => {
        handleSend(optionValue);
    };

    return (
        <div className="fixed bottom-6 right-6 z-[9999]">
            <AnimatePresence>
                {!isOpen && (
                    <motion.button
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        onClick={() => setIsOpen(true)}
                        className="bg-[var(--accent-primary)] text-white p-4 rounded-full shadow-2xl hover:scale-110 transition-transform flex items-center justify-center group relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                        <MessageSquare size={28} />
                    </motion.button>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 100, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 100, scale: 0.9 }}
                        className="bg-[var(--bg-secondary)] border border-[var(--glass-border)] w-[380px] h-[550px] rounded-2xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl"
                    >
                        {/* Header */}
                        <div className="bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] p-4 text-white flex justify-between items-center shadow-lg">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/20 rounded-lg">
                                    <Sparkles size={20} className="animate-pulse" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm">Campus Assistant</h3>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                        <span className="text-[10px] opacity-80 font-medium uppercase tracking-wider">AI Powered</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setMessages([messages[0]])}
                                    className="hover:bg-white/20 p-1.5 rounded-lg transition-colors"
                                    title="Reset Chat"
                                >
                                    <RefreshCcw size={18} />
                                </button>
                                <button 
                                    onClick={() => setIsOpen(false)}
                                    className="hover:bg-white/20 p-1.5 rounded-lg transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[var(--bg-primary)]/30">
                            {messages.map((msg, index) => (
                                <motion.div
                                    initial={{ opacity: 0, x: msg.sender === 'user' ? 20 : -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    key={index}
                                    className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`flex gap-2 max-w-[85%] ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                            msg.sender === 'user' ? 'bg-[var(--accent-primary)]' : 'bg-[var(--bg-tertiary)] border border-[var(--glass-border)]'
                                        }`}>
                                            {msg.sender === 'user' ? <User size={16} /> : <Bot size={16} />}
                                        </div>
                                        <div className="space-y-2">
                                            <div className={`p-3 rounded-2xl text-sm shadow-sm ${
                                                msg.sender === 'user' 
                                                ? 'bg-[var(--accent-primary)] text-white rounded-tr-none' 
                                                : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--glass-border)] rounded-tl-none'
                                            }`}>
                                                {msg.text}
                                            </div>
                                            
                                            {msg.options && msg.options.length > 0 && (
                                                <div className="flex flex-wrap gap-2 pt-1">
                                                    {msg.options.map((opt, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => handleOptionClick(opt.value)}
                                                            className="text-xs py-1.5 px-3 rounded-full bg-[var(--bg-tertiary)] border border-[var(--glass-border)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-all duration-300 font-medium"
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                            {loading && (
                                <div className="flex justify-start">
                                    <div className="bg-[var(--bg-tertiary)] border border-[var(--glass-border)] p-3 rounded-2xl rounded-tl-none flex gap-1">
                                        <span className="w-1.5 h-1.5 bg-[var(--text-secondary)] rounded-full animate-bounce" />
                                        <span className="w-1.5 h-1.5 bg-[var(--text-secondary)] rounded-full animate-bounce [animation-delay:0.2s]" />
                                        <span className="w-1.5 h-1.5 bg-[var(--text-secondary)] rounded-full animate-bounce [animation-delay:0.4s]" />
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <form 
                            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                            className="p-4 bg-[var(--bg-secondary)] border-t border-[var(--glass-border)] flex gap-2"
                        >
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Ask about queues..."
                                className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--glass-border)] rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[var(--accent-primary)] transition-colors text-[var(--text-primary)]"
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className="bg-[var(--accent-primary)] text-white p-2 rounded-xl hover:bg-[var(--accent-secondary)] transition-colors disabled:opacity-50"
                            >
                                <Send size={20} />
                            </button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Chatbot;
