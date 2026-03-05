import { useEffect, useState, useRef } from "react";
import {
  getStaffProfile,
  callNextTicket,
  completeTicket,
  toggleQueue,
  togglePauseQueue,
  increaseQueueLimit,
  getQueueStats,
  getPendingEmergencies,
  sendBroadcast,
  markNoShow,
} from "../../services/staff";
import api from "../../services/api";
import { socket } from "../../services/socket";
import DashboardSidebar from "../../components/DashboardSidebar";
import { Activity, Settings, QrCode, Megaphone } from "lucide-react";

export default function StaffDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  const [staff, setStaff] = useState(null);
  const [currentTicket, setCurrentTicket] = useState(null);
  const [message, setMessage] = useState("");
  const [increaseBy, setIncreaseBy] = useState("");

  const [qrData, setQrData] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);

  const [completing, setCompleting] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseText, setPauseText] = useState("");

  const [emergencyActive, setEmergencyActive] = useState(false);
  const [emergencyNote, setEmergencyNote] = useState("");
  const [emergencies, setEmergencies] = useState([]);
  const [pendingEmergencies, setPendingEmergencies] = useState(0);

  const [stats, setStats] = useState({ total: 0, served: 0, waiting: 0, serving: 0, onHold: 0 });
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState("");
  const [note, setNote] = useState("");
  const [activeTicketData, setActiveTicketData] = useState(null);
  const [activityFeed, setActivityFeed] = useState([]);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const joinedRef = useRef(false);

  useEffect(() => {
    fetchStaff();
    fetchStats();
    fetchEmergencyCount();
    fetchEmergencies();
    fetchDepartments();

    const onEmergencyRequested = (data) => {
      fetchEmergencyCount();
      fetchEmergencies();
      
      // Staff Notification
      if (Notification.permission === "granted") {
        new Notification("🚨 NEW EMERGENCY REQUEST", {
          body: `Reason: ${data?.reason || "No reason provided"}`,
        });
      }
    };

    socket.on("emergency_requested", onEmergencyRequested);
    return () => socket.off("emergency_requested", onEmergencyRequested);
  }, []);

  const fetchStaff = async () => {
    try {
      const data = await getStaffProfile();
      setStaff(data);
      if (data.currentTicketDetails) {
         setCurrentTicket(data.currentTicketDetails.ticketNumber);
         fetchActiveTicketDetails(data.currentTicketDetails._id);
      }
      if (!joinedRef.current && data?.department?._id) {
        socket.emit("join_department", data.department._id);
        joinedRef.current = true;
      }
      
      // Request notifications for emergency alerts
      if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch (err) {
      setMessage("Failed to load staff");
    }
  };

  const fetchStats = async () => {
    try {
      const data = await getQueueStats();
      setStats(data);
    } catch {}
  };

  const fetchEmergencyCount = async () => {
    try {
      const res = await api.get("/staff/emergency/count");
      setPendingEmergencies(res.data.count);
    } catch {}
  };

  const fetchEmergencies = async () => {
    try {
      const data = await getPendingEmergencies();
      setEmergencies(data);
    } catch {}
  };

  const fetchDepartments = async () => {
    try {
      const res = await api.get("/staff/transfer-departments");
      setDepartments(res.data);
    } catch {}
  };

  const fetchActiveTicketDetails = async (ticketId) => {
     try {
        const res = await api.get(`/staff/ticket/${ticketId}`);
        setActiveTicketData(res.data);
     } catch {}
  };

  const handleAddNote = async () => {
    if (!note || !activeTicketData) return;
    try {
      await api.post("/staff/add-note", {
        ticketId: activeTicketData._id,
        content: note,
      });
      setNote("");
      fetchActiveTicketDetails(activeTicketData._id);
    } catch {
      setMessage("Failed to add note");
    }
  };

  const handleTransfer = async () => {
    if (!selectedDept || !activeTicketData) return;
    try {
      await api.post("/staff/transfer", {
        ticketId: activeTicketData._id,
        toDepartmentId: selectedDept,
      });
      setMessage(`Ticket ${activeTicketData.ticketNumber} transferred.`);
      setCurrentTicket(null);
      setActiveTicketData(null);
      setSelectedDept("");
      fetchStats();
    } catch {
      setMessage("Transfer failed");
    }
  };

  /* SOCKETS */
  useEffect(() => {
    const onTicketCalled = async (data) => {
      setCurrentTicket(data.ticketNumber);
      if (data.ticketId) fetchActiveTicketDetails(data.ticketId);
      fetchStats();
      addActivity(`Ticket ${data.ticketNumber} called`);
    };
    const onTicketCompleted = (data) => {
      setCurrentTicket(null);
      setActiveTicketData(null);
      setCompleting(false);
      fetchStats();
      addActivity(`Ticket ${data?.ticketNumber || "Active"} completed`);
    };
    const onEmergencyStarted = (data) => {
      setEmergencyActive(true);
      setEmergencyNote(data?.note || "Emergency in progress");
      setCurrentTicket("EMERGENCY");
      addActivity(`🚨 Emergency started: ${data?.note || "Priority service active"}`);
    };
    const onEmergencyEnded = () => {
      setEmergencyActive(false);
      setEmergencyNote("");
      setCurrentTicket(null);
      addActivity("✅ Emergency resolved");
    };

    const onPauseToggled = (data) => {
      setIsPaused(data.isPaused);
      setPauseText(data.pauseMessage);
      addActivity(`Queue ${data.isPaused ? "Paused" : "Resumed"}`);
    };

    const onHoldToggled = (data) => {
      fetchStats();
      addActivity(`Ticket ${data.ticketNumber} ${data.status === 'hold' ? 'stepped away' : 'returned'}`);
    };

    const addActivity = (msg) => {
      setActivityFeed(prev => [{
        id: Date.now(),
        message: msg,
        time: new Date().toLocaleTimeString()
      }, ...prev].slice(0, 10));
    };

    socket.on("ticket_called", onTicketCalled);
    socket.on("ticket_completed", onTicketCompleted);
    socket.on("emergency_started", onEmergencyStarted);
    socket.on("emergency_ended", onEmergencyEnded);
    socket.on("queue_pause_toggled", onPauseToggled);
    socket.on("ticket_hold_toggled", onHoldToggled);

    return () => {
      socket.off("ticket_called", onTicketCalled);
      socket.off("ticket_completed", onTicketCompleted);
      socket.off("emergency_started", onEmergencyStarted);
      socket.off("emergency_ended", onEmergencyEnded);
      socket.off("queue_pause_toggled", onPauseToggled);
      socket.off("ticket_hold_toggled", onHoldToggled);
    };
  }, []);

  /* ACTIONS */
  const handleCallNext = async () => {
    try {
      const data = await callNextTicket();
      setCurrentTicket(data.ticketNumber);
      if (data.ticketId) fetchActiveTicketDetails(data.ticketId);
      setMessage(data.message);
      fetchStats();
    } catch (err) {
      setMessage(err.response?.data?.message || "No tickets in queue");
    }
  };

  const handleCompleteTicket = async () => {
    if (completing) return;
    try {
      setCompleting(true);
      const data = await completeTicket();
      setMessage(data.message);
      fetchStats();
    } catch (err) {
      setMessage(err.response?.data?.message || "No active ticket");
      setCompleting(false);
    }
  };

  const handleToggleQueue = async () => {
    try {
      const data = await toggleQueue();
      setIsQueueOpen(data.isOpen);
      setMessage(data.message);
    } catch (err) {
      setMessage("Failed to toggle queue");
    }
  };

  const handleTogglePause = async () => {
    try {
      const data = await togglePauseQueue();
      setIsPaused(data.isPaused);
      setPauseText(data.pauseMessage);
      setMessage(data.message);
    } catch (err) {
      setMessage("Failed to toggle pause");
    }
  };

  const handleIncreaseLimit = async () => {
    if (!increaseBy || Number(increaseBy) <= 0) return;
    try {
      const data = await increaseQueueLimit(Number(increaseBy));
      setMessage(`Queue limit updated to ${data.maxTickets}`);
      setIncreaseBy("");
    } catch {
      setMessage("Failed to update limit");
    }
  };

  const handleGenerateQR = async () => {
    try {
      setQrLoading(true);
      const res = await api.get("/staff/department/qr");
      setQrData(res.data);
      setMessage("");
    } catch {
      setMessage("Failed to generate QR");
    } finally {
      setQrLoading(false);
    }
  };

  const handleStartEmergency = async (id = null) => {
    try {
      const payload = { note: "Emergency in progress" };
      if (id) payload.emergencyId = id; // Update backend to handle specific ID if desired, otherwise it still picks first approved
      await api.post("/staff/emergency/start", payload);
      fetchEmergencyCount();
      fetchEmergencies();
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to start emergency");
    }
  };

  const handleEndEmergency = async () => {
    try {
      await api.post("/staff/emergency/end");
    } catch {
      setMessage("Failed to resolve emergency");
    }
  };

  const handleRejectEmergency = async (id) => {
    try {
      await api.post(`/staff/emergency/reject/${id}`);
      setMessage("Emergency rejected");
      fetchEmergencyCount();
      fetchEmergencies();
    } catch {
      setMessage("Failed to reject emergency");
    }
  };

  const handleApproveEmergency = async (id) => {
    try {
      await api.post(`/staff/emergency/approve/${id}`);
      setMessage("Emergency approved");
      fetchEmergencyCount();
      fetchEmergencies();
    } catch {
      setMessage("Failed to approve emergency");
    }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastMsg) return;
    try {
      await sendBroadcast(broadcastMsg);
      setMessage("Broadcast sent!");
      setBroadcastMsg("");
    } catch {
      setMessage("Failed to send broadcast");
    }
  };

  const handleMarkNoShow = async () => {
    if (!activeTicketData) return;
    try {
      await markNoShow(activeTicketData._id);
      setMessage(`Ticket ${activeTicketData.ticketNumber} marked as no-show.`);
      setCurrentTicket(null);
      setActiveTicketData(null);
      fetchStats();
    } catch {
      setMessage("Failed to mark no-show");
    }
  };

  const tabs = [
    { id: "overview", label: "Queue Visuals", icon: Activity },
    { id: "settings", label: "Queue Settings", icon: Settings },
    { id: "qr", label: "QR Generator", icon: QrCode },
  ];

  return (
    <div className="flex min-h-screen bg-[var(--bg-primary)]">
      <DashboardSidebar 
        title="Staff Panel" 
        tabs={tabs} 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
      />

      <main className="flex-1 md:ml-64 p-6 md:p-10 pt-20 md:pt-10 transition-all duration-300">
        
        {/* HEADER */}
        <header className="mb-10">
           <h1 className="text-3xl font-bold text-[var(--text-primary)]">
              {activeTab === "overview" && "Live Operations"}
              {activeTab === "settings" && "Queue Control"}
              {activeTab === "qr" && "Access Code"}
           </h1>
           <p className="text-[var(--text-secondary)] mt-1">
              Department: <span className="font-semibold text-[var(--accent-primary)]">{staff?.department?.name || "Loading..."}</span>
           </p>
        </header>


        {/* TAB 1: OVERVIEW & OPERATIONS */}
        {activeTab === "overview" && (
           <div className="animate-fade-in space-y-12">
              
              {/* NOW SERVING CARD */}
              <div className="card text-center py-12 relative overflow-hidden">
                  <div className="relative z-10">
                     <p className="uppercase tracking-widest text-sm text-[var(--text-secondary)] mb-4">Now Serving</p>
                     <div className="text-[80px] md:text-[120px] font-black leading-none text-[var(--text-primary)] drop-shadow-2xl">
                        {currentTicket || <span className="text-slate-700 opacity-20">--</span>}
                     </div>
                     {emergencyActive && (
                        <p className="mt-4 text-red-500 font-bold animate-pulse">🚨 EMERGENCY MODE ACTIVE</p>
                     )}
                  </div>
                  {/* Glow */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[var(--accent-primary)] rounded-full blur-[100px] opacity-10" />
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex flex-wrap justify-center gap-6">
                 <button
                    onClick={handleCallNext}
                    disabled={stats.remaining === 0 || emergencyActive}
                    className="btn-primary px-12 py-5 text-lg rounded-2xl w-full md:w-auto"
                 >
                    Call Next Ticket
                 </button>
                 <button
                    onClick={handleCompleteTicket}
                    disabled={!currentTicket || completing || emergencyActive}
                    className="btn-secondary px-12 py-5 text-lg rounded-2xl w-full md:w-auto"
                 >
                    {completing ? "Completing..." : "Complete Ticket"}
                 </button>
                 {activeTicketData && (
                    <button
                       onClick={handleMarkNoShow}
                       className="px-12 py-5 text-lg rounded-2xl w-full md:w-auto border border-red-500/20 text-red-500 hover:bg-red-500/10 font-bold transition-all"
                    >
                       Mark No-Show
                    </button>
                 )}
              </div>

              {/* TICKET CONTEXT (NOTES & TRANSFER) */}
              {activeTicketData && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4 duration-500">
                   {/* NOTES SECTION */}
                   <div className="card p-6 flex flex-col h-full border-blue-500/10">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-4 flex items-center gap-2">
                        📝 Internal Notes
                      </h3>
                      <div className="flex-1 overflow-y-auto max-h-[200px] mb-4 space-y-3 pr-2 scrollbar-thin">
                         {activeTicketData.notes?.length > 0 ? activeTicketData.notes.map((n, i) => (
                           <div key={i} className="bg-white/5 p-3 rounded-xl border border-white/5">
                              <p className="text-sm text-[var(--text-primary)]">{n.content}</p>
                              <div className="flex justify-between mt-2 opacity-50 text-[10px]">
                                 <span>By {n.author?.fullName || "Staff"}</span>
                                 <span>{new Date(n.createdAt).toLocaleTimeString()}</span>
                              </div>
                           </div>
                         )) : (
                           <p className="text-xs text-[var(--text-secondary)] italic text-center py-4">No notes for this ticket.</p>
                         )}
                      </div>
                      <div className="flex gap-2">
                         <input 
                           placeholder="Add a private note..." 
                           value={note}
                           onChange={(e) => setNote(e.target.value)}
                           className="input-field py-2 text-sm flex-1"
                         />
                         <button onClick={handleAddNote} className="btn-primary py-2 px-4 text-xs">Add</button>
                      </div>
                   </div>

                   {/* TRANSFER SECTION */}
                   <div className="card p-6 border-purple-500/10">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-4">
                        🚀 Transfer Ticket
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] mb-6">Transfer this student to another department queue.</p>
                      <div className="space-y-4">
                         <select 
                           value={selectedDept}
                           onChange={(e) => setSelectedDept(e.target.value)}
                           className="input-field"
                         >
                            <option value="">Select Target Department...</option>
                            {departments.filter(d => d._id !== staff?.department?._id).map(d => (
                              <option key={d._id} value={d._id}>{d.name}</option>
                            ))}
                         </select>
                         <button 
                           onClick={handleTransfer}
                           disabled={!selectedDept}
                           className="btn-secondary w-full py-3 text-sm border-purple-500/20 hover:bg-purple-500/10 text-purple-400 font-bold"
                         >
                            Confirm Transfer
                         </button>
                      </div>
                   </div>
                </div>
              )}

               {/* STATS */}
               <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="card text-center py-6">
                     <p className="text-xs uppercase text-[var(--text-secondary)]">Waiting</p>
                     <p className="text-3xl font-bold text-[var(--accent-primary)]">{stats.waiting}</p>
                  </div>
                  <div className="card text-center py-6 border-yellow-500/20">
                     <p className="text-xs uppercase text-yellow-600">On Hold</p>
                     <p className="text-3xl font-bold text-yellow-500">{stats.onHold}</p>
                  </div>
                  <div className="card text-center py-6 border-purple-500/20">
                     <p className="text-xs uppercase text-purple-600">Serving</p>
                     <p className="text-3xl font-bold text-purple-500">{stats.serving}</p>
                  </div>
                  <div className="card text-center py-6">
                     <p className="text-xs uppercase text-[var(--text-secondary)]">Served</p>
                     <p className="text-3xl font-bold text-green-500">{stats.served}</p>
                  </div>
                  <div className="card text-center py-6">
                     <p className="text-xs uppercase text-[var(--text-secondary)]">Total</p>
                     <p className="text-3xl font-bold text-[var(--text-primary)]">{stats.total}</p>
                  </div>
               </div>

                {/* ACTIVITY FEED */}
                <div className="card p-6 border-blue-500/10">
                   <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-4 flex items-center gap-2">
                     📡 Live Activity Feed
                   </h3>
                   <div className="space-y-3">
                      {activityFeed.length > 0 ? activityFeed.map(act => (
                        <div key={act.id} className="flex justify-between items-center text-sm border-b border-white/5 pb-2 last:border-0">
                           <span className="text-[var(--text-primary)]">{act.message}</span>
                           <span className="text-xs opacity-40">{act.time}</span>
                        </div>
                      )) : (
                        <p className="text-xs text-[var(--text-secondary)] italic text-center py-2">No recent activity.</p>
                      )}
                   </div>
                </div>

                {/* BROADCAST SECTION */}
                <div className="card p-6 border-yellow-500/10">
                   <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-4 flex items-center gap-2">
                     <Megaphone size={16} className="text-yellow-500"/> Department Broadcast
                   </h3>
                   <div className="flex gap-2">
                      <input 
                        placeholder="Send message to all waiting students..." 
                        value={broadcastMsg}
                        onChange={(e) => setBroadcastMsg(e.target.value)}
                        className="input-field py-2 text-sm flex-1"
                      />
                      <button 
                        onClick={handleSendBroadcast} 
                        disabled={!broadcastMsg}
                        className="btn-primary py-2 px-6 text-sm bg-yellow-600 hover:bg-yellow-700"
                      >
                        Broadcast
                      </button>
                   </div>
                </div>

                {/* EMERGENCY ALERT SECTION */}
                {pendingEmergencies > 0 && (
                   <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
                      <h3 className="text-red-500 font-bold mb-4 flex items-center gap-2">
                        🚨 {pendingEmergencies} Emergency Request{pendingEmergencies > 1 ? "s" : ""}
                      </h3>
                      <div className="space-y-4">
                         {emergencies.map((e) => (
                           <div key={e._id} className="bg-white/5 p-4 rounded-xl flex flex-col md:flex-row justify-between gap-4">
                              <div>
                                 <div className="flex items-center gap-2">
                                    <p className="font-bold text-red-200">{e.student?.name} ({e.student?.email})</p>
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${e.status === 'approved' ? 'bg-green-500 text-white' : 'bg-yellow-500 text-black'}`}>
                                      {e.status}
                                    </span>
                                 </div>
                                 <p className="text-sm text-red-300 mt-1">Reason: {e.reason}</p>
                                 {e.proof && <a href={`${import.meta.env.VITE_API_URL.replace("/api", "")}${e.proof}`} target="_blank" className="text-xs underline text-red-400 mt-2 block">View Proof</a>}
                              </div>
                              <div className="flex gap-2 items-center">
                                {e.status === "pending" ? (
                                   <>
                                      <button onClick={() => handleApproveEmergency(e._id)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition-colors">Approve</button>
                                      <button onClick={() => handleRejectEmergency(e._id)} className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-bold hover:bg-slate-600 transition-colors">Reject</button>
                                   </>
                                ) : e.status === "approved" && !emergencyActive && (
                                   <button onClick={() => handleStartEmergency(e._id)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold animate-pulse shadow-lg shadow-red-600/20">
                                      Trigger Priority Service
                                    </button>
                                )}
                              </div>
                           </div>
                         ))}
                      </div>
                   </div>
                )}
                
                {/* EMERGENCY CONTROLS */}
                <div className="flex justify-center pt-8 border-t border-[var(--glass-border)]">
                   {!emergencyActive ? (
                      <button onClick={handleStartEmergency} className="text-red-500 hover:bg-red-500/10 px-6 py-2 rounded-lg text-sm font-bold transition-colors">
                        ⚠ Trigger Emergency Mode
                      </button>
                   ) : (
                      <button onClick={handleEndEmergency} className="btn-secondary text-green-500 border-green-500/20 hover:bg-green-500/10">
                        Resolve Emergency
                      </button>
                   )}
                </div>

           </div>
        )}


        {/* TAB 2: SETTINGS */}
        {activeTab === "settings" && (
           <div className="animate-fade-in max-w-2xl mx-auto space-y-8">
              
              <div className="card p-8 flex items-center justify-between border-blue-500/20">
                 <div>
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">Pause Queue (Break)</h3>
                    <p className={`text-sm mt-1 font-medium ${isPaused ? "text-yellow-500" : "text-[var(--text-secondary)]"}`}>
                       {isPaused ? "Queue is currently paused" : "Queue is active"}
                    </p>
                 </div>
                 <button onClick={handleTogglePause} className={`px-6 py-3 rounded-xl font-bold transition-all ${isPaused ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-white/5 text-[var(--text-primary)] border border-[var(--glass-border)] hover:bg-white/10"}`}>
                    {isPaused ? "Resume Queue" : "Pause for Break"}
                 </button>
              </div>

              <div className="card p-8">
                 <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">Extend Queue Limit</h3>
                 <p className="text-sm text-[var(--text-secondary)] mb-6">Increase the maximum number of tickets allowed for today.</p>
                 <div className="flex gap-4">
                    <input 
                      type="number" 
                      placeholder="Amount to add" 
                      value={increaseBy} 
                      onChange={(e) => setIncreaseBy(e.target.value)}
                      className="input-field" 
                    />
                    <button onClick={handleIncreaseLimit} className="btn-primary">Add</button>
                 </div>
              </div>
           </div>
        )}


        {/* TAB 3: QR GENERATOR */}
        {activeTab === "qr" && (
           <div className="animate-fade-in max-w-md mx-auto text-center">
              <div className="card p-12">
                 <h3 className="text-xl font-bold text-[var(--text-primary)] mb-8">Department QR Code</h3>
                 
                 {qrData ? (
                   <div className="space-y-6">
                      <div className="bg-white p-4 rounded-2xl inline-block">
                         <img src={qrData.qrCode} alt="QR Code" className="w-64 h-64 object-contain" />
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] break-all font-mono bg-[var(--bg-secondary)] p-3 rounded-lg select-all">
                        {qrData.joinUrl}
                      </p>
                   </div>
                 ) : (
                    <div className="py-12">
                       <p className="text-[var(--text-secondary)] mb-6">Generate a QR code for students to join quickly.</p>
                       <button 
                         onClick={handleGenerateQR}
                         disabled={qrLoading} 
                         className="btn-primary w-full"
                        >
                         {qrLoading ? "Generating..." : "Generate QR Code"}
                       </button>
                    </div>
                 )}
              </div>
           </div>
        )}


        {/* TOAST MESSAGE */}
        {message && (
           <div className="fixed bottom-6 right-6 z-50 animate-fade-in bg-slate-900 text-white px-6 py-3 rounded-lg shadow-xl border border-white/10">
              {message}
           </div>
        )}

      </main>
    </div>
  );
}
