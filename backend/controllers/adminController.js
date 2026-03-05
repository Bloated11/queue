import { io } from "../server.js";
import Department from "../models/Department.js";
import Queue from "../models/Queue.js";
import User from "../models/User.js";
import Feedback from "../models/Feedback.js";
import Ticket from "../models/Ticket.js";


/* ======================================================
   CREATE DEPARTMENT (ADMIN)
====================================================== */
export const createDepartment = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admins only" });
    }

    const { name, description } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Department name is required" });
    }

    const existingDept = await Department.findOne({
      name: name.trim(),
    });

    if (existingDept) {
      return res.status(400).json({ message: "Department already exists" });
    }

    const department = await Department.create({
      name: name.trim(),
      description,
      createdBy: req.user.id,
    });

    // Auto-create queue for department
    await Queue.create({
      department: department._id,
    });

    res.status(201).json({
      message: "Department and queue created successfully",
      department,
    });
  } catch (error) {
    console.error("Create department error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   ASSIGN STAFF TO DEPARTMENT (ADMIN)
====================================================== */
export const assignStaffToDepartment = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admins only" });
    }

    const { staffId, departmentId } = req.body;

    if (!staffId || !departmentId) {
      return res
        .status(400)
        .json({ message: "Staff ID and Department ID are required" });
    }

    // Validate staff
    const staff = await User.findById(staffId);
    if (!staff || staff.role !== "staff") {
      return res.status(400).json({ message: "Invalid staff user" });
    }

    // Validate department
    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    // 🔴 Remove staff from any previous department
    await Department.updateMany(
      { staff: staffId },
      { $pull: { staff: staffId } }
    );

    // 🟢 Add staff to selected department
    await Department.findByIdAndUpdate(departmentId, {
      $addToSet: { staff: staffId },
    });

    // 🟢 Update staff document
    staff.department = departmentId;
    await staff.save();

    res.json({
      message: "Staff assigned to department successfully",
      staffId: staff._id,
      departmentId,
    });
  } catch (error) {
    console.error("Assign staff error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   GET ALL DEPARTMENTS (ADMIN)
====================================================== */
export const getDepartments = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admins only" });
    }

    const departments = await Department.find()
      .populate("staff", "fullName email")
      .sort({ createdAt: -1 });

    res.json(departments);
  } catch (error) {
    console.error("Get departments error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   GET ALL STAFF USERS (ADMIN)
====================================================== */
export const getStaffUsers = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admins only" });
    }

    const staff = await User.find({ role: "staff" })
      .select("_id fullName email department")
      .populate("department", "name");

    res.json(staff);
  } catch (error) {
    console.error("Get staff users error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   GET SMART ANALYTICS (ADMIN)
====================================================== */
export const getAnalytics = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admins only" });
    }

    // 1. Peak Hours (Hourly ticket distribution)
    const peakHours = await Ticket.aggregate([
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

    // 2. Average Resolution Time per Department
    const resolutionTimes = await Ticket.aggregate([
      {
        $match: {
          status: "completed",
          servedAt: { $ne: null }
        }
      },
      {
        $lookup: {
          from: "queues",
          localField: "queue",
          foreignField: "_id",
          as: "queueInfo"
        }
      },
      { $unwind: "$queueInfo" },
      {
        $lookup: {
          from: "departments",
          localField: "queueInfo.department",
          foreignField: "_id",
          as: "deptInfo"
        }
      },
      { $unwind: "$deptInfo" },
      {
        $project: {
          departmentName: "$deptInfo.name",
          duration: {
            $divide: [
              { $subtract: ["$servedAt", "$createdAt"] },
              60000 // Convert to minutes
            ]
          },
          waitTime: {
            $divide: [
              { $subtract: ["$calledAt", "$createdAt"] },
              60000
            ]
          }
        }
      },
      {
        $group: {
          _id: "$departmentName",
          avgTime: { $avg: "$duration" },
          avgWait: { $avg: "$waitTime" },
          totalTickets: { $sum: 1 }
        }
      }
    ]);

    // 3. Department-wise Ticket Volume
    const deptVolume = await Ticket.aggregate([
      {
        $lookup: {
          from: "queues",
          localField: "queue",
          foreignField: "_id",
          as: "queueInfo"
        }
      },
      { $unwind: "$queueInfo" },
      {
        $lookup: {
          from: "departments",
          localField: "queueInfo.department",
          foreignField: "_id",
          as: "deptInfo"
        }
      },
      { $unwind: "$deptInfo" },
      {
        $group: {
          _id: "$deptInfo.name",
          count: { $sum: 1 }
        }
      }
    ]);

    // 4. Overall Stats (Realtime Counters)
    const today = new Date();
    today.setHours(0,0,0,0);

    const overallStats = await Ticket.aggregate([
      { $match: { createdAt: { $gte: today } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          waiting: { $sum: { $cond: [{ $eq: ["$status", "waiting"] }, 1, 0] } },
          serving: { $sum: { $cond: [{ $eq: ["$status", "serving"] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          noShow: { $sum: { $cond: [{ $eq: ["$status", "no-show"] }, 1, 0] } }
        }
      }
    ]);

    // 5. Staff Performance Analysis (with Resolution Time)
    const staffPerformance = await Ticket.aggregate([
      { $match: { status: "completed", servedBy: { $ne: null }, servedAt: { $ne: null }, calledAt: { $ne: null } } },
      {
        $lookup: {
          from: "users",
          localField: "servedBy",
          foreignField: "_id",
          as: "staffInfo"
        }
      },
      { $unwind: "$staffInfo" },
      {
        $group: {
          _id: "$staffInfo.fullName",
          ticketsServed: { $sum: 1 },
          avgResolutionTime: {
            $avg: {
              $divide: [
                { $subtract: ["$servedAt", "$calledAt"] },
                60000
              ]
            }
          }
        }
      },
      { $sort: { ticketsServed: -1 } }
    ]);

    // 6. Feedback Ratings Analysis
    const feedbackRatings = await Feedback.aggregate([
      {
        $group: {
          _id: "$rating",
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      peakHours,
      resolutionTimes,
      deptVolume,
      overallStats: overallStats[0] || { total: 0, waiting: 0, serving: 0, completed: 0, noShow: 0 },
      staffPerformance,
      feedbackRatings
    });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   GET ALL STUDENT FEEDBACK (ADMIN)
====================================================== */
export const getAllFeedback = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admins only" });
    }

    const feedback = await Feedback.find()
      .populate({
        path: "ticket",
        select: "ticketNumber createdAt",
      })
      .populate({
        path: "department",
        select: "name",
      })
      .sort({ createdAt: -1 });

    const formatted = feedback.map((f) => ({
      _id: f._id,
      ticketNumber: f.ticket?.ticketNumber || "N/A",
      department: f.department?.name || "N/A",
      options: f.options,
      comment: f.comment,
      submittedAt: f.createdAt,
    }));

    res.json(formatted);
  } catch (error) {
    console.error("Get feedback error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   UPDATE DEPARTMENT (ADMIN)
====================================================== */
export const updateDepartment = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admins only" });
    }

    const { id } = req.params;
    const { name, description, isActive } = req.body;

    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    if (name) department.name = name.trim();
    if (description !== undefined) department.description = description;
    if (isActive !== undefined) department.isActive = isActive;

    await department.save();

    res.json({
      message: "Department updated successfully",
      department,
    });
  } catch (error) {
    console.error("Update department error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   DELETE DEPARTMENT (ADMIN)
====================================================== */
export const deleteDepartment = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admins only" });
    }

    const { id } = req.params;

    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    // 1. Delete associated queue
    await Queue.findOneAndDelete({ department: id });

    // 2. Clear department from users assigned to it
    await User.updateMany({ department: id }, { $set: { department: null } });

    // 3. Delete department
    await Department.findByIdAndDelete(id);

    res.json({ message: "Department and associated data deleted successfully" });
  } catch (error) {
    console.error("Delete department error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
