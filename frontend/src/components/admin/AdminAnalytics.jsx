import React, { useEffect, useState } from 'react';
import { getAnalytics } from '../../services/admin';
import { socket } from '../../services/socket';
import { BarChart, Clock, TrendingUp, Users, CheckCircle, AlertTriangle, Star } from 'lucide-react';

const AdminAnalytics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();

    // 🛡️ Join Admin Room
    socket.emit("join_admin");

    // 📡 Socket listener for realtime updates
    socket.on("update_analytics", fetchData);

    return () => {
        socket.off("update_analytics", fetchData);
    };
  }, []);

  const fetchData = async () => {
    try {
      const analytics = await getAnalytics();
      setData(analytics);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-10 text-center animate-pulse text-[var(--text-secondary)]">Loading analytics...</div>;
  if (!data) return <div className="p-10 text-center text-red-400">Failed to load analytics.</div>;

  const stats = data.overallStats || { total: 0, waiting: 0, serving: 0, completed: 0, noShow: 0 };

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      {/* REALTIME COUNTERS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card p-5 text-center bg-blue-500/5 border-blue-500/20">
          <p className="text-[10px] font-bold uppercase text-blue-500 mb-1 tracking-widest">Today Total</p>
          <h4 className="text-3xl font-black text-[var(--text-primary)]">{stats.total}</h4>
        </div>
        <div className="card p-5 text-center bg-yellow-500/5 border-yellow-500/20">
          <p className="text-[10px] font-bold uppercase text-yellow-500 mb-1 tracking-widest">Waiting</p>
          <h4 className="text-3xl font-black text-[var(--text-primary)]">{stats.waiting}</h4>
        </div>
        <div className="card p-5 text-center bg-purple-500/5 border-purple-500/20">
          <p className="text-[10px] font-bold uppercase text-purple-500 mb-1 tracking-widest">Serving</p>
          <h4 className="text-3xl font-black text-[var(--text-primary)]">{stats.serving}</h4>
        </div>
        <div className="card p-5 text-center bg-green-500/5 border-green-500/20">
          <p className="text-[10px] font-bold uppercase text-green-500 mb-1 tracking-widest">Completed</p>
          <h4 className="text-3xl font-black text-[var(--text-primary)]">{stats.completed}</h4>
        </div>
        <div className="card p-5 text-center bg-red-500/5 border-red-500/20">
          <p className="text-[10px] font-bold uppercase text-red-500 mb-1 tracking-widest">No-Shows</p>
          <h4 className="text-3xl font-black text-[var(--text-primary)]">{stats.noShow}</h4>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6 flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500"><TrendingUp size={24}/></div>
          <div>
            <p className="text-sm text-[var(--text-secondary)]">Total All-Time</p>
            <h4 className="text-2xl font-bold text-[var(--text-primary)]">
              {data.deptVolume?.reduce((acc, curr) => acc + curr.count, 0) || 0}
            </h4>
          </div>
        </div>
        
        <div className="card p-6 flex items-center gap-4">
          <div className="p-3 bg-green-500/10 rounded-xl text-green-500"><Clock size={24}/></div>
          <div>
            <p className="text-sm text-[var(--text-secondary)]">Avg. Resolution</p>
            <h4 className="text-2xl font-bold text-[var(--text-primary)]">
              {data.resolutionTimes?.length > 0 
                ? (data.resolutionTimes.reduce((acc, curr) => acc + curr.avgTime, 0) / data.resolutionTimes.length).toFixed(1)
                : 0}m
            </h4>
          </div>
        </div>

        <div className="card p-6 flex items-center gap-4">
          <div className="p-3 bg-purple-500/10 rounded-xl text-purple-500"><Users size={24}/></div>
          <div>
            <p className="text-sm text-[var(--text-secondary)]">Active Depts</p>
            <h4 className="text-2xl font-bold text-[var(--text-primary)]">{data.deptVolume?.length || 0}</h4>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Peak Hours Chart */}
        <div className="card p-6">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
            <BarChart size={20} className="text-[var(--accent-primary)]"/> Hourly Traffic
          </h3>
          <div className="h-48 flex items-end gap-1.5 pt-4">
            {Array.from({ length: 24 }).map((_, hour) => {
              const hourData = data.peakHours?.find(h => h._id === hour);
              const height = hourData ? (hourData.count / Math.max(...(data.peakHours?.map(h => h.count) || [1]))) * 100 : 0;
              return (
                <div key={hour} className="flex-1 flex flex-col items-center group relative">
                  <div 
                    style={{ height: `${height}%` }}
                    className="w-full bg-[var(--accent-primary)]/40 rounded-t-sm group-hover:bg-[var(--accent-primary)] transition-all cursor-pointer"
                  >
                     {hourData && (
                       <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] py-1 px-1.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                         {hourData.count} tickets
                       </div>
                     )}
                  </div>
                  <span className="text-[8px] mt-2 opacity-50 font-mono">{hour}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Staff Performance */}
        <div className="card p-6">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
            <CheckCircle size={20} className="text-green-500"/> Staff Performance
          </h3>
          
          {/* Top 3 High Performers */}
          <div className="grid grid-cols-3 gap-3 mb-8">
             {data.staffPerformance?.slice(0, 3).map((staff, i) => (
               <div key={i} className="text-center p-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--accent-primary)]/20 relative">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--accent-primary)] text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                    #{i+1}
                  </div>
                  <div className="w-10 h-10 rounded-full bg-[var(--accent-primary)]/10 flex items-center justify-center mx-auto mb-2 text-[var(--accent-primary)] font-black">
                    {staff._id.charAt(0)}
                  </div>
                  <p className="text-[10px] font-bold truncate text-[var(--text-primary)]">{staff._id}</p>
                  <p className="text-[12px] font-black text-[var(--accent-primary)]">{staff.ticketsServed} Served</p>
                  <p className="text-[9px] text-[var(--text-secondary)]">Avg: {staff.avgResolutionTime?.toFixed(1) || 0}m</p>
               </div>
             ))}
          </div>

          <div className="space-y-4">
            {data.staffPerformance?.length > 3 ? data.staffPerformance.slice(3).map((staff, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-[var(--glass-border)]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[var(--accent-primary)]/20 flex items-center justify-center font-bold text-[var(--accent-primary)] text-xs">
                    {staff._id.charAt(0)}
                  </div>
                  <span className="text-sm font-medium text-[var(--text-primary)]">{staff._id}</span>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-[var(--accent-primary)]">{staff.ticketsServed} Served</p>
                  <p className="text-[10px] text-[var(--text-secondary)]">Avg: {staff.avgResolutionTime?.toFixed(1) || 0}m</p>
                </div>
              </div>
            )) : (
              <div className="text-center py-10 text-[var(--text-secondary)] text-sm italic">No staff data yet.</div>
            )}
          </div>
        </div>

        {/* Efficiency per Department */}
        <div className="card p-6">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
             <TrendingUp size={20} className="text-[var(--accent-secondary)]"/> Efficiency per Department
          </h3>
          <div className="space-y-4">
            {data.resolutionTimes?.map((dept, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-[var(--text-primary)]">{dept._id}</span>
                  <div className="text-right">
                    <span className="text-[var(--text-secondary)] block">{dept.avgWait?.toFixed(1) || 0}m wait</span>
                    <span className="text-[var(--accent-secondary)] text-[10px] block">{dept.avgTime.toFixed(1)}m total</span>
                  </div>
                </div>
                <div className="w-full bg-[var(--glass-border)] h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-[var(--accent-secondary)] h-full transition-all duration-1000"
                    style={{ width: `${Math.min((dept.avgTime / 20) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {(!data.resolutionTimes || data.resolutionTimes.length === 0) && (
              <div className="text-center py-10 text-[var(--text-secondary)] text-sm italic">No data yet.</div>
            )}
          </div>
        </div>

        {/* Feedback Trends */}
        <div className="card p-6">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
            <Star size={20} className="text-yellow-500"/> Rating Distribution
          </h3>
          <div className="space-y-4">
            {[5, 4, 3, 2, 1].map((rating) => {
              const ratingData = data.feedbackRatings?.find(r => r._id === rating);
              const totalFeedback = data.feedbackRatings?.reduce((acc, curr) => acc + curr.count, 0) || 1;
              const percentage = ratingData ? (ratingData.count / totalFeedback) * 100 : 0;
              return (
                <div key={rating} className="flex items-center gap-4">
                  <div className="flex items-center gap-1 w-10">
                    <span className="text-sm font-bold text-[var(--text-primary)]">{rating}</span>
                    <Star size={12} fill="currentColor" className="text-yellow-500"/>
                  </div>
                  <div className="flex-1 bg-[var(--glass-border)] h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-yellow-500 h-full transition-all duration-1000"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-[var(--text-secondary)] w-8 text-right">
                    {ratingData?.count || 0}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAnalytics;
