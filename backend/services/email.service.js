import nodemailer from "nodemailer";
import dotenv from "dotenv";
import User from "../models/User.js";
dotenv.config();

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // Use TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendTicketEmail = async (email, ticketData) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log("⚠️ Email credentials missing. Skipping email.");
      return;
    }

    // 🛡️ ONLY SEND TO STUDENTS
    const user = await User.findOne({ email });
    if (!user || user.role !== "student") {
      console.log(`ℹ️ Skipping email to ${email} (User is not a student)`);
      return;
    }

    const mailOptions = {
      from: `"Campus Queue" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Your Ticket #${ticketData.ticketNumber} is ${ticketData.status}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="color: #00d4aa;">Campus Queue Status Update</h2>
          <p>Hello,</p>
          <p>Your ticket for <b>${ticketData.departmentName}</b> has been updated.</p>
          <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0;"><b>Ticket Number:</b> #${ticketData.ticketNumber}</p>
            <p style="margin: 0;"><b>Current Status:</b> <span style="text-transform: capitalize; color: #007bff;">${ticketData.status}</span></p>
          </div>
          <p>Please proceed to the department if your status is "calling".</p>
          <hr />
          <p style="font-size: 12px; color: #777;">This is an automated message from Campus Queue Management System.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent to ${email} for ticket #${ticketData.ticketNumber}`);
  } catch (error) {
    console.error("❌ Email sending failed:", error.message);
  }
};
