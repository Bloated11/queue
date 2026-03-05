import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Department",
    required: true,
  },
  appointmentDate: {
    type: Date,
    required: true,
  },
  timeSlot: {
    type: String, // e.g., "14:00"
    required: true,
  },
  status: {
    type: String,
    enum: ["booked", "checked-in", "cancelled", "missed"],
    default: "booked",
  },
  purpose: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Ensure a user doesn't book multiple slots for the same department on the same day
appointmentSchema.index({ user: 1, department: 1, appointmentDate: 1 }, { unique: true });

export default mongoose.model("Appointment", appointmentSchema);
