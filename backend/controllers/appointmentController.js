import Appointment from "../models/Appointment.js";
import Department from "../models/Department.js";
import mongoose from "mongoose";

// Define standard operating hours/slots (10:00 AM - 4:00 PM, 30 min intervals)
const TIME_SLOTS = [
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", 
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30"
];

const MAX_BOOKINGS_PER_SLOT = 3; // Number of people who can book the same slot

export const bookAppointment = async (req, res) => {
  try {
    const { departmentId, appointmentDate, timeSlot, purpose } = req.body;
    const userId = req.user.id;

    // Check if slot is valid
    if (!TIME_SLOTS.includes(timeSlot)) {
      return res.status(400).json({ message: "Invalid time slot" });
    }

    // Check if slot is already full for that department/date
    const bookingCount = await Appointment.countDocuments({
      department: departmentId,
      appointmentDate: new Date(appointmentDate),
      timeSlot,
      status: "booked"
    });

    if (bookingCount >= MAX_BOOKINGS_PER_SLOT) {
      return res.status(400).json({ message: "This time slot is full. Please choose another." });
    }

    const appointment = await Appointment.create({
      user: userId,
      department: departmentId,
      appointmentDate: new Date(appointmentDate),
      timeSlot,
      purpose,
    });

    res.status(201).json({ message: "Appointment booked successfully", appointment });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "You already have an appointment with this department on this day." });
    }
    res.status(500).json({ message: error.message });
  }
};

export const getMyAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({ user: req.user.id })
      .populate("department", "name")
      .sort({ appointmentDate: 1, timeSlot: 1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await Appointment.findOne({ _id: id, user: req.user.id });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    appointment.status = "cancelled";
    await appointment.save();

    res.json({ message: "Appointment cancelled" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAvailableSlots = async (req, res) => {
  try {
    const { departmentId, date } = req.query;
    
    // Count existing bookings per slot
    const bookings = await Appointment.aggregate([
      { $match: { 
          department: new mongoose.Types.ObjectId(departmentId), 
          appointmentDate: new Date(date),
          status: "booked"
        } 
      },
      { $group: { _id: "$timeSlot", count: { $sum: 1 } } }
    ]);

    const availability = TIME_SLOTS.map(slot => {
      const b = bookings.find(item => item._id === slot);
      return {
        time: slot,
        available: (b ? b.count : 0) < MAX_BOOKINGS_PER_SLOT,
        remaining: MAX_BOOKINGS_PER_SLOT - (b ? b.count : 0)
      };
    });

    res.json(availability);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
