import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { 
  bookAppointment, 
  getMyAppointments, 
  cancelAppointment, 
  getAvailableSlots 
} from "../controllers/appointmentController.js";

const router = express.Router();

router.use(protect);

router.post("/book", bookAppointment);
router.get("/my", getMyAppointments);
router.put("/cancel/:id", cancelAppointment);
router.get("/available", getAvailableSlots);

export default router;
