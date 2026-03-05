import Queue from "../models/Queue.js";
import Ticket from "../models/Ticket.js";
import Department from "../models/Department.js";
import { io } from "../server.js";
import Feedback from "../models/Feedback.js";
import { sendTicketEmail } from "../services/email.service.js";
import User from "../models/User.js";
import mongoose from "mongoose";




// ==============================
// STUDENT JOIN QUEUE
// ==============================
export const joinQueue = async (req, res) => {
  try {
    // 1️⃣ Only students
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Students only" });
    }

    const { departmentId } = req.body;

    if (!departmentId) {
      return res.status(400).json({ message: "Department ID is required" });
    }

    // 2️⃣ Validate department
    const department = await Department.findById(departmentId);
    if (!department || !department.isActive) {
      return res.status(404).json({ message: "Department not available" });
    }

    // 3️⃣ Find queue
    const queue = await Queue.findOne({ department: departmentId });
    if (!queue) {
      return res.status(400).json({ message: "Queue not found" });
    }

    // 🚫 Queue closed
    if (!queue.isOpen) {
      return res.status(400).json({ message: "Queue is currently closed" });
    }

    // 🚫 Same department duplicate check
    const existingTicket = await Ticket.findOne({
      user: req.user.id,
      queue: queue._id,
      status: { $in: ["waiting", "serving"] },
    });

    if (existingTicket) {
      return res.status(400).json({
        message: "You are already in this department queue",
      });
    }

    // 🚫 Queue limit check (SAFE)
    if (queue.maxTickets != null) {
      const activeCount = await Ticket.countDocuments({
        queue: queue._id,
        status: { $in: ["waiting", "serving"] },
      });

      if (activeCount >= queue.maxTickets) {
        return res.status(400).json({
          message: "Queue is full. Please try later.",
        });
      }
    }

    // 4️⃣ Count waiting tickets
    const waitingCount = await Ticket.countDocuments({
      queue: queue._id,
      status: "waiting",
    });

    // 5️⃣ Generate ticket number
    const ticketNumber = `A${String(waitingCount + 1).padStart(3, "0")}`;

    // 6️⃣ Create ticket
    const ticket = await Ticket.create({
      ticketNumber,
      queue: queue._id,
      user: req.user.id,
      source: "app",
      status: "waiting",
      isGuest: false,
    });

    // 🔔 Notify students in this department
    io.to(`department_${departmentId}`).emit("ticket_joined", {
      ticketNumber,
      position: waitingCount + 1,
    });

    // 🛡️ Notify Admins (Analytics Refresh)
    io.to("admin_room").emit("update_analytics");

    // 7️⃣ Calculate ETA
    const eta = waitingCount * queue.averageServiceTime;

    // 📧 SEND EMAIL NOTIFICATION
    const user = await User.findById(req.user.id);
    if (user && user.email) {
      await sendTicketEmail(user.email, {
        ticketNumber,
        departmentName: department.name,
        status: "waiting",
      });
    }

    // 🆕 AUTO-CLOSE QUEUE IF LIMIT REACHED (IMPORTANT FIX)
    if (queue.maxTickets != null) {
      const activeCountAfterJoin = await Ticket.countDocuments({
        queue: queue._id,
        status: { $in: ["waiting", "serving"] },
      });

      if (activeCountAfterJoin >= queue.maxTickets) {
        queue.isOpen = false;
        await queue.save();

        io.to(`department_${departmentId}`).emit("queue_status_changed", {
          isOpen: false,
        });
      }
    }

    // ✅ SEND RESPONSE LAST
    res.status(201).json({
      message: "Joined queue successfully",
      ticketNumber,
      position: waitingCount + 1,
      estimatedWaitTime: `${eta} minutes`,
      ticketId: ticket._id,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==============================
// GET ACTIVE DEPARTMENTS (STUDENT)
// ==============================
export const getActiveDepartments = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Students only" });
    }

    const departments = await Department.find({ isActive: true })
      .select("_id name description");

    res.json(departments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==============================
// GET ACTIVE TICKET (STUDENT)
// ==============================
export const getMyActiveTicket = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Students only" });
    }

    const ticket = await Ticket.findOne({
      user: req.user.id,
      status: { $in: ["waiting", "serving"] },
    }).populate({
      path: "queue",
      populate: { path: "department", select: "name" },
    });

    if (!ticket) {
      return res.json(null);
    }

    res.json({
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      departmentId: ticket.queue.department._id,
      departmentName: ticket.queue.department.name,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==============================
// STUDENT CANCEL QUEUE
// ==============================
export const cancelQueue = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Students only" });
    }

    const { departmentId } = req.body;

    if (!departmentId) {
      return res.status(400).json({ message: "Department ID is required" });
    }

    const queue = await Queue.findOne({ department: departmentId });
    if (!queue) {
      return res.status(400).json({ message: "Queue not found" });
    }

    const ticket = await Ticket.findOne({
      user: req.user.id,
      queue: queue._id,
      status: { $in: ["waiting", "serving"] },
    });

    if (!ticket) {
      return res.status(400).json({
        message: "You are not in this queue",
      });
    }

    ticket.status = "no-show";
    ticket.noShowAt = new Date();
    ticket.servedAt = new Date();
    await ticket.save();

    if (
      queue.currentTicket &&
      queue.currentTicket.toString() === ticket._id.toString()
    ) {
      queue.currentTicket = null;
      await queue.save();
    }

    // 🔔 Notify department
    io.to(`department_${departmentId}`).emit("ticket_cancelled", {
      ticketNumber: ticket.ticketNumber,
    });

    // 🛡️ ANALYTICS
    io.to("admin_room").emit("update_analytics");

    // 📧 EMAIL NOTIFICATION ON CANCELLATION
    const user = await User.findById(req.user.id);
    const department = await Department.findById(departmentId);
    if (user && user.email) {
      await sendTicketEmail(user.email, {
        ticketNumber: ticket.ticketNumber,
        departmentName: department ? department.name : "Department",
        status: "cancelled",
      });
    }

    res.json({
      message: "You have left the queue successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==============================
// STUDENT: TICKET HISTORY
// ==============================
export const getMyTicketHistory = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Students only" });
    }

    const tickets = await Ticket.find({
      user: req.user.id,
      status: { $in: ["completed", "no-show"] },
    })
      .populate({
        path: "queue",
        populate: {
          path: "department",
          select: "name",
        },
      })
      .sort({ createdAt: -1 });

    // 🔍 Get all feedback for these tickets
    const feedbacks = await Feedback.find({
      student: req.user.id,
      ticket: { $in: tickets.map((t) => t._id) },
    }).select("ticket");

    const feedbackTicketIds = new Set(
      feedbacks.map((f) => f.ticket.toString())
    );

    const history = tickets.map((t) => ({
      _id: t._id,
      ticketNumber: t.ticketNumber,
      department: t.queue?.department?.name || "N/A",
      status: t.status,
      joinedAt: t.createdAt,
      servedAt: t.servedAt || null,

      // ✅ THIS IS THE KEY FIX
      feedbackSubmitted: feedbackTicketIds.has(t._id.toString()),
    }));

    res.json(history);
  } catch (error) {
    console.error("Ticket history error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ==============================
// STUDENT: SUBMIT FEEDBACK
// ==============================
export const submitFeedback = async (req, res) => {
  try {
    // 🔒 Role check
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Students only" });
    }

    const { ticketId, options, comment } = req.body;

    // ✅ Basic validation
    if (!ticketId || !options || options.length === 0) {
      return res.status(400).json({
        message: "At least one feedback option is required",
      });
    }

    // 🔍 Find completed ticket of this student
    const ticket = await Ticket.findOne({
      _id: ticketId,
      user: req.user.id,
      status: "completed",
    }).populate({
      path: "queue",
      populate: {
        path: "department",
      },
    });

    if (!ticket) {
      return res.status(404).json({
        message: "Feedback allowed only for completed tickets",
      });
    }

    // 🚫 Prevent duplicate feedback
    const existingFeedback = await Feedback.findOne({
      ticket: ticketId,
    });

    if (existingFeedback) {
      return res.status(409).json({
        message: "Feedback already submitted for this ticket",
      });
    }

    // 💾 Create feedback (MATCHES YOUR MODEL)
    const feedback = await Feedback.create({
      ticket: ticket._id,
      student: req.user.id,
      department: ticket.queue.department._id,
      options,
      comment: comment || "",
    });

    // ✅ IMPORTANT: SEND JSON RESPONSE
    return res.status(201).json({
      message: "Feedback submitted successfully",
      feedbackId: feedback._id,
    });
  } catch (error) {
    console.error("❌ Feedback submit error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
// ==============================
// STUDENT: TOGGLE HOLD STATUS (STEP AWAY)
// ==============================
export const toggleHoldStatus = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Students only" });
    }

    const ticket = await Ticket.findOne({
      user: req.user.id,
      status: { $in: ["waiting", "hold"] },
    }).populate({
      path: "queue",
      select: "department",
    });

    if (!ticket) {
      return res.status(404).json({ message: "No active waiting ticket found" });
    }

    const isHolding = ticket.status === "hold";
    ticket.status = isHolding ? "waiting" : "hold";
    ticket.holdAt = isHolding ? null : new Date();
    await ticket.save();

    const departmentId = ticket.queue.department.toString();

    // Notify staff dashboard
    io.to(`department_${departmentId}`).emit("ticket_hold_toggled", {
      ticketId: ticket._id,
      status: ticket.status,
      ticketNumber: ticket.ticketNumber,
    });

    res.json({
      message: `Status updated to ${ticket.status}`,
      status: ticket.status,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==============================
// STUDENT: GET DEPARTMENT TRAFFIC (FORECASTING)
// ==============================
export const getDepartmentTraffic = async (req, res) => {
  try {
    const { departmentId } = req.params;

    const traffic = await Ticket.aggregate([
      {
        $lookup: {
          from: "queues",
          localField: "queue",
          foreignField: "_id",
          as: "queueInfo"
        }
      },
      { $unwind: "$queueInfo" },
      { $match: { "queueInfo.department": new mongoose.Types.ObjectId(departmentId) } },
      {
        $project: {
          hour: { $hour: "$createdAt" }
        }
      },
      {
        $group: {
          _id: "$hour",
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json(traffic);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==============================
// STUDENT: RESTORE NO-SHOW TICKET (GRACE PERIOD)
// ==============================
export const restoreNoShowTicket = async (req, res) => {
  try {
    const { ticketId } = req.body;
    
    const ticket = await Ticket.findOne({
      _id: ticketId,
      user: req.user.id,
      status: "no-show"
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found or not eligible" });
    }

    // Check 5 min grace period
    const diff = (new Date() - new Date(ticket.noShowAt)) / 60000;
    if (diff > 5) {
      return res.status(400).json({ message: "Grace period expired" });
    }

    // Restore to waiting at the FRONT (by setting createdAt to now, but it's already old)
    // Actually, setting it to 'waiting' keeps its original place in the sequence if we sort by createdAt.
    // If we want it at the front, we can't easily do it by createdAt without changing it.
    // But since it's already old, it will be at the front anyway if we call next.
    ticket.status = "waiting";
    ticket.noShowAt = null;
    ticket.servedAt = null;
    await ticket.save();

    res.json({ message: "Ticket restored! Please be ready.", status: "waiting" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

