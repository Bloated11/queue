import React, { useState, useEffect } from 'react';
import { socket } from '../../services/socket';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, MessageSquare, X } from 'lucide-react';
import api from '../../services/api';

const FeedbackPrompt = () => {
  const [ticketData, setTicketData] = useState(null);
  const [comment, setComment] = useState("");
  const [options, setOptions] = useState([]);
  const [rating, setRating] = useState(5);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    socket.on('show_feedback_prompt', (data) => {
      setTicketData(data);
      setSubmitted(false);
    });

    return () => socket.off('show_feedback_prompt');
  }, []);

  const handleToggleOption = (opt) => {
    setOptions(prev => 
      prev.includes(opt) ? prev.filter(item => item !== opt) : [...prev, opt]
    );
  };

  const handleSubmit = async () => {
    try {
      await api.post('/student/feedback', {
        ticketId: ticketData.ticketId,
        options,
        comment,
        rating
      });
      setSubmitted(true);
      setTimeout(() => setTicketData(null), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  if (!ticketData) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[var(--bg-secondary)] border border-[var(--glass-border)] w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
      >
        {!submitted ? (
          <div className="p-8">
            <div className="flex justify-between items-start mb-6">
              <div className="p-3 bg-yellow-500/10 rounded-2xl text-yellow-500">
                <Star size={24} fill="currentColor"/>
              </div>
              <button onClick={() => setTicketData(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors opacity-50">
                <X size={20}/>
              </button>
            </div>

            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">How was your service?</h2>
            <p className="text-[var(--text-secondary)] text-sm mb-8">
              Ticket <span className="text-[var(--accent-primary)] font-bold">#{ticketData.ticketNumber}</span> at {ticketData.departmentName} is completed.
            </p>

            <div className="space-y-6">
               {/* STAR RATING */}
               <div className="flex flex-col items-center gap-2 mb-2">
                 <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Rate your experience</p>
                 <div className="flex gap-2">
                   {[1, 2, 3, 4, 5].map((star) => (
                     <button
                       key={star}
                       onClick={() => setRating(star)}
                       className={`p-1 transition-all hover:scale-110 ${rating >= star ? "text-yellow-500" : "text-white/10"}`}
                     >
                       <Star size={32} fill={rating >= star ? "currentColor" : "none"} />
                     </button>
                   ))}
                 </div>
               </div>

               <div className="flex flex-wrap gap-2">
                 {["Fast Service", "Friendly Staff", "Organized", "Clear Info", "Professional"].map(opt => (
                   <button
                     key={opt}
                     onClick={() => handleToggleOption(opt)}
                     className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                       options.includes(opt)
                         ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white"
                         : "bg-white/5 border-[var(--glass-border)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]"
                     }`}
                   >
                     {opt}
                   </button>
                 ))}
               </div>

               <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest ml-1">Additional Comment</label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Anything else you'd like to share?"
                    className="input-field min-h-[100px] py-3 resize-none text-sm"
                  />
               </div>

               <button
                 onClick={handleSubmit}
                 disabled={options.length === 0}
                 className="btn-primary w-full py-4 text-sm flex items-center justify-center gap-2"
               >
                 Submit Feedback
               </button>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center">
             <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={40} className="text-green-500"/>
             </div>
             <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Thank You!</h2>
             <p className="text-[var(--text-secondary)]">Your feedback helps us improve campus services.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
};

const CheckCircle = ({size, className}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

export default FeedbackPrompt;
