import api from "./api";

export const createDepartment = async (data) => {
  const res = await api.post("/admin/departments", data);
  return res.data;
};

export const updateDepartment = async (id, data) => {
  const res = await api.put(`/admin/departments/${id}`, data);
  return res.data;
};

export const deleteDepartment = async (id) => {
  const res = await api.delete(`/admin/departments/${id}`);
  return res.data;
};

export const getDepartments = async () => {
  const res = await api.get("/admin/departments");
  return res.data;
};

export const getStaffUsers = async () => {
  const res = await api.get("/admin/staff");
  return res.data;
};

export const assignStaffToDepartment = async (data) => {
  const res = await api.post("/admin/assign-staff", data);
  return res.data;
};

export const getAnalytics = async () => {
  const res = await api.get("/admin/analytics");
  return res.data;
};
