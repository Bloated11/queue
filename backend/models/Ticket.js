import mongoose from "mongoose";

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
    },

    queue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Queue",
      required: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // 🔑 GUEST SUPPORT (THIS WAS MISSING)
    isGuest: {
      type: Boolean,
      default: false,
    },

    guestToken: {
      type: String,
      index: true,
      default: null,
    },

    guestInfo: {
      name: {
        type: String,
        default: "",
        required:false,
      },
      phone: {
        type: String,
        default: "",
      },
    },

    source: {
      type: String,
      enum: ["app", "qr", "staff"],
      required: true,
    },

    status: {
      type: String,
      enum: ["waiting", "serving", "completed", "no-show", "hold"],
      default: "waiting",
    },

    holdAt: {
      type: Date,
      default: null,
    },

    noShowAt: {
      type: Date,
      default: null,
    },

    servedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    calledAt: {
      type: Date,
      default: null,
    },

    servedAt: {
      type: Date,
      default: null,
    },

    notes: [
      {
        content: String,
        author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    transferHistory: [
      {
        fromDept: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
        toDept: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
        transferredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        transferredAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

const Ticket = mongoose.model("Ticket", ticketSchema);
export default Ticket;
