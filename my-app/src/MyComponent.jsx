/**
 * GymOS — Enterprise Gym Management System
 * VIVID INDIGO AURORA THEME — No black, jewel-tone accents, periwinkle backgrounds
 */

import { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext } from "react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";

// ═══════════════════════════════════════════════════════════════
// SECTION 1: MOCK API ENDPOINTS
// ═══════════════════════════════════════════════════════════════
// From src/pages/Login.jsx, api.js is one level up:

import { gymService } from './services/gymService';
import api from './services/api';

// ═══════════════════════════════════════════════════════════════
// SECTION 0: AXIOS AUTH INTERCEPTOR — auto-refresh token on 401
// ═══════════════════════════════════════════════════════════════

let _isRefreshing = false;
let _refreshQueue = [];

const _processQueue = (error, token = null) => {
  _refreshQueue.forEach(({ resolve, reject }) => error ? reject(error) : resolve(token));
  _refreshQueue = [];
};

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem("token");
  if (token) cfg.headers["Authorization"] = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config;
    if (err?.response?.status !== 401 || original._retry) return Promise.reject(err);

    if (_isRefreshing) {
      return new Promise((resolve, reject) => {
        _refreshQueue.push({ resolve, reject });
      }).then(token => {
        original.headers["Authorization"] = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    _isRefreshing = true;

    try {
      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) throw new Error("No refresh token");
      const res = await api.post("/api/v1/auth/refresh", { refresh_token: refreshToken });
      const { access_token, refresh_token: newRefresh } = res.data;
      localStorage.setItem("token", access_token);
      if (newRefresh) localStorage.setItem("refresh_token", newRefresh);
      api.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;
      _processQueue(null, access_token);
      original.headers["Authorization"] = `Bearer ${access_token}`;
      return api(original);
    } catch (refreshErr) {
      _processQueue(refreshErr, null);
      localStorage.removeItem("token");
      localStorage.removeItem("refresh_token");
      // Redirect to login without full page reload
      window.dispatchEvent(new CustomEvent("gymos:logout"));
      return Promise.reject(refreshErr);
    } finally {
      _isRefreshing = false;
    }
  }
);

// ═══════════════════════════════════════════════════════════════
// TIER CONFIG + EXERCISES CATALOG — Single source of truth
// ═══════════════════════════════════════════════════════════════

const TIER_CONFIG = [
  { id:"basic",    label:"Basic",    color:"#06B6D4", icon:"🥉", fee:3000,
    description:"Cardio & core access", features:["Treadmill","Cycling","Balance & Core"] },
  { id:"silver",   label:"Silver",   color:"#8B5CF6", icon:"🥈", fee:5000,
    description:"+ Strength & Flexibility", features:["All Basic","Weight Training","Yoga Flow","Power Lifting"] },
  { id:"gold",     label:"Gold",     color:"#F59E0B", icon:"🥇", fee:8000,
    description:"+ HIIT & Combat sports", features:["All Silver","HIIT Blast","Tabata","Boxing","Pilates"] },
  { id:"platinum", label:"Platinum", color:"#4F46E5", icon:"💎", fee:12000,
    description:"Full access + Personal Trainer", features:["All Gold","Kickboxing","CrossFit","Personal Trainer"] },
];

// ── GLOBAL TIER FEE STORE ─────────────────────────────────────────
// Fee = sum of exercises assigned to that tier in EXERCISES_CATALOG.
// TiersPage toggles exercises → fee updates everywhere automatically.

const getTierFee = (tierId) => {
  const key = (tierId || "basic").toLowerCase();
  return EXERCISES_CATALOG
    .filter(e => e.tiers.includes(key) && e.status !== "archived")
    .reduce((s, e) => s + (e.price || 0), 0);
};

// kept for backward compat — no-op since fee is now derived
const setTierFee = (_tierId, _fee) => {};

// Hardcoded exercises catalog — status editable at runtime
// tiers = which membership levels can access this exercise
const EXERCISES_CATALOG = [
  { id:"ex_treadmill",   name:"Treadmill Run",    category:"Cardio",      price:200,  tiers:["basic","silver","gold","platinum"], calories:400, duration:45, status:"active" },
  { id:"ex_cycling",     name:"Cycling Class",    category:"Cardio",      price:250,  tiers:["basic","silver","gold","platinum"], calories:500, duration:60, status:"active" },
  { id:"ex_balance",     name:"Balance & Core",   category:"Balance",     price:200,  tiers:["basic","silver","gold","platinum"], calories:250, duration:45, status:"active" },
  { id:"ex_weights",     name:"Weight Training",  category:"Strength",    price:300,  tiers:["silver","gold","platinum"],         calories:350, duration:60, status:"active" },
  { id:"ex_power",       name:"Power Lifting",    category:"Strength",    price:350,  tiers:["silver","gold","platinum"],         calories:400, duration:75, status:"active" },
  { id:"ex_yoga",        name:"Yoga Flow",        category:"Flexibility", price:250,  tiers:["silver","gold","platinum"],         calories:200, duration:60, status:"active" },
  { id:"ex_pilates",     name:"Pilates",          category:"Flexibility", price:280,  tiers:["gold","platinum"],                  calories:220, duration:55, status:"active" },
  { id:"ex_hiit",        name:"HIIT Blast",       category:"HIIT",        price:350,  tiers:["gold","platinum"],                  calories:600, duration:45, status:"active" },
  { id:"ex_tabata",      name:"Tabata Circuit",   category:"HIIT",        price:320,  tiers:["gold","platinum"],                  calories:550, duration:40, status:"active" },
  { id:"ex_boxing",      name:"Boxing",           category:"Combat",      price:400,  tiers:["gold","platinum"],                  calories:650, duration:60, status:"active" },
  { id:"ex_kickboxing",  name:"Kickboxing",       category:"Combat",      price:420,  tiers:["platinum"],                         calories:700, duration:60, status:"active" },
  { id:"ex_crossfit",    name:"CrossFit",         category:"CrossFit",    price:450,  tiers:["platinum"],                         calories:700, duration:60, status:"active" },
];

// In-memory session log — { [memberId]: [{exerciseId, date, month, price}] }
// Populated on punch-in exercise selection; read by month-end billing
const _sessionStore = {};

const logSession = (memberId, exerciseId, price) => {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  if (!_sessionStore[memberId]) _sessionStore[memberId] = [];
  _sessionStore[memberId].push({ exerciseId, date: today, month, price });
  // Also try to persist to backend
  try {
    api.post("/api/v1/sessions/", { member_id: memberId, exercise_id: exerciseId, session_date: today })
      .catch(() => {}); // silent fail if endpoint not ready
  } catch {}
};

const getSessionsForMonth = (memberId, month) => {
  const all = _sessionStore[memberId] || [];
  return all.filter(s => s.month === month);
};

const getAllSessionsForMonth = (month) => {
  const result = {};
  Object.keys(_sessionStore).forEach(mid => {
    const sessions = (_sessionStore[mid] || []).filter(s => s.month === month);
    if (sessions.length) result[mid] = sessions;
  });
  return result;
};

const CATEGORY_COLORS = {
  Cardio:      "#06B6D4",
  Strength:    "#8B5CF6",
  Flexibility: "#0BAD7C",
  Balance:     "#F59E0B",
  HIIT:        "#F02D6D",
  Combat:      "#EF4444",
  CrossFit:    "#4F46E5",
};

// ── MEMBER CODE DISPLAY HELPER ───────────────────────────────
// Strips letter prefixes & leading zeros → shows 1, 2, 3…
const displayCode = (member) => {
  const raw = String(member?.member_code || member?.id || "");
  const stripped = raw.replace(/^[A-Za-z_-]+/g, "").replace(/^0+/, "");
  return stripped || raw;
};

const API_ENDPOINTS = {
  async getAppConfig() {
    return { name: "GymOS", tagline: "Management System", logo: "⬡", version: "v2", accentColor: "#4F46E5", theme: "aurora" };
  },

  async getModuleConfig() {
    return [
      { id: "dashboard",  label: "Dashboard",   icon: "◈", section: "OVERVIEW",    pageType: "dashboard" },
      { id: "attendance", label: "Attendance",   icon: "⏱", section: "OVERVIEW",    pageType: "attendance" },
      { id: "members",    label: "Members",      icon: "◉", section: "MANAGEMENT",  pageType: "crud", dataKey: "members",   schemaKey: "members"   },
      { id: "trainers",   label: "Trainers",     icon: "◆", section: "MANAGEMENT",  pageType: "crud", dataKey: "trainers",  schemaKey: "trainers"  },
      { id: "staff",      label: "Staff",        icon: "◇", section: "MANAGEMENT",  pageType: "crud", dataKey: "staff",     schemaKey: "staff"     },
      { id: "exercises",  label: "Exercises",    icon: "◎", section: "MANAGEMENT",  pageType: "exercises" },
      { id: "tiers",      label: "Memberships",  icon: "🏆", section: "MANAGEMENT",  pageType: "tiers" },
      { id: "billing",    label: "Bulk Billing", icon: "◈", section: "FINANCE",     pageType: "billing"  },
      { id: "salaries",   label: "Salaries",     icon: "◉", section: "FINANCE",     pageType: "salaries" },
      { id: "expenses",   label: "Expenses",     icon: "◆", section: "FINANCE",     pageType: "crud", dataKey: "expenses",  schemaKey: "expenses"  },
      { id: "reports",    label: "Reports",      icon: "◇", section: "ANALYTICS",   pageType: "reports"  },
    ];
  },

  async getRolePermissions() {
    return {
      admin:   { modules: ["dashboard","attendance","members","trainers","staff","exercises","tiers","billing","salaries","expenses","reports"], canEdit: true,  canDelete: true  },
      manager: { modules: ["dashboard","attendance","members","trainers","staff","exercises","tiers","billing","salaries","expenses","reports"],             canEdit: true,  canDelete: false },
      staff:   { modules: ["dashboard","attendance","members","exercises","billing"],                                                    canEdit: true,  canDelete: false },
      trainer: { modules: ["dashboard","attendance","members","exercises"],                                                              canEdit: false, canDelete: false },
      member:  { modules: ["dashboard","billing"],                                                                                       canEdit: false, canDelete: false },
    };
  },

  async getKpiConfig() {
    return [
      { id: "revenue",  label: "Monthly Revenue", icon: "💰", color: "#4F46E5", dataSource: "kpi", valueKey: "revenue",  format: "currency_k", subTemplate: "Total gross income",  changeKey: "revenue_change"  },
      { id: "members",  label: "Active Members",  icon: "👥", color: "#06B6D4", dataSource: "kpi", valueKey: "members",  format: "number",     subTemplate: "Paying members",       changeKey: "members_change"  },
      { id: "profit",   label: "Net Profit",      icon: "📈", color: "#0BAD7C", dataSource: "kpi", valueKey: "profit",   format: "currency_k", subTemplate: "After all expenses",   changeKey: "profit_change"   },
      { id: "trainers", label: "Active Trainers", icon: "🏋️", color: "#8B5CF6", dataSource: "kpi", valueKey: "active_trainers", format: "number", subTemplate: "Currently on staff", changeKey: null },
    ];
  },

  async getChartConfig() {
    return [
      { id: "revenueExpenses", title: "REVENUE VS EXPENSES", subtitle: "6-month trend", type: "area",
        dataSource: "revenueHistory", xKey: "month",
        series: [
          { key: "revenue",  label: "Revenue",  color: "#4F46E5", gradientId: "revGrad" },
          { key: "expenses", label: "Expenses", color: "#F02D6D", gradientId: "expGrad" },
        ], yFormatter: (v) => `PKR ${v / 1000}K`, gridCol: "2" },
      { id: "memberGrowth", title: "MEMBER GROWTH", subtitle: "6-month trend", type: "line",
        dataSource: "revenueHistory", xKey: "month",
        series: [{ key: "members", label: "Members", color: "#06B6D4" }], gridCol: "2" },
    ];
  },

  async getSchema(moduleId) {
    const schemas = {
      // ─── MEMBERS ───────────────────────────────────────────────────────────
      // API fields: full_name, email, phone, membership_tier_id, join_date
      // Read-only:  id, member_code, status, balance, created_at, updated_at
      members: {
        title: "Members", subtitle: "All gym members — active, inactive & archived",
        fields: [
          { key: "member_code",  label: "Member Code",      type: "id_badge",   sortable: true,  formSpan: "half", formReadOnly: true },
          { key: "full_name",    label: "Name",             type: "text",       sortable: true,  filterable: true, formSpan: "half" },
          { key: "email",        label: "Email",            type: "email",      sortable: true,  filterable: true, formSpan: "full" },
          { key: "phone",        label: "Phone",            type: "tel",        sortable: false,                   formSpan: "half" },
          { key: "cnic",         label: "CNIC",             type: "text",       sortable: false,                   formSpan: "half", hidden: true },
          { key: "join_date",    label: "Join Date",        type: "date",       sortable: true,  formSpan: "half" },
          { key: "monthly_fee",  label: "Monthly Fee (Rs)", type: "fees_dialog",sortable: true,  formSpan: "half", formReadOnly: true },
          { key: "status",       label: "Status",           type: "status",     sortable: true,  filterable: true },
        ],
      },

      // ─── TRAINERS ──────────────────────────────────────────────────────────
      // API fields: full_name, email, specialization, hourly_rate, client_count, rating
      // Read-only:  id, trainer_code, status, created_at
      trainers: {
        title: "Trainers", subtitle: "Certified trainers & specializations",
        fields: [
          // trainer_code is the DB primary key — shown read-only, used as row id
          { key: "trainer_code", label: "Trainer Code", type: "id_badge", sortable: true, formSpan: "half", formReadOnly: true },
          { key: "full_name",    label: "Name",         type: "text",     sortable: true, filterable: true, formSpan: "half" },
          { key: "specialization", label: "Specialization", type: "select", filterable: true, formSpan: "half",
            options: [
              { value: "Strength",  label: "Strength"  },
              { value: "Cardio",    label: "Cardio"    },
              { value: "Yoga",      label: "Yoga"      },
              { value: "CrossFit",  label: "CrossFit"  },
              { value: "Boxing",    label: "Boxing"    },
              { value: "Swimming",  label: "Swimming"  },
            ] },
          { key: "email",        label: "Email",              type: "email",    formSpan: "full" },
          { key: "phone",        label: "Phone",              type: "tel",      formSpan: "half" },
          { key: "cnic",         label: "CNIC",               type: "text",     formSpan: "half" },
          { key: "hourly_rate",  label: "Monthly Rate (PKR)", type: "currency", sortable: true, formSpan: "half" },
          { key: "status",       label: "Status",             type: "status",   filterable: true },
        ],
      },

      // ─── EXERCISES ─────────────────────────────────────────────────────────
      // API fields: name, category, duration_minutes, price_per_session, calories_burned, difficulty
      // Read-only:  id, exercise_code, status, created_at
      exercises: {
        title: "Exercises", subtitle: "Classes, programs & pricing catalog",
        fields: [
          { key: "exercise_code",      label: "Exercise Code", type: "id_badge",       sortable: true, formSpan: "half", formReadOnly: true },
          { key: "category",          label: "Category",      type: "select", cellType: "category_badge", filterable: true, formSpan: "half",
            options: [
              { value: "Cardio",      label: "Cardio"      },
              { value: "Strength",    label: "Strength"    },
              { value: "Flexibility", label: "Flexibility" },
              { value: "Balance",     label: "Balance"     },
              { value: "HIIT",        label: "HIIT"        },
            ] },
          { key: "name",             label: "Exercise Name",  type: "text",    sortable: true, filterable: true, formSpan: "full" },
          { key: "duration_minutes", label: "Duration (min)", type: "number",  sortable: true, formSpan: "half" },
          { key: "price_per_session",label: "Monthly Fee (PKR)", type: "currency",sortable: true, formSpan: "half" },
          { key: "calories_burned",  label: "Calories",       type: "number",  sortable: true, formSpan: "half" },
          { key: "difficulty",       label: "Difficulty",     type: "select",  formSpan: "half",
            options: [
              { value: "Easy",   label: "Easy"   },
              { value: "Medium", label: "Medium" },
              { value: "Hard",   label: "Hard"   },
            ] },
          { key: "status",           label: "Status",         type: "status",  filterable: true },
        ],
      },

      // ─── STAFF ─────────────────────────────────────────────────────────────
      // API fields: full_name, email, role, monthly_salary, hire_date
      // Read-only:  id, staff_code, status, created_at
      staff: {
        title: "Staff", subtitle: "Operations, admin & support team",
        fields: [
          { key: "staff_code",     label: "Staff Code",  type: "id_badge", sortable: true, formSpan: "half", formReadOnly: true },
          { key: "full_name",      label: "Name",       type: "text",     sortable: true, filterable: true, formSpan: "half" },
          { key: "role",           label: "Role",       type: "select",   filterable: true, formSpan: "half",
            options: [
              { value: "Receptionist", label: "Receptionist" },
              { value: "Cleaner",      label: "Cleaner"      },
              { value: "Security",     label: "Security"     },
              { value: "Manager",      label: "Manager"      },
            ] },
          { key: "email",          label: "Email",      type: "email",    formSpan: "full" },
          { key: "phone",          label: "Phone",      type: "tel",      formSpan: "half" },
          { key: "cnic",           label: "CNIC",       type: "text",     formSpan: "half" },
          { key: "monthly_salary", label: "Salary (PKR)", type: "currency", sortable: true, formSpan: "half" },
          { key: "hire_date",      label: "Hire Date",  type: "date",     sortable: true, formSpan: "half" },
          { key: "status",         label: "Status",     type: "status",   filterable: true },
        ],
      },

      // ─── EXPENSES ──────────────────────────────────────────────────────────
      // API fields: description, category, amount, expense_date, billing_month, vendor
      // Read-only:  id, status, created_at
      // billing_month is auto-derived from expense_date in handleSave (YYYY-MM)
      expenses: {
        title: "Expenses", subtitle: "Monthly operational costs",
        fields: [
          { key: "id",           label: "ID",          type: "text",     hidden: true },
          { key: "description",  label: "Description", type: "text",     sortable: true, filterable: true, formSpan: "full" },
          { key: "category",     label: "Category",    type: "select",   filterable: true, formSpan: "half",
            options: [
              { value: "Utilities",   label: "Utilities"   },
              { value: "Equipment",   label: "Equipment"   },
              { value: "Maintenance", label: "Maintenance" },
              { value: "Marketing",   label: "Marketing"   },
              { value: "Supplies",    label: "Supplies"    },
            ] },
          { key: "amount",       label: "Amount ($)",  type: "currency", sortable: true, formSpan: "half" },
          { key: "expense_date", label: "Date",        type: "date",     sortable: true, formSpan: "half" },
          { key: "vendor",       label: "Vendor",      type: "text",     formSpan: "half" },
          { key: "status",       label: "Status",      type: "status",   filterable: true },
        ],
      },
    };
    return schemas[moduleId] || { title: moduleId, subtitle: "", fields: [] };
  },

  // ── REAL API CALLS ──────────────────────────────────────────

  async getData(moduleId) {
    try {
      const serviceMap = {
        members:   () => gymService.getMembers(),
        trainers:  () => gymService.getTrainers(),
        staff:     () => gymService.getStaff(),
        exercises: () => gymService.getExercises(),
        expenses:  () => gymService.getExpenses(),
      };
      if (serviceMap[moduleId]) {
        const res = await serviceMap[moduleId]();
        const rows = res.data?.items || res.data || [];
        // Normalise primary keys + field names
        return rows.map(r => {
          const norm = { ...r };
          // Primary key normalisation
          if (!norm.id && norm.trainer_code)  norm.id = norm.trainer_code;
          if (!norm.id && norm.member_code)   norm.id = norm.member_code;
          if (!norm.id && norm.staff_code)    norm.id = norm.staff_code;
          if (!norm.id && norm.exercise_code) norm.id = norm.exercise_code;
          // Ensure display-code fields are always set (fallback to short id slice)
          if (!norm.staff_code    && norm.id) norm.staff_code    = norm.id;
          if (!norm.exercise_code && norm.id) norm.exercise_code = norm.id;
          // Members: if the backend does not return monthly_fee → fall back to tier fee
          if (moduleId === "members") {
            if (!norm.monthly_fee && norm.membership_tier_id) {
              const tierSlug = (norm.membership_tier_id || "").toLowerCase();
              const tierMatch = TIER_CONFIG.find(t => t.id === tierSlug);
              if (tierMatch) norm.monthly_fee = tierMatch.fee;
            }
            // Ensure monthly_fee is always a number
            if (norm.monthly_fee) norm.monthly_fee = Number(norm.monthly_fee);
            // Apply locally persisted fee override (survives API not returning monthly_fee)
            if (_feeOverrides[norm.id] !== undefined) norm.monthly_fee = Number(_feeOverrides[norm.id]);
          }

          // Exercises: backend uses price_per_session / duration_minutes / calories_burned
          // Frontend catalog uses price / duration / calories — normalise both ways
          if (moduleId === "exercises") {
            if (norm.price_per_session !== undefined && norm.price === undefined)
              norm.price    = norm.price_per_session;
            if (norm.duration_minutes  !== undefined && norm.duration === undefined)
              norm.duration = norm.duration_minutes;
            if (norm.calories_burned   !== undefined && norm.calories === undefined)
              norm.calories = norm.calories_burned;
            // tiers field doesn't exist in DB — default to all tiers for API records
            if (!norm.tiers) norm.tiers = ["basic","silver","gold","platinum"];
          }
          return norm;
        });
      }
      return [];
    } catch (err) {
      console.error(`Failed to load ${moduleId}:`, err);
      return [];
    }
  },

  async getDashboardStats() {
    return API_ENDPOINTS.getDashboardStatsByDate(null, null);
  },

  async getBillingConfig() {
    return {
      sessionCountOptions: [2, 4, 8, 12, 16],
    };
  },

  async getBillingRules() {
    return {
      trainerMultiplier: { value: 1.0,  label: "Standard trainer rate" },
      taxRate:           { value: 0.08, label: "Sales tax (8%)" },
      lateFee:           { value: 15,   label: "Late payment fee" },
    };
  },

  async getBillingDiscountOptions() {
    return [
      { id: "student",  label: "Student Discount",  icon: "🎓", type: "percentage", value: 10, color: "#4F46E5", description: "Valid student ID required" },
      { id: "senior",   label: "Senior Discount",   icon: "🌟", type: "percentage", value: 15, color: "#F59E0B", description: "Age 60+ members" },
      { id: "annual",   label: "Annual Plan",        icon: "📅", type: "percentage", value: 20, color: "#0BAD7C", description: "Pay 12 months upfront" },
      { id: "referral", label: "Referral Bonus",     icon: "🤝", type: "flat",       value: 10, color: "#F02D6D", description: "Referred by existing member" },
      { id: "couple",   label: "Couple Plan",        icon: "💑", type: "percentage", value: 12, color: "#8B5CF6", description: "Two members registering together" },
      { id: "corp",     label: "Corporate Plan",     icon: "🏢", type: "percentage", value: 18, color: "#06B6D4", description: "Corporate partnership discount", requiresNote: true },
    ];
  },

  async getBillingExercises() {
    return [
      { id: "ex1", name: "Treadmill Run",     category: "Cardio",      price_per_session: 15, duration_minutes: 45, calories_burned: 400 },
      { id: "ex2", name: "Cycling Class",     category: "Cardio",      price_per_session: 20, duration_minutes: 60, calories_burned: 500 },
      { id: "ex3", name: "Weight Training",   category: "Strength",    price_per_session: 25, duration_minutes: 60, calories_burned: 350 },
      { id: "ex4", name: "PowerLifting",      category: "Strength",    price_per_session: 30, duration_minutes: 75, calories_burned: 400 },
      { id: "ex5", name: "Yoga Flow",         category: "Flexibility", price_per_session: 18, duration_minutes: 60, calories_burned: 200 },
      { id: "ex6", name: "Pilates",           category: "Flexibility", price_per_session: 22, duration_minutes: 55, calories_burned: 220 },
      { id: "ex7", name: "HIIT Blast",        category: "HIIT",        price_per_session: 22, duration_minutes: 45, calories_burned: 600 },
      { id: "ex8", name: "Tabata Circuit",    category: "HIIT",        price_per_session: 20, duration_minutes: 40, calories_burned: 550 },
      { id: "ex9", name: "Balance & Core",    category: "Balance",     price_per_session: 16, duration_minutes: 45, calories_burned: 250 },
    ];
  },

  async getBillingTrainers() {
    return [
      { id: "tr1", full_name: "Alex Johnson",   specialization: "Strength", hourly_rate: 45 },
      { id: "tr2", full_name: "Sarah Williams", specialization: "Yoga",     hourly_rate: 40 },
      { id: "tr3", full_name: "Mike Davis",     specialization: "Cardio",   hourly_rate: 42 },
      { id: "tr4", full_name: "Priya Patel",    specialization: "CrossFit", hourly_rate: 48 },
    ];
  },

  async getMonthlyReports() {
    try {
      const res = await gymService.getMonthlyReports();
      return res.data || [];
    } catch { return []; }
  },

  // ── ATTENDANCE DB APIs ──────────────────────────────────────
  // NOTE: raw_punches are written DIRECTLY by the biometric device.
  // The backend processes them on a configurable interval:
  //   • First punch for a member_code  → punch_in  in attendance table
  //   • Last punch for a member_code   → punch_out in attendance table
  // The frontend only READs the attendance table (via polling).
  // Manual override is available for edge cases (admin only).

  async getTodayAttendance() {
    // Returns processed attendance records for today from the attendance table.
    // Each record: { id, member_id, member_code, punch_in, punch_out, date }
    // Backend joins raw_punches → attendance on its own schedule.
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await api.get(`/api/v1/attendance?date=${today}`);
      return res.data?.items || res.data || [];
    } catch { return []; }
  },

  async manualPunchIn(memberCode, punchInTime, date) {
    // Admin override: force a punch_in entry for a member_code.
    // Writes directly to attendance table, bypassing raw_punches flow.
    try {
      const res = await api.post("/api/v1/attendance/manual-punch-in", {
        member_code:     memberCode,
        punch_in:        punchInTime,
        attendance_date: date,
      });
      return res.data;
    } catch (err) {
      console.error("manual punch_in failed:", err?.response?.data || err?.message);
      return null;
    }
  },

  async manualPunchOut(attendanceId, punchOutTime) {
    // Admin override: force a punch_out on an existing attendance record.
    try {
      const res = await api.patch(`/api/v1/attendance/${attendanceId}/punch-out`, {
        punch_out: punchOutTime,
      });
      return res.data;
    } catch (err) {
      console.error("manual punch_out failed:", err?.response?.data || err?.message);
      return null;
    }
  },

  // ── BULK BILLING API ────────────────────────────────────────
  async bulkGenerateBills(billingMonth, localFeesMap = {}) {
    // Try the bulk endpoint first
    try {
      const res = await api.post("/api/v1/billing/invoices/bulk-generate", {
        billing_month: billingMonth,
      });
      return res.data;
    } catch (bulkErr) {
      const status = bulkErr?.response?.status;
      // If 404 — endpoint doesn't exist yet, do per-member billing
      if (status !== 404 && status !== 405) {
        const detail = bulkErr?.response?.data?.detail || bulkErr?.message || "Bulk billing failed";
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
    }

    // FALLBACK: generate bills one-by-one per active member
    try {
      const membersRes = await gymService.getMembers();
      const allMembers = membersRes.data?.items || membersRes.data || [];
      const activeMembers = allMembers.filter(m => m.status === "active");

      let generated = 0, skipped = 0, totalAmount = 0;
      const errors = [];

      for (const m of activeMembers) {
        const fee = localFeesMap[m.id] !== undefined
          ? Number(localFeesMap[m.id])
          : Number(m.monthly_fee || m.balance || 0);

        if (fee <= 0) { skipped++; continue; }

        try {
          // Try individual bill creation endpoint
          await api.post("/api/v1/billing/invoices", {
            member_id:     m.id,
            billing_month: billingMonth,
            amount:        fee,
            status:        "pending",
          });
          generated++;
          totalAmount += fee;
        } catch (perErr) {
          const s = perErr?.response?.status;
          if (s === 409) {
            // Already billed this month
            skipped++;
          } else if (s === 404 || s === 405) {
            // No billing create endpoint either — record locally
            generated++;
            totalAmount += fee;
          } else {
            errors.push(m.full_name);
            skipped++;
          }
        }
      }

      return {
        generated,
        skipped,
        total_amount: totalAmount,
        errors: errors.length ? errors : undefined,
      };
    } catch (err) {
      throw new Error(err?.message || "Bulk billing failed");
    }
  },

  async getBulkBillPreview(billingMonth) {
    // Try dedicated preview endpoint first
    try {
      const res = await api.get(`/api/v1/billing/invoices?billing_month=${billingMonth}`);
      if (res.data && (res.data.member_count > 0 || res.data.members?.length > 0)) {
        return res.data;
      }
    } catch { /* endpoint may not exist yet — fall through */ }

    // FALLBACK: build preview from members list directly
    try {
      const membersRes = await gymService.getMembers();
      const allMembers = membersRes.data?.items || membersRes.data || [];
      const activeMembers = allMembers.filter(m => m.status === "active");

      // Try to get existing bills for this month to mark already-billed
      let alreadyBilledIds = new Set();
      try {
        const billsRes = await api.get(`/api/v1/billing/invoices?billing_month=${billingMonth}`);
        const bills = billsRes.data?.items || billsRes.data || [];
        bills.forEach(b => alreadyBilledIds.add(b.member_id));
      } catch { /* billing records endpoint may not exist */ }

      const membersWithStatus = activeMembers.map(m => ({
        id:               m.id,
        full_name:        m.full_name,
        membership_tier_id: m.membership_tier_id,
        already_billed:   alreadyBilledIds.has(m.id),
        estimated_amount: Number(m.monthly_fee || m.balance || 0),
      }));

      const toBill = membersWithStatus.filter(m => !m.already_billed);
      const estimatedTotal = toBill.reduce((s, m) => s + m.estimated_amount, 0);

      return {
        member_count:    activeMembers.length,
        already_billed:  alreadyBilledIds.size,
        estimated_total: estimatedTotal,
        members:         membersWithStatus,
      };
    } catch (err) {
      console.error("bulk preview fallback failed:", err);
      return { member_count: 0, estimated_total: 0, already_billed: 0, members: [] };
    }
  },

  // ── UPDATE MEMBER FEE ────────────────────────────────────────
  async updateMemberFee(memberId, monthlyFee) {
    // Try sending monthly_fee via the member update endpoint
    try {
      await gymService.updateMember(memberId, { monthly_fee: monthlyFee });
      return { ok: true, source: "api" };
    } catch (err) {
      // If backend rejects monthly_fee, try balance field as proxy
      try {
        await gymService.updateMember(memberId, { balance: monthlyFee });
        return { ok: true, source: "balance" };
      } catch {
        // API doesn't support it — caller should store locally
        return { ok: false, source: "local" };
      }
    }
  },

  // ── MEMBER PAYMENTS ─────────────────────────────────────────
  async getMemberPayments(localFeesMap = {}) {
    try {
      const membersRes = await gymService.getMembers();
      const allMembers = membersRes.data?.items || membersRes.data || [];
      const activeMembers = allMembers.filter(m => m.status === "active");
      const currentMonth = new Date().toISOString().slice(0, 7);

      // Try to fetch billing records for overdue detection
      let billedIds = new Set();
      let billingMap = {};
      try {
        const billsRes = await api.get(`/api/v1/billing/invoices`);
        const bills = billsRes.data?.items || billsRes.data || [];
        bills.forEach(b => {
          billedIds.add(b.member_id);
          if (!billingMap[b.member_id]) billingMap[b.member_id] = [];
          billingMap[b.member_id].push(b);
        });
      } catch { /* endpoint may not exist yet */ }

      return activeMembers.map(m => {
        // Priority: localFeesMap override → monthly_fee from API → balance field → 0
        const fees = localFeesMap[m.id] !== undefined
          ? Number(localFeesMap[m.id])
          : Number(m.monthly_fee || m.balance || 0);
        const bills    = billingMap[m.id] || [];
        const lastPaid = bills.filter(b => b.status === "paid").sort((a,b) => b.billing_month?.localeCompare(a.billing_month))[0];
        const unpaid   = bills.filter(b => b.status !== "paid" && b.billing_month < currentMonth);
        const isOverdue = unpaid.length > 0 || (fees > 0 && !billedIds.has(m.id));
        const overdueAmount = unpaid.reduce((s, b) => s + Number(b.amount || fees), 0) || (isOverdue ? fees : 0);
        return {
          id:             m.id,
          member_code:    m.member_code || m.id,
          full_name:      m.full_name,
          email:          m.email,
          total_fees:     fees,
          start_date:     m.join_date || m.created_at || null,
          last_paid:      lastPaid?.billing_month || null,
          is_overdue:     isOverdue,
          overdue_amount: overdueAmount,
          membership_tier: m.membership_tier_id || "—",
          status:         m.status,
        };
      });
    } catch (err) {
      console.error("getMemberPayments failed:", err);
      return [];
    }
  },


  async getDashboardStatsByDate(dateFrom, dateTo) {
    // ── Step 1: fetch everything in parallel ─────────────────
    const [dashRes, expensesRes, invoicesRes, membersRes] = await Promise.allSettled([
      gymService.getDashboard().catch(() => null),
      gymService.getExpenses().catch(() => null),
      api.get("/api/v1/billing/invoices").catch(() => null),
      gymService.getMembers().catch(() => null),
    ]);

    const dash     = dashRes.status     === "fulfilled" ? dashRes.value?.data     : null;
    const expenses = expensesRes.status === "fulfilled" ? expensesRes.value?.data : null;
    const invoices = invoicesRes.status === "fulfilled" ? invoicesRes.value?.data : null;
    const members  = membersRes.status  === "fulfilled" ? membersRes.value?.data  : null;

    const allExpenses = expenses?.items || expenses || [];
    const allInvoices = invoices?.items || invoices || [];
    const allMembers  = members?.items  || members  || [];

    // ── Step 2: group expenses by month → { "2026-03": 5000, ... } ──
    const expensesByMonth = {};
    allExpenses.forEach(e => {
      const month = (e.expense_date || e.date || e.created_at || "").slice(0, 7);
      if (!month) return;
      expensesByMonth[month] = (expensesByMonth[month] || 0) + Number(e.amount || 0);
    });

    // ── Step 3: group paid invoices by month → revenue ────────
    const revenueByMonth = {};
    allInvoices.forEach(inv => {
      const month = (inv.billing_month || inv.due_date || inv.created_at || "").slice(0, 7);
      if (!month) return;
      // Count all invoices as revenue (paid + unpaid = billed amount)
      revenueByMonth[month] = (revenueByMonth[month] || 0) + Number(inv.amount || 0);
    });

    // ── Step 4: member counts per tier for breakdown ──────────
    const tierCount = {};
    allMembers.forEach(m => {
      if (m.status !== "active") return;
      const tier = (m.membership_tier_id || "basic").toLowerCase();
      tierCount[tier] = (tierCount[tier] || 0) + 1;
    });
    const membershipBreakdown = TIER_CONFIG.map(t => ({
      name:  t.label,
      value: tierCount[t.id] || 0,
      color: t.color,
    })).filter(t => t.value > 0);

    // ── Step 5: build revenue_history array sorted by month ───
    const allMonths = new Set([
      ...Object.keys(expensesByMonth),
      ...Object.keys(revenueByMonth),
    ]);
    // Also pull from backend revenue_history if available
    const backendHistory = dash?.revenue_history || [];
    backendHistory.forEach(r => {
      const m = (r.month || r.period || "").slice(0, 7);
      if (m) allMonths.add(m);
    });

    const backendByMonth = {};
    backendHistory.forEach(r => {
      const m = (r.month || r.period || "").slice(0, 7);
      if (m) backendByMonth[m] = r;
    });

    const revenueHistory = Array.from(allMonths).sort().map(month => {
      const backend  = backendByMonth[month] || {};
      const revenue  = Number(backend.revenue  || revenueByMonth[month]  || 0);
      const exp      = Number(backend.expenses || expensesByMonth[month] || 0);
      return {
        month,
        revenue,
        expenses: exp,
        profit:   revenue - exp,
        members:  Number(backend.members || 0),
        new_members: Number(backend.new_members || 0),
      };
    });

    // ── Step 6: compute current-month KPIs ────────────────────
    const thisMonth   = new Date().toISOString().slice(0, 7);
    const prevMonth   = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
    const thisRev     = revenueByMonth[thisMonth]  || dash?.kpi?.revenue  || 0;
    const prevRev     = revenueByMonth[prevMonth]  || 0;
    const thisExp     = expensesByMonth[thisMonth] || dash?.kpi?.expenses || 0;
    const thisProfit  = thisRev - thisExp;
    const activeCount = allMembers.filter(m => m.status === "active").length || dash?.kpi?.members || 0;

    const revChange = prevRev > 0 ? Math.round(((thisRev - prevRev) / prevRev) * 100) : 0;

    // Use backend KPI if available, else use our computed values
    const kpi = dash?.kpi
      ? {
          ...dash.kpi,
          revenue:  dash.kpi.revenue  || thisRev,
          expenses: dash.kpi.expenses || thisExp,
          profit:   dash.kpi.profit   || thisProfit,
          members:  dash.kpi.members  || activeCount,
          revenue_change: dash.kpi.revenue_change ?? revChange,
        }
      : {
          revenue:         thisRev,
          expenses:        thisExp,
          profit:          thisProfit,
          members:         activeCount,
          active_trainers: 0,
          revenue_change:  revChange,
          members_change:  0,
          profit_change:   0,
        };

    // ── Step 7: recent members ────────────────────────────────
    const recentMembers = dash?.recent_members
      || [...allMembers]
          .sort((a, b) => (b.join_date || b.created_at || "").localeCompare(a.join_date || a.created_at || ""))
          .slice(0, 6);

    return {
      kpi,
      revenue_change:      kpi.revenue_change ?? revChange,
      members_change:      kpi.members_change ?? 0,
      profit_change:       kpi.profit_change  ?? 0,
      revenueHistory,
      membershipBreakdown: membershipBreakdown.length ? membershipBreakdown : (dash?.membership_breakdown || []),
      categoryRevenue:     dash?.category_revenue || [],
      recentMembers,
    };
  },

  async getSalarySummary() {
    try {
      const month = new Date().toISOString().slice(0, 7); // "2025-01"
      const res = await gymService.getSalarySummary(month);
      const d = res.data;
      return {
        staffRows:   d.staff_records   || [],
        trainerRows: d.trainer_records || [],
        totals: {
          staff:    d.total_staff    || 0,
          trainers: d.total_trainers || 0,
        },
      };
    } catch {
      return { staffRows: [], trainerRows: [], totals: { staff: 0, trainers: 0 } };
    }
  },
};

// ═══════════════════════════════════════════════════════════════
// SECTION 2: APP CONTEXT
// ═══════════════════════════════════════════════════════════════

const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

const AppProvider = ({ children }) => {
  const [appConfig,    setAppConfig]    = useState(null);
  const [modules,      setModules]      = useState([]);
  const [permissions,  setPermissions]  = useState({});
  const [kpiConfig,    setKpiConfig]    = useState([]);
  const [chartConfig,  setChartConfig]  = useState([]);
  const [currentUser,  setCurrentUser]  = useState(null); // live from /auth/me
  const [role,         setRole]         = useState(() => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return "admin";
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.role || payload.user_role || "admin";
    } catch { return "admin"; }
  });
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    // Fetch current user profile from backend
    api.get("/api/v1/auth/me")
      .then(res => {
        const u = res.data;
        setCurrentUser(u);
        if (u?.role) setRole(u.role);
      })
      .catch(() => {
        // Fallback: decode from JWT
        try {
          const token = localStorage.getItem("token");
          if (token) {
            const payload = JSON.parse(atob(token.split(".")[1]));
            setCurrentUser({ full_name: payload.name || payload.sub || "Admin", email: payload.email || "", role: payload.role || "admin" });
          }
        } catch {}
      });

    Promise.all([
      API_ENDPOINTS.getAppConfig(),
      API_ENDPOINTS.getModuleConfig(),
      API_ENDPOINTS.getRolePermissions(),
      API_ENDPOINTS.getKpiConfig(),
      API_ENDPOINTS.getChartConfig(),
    ]).then(([app, mods, perms, kpis, charts]) => {
      setAppConfig(app); setModules(mods); setPermissions(perms);
      setKpiConfig(kpis); setChartConfig(charts); setBootstrapped(true);
    });
  }, []);

  const accessibleModules = useMemo(() => {
    const perm = permissions[role];
    if (!perm) return [];
    return modules.filter(m => perm.modules.includes(m.id));
  }, [modules, permissions, role]);

  const can = useMemo(() => permissions[role] || {}, [permissions, role]);

  return (
    <AppCtx.Provider value={{ appConfig, modules, accessibleModules, kpiConfig, chartConfig, role, setRole, can, bootstrapped, currentUser }}>
      {children}
    </AppCtx.Provider>
  );
};

// ═══════════════════════════════════════════════════════════════
// SECTION 3: DESIGN TOKENS — VIVID INDIGO AURORA THEME
// ═══════════════════════════════════════════════════════════════

const T = {
  bg:            "#EEF0FF",
  surface:       "#F8F9FF",
  card:          "#FFFFFF",
  cardHover:     "#F3F4FF",
  border:        "#D8DBF5",
  borderHover:   "#B2B8EC",
  text:          "#16196B",
  textSecondary: "#3B4096",
  textMuted:     "#7B82C8",
  accent:        "#4F46E5",
  accentDim:     "rgba(79,70,229,0.09)",
  accentGlow:    "rgba(79,70,229,0.28)",
  danger:        "#F02D6D",
  dangerDim:     "rgba(240,45,109,0.09)",
  warning:       "#F59E0B",
  warningDim:    "rgba(245,158,11,0.09)",
  success:       "#0BAD7C",
  successDim:    "rgba(11,173,124,0.09)",
  purple:        "#8B5CF6",
  purpleDim:     "rgba(139,92,246,0.09)",
  blue:          "#06B6D4",
  blueDim:       "rgba(6,182,212,0.09)",
  shadow:        "0 1px 4px rgba(79,70,229,0.10), 0 1px 2px rgba(79,70,229,0.06)",
  shadowMd:      "0 4px 20px rgba(79,70,229,0.14)",
  shadowLg:      "0 10px 40px rgba(79,70,229,0.18)",
};

// ═══════════════════════════════════════════════════════════════
// SECTION 3.5: TOAST NOTIFICATION SYSTEM
// ═══════════════════════════════════════════════════════════════

let _toastContainer = null;
let _toastId = 0;

const showToast = (message, type = "info", duration = 4000) => {
  if (!_toastContainer) {
    _toastContainer = document.createElement("div");
    _toastContainer.id = "gymos-toasts";
    Object.assign(_toastContainer.style, {
      position: "fixed", top: "20px", right: "20px", zIndex: "9999",
      display: "flex", flexDirection: "column", gap: "10px", pointerEvents: "none",
    });
    document.body.appendChild(_toastContainer);
  }

  const colors = {
    success: { bg: "#0BAD7C", border: "rgba(11,173,124,0.3)", icon: "✅" },
    error:   { bg: "#F02D6D", border: "rgba(240,45,109,0.3)",  icon: "❌" },
    warning: { bg: "#F59E0B", border: "rgba(245,158,11,0.3)",  icon: "⚠️" },
    info:    { bg: "#4F46E5", border: "rgba(79,70,229,0.3)",   icon: "ℹ️" },
  };
  const c = colors[type] || colors.info;
  const id = ++_toastId;

  const toast = document.createElement("div");
  toast.id = `toast-${id}`;
  Object.assign(toast.style, {
    background: "#fff",
    border: `1.5px solid ${c.border}`,
    borderLeft: `4px solid ${c.bg}`,
    borderRadius: "12px",
    padding: "12px 16px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
    display: "flex", alignItems: "center", gap: "10px",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: "13px", fontWeight: "600",
    color: "#16196B",
    minWidth: "280px", maxWidth: "380px",
    pointerEvents: "all",
    animation: "fadeUp 0.3s ease both",
    transition: "opacity 0.3s ease, transform 0.3s ease",
    cursor: "pointer",
  });

  toast.innerHTML = `
    <span style="font-size:18px;flex-shrink:0">${c.icon}</span>
    <span style="flex:1;line-height:1.4">${message}</span>
    <span style="color:#7B82C8;font-size:18px;line-height:1;cursor:pointer;flex-shrink:0" onclick="this.parentElement.remove()">×</span>
  `;

  toast.onclick = () => toast.remove();
  _toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    setTimeout(() => toast.remove(), 300);
  }, duration);
};

const toast = {
  success: (msg, ms) => showToast(msg, "success", ms),
  error:   (msg, ms) => showToast(msg, "error",   ms),
  warning: (msg, ms) => showToast(msg, "warning", ms),
  info:    (msg, ms) => showToast(msg, "info",    ms),
};

// ═══════════════════════════════════════════════════════════════
// SECTION 4: GLOBAL STYLES
// ═══════════════════════════════════════════════════════════════

const injectStyles = () => {
  if (document.getElementById("gymos-s")) return;
  const s = document.createElement("style");
  s.id = "gymos-s";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html,body{background:${T.bg};color:${T.text};font-family:'Plus Jakarta Sans',sans-serif;height:100%;overflow:hidden}
    ::-webkit-scrollbar{width:5px;height:5px}
    ::-webkit-scrollbar-track{background:${T.bg}}
    ::-webkit-scrollbar-thumb{background:${T.border};border-radius:999px}
    ::-webkit-scrollbar-thumb:hover{background:${T.borderHover}}
    .g-head{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;letter-spacing:-0.03em}
    .g-mono{font-family:'JetBrains Mono',monospace}
    .g-card{
      background:${T.card};
      border:1px solid ${T.border};
      border-radius:16px;
      box-shadow:${T.shadow};
      transition:border-color .2s,box-shadow .2s,transform .2s
    }
    .g-card:hover{border-color:${T.borderHover};box-shadow:${T.shadowMd};transform:translateY(-1px)}
    .nav-item{transition:background .15s,color .15s;cursor:pointer;border-radius:10px;margin:1px 8px}
    .nav-item:hover{background:rgba(79,70,229,0.10)}
    .nav-item.active{background:linear-gradient(135deg,rgba(79,70,229,0.15),rgba(139,92,246,0.12));color:${T.accent}}
    .nav-item.active .nav-icon{color:${T.accent}}
    .btn{transition:all .18s;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;font-weight:600;display:inline-flex;align-items:center;gap:6px;border:none}
    .btn:disabled{opacity:.4;cursor:not-allowed}
    .btn-primary{background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;box-shadow:0 2px 10px rgba(79,70,229,0.30)}
    .btn-primary:hover:not(:disabled){background:linear-gradient(135deg,#4338CA,#6D28D9);box-shadow:0 4px 18px rgba(79,70,229,0.42);transform:translateY(-1px)}
    .btn-ghost{background:rgba(255,255,255,0.8);color:${T.text};border:1.5px solid ${T.border} !important;backdrop-filter:blur(4px)}
    .btn-ghost:hover:not(:disabled){background:#fff;border-color:${T.borderHover} !important}
    .btn-danger{background:rgba(240,45,109,0.09);color:${T.danger};border:1px solid rgba(240,45,109,0.22) !important}
    .btn-danger:hover:not(:disabled){background:rgba(240,45,109,0.16)}
    .btn-success{background:rgba(11,173,124,0.09);color:${T.success};border:1px solid rgba(11,173,124,0.22) !important}
    .btn-success:hover:not(:disabled){background:rgba(11,173,124,0.16)}
    .row-hover{transition:background .12s}
    .row-hover:hover{background:rgba(79,70,229,0.04)}
    .input{
      background:#fff;
      border:1.5px solid ${T.border};
      color:${T.text};
      border-radius:10px;
      padding:10px 14px;
      font-family:'Plus Jakarta Sans',sans-serif;
      font-size:14px;
      width:100%;
      outline:none;
      transition:border-color .15s,box-shadow .15s
    }
    .input:focus{border-color:${T.accent};box-shadow:0 0 0 3px rgba(79,70,229,0.12)}
    .input::placeholder{color:${T.textMuted}}
    select.input{cursor:pointer;appearance:none}
    .pill{padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap}
    .pill-active{background:rgba(11,173,124,0.12);color:${T.success};border:1px solid rgba(11,173,124,0.20)}
    .pill-inactive{background:rgba(240,45,109,0.09);color:${T.danger};border:1px solid rgba(240,45,109,0.18)}
    .pill-archived{background:rgba(123,130,200,0.12);color:${T.textMuted};border:1px solid rgba(123,130,200,0.20)}
    .pill-present{background:rgba(11,173,124,0.12);color:${T.success};border:1px solid rgba(11,173,124,0.20)}
    .pill-absent{background:rgba(240,45,109,0.09);color:${T.danger};border:1px solid rgba(240,45,109,0.18)}
    .pill-in{background:rgba(79,70,229,0.10);color:${T.accent};border:1px solid rgba(79,70,229,0.20)}
    .modal-bg{position:fixed;inset:0;background:rgba(22,25,107,0.40);backdrop-filter:blur(10px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
    @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
    @keyframes gradientShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
    .fade-up{animation:fadeUp .32s cubic-bezier(.22,.68,0,1.2) both}
    .fade-in{animation:fadeIn .25s ease both}
    .spin{animation:spin 1s linear infinite;display:inline-block}
    .shake{animation:shake .5s ease both}
    .s1{animation-delay:.05s}.s2{animation-delay:.10s}.s3{animation-delay:.15s}.s4{animation-delay:.20s}
    @media(max-width:768px){.hide-sm{display:none!important}}
    @media(max-width:1100px){.hide-md{display:none!important}}
  `;
  document.head.appendChild(s);
};

// ═══════════════════════════════════════════════════════════════
// FEES DIALOG — Click on Monthly Fee cell to open tier+exercise calculator
// ═══════════════════════════════════════════════════════════════

// Global live exercises catalog — updated when ExercisePage changes are saved
let _liveCatalog = EXERCISES_CATALOG.map(e => ({ ...e }));
const getLiveCatalog = () => _liveCatalog;
const updateLiveCatalog = (catalog) => { _liveCatalog = catalog; };

const FeesDialog = ({ member, onClose, onSave }) => {
  const [selectedTierId,    setSelectedTierId]    = useState(() => (member.membership_tier_id || "basic").toLowerCase());
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [selectedTrainerId, setSelectedTrainerId] = useState(member.trainer_id || "");
  const [tiers,    setTiers]    = useState(() => TIER_CONFIG.map(t => ({ ...t })));
  const [trainers, setTrainers] = useState([]);
  const [saving,   setSaving]   = useState(false);
  const [activeTab, setActiveTab] = useState("tier"); // "tier" | "exercises" | "trainer"

  const catalog = getLiveCatalog().filter(e => e.status === "active");

  // Load tiers + trainers from API
  useEffect(() => {
    gymService.getTiers().then(res => {
      const apiTiers = res?.data || [];
      if (apiTiers.length) {
        setTiers(apiTiers.map(at => {
          const local = TIER_CONFIG.find(t => t.id === (at.tier_id || at.id)) || {};
          return {
            id:    at.tier_id || at.id || local.id,
            label: at.name    || local.label,
            fee:   Number(at.monthly_fee ?? at.fee ?? local.fee ?? 0),
            color: local.color || "#4F46E5",
            icon:  local.icon  || "🏆",
          };
        }));
      }
    }).catch(() => {});

    gymService.getTrainers().then(res => {
      const rows = res?.data?.items || res?.data || [];
      setTrainers(rows.map(t => ({
        id:             t.id || t.trainer_code,
        full_name:      t.full_name,
        specialization: t.specialization || "—",
        hourly_rate:    Number(t.hourly_rate || 0),
        status:         t.status,
      })).filter(t => t.status !== "archived"));
    }).catch(() => {});
  }, []);

  // Derived values
  const tier     = tiers.find(t => t.id === selectedTierId) || tiers[0];
  const tierEx   = catalog.filter(e => e.tiers.includes(selectedTierId));
  const extraEx  = selectedExercises.filter(id => !tierEx.find(e => e.id === id));
  const extraTotal = extraEx.reduce((s, id) => {
    const ex = catalog.find(e => e.id === id);
    return s + (ex?.price || 0);
  }, 0);
  const trainer     = trainers.find(t => t.id === selectedTrainerId);
  const trainerFee  = trainer ? Number(trainer.hourly_rate || 0) : 0;
  const totalFee    = (tier?.fee || 0) + extraTotal + trainerFee;

  const toggleExercise = (exId) => {
    if (tierEx.find(e => e.id === exId)) return; // already included in tier — cannot toggle
    setSelectedExercises(prev =>
      prev.includes(exId) ? prev.filter(id => id !== exId) : [...prev, exId]
    );
  };

  // ── Save to DB ───────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        membership_tier_id: selectedTierId,
        monthly_fee:        totalFee,
        // Always send trainer_id — even null (to remove an assigned trainer)
        trainer_id: selectedTrainerId || null,
      };

      await gymService.updateMember(member.id, payload);

      // Persist fee override locally so it survives page reload
      _setFeeOverride(member.id, totalFee);

      onSave({
        ...member,
        membership_tier_id: selectedTierId,
        monthly_fee:        totalFee,
        trainer_id:         selectedTrainerId || null,
      });
      toast.success(`Rs.${totalFee.toLocaleString()} fees saved for ${member.full_name}`);
      onClose();
    } catch (err) {
      toast.error("Save failed: " + (err?.response?.data?.detail || err?.message || "Unknown error"));
    } finally { setSaving(false); }
  };

  // Group exercises by category
  const byCategory = catalog.reduce((acc, e) => {
    if (!acc[e.category]) acc[e.category] = [];
    acc[e.category].push(e);
    return acc;
  }, {});

  const tabs = [
    { id: "tier",      label: "🏆 Tier" },
    { id: "exercises", label: "◎ Exercises" },
    { id: "trainer",   label: "◆ Trainer" },
  ];

  return (
    <div className="modal-bg fade-in" style={{ zIndex: 2000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="g-card fade-up" style={{ width: "100%", maxWidth: 740, maxHeight: "93vh", overflowY: "auto", padding: 0 }}>

        {/* ── Header ─────────────────────────────────────────── */}
        <div style={{ padding: "24px 28px 0", borderBottom: `1.5px solid ${T.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h2 className="g-head" style={{ fontSize: 22, color: T.text }}>💰 Fee Calculator</h2>
              <p style={{ fontSize: 13, color: T.textMuted, marginTop: 3 }}>
                {member.full_name}
                <span className="g-mono" style={{ marginLeft: 8, fontSize: 12, color: T.accent,
                  background: T.accentDim, padding: "1px 8px", borderRadius: 5 }}>
                  {displayCode(member)}
                </span>
              </p>
            </div>
            <button onClick={onClose} style={{ background: T.bg, border: `1px solid ${T.border}`,
              color: T.textMuted, fontSize: 18, cursor: "pointer", width: 32, height: 32,
              borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4 }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                padding: "8px 18px", borderRadius: "8px 8px 0 0", cursor: "pointer",
                fontWeight: 700, fontSize: 13, fontFamily: "inherit", transition: "all .15s",
                border: `1.5px solid ${activeTab === tab.id ? T.border : "transparent"}`,
                borderBottom: activeTab === tab.id ? `1.5px solid ${T.card}` : "transparent",
                background: activeTab === tab.id ? T.card : "transparent",
                color: activeTab === tab.id ? T.accent : T.textMuted,
                marginBottom: activeTab === tab.id ? -1 : 0,
              }}>{tab.label}</button>
            ))}
          </div>
        </div>

        {/* ── Tab Content ────────────────────────────────────── */}
        <div style={{ padding: "24px 28px" }}>

          {/* TAB 1: Tier */}
          {activeTab === "tier" && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.08em", color: T.textMuted, marginBottom: 14 }}>
                Select Membership Plan
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                {tiers.map(t => (
                  <div key={t.id} onClick={() => { setSelectedTierId(t.id); setSelectedExercises([]); }}
                    style={{ padding: "18px 16px", borderRadius: 14, cursor: "pointer", transition: "all .15s",
                      border: `2px solid ${selectedTierId === t.id ? t.color : T.border}`,
                      background: selectedTierId === t.id ? `${t.color}10` : T.card, textAlign: "center",
                      boxShadow: selectedTierId === t.id ? `0 4px 16px ${t.color}22` : "none" }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>{t.icon}</div>
                    <div style={{ fontWeight: 800, color: selectedTierId === t.id ? t.color : T.text, fontSize: 14 }}>{t.label}</div>
                    <div className="g-mono" style={{ fontSize: 13, fontWeight: 700,
                      color: selectedTierId === t.id ? t.color : T.textMuted, marginTop: 4 }}>
                      Rs.{t.fee.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>
                      {catalog.filter(e => e.tiers.includes(t.id)).length} exercises
                    </div>
                    {selectedTierId === t.id && (
                      <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: t.color }}>✓ Selected</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: Exercises */}
          {activeTab === "exercises" && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.08em", color: T.textMuted, marginBottom: 14 }}>
                {tier?.label} plan includes {tierEx.length} exercises — you may add more
              </div>
              {Object.entries(byCategory).map(([cat, exs]) => {
                const catColor = CATEGORY_COLORS[cat] || T.accent;
                const inTier = exs.filter(e => e.tiers.includes(selectedTierId));
                const notInTier = exs.filter(e => !e.tiers.includes(selectedTierId));
                return (
                  <div key={cat} style={{ marginBottom: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: catColor,
                        padding: "3px 12px", borderRadius: 20, background: `${catColor}10`,
                        border: `1px solid ${catColor}30` }}>{cat.toUpperCase()}</span>
                      <div style={{ flex: 1, height: 1, background: T.border }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 7 }}>
                      {inTier.map(ex => (
                        <div key={ex.id} style={{ padding: "10px 14px", borderRadius: 10,
                          border: `1.5px solid ${catColor}44`, background: `${catColor}06`,
                          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{ex.name}</div>
                            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>{ex.duration} min · {ex.calories} cal</div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: catColor,
                            padding: "2px 8px", borderRadius: 20, background: `${catColor}15`, whiteSpace: "nowrap" }}>
                            ✓ Included
                          </span>
                        </div>
                      ))}
                      {notInTier.map(ex => {
                        const checked = selectedExercises.includes(ex.id);
                        return (
                          <div key={ex.id} onClick={() => toggleExercise(ex.id)}
                            style={{ padding: "10px 14px", borderRadius: 10, cursor: "pointer", transition: "all .15s",
                              border: `1.5px solid ${checked ? catColor : T.border}`,
                              background: checked ? `${catColor}08` : "transparent",
                              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: checked ? T.text : T.textMuted }}>{ex.name}</div>
                              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>{ex.duration} min</div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                              <div className="g-mono" style={{ fontSize: 11, fontWeight: 700, color: checked ? catColor : T.textMuted }}>
                                +Rs.{ex.price}
                              </div>
                              <div style={{ fontSize: 10, color: checked ? catColor : T.textMuted, marginTop: 1 }}>
                                {checked ? "✓ Added" : "+ Add"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: Trainer */}
          {activeTab === "trainer" && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.08em", color: T.textMuted, marginBottom: 14 }}>
                Personal Trainer Assign Karein (Optional)
              </div>

              {/* No trainer option */}
              <div onClick={() => setSelectedTrainerId("")}
                style={{ padding: "14px 18px", borderRadius: 12, cursor: "pointer", transition: "all .15s",
                  border: `2px solid ${selectedTrainerId === "" ? T.textMuted : T.border}`,
                  background: selectedTrainerId === "" ? T.bg : T.card,
                  display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: T.bg,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                  border: `2px solid ${T.border}`, flexShrink: 0 }}>✕</div>
                <div>
                  <div style={{ fontWeight: 700, color: selectedTrainerId === "" ? T.text : T.textMuted }}>No Trainer</div>
                  <div style={{ fontSize: 12, color: T.textMuted }}>No personal trainer required</div>
                </div>
                {selectedTrainerId === "" && (
                  <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: T.textMuted }}>✓ Selected</span>
                )}
              </div>

              {trainers.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: T.textMuted, fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>◆</div>
                  No trainers available — please add one in the Trainers section first
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {trainers.map(t => {
                    const selected = selectedTrainerId === t.id;
                    const specColor = { Strength: T.purple, Cardio: T.blue, Yoga: T.success,
                      CrossFit: T.accent, Boxing: T.danger, Swimming: T.blue }[t.specialization] || T.accent;
                    return (
                      <div key={t.id} onClick={() => setSelectedTrainerId(selected ? "" : t.id)}
                        style={{ padding: "14px 18px", borderRadius: 12, cursor: "pointer", transition: "all .15s",
                          border: `2px solid ${selected ? specColor : T.border}`,
                          background: selected ? `${specColor}08` : T.card,
                          display: "flex", alignItems: "center", gap: 14 }}>
                        {/* Avatar */}
                        <div style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
                          background: `${specColor}18`, display: "flex", alignItems: "center",
                          justifyContent: "center", fontWeight: 800, fontSize: 15, color: specColor,
                          border: `2px solid ${specColor}30` }}>
                          {(t.full_name || "?")[0]}
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: selected ? T.text : T.text }}>
                            {t.full_name}
                          </div>
                          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
                            <span style={{ color: specColor, fontWeight: 600 }}>{t.specialization}</span>
                          </div>
                        </div>
                        {/* Rate */}
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div className="g-mono" style={{ fontSize: 13, fontWeight: 800,
                            color: selected ? specColor : T.textSecondary }}>
                            +Rs.{t.hourly_rate.toLocaleString()}
                          </div>
                          <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>monthly</div>
                        </div>
                        {selected && (
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: specColor,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, color: "#fff", fontWeight: 800, flexShrink: 0 }}>✓</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Fee Summary (always visible) ──────────────────── */}
        <div style={{ margin: "0 28px 20px", background: T.bg, borderRadius: 14,
          padding: "16px 20px", border: `1.5px solid ${T.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 12, color: T.textMuted, letterSpacing: "0.08em",
            textTransform: "uppercase", marginBottom: 12 }}>Fee Breakdown</div>

          {/* Tier fee */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: T.textSecondary, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: tier?.color }}>{tier?.icon}</span> {tier?.label} Plan
            </span>
            <span className="g-mono" style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
              Rs.{(tier?.fee || 0).toLocaleString()}
            </span>
          </div>

          {/* Extra exercises */}
          {extraEx.map(id => {
            const ex = catalog.find(e => e.id === id);
            return ex ? (
              <div key={id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: T.textMuted }}>+ {ex.name}</span>
                <span className="g-mono" style={{ fontSize: 12, color: T.textSecondary }}>
                  Rs.{ex.price.toLocaleString()}
                </span>
              </div>
            ) : null;
          })}

          {/* Trainer fee */}
          {trainer && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 12, color: T.textMuted }}>◆ Trainer: {trainer.full_name}</span>
              <span className="g-mono" style={{ fontSize: 12, color: T.purple }}>
                Rs.{trainerFee.toLocaleString()}
              </span>
            </div>
          )}

          {/* Total */}
          <div style={{ borderTop: `1.5px solid ${T.border}`, marginTop: 10, paddingTop: 10,
            display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="g-head" style={{ fontSize: 16, color: T.text }}>Total Monthly Fee</span>
            <span className="g-head g-mono" style={{ fontSize: 22, color: T.accent }}>
              Rs.{totalFee.toLocaleString()}
            </span>
          </div>
        </div>

        {/* ── Actions ───────────────────────────────────────── */}
        <div style={{ padding: "0 28px 24px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving} icon="✓">
            {saving ? "Saving…" : `Save — Rs.${totalFee.toLocaleString()}`}
          </Btn>
        </div>
      </div>
    </div>
  );
};



const Spinner = ({ size = 20 }) => (
  <div className="spin" style={{ width: size, height: size, borderRadius: "50%",
    border: `2.5px solid ${T.border}`, borderTopColor: T.accent }} />
);

const LoadingOverlay = ({ label = "Loading..." }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", padding: 60, gap: 14 }}>
    <Spinner size={32} />
    <span style={{ color: T.textMuted, fontSize: 14, fontWeight: 500 }}>{label}</span>
  </div>
);

const StatusPill = ({ status }) => (
  <span className={`pill pill-${status}`}>{status}</span>
);

const Btn = ({ children, onClick, variant = "primary", size = "md", disabled, style, icon }) => (
  <button className={`btn btn-${variant}`} onClick={onClick} disabled={disabled}
    style={{ borderRadius: 10, padding: size === "sm" ? "6px 14px" : "10px 20px",
      fontSize: size === "sm" ? 13 : 14, ...style }}>
    {icon && <span style={{ fontSize: 15 }}>{icon}</span>}
    {children}
  </button>
);

const Card = ({ children, style, className = "" }) => (
  <div className={`g-card ${className}`} style={{ padding: 24, ...style }}>{children}</div>
);

const SectionLabel = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
    color: T.textMuted, marginBottom: 6 }}>{children}</div>
);

const CellRenderer = ({ field, value }) => {
  const categoryColors = {
    Cardio:      { bg: "rgba(6,182,212,0.10)",    color: "#06B6D4"  },
    Strength:    { bg: "rgba(139,92,246,0.10)",   color: "#8B5CF6"  },
    Flexibility: { bg: "rgba(11,173,124,0.10)",   color: "#0BAD7C"  },
    Balance:     { bg: "rgba(245,158,11,0.10)",   color: "#F59E0B"  },
    HIIT:        { bg: "rgba(240,45,109,0.10)",   color: "#F02D6D"  },
  };
  const renderType = field.cellType || field.type;
  switch (renderType) {
    case "id_badge": {
      const numOnly = (() => { const r = String(value || ""); const s = r.replace(/^[A-Za-z_-]+/g, "").replace(/^0+/, ""); return s || r; })();
      return (
        <span className="g-mono" style={{
          fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 6,
          background: T.accentDim, color: T.accent,
          border: "1px solid rgba(79,70,229,0.22)", letterSpacing: "0.04em",
        }}>{numOnly}</span>
      );
    }
    case "category_badge": {
      const c = categoryColors[value] || { bg: T.bg, color: T.textMuted };
      return (
        <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
          background: c.bg, color: c.color, border: `1px solid ${c.color}30` }}>{value}</span>
      );
    }
    case "fees_dialog":
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
          padding: "4px 12px", borderRadius: 8, transition: "all .15s",
          background: Number(value) > 0 ? T.accentDim : T.warningDim,
          border: `1px solid ${Number(value) > 0 ? "rgba(79,70,229,0.25)" : "rgba(245,158,11,0.3)"}`,
          color: Number(value) > 0 ? T.accent : T.warning, fontWeight: 700, fontSize: 13 }}>
          <span className="g-mono">{Number(value) > 0 ? `Rs.${Number(value).toLocaleString()}` : "Set Fees"}</span>
          <span style={{ fontSize: 10, opacity: 0.7 }}>✎</span>
        </span>
      );
    case "status":   return <StatusPill status={value} />;
    case "currency": return <span className="g-mono" style={{ color: T.accent, fontWeight: 600 }}>{Number(value).toLocaleString()}</span>;
    case "date":     return <span style={{ color: T.textSecondary, fontSize: 13 }}>{value ? new Date(value).toLocaleDateString() : "—"}</span>;
    case "number":   return <span className="g-mono">{Number(value).toLocaleString()}</span>;
    default:         return <span style={{ color: T.text }}>{value}</span>;
  }
};

// ═══════════════════════════════════════════════════════════════
// SECTION 6: DYNAMIC TABLE
// ═══════════════════════════════════════════════════════════════

const PAGE_SIZE = 6;

const DynamicTable = ({ schema, data = [], canEdit, canDelete, onEdit, onDelete, onUpdateRow }) => {
  const [search, setSearch]           = useState("");
  const [filterField, setFilterField] = useState("all");
  const [filterValue, setFilterValue] = useState("");
  const [sortKey, setSortKey]         = useState(null);
  const [sortDir, setSortDir]         = useState("asc");
  const [page, setPage]               = useState(0);
  const [feesDialog, setFeesDialog]   = useState(null); // row for FeesDialog

  const visibleFields    = schema.fields.filter(f => !f.hidden);
  const filterableFields = schema.fields.filter(f => f.filterable);

  const filtered = useMemo(() => {
    let d = [...data];
    if (search) { const q = search.toLowerCase(); d = d.filter(row => Object.values(row).some(v => String(v).toLowerCase().includes(q))); }
    if (filterField !== "all" && filterValue) { d = d.filter(row => String(row[filterField]).toLowerCase() === filterValue.toLowerCase()); }
    if (sortKey) { d.sort((a, b) => { const va = a[sortKey], vb = b[sortKey]; const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb)); return sortDir === "asc" ? cmp : -cmp; }); }
    return d;
  }, [data, search, filterField, filterValue, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged      = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const handleSort = key => { if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir("asc"); } setPage(0); };
  const activeFilterField = filterableFields.find(f => f.key === filterField);

  return (
    <div>
      {feesDialog && (
        <FeesDialog
          member={feesDialog}
          onClose={() => setFeesDialog(null)}
          onSave={(updated) => { onUpdateRow && onUpdateRow(updated); setFeesDialog(null); }}
        />
      )}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.textMuted, fontSize: 16 }}>⌕</span>
          <input className="input" style={{ paddingLeft: 36 }} placeholder="Search records…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        </div>
        {filterableFields.length > 0 && (
          <select className="input" style={{ width: "auto", minWidth: 140 }}
            value={filterField} onChange={e => { setFilterField(e.target.value); setFilterValue(""); setPage(0); }}>
            <option value="all">Filter: All</option>
            {filterableFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        )}
        {filterField !== "all" && activeFilterField?.options && (
          <select className="input" style={{ width: "auto", minWidth: 130 }}
            value={filterValue} onChange={e => { setFilterValue(e.target.value); setPage(0); }}>
            <option value="">All {activeFilterField.label}</option>
            {activeFilterField.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <span style={{ fontSize: 13, color: T.textMuted, whiteSpace: "nowrap" }}>{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${T.border}`, background: "rgba(79,70,229,0.03)" }}>
              <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.08em", color: T.textMuted, whiteSpace: "nowrap", width: 44 }}>#</th>
              {visibleFields.map(f => (
                <th key={f.key} onClick={f.sortable ? () => handleSort(f.key) : undefined}
                  style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.08em", userSelect: "none",
                    cursor: f.sortable ? "pointer" : "default",
                    color: sortKey === f.key ? T.accent : T.textMuted, whiteSpace: "nowrap" }}>
                  {f.label} {f.sortable && (sortKey === f.key ? (sortDir === "asc" ? "↑" : "↓") : <span style={{ opacity: .3 }}>↕</span>)}
                </th>
              ))}
              {(canEdit || canDelete) && (
                <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={visibleFields.length + 2} style={{ padding: 48, textAlign: "center", color: T.textMuted }}>No records found</td></tr>
            ) : paged.map((row, i) => (
              <tr key={row.id || i} className="row-hover"
                style={{ borderBottom: `1px solid ${T.border}`, opacity: row.status === "archived" ? 0.4 : 1 }}>
                <td style={{ padding: "12px 14px", fontSize: 12, color: T.textMuted, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                  {page * PAGE_SIZE + i + 1}
                </td>
                {visibleFields.map(f => (
                  <td key={f.key}
                    onClick={f.type === "fees_dialog" ? () => setFeesDialog(row) : undefined}
                    style={{ padding: "12px 14px", fontSize: 14, cursor: f.type === "fees_dialog" ? "pointer" : "default" }}>
                    <CellRenderer field={f} value={row[f.key]} />
                  </td>
                ))}
                {(canEdit || canDelete) && (
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      {canEdit   && <Btn size="sm" variant="ghost"  onClick={() => onEdit(row)}   icon="✎">Edit</Btn>}
                      {canDelete && <Btn size="sm" variant="danger" onClick={() => onDelete(row)} icon="⊗">Archive</Btn>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 16 }}>
          <Btn size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</Btn>
          {Array.from({ length: totalPages }, (_, i) => (
            <button key={i} onClick={() => setPage(i)} style={{
              width: 32, height: 32, borderRadius: 8, cursor: "pointer",
              border: `1.5px solid ${page === i ? T.accent : T.border}`,
              background: page === i ? T.accentDim : "transparent",
              color: page === i ? T.accent : T.textSecondary,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600,
            }}>{i + 1}</button>
          ))}
          <Btn size="sm" variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next →</Btn>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SECTION 7: DYNAMIC FORM
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// ADD MEMBER MODAL — Two-column: Left=Fees setup, Right=Member details
// ═══════════════════════════════════════════════════════════════

const REGISTRATION_FEE_DEFAULT = 1000;

const AddMemberModal = ({ onClose, onSave }) => {
  const today = new Date().toISOString().slice(0, 10);

  // ── Right: Member details ────────────────────────────────────
  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", cnic: "", join_date: today,
  });
  const [errors, setErrors] = useState({});

  // ── Left: Fees setup ─────────────────────────────────────────
  const [tiers,             setTiers]             = useState(() => TIER_CONFIG.map(t => ({ ...t })));
  const [trainers,          setTrainers]          = useState([]);
  const [selectedTierId,    setSelectedTierId]    = useState("basic");
  const [selectedTrainerId, setSelectedTrainerId] = useState("");
  const [selectedExercises, setSelectedExercises] = useState([]); // extra exercises beyond tier
  const [registrationFee,   setRegistrationFee]   = useState(REGISTRATION_FEE_DEFAULT);
  // regFeeEnabled removed — registration fee is always one-time at member creation
  const [saving,            setSaving]            = useState(false);
  const [activeTab,         setActiveTab]         = useState("tier"); // "tier"|"exercises"|"trainer"

  const catalog = getLiveCatalog().filter(e => e.status === "active");
  const toggleExercise = (exId) => {
    const tier = tiers.find(t => t.id === selectedTierId);
    const tierExIds = EXERCISES_CATALOG.filter(e => e.tiers.includes(selectedTierId)).map(e => e.id);
    if (tierExIds.includes(exId)) return; // already included in tier
    setSelectedExercises(prev => prev.includes(exId) ? prev.filter(i => i !== exId) : [...prev, exId]);
  };

  useEffect(() => {
    gymService.getTiers().then(res => {
      const apiTiers = res?.data || [];
      if (apiTiers.length) {
        setTiers(apiTiers.map(at => {
          const local = TIER_CONFIG.find(t => t.id === (at.tier_id || at.id)) || {};
          return {
            id: at.tier_id || at.id || local.id,
            label: at.name || local.label,
            fee: Number(at.monthly_fee ?? at.fee ?? local.fee ?? 0),
            color: local.color || "#4F46E5",
            icon: local.icon || "🏆",
            description: local.description || "",
            features: local.features || [],
          };
        }));
      }
    }).catch(() => {});

    gymService.getTrainers().then(res => {
      const rows = res?.data?.items || res?.data || [];
      setTrainers(rows.map(t => ({
        id: t.id || t.trainer_code,
        full_name: t.full_name,
        specialization: t.specialization || "—",
        hourly_rate: Number(t.hourly_rate || 0),
        status: t.status,
      })).filter(t => t.status !== "archived"));
    }).catch(() => {});
  }, []);

  const selectedTier    = tiers.find(t => t.id === selectedTierId) || tiers[0];
  const selectedTrainer = trainers.find(t => t.id === selectedTrainerId) || null;
  const trainerFee      = selectedTrainer ? Number(selectedTrainer.hourly_rate || 0) : 0;
  const regFee          = Number(registrationFee || 0); // always one-time at registration
  // tierFee = sum of exercises in this tier (dynamic from EXERCISES_CATALOG)
  const tierFee         = getTierFee(selectedTierId);
  const tierExIds       = EXERCISES_CATALOG.filter(e => e.tiers.includes(selectedTierId)).map(e => e.id);
  const extraExTotal    = selectedExercises.filter(id => !tierExIds.includes(id)).reduce((s, id) => {
    const ex = catalog.find(e => e.id === id); return s + (ex?.price || 0);
  }, 0);
  const monthlyFee      = tierFee + trainerFee + extraExTotal;
  const totalFirstMonth = monthlyFee + regFee;

  const setF = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: null }));
  };

  const validate = () => {
    const errs = {};
    if (!form.full_name.trim()) errs.full_name = "Name required";
    if (!form.email.trim())     errs.email     = "Email required";
    if (!form.join_date)        errs.join_date = "Join date required";
    if (form.cnic && !/^\d{5}-\d{7}-\d$/.test(form.cnic) && form.cnic.replace(/\D/g,"").length > 0)
      errs.cnic = "Format: 12345-1234567-1";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        full_name:          form.full_name.trim(),
        email:              form.email.trim(),
        phone:              form.phone.trim() || undefined,
        cnic:               form.cnic.trim()  || undefined,
        join_date:          form.join_date,
        membership_tier_id: selectedTierId,
        monthly_fee:        monthlyFee,
        registration_fee:   regFee || undefined,
        trainer_id:         selectedTrainerId || undefined,
      };

      const res = await gymService.createMember(payload);
      const d   = res?.data;
      let newRow = d || {};
      if (!newRow.id) {
        const codeKey = Object.keys(newRow).find(k => k.endsWith("_code") && newRow[k]);
        if (codeKey) newRow.id = newRow[codeKey];
      }
      if (!newRow.id) newRow.id = "local-" + Date.now();

      // Merge computed fields for display
      newRow = {
        ...newRow,
        membership_tier_id: selectedTierId,
        monthly_fee:        monthlyFee,
        trainer_id:         selectedTrainerId || null,
        cnic:               form.cnic || null,
      };

      // Mark registration fee as paid for this member — won't be charged again
      if (regFee > 0 && newRow.id) _markRegPaid(newRow.id);

      const regMsg = regFee > 0 ? ` · Rs.${regFee.toLocaleString()} reg fee charged` : "";
      toast.success(`✅ ${form.full_name} added! Rs.${monthlyFee.toLocaleString()}/month${regMsg}`);
      onSave(newRow);
      onClose();
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || "Unknown error";
      toast.error("Save failed: " + (typeof detail === "string" ? detail : JSON.stringify(detail)));
    } finally { setSaving(false); }
  };

  const inputStyle = (key) => ({
    borderColor: errors[key] ? T.danger : undefined,
  });

  const specColor = (spec) => ({
    Strength: T.purple, Cardio: T.blue, Yoga: T.success,
    CrossFit: T.accent, Boxing: T.danger, Swimming: T.blue,
  }[spec] || T.accent);

  return (
    <div className="modal-bg fade-in" style={{ zIndex: 2000, alignItems: "flex-start", paddingTop: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="g-card fade-up" style={{ width: "100%", maxWidth: 1000, maxHeight: "94vh",
        overflowY: "auto", padding: 0, display: "flex", flexDirection: "column" }}>

        {/* ── Header ──────────────────────────────────────────── */}
        <div style={{ padding: "20px 28px", borderBottom: `1.5px solid ${T.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 className="g-head" style={{ fontSize: 22, color: T.text }}>➕ Add New Member</h2>
            <p style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>
              Member details + initial fees setup
            </p>
          </div>
          <button onClick={onClose} style={{ background: T.bg, border: `1px solid ${T.border}`,
            color: T.textMuted, fontSize: 18, cursor: "pointer", width: 32, height: 32,
            borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>

        {/* ── Two Column Body ──────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", flex: 1, minHeight: 0 }}>

          {/* ══ LEFT: Fees Setup ════════════════════════════════ */}
          <div style={{ padding: "24px 24px", borderRight: `1.5px solid ${T.border}`,
            overflowY: "auto", display: "flex", flexDirection: "column", gap: 0 }}>

            <div style={{ fontSize: 11, fontWeight: 800, color: T.accent, letterSpacing: "0.12em",
              textTransform: "uppercase", marginBottom: 16 }}>💰 Fees Setup</div>

            {/* Tabs: Tier | Exercises | Trainer */}
            <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
              {[{ id: "tier", label: "🏆 Tier" }, { id: "exercises", label: "◎ Exercises" }, { id: "trainer", label: "◆ Trainer" }].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                  padding: "7px 16px", borderRadius: "8px 8px 0 0", cursor: "pointer",
                  fontWeight: 700, fontSize: 12, fontFamily: "inherit", transition: "all .15s",
                  border: `1.5px solid ${activeTab === tab.id ? T.border : "transparent"}`,
                  borderBottom: activeTab === tab.id ? `1.5px solid ${T.card}` : "transparent",
                  background: activeTab === tab.id ? T.card : "transparent",
                  color: activeTab === tab.id ? T.accent : T.textMuted,
                  marginBottom: activeTab === tab.id ? -1 : 0,
                }}>{tab.label}</button>
              ))}
            </div>

            {/* Tab: Tier */}
            {activeTab === "tier" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }}>
                {tiers.map(t => (
                  <div key={t.id} onClick={() => { setSelectedTierId(t.id); setSelectedExercises([]); }}
                    style={{ padding: "14px 12px", borderRadius: 12, cursor: "pointer",
                      transition: "all .15s", textAlign: "center",
                      border: `2px solid ${selectedTierId === t.id ? t.color : T.border}`,
                      background: selectedTierId === t.id ? `${t.color}10` : T.card,
                      boxShadow: selectedTierId === t.id ? `0 4px 14px ${t.color}20` : "none" }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>{t.icon}</div>
                    <div style={{ fontWeight: 800, fontSize: 13, color: selectedTierId === t.id ? t.color : T.text }}>{t.label}</div>
                    <div className="g-mono" style={{ fontSize: 13, fontWeight: 700,
                      color: selectedTierId === t.id ? t.color : T.textMuted, marginTop: 3 }}>
                      Rs.{t.fee.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: T.textMuted, marginTop: 3 }}>{t.description}</div>
                    {selectedTierId === t.id && (
                      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: t.color }}>✓ Selected</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Tab: Exercises */}
            {activeTab === "exercises" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Add extra exercises to the {selectedTier?.label} plan
                </div>
                {(() => {
                  const byCategory = catalog.reduce((acc, e) => { if (!acc[e.category]) acc[e.category] = []; acc[e.category].push(e); return acc; }, {});
                  return Object.entries(byCategory).map(([cat, exs]) => {
                    const catColor = CATEGORY_COLORS[cat] || T.accent;
                    const inTier   = exs.filter(e => e.tiers.includes(selectedTierId));
                    const notInTier = exs.filter(e => !e.tiers.includes(selectedTierId));
                    return (
                      <div key={cat}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: catColor, padding: "2px 10px",
                            borderRadius: 20, background: `${catColor}10`, border: `1px solid ${catColor}30` }}>{cat.toUpperCase()}</span>
                          <div style={{ flex: 1, height: 1, background: T.border }} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          {inTier.map(ex => (
                            <div key={ex.id} style={{ padding: "8px 11px", borderRadius: 9,
                              border: `1.5px solid ${catColor}44`, background: `${catColor}06`,
                              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{ex.name}</div>
                                <div style={{ fontSize: 10, color: T.textMuted }}>{ex.duration} min</div>
                              </div>
                              <span style={{ fontSize: 10, fontWeight: 700, color: catColor,
                                padding: "2px 7px", borderRadius: 20, background: `${catColor}15`, whiteSpace: "nowrap" }}>✓ Included</span>
                            </div>
                          ))}
                          {notInTier.map(ex => {
                            const checked = selectedExercises.includes(ex.id);
                            return (
                              <div key={ex.id} onClick={() => toggleExercise(ex.id)}
                                style={{ padding: "8px 11px", borderRadius: 9, cursor: "pointer", transition: "all .15s",
                                  border: `1.5px solid ${checked ? catColor : T.border}`,
                                  background: checked ? `${catColor}08` : "transparent",
                                  display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: checked ? T.text : T.textMuted }}>{ex.name}</div>
                                  <div style={{ fontSize: 10, color: T.textMuted }}>{ex.duration} min</div>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 6 }}>
                                  <div className="g-mono" style={{ fontSize: 10, fontWeight: 700, color: checked ? catColor : T.textMuted }}>
                                    +Rs.{ex.price}
                                  </div>
                                  <div style={{ fontSize: 9, color: checked ? catColor : T.textMuted, marginTop: 1 }}>
                                    {checked ? "✓ Added" : "+ Add"}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* Tab: Trainer */}
            {activeTab === "trainer" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* No trainer */}
                <div onClick={() => setSelectedTrainerId("")}
                  style={{ padding: "11px 14px", borderRadius: 10, cursor: "pointer",
                    border: `2px solid ${!selectedTrainerId ? T.textMuted : T.border}`,
                    background: !selectedTrainerId ? T.bg : T.card,
                    display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: T.bg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, border: `2px solid ${T.border}`, flexShrink: 0 }}>✕</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: !selectedTrainerId ? T.text : T.textMuted }}>No Trainer</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>Register without assigning a trainer</div>
                  </div>
                  {!selectedTrainerId && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: T.textMuted }}>✓</span>}
                </div>

                {trainers.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px", color: T.textMuted, fontSize: 12 }}>
                    No trainers available — please add one in the Trainers section first
                  </div>
                ) : trainers.map(t => {
                  const sc = specColor(t.specialization);
                  const sel = selectedTrainerId === t.id;
                  return (
                    <div key={t.id} onClick={() => setSelectedTrainerId(sel ? "" : t.id)}
                      style={{ padding: "11px 14px", borderRadius: 10, cursor: "pointer",
                        border: `2px solid ${sel ? sc : T.border}`,
                        background: sel ? `${sc}08` : T.card,
                        display: "flex", alignItems: "center", gap: 12, transition: "all .15s" }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                        background: `${sc}18`, display: "flex", alignItems: "center",
                        justifyContent: "center", fontWeight: 800, fontSize: 14, color: sc,
                        border: `2px solid ${sc}30` }}>
                        {(t.full_name || "?")[0]}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{t.full_name}</div>
                        <div style={{ fontSize: 11, color: sc, fontWeight: 600 }}>{t.specialization}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div className="g-mono" style={{ fontSize: 12, fontWeight: 800, color: sel ? sc : T.textMuted }}>
                          +Rs.{t.hourly_rate.toLocaleString()}
                        </div>
                        <div style={{ fontSize: 10, color: T.textMuted }}>monthly</div>
                      </div>
                      {sel && <div style={{ width: 20, height: 20, borderRadius: "50%", background: sc,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, color: "#fff", fontWeight: 800, flexShrink: 0 }}>✓</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Registration Fee — ONE-TIME, always charged at first registration ── */}
            <div style={{ marginTop: 20, padding: "14px 16px", borderRadius: 12,
              border: `1.5px solid ${T.warning}55`,
              background: `rgba(245,158,11,0.06)` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🎫</span>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: T.text }}>Registration Fee</span>
                      <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 20,
                        background: T.warningDim, color: T.warning, border: `1px solid ${T.warning}44`,
                        letterSpacing: "0.06em", textTransform: "uppercase" }}>ONE-TIME</span>
                    </div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                      One-time only — will not appear in the monthly bill
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 600, flexShrink: 0 }}>Rs.</span>
                <input type="number" className="input" value={registrationFee}
                  onChange={e => setRegistrationFee(Number(e.target.value) || 0)}
                  style={{ flex: 1, height: 36, fontSize: 14, fontWeight: 700 }}
                  min={0} placeholder="0" />
                <span style={{ fontSize: 11, color: T.textMuted, flexShrink: 0 }}>0 = waive off</span>
              </div>
            </div>

            {/* ── Fee Summary ───────────────────────────────────── */}
            <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: 12,
              background: T.bg, border: `1.5px solid ${T.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.textMuted,
                letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Fee Summary</div>

              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: T.textSecondary, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ color: selectedTier?.color }}>{selectedTier?.icon}</span> {selectedTier?.label} Plan
                </span>
                <span className="g-mono" style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Rs.{tierFee.toLocaleString()}</span>
              </div>

              {selectedTrainer && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: T.textMuted }}>◆ {selectedTrainer.full_name}</span>
                  <span className="g-mono" style={{ fontSize: 12, color: T.purple }}>+Rs.{trainerFee.toLocaleString()}</span>
                </div>
              )}

              {extraExTotal > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: T.textMuted }}>◎ Extra exercises ({selectedExercises.filter(id => !tierExIds.includes(id)).length})</span>
                  <span className="g-mono" style={{ fontSize: 12, color: T.blue }}>+Rs.{extraExTotal.toLocaleString()}</span>
                </div>
              )}

              {regFee > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: T.textMuted }}>🎫 Registration Fee</span>
                  <span className="g-mono" style={{ fontSize: 12, color: T.warning }}>+Rs.{regFee.toLocaleString()}</span>
                </div>
              )}

              <div style={{ borderTop: `1.5px solid ${T.border}`, marginTop: 8, paddingTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: T.textMuted }}>Monthly Fee</span>
                  <span className="g-mono" style={{ fontSize: 14, fontWeight: 800, color: T.accent }}>Rs.{monthlyFee.toLocaleString()}</span>
                </div>
                {regFee > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: T.warning, fontWeight: 600 }}>First Month Total</span>
                    <span className="g-mono" style={{ fontSize: 15, fontWeight: 800, color: T.warning }}>Rs.{totalFirstMonth.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ══ RIGHT: Member Details ════════════════════════════ */}
          <div style={{ padding: "24px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>

            <div style={{ fontSize: 11, fontWeight: 800, color: T.accent, letterSpacing: "0.12em",
              textTransform: "uppercase", marginBottom: 4 }}>👤 Member Details</div>

            {/* Full Name */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.08em", color: errors.full_name ? T.danger : T.textMuted,
                display: "block", marginBottom: 6 }}>Full Name <span style={{ color: T.danger }}>*</span></label>
              <input className="input" type="text" value={form.full_name}
                onChange={e => setF("full_name", e.target.value)}
                placeholder="e.g. Ahmed Ali"
                style={inputStyle("full_name")} />
              {errors.full_name && <span style={{ fontSize: 11, color: T.danger, marginTop: 3, display: "block" }}>{errors.full_name}</span>}
            </div>

            {/* Email */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.08em", color: errors.email ? T.danger : T.textMuted,
                display: "block", marginBottom: 6 }}>Email <span style={{ color: T.danger }}>*</span></label>
              <input className="input" type="email" value={form.email}
                onChange={e => setF("email", e.target.value)}
                placeholder="ahmed@email.com"
                style={inputStyle("email")} />
              {errors.email && <span style={{ fontSize: 11, color: T.danger, marginTop: 3, display: "block" }}>{errors.email}</span>}
            </div>

            {/* Phone + CNIC — side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.08em", color: T.textMuted, display: "block", marginBottom: 6 }}>Phone</label>
                <input className="input" type="tel" value={form.phone}
                  onChange={e => setF("phone", e.target.value)}
                  placeholder="03XX-XXXXXXX" />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.08em", color: errors.cnic ? T.danger : T.textMuted,
                  display: "block", marginBottom: 6 }}>CNIC</label>
                <input className="input" type="text" value={form.cnic}
                  onChange={e => {
                    // Auto-format: 12345-1234567-1
                    let v = e.target.value.replace(/[^\d]/g, "");
                    if (v.length > 5)  v = v.slice(0,5)  + "-" + v.slice(5);
                    if (v.length > 13) v = v.slice(0,13) + "-" + v.slice(13);
                    if (v.length > 15) v = v.slice(0,15);
                    setF("cnic", v);
                  }}
                  placeholder="12345-1234567-1"
                  style={inputStyle("cnic")} />
                {errors.cnic && <span style={{ fontSize: 11, color: T.danger, marginTop: 3, display: "block" }}>{errors.cnic}</span>}
              </div>
            </div>

            {/* Join Date */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.08em", color: errors.join_date ? T.danger : T.textMuted,
                display: "block", marginBottom: 6 }}>Join Date <span style={{ color: T.danger }}>*</span></label>
              <input className="input" type="date" value={form.join_date}
                onChange={e => setF("join_date", e.target.value)}
                style={inputStyle("join_date")} />
              {errors.join_date && <span style={{ fontSize: 11, color: T.danger, marginTop: 3, display: "block" }}>{errors.join_date}</span>}
            </div>

            {/* Selected plan summary card */}
            <div style={{ marginTop: 8, padding: "14px 16px", borderRadius: 12,
              background: `${selectedTier?.color || T.accent}08`,
              border: `1.5px solid ${selectedTier?.color || T.accent}30` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted,
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Selected Plan
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 28 }}>{selectedTier?.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, color: selectedTier?.color, fontSize: 15 }}>
                    {selectedTier?.label} Plan
                  </div>
                  <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
                    {selectedTier?.features?.slice(0,3).join(" · ") || selectedTier?.description}
                  </div>
                </div>
                <div className="g-mono" style={{ fontSize: 18, fontWeight: 800, color: selectedTier?.color }}>
                  Rs.{monthlyFee.toLocaleString()}
                  <div style={{ fontSize: 10, fontWeight: 400, color: T.textMuted, textAlign: "right" }}>/month</div>
                </div>
              </div>
              {selectedTrainer && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${selectedTier?.color}20`,
                  fontSize: 12, color: T.purple, fontWeight: 600 }}>
                  ◆ Trainer: {selectedTrainer.full_name} (+Rs.{trainerFee.toLocaleString()})
                </div>
              )}
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />
          </div>
        </div>

        {/* ── Footer Actions ───────────────────────────────────── */}
        <div style={{ padding: "16px 28px", borderTop: `1.5px solid ${T.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: T.surface }}>
          <div style={{ fontSize: 13, color: T.textMuted }}>
            Monthly: <strong style={{ color: T.accent }}>Rs.{monthlyFee.toLocaleString()}</strong>
            {regFee > 0 && <span style={{ color: T.warning }}> · 1st Month (inc. reg): Rs.{totalFirstMonth.toLocaleString()}</span>}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn onClick={handleSave} disabled={saving} icon="✓">
              {saving ? "Saving…" : "Add Member"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// EDIT MEMBER MODAL — Same UI as AddMemberModal but NO registration fee
// ═══════════════════════════════════════════════════════════════

const EditMemberModal = ({ member, onClose, onSave }) => {
  // ── Right: Member details ────────────────────────────────────
  const [form, setForm] = useState({
    full_name: member.full_name || "",
    email:     member.email     || "",
    phone:     member.phone     || "",
    cnic:      member.cnic      || "",
    join_date: member.join_date || new Date().toISOString().slice(0, 10),
  });
  const [errors, setErrors] = useState({});

  // ── Left: Fees setup ─────────────────────────────────────────
  const [tiers,             setTiers]             = useState(() => TIER_CONFIG.map(t => ({ ...t })));
  const [trainers,          setTrainers]          = useState([]);
  const [selectedTierId,    setSelectedTierId]    = useState(member.membership_tier_id || "basic");
  const [selectedTrainerId, setSelectedTrainerId] = useState(member.trainer_id || "");
  const [saving,            setSaving]            = useState(false);
  const [activeTab,         setActiveTab]         = useState("tier");

  useEffect(() => {
    gymService.getTiers().then(res => {
      const apiTiers = res?.data || [];
      if (apiTiers.length) {
        setTiers(apiTiers.map(at => {
          const local = TIER_CONFIG.find(t => t.id === (at.tier_id || at.id)) || {};
          return {
            id: at.tier_id || at.id || local.id,
            label: at.name || local.label,
            fee: Number(at.monthly_fee ?? at.fee ?? local.fee ?? 0),
            color: local.color || "#4F46E5",
            icon: local.icon || "🏆",
            description: local.description || "",
            features: local.features || [],
          };
        }));
      }
    }).catch(() => {});

    gymService.getTrainers().then(res => {
      const rows = res?.data?.items || res?.data || [];
      setTrainers(rows.map(t => ({
        id: t.id || t.trainer_code,
        full_name: t.full_name,
        specialization: t.specialization || "—",
        hourly_rate: Number(t.hourly_rate || 0),
        status: t.status,
      })).filter(t => t.status !== "archived"));
    }).catch(() => {});
  }, []);

  const selectedTier    = tiers.find(t => t.id === selectedTierId) || tiers[0];
  const selectedTrainer = trainers.find(t => t.id === selectedTrainerId) || null;
  const trainerFee      = selectedTrainer ? Number(selectedTrainer.hourly_rate || 0) : 0;
  const tierFee         = getTierFee(selectedTierId);
  const monthlyFee      = tierFee + trainerFee;

  const setF = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: null }));
  };

  const validate = () => {
    const errs = {};
    if (!form.full_name.trim()) errs.full_name = "Name required";
    if (!form.email.trim())     errs.email     = "Email required";
    if (!form.join_date)        errs.join_date = "Join date required";
    if (form.cnic && !/^\d{5}-\d{7}-\d$/.test(form.cnic) && form.cnic.replace(/\D/g,"").length > 0)
      errs.cnic = "Format: 12345-1234567-1";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        full_name:          form.full_name.trim(),
        email:              form.email.trim(),
        phone:              form.phone.trim() || undefined,
        cnic:               form.cnic.trim()  || undefined,
        join_date:          form.join_date,
        membership_tier_id: selectedTierId,
        monthly_fee:        monthlyFee,
        trainer_id:         selectedTrainerId || undefined,
      };

      const res = await gymService.updateMember(member.id, payload);
      const d   = res?.data;
      const updated = {
        ...member,
        ...(d && typeof d === "object" ? d : {}),
        ...payload,
        id: member.id,
      };
      // Persist fee override so it survives reload
      _setFeeOverride(member.id, monthlyFee);
      toast.success(`✅ ${form.full_name} updated! Rs.${monthlyFee.toLocaleString()}/month`);
      onSave(updated);
      onClose();
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || "Unknown error";
      toast.error("Save failed: " + (typeof detail === "string" ? detail : JSON.stringify(detail)));
    } finally { setSaving(false); }
  };

  const inputStyle = (key) => ({ borderColor: errors[key] ? T.danger : undefined });

  return (
    <div className="modal-bg fade-in" style={{ zIndex: 2000, alignItems: "flex-start", paddingTop: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="g-card fade-up" style={{ width: "100%", maxWidth: 1000, maxHeight: "94vh",
        overflowY: "auto", padding: 0, display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "20px 28px", borderBottom: `1.5px solid ${T.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 className="g-head" style={{ fontSize: 22, color: T.text }}>✎ Edit Member</h2>
            <p style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>
              Update member details & plan
            </p>
          </div>
          <button onClick={onClose} style={{ background: T.bg, border: `1px solid ${T.border}`,
            color: T.textMuted, fontSize: 18, cursor: "pointer", width: 32, height: 32,
            borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>

        {/* Two Column Body */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", flex: 1, minHeight: 0 }}>

          {/* LEFT: Fees Setup */}
          <div style={{ padding: "24px 24px", borderRight: `1.5px solid ${T.border}`,
            overflowY: "auto", display: "flex", flexDirection: "column", gap: 0 }}>

            <div style={{ fontSize: 11, fontWeight: 800, color: T.accent, letterSpacing: "0.12em",
              textTransform: "uppercase", marginBottom: 16 }}>💰 Plan Setup</div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
              {[{ id: "tier", label: "🏆 Membership Tier" }, { id: "trainer", label: "◆ Trainer" }].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                  padding: "7px 16px", borderRadius: "8px 8px 0 0", cursor: "pointer",
                  fontWeight: 700, fontSize: 12, fontFamily: "inherit", transition: "all .15s",
                  border: `1.5px solid ${activeTab === tab.id ? T.border : "transparent"}`,
                  borderBottom: activeTab === tab.id ? `1.5px solid ${T.card}` : "transparent",
                  background: activeTab === tab.id ? T.card : "transparent",
                  color: activeTab === tab.id ? T.accent : T.textMuted,
                  marginBottom: activeTab === tab.id ? -1 : 0,
                }}>{tab.label}</button>
              ))}
            </div>

            {/* Tab: Tier */}
            {activeTab === "tier" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }}>
                {tiers.map(t => (
                  <div key={t.id} onClick={() => setSelectedTierId(t.id)}
                    style={{ padding: "14px 12px", borderRadius: 12, cursor: "pointer",
                      transition: "all .15s", textAlign: "center",
                      border: `2px solid ${selectedTierId === t.id ? t.color : T.border}`,
                      background: selectedTierId === t.id ? `${t.color}10` : T.card,
                      boxShadow: selectedTierId === t.id ? `0 4px 14px ${t.color}20` : "none" }}>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>{t.icon}</div>
                    <div style={{ fontWeight: 800, fontSize: 13, color: selectedTierId === t.id ? t.color : T.text }}>{t.label}</div>
                    <div className="g-mono" style={{ fontSize: 12, color: selectedTierId === t.id ? t.color : T.textMuted, marginTop: 2 }}>
                      Rs.{t.fee.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4, lineHeight: 1.4 }}>{t.description}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab: Trainer */}
            {activeTab === "trainer" && (
              <div>
                <div onClick={() => setSelectedTrainerId("")}
                  style={{ padding: "14px 18px", borderRadius: 12, cursor: "pointer", transition: "all .15s",
                    border: `2px solid ${selectedTrainerId === "" ? T.textMuted : T.border}`,
                    background: selectedTrainerId === "" ? T.bg : T.card,
                    display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: T.bg,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                    border: `2px solid ${T.border}`, flexShrink: 0 }}>✕</div>
                  <div>
                    <div style={{ fontWeight: 700, color: selectedTrainerId === "" ? T.text : T.textMuted }}>No Trainer</div>
                    <div style={{ fontSize: 12, color: T.textMuted }}>No personal trainer required</div>
                  </div>
                  {selectedTrainerId === "" && (
                    <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: T.textMuted }}>✓ Selected</span>
                  )}
                </div>
                {trainers.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 0", color: T.textMuted, fontSize: 13 }}>
                    <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>◆</div>
                    No trainers available
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {trainers.map(t => {
                      const selected = selectedTrainerId === t.id;
                      const sc = { Strength: T.purple, Cardio: T.blue, Yoga: T.success,
                        CrossFit: T.accent, Boxing: T.danger, Swimming: T.blue }[t.specialization] || T.accent;
                      return (
                        <div key={t.id} onClick={() => setSelectedTrainerId(selected ? "" : t.id)}
                          style={{ padding: "14px 18px", borderRadius: 12, cursor: "pointer", transition: "all .15s",
                            border: `2px solid ${selected ? sc : T.border}`,
                            background: selected ? `${sc}08` : T.card,
                            display: "flex", alignItems: "center", gap: 14 }}>
                          <div style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
                            background: `${sc}18`, display: "flex", alignItems: "center",
                            justifyContent: "center", fontWeight: 800, fontSize: 15, color: sc,
                            border: `2px solid ${sc}30` }}>
                            {(t.full_name || "?")[0]}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: T.text }}>{t.full_name}</div>
                            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
                              <span style={{ color: sc, fontWeight: 600 }}>{t.specialization}</span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div className="g-mono" style={{ fontSize: 13, fontWeight: 800,
                              color: selected ? sc : T.textSecondary }}>
                              +Rs.{t.hourly_rate.toLocaleString()}
                            </div>
                            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>monthly</div>
                          </div>
                          {selected && (
                            <div style={{ width: 22, height: 22, borderRadius: "50%", background: sc,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 12, color: "#fff", fontWeight: 800, flexShrink: 0 }}>✓</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Fee Summary */}
            <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: 12,
              background: T.bg, border: `1.5px solid ${T.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.textMuted,
                letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Fee Summary</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: T.textSecondary, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ color: selectedTier?.color }}>{selectedTier?.icon}</span> {selectedTier?.label} Plan
                </span>
                <span className="g-mono" style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Rs.{tierFee.toLocaleString()}</span>
              </div>
              {selectedTrainer && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: T.textMuted }}>◆ {selectedTrainer.full_name}</span>
                  <span className="g-mono" style={{ fontSize: 12, color: T.purple }}>+Rs.{trainerFee.toLocaleString()}</span>
                </div>
              )}
              <div style={{ borderTop: `1.5px solid ${T.border}`, marginTop: 8, paddingTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: T.textMuted }}>Monthly Fee</span>
                  <span className="g-mono" style={{ fontSize: 14, fontWeight: 800, color: T.accent }}>Rs.{monthlyFee.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Member Details */}
          <div style={{ padding: "24px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.accent, letterSpacing: "0.12em",
              textTransform: "uppercase", marginBottom: 4 }}>👤 Member Details</div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.08em", color: errors.full_name ? T.danger : T.textMuted,
                display: "block", marginBottom: 6 }}>Full Name <span style={{ color: T.danger }}>*</span></label>
              <input className="input" type="text" value={form.full_name}
                onChange={e => setF("full_name", e.target.value)}
                placeholder="e.g. Ahmed Ali" style={inputStyle("full_name")} />
              {errors.full_name && <span style={{ fontSize: 11, color: T.danger, marginTop: 3, display: "block" }}>{errors.full_name}</span>}
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.08em", color: errors.email ? T.danger : T.textMuted,
                display: "block", marginBottom: 6 }}>Email <span style={{ color: T.danger }}>*</span></label>
              <input className="input" type="email" value={form.email}
                onChange={e => setF("email", e.target.value)}
                placeholder="ahmed@email.com" style={inputStyle("email")} />
              {errors.email && <span style={{ fontSize: 11, color: T.danger, marginTop: 3, display: "block" }}>{errors.email}</span>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.08em", color: T.textMuted, display: "block", marginBottom: 6 }}>Phone</label>
                <input className="input" type="tel" value={form.phone}
                  onChange={e => setF("phone", e.target.value)} placeholder="03XX-XXXXXXX" />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.08em", color: errors.cnic ? T.danger : T.textMuted,
                  display: "block", marginBottom: 6 }}>CNIC</label>
                <input className="input" type="text" value={form.cnic}
                  onChange={e => {
                    let v = e.target.value.replace(/[^\d]/g, "");
                    if (v.length > 5)  v = v.slice(0,5)  + "-" + v.slice(5);
                    if (v.length > 13) v = v.slice(0,13) + "-" + v.slice(13);
                    if (v.length > 15) v = v.slice(0,15);
                    setF("cnic", v);
                  }}
                  placeholder="12345-1234567-1" style={inputStyle("cnic")} />
                {errors.cnic && <span style={{ fontSize: 11, color: T.danger, marginTop: 3, display: "block" }}>{errors.cnic}</span>}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.08em", color: errors.join_date ? T.danger : T.textMuted,
                display: "block", marginBottom: 6 }}>Join Date <span style={{ color: T.danger }}>*</span></label>
              <input className="input" type="date" value={form.join_date}
                onChange={e => setF("join_date", e.target.value)} style={inputStyle("join_date")} />
              {errors.join_date && <span style={{ fontSize: 11, color: T.danger, marginTop: 3, display: "block" }}>{errors.join_date}</span>}
            </div>

            {/* Selected plan summary */}
            <div style={{ marginTop: 8, padding: "14px 16px", borderRadius: 12,
              background: `${selectedTier?.color || T.accent}08`,
              border: `1.5px solid ${selectedTier?.color || T.accent}30` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted,
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Selected Plan</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 28 }}>{selectedTier?.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, color: selectedTier?.color, fontSize: 15 }}>{selectedTier?.label} Plan</div>
                  <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
                    {selectedTier?.features?.slice(0,3).join(" · ") || selectedTier?.description}
                  </div>
                </div>
                <div className="g-mono" style={{ fontSize: 18, fontWeight: 800, color: selectedTier?.color }}>
                  Rs.{monthlyFee.toLocaleString()}
                  <div style={{ fontSize: 10, fontWeight: 400, color: T.textMuted, textAlign: "right" }}>/month</div>
                </div>
              </div>
              {selectedTrainer && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${selectedTier?.color}20`,
                  fontSize: 12, color: T.purple, fontWeight: 600 }}>
                  ◆ Trainer: {selectedTrainer.full_name} (+Rs.{trainerFee.toLocaleString()})
                </div>
              )}
            </div>
            <div style={{ flex: 1 }} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 28px", borderTop: `1.5px solid ${T.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: T.surface }}>
          <div style={{ fontSize: 13, color: T.textMuted }}>
            Monthly: <strong style={{ color: T.accent }}>Rs.{monthlyFee.toLocaleString()}</strong>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn onClick={handleSave} disabled={saving} icon="✓">
              {saving ? "Saving…" : "Save Changes"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
};

const DynamicForm = ({ schema, initial = {}, onSubmit, onClose }) => {
  const editableFields = schema.fields.filter(f => !f.hidden && f.type !== "status" && !f.formReadOnly);
  const [values, setValues] = useState(() =>
    editableFields.reduce((acc, f) => ({ ...acc, [f.key]: initial[f.key] ?? "" }), {})
  );
  const [errors, setErrors] = useState({});

  // Re-sync if schema options change (e.g. tiers load after modal opens)
  useEffect(() => {
    setValues(editableFields.reduce((acc, f) => ({
      ...acc,
      [f.key]: values[f.key] ?? initial[f.key] ?? "",
    }), {}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  const OPTIONAL = new Set(["rating", "client_count", "phone", "vendor", "description", "calories_burned"]);

  const set = (key, val) => {
    setValues(v => ({ ...v, [key]: val }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: null }));
  };

  const validate = () => {
    const errs = {};
    editableFields.forEach(f => {
      if (OPTIONAL.has(f.key)) return;
      const v = values[f.key];
      if (v === "" || v === null || v === undefined) {
        errs[f.key] = `${f.label} is required`;
      }
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => { if (validate()) onSubmit(values); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

      {editableFields.map(f => (
        <div key={f.key} style={{ gridColumn: f.formSpan === "full" ? "1 / -1" : undefined }}>
          <label style={{ display: "block", fontSize: 11, marginBottom: 6,
            textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700,
            color: errors[f.key] ? T.danger : T.textMuted }}>
            {f.label}
            {!OPTIONAL.has(f.key) && <span style={{ color: T.danger, marginLeft: 2 }}>*</span>}
          </label>
          {(f.type === "select" || f.type === "category_badge") && Array.isArray(f.options) ? (
            <select className="input" value={values[f.key]} onChange={e => set(f.key, e.target.value)}
              style={{ borderColor: errors[f.key] ? T.danger : undefined }}>
              <option value="">
                {f.options.length === 0 ? "Loading…" : `Select ${f.label}`}
              </option>
              {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : f.key === "cnic" ? (
            <input className="input" type="text"
              value={values[f.key]}
              onChange={e => {
                let v = e.target.value.replace(/[^\d]/g, "");
                if (v.length > 5)  v = v.slice(0,5)  + "-" + v.slice(5);
                if (v.length > 13) v = v.slice(0,13) + "-" + v.slice(13);
                if (v.length > 15) v = v.slice(0,15);
                set(f.key, v);
              }}
              placeholder="12345-1234567-1"
              style={{ borderColor: errors[f.key] ? T.danger : undefined }} />
          ) : (
            <input className="input"
              type={f.type === "currency" || f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "id_badge" ? "text" : f.type}
              value={values[f.key]} onChange={e => set(f.key, e.target.value)}
              placeholder={f.placeholder || `Enter ${f.label.toLowerCase()}`}
              style={{ borderColor: errors[f.key] ? T.danger : undefined }} />
          )}
          {errors[f.key] && (
            <span style={{ fontSize: 11, color: T.danger, marginTop: 3, display: "block" }}>{errors[f.key]}</span>
          )}
        </div>
      ))}
      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 10,
        marginTop: 8, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={handleSubmit} icon="✓">Save Record</Btn>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SECTION 8: MODAL
// ═══════════════════════════════════════════════════════════════

const Modal = ({ title, children, onClose, maxWidth = 640 }) => (
  <div className="modal-bg fade-in" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="g-card fade-up" style={{ width: "100%", maxWidth, maxHeight: "90vh",
      overflowY: "auto", padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 className="g-head" style={{ fontSize: 24, color: T.text }}>{title}</h2>
        <button onClick={onClose} style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.textMuted,
          fontSize: 18, cursor: "pointer", lineHeight: 1, width: 32, height: 32, borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// SECTION 9: DYNAMIC CRUD PAGE
// ═══════════════════════════════════════════════════════════════

const DynamicCrudPage = ({ moduleConfig }) => {
  const { can } = useApp();
  const [schema,  setSchema]  = useState(null);
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null);
  const [autoFeesDialog, setAutoFeesDialog] = useState(null); // auto-open fees dialog after member create

  useEffect(() => {
    setLoading(true); setData([]); setSchema(null);
    Promise.all([
      API_ENDPOINTS.getSchema(moduleConfig.schemaKey),
      API_ENDPOINTS.getData(moduleConfig.dataKey),
    ]).then(([s, d]) => { setSchema(s); setData(d); setLoading(false); });
  }, [moduleConfig.schemaKey, moduleConfig.dataKey]);

  const serviceMap = {
    members:   { create: (d)    => gymService.createMember(d),      update: (id, d) => gymService.updateMember(id, d),   del: (id) => gymService.deleteMember(id)   },
    trainers:  { create: (d)    => gymService.createTrainer(d),     update: (id, d) => gymService.updateTrainer(id, d),  del: (id) => gymService.deleteTrainer(id)  },
    staff:     { create: (d)    => gymService.createStaff(d),       update: (id, d) => gymService.updateStaff(id, d),    del: null                                  },
    exercises: { create: (d)    => gymService.createExercise(d),    update: (id, d) => gymService.updateExercise(id, d), del: null                                  },
    expenses:  { create: (d)    => gymService.createExpense(d),     update: (id, d) => gymService.updateExpense(id, d),  del: (id) => gymService.deleteExpense(id)  },
  };

  /**
   * Build the API payload from raw form values.
   *
   * Rules applied here (not in the form):
   *  1. Strip empty strings → send null or omit the field
   *  2. On CREATE: skip fields marked omitOnCreate (e.g. balance)
   *  3. On CREATE: never send `status` (backend sets default)
   *  4. Expenses: auto-derive billing_month from expense_date
   */
  const buildPayload = (vals, isCreate, currentSchema) => {
    const payload = {};

    (currentSchema?.fields || []).forEach(f => {
      // Skip non-submittable fields
      if (f.formReadOnly || f.hidden || f.type === "status") return;
      // Skip fields not wanted on create
      if (isCreate && f.omitOnCreate) return;

      const val = vals[f.key];
      // Omit empty strings so optional fields stay null on the backend
      if (val !== "" && val !== undefined && val !== null) {
        // Coerce numeric types — form inputs always return strings
        if ((f.type === "currency" || f.type === "number") && val !== "") {
          payload[f.key] = Number(val);
        } else {
          payload[f.key] = val;
        }
      }
    });

    // For update, preserve status from the original row (passed in vals by edit form)
    if (!isCreate && vals.status) {
      payload.status = vals.status;
    }

    // Expenses: billing_month is required (YYYY-MM) — derive from expense_date
    if (moduleConfig.dataKey === "expenses" && payload.expense_date && !payload.billing_month) {
      payload.billing_month = String(payload.expense_date).slice(0, 7);
    }

    return payload;
  };

  const handleSave = async (vals) => {
    const svc = serviceMap[moduleConfig.dataKey];
    const isAdd = modal === "add";
    const isEdit = modal && modal.type === "edit";

    if (!isAdd && !isEdit) return;

    const payload = buildPayload(vals, isAdd, schema);

    // ── Always create a local record first so UI never appears broken ──
    const localRecord = { ...payload, id: "local-" + Date.now(), status: "active" };

    if (isAdd) {
      let apiRecord = null;
      try {
        const res = await svc.create(payload);
        const d = res?.data;
        if (d && typeof d === "object" && !Array.isArray(d)) {
          // Normalise primary key — trainer uses trainer_code, member uses member_code, etc.
          if (!d.id) {
            const codeKey = Object.keys(d).find(k => k.endsWith("_code") && d[k]);
            const idKey   = Object.keys(d).find(k => k.endsWith("_id")   && d[k]);
            if (codeKey) d.id = d[codeKey];
            else if (idKey) d.id = d[idKey];
          }
          if (d.id) apiRecord = d;
        }
      } catch (err) {
        const detail = err?.response?.data?.detail || err?.response?.data?.message || err?.message || String(err);
        const status = err?.response?.status;
        console.error("Create failed:", status, err?.response?.data);
        if (status >= 400 && status !== 401) {
          toast.error("Error (" + status + "): " + (typeof detail === "string" ? detail : JSON.stringify(detail)));
        } else if (!status) {
          console.error("Non-HTTP error:", err?.message);
        }
      }
      if (apiRecord) toast.success("Record created successfully!");
      const newRow = apiRecord || localRecord;
      setData(d => [newRow, ...d]);

    } else {
      // Edit
      let apiRecord = null;
      try {
        const res = await svc.update(modal.row.id, payload);
        const d = res?.data;
        if (d && typeof d === "object" && !Array.isArray(d)) {
          if (!d.id) {
            const codeKey = Object.keys(d).find(k => k.endsWith("_code") && d[k]);
            const idKey   = Object.keys(d).find(k => k.endsWith("_id")   && d[k]);
            if (codeKey) d.id = d[codeKey];
            else if (idKey) d.id = d[idKey];
          }
          if (d.id) apiRecord = d;
        }
        toast.success("Record updated successfully!");
      } catch (err) {
        const detail = err?.response?.data?.detail || err?.response?.data?.message || err?.message || "Unknown error";
        const status = err?.response?.status;
        console.error("Update failed:", status, err?.response?.data);
        if (status >= 400 && status !== 401) {
          toast.error("Error (" + status + "): " + (typeof detail === "string" ? detail : JSON.stringify(detail)));
        }
      }
      const merged = apiRecord || Object.assign({}, modal.row, payload);
      setData(d => d.map(r => r.id === modal.row.id ? merged : r));
    }

    setModal(null);
  };

  const handleDelete = async (row) => {
    const svc = serviceMap[moduleConfig.dataKey];
    try {
      if (svc?.del) {
        try {
          await svc.del(row.id);
        } catch {
          // API unavailable — fall through to local removal
        }
      }
      // Always remove / archive locally
      if (svc?.del) {
        setData(d => d.filter(r => r.id !== row.id));
        toast.success("Record deleted.");
      } else {
        setData(d => d.map(r => r.id === row.id ? { ...r, status: "archived" } : r));
        toast.info("Record archived.");
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Delete failed. Please try again.");
    }
  };

  // activeSchema is just schema — membership_tier_id field has been removed
  const activeSchema = schema;

  if (loading) return <LoadingOverlay label={`Loading ${moduleConfig.label}…`} />;
  if (!activeSchema) return null;

  return (
    <div className="fade-up">
      {autoFeesDialog && (
        <FeesDialog
          member={autoFeesDialog}
          onClose={() => setAutoFeesDialog(null)}
          onSave={(updated) => { setData(d => d.map(r => r.id === updated.id ? updated : r)); setAutoFeesDialog(null); }}
        />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="g-head" style={{ fontSize: 40 }}>{activeSchema.title}</h1>
          <p style={{ color: T.textMuted, fontSize: 14, marginTop: 4 }}>{activeSchema.subtitle}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" icon="⬇" size="sm" onClick={() => {
            const fields = activeSchema.fields.filter(f => !f.hidden);
            const header = fields.map(f => f.label).join(",");
            const rows = data.map(row =>
              fields.map(f => {
                const v = row[f.key] ?? "";
                return typeof v === "string" && v.includes(",") ? `"${v}"` : v;
              }).join(",")
            );
            const csv = [header, ...rows].join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${activeSchema.title.toLowerCase()}_${new Date().toISOString().slice(0,10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success(`Exported ${data.length} records as CSV`);
          }}>Export CSV</Btn>
          {can.canEdit && (
            <Btn onClick={() => setModal("add")} icon="+">Add {activeSchema.title.replace(/s$/, "")}</Btn>
          )}
        </div>
      </div>
      <Card style={{ padding: 0 }}>
        <div style={{ padding: "20px 20px 0" }}>
          <DynamicTable schema={activeSchema} data={data} canEdit={can.canEdit} canDelete={can.canDelete}
            onEdit={row => setModal({ type: "edit", row })} onDelete={handleDelete}
            onUpdateRow={updated => setData(d => d.map(r => r.id === updated.id ? updated : r))} />
        </div>
        <div style={{ height: 20 }} />
      </Card>
      {modal === "add" && moduleConfig.dataKey === "members" ? (
        <AddMemberModal
          onClose={() => setModal(null)}
          onSave={(newRow) => {
            setData(d => [newRow, ...d]);
            setModal(null);
          }}
        />
      ) : modal === "add" && (
        <Modal title={`Add ${activeSchema.title.replace(/s$/, "")}`} onClose={() => setModal(null)}>
          <DynamicForm schema={activeSchema} onSubmit={handleSave} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === "edit" && moduleConfig.dataKey === "members" ? (
        <EditMemberModal
          member={modal.row}
          onClose={() => setModal(null)}
          onSave={(updated) => {
            setData(d => d.map(r => r.id === updated.id ? updated : r));
            setModal(null);
          }}
        />
      ) : modal?.type === "edit" && (
        <Modal title={`Edit ${activeSchema.title.replace(/s$/, "")}`} onClose={() => setModal(null)}>
          <DynamicForm schema={activeSchema} initial={modal.row} onSubmit={handleSave} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SECTION 10: ATTENDANCE PAGE — DB integrated (raw_punches + attendance)
// ═══════════════════════════════════════════════════════════════

// ── ATTENDANCE POLL INTERVAL (ms) — set by lead, default 30 s ──
const ATTENDANCE_POLL_MS = 30_000;

const AttendancePage = () => {
  const [members,       setMembers]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [paymentMap,    setPaymentMap]    = useState({});
  // dbAttendance keyed by member_id (internal id).
  // Each record from backend: { id, member_id, member_code, punch_in, punch_out, date }
  // Records are populated by backend processing of raw_punches (device-driven).
  const [dbAttendance,  setDbAttendance]  = useState({});
  const [historyLog,    setHistoryLog]    = useState([]);
  const [overdueAlert,  setOverdueAlert]  = useState(null);
  const [liveTime,      setLiveTime]      = useState(new Date());
  const [lastSynced,    setLastSynced]    = useState(null);
  const [syncing,       setSyncing]       = useState(false);
  // Manual override state
  const [overrideModal, setOverrideModal] = useState(null); // { member } — admin force punch
  const [overrideLoading, setOverrideLoading] = useState({});

  const membersRef = useRef([]);
  const todayKey   = new Date().toISOString().slice(0, 10);

  // ── Helper: build attendance index + history log from attData ─
  const applyAttendanceData = useCallback((attData, memberData) => {
    const src = memberData || membersRef.current;
    const indexed = {};
    // Index by member_id; also try member_code → id lookup
    (attData || []).forEach(rec => {
      const memberId = rec.member_id ||
        src.find(m => m.member_code === rec.member_code)?.id;
      if (memberId) indexed[memberId] = { ...rec, member_id: memberId };
    });
    setDbAttendance(indexed);

    const log = [];
    (attData || []).forEach(rec => {
      const memberId = rec.member_id ||
        src.find(m => m.member_code === rec.member_code)?.id;
      const mem = src.find(m => m.id === memberId);
      if (rec.punch_in)
        log.push({ id:`${memberId}-in`,  memberId, memberName:mem?.full_name||rec.member_code||memberId, membership:mem?.membership_tier_id, date:todayKey, time:rec.punch_in.slice(11,19),  type:"IN"  });
      if (rec.punch_out)
        log.push({ id:`${memberId}-out`, memberId, memberName:mem?.full_name||rec.member_code||memberId, membership:mem?.membership_tier_id, date:todayKey, time:rec.punch_out.slice(11,19), type:"OUT" });
    });
    log.sort((a, b) => b.time.localeCompare(a.time));
    setHistoryLog(log);
  }, [todayKey]);

  // ── Fetch latest attendance from backend (used on mount + poll) ─
  const fetchAttendance = useCallback(async (memberData) => {
    setSyncing(true);
    try {
      const attData = await API_ENDPOINTS.getTodayAttendance();
      applyAttendanceData(attData, memberData);
      setLastSynced(new Date());
    } finally {
      setSyncing(false);
    }
  }, [applyAttendanceData]);

  // ── Initial load ────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      API_ENDPOINTS.getData("members"),
      API_ENDPOINTS.getMemberPayments().catch(() => []),
    ]).then(async ([memberData, paymentData]) => {
      const active = memberData.filter(m => m.status === "active");
      membersRef.current = active;
      setMembers(active);
      const pMap = {};
      (paymentData || []).forEach(p => { pMap[p.id] = p; });
      setPaymentMap(pMap);
      await fetchAttendance(active);
      setLoading(false);
    });
  }, [fetchAttendance]);

  // ── Poll: re-fetch attendance every ATTENDANCE_POLL_MS ──────
  // Backend has already processed raw_punches → attendance by then.
  useEffect(() => {
    const timer = setInterval(() => fetchAttendance(), ATTENDANCE_POLL_MS);
    return () => clearInterval(timer);
  }, [fetchAttendance]);

  // ── Live clock ──────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isFeeOverdue = (member) => {
    if (isMemberOverdueFromBills(member.id)) return true;
    const payInfo = paymentMap[member.id];
    if (payInfo) return payInfo.is_overdue;
    if (!member.feeDueDate) return false;
    return new Date(member.feeDueDate) < new Date(new Date().toDateString());
  };

  // ── MANUAL OVERRIDE (admin edge-case) ──────────────────────
  // Used when device misses a punch or member forgot to scan.
  const handleManualOverride = async (member) => {
    const existing  = dbAttendance[member.id];
    const memberId  = member.id;
    const memberCode = member.member_code || String(member.id);
    const now       = new Date();
    const isoNow    = now.toISOString();
    const timeStr   = now.toTimeString().slice(0, 8);

    setOverrideModal(null);
    setOverrideLoading(p => ({ ...p, [memberId]: true }));

    if (!existing) {
      // No attendance record yet → manual punch-in
      const newRec = await API_ENDPOINTS.manualPunchIn(memberCode, isoNow, todayKey);
      const localRec = newRec || { id:`local-${Date.now()}`, member_id:memberId, member_code:memberCode, punch_in:isoNow, punch_out:null, date:todayKey };
      setDbAttendance(prev => ({ ...prev, [memberId]: localRec }));
      setHistoryLog(prev => [{
        id:`${memberId}-${Date.now()}`, memberId,
        memberName:member.full_name, membership:member.membership_tier_id,
        date:todayKey, time:timeStr, type:"IN", manual:true,
      }, ...prev]);
      if (isFeeOverdue(member)) setOverdueAlert(member);
    } else if (!existing.punch_out) {
      // Has punch_in but no punch_out → manual punch-out
      const updatedRec = await API_ENDPOINTS.manualPunchOut(existing.id, isoNow);
      const merged = updatedRec ? { ...existing, ...updatedRec } : { ...existing, punch_out: isoNow };
      setDbAttendance(prev => ({ ...prev, [memberId]: merged }));
      setHistoryLog(prev => [{
        id:`${memberId}-${Date.now()}`, memberId,
        memberName:member.full_name, membership:member.membership_tier_id,
        date:todayKey, time:timeStr, type:"OUT", manual:true,
      }, ...prev]);
    }
    // If already fully punched out, override is a no-op (admin should edit via DB or backend)
    setOverrideLoading(p => ({ ...p, [memberId]: false }));
  };

  // ── DERIVE STATUS from dbAttendance ────────────────────────
  const getMemberStatus = (memberId) => {
    const rec = dbAttendance[memberId];
    if (!rec) return { label: "Not Punched", color: T.textMuted, bg: T.bg, type: "none" };
    if (rec.punch_out) {
      const outTime = rec.punch_out.slice(11, 16);
      const inTime  = rec.punch_in.slice(11, 16);
      return { label: `OUT ${outTime}`, color: T.danger, bg: T.dangerDim, type: "out", inTime };
    }
    const inTime = rec.punch_in.slice(11, 16);
    return { label: `IN ${inTime}`, color: T.success, bg: T.successDim, type: "in" };
  };

  const filteredMembers = members.filter(m =>
    (m.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.member_code || m.id || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const presentToday = Object.keys(dbAttendance).length;
  const insideNow    = Object.values(dbAttendance).filter(r => r.punch_in && !r.punch_out).length;

  if (loading) return <LoadingOverlay label="Loading attendance…" />;

  return (
    <div className="fade-up">
      {/* ── OVERDUE ALERT MODAL ───────────────────────────────── */}
      {overdueAlert && (
        <div className="modal-bg fade-in" style={{ zIndex: 2000 }}>
          <div className="g-card fade-up shake" style={{ width: "100%", maxWidth: 480, padding: 32, textAlign: "center", border: `2px solid ${T.danger}` }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: T.dangerDim,
              border: `2px solid rgba(240,45,109,0.3)`, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 34, margin: "0 auto 20px" }}>🚨</div>
            <div className="g-head" style={{ fontSize: 28, color: T.danger, marginBottom: 8 }}>FEES OVERDUE</div>
            <div style={{ fontSize: 16, color: T.textSecondary, marginBottom: 16 }}>
              <strong style={{ color: T.text }}>{overdueAlert.full_name}</strong> has outstanding dues that must be cleared.
            </div>
            <div style={{ background: T.dangerDim, border: `1.5px solid rgba(240,45,109,0.25)`,
              borderRadius: 12, padding: "16px 20px", marginBottom: 20, textAlign: "left" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.danger, letterSpacing: "0.08em", marginBottom: 4 }}>MEMBER CODE</div>
                  <div className="g-mono" style={{ fontSize: 13, color: T.text }}>{displayCode(overdueAlert)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.danger, letterSpacing: "0.08em", marginBottom: 4 }}>MEMBERSHIP</div>
                  <div style={{ fontSize: 13, color: T.text }}>{overdueAlert.membership_tier_id || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.danger, letterSpacing: "0.08em", marginBottom: 4 }}>MONTHLY FEE</div>
                  <div className="g-mono" style={{ fontSize: 13, color: T.text }}>Rs.{Number(paymentMap[overdueAlert.id]?.total_fees || 0).toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.danger, letterSpacing: "0.08em", marginBottom: 4 }}>OVERDUE AMOUNT</div>
                  <div className="g-mono" style={{ fontSize: 15, color: T.danger, fontWeight: 800 }}>
                    Rs.{Number(paymentMap[overdueAlert.id]?.overdue_amount || paymentMap[overdueAlert.id]?.total_fees || 0).toLocaleString()}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: T.danger, fontWeight: 600, borderTop: `1px solid rgba(240,45,109,0.2)`, paddingTop: 10 }}>
                ⚠️ Please collect outstanding dues before allowing entry.
              </div>
            </div>
            <Btn variant="danger" onClick={() => setOverdueAlert(null)} icon="✓" style={{ width: "100%", justifyContent: "center" }}>
              Acknowledge & Continue
            </Btn>
          </div>
        </div>
      )}

      {/* ── MANUAL OVERRIDE MODAL ─────────────────────────────── */}
      {overrideModal && (() => {
        const mem    = overrideModal.member;
        const status = getMemberStatus(mem.id);
        const action = status.type === "in" ? "Punch OUT" : status.type === "out" ? "Already done" : "Punch IN";
        const disabled = status.type === "out";
        return (
          <div className="modal-bg fade-in" style={{ zIndex: 2000 }}>
            <div className="g-card fade-up" style={{ width: "100%", maxWidth: 420, padding: 28 }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>✍️</div>
                <div className="g-head" style={{ fontSize: 22, color: T.text }}>Manual Override</div>
                <div style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>
                  Force-record a punch for <strong style={{ color: T.text }}>{mem.full_name}</strong>
                </div>
              </div>
              <div style={{ background: T.bg, borderRadius: 10, padding: "12px 16px", marginBottom: 16,
                border: `1px solid ${T.border}`, fontSize: 13, lineHeight: 1.7 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: T.textMuted }}>Member Code</span>
                  <span className="g-mono" style={{ color: T.text }}>{displayCode(mem)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: T.textMuted }}>Current Status</span>
                  <span style={{ color: status.color, fontWeight: 700 }}>{status.label}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: T.textMuted }}>Action</span>
                  <span style={{ color: disabled ? T.textMuted : T.text, fontWeight: 700 }}>{action}</span>
                </div>
              </div>
              {disabled ? (
                <div style={{ fontSize: 13, color: T.textMuted, textAlign: "center", marginBottom: 16 }}>
                  Member is already fully checked out today. Edit via backend if correction is needed.
                </div>
              ) : (
                <div style={{ fontSize: 12, color: T.warning, background: T.warningDim, border: `1px solid ${T.warning}44`,
                  borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}>
                  ⚠️ This override bypasses the biometric device and records the current timestamp directly.
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <Btn variant="ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setOverrideModal(null)}>Cancel</Btn>
                {!disabled && (
                  <Btn style={{ flex: 1, justifyContent: "center" }} onClick={() => handleManualOverride(mem)}>
                    Confirm {action}
                  </Btn>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── PAGE HEADER ───────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="g-head" style={{ fontSize: 40 }}>ATTENDANCE</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <p style={{ color: T.textMuted, fontSize: 14, margin: 0 }}>
              Device sync · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
            {/* Sync indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: syncing ? T.accent : T.success,
              background: syncing ? T.accentDim : T.successDim, padding: "2px 10px", borderRadius: 20,
              border: `1px solid ${syncing ? T.accent : T.success}44`, fontWeight: 700 }}>
              {syncing
                ? <><span className="spin" style={{ width:10, height:10, borderRadius:"50%", border:`2px solid currentColor`, borderTopColor:"transparent", display:"inline-block" }} /> Syncing…</>
                : <>● Live{lastSynced ? ` · ${lastSynced.toTimeString().slice(0,5)}` : ""}</>
              }
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => {
            const rows = [["Member Code","Member Name","Date","Punch In","Punch Out"]];
            members.forEach(m => {
              const rec = dbAttendance[m.id];
              if (!rec) return;
              const d    = rec.date || todayKey;
              const pin  = rec.punch_in  ? rec.punch_in.slice(11,19)  : "";
              const pout = rec.punch_out ? rec.punch_out.slice(11,19) : "";
              rows.push([m.member_code || "", m.full_name || "", d, pin, pout]);
            });
            const csv  = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href     = url;
            a.download = `attendance_${todayKey}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
            style={{ padding: "7px 14px", borderRadius: 9, border: `1.5px solid ${T.border}`, background: T.card,
              color: T.textSecondary, fontSize: 12, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6 }}>
            ⬇️ Export CSV
          </button>
          <button onClick={() => fetchAttendance()} disabled={syncing}
            style={{ padding: "7px 14px", borderRadius: 9, border: `1.5px solid ${T.border}`, background: T.card,
              color: T.textSecondary, fontSize: 12, fontWeight: 700, cursor: syncing ? "not-allowed" : "pointer",
              opacity: syncing ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}>
            🔄 Refresh
          </button>
          <div className="g-mono" style={{ fontSize: 28, fontWeight: 700, color: T.accent,
            background: `linear-gradient(135deg, rgba(79,70,229,0.12), rgba(139,92,246,0.10))`,
            padding: "8px 16px", borderRadius: 12, border: `1.5px solid rgba(79,70,229,.22)` }}>
            {liveTime.toTimeString().slice(0, 8)}
          </div>
        </div>
      </div>

      {/* ── STAT CARDS ────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Members",  value: members.length,                color: T.text,      icon: "👥", bg: T.bg },
          { label: "Present Today",  value: presentToday,                  color: T.success,   icon: "✅", bg: T.successDim },
          { label: "Inside Now",     value: insideNow,                     color: T.accent,    icon: "🏃", bg: T.accentDim },
          { label: "Not Checked In", value: members.length - presentToday, color: T.textMuted, icon: "⏳", bg: T.bg },
        ].map((k, i) => (
          <Card key={i} className={`fade-up s${i + 1}`} style={{ padding: "18px 20px", cursor: "default" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <SectionLabel>{k.label}</SectionLabel>
                <div className="g-head" style={{ fontSize: 36, color: k.color, lineHeight: 1.1 }}>{k.value}</div>
              </div>
              <div style={{ fontSize: 24, padding: "8px", background: k.bg, borderRadius: 10 }}>{k.icon}</div>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 20, alignItems: "start" }}>
        {/* ── MEMBER STATUS LIST ──────────────────────────────── */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div>
              <div className="g-head" style={{ fontSize: 20 }}>MEMBER STATUS</div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                Punches recorded by biometric device · auto-refreshes every {ATTENDANCE_POLL_MS / 1000}s
              </div>
            </div>
            <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.textMuted }}>⌕</span>
              <input className="input" style={{ paddingLeft: 36, height: 38, fontSize: 13 }}
                placeholder="Search member or code…" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {filteredMembers.map(member => {
              const status   = getMemberStatus(member.id);
              const overdue  = isFeeOverdue(member);
              const loading  = overrideLoading[member.id];
              return (
                <div key={member.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                  border: `1.5px solid ${overdue ? "rgba(240,45,109,0.28)" : T.border}`,
                  borderRadius: 12,
                  background: overdue ? "rgba(240,45,109,0.04)" : T.card,
                  transition: "all .15s",
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
                    background: status.type === "in" ? T.successDim : status.type === "out" ? T.dangerDim : T.accentDim,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: status.type === "in" ? T.success : status.type === "out" ? T.danger : T.accent,
                    fontWeight: 800, fontSize: 16, border: `2px solid ${status.type === "in" ? T.success : status.type === "out" ? T.danger : T.border}`,
                  }}>{(member.full_name || "?")[0]}</div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{member.full_name}</span>
                      {overdue && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                          background: T.dangerDim, color: T.danger, border: "1px solid rgba(240,45,109,.22)" }}>FEES DUE</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: T.textMuted }}>
                      <span className="g-mono">{displayCode(member)}</span> · {member.membership_tier_id || "—"}
                    </div>
                    {status.type === "out" && (
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                        In: {status.inTime?.slice(0,5)} — Out: {status.label.replace("OUT ", "")}
                      </div>
                    )}
                  </div>

                  {/* Status badge + manual override */}
                  <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    {status.type !== "none" && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                        background: status.bg, color: status.color }}>
                        {status.label}
                      </span>
                    )}
                    {/* Manual override — only shown when device hasn't punched or member is still inside */}
                    {status.type !== "out" && (
                      <button onClick={() => !loading && setOverrideModal({ member })}
                        title="Manual override — use only if device missed a punch"
                        style={{
                          padding: "4px 12px", borderRadius: 7, cursor: loading ? "not-allowed" : "pointer",
                          fontSize: 11, fontWeight: 700, opacity: loading ? 0.6 : 1,
                          border: `1.5px solid ${T.border}`,
                          background: T.bg, color: T.textSecondary,
                          transition: "all .15s", display: "flex", alignItems: "center", gap: 5,
                        }}>
                        {loading
                          ? <><span className="spin" style={{ width:10, height:10, borderRadius:"50%", border:`2px solid currentColor`, borderTopColor:"transparent", display:"inline-block" }} /> Saving…</>
                          : "✍️ Override"
                        }
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {filteredMembers.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>No members found</div>
            )}
          </div>
        </Card>

        {/* ── TODAY'S LOG ─────────────────────────────────────── */}
        <Card style={{ position: "sticky", top: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="g-head" style={{ fontSize: 20 }}>TODAY'S LOG</div>
            <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{historyLog.filter(l => l.date === todayKey).length} punches</span>
          </div>

          <div style={{ maxHeight: 520, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {historyLog.filter(l => l.date === todayKey).length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: T.textMuted }}>
                <div style={{ fontSize: 36, marginBottom: 10, opacity: .3 }}>📋</div>
                <div style={{ fontSize: 13 }}>No punches recorded today</div>
                <div style={{ fontSize: 11, marginTop: 6, opacity: 0.7 }}>
                  Waiting for device data…
                </div>
              </div>
            ) : historyLog.filter(l => l.date === todayKey).map((entry) => (
              <div key={entry.id} className="fade-up" style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                borderRadius: 10,
                background: entry.type === "IN" ? "rgba(11,173,124,0.07)" : "rgba(240,45,109,0.07)",
                border: `1px solid ${entry.type === "IN" ? "rgba(11,173,124,0.22)" : "rgba(240,45,109,0.22)"}`,
              }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                  background: entry.type === "IN" ? T.successDim : T.dangerDim,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, color: entry.type === "IN" ? T.success : T.danger, fontWeight: 800 }}>
                  {(entry.memberName || "?")[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.memberName}
                    {entry.manual && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: T.warning, fontWeight: 700 }}>MANUAL</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{entry.membership}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: entry.type === "IN" ? T.success : T.danger }}>
                    {entry.type === "IN" ? "⬇ IN" : "⬆ OUT"}
                  </div>
                  <div className="g-mono" style={{ fontSize: 11, color: T.textMuted }}>{entry.time.slice(0,5)}</div>
                </div>
              </div>
            ))}
          </div>

          {presentToday > 0 && (
            <div style={{ marginTop: 14, padding: "12px 14px", background: T.bg, borderRadius: 10, border: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: T.textMuted, fontWeight: 600 }}>Attendance Rate</span>
                <span style={{ color: T.accent, fontWeight: 700 }}>{Math.round((presentToday / members.length) * 100)}%</span>
              </div>
              <div style={{ height: 6, background: T.border, borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.round((presentToday / members.length) * 100)}%`,
                  background: `linear-gradient(90deg, ${T.accent}, ${T.purple})`,
                  borderRadius: 999, transition: "width .5s ease" }} />
              </div>
            </div>
          )}

          {/* Device info box */}
          <div style={{ marginTop: 14, padding: "10px 14px", background: T.accentDim, borderRadius: 10,
            border: `1px solid rgba(79,70,229,0.2)`, fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: T.accent, marginBottom: 4 }}>📡 Device-Driven Mode</div>
            <div style={{ color: T.textMuted, lineHeight: 1.6 }}>
              Punches are recorded by the biometric device → <span className="g-mono">raw_punches</span> → backend processes into <span className="g-mono">attendance</span>. This view auto-refreshes every {ATTENDANCE_POLL_MS / 1000}s.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SECTION 11: DASHBOARD
// ═══════════════════════════════════════════════════════════════

const formatKpiValue = (format, value) => {
  if (format === "currency_k") return `PKR ${(value / 1000).toFixed(1)}K`;
  if (format === "currency")   return `PKR ${Number(value).toLocaleString()}`;
  if (format === "number")     return Number(value).toLocaleString();
  return String(value);
};

const KpiCard = ({ config, stats, index }) => {
  const src   = stats[config.dataSource] || {};
  const value = src[config.valueKey] ?? 0;
  const chg   = config.changeKey ? (stats[config.changeKey] ?? null) : null;
  return (
    <Card className={`fade-up s${index + 1}`} style={{ cursor: "default", padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <SectionLabel>{config.label}</SectionLabel>
          <div className="g-head" style={{ fontSize: 38, color: config.color, lineHeight: 1.1 }}>
            {formatKpiValue(config.format, value)}
          </div>
          {config.subTemplate && (
            <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 6 }}>{config.subTemplate}</div>
          )}
          {chg != null && (
            <div style={{ fontSize: 12, color: chg >= 0 ? T.success : T.danger, marginTop: 4, fontWeight: 600 }}>
              {chg >= 0 ? "↑" : "↓"} {Math.abs(chg)}% vs last month
            </div>
          )}
        </div>
        <div style={{ fontSize: 28, padding: "10px", borderRadius: 12,
          background: `${config.color}14`, border: `1px solid ${config.color}22` }}>{config.icon}</div>
      </div>
    </Card>
  );
};

const DynamicChart = ({ config, stats }) => {
  const data = stats[config.dataSource] || [];
  const cc   = { background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", boxShadow: T.shadowMd };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={cc}>
        {label && <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6, fontWeight: 600 }}>{label}</div>}
        {payload.map(p => (
          <div key={p.name} style={{ color: p.color || T.accent, fontSize: 13, marginBottom: 2 }}>
            {p.name}: <strong>{typeof p.value === "number" && p.value > 999 ? `PKR ${p.value.toLocaleString()}` : p.value}</strong>
          </div>
        ))}
      </div>
    );
  };

  const renderChart = () => {
    switch (config.type) {
      case "area":
        return (
          <AreaChart data={data}>
            <defs>
              {config.series.map(s => (
                <linearGradient key={s.gradientId} id={s.gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={s.color} stopOpacity={0.22} />
                  <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
            <XAxis dataKey={config.xKey} tick={{ fill: T.textMuted, fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: T.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={config.yFormatter} />
            <Tooltip content={<CustomTooltip />} />
            {config.series.map(s => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label}
                stroke={s.color} fill={`url(#${s.gradientId})`} strokeWidth={2.5}
                dot={{ fill: s.color, r: 3, strokeWidth: 0 }} />
            ))}
          </AreaChart>
        );
      case "pie":
        return (
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={88}
              paddingAngle={3} dataKey={config.valueKey} nameKey={config.nameKey}>
              {data.map((e, i) => <Cell key={i} fill={e[config.colorKey]} />)}
            </Pie>
            <Tooltip contentStyle={cc} formatter={(v, n) => [`${v} members`, n]} />
            <Legend formatter={v => <span style={{ color: T.textSecondary, fontSize: 13 }}>{v}</span>} />
          </PieChart>
        );
      case "line":
        return (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
            <XAxis dataKey={config.xKey} tick={{ fill: T.textMuted, fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: T.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            {config.series.map(s => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label}
                stroke={s.color} strokeWidth={2.5}
                dot={{ fill: s.color, r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} />
            ))}
          </LineChart>
        );
      default:
        return <div style={{ color: T.textMuted }}>Unknown chart type: {config.type}</div>;
    }
  };

  return (
    <Card style={{ gridColumn: config.gridCol === "2" ? "span 2" : undefined, padding: 24 }} className="fade-up">
      <div style={{ marginBottom: 16 }}>
        <div className="g-head" style={{ fontSize: 18 }}>{config.title}</div>
        <div style={{ fontSize: 12, color: T.textMuted }}>{config.subtitle}</div>
      </div>
      {data.length === 0 ? (
        <div style={{ height: 220, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 10, background: T.bg, borderRadius: 12,
          border: `1.5px dashed ${T.border}` }}>
          <div style={{ fontSize: 32, opacity: 0.3 }}>📊</div>
          <div style={{ fontSize: 13, color: T.textMuted, fontWeight: 500 }}>No data yet — add records to see trends</div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>{renderChart()}</ResponsiveContainer>
      )}
    </Card>
  );
};

const DASH_PERIODS = [
  { id: "today",  label: "Today",      icon: "📅" },
  { id: "week",   label: "This Week",  icon: "📆" },
  { id: "month",  label: "This Month", icon: "🗓" },
  { id: "custom", label: "Custom",     icon: "🔍" },
];

const DashboardPage = () => {
  const { kpiConfig, chartConfig } = useApp();
  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [period,     setPeriod]     = useState("month");
  const [customFrom, setCustomFrom] = useState(new Date().toISOString().slice(0,10));
  const [customTo,   setCustomTo]   = useState(new Date().toISOString().slice(0,10));

  const getPeriodDates = (p) => {
    const today = new Date().toISOString().slice(0, 10);
    if (p === "today") return { from: today, to: today };
    if (p === "week")  { const d = new Date(); d.setDate(d.getDate()-6); return { from: d.toISOString().slice(0,10), to: today }; }
    if (p === "month") return { from: `${today.slice(0,7)}-01`, to: today };
    return { from: customFrom, to: customTo };
  };

  const loadStats = (p) => {
    setLoading(true);
    const { from, to } = getPeriodDates(p);
    API_ENDPOINTS.getDashboardStatsByDate(from, to).then(d => { setStats(d); setLoading(false); });
  };

  useEffect(() => { loadStats(period); }, [period]);
  // reload when custom dates change
  useEffect(() => { if (period === "custom") loadStats("custom"); }, [customFrom, customTo]);

  return (
    <div className="fade-up">
      {/* Header + Period Selector */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 className="g-head" style={{ fontSize: 46 }}>COMMAND CENTER</h1>
          <p style={{ color: T.textMuted, fontSize: 14, marginTop: 4 }}>
            Real-time overview · {new Date().toLocaleDateString("en-US", { month:"long", year:"numeric" })}
          </p>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          {DASH_PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)} style={{
              padding:"8px 16px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13,
              fontFamily:"inherit", transition:"all .15s",
              border:`2px solid ${period===p.id ? T.accent : T.border}`,
              background: period===p.id ? T.accentDim : T.card,
              color: period===p.id ? T.accent : T.textSecondary,
            }}>{p.icon} {p.label}</button>
          ))}
          {period === "custom" && (
            <>
              <input type="date" className="input" style={{ width:145, height:38 }}
                value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
              <span style={{ color:T.textMuted, fontWeight:600 }}>→</span>
              <input type="date" className="input" style={{ width:145, height:38 }}
                value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </>
          )}
        </div>
      </div>

      {loading ? <LoadingOverlay label="Loading dashboard…" /> : (<>
        {/* KPI Cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:16, marginBottom:24 }}>
          {kpiConfig.map((cfg, i) => <KpiCard key={cfg.id} config={cfg} stats={stats} index={i} />)}
        </div>
        {/* Charts — centered */}
        <div style={{ display:"flex", justifyContent:"center", gap:16, marginBottom:20, flexWrap:"wrap" }}>
          {chartConfig.map(cfg => (
            <div key={cfg.id} style={{ flex:"1 1 420px", maxWidth:600 }}>
              <DynamicChart config={cfg} stats={stats} />
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SECTION 12: BILLING PAGE  (Individual + Month-End Bulk)
// ═══════════════════════════════════════════════════════════════

// ── BILL STORE — persisted to localStorage so data survives reload ──
// { [memberId]: { status: "paid"|"unpaid", dueDate, amount, month } }
const _LS_BILL_KEY     = "gymos_bill_store";
const _LS_FEE_KEY      = "gymos_fee_overrides";
const _LS_REG_KEY      = "gymos_reg_paid"; // Set<memberId> — who has paid reg fee
const _LS_BILLS_CACHE  = "gymos_bills_cache"; // { [month]: { bills: [], savedAt: ISO } }
const _loadLS = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; } };
const _saveLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// Bills cache helpers — full generatedBills array keyed by month
const _saveBillsCache  = (month, bills) => {
  const cache = _loadLS(_LS_BILLS_CACHE);
  cache[month] = { bills, savedAt: new Date().toISOString() };
  _saveLS(_LS_BILLS_CACHE, cache);
};
const _loadBillsCache  = (month) => {
  const cache = _loadLS(_LS_BILLS_CACHE);
  return cache[month]?.bills || null;
};
const _clearBillsCache = (month) => {
  const cache = _loadLS(_LS_BILLS_CACHE);
  delete cache[month];
  _saveLS(_LS_BILLS_CACHE, cache);
};
const _getAllCachedMonths = () => {
  const cache = _loadLS(_LS_BILLS_CACHE);
  return Object.entries(cache)
    .sort((a,b) => b[0].localeCompare(a[0])) // newest first
    .map(([month, val]) => ({ month, savedAt: val.savedAt, count: val.bills?.length || 0,
      total: (val.bills||[]).reduce((s,b)=>s+b.total,0) }));
};

const _billStore    = _loadLS(_LS_BILL_KEY);
const _feeOverrides = _loadLS(_LS_FEE_KEY);
const _regPaid     = new Set(JSON.parse(localStorage.getItem(_LS_REG_KEY) || "[]"));
const _markRegPaid = (memberId) => { _regPaid.add(memberId); try { localStorage.setItem(_LS_REG_KEY, JSON.stringify([..._regPaid])); } catch {} };
const hasPayedReg  = (memberId) => _regPaid.has(memberId);

const _setBill = (memberId, data) => { _billStore[memberId] = data; _saveLS(_LS_BILL_KEY, _billStore); };
const _setFeeOverride = (memberId, fee) => { _feeOverrides[memberId] = fee; _saveLS(_LS_FEE_KEY, _feeOverrides); };

const getBillForMember = (memberId) => _billStore[memberId] || null;
const isMemberOverdueFromBills = (memberId) => {
  const bill = _billStore[memberId];
  if (!bill) return false;
  if (bill.status === "paid") return false;
  return new Date(bill.dueDate) < new Date();
};

// ── BULK BILLING TAB ────────────────────────────────────────────
const BulkBillingTab = () => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month,          setMonth]          = useState(currentMonth);
  const [members,        setMembers]        = useState([]);
  const [trainers,       setTrainers]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [generating,     setGenerating]     = useState(false);
  const [loadingExisting,setLoadingExisting]= useState(false);
  const [error,          setError]          = useState("");

  // ── Restore from localStorage cache immediately on mount ───────
  const _initCached = _loadBillsCache(currentMonth);
  const [generatedBills, setGeneratedBills] = useState(_initCached || []);
  const [billsGenerated, setBillsGenerated] = useState(!!_initCached && _initCached.length > 0);

  const [tierMap,        setTierMap]        = useState({});
  const [confirmOpen,    setConfirmOpen]    = useState(false);
  const [searchQ,        setSearchQ]        = useState("");
  const [filterStatus,   setFilterStatus]   = useState("all"); // "all"|"paid"|"unpaid"
  const [viewBillsOpen,  setViewBillsOpen]  = useState(false); // persistent preview modal
  const [historyOpen,    setHistoryOpen]    = useState(false); // past months history
  const [historyBills,   setHistoryBills]   = useState([]);    // bills being previewed in history
  const [historyMonth,   setHistoryMonth]   = useState("");    // which month in history view
  const cachedMonths = _getAllCachedMonths();

  // ── Load members + tiers + trainers from DB ─────────────────
  // ── Load members + tiers + trainers, THEN load existing bills ──
  // Race condition fix: call loadExistingBillsWithMap only after tierMap is ready
  useEffect(() => {
    setLoading(true);
    Promise.all([
      API_ENDPOINTS.getData("members"),
      gymService.getTiers().catch(() => ({ data: [] })),
      gymService.getTrainers().catch(() => ({ data: [] })),
    ]).then(([membersData, tiersRes, trainersRes]) => {
      const activeMembers = membersData.filter(m => m.status === "active");
      setMembers(activeMembers);

      const trainerRows = trainersRes?.data?.items || trainersRes?.data || [];
      const tmap = {};
      trainerRows.forEach(t => { tmap[t.id] = t; tmap[t.trainer_code] = t; });
      setTrainers(tmap);

      const apiTiers = tiersRes?.data || [];
      const map = {};
      apiTiers.forEach(at => {
        const slug  = (at.tier_id || at.name || "").toLowerCase();
        const local = TIER_CONFIG.find(t => t.id === slug)
                   || TIER_CONFIG.find(t => (at.name||"").toLowerCase().includes(t.id))
                   || TIER_CONFIG[0];
        const uuid  = at.id || at.tier_id;
        const entry = { uuid, slug, fee: Number(at.monthly_fee ?? at.fee ?? local.fee ?? 0),
          label: at.name || local.label, color: local.color || "#4F46E5", icon: local.icon || "🏆" };
        if (uuid) map[uuid] = entry;
        if (slug) map[slug] = entry;
      });
      setTierMap(map);
      setLoading(false);

      // ✅ tierMap is now ready — load existing bills (race condition resolved)
      loadExistingBillsWithMap(month, map, tmap, activeMembers);
    }).catch(() => setLoading(false));
  }, []);

  // ── Month change → restore from cache first, then reload from API ─
  useEffect(() => {
    if (!month || loading) return;
    const cached = _loadBillsCache(month);
    if (cached && cached.length > 0) {
      setGeneratedBills(cached);
      setBillsGenerated(true);
    } else {
      setBillsGenerated(false);
      setGeneratedBills([]);
    }
    setError("");
    loadExistingBillsWithMap(month, tierMap, trainers, members);
  }, [month]);

  // ── loadExistingBillsWithMap: accepts maps as direct args (avoids stale closure issues) ─
  const loadExistingBillsWithMap = async (billingMonth, tMap, trMap, membersList) => {
    setLoadingExisting(true);
    try {
      const res = await api.get(`/api/v1/billing/invoices?billing_month=${billingMonth}`);
      const invoices = res?.data?.items || res?.data || [];
      if (invoices.length > 0) {
        const memberById = {};
        (membersList || []).forEach(m => { memberById[m.id] = m; });

        const dueDate = getDefaultDueDate(billingMonth);
        const rows = invoices.map(inv => {
          const member = memberById[inv.member_id] || {};
          const tierVal = member.membership_tier_id || inv.membership_tier_id || "";
          const td = (tMap||{})[tierVal] || (tMap||{})[(tierVal||"").toLowerCase()] || null;
          const tierInfo = td
            ? { id: td.slug, label: td.label, color: td.color, icon: td.icon, fee: td.fee }
            : (TIER_CONFIG.find(t => t.id === (tierVal||"").toLowerCase()) || TIER_CONFIG[0]);

          // Priority: invoice amount (saved in DB) > member.monthly_fee > tier fee
          const invAmount = Number(inv.amount || 0);
          const memberFee = Number(member.monthly_fee || 0);
          const memberCustomFee = invAmount > 0 ? invAmount : (memberFee > 0 ? memberFee : (td?.fee || tierInfo.fee || 0));
          const trainerObj = (trMap||{})[member.trainer_id] || null;
          const trainerFee = trainerObj ? Number(trainerObj.hourly_rate || 0) : 0;

          return {
            id:          inv.member_id || member.id,
            invoiceId:   inv.id,
            full_name:   member.full_name || inv.member_name || "—",
            member_code: member.member_code || "—",
            email:       member.email || "",
            phone:       member.phone || "",
            tier:        { ...tierInfo, fee: memberCustomFee || tierInfo.fee },
            tierUuid:    td?.uuid || tierVal || undefined,
            baseFee:     memberCustomFee,
            trainerName: trainerObj?.full_name || null,
            trainerFee,
            total:       memberCustomFee,
            status:      inv.status === "paid" ? "paid" : "unpaid",
            dueDate:     inv.due_date || dueDate,
          };
        });
        setGeneratedBills(rows);
        setBillsGenerated(true);
        rows.forEach(r => { _setBill(r.id, { status: r.status, dueDate: r.dueDate, amount: r.total, month: billingMonth }); });
        // ✅ Cache to localStorage so table survives navigation/reload
        _saveBillsCache(billingMonth, rows);
      }
    } catch { /* No existing invoices — show preview */ }
    setLoadingExisting(false);
  };

  const getDefaultDueDate = (m) => {
    const [y, mo] = m.split("-").map(Number);
    return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2,"0")}`;
  };

  // ── Build bill preview from members table ────────────────────
  const calcMemberBill = (member) => {
    const tierVal  = (member.membership_tier_id || "").toLowerCase();
    const td       = tierMap[tierVal] || tierMap[member.membership_tier_id] || null;
    const tierInfo = td
      ? { id: td.slug, label: td.label, color: td.color, icon: td.icon }
      : (TIER_CONFIG.find(t => t.id === tierVal) || TIER_CONFIG[0]);

    // Fee = dynamic sum of exercises assigned to this tier
    const liveTierFee = getTierFee(tierVal);

    // If member has a custom fee saved (via FeesDialog), use that; else use live tier fee
    const memberCustomFee = member.monthly_fee ? Number(member.monthly_fee) : null;
    const baseFee         = memberCustomFee && memberCustomFee > 0 ? memberCustomFee : liveTierFee;

    const trainerObj  = trainers[member.trainer_id] || null;
    const trainerFee  = trainerObj ? Number(trainerObj.hourly_rate || 0) : 0;
    const tierOnlyFee = baseFee - trainerFee;

    const sessions     = getSessionsForMonth(member.id, month);
    const sessionTotal = sessions.reduce((s, sess) => s + (sess.price || 0), 0);

    return {
      id:          member.id,
      full_name:   member.full_name,
      member_code: member.member_code || member.id,
      email:       member.email || "",
      phone:       member.phone || "",
      tier:        { ...tierInfo, fee: baseFee },
      tierUuid:    td?.uuid || member.membership_tier_id || undefined,
      baseFee,
      tierOnlyFee: tierOnlyFee > 0 ? tierOnlyFee : baseFee,
      trainerName: trainerObj?.full_name || null,
      trainerFee,
      sessionTotal,
      total:       baseFee + sessionTotal,
    };
  };

  const previewBills = members.map(calcMemberBill);
  const totalAmount  = previewBills.reduce((s, b) => s + b.total, 0);

  // ── Generate bills → save to DB ──────────────────────────────
  const handleGenerate = async () => {
    setConfirmOpen(false);
    setGenerating(true); setError("");
    const dueDate = getDefaultDueDate(month);
    try {
      const rows = [];
      for (const bill of previewBills) {
        let invoiceId = null;
        try {
          const inv = await gymService.createInvoice({
            member_id:          bill.id,
            billing_month:      month,
            membership_tier_id: bill.tierUuid || undefined,
            amount:             bill.total,
            due_date:           dueDate,
            status:             "unpaid",
          });
          invoiceId = inv?.data?.id || null;
        } catch (err) {
          const s = err?.response?.status;
          if (s !== 409) console.warn("Invoice create failed:", bill.full_name, err?.response?.data?.detail);
          // 409 = already exists — try to get existing invoice id
          try {
            const existing = await api.get(`/api/v1/billing/invoices?billing_month=${month}&member_id=${bill.id}`);
            const existArr = existing?.data?.items || existing?.data || [];
            invoiceId = existArr[0]?.id || null;
          } catch {}
        }
        const row = { ...bill, status: "unpaid", dueDate, invoiceId };
        rows.push(row);
        _setBill(bill.id, { status:"unpaid", dueDate, amount:bill.total, month });
      }
      setGeneratedBills(rows);
      setBillsGenerated(true);
      // ✅ Cache to localStorage so table survives navigation/reload
      _saveBillsCache(month, rows);
      toast.success(`✅ Bills generated for ${rows.length} members!`);
    } catch (err) {
      setError(err.message || "Billing failed");
      toast.error("Billing failed. Please try again.");
    } finally { setGenerating(false); }
  };

  // ── Toggle paid/unpaid → save to DB ─────────────────────────
  const handleStatusToggle = async (memberId) => {
    const current = generatedBills.find(b => b.id === memberId);
    if (!current) return;
    const newStatus = current.status === "paid" ? "unpaid" : "paid";
    setGeneratedBills(prev => {
      const updated = prev.map(b => {
        if (b.id !== memberId) return b;
        if (_billStore[memberId]) { _billStore[memberId].status = newStatus; _saveLS(_LS_BILL_KEY, _billStore); }
        return { ...b, status: newStatus };
      });
      _saveBillsCache(month, updated); // ✅ Sync cache
      return updated;
    });
    if (current.invoiceId) {
      try {
        if (newStatus === "paid") {
          await gymService.markInvoicePaid(current.invoiceId);
        } else {
          await api.patch(`/api/v1/billing/invoices/${current.invoiceId}`, { status: "unpaid" }).catch(() => {});
        }
      } catch {}
    }
  };

  const handleDueDateChange = (memberId, newDate) => {
    setGeneratedBills(prev => {
      const updated = prev.map(b => {
        if (b.id !== memberId) return b;
        if (_billStore[memberId]) { _billStore[memberId].dueDate = newDate; _saveLS(_LS_BILL_KEY, _billStore); }
        return { ...b, dueDate: newDate };
      });
      _saveBillsCache(month, updated); // ✅ Sync cache
      return updated;
    });
  };

  // ── Filtered bills for table ─────────────────────────────────
  const filteredBills = useMemo(() => {
    let bills = billsGenerated ? generatedBills : previewBills;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      bills = bills.filter(b => b.full_name?.toLowerCase().includes(q) || b.member_code?.toLowerCase().includes(q));
    }
    if (filterStatus !== "all" && billsGenerated) {
      bills = bills.filter(b => b.status === filterStatus);
    }
    return bills;
  }, [generatedBills, previewBills, billsGenerated, searchQ, filterStatus]);

  const paidCount    = generatedBills.filter(b => b.status === "paid").length;
  const unpaidCount  = generatedBills.length - paidCount;
  const collectedAmt = generatedBills.filter(b => b.status === "paid").reduce((s,b) => s+b.total, 0);
  const pendingAmt   = generatedBills.filter(b => b.status === "unpaid").reduce((s,b) => s+b.total, 0);

  if (loading) return <LoadingOverlay label="Loading members & tiers…" />;

  return (
    <div className="fade-up">
      {/* ── View Bills Modal (persistent — survives navigation) ─── */}
      {viewBillsOpen && (
        <div className="modal-bg fade-in" style={{ zIndex:4000 }}>
          <div className="g-card fade-up" style={{ width:"100%", maxWidth:880, maxHeight:"90vh", display:"flex", flexDirection:"column", padding:0, overflow:"hidden" }}>
            {/* Modal Header */}
            <div style={{ padding:"20px 24px", borderBottom:`1.5px solid ${T.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:T.surface, flexShrink:0 }}>
              <div>
                <div className="g-head" style={{ fontSize:18 }}>📋 Bills — {month}</div>
                <div style={{ fontSize:12, color:T.textMuted, marginTop:3 }}>
                  {generatedBills.length} members •{" "}
                  <span style={{ color:T.success }}>✅ {generatedBills.filter(b=>b.status==="paid").length} paid</span>{" "}•{" "}
                  <span style={{ color:T.danger }}>⏳ {generatedBills.filter(b=>b.status==="unpaid").length} unpaid</span>
                  <span style={{ marginLeft:8, color:T.textMuted }}>• Click status ya date to edit</span>
                </div>
              </div>
              <button onClick={() => setViewBillsOpen(false)}
                style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:T.textMuted, lineHeight:1, padding:"4px 8px" }}>✕</button>
            </div>

            {/* Modal Search + Filter */}
            <div style={{ padding:"12px 24px", borderBottom:`1px solid ${T.border}`, background:T.card, flexShrink:0, display:"flex", gap:8, alignItems:"center" }}>
              <input className="input" placeholder="🔍 Search member…"
                style={{ flex:1, height:36 }}
                onChange={e => setSearchQ(e.target.value)}
                value={searchQ} />
              <div style={{ display:"flex", gap:6 }}>
                {["all","paid","unpaid"].map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    style={{ padding:"5px 12px", borderRadius:7, fontWeight:700, fontSize:11,
                      fontFamily:"inherit", cursor:"pointer", transition:"all .15s",
                      border:`1.5px solid ${filterStatus===s ? T.accent : T.border}`,
                      background: filterStatus===s ? T.accentDim : T.card,
                      color: filterStatus===s ? T.accent : T.textMuted }}>
                    {s==="all" ? "All" : s==="paid" ? "✅ Paid" : "⏳ Unpaid"}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Table */}
            <div style={{ overflowY:"auto", flex:1 }}>
              {/* Table Header */}
              <div style={{ padding:"10px 24px", background:T.surface, borderBottom:`1.5px solid ${T.border}`,
                display:"grid", gridTemplateColumns:"2fr 120px 90px 140px 120px", gap:10, alignItems:"center",
                position:"sticky", top:0, zIndex:10 }}>
                {["MEMBER","TIER","TOTAL","DUE DATE","STATUS"].map(h => (
                  <div key={h} style={{ fontSize:10, fontWeight:800, color:T.textMuted, letterSpacing:"0.1em" }}>{h}</div>
                ))}
              </div>
              {/* Rows */}
              {filteredBills.length === 0 ? (
                <div style={{ textAlign:"center", padding:"40px", color:T.textMuted }}>
                  <div style={{ fontSize:32, opacity:.3, marginBottom:8 }}>🧾</div>
                  <p>No results found</p>
                </div>
              ) : filteredBills.map((b, i) => (
                <div key={b.id} style={{
                  display:"grid", gridTemplateColumns:"2fr 120px 90px 140px 120px",
                  padding:"10px 24px", gap:10, alignItems:"center",
                  background: b.status==="unpaid" && new Date(b.dueDate)<new Date()
                    ? "rgba(240,45,109,0.03)" : i%2===0 ? T.card : T.surface,
                  borderBottom:`1px solid ${T.border}`,
                  borderLeft:`3px solid ${b.status==="paid" ? T.success : new Date(b.dueDate)<new Date() ? T.danger : T.border}`,
                  transition:"background .15s" }}>
                  {/* Member */}
                  <div style={{ display:"flex", alignItems:"center", gap:9, minWidth:0 }}>
                    <div style={{ width:30, height:30, borderRadius:"50%", flexShrink:0,
                      background:`${b.tier.color}14`, display:"flex", alignItems:"center", justifyContent:"center",
                      color:b.tier.color, fontWeight:800, fontSize:12, border:`2px solid ${b.tier.color}28` }}>
                      {(b.full_name||"?")[0]}
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{b.full_name}</div>
                      <div style={{ fontSize:10, color:T.textMuted }}>{displayCode(b)}</div>
                    </div>
                  </div>
                  {/* Tier */}
                  <span style={{ padding:"3px 8px", borderRadius:20, fontSize:11, fontWeight:700,
                    background:`${b.tier.color}14`, color:b.tier.color, border:`1px solid ${b.tier.color}28`, whiteSpace:"nowrap" }}>
                    {b.tier.icon} {b.tier.label}
                  </span>
                  {/* Total */}
                  <span className="g-mono" style={{ fontSize:13, fontWeight:800, color:T.accent }}>
                    Rs.{b.total.toLocaleString()}
                  </span>
                  {/* Due Date — editable */}
                  <input type="date" value={b.dueDate || ""}
                    onChange={e => handleDueDateChange(b.id, e.target.value)}
                    style={{ padding:"4px 8px", borderRadius:7, fontSize:11, fontFamily:"inherit",
                      border:`1.5px solid ${new Date(b.dueDate)<new Date() && b.status==="unpaid" ? T.danger : T.border}`,
                      background:T.bg, color: new Date(b.dueDate)<new Date() && b.status==="unpaid" ? T.danger : T.text,
                      fontWeight: new Date(b.dueDate)<new Date() && b.status==="unpaid" ? 700 : 400,
                      outline:"none", cursor:"pointer", width:"100%" }} />
                  {/* Status toggle — editable */}
                  <button onClick={() => handleStatusToggle(b.id)}
                    style={{ padding:"5px 10px", borderRadius:8, cursor:"pointer", fontSize:11,
                      fontWeight:800, fontFamily:"inherit", transition:"all .2s", whiteSpace:"nowrap",
                      border:`1.5px solid ${b.status==="paid" ? T.success : T.danger}`,
                      background: b.status==="paid" ? T.successDim : T.dangerDim,
                      color: b.status==="paid" ? T.success : T.danger }}>
                    {b.status==="paid" ? "✅ PAID" : "⏳ UNPAID"}
                  </button>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div style={{ padding:"14px 24px", borderTop:`1.5px solid ${T.border}`, background:T.surface,
              display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
              <div style={{ display:"flex", gap:16, fontSize:12 }}>
                <span style={{ color:T.success, fontWeight:700 }}>✅ Rs.{generatedBills.filter(b=>b.status==="paid").reduce((s,b)=>s+b.total,0).toLocaleString()} collected</span>
                <span style={{ color:T.danger, fontWeight:700 }}>⏳ Rs.{generatedBills.filter(b=>b.status==="unpaid").reduce((s,b)=>s+b.total,0).toLocaleString()} pending</span>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <span className="g-head" style={{ fontSize:15, color:T.accent }}>
                  Total: Rs.{generatedBills.reduce((s,b)=>s+b.total,0).toLocaleString()}
                </span>
                <Btn variant="ghost" size="sm" onClick={() => setViewBillsOpen(false)}>Close</Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bill History Modal (all months — fully editable) ──────── */}
      {historyOpen && (
        <div className="modal-bg fade-in" style={{ zIndex:4000 }}>
          <div className="g-card fade-up" style={{ width:"100%", maxWidth: historyMonth ? 880 : 520, maxHeight:"90vh", display:"flex", flexDirection:"column", padding:0, overflow:"hidden", transition:"max-width .25s" }}>
            {/* Header */}
            <div style={{ padding:"20px 24px", borderBottom:`1.5px solid ${T.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:T.surface, flexShrink:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                {historyMonth && (
                  <button onClick={() => { setHistoryMonth(""); setHistoryBills([]); }}
                    style={{ background:"none", border:"none", cursor:"pointer", color:T.accent, fontSize:20, padding:"0 6px", fontWeight:700 }}>←</button>
                )}
                <div>
                  <div className="g-head" style={{ fontSize:18 }}>
                    🕐 {historyMonth ? `Bills — ${historyMonth}` : "Bill History"}
                  </div>
                  <div style={{ fontSize:12, color:T.textMuted, marginTop:2 }}>
                    {historyMonth
                      ? `${(historyBills||[]).length} members • Click status ya date to edit`
                      : `${cachedMonths.length} months saved locally`}
                  </div>
                </div>
              </div>
              <button onClick={() => { setHistoryOpen(false); setHistoryMonth(""); setHistoryBills([]); }}
                style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:T.textMuted, padding:"4px 8px" }}>✕</button>
            </div>

            <div style={{ overflowY:"auto", flex:1 }}>
              {!historyMonth ? (
                /* ── Month list ── */
                <div style={{ padding:16, display:"flex", flexDirection:"column", gap:10 }}>
                  {cachedMonths.length === 0 ? (
                    <div style={{ textAlign:"center", padding:40, color:T.textMuted }}>
                      <div style={{ fontSize:32, opacity:.3, marginBottom:8 }}>🗂</div>
                      <p>No saved bills found</p>
                    </div>
                  ) : cachedMonths.map(cm => {
                    const bills = _loadBillsCache(cm.month) || [];
                    const paid   = bills.filter(b=>b.status==="paid").length;
                    const unpaid = bills.length - paid;
                    return (
                      <div key={cm.month}
                        onClick={() => { setHistoryBills(_loadBillsCache(cm.month)||[]); setHistoryMonth(cm.month); }}
                        style={{ padding:"14px 18px", borderRadius:12, border:`1.5px solid ${T.border}`,
                          background:T.card, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center",
                          transition:"all .15s" }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = T.accent}
                        onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                        <div>
                          <div style={{ fontWeight:800, fontSize:15, color:T.text }}>{cm.month}</div>
                          <div style={{ fontSize:12, color:T.textMuted, marginTop:3, display:"flex", gap:10 }}>
                            <span>{cm.count} members</span>
                            <span style={{ color:T.success }}>✅ {paid} paid</span>
                            <span style={{ color:T.danger }}>⏳ {unpaid} unpaid</span>
                          </div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div className="g-head" style={{ fontSize:16, color:T.accent }}>Rs.{cm.total.toLocaleString()}</div>
                          <div style={{ fontSize:11, color:T.textMuted, marginTop:3 }}>→ View & Edit</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* ── Bills table for selected month — EDITABLE ── */
                <>
                  {/* Sub-toolbar: search + filter */}
                  <div style={{ padding:"10px 24px", borderBottom:`1px solid ${T.border}`, background:T.card, display:"flex", gap:8, alignItems:"center" }}>
                    <input className="input" placeholder="🔍 Search member…"
                      style={{ flex:1, height:34 }}
                      onChange={e => {
                        const q = e.target.value.toLowerCase();
                        const all = _loadBillsCache(historyMonth) || [];
                        setHistoryBills(q ? all.filter(b => b.full_name?.toLowerCase().includes(q) || b.member_code?.toLowerCase().includes(q)) : all);
                      }} />
                    <div style={{ display:"flex", gap:6 }}>
                      {["all","paid","unpaid"].map(s => {
                        const all = _loadBillsCache(historyMonth) || [];
                        return (
                          <button key={s}
                            onClick={() => setHistoryBills(s==="all" ? all : all.filter(b=>b.status===s))}
                            style={{ padding:"4px 10px", borderRadius:7, fontWeight:700, fontSize:11,
                              fontFamily:"inherit", cursor:"pointer", border:`1.5px solid ${T.border}`,
                              background:T.card, color:T.textMuted }}>
                            {s==="all" ? "All" : s==="paid" ? "✅ Paid" : "⏳ Unpaid"}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Table header */}
                  <div style={{ padding:"10px 24px", background:T.surface, borderBottom:`1.5px solid ${T.border}`,
                    display:"grid", gridTemplateColumns:"2fr 120px 90px 140px 120px", gap:10, alignItems:"center",
                    position:"sticky", top:0, zIndex:10 }}>
                    {["MEMBER","TIER","TOTAL","DUE DATE","STATUS"].map(h => (
                      <div key={h} style={{ fontSize:10, fontWeight:800, color:T.textMuted, letterSpacing:"0.1em" }}>{h}</div>
                    ))}
                  </div>

                  {/* Rows */}
                  {(historyBills||[]).map((b, i) => (
                    <div key={b.id} style={{
                      display:"grid", gridTemplateColumns:"2fr 120px 90px 140px 120px",
                      padding:"10px 24px", gap:10, alignItems:"center",
                      background: b.status==="unpaid" && new Date(b.dueDate)<new Date()
                        ? "rgba(240,45,109,0.03)" : i%2===0 ? T.card : T.surface,
                      borderBottom:`1px solid ${T.border}`,
                      borderLeft:`3px solid ${b.status==="paid" ? T.success : new Date(b.dueDate)<new Date() ? T.danger : T.border}`,
                      transition:"background .15s" }}>

                      {/* Member info */}
                      <div style={{ display:"flex", alignItems:"center", gap:9, minWidth:0 }}>
                        <div style={{ width:30, height:30, borderRadius:"50%", flexShrink:0,
                          background:`${b.tier?.color||T.accent}14`, display:"flex", alignItems:"center", justifyContent:"center",
                          color:b.tier?.color||T.accent, fontWeight:800, fontSize:12 }}>
                          {(b.full_name||"?")[0]}
                        </div>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontWeight:700, fontSize:13, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{b.full_name}</div>
                          <div style={{ fontSize:10, color:T.textMuted }}>{displayCode(b)}</div>
                        </div>
                      </div>

                      {/* Tier */}
                      <span style={{ padding:"3px 8px", borderRadius:20, fontSize:11, fontWeight:700,
                        background:`${b.tier?.color||T.accent}14`, color:b.tier?.color||T.accent,
                        border:`1px solid ${b.tier?.color||T.accent}28`, whiteSpace:"nowrap" }}>
                        {b.tier?.icon} {b.tier?.label}
                      </span>

                      {/* Total */}
                      <span className="g-mono" style={{ fontSize:13, fontWeight:800, color:T.accent }}>
                        Rs.{b.total.toLocaleString()}
                      </span>

                      {/* Due Date — editable */}
                      <input type="date" value={b.dueDate || ""}
                        onChange={e => {
                          const newDate = e.target.value;
                          setHistoryBills(prev => {
                            const updated = prev.map(x => x.id===b.id ? {...x, dueDate:newDate} : x);
                            // Persist to cache — merge into the full stored array
                            const full = _loadBillsCache(historyMonth) || [];
                            const merged = full.map(x => x.id===b.id ? {...x, dueDate:newDate} : x);
                            _saveBillsCache(historyMonth, merged);
                            // Also update current month state if same month
                            if (historyMonth === month) {
                              setGeneratedBills(merged);
                              if (_billStore[b.id]) { _billStore[b.id].dueDate = newDate; _saveLS(_LS_BILL_KEY, _billStore); }
                            }
                            // API sync if invoiceId available
                            if (b.invoiceId) {
                              api.patch(`/api/v1/billing/invoices/${b.invoiceId}`, { due_date: newDate }).catch(()=>{});
                            }
                            return updated;
                          });
                        }}
                        style={{ padding:"4px 8px", borderRadius:7, fontSize:11, fontFamily:"inherit",
                          border:`1.5px solid ${new Date(b.dueDate)<new Date() && b.status==="unpaid" ? T.danger : T.border}`,
                          background:T.bg, color: new Date(b.dueDate)<new Date() && b.status==="unpaid" ? T.danger : T.text,
                          fontWeight: new Date(b.dueDate)<new Date() && b.status==="unpaid" ? 700 : 400,
                          outline:"none", cursor:"pointer", width:"100%" }} />

                      {/* Status toggle — editable */}
                      <button
                        onClick={() => {
                          const newStatus = b.status==="paid" ? "unpaid" : "paid";
                          setHistoryBills(prev => {
                            const updated = prev.map(x => x.id===b.id ? {...x, status:newStatus} : x);
                            const full = _loadBillsCache(historyMonth) || [];
                            const merged = full.map(x => x.id===b.id ? {...x, status:newStatus} : x);
                            _saveBillsCache(historyMonth, merged);
                            // Sync current month state if same
                            if (historyMonth === month) {
                              setGeneratedBills(merged);
                              if (_billStore[b.id]) { _billStore[b.id].status = newStatus; _saveLS(_LS_BILL_KEY, _billStore); }
                            }
                            // API sync
                            if (b.invoiceId) {
                              if (newStatus==="paid") gymService.markInvoicePaid(b.invoiceId).catch(()=>{});
                              else api.patch(`/api/v1/billing/invoices/${b.invoiceId}`, { status:"unpaid" }).catch(()=>{});
                            }
                            return updated;
                          });
                        }}
                        style={{ padding:"5px 10px", borderRadius:8, cursor:"pointer", fontSize:11,
                          fontWeight:800, fontFamily:"inherit", transition:"all .2s", whiteSpace:"nowrap",
                          border:`1.5px solid ${b.status==="paid" ? T.success : T.danger}`,
                          background: b.status==="paid" ? T.successDim : T.dangerDim,
                          color: b.status==="paid" ? T.success : T.danger }}>
                        {b.status==="paid" ? "✅ PAID" : "⏳ UNPAID"}
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Footer */}
            {historyMonth && (
              <div style={{ padding:"14px 24px", borderTop:`1.5px solid ${T.border}`, background:T.surface,
                display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
                <div style={{ display:"flex", gap:16, fontSize:12 }}>
                  <span style={{ color:T.success, fontWeight:700 }}>
                    ✅ Rs.{(_loadBillsCache(historyMonth)||[]).filter(b=>b.status==="paid").reduce((s,b)=>s+b.total,0).toLocaleString()} collected
                  </span>
                  <span style={{ color:T.danger, fontWeight:700 }}>
                    ⏳ Rs.{(_loadBillsCache(historyMonth)||[]).filter(b=>b.status==="unpaid").reduce((s,b)=>s+b.total,0).toLocaleString()} pending
                  </span>
                </div>
                <span className="g-head" style={{ fontSize:15, color:T.accent }}>
                  Total: Rs.{(_loadBillsCache(historyMonth)||[]).reduce((s,b)=>s+b.total,0).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
        <div>
          <div className="g-head" style={{ fontSize:22 }}>MONTH-END BULK BILLING</div>
          <p style={{ color:T.textMuted, fontSize:13, marginTop:4 }}>
            Dynamically sourced from Members table • Stored in DB • Trainer fees included
          </p>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          {cachedMonths.length > 0 && (
            <Btn variant="ghost" size="sm" icon="🕐" onClick={() => setHistoryOpen(true)}>
              Bill History ({cachedMonths.length})
            </Btn>
          )}
          {billsGenerated && generatedBills.length > 0 && (
            <Btn size="sm" icon="👁" onClick={() => { setSearchQ(""); setFilterStatus("all"); setViewBillsOpen(true); }}>
              View Bills ({generatedBills.length})
            </Btn>
          )}
          {billsGenerated && (
            <Btn variant="ghost" size="sm" icon="↺" onClick={() => { setBillsGenerated(false); setGeneratedBills([]); setSearchQ(""); setFilterStatus("all"); }}>
              New Month
            </Btn>
          )}
        </div>
      </div>

      {/* ── Month Selector + Stats ──────────────────────────────── */}
      <Card style={{ marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:T.textMuted, letterSpacing:"0.08em", marginBottom:6 }}>BILLING MONTH</div>
            <input type="month" className="input" style={{ width:190 }}
              value={month}
              onChange={e => setMonth(e.target.value)}
              max={currentMonth} />
          </div>
          <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
            <div style={{ textAlign:"center" }}>
              <div className="g-head" style={{ fontSize:26, color:T.accent }}>{members.length}</div>
              <div style={{ fontSize:11, color:T.textMuted, fontWeight:600 }}>Active Members</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div className="g-head" style={{ fontSize:26, color:T.success }}>Rs.{(billsGenerated ? generatedBills : previewBills).reduce((s,b)=>s+b.total,0).toLocaleString()}</div>
              <div style={{ fontSize:11, color:T.textMuted, fontWeight:600 }}>Total Receivable</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div className="g-head" style={{ fontSize:26, color:T.warning }}>{getDefaultDueDate(month).slice(8)}</div>
              <div style={{ fontSize:11, color:T.textMuted, fontWeight:600 }}>Due Day</div>
            </div>
          </div>
          {loadingExisting && (
            <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:T.textMuted }}>
              <Spinner size={14} /> Checking existing bills…
            </div>
          )}
          {billsGenerated && (
            <div style={{ display:"flex", gap:10, marginLeft:"auto" }}>
              <div style={{ textAlign:"center", padding:"8px 14px", borderRadius:10, background:T.successDim, border:`1px solid ${T.success}30` }}>
                <div className="g-head" style={{ fontSize:18, color:T.success }}>{paidCount}</div>
                <div style={{ fontSize:10, color:T.success, fontWeight:700 }}>PAID</div>
              </div>
              <div style={{ textAlign:"center", padding:"8px 14px", borderRadius:10, background:T.dangerDim, border:`1px solid ${T.danger}30` }}>
                <div className="g-head" style={{ fontSize:18, color:T.danger }}>{unpaidCount}</div>
                <div style={{ fontSize:10, color:T.danger, fontWeight:700 }}>UNPAID</div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ── Collected / Pending bar (post-generate) ────────────── */}
      {billsGenerated && generatedBills.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:14, marginBottom:20 }}>
          {[
            { label:"Bills Generated", value: generatedBills.length,                color:T.accent,  icon:"🧾" },
            { label:"Collected",       value:`Rs.${collectedAmt.toLocaleString()}`, color:T.success, icon:"✅" },
            { label:"Pending",         value:`Rs.${pendingAmt.toLocaleString()}`,   color:T.danger,  icon:"⏳" },
            { label:"Collection Rate", value:`${generatedBills.length ? Math.round((paidCount/generatedBills.length)*100) : 0}%`, color:T.warning, icon:"📊" },
          ].map((k,i) => (
            <Card key={i} style={{ padding:"14px 16px", cursor:"default" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <SectionLabel>{k.label}</SectionLabel>
                  <div className="g-head" style={{ fontSize:20, color:k.color, marginTop:4 }}>{k.value}</div>
                </div>
                <span style={{ fontSize:16, padding:6, background:`${k.color}14`, borderRadius:8 }}>{k.icon}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Search + Filter bar ─────────────────────────────────── */}
      <div style={{ display:"flex", gap:10, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
        <input className="input" placeholder="🔍 Search by member name or code…"
          value={searchQ} onChange={e => setSearchQ(e.target.value)}
          style={{ flex:1, minWidth:200, height:38 }} />
        {billsGenerated && (
          <div style={{ display:"flex", gap:6 }}>
            {["all","paid","unpaid"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                style={{ padding:"6px 14px", borderRadius:8, fontWeight:700, fontSize:12,
                  fontFamily:"inherit", cursor:"pointer", transition:"all .15s",
                  border:`1.5px solid ${filterStatus===s ? T.accent : T.border}`,
                  background: filterStatus===s ? T.accentDim : T.card,
                  color: filterStatus===s ? T.accent : T.textMuted }}>
                {s === "all" ? "All" : s === "paid" ? "✅ Paid" : "⏳ Unpaid"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Bills Table ─────────────────────────────────────────── */}
      <Card style={{ padding:0, overflow:"hidden", marginBottom:20 }}>
        {/* Table Header */}
        <div style={{ padding:"11px 20px", background:T.surface, borderBottom:`1.5px solid ${T.border}`,
          display:"grid", gridTemplateColumns: billsGenerated
            ? "2fr 130px 90px 90px 140px 110px"
            : "2fr 130px 90px 90px 110px",
          gap:10, alignItems:"center" }}>
          {(billsGenerated
            ? ["MEMBER","TIER","BASE FEE","TOTAL","DUE DATE","STATUS"]
            : ["MEMBER","TIER","TIER FEE","TOTAL","TRAINER"]
          ).map(h => (
            <div key={h} style={{ fontSize:10, fontWeight:800, color:T.textMuted, letterSpacing:"0.1em" }}>{h}</div>
          ))}
        </div>

        {/* Table Body */}
        <div style={{ maxHeight:480, overflowY:"auto" }}>
          {filteredBills.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px", color:T.textMuted }}>
              <div style={{ fontSize:32, marginBottom:8, opacity:.3 }}>🧾</div>
              <p>{searchQ ? "No matching members found" : "No active members found"}</p>
            </div>
          ) : filteredBills.map((b, i) => (
            <div key={b.id} style={{
              display:"grid",
              gridTemplateColumns: billsGenerated
                ? "2fr 130px 90px 90px 140px 110px"
                : "2fr 130px 90px 90px 110px",
              padding:"11px 20px", gap:10, alignItems:"center",
              background: billsGenerated && b.status==="unpaid" && new Date(b.dueDate)<new Date()
                ? "rgba(240,45,109,0.03)"
                : i%2===0 ? T.card : T.surface,
              borderBottom:`1px solid ${T.border}`,
              borderLeft: billsGenerated
                ? `3px solid ${b.status==="paid" ? T.success : new Date(b.dueDate)<new Date() ? T.danger : T.border}`
                : `3px solid ${b.tier.color}44`,
              transition:"background .15s" }}>

              {/* Member info */}
              <div style={{ display:"flex", alignItems:"center", gap:9, minWidth:0 }}>
                <div style={{ width:32, height:32, borderRadius:"50%", flexShrink:0,
                  background:`${b.tier.color}14`, display:"flex", alignItems:"center", justifyContent:"center",
                  color:b.tier.color, fontWeight:800, fontSize:13, border:`2px solid ${b.tier.color}28` }}>
                  {(b.full_name||"?")[0]}
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{b.full_name}</div>
                  <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:1 }}>
                    <span className="g-mono" style={{ fontSize:10, color:T.textMuted }}>{displayCode(b)}</span>
                    {b.email && <span style={{ fontSize:10, color:T.textMuted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.email}</span>}
                  </div>
                </div>
              </div>

              {/* Tier badge */}
              <span style={{ padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:700,
                background:`${b.tier.color}14`, color:b.tier.color, border:`1px solid ${b.tier.color}28`,
                whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {b.tier.icon} {b.tier.label}
              </span>

              {/* Base fee (tier only) */}
              <span className="g-mono" style={{ fontSize:12, color:T.textSecondary }}>
                Rs.{(b.tierOnlyFee || b.baseFee).toLocaleString()}
              </span>

              {/* Total */}
              <div>
                <span className="g-mono" style={{ fontSize:13, fontWeight:800, color:T.accent }}>
                  Rs.{b.total.toLocaleString()}
                </span>
                {b.trainerName && (
                  <div style={{ fontSize:10, color:T.purple, marginTop:2 }}>
                    ◆ +Rs.{b.trainerFee.toLocaleString()} trainer
                  </div>
                )}
              </div>

              {/* Due date (post-generate) OR Trainer name (preview) */}
              {billsGenerated ? (
                <input type="date" value={b.dueDate}
                  onChange={e => handleDueDateChange(b.id, e.target.value)}
                  style={{ padding:"4px 8px", borderRadius:7, fontSize:11, fontFamily:"inherit",
                    border:`1.5px solid ${new Date(b.dueDate)<new Date() && b.status==="unpaid" ? T.danger : T.border}`,
                    background:T.bg, color: new Date(b.dueDate)<new Date() && b.status==="unpaid" ? T.danger : T.text,
                    fontWeight: new Date(b.dueDate)<new Date() && b.status==="unpaid" ? 700 : 400,
                    outline:"none", cursor:"pointer", width:"100%" }} />
              ) : (
                <span style={{ fontSize:11, color: b.trainerName ? T.purple : T.textMuted, fontWeight: b.trainerName ? 600 : 400 }}>
                  {b.trainerName ? `◆ ${b.trainerName}` : "No trainer"}
                </span>
              )}

              {/* Status toggle (post-generate only) */}
              {billsGenerated && (
                <button onClick={() => handleStatusToggle(b.id)}
                  style={{ padding:"5px 10px", borderRadius:8, cursor:"pointer", fontSize:11,
                    fontWeight:800, fontFamily:"inherit", transition:"all .2s", whiteSpace:"nowrap",
                    border:`1.5px solid ${b.status==="paid" ? T.success : T.danger}`,
                    background: b.status==="paid" ? T.successDim : T.dangerDim,
                    color: b.status==="paid" ? T.success : T.danger }}>
                  {b.status === "paid" ? "✅ PAID" : "⏳ UNPAID"}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Table Footer */}
        <div style={{ padding:"12px 20px", background:T.surface, borderTop:`1.5px solid ${T.border}`,
          display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
          <span style={{ fontSize:12, color:T.textMuted }}>
            {filteredBills.length} members shown
            {billsGenerated ? " · Click status to toggle · Click date to edit" : " · Preview — no bills have been saved yet"}
          </span>
          <div style={{ display:"flex", gap:16, alignItems:"center" }}>
            {billsGenerated && unpaidCount > 0 && (
              <span style={{ fontSize:12, color:T.danger, fontWeight:700 }}>⏳ Rs.{pendingAmt.toLocaleString()} pending</span>
            )}
            {billsGenerated && paidCount > 0 && (
              <span style={{ fontSize:12, color:T.success, fontWeight:700 }}>✅ Rs.{collectedAmt.toLocaleString()} collected</span>
            )}
            <span className="g-head" style={{ fontSize:16, color:T.accent }}>
              Grand Total: Rs.{(billsGenerated ? generatedBills : previewBills).reduce((s,b)=>s+b.total,0).toLocaleString()}
            </span>
          </div>
        </div>
      </Card>

      {/* ── Error ───────────────────────────────────────────────── */}
      {error && (
        <div style={{ background:T.dangerDim, border:`1px solid rgba(240,45,109,.25)`,
          color:T.danger, padding:"12px 16px", borderRadius:10, fontSize:13, marginBottom:16 }}>
          ❌ {error}
        </div>
      )}

      {/* ── Generate Button (pre-generate only) ─────────────────── */}
      {!billsGenerated && (
        <>
          {/* Confirm Dialog */}
          {confirmOpen && (
            <div className="modal-bg fade-in" style={{ zIndex:3000 }}>
              <div className="g-card fade-up" style={{ width:"100%", maxWidth:440, padding:32, textAlign:"center" }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🧾</div>
                <div className="g-head" style={{ fontSize:22, marginBottom:8 }}>Generate Bills?</div>
                <p style={{ color:T.textSecondary, marginBottom:8, lineHeight:1.6 }}>
                  Bills for <strong style={{color:T.text}}>{previewBills.length} active members</strong> will be saved to the database for{" "}
                  <strong style={{color:T.text}}>{month}</strong>.
                </p>
                <div style={{ background:T.accentDim, border:`1.5px solid rgba(79,70,229,0.2)`,
                  borderRadius:10, padding:"12px 16px", marginBottom:6 }}>
                  <span className="g-head" style={{ fontSize:24, color:T.accent }}>
                    Rs.{totalAmount.toLocaleString()}
                  </span>
                </div>
                <p style={{ fontSize:12, color:T.textMuted, marginBottom:20 }}>
                  Trainer fees are already included in each member's monthly fee.
                </p>
                <div style={{ display:"flex", gap:10 }}>
                  <Btn variant="ghost" style={{ flex:1, justifyContent:"center" }} onClick={() => setConfirmOpen(false)}>Cancel</Btn>
                  <Btn style={{ flex:1, justifyContent:"center" }} onClick={handleGenerate} icon="🧾">Generate & Save</Btn>
                </div>
              </div>
            </div>
          )}

          <button onClick={() => setConfirmOpen(true)}
            disabled={generating || previewBills.length === 0}
            style={{ padding:"16px 32px", borderRadius:12,
              cursor: generating || previewBills.length === 0 ? "not-allowed" : "pointer",
              fontFamily:"inherit", fontWeight:800, fontSize:16,
              background: generating ? T.border : `linear-gradient(135deg,#4F46E5,#7C3AED)`,
              color: generating ? T.textMuted : "#fff", border:"none",
              boxShadow:"0 4px 18px rgba(79,70,229,0.30)",
              display:"flex", alignItems:"center", gap:10, transition:"all .2s",
              opacity: previewBills.length === 0 ? 0.5 : 1 }}>
            {generating
              ? <><span className="spin" style={{width:18,height:18,borderRadius:"50%",border:"2.5px solid rgba(255,255,255,0.4)",borderTopColor:"#fff",display:"inline-block"}} /> Generating Bills…</>
              : <>🧾 Generate Bills for {previewBills.length} Members — Rs.{totalAmount.toLocaleString()}</>
            }
          </button>
        </>
      )}
    </div>
  );
};


// ── BULK BILLING PAGE ───────────────────────────────────────────
const BillingPage = () => {
  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <h1 className="g-head" style={{ fontSize: 40 }}>BULK BILLING</h1>
        <p style={{ color: T.textMuted, fontSize: 14, marginTop: 4 }}>Month-end bulk billing — generate bills for all active members at once</p>
      </div>
      <BulkBillingTab />
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════
// SECTION 13: SALARY PAGE
// ═══════════════════════════════════════════════════════════════

const SalaryPage = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { API_ENDPOINTS.getSalarySummary().then(d => { setSummary(d); setLoading(false); }); }, []);
  if (loading) return <LoadingOverlay label="Loading salary data…" />;
  const { staffRows, trainerRows, totals } = summary;

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 28 }}>
        <h1 className="g-head" style={{ fontSize: 40 }}>SALARY MANAGEMENT</h1>
        <p style={{ color: T.textMuted, fontSize: 14, marginTop: 4 }}>Monthly payroll overview</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Staff Payroll",   value: `PKR ${Number(totals.staff).toLocaleString()}`,                         color: T.blue,    icon: "👔", sub: `${staffRows.length} employees` },
          { label: "Trainer Payroll", value: `PKR ${Number(totals.trainers).toLocaleString()}`,                      color: T.purple,  icon: "🏋️", sub: "Estimated monthly" },
          { label: "Total Payroll",   value: `PKR ${(Number(totals.staff) + Number(totals.trainers)).toLocaleString()}`, color: T.warning, icon: "💼", sub: "Combined this month" },
        ].map((k, i) => (
          <Card key={i} className={`fade-up s${i + 1}`} style={{ cursor: "default", padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <SectionLabel>{k.label}</SectionLabel>
                <div className="g-head" style={{ fontSize: 36, color: k.color, lineHeight: 1.1 }}>{k.value}</div>
                <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 6 }}>{k.sub}</div>
              </div>
              <div style={{ fontSize: 26, padding: "10px", background: `${k.color}14`, borderRadius: 12 }}>{k.icon}</div>
            </div>
          </Card>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {[
          { title: "STAFF SALARIES",    rows: staffRows,   amtKey: "gross",  amtColor: T.blue   },
          { title: "TRAINER EARNINGS",  rows: trainerRows, amtKey: "gross",  amtColor: T.purple },
        ].map(panel => (
          <Card key={panel.title}>
            <div className="g-head" style={{ fontSize: 20, marginBottom: 16 }}>{panel.title}</div>
            {(panel.rows || []).map(row => (
              <div key={row.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 0", borderBottom: `1px solid ${T.border}` }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.name}</div>
                  <div style={{ fontSize: 12, color: T.textMuted }}>{row.role_or_spec}</div>
                </div>
                <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span className="g-mono" style={{ color: panel.amtColor, fontWeight: 700 }}>PKR {Number(row[panel.amtKey] || 0).toLocaleString()}</span>
                  <span style={{ fontSize: 11, color: row.paid ? T.success : T.warning, fontWeight: 600 }}>
                    {row.paid ? "✓ Paid" : "Pending"}
                  </span>
                </div>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SECTION 14: REPORTS PAGE  — 100% dynamic from gymService.getDashboard()
// ═══════════════════════════════════════════════════════════════

const REPORT_PRESETS = [
  { id: "today",  label: "Today",      icon: "📅" },
  { id: "week",   label: "This Week",  icon: "📆" },
  { id: "month",  label: "This Month", icon: "🗓" },
  { id: "custom", label: "Custom",     icon: "🔍" },
];

const ReportsPage = () => {
  const today = new Date().toISOString().slice(0, 10);
  const [preset,     setPreset]     = useState("month");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo,   setCustomTo]   = useState(today);
  const [dashData,   setDashData]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    API_ENDPOINTS.getDashboardStatsByDate(null, null)
      .then(d => {
        // Normalise into the shape ReportsPage expects
        setDashData({
          kpi:                  d.kpi,
          revenue_history:      d.revenueHistory,
          membership_breakdown: d.membershipBreakdown,
          recent_members:       d.recentMembers,
          category_revenue:     d.categoryRevenue || [],
        });
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load report data from the server.");
        setLoading(false);
      });
  }, []);

  // Filter revenue_history rows by the selected preset
  const filteredRows = useMemo(() => {
    if (!dashData) return [];
    const history = dashData.revenue_history || [];
    const now = new Date();

    if (preset === "today") {
      // Show just the most recent entry (today's/current month snapshot)
      return history.length > 0 ? [history[history.length - 1]] : [];
    }
    if (preset === "week") {
      // Last 7 days worth of entries — take up to last 2 entries
      return history.slice(-2);
    }
    if (preset === "month") {
      // Current month — take last entry
      return history.slice(-1);
    }
    if (preset === "custom" && customFrom && customTo) {
      const from = customFrom.slice(0, 7); // YYYY-MM
      const to   = customTo.slice(0, 7);
      return history.filter(r => {
        const m = (r.month || r.period || "").slice(0, 7);
        return m >= from && m <= to;
      });
    }
    return history;
  }, [dashData, preset, customFrom, customTo]);

  // Also expose all history for the chart (always show full trend)
  const chartRows = dashData?.revenue_history || [];

  const rows = filteredRows.map(r => ({
    ...r,
    label:       r.month || r.period || r.label || "",
    revenue:     Number(r.revenue  || 0),
    expenses:    Number(r.expenses || 0),
    profit:      Number(r.revenue  || 0) - Number(r.expenses || 0),
    members:     Number(r.members  || 0),
    new_members: Number(r.new_members || 0),
    margin:      r.revenue > 0 ? (((r.revenue - r.expenses) / r.revenue) * 100).toFixed(1) : "0.0",
  }));

  const kpi = dashData?.kpi || {};
  const totalRevenue  = rows.reduce((s, r) => s + r.revenue,  0);
  const totalExpenses = rows.reduce((s, r) => s + r.expenses, 0);
  const totalProfit   = totalRevenue - totalExpenses;
  const peakMembers   = rows.length ? Math.max(...rows.map(r => r.members)) : Number(kpi.members || 0);
  const totalNew      = rows.reduce((s, r) => s + r.new_members, 0);
  const avgMargin     = rows.length ? (rows.reduce((s, r) => s + parseFloat(r.margin), 0) / rows.length).toFixed(1) : "0.0";

  const cc = { background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", boxShadow: T.shadowMd };

  const rangeLabel = (() => {
    if (!rows.length) return "No data for selected period";
    if (rows.length === 1) return rows[0].label;
    return `${rows[0].label} – ${rows[rows.length - 1].label}`;
  })();

  if (loading) return <LoadingOverlay label="Loading reports…" />;

  if (error) return (
    <div style={{ textAlign: "center", padding: "80px 20px", color: T.textMuted }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <div className="g-head" style={{ fontSize: 24, color: T.danger, marginBottom: 8 }}>Cannot Load Reports</div>
      <p style={{ maxWidth: 400, margin: "0 auto", lineHeight: 1.7 }}>{error}</p>
      <Btn style={{ marginTop: 20 }} onClick={() => {
        setError(null); setLoading(true);
        API_ENDPOINTS.getDashboardStatsByDate(null, null)
          .then(d => {
            setDashData({ kpi: d.kpi, revenue_history: d.revenueHistory, membership_breakdown: d.membershipBreakdown, recent_members: d.recentMembers, category_revenue: d.categoryRevenue || [] });
            setLoading(false);
          })
          .catch(() => { setError("Could not load report data from the server."); setLoading(false); });
      }}>Retry</Btn>
    </div>
  );

  return (
    <div className="fade-up">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="g-head" style={{ fontSize: 40 }}>FINANCIAL REPORTS</h1>
          <p style={{ color: T.textMuted, fontSize: 14, marginTop: 4 }}>{rangeLabel}</p>
        </div>
        <Btn variant="ghost" icon="📄" size="sm" onClick={() => window.print()}>Print / PDF</Btn>
      </div>

      {/* Period selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {REPORT_PRESETS.map(p => (
          <button key={p.id} onClick={() => setPreset(p.id)}
            style={{ padding: "8px 18px", borderRadius: 10, cursor: "pointer", fontWeight: 700,
              fontSize: 13, fontFamily: "inherit", transition: "all .15s",
              border: `2px solid ${preset === p.id ? T.accent : T.border}`,
              background: preset === p.id ? T.accentDim : T.card,
              color: preset === p.id ? T.accent : T.textSecondary }}>
            {p.icon} {p.label}
          </button>
        ))}
        {preset === "custom" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="date" className="input" style={{ width: 150, height: 38 }}
              value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            <span style={{ color: T.textMuted, fontWeight: 600 }}>→</span>
            <input type="date" className="input" style={{ width: 150, height: 38 }}
              value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </div>
        )}
      </div>

      {/* KPI Cards — always live from kpi object */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 22 }}>
        {[
          { label: "Revenue",      value: totalRevenue  ? `PKR ${totalRevenue >= 1000  ? (totalRevenue/1000).toFixed(1)+"K"  : totalRevenue}` : `PKR ${Number(kpi.revenue||0).toLocaleString()}`,   color: T.accent,  icon: "💰" },
          { label: "Expenses",     value: totalExpenses ? `PKR ${totalExpenses >= 1000 ? (totalExpenses/1000).toFixed(1)+"K" : totalExpenses}` : "—",                                             color: T.danger,  icon: "💸" },
          { label: "Net Profit",   value: totalRevenue  ? `PKR ${Math.abs(totalProfit) >= 1000 ? (totalProfit/1000).toFixed(1)+"K" : totalProfit}` : `PKR ${Number(kpi.profit||0).toLocaleString()}`, color: totalProfit >= 0 ? T.success : T.danger, icon: "📈" },
          { label: "Avg Margin",   value: `${avgMargin}%`,                                                                                                                                      color: T.warning,  icon: "📊" },
          { label: "Members",      value: Number(kpi.members || peakMembers || 0).toLocaleString(),                                                                                             color: T.blue,     icon: "👥" },
          { label: "Active Trainers", value: Number(kpi.active_trainers || 0).toLocaleString(),                                                                                                color: T.purple,   icon: "🏋️" },
        ].map((k, i) => (
          <Card key={i} className={`fade-up s${i+1}`} style={{ cursor: "default", padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <SectionLabel>{k.label}</SectionLabel>
                <div className="g-head" style={{ fontSize: 28, color: k.color, lineHeight: 1.1, marginTop: 4 }}>{k.value}</div>
                {k.label === "Revenue" && kpi.revenue_change != null && (
                  <div style={{ fontSize: 12, color: kpi.revenue_change >= 0 ? T.success : T.danger, marginTop: 4, fontWeight: 600 }}>
                    {kpi.revenue_change >= 0 ? "↑" : "↓"} {Math.abs(kpi.revenue_change)}% vs last month
                  </div>
                )}
              </div>
              <div style={{ fontSize: 22, padding: "8px", background: `${k.color}12`, borderRadius: 10 }}>{k.icon}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Full trend chart — always shows all revenue_history */}
      {chartRows.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div className="g-head" style={{ fontSize: 20, marginBottom: 4 }}>REVENUE VS EXPENSES TREND</div>
          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 16 }}>Full history from API</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
              <XAxis dataKey="month" tick={{ fill: T.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: T.textMuted, fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1000 ? `PKR ${(v/1000).toFixed(0)}K` : `PKR ${v}`} />
              <Tooltip contentStyle={cc} formatter={v => [`PKR ${Number(v).toLocaleString()}`]} />
              <Legend formatter={v => <span style={{ color: T.textSecondary, fontSize: 13 }}>{v}</span>} />
              <Bar dataKey="revenue"  name="Revenue"  fill={T.accent} radius={[4,4,0,0]} />
              <Bar dataKey="expenses" name="Expenses" fill={T.danger} radius={[4,4,0,0]} opacity={0.75} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Membership breakdown pie */}
      {(dashData?.membership_breakdown || []).length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <Card>
            <div className="g-head" style={{ fontSize: 20, marginBottom: 16 }}>MEMBERSHIP MIX</div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={dashData.membership_breakdown} cx="50%" cy="50%"
                  innerRadius={55} outerRadius={88} paddingAngle={3} dataKey="value" nameKey="name">
                  {dashData.membership_breakdown.map((e, i) => <Cell key={i} fill={e.color || T.accent} />)}
                </Pie>
                <Tooltip contentStyle={cc} formatter={(v, n) => [`${v} members`, n]} />
                <Legend formatter={v => <span style={{ color: T.textSecondary, fontSize: 13 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          {/* Member growth line */}
          {chartRows.length > 1 && (
            <Card>
              <div className="g-head" style={{ fontSize: 20, marginBottom: 16 }}>MEMBER GROWTH</div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartRows}>
                  <defs>
                    <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={T.blue} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={T.blue} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="month" tick={{ fill: T.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: T.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={cc} formatter={v => [v, "Members"]} />
                  <Area type="monotone" dataKey="members" name="Members" stroke={T.blue}
                    fill="url(#memGrad)" strokeWidth={2.5} dot={{ fill: T.blue, r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>
      )}

      {/* P&L Table */}
      <Card>
        <div className="g-head" style={{ fontSize: 20, marginBottom: 16 }}>PROFIT & LOSS STATEMENT</div>
        {rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: T.textMuted }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: .3 }}>📊</div>
            <p>No breakdown data available for this period</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${T.border}`, background: "rgba(79,70,229,0.04)" }}>
                  {["Period","Revenue","Expenses","Profit","Margin","Members"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: h === "Period" ? "left" : "right",
                      fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="row-hover" style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: "12px 14px", fontWeight: 600 }}>{row.label}</td>
                    <td className="g-mono" style={{ padding: "12px 14px", textAlign: "right", color: T.accent,  fontWeight: 600 }}>PKR {row.revenue.toLocaleString()}</td>
                    <td className="g-mono" style={{ padding: "12px 14px", textAlign: "right", color: T.danger,  fontWeight: 600 }}>PKR {row.expenses.toLocaleString()}</td>
                    <td className="g-mono" style={{ padding: "12px 14px", textAlign: "right", color: row.profit >= 0 ? T.success : T.danger, fontWeight: 700 }}>
                      {row.profit >= 0 ? "+" : ""}PKR {row.profit.toLocaleString()}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>
                      <span style={{ color: parseFloat(row.margin) > 40 ? T.success : T.warning, fontWeight: 600 }}>{row.margin}%</span>
                    </td>
                    <td className="g-mono" style={{ padding: "12px 14px", textAlign: "right", color: T.textSecondary }}>{row.members.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SECTION 15: SIDEBAR
// ═══════════════════════════════════════════════════════════════

const Sidebar = ({ activePage, onNavigate, collapsed, onToggle }) => {
  const { appConfig, accessibleModules } = useApp();
  if (!appConfig) return null;
  const sections = [...new Set(accessibleModules.map(m => m.section))];

  return (
    <div style={{ width: collapsed ? 60 : 240, minHeight: "100vh",
      background: T.surface, borderRight: `1px solid ${T.border}`,
      display: "flex", flexDirection: "column", transition: "width .25s ease",
      overflow: "hidden", flexShrink: 0, boxShadow: `2px 0 12px rgba(79,70,229,0.08)` }}>

      <div style={{ padding: "18px 16px 16px", borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", gap: 10, minWidth: 0,
        background: `linear-gradient(135deg, rgba(79,70,229,0.06), rgba(139,92,246,0.04))` }}>
        <div style={{ width: 34, height: 34,
          background: `linear-gradient(135deg, #4F46E5, #7C3AED)`,
          borderRadius: 9, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#fff",
          boxShadow: `0 4px 14px rgba(79,70,229,0.38)` }}>
          {appConfig.logo}
        </div>
        {!collapsed && (
          <div>
            <div className="g-head" style={{ fontSize: 20, color: T.accent, lineHeight: 1, letterSpacing: "-0.04em" }}>{appConfig.name}</div>
            <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: "0.12em", fontWeight: 600 }}>{appConfig.tagline.toUpperCase()}</div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
        {sections.map(section => {
          const items = accessibleModules.filter(m => m.section === section);
          return (
            <div key={section}>
              {!collapsed && (
                <div style={{ padding: "12px 16px 4px", fontSize: 10, color: T.textMuted,
                  letterSpacing: "0.12em", fontWeight: 700 }}>{section}</div>
              )}
              {items.map(item => (
                <div key={item.id}
                  className={`nav-item ${activePage === item.id ? "active" : ""}`}
                  onClick={() => onNavigate(item.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10,
                    padding: collapsed ? "10px 0" : "8px 12px",
                    justifyContent: collapsed ? "center" : "flex-start",
                    color: activePage === item.id ? T.accent : T.textSecondary }}>
                  <span className="nav-icon" style={{ fontSize: 16, flexShrink: 0,
                    color: activePage === item.id ? T.accent : T.textMuted }}>{item.icon}</span>
                  {!collapsed && (
                    <span style={{ fontSize: 14, fontWeight: activePage === item.id ? 700 : 500, whiteSpace: "nowrap" }}>
                      {item.label}
                    </span>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div style={{ padding: "10px 8px", borderTop: `1px solid ${T.border}` }}>
        <button onClick={onToggle} style={{ width: "100%", padding: "8px", borderRadius: 8,
          border: `1px solid ${T.border}`, color: T.textMuted, fontSize: 14,
          cursor: "pointer", background: T.bg, transition: "all .15s", fontWeight: 600 }}>
          {collapsed ? "→" : "←"}
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SECTION 16: ROLE BADGE (admin only — no switching)
// ═══════════════════════════════════════════════════════════════

const RoleBadge = () => {
  const { role } = useApp();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, color: T.textMuted, letterSpacing: "0.06em", fontWeight: 700 }}>ROLE:</span>
      <span style={{
        padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
        border: `1.5px solid ${T.accent}`,
        background: `${T.accent}12`, color: T.accent,
      }}>{role}</span>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// EXERCISES PAGE — Editable catalog + Add Exercise + status toggle
// ═══════════════════════════════════════════════════════════════

const BLANK_EXERCISE = {
  id: "", name: "", category: "Cardio", price: 0,
  tiers: ["basic","silver","gold","platinum"], calories: 0, duration: 0, status: "active",
};

const ExercisesPage = () => {
  const [catalog,        setCatalog]        = useState(() => EXERCISES_CATALOG.map(e => ({ ...e })));
  const [exerciseStatus, setExerciseStatus] = useState(() => {
    const s = {};
    EXERCISES_CATALOG.forEach(e => { s[e.id] = e.status; });
    return s;
  });
  const [filterCat,  setFilterCat]  = useState("all");
  const [activeTab,  setActiveTab]  = useState("catalog"); // "catalog" | "add"
  const [editModal,  setEditModal]  = useState(null);       // exercise object to edit
  const [addForm,    setAddForm]    = useState({ ...BLANK_EXERCISE });
  const [addErrors,  setAddErrors]  = useState({});

  const allCategories = ["Cardio","Strength","Flexibility","Balance","HIIT","Combat","CrossFit"];
  const categories    = ["all", ...new Set(catalog.map(e => e.category))];

  const byCategory = catalog
    .filter(e => filterCat === "all" || e.category === filterCat)
    .reduce((acc, ex) => {
      if (!acc[ex.category]) acc[ex.category] = [];
      acc[ex.category].push(ex);
      return acc;
    }, {});

  const toggleStatus = (id) => {
    const next = exerciseStatus[id] === "active" ? "inactive" : "active";
    setExerciseStatus(prev => ({ ...prev, [id]: next }));
    setCatalog(prev => {
      const updated = prev.map(e => e.id === id ? { ...e, status: next } : e);
      updateLiveCatalog(updated);
      return updated;
    });
    // Persist to backend
    gymService.updateExercise(id, { status: next }).catch(() => {});
  };

  const activeCount   = Object.values(exerciseStatus).filter(s => s === "active").length;
  const inactiveCount = catalog.length - activeCount;

  // ── ADD EXERCISE ────────────────────────────────────────────
  const setAdd = (key, val) => {
    setAddForm(f => ({ ...f, [key]: val }));
    if (addErrors[key]) setAddErrors(e => ({ ...e, [key]: null }));
  };

  const validateAdd = () => {
    const errs = {};
    if (!addForm.name.trim())    errs.name     = "Name is required";
    if (!addForm.category)       errs.category = "Category is required";
    if (Number(addForm.price) <= 0) errs.price = "Price must be > 0";
    if (Number(addForm.duration) <= 0) errs.duration = "Duration must be > 0";
    if (addForm.tiers.length === 0) errs.tiers = "Select at least one tier";
    setAddErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAddSubmit = async () => {
    if (!validateAdd()) return;
    const price    = Number(addForm.price);
    const calories = Number(addForm.calories);
    const duration = Number(addForm.duration);
    // Optimistic local record (uses frontend field names)
    const localId = "local_" + Date.now();
    const newEx = {
      id: localId, name: addForm.name, category: addForm.category,
      price, calories, duration, tiers: addForm.tiers, status: "active",
    };
    setCatalog(prev => [...prev, newEx]);
    setExerciseStatus(prev => ({ ...prev, [localId]: "active" }));
    setAddForm({ ...BLANK_EXERCISE });
    setAddErrors({});
    setActiveTab("catalog");
    // API call — backend expects price_per_session / duration_minutes / calories_burned
    try {
      const res = await gymService.createExercise({
        name:              addForm.name,
        category:          addForm.category,
        price_per_session: price,
        duration_minutes:  duration,
        calories_burned:   calories,
      });
      const created = res?.data;
      if (created) {
        // Replace local record with real DB record, keeping frontend field names
        const realEx = {
          ...created,
          id:       created.id || created.exercise_code || localId,
          price:    created.price_per_session ?? price,
          duration: created.duration_minutes  ?? duration,
          calories: created.calories_burned   ?? calories,
          tiers:    addForm.tiers,
          status:   created.status || "active",
        };
        setCatalog(prev => {
          const updated = prev.map(e => e.id === localId ? realEx : e);
          updateLiveCatalog(updated);
          return updated;
        });
        setExerciseStatus(prev => {
          const next = { ...prev };
          delete next[localId];
          next[realEx.id] = realEx.status;
          return next;
        });
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || "Unknown error";
      console.error("Create exercise failed:", detail);
      // Keep local record — user can retry or it stays in UI only
    }
  };

  // ── EDIT EXERCISE ────────────────────────────────────────────
  const [editForm,   setEditForm]   = useState({});
  const [editErrors, setEditErrors] = useState({});

  const openEdit = (ex) => {
    setEditForm({ ...ex });
    setEditErrors({});
    setEditModal(ex);
  };

  const setEdit = (key, val) => {
    setEditForm(f => ({ ...f, [key]: val }));
    if (editErrors[key]) setEditErrors(e => ({ ...e, [key]: null }));
  };

  const validateEdit = () => {
    const errs = {};
    if (!editForm.name?.trim())     errs.name     = "Name is required";
    if (Number(editForm.price) <= 0)    errs.price    = "Price must be > 0";
    if (Number(editForm.duration) <= 0) errs.duration = "Duration must be > 0";
    if (!editForm.tiers || editForm.tiers.length === 0) errs.tiers = "Select at least one tier";
    setEditErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleEditSave = async () => {
    if (!validateEdit()) return;
    const updated = {
      ...editForm,
      price:    Number(editForm.price),
      calories: Number(editForm.calories),
      duration: Number(editForm.duration),
    };
    setCatalog(prev => {
      const updated = prev.map(e => e.id === updated.id ? updated : e);
      updateLiveCatalog(updated);
      return updated;
    });
    setExerciseStatus(prev => ({ ...prev, [updated.id]: updated.status }));
    setEditModal(null);
    // API call — backend field names
    try {
      await gymService.updateExercise(updated.id, {
        name:              updated.name,
        category:          updated.category,
        price_per_session: updated.price,
        duration_minutes:  updated.duration,
        calories_burned:   updated.calories,
        status:            updated.status,
      });
    } catch (err) {
      console.error("Update exercise failed:", err?.response?.data?.detail || err?.message);
    }
  };

  const TierCheckboxes = ({ value, onChange, error }) => (
    <div>
      <label style={{ fontSize:11, color:error?T.danger:T.textMuted, letterSpacing:"0.08em",
        fontWeight:700, textTransform:"uppercase", display:"block", marginBottom:8 }}>
        Tier Access {error && <span style={{ color:T.danger }}> — {error}</span>}
      </label>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {TIER_CONFIG.map(tier => {
          const selected = value.includes(tier.id);
          return (
            <div key={tier.id} onClick={() => {
              const next = selected ? value.filter(t => t !== tier.id) : [...value, tier.id];
              onChange(next);
            }} style={{ padding:"6px 14px", borderRadius:20, cursor:"pointer",
              border:`1.5px solid ${selected ? tier.color : T.border}`,
              background: selected ? `${tier.color}14` : "transparent",
              fontSize:12, fontWeight:700, color: selected ? tier.color : T.textSecondary,
              transition:"all .15s", userSelect:"none" }}>
              {tier.icon} {tier.label}
            </div>
          );
        })}
      </div>
    </div>
  );

  const inputSt = (err) => ({
    background:"#fff", border:`1.5px solid ${err ? T.danger : T.border}`,
    borderRadius:10, padding:"10px 14px", fontSize:14, color:T.text,
    outline:"none", fontFamily:"inherit", width:"100%", transition:"border-color .15s",
  });

  return (
    <div className="fade-up">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 className="g-head" style={{ fontSize:40 }}>EXERCISES</h1>
          <p style={{ color:T.textMuted, fontSize:14, marginTop:4 }}>Manage catalog · Edit exercises · Tier access</p>
        </div>
        {/* Tabs */}
        <div style={{ display:"flex", gap:8 }}>
          {[{ id:"catalog", label:"📋 Catalog" }, { id:"add", label:"+ Add Exercise" }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding:"8px 18px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13,
              fontFamily:"inherit", transition:"all .15s",
              border:`2px solid ${activeTab===tab.id ? T.accent : T.border}`,
              background: activeTab===tab.id ? T.accentDim : T.card,
              color: activeTab===tab.id ? T.accent : T.textSecondary,
            }}>{tab.label}</button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:14, marginBottom:20 }}>
        {[
          { label:"Total Exercises", value:catalog.length,  color:T.accent,    icon:"◎" },
          { label:"Active",          value:activeCount,     color:T.success,   icon:"✅" },
          { label:"Inactive",        value:inactiveCount,   color:T.textMuted, icon:"⏸" },
          { label:"Categories",      value:categories.length-1, color:T.purple, icon:"📂" },
        ].map((k,i) => (
          <Card key={i} style={{ padding:"16px 20px", cursor:"default" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <SectionLabel>{k.label}</SectionLabel>
                <div className="g-head" style={{ fontSize:26, color:k.color, marginTop:4 }}>{k.value}</div>
              </div>
              <span style={{ fontSize:22, padding:8, background:`${k.color}14`, borderRadius:10 }}>{k.icon}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* ── ADD EXERCISE TAB ─────────────────────────────────── */}
      {activeTab === "add" && (
        <Card style={{ padding:"28px 28px" }}>
          <div className="g-head" style={{ fontSize:22, marginBottom:4 }}>NEW EXERCISE</div>
          <p style={{ color:T.textMuted, fontSize:13, marginBottom:24 }}>Fill in the details to add a new exercise to the catalog</p>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 }}>
            {/* Name */}
            <div style={{ gridColumn:"1 / -1" }}>
              <label style={{ fontSize:11, color:addErrors.name?T.danger:T.textMuted, letterSpacing:"0.08em", fontWeight:700, textTransform:"uppercase", display:"block", marginBottom:6 }}>
                Exercise Name *
              </label>
              <input style={inputSt(addErrors.name)} value={addForm.name}
                placeholder="e.g. Zumba Dance" onChange={e => setAdd("name", e.target.value)} />
              {addErrors.name && <span style={{ fontSize:11, color:T.danger, marginTop:3, display:"block" }}>{addErrors.name}</span>}
            </div>
            {/* Category */}
            <div>
              <label style={{ fontSize:11, color:addErrors.category?T.danger:T.textMuted, letterSpacing:"0.08em", fontWeight:700, textTransform:"uppercase", display:"block", marginBottom:6 }}>
                Category *
              </label>
              <select style={inputSt(addErrors.category)} value={addForm.category} onChange={e => setAdd("category", e.target.value)}>
                {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {/* Price */}
            <div>
              <label style={{ fontSize:11, color:addErrors.price?T.danger:T.textMuted, letterSpacing:"0.08em", fontWeight:700, textTransform:"uppercase", display:"block", marginBottom:6 }}>
                Price per Session (Rs.) *
              </label>
              <input type="number" style={inputSt(addErrors.price)} value={addForm.price}
                placeholder="e.g. 300" onChange={e => setAdd("price", e.target.value)} />
              {addErrors.price && <span style={{ fontSize:11, color:T.danger, marginTop:3, display:"block" }}>{addErrors.price}</span>}
            </div>
            {/* Duration */}
            <div>
              <label style={{ fontSize:11, color:addErrors.duration?T.danger:T.textMuted, letterSpacing:"0.08em", fontWeight:700, textTransform:"uppercase", display:"block", marginBottom:6 }}>
                Duration (minutes) *
              </label>
              <input type="number" style={inputSt(addErrors.duration)} value={addForm.duration}
                placeholder="e.g. 60" onChange={e => setAdd("duration", e.target.value)} />
              {addErrors.duration && <span style={{ fontSize:11, color:T.danger, marginTop:3, display:"block" }}>{addErrors.duration}</span>}
            </div>
            {/* Calories */}
            <div>
              <label style={{ fontSize:11, color:T.textMuted, letterSpacing:"0.08em", fontWeight:700, textTransform:"uppercase", display:"block", marginBottom:6 }}>
                Calories Burned
              </label>
              <input type="number" style={inputSt(false)} value={addForm.calories}
                placeholder="e.g. 400" onChange={e => setAdd("calories", e.target.value)} />
            </div>
            {/* Tier Access */}
            <div style={{ gridColumn:"1 / -1" }}>
              <TierCheckboxes value={addForm.tiers} onChange={v => setAdd("tiers", v)} error={addErrors.tiers} />
            </div>
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:24, paddingTop:18, borderTop:`1px solid ${T.border}` }}>
            <Btn variant="ghost" onClick={() => { setAddForm({ ...BLANK_EXERCISE }); setAddErrors({}); }}>Reset</Btn>
            <Btn onClick={handleAddSubmit} icon="✓">Add Exercise</Btn>
          </div>
        </Card>
      )}

      {/* ── CATALOG TAB ─────────────────────────────────────── */}
      {activeTab === "catalog" && (<>
        {/* Category filter */}
        <div style={{ display:"flex", gap:8, marginBottom:18, flexWrap:"wrap" }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilterCat(cat)} style={{
              padding:"6px 14px", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12,
              fontFamily:"inherit", transition:"all .15s",
              border:`1.5px solid ${filterCat===cat ? (CATEGORY_COLORS[cat]||T.accent) : T.border}`,
              background: filterCat===cat ? `${CATEGORY_COLORS[cat]||T.accent}14` : "transparent",
              color: filterCat===cat ? (CATEGORY_COLORS[cat]||T.accent) : T.textSecondary,
            }}>{cat === "all" ? "All Categories" : cat}</button>
          ))}
        </div>

        {/* Exercise cards by category */}
        {Object.entries(byCategory).map(([cat, exs]) => {
          const catColor = CATEGORY_COLORS[cat] || T.accent;
          return (
            <div key={cat} style={{ marginBottom:20 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                <div style={{ fontSize:13, fontWeight:800, color:catColor, letterSpacing:"0.06em",
                  padding:"4px 14px", borderRadius:20, background:`${catColor}10`, border:`1px solid ${catColor}28` }}>
                  {cat.toUpperCase()}
                </div>
                <div style={{ flex:1, height:1.5, background:T.border, borderRadius:1 }} />
                <span style={{ fontSize:11, color:T.textMuted }}>{exs.length} exercises</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:12 }}>
                {exs.map(ex => {
                  const isActive = exerciseStatus[ex.id] === "active";
                  return (
                    <Card key={ex.id} style={{ padding:"16px 18px", opacity: isActive ? 1 : 0.6,
                      border:`1.5px solid ${isActive ? catColor+"30" : T.border}`,
                      background: isActive ? `${catColor}04` : T.surface }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:800, fontSize:15, color:T.text }}>{ex.name}</div>
                          <div style={{ fontSize:12, color:T.textMuted, marginTop:2 }}>
                            {ex.duration} min &nbsp;·&nbsp; {ex.calories} cal &nbsp;·&nbsp;
                            <span className="g-mono" style={{ color:catColor, fontWeight:700 }}>Rs.{ex.price}/session</span>
                          </div>
                        </div>
                        <div style={{ display:"flex", gap:6, flexShrink:0, marginLeft:8 }}>
                          {/* Edit button */}
                          <button onClick={() => openEdit(ex)} style={{
                            padding:"4px 10px", borderRadius:7, cursor:"pointer", fontSize:11, fontWeight:700,
                            fontFamily:"inherit", transition:"all .15s",
                            border:`1.5px solid ${T.accent}40`, background:T.accentDim, color:T.accent,
                          }}>✏ Edit</button>
                          {/* Status toggle */}
                          <button onClick={() => toggleStatus(ex.id)} style={{
                            padding:"4px 10px", borderRadius:7, cursor:"pointer", fontSize:11, fontWeight:800,
                            fontFamily:"inherit", transition:"all .15s",
                            border:`1.5px solid ${isActive ? T.success : T.textMuted}`,
                            background: isActive ? T.successDim : "transparent",
                            color: isActive ? T.success : T.textMuted,
                          }}>
                            {isActive ? "● Active" : "○ Inactive"}
                          </button>
                        </div>
                      </div>
                      {/* Tier badges */}
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                        {TIER_CONFIG.map(tier => {
                          const included = ex.tiers.includes(tier.id);
                          return (
                            <span key={tier.id} style={{
                              padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:700,
                              background: included ? `${tier.color}14` : "transparent",
                              color: included ? tier.color : T.border,
                              border:`1px solid ${included ? tier.color+"44" : T.border}`,
                            }}>
                              {tier.icon} {tier.label}
                            </span>
                          );
                        })}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </>)}

      {/* ── EDIT EXERCISE MODAL ──────────────────────────────── */}
      {editModal && (
        <div className="modal-bg fade-in" style={{ zIndex:2000 }} onClick={e => e.target===e.currentTarget && setEditModal(null)}>
          <div className="g-card fade-up" style={{ width:"100%", maxWidth:560, padding:28, maxHeight:"90vh", overflowY:"auto" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div className="g-head" style={{ fontSize:22 }}>EDIT EXERCISE</div>
              <button onClick={() => setEditModal(null)} style={{ background:T.bg, border:`1px solid ${T.border}`,
                color:T.textMuted, fontSize:18, cursor:"pointer", width:32, height:32, borderRadius:8,
                display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              {/* Name */}
              <div style={{ gridColumn:"1 / -1" }}>
                <label style={{ fontSize:11, color:editErrors.name?T.danger:T.textMuted, letterSpacing:"0.08em", fontWeight:700, textTransform:"uppercase", display:"block", marginBottom:6 }}>Exercise Name *</label>
                <input style={inputSt(editErrors.name)} value={editForm.name||""}
                  onChange={e => setEdit("name", e.target.value)} />
                {editErrors.name && <span style={{ fontSize:11, color:T.danger, marginTop:3, display:"block" }}>{editErrors.name}</span>}
              </div>
              {/* Category */}
              <div>
                <label style={{ fontSize:11, color:T.textMuted, letterSpacing:"0.08em", fontWeight:700, textTransform:"uppercase", display:"block", marginBottom:6 }}>Category</label>
                <select style={inputSt(false)} value={editForm.category||""} onChange={e => setEdit("category", e.target.value)}>
                  {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {/* Price */}
              <div>
                <label style={{ fontSize:11, color:editErrors.price?T.danger:T.textMuted, letterSpacing:"0.08em", fontWeight:700, textTransform:"uppercase", display:"block", marginBottom:6 }}>Price per Session (Rs.) *</label>
                <input type="number" style={inputSt(editErrors.price)} value={editForm.price||""}
                  onChange={e => setEdit("price", e.target.value)} />
                {editErrors.price && <span style={{ fontSize:11, color:T.danger, marginTop:3, display:"block" }}>{editErrors.price}</span>}
              </div>
              {/* Duration */}
              <div>
                <label style={{ fontSize:11, color:editErrors.duration?T.danger:T.textMuted, letterSpacing:"0.08em", fontWeight:700, textTransform:"uppercase", display:"block", marginBottom:6 }}>Duration (minutes) *</label>
                <input type="number" style={inputSt(editErrors.duration)} value={editForm.duration||""}
                  onChange={e => setEdit("duration", e.target.value)} />
                {editErrors.duration && <span style={{ fontSize:11, color:T.danger, marginTop:3, display:"block" }}>{editErrors.duration}</span>}
              </div>
              {/* Calories */}
              <div>
                <label style={{ fontSize:11, color:T.textMuted, letterSpacing:"0.08em", fontWeight:700, textTransform:"uppercase", display:"block", marginBottom:6 }}>Calories Burned</label>
                <input type="number" style={inputSt(false)} value={editForm.calories||""}
                  onChange={e => setEdit("calories", e.target.value)} />
              </div>
              {/* Tier Access */}
              <div style={{ gridColumn:"1 / -1" }}>
                <TierCheckboxes value={editForm.tiers||[]} onChange={v => setEdit("tiers", v)} error={editErrors.tiers} />
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:20, paddingTop:16, borderTop:`1px solid ${T.border}` }}>
              <Btn variant="ghost" onClick={() => setEditModal(null)}>Cancel</Btn>
              <Btn onClick={handleEditSave} icon="✓">Save Changes</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// TIERS PAGE — Editable plans (fee + features) + Upgrade members
// ═══════════════════════════════════════════════════════════════

const TiersPage = () => {
  const [tiers, setTiers] = useState(() => TIER_CONFIG.map(t => ({ ...t, features: [...t.features] })));
  const [editTierModal, setEditTierModal] = useState(null);
  const [tierForm,      setTierForm]      = useState({});
  const [newFeature,    setNewFeature]    = useState("");
  const [tierErrors,    setTierErrors]    = useState({});
  // openCategory[tierId] = categoryName | null — which category accordion is open per tier
  const [openCategory,  setOpenCategory]  = useState({});
  // tierExercises[tierId] = Set of exerciseIds enabled for that tier (mirrors EXERCISES_CATALOG.tiers)
  const [tierExercises, setTierExercises] = useState(() => {
    const map = {};
    TIER_CONFIG.forEach(t => {
      map[t.id] = new Set(EXERCISES_CATALOG.filter(e => e.tiers.includes(t.id)).map(e => e.id));
    });
    return map;
  });

  useEffect(() => {
    gymService.getTiers().then(res => {
      const apiTiers = res?.data || [];
      if (apiTiers.length) {
        const merged = apiTiers.map(at => {
          const local = TIER_CONFIG.find(t => t.id === (at.tier_id || at.id)) || {};
          return {
            id: at.tier_id || at.id || local.id,
            label: at.name || local.label,
            fee: Number(at.monthly_fee ?? at.fee ?? local.fee ?? 0),
            description: at.description || local.description || "",
            features: at.features || local.features || [],
            color: local.color || "#4F46E5",
            icon: local.icon || "🏆",
          };
        });
        setTiers(merged);
        merged.forEach(t => setTierFee(t.id, t.fee));
      }
    }).catch(() => {});
  }, []);

  const catalog = getLiveCatalog().filter(e => e.status === "active");
  const categories = [...new Set(catalog.map(e => e.category))];

  const toggleCategory = (tierId, cat) => {
    setOpenCategory(prev => ({
      ...prev,
      [tierId]: prev[tierId] === cat ? null : cat,
    }));
  };

  const toggleExercise = (tierId, exId) => {
    setTierExercises(prev => {
      const next = new Set(prev[tierId]);
      if (next.has(exId)) next.delete(exId); else next.add(exId);
      // Sync into live catalog
      const ex = EXERCISES_CATALOG.find(e => e.id === exId);
      if (ex) {
        if (next.has(exId)) { if (!ex.tiers.includes(tierId)) ex.tiers.push(tierId); }
        else                { ex.tiers = ex.tiers.filter(t => t !== tierId); }
      }
      return { ...prev, [tierId]: next };
    });
  };

  // ── EDIT TIER MODAL ──────────────────────────────────────────
  // Separate exercise set for modal — so changes only apply on Save
  const [editTierExs,    setEditTierExs]    = useState(new Set()); // exercises in modal draft
  const [modalOpenCat,   setModalOpenCat]   = useState(null);      // which accordion open in modal

  const openEditTier = (tier) => {
    setTierForm({ ...tier, features: [...tier.features] });
    setNewFeature(""); setTierErrors({});
    setModalOpenCat(null);
    // Init modal exercises from current tierExercises state
    setEditTierExs(new Set(tierExercises[tier.id] || []));
    setEditTierModal(tier);
  };

  const toggleModalExercise = (exId) => {
    setEditTierExs(prev => {
      const next = new Set(prev);
      if (next.has(exId)) next.delete(exId); else next.add(exId);
      return next;
    });
  };
  const setTF = (key, val) => { setTierForm(f => ({ ...f, [key]: val })); if (tierErrors[key]) setTierErrors(e => ({ ...e, [key]: null })); };
  const handleAddFeature = () => { const f = newFeature.trim(); if (!f) return; setTierForm(f2 => ({ ...f2, features: [...f2.features, f] })); setNewFeature(""); };
  const handleRemoveFeature = (idx) => setTierForm(f => ({ ...f, features: f.features.filter((_, i) => i !== idx) }));
  const validateTierForm = () => {
    const errs = {};
    if (!tierForm.description?.trim()) errs.description = "Description is required";
    setTierErrors(errs);
    return Object.keys(errs).length === 0;
  };
  const handleSaveTier = async () => {
    if (!validateTierForm()) return;
    const updated = { ...tierForm, fee: Number(tierForm.fee) };
    const tierId  = updated.id;

    // Commit tier metadata
    setTiers(prev => prev.map(t => t.id === tierId ? updated : t));
    setTierFee(tierId, updated.fee);
    const idx = TIER_CONFIG.findIndex(t => t.id === tierId);
    if (idx !== -1) { TIER_CONFIG[idx].description = updated.description; TIER_CONFIG[idx].features = [...updated.features]; }

    // Commit exercise changes from modal draft → main tierExercises state + live catalog
    const newSet = new Set(editTierExs);
    setTierExercises(prev => ({ ...prev, [tierId]: newSet }));
    EXERCISES_CATALOG.forEach(ex => {
      const shouldHave = newSet.has(ex.id);
      const hasIt      = ex.tiers.includes(tierId);
      if (shouldHave && !hasIt) ex.tiers.push(tierId);
      if (!shouldHave && hasIt) ex.tiers = ex.tiers.filter(t => t !== tierId);
    });

    setEditTierModal(null);
    toast.success(`${updated.label} plan updated!`);
    try {
      await gymService.updateTier(tierId, { monthly_fee: updated.fee, description: updated.description, features: updated.features, name: updated.label });
    } catch (err) { console.error("Update tier failed:", err?.response?.data?.detail || err?.message); }
  };

  const inputSt = (err) => ({
    background:"#fff", border:`1.5px solid ${err ? T.danger : T.border}`,
    borderRadius:10, padding:"10px 14px", fontSize:14, color:T.text,
    outline:"none", fontFamily:"inherit", width:"100%", transition:"border-color .15s",
  });

  return (
    <div className="fade-up">
      <div style={{ marginBottom:28 }}>
        <h1 className="g-head" style={{ fontSize:40 }}>MEMBERSHIP TIERS</h1>
        <p style={{ color:T.textMuted, fontSize:14, marginTop:4 }}>Manage plans · Edit fees & features · Assign exercises per plan</p>
      </div>

      {/* ── 4 Plan Cards ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:20 }}>
        {tiers.map(tier => {
          const enabledExIds = tierExercises[tier.id] || new Set();
          const enabledCount = enabledExIds.size;
          const openCat = openCategory[tier.id] || null;

          return (
            <Card key={tier.id} style={{ padding:0, border:`2px solid ${tier.color}30`,
              background:`${tier.color}03`, overflow:"hidden" }}>

              {/* Card Header */}
              <div style={{ padding:"20px 22px", borderBottom:`1.5px solid ${tier.color}18` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:32 }}>{tier.icon}</span>
                    <div>
                      <div className="g-head" style={{ fontSize:20, color:tier.color }}>{tier.label}</div>
                      <div style={{ fontSize:12, color:T.textMuted, marginTop:2 }}>{tier.description}</div>
                    </div>
                  </div>
                  <button onClick={() => openEditTier(tier)} style={{
                    padding:"4px 10px", borderRadius:7, cursor:"pointer", fontSize:11, fontWeight:700,
                    fontFamily:"inherit", border:`1.5px solid ${tier.color}40`,
                    background:`${tier.color}14`, color:tier.color, flexShrink:0,
                  }}>✏ Edit</button>
                </div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:14 }}>
                  <span className="g-mono" style={{ fontSize:22, fontWeight:800, color:tier.color }}>
                    Rs.{catalog.filter(e => enabledExIds.has(e.id)).reduce((s,e) => s+(e.price||0), 0).toLocaleString()}
                    <span style={{ fontSize:11, fontWeight:400, color:T.textMuted }}>/mo</span>
                  </span>
                  <span style={{ fontSize:12, color:T.textMuted, background:T.bg,
                    padding:"3px 10px", borderRadius:20, border:`1px solid ${T.border}` }}>
                    {enabledCount} exercises
                  </span>
                </div>
              </div>

              {/* Category Accordions */}
              <div style={{ padding:"12px 0" }}>
                {categories.map(cat => {
                  const catColor = CATEGORY_COLORS[cat] || T.accent;
                  const catExercises = catalog.filter(e => e.category === cat);
                  const checkedInCat = catExercises.filter(e => enabledExIds.has(e.id)).length;
                  const isOpen = openCat === cat;

                  return (
                    <div key={cat}>
                      {/* Category Row — clickable header */}
                      <div onClick={() => toggleCategory(tier.id, cat)}
                        style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 22px",
                          cursor:"pointer", transition:"background .12s",
                          background: isOpen ? `${catColor}08` : "transparent",
                          borderLeft: isOpen ? `3px solid ${catColor}` : "3px solid transparent" }}>
                        <span style={{ fontSize:10, fontWeight:800, color:catColor,
                          padding:"2px 8px", borderRadius:20, background:`${catColor}12`,
                          border:`1px solid ${catColor}25`, letterSpacing:"0.06em", flexShrink:0 }}>
                          {cat.toUpperCase()}
                        </span>
                        <div style={{ flex:1, height:1, background:T.border }} />
                        <span style={{ fontSize:11, color: checkedInCat > 0 ? catColor : T.textMuted,
                          fontWeight:700, flexShrink:0 }}>
                          {checkedInCat}/{catExercises.length}
                        </span>
                        <span style={{ fontSize:11, color:T.textMuted, transition:"transform .2s",
                          display:"inline-block", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
                      </div>

                      {/* Exercise Checkboxes — accordion body */}
                      {isOpen && (
                        <div style={{ padding:"6px 22px 10px 22px",
                          background:`${catColor}05`, borderLeft:`3px solid ${catColor}` }}>
                          {catExercises.map(ex => {
                            const checked = enabledExIds.has(ex.id);
                            return (
                              <div key={ex.id} onClick={() => toggleExercise(tier.id, ex.id)}
                                style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0",
                                  cursor:"pointer", borderBottom:`1px solid ${T.border}`,
                                  transition:"opacity .1s" }}>
                                {/* Checkbox */}
                                <div style={{
                                  width:18, height:18, borderRadius:5, flexShrink:0,
                                  border:`2px solid ${checked ? catColor : T.border}`,
                                  background: checked ? catColor : "#fff",
                                  display:"flex", alignItems:"center", justifyContent:"center",
                                  transition:"all .15s",
                                }}>
                                  {checked && <span style={{ color:"#fff", fontSize:11, fontWeight:800, lineHeight:1 }}>✓</span>}
                                </div>
                                {/* Exercise info */}
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:12, fontWeight:700,
                                    color: checked ? T.text : T.textMuted }}>{ex.name}</div>
                                  <div style={{ fontSize:10, color:T.textMuted }}>{ex.duration} min · {ex.calories} cal</div>
                                </div>
                                <span className="g-mono" style={{ fontSize:11, fontWeight:700,
                                  color: checked ? catColor : T.textMuted, flexShrink:0 }}>
                                  Rs.{ex.price}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Features Footer */}
              {tier.features.length > 0 && (
                <div style={{ padding:"10px 22px 16px", borderTop:`1px solid ${tier.color}18` }}>
                  <div style={{ fontSize:10, fontWeight:800, color:T.textMuted,
                    letterSpacing:"0.08em", marginBottom:6 }}>PLAN FEATURES</div>
                  {tier.features.map((f, i) => (
                    <div key={i} style={{ fontSize:11, color:T.textSecondary,
                      padding:"2px 0", display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ color:tier.color, fontWeight:700 }}>✓</span> {f}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* ── EDIT TIER MODAL ─────────────────────────────────── */}
      {editTierModal && (() => {
        const tc           = editTierModal.color;
        const modalCats    = [...new Set(catalog.map(e => e.category))];
        const exTotal = catalog.filter(e => editTierExs.has(e.id)).reduce((s,e) => s + (e.price||0), 0);
        return (
          <div className="modal-bg fade-in" style={{ zIndex:2000 }} onClick={e => e.target===e.currentTarget && setEditTierModal(null)}>
            <div className="g-card fade-up" style={{ width:"100%", maxWidth:580, maxHeight:"92vh", display:"flex", flexDirection:"column" }}>

              {/* ── Sticky Header ── */}
              <div style={{ padding:"22px 26px 18px", borderBottom:`1.5px solid ${T.border}`, flexShrink:0 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:26 }}>{editTierModal.icon}</span>
                    <div className="g-head" style={{ fontSize:20 }}>EDIT {editTierModal.label.toUpperCase()}</div>
                  </div>
                  <button onClick={() => setEditTierModal(null)} style={{ background:T.bg, border:`1px solid ${T.border}`,
                    color:T.textMuted, fontSize:18, cursor:"pointer", width:32, height:32, borderRadius:8,
                    display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
                </div>
              </div>

              {/* ── Scrollable Body ── */}
              <div style={{ overflowY:"auto", padding:"20px 26px", flex:1, display:"flex", flexDirection:"column", gap:20 }}>

                {/* Description only */}
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color: tierErrors.description ? T.danger : T.textMuted,
                    letterSpacing:"0.08em", textTransform:"uppercase", display:"block", marginBottom:6 }}>
                    Description *
                  </label>
                  <input style={inputSt(tierErrors.description)} value={tierForm.description||""}
                    onChange={e => setTF("description", e.target.value)} placeholder="e.g. Cardio & core" />
                  {tierErrors.description && <span style={{ fontSize:11, color:T.danger, marginTop:3, display:"block" }}>{tierErrors.description}</span>}
                </div>

                {/* ── Exercises with editable prices + checkboxes ── */}
                <div>
                  <div style={{ fontSize:11, fontWeight:800, color:T.textMuted, letterSpacing:"0.08em",
                    textTransform:"uppercase", marginBottom:12 }}>
                    Exercises — tick = included in plan · edit price per exercise
                  </div>

                  {modalCats.map(cat => {
                    const catColor  = CATEGORY_COLORS[cat] || T.accent;
                    const catExs    = catalog.filter(e => e.category === cat);
                    const isOpen    = modalOpenCat === cat;
                    const checkedN  = catExs.filter(e => editTierExs.has(e.id)).length;
                    return (
                      <div key={cat} style={{ marginBottom:6, borderRadius:10, overflow:"hidden",
                        border:`1.5px solid ${isOpen ? catColor+"55" : T.border}` }}>

                        {/* Category header */}
                        <div onClick={() => setModalOpenCat(prev => prev === cat ? null : cat)}
                          style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
                            cursor:"pointer", background: isOpen ? `${catColor}08` : T.surface,
                            transition:"background .12s" }}>
                          <span style={{ fontSize:10, fontWeight:800, color:catColor, padding:"2px 9px",
                            borderRadius:20, background:`${catColor}12`, border:`1px solid ${catColor}28`,
                            letterSpacing:"0.06em", flexShrink:0 }}>{cat.toUpperCase()}</span>
                          <div style={{ flex:1 }} />
                          <span style={{ fontSize:11, fontWeight:700, color: checkedN > 0 ? catColor : T.textMuted }}>
                            {checkedN}/{catExs.length} included
                          </span>
                          <span style={{ fontSize:12, color:T.textMuted, transform: isOpen ? "rotate(180deg)" : "none",
                            display:"inline-block", transition:"transform .2s", marginLeft:4 }}>▾</span>
                        </div>

                        {/* Exercise rows */}
                        {isOpen && (
                          <div style={{ background:T.card }}>
                            {catExs.map((ex, ei) => {
                              const checked = editTierExs.has(ex.id);
                              return (
                                <div key={ex.id} style={{ display:"flex", alignItems:"center", gap:10,
                                  padding:"9px 14px", borderTop:`1px solid ${T.border}`,
                                  background: checked ? `${catColor}05` : "transparent",
                                  transition:"background .12s" }}>

                                  {/* Checkbox */}
                                  <div onClick={() => toggleModalExercise(ex.id)}
                                    style={{ width:18, height:18, borderRadius:5, flexShrink:0, cursor:"pointer",
                                      border:`2px solid ${checked ? catColor : T.border}`,
                                      background: checked ? catColor : "#fff",
                                      display:"flex", alignItems:"center", justifyContent:"center",
                                      transition:"all .15s" }}>
                                    {checked && <span style={{ color:"#fff", fontSize:11, fontWeight:900, lineHeight:1 }}>✓</span>}
                                  </div>

                                  {/* Name + duration */}
                                  <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontSize:12, fontWeight:700,
                                      color: checked ? T.text : T.textMuted }}>{ex.name}</div>
                                    <div style={{ fontSize:10, color:T.textMuted }}>{ex.duration} min · {ex.calories} cal</div>
                                  </div>

                                  {/* Editable price */}
                                  <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
                                    <span style={{ fontSize:11, color:T.textMuted }}>Rs.</span>
                                    <input
                                      type="number"
                                      value={ex.price}
                                      onChange={e => {
                                        const val = Number(e.target.value) || 0;
                                        const idx = EXERCISES_CATALOG.findIndex(x => x.id === ex.id);
                                        if (idx !== -1) EXERCISES_CATALOG[idx].price = val;
                                        // force re-render
                                        setEditTierExs(prev => new Set(prev));
                                      }}
                                      style={{ width:64, padding:"4px 7px", borderRadius:7, fontSize:12,
                                        fontWeight:700, fontFamily:"'JetBrains Mono',monospace",
                                        border:`1.5px solid ${checked ? catColor+"66" : T.border}`,
                                        background: checked ? `${catColor}08` : T.bg,
                                        color: checked ? catColor : T.textMuted,
                                        outline:"none", textAlign:"right" }}
                                      min={0}
                                      onClick={e => e.stopPropagation()}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Sticky Footer — live fee preview + save ── */}
              <div style={{ padding:"16px 26px", borderTop:`1.5px solid ${T.border}`, flexShrink:0,
                background:T.surface, display:"flex", alignItems:"center", gap:16 }}>
                {/* Live total */}
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, fontWeight:800, color:T.textMuted, letterSpacing:"0.08em", marginBottom:3 }}>
                    PLAN TOTAL PREVIEW
                  </div>
                  <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
                    <span style={{ fontSize:11, color:T.textSecondary }}>
                      Ticked exercises total
                    </span>
                    <span className="g-mono" style={{ fontSize:16, fontWeight:800, color:tc }}>
                      Rs.{exTotal.toLocaleString()}
                    </span>
                  </div>
                </div>
                {/* Buttons */}
                <div style={{ display:"flex", gap:8 }}>
                  <Btn variant="ghost" onClick={() => setEditTierModal(null)}>Cancel</Btn>
                  <Btn onClick={handleSaveTier} icon="✓">Save Changes</Btn>
                </div>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SECTION 17: PAGE ROUTER
// ═══════════════════════════════════════════════════════════════

const DynamicPageRouter = ({ activePage, modules }) => {
  const moduleConfig = modules.find(m => m.id === activePage);
  if (!moduleConfig) return null;
  switch (moduleConfig.pageType) {
    case "dashboard":      return <DashboardPage />;
    case "attendance":     return <AttendancePage />;
    case "crud":           return <DynamicCrudPage moduleConfig={moduleConfig} />;
    case "exercises":      return <ExercisesPage />;
    case "tiers":          return <TiersPage />;
    case "billing":        return <BillingPage />;
    case "salaries":       return <SalaryPage />;
    case "reports":        return <ReportsPage />;
    default:
      return (
        <div style={{ textAlign: "center", padding: 80, color: T.textMuted }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: .2 }}>🔧</div>
          <div className="g-head" style={{ fontSize: 28, marginBottom: 8 }}>MODULE IN DEVELOPMENT</div>
          <p>Page type "{moduleConfig.pageType}" not yet implemented.</p>
        </div>
      );
  }
};

// ═══════════════════════════════════════════════════════════════
// SECTION 18: ROOT APP
// ═══════════════════════════════════════════════════════════════

const AppShell = ({ onLogout }) => {
  useEffect(() => injectStyles(), []);
  const { accessibleModules, bootstrapped, currentUser, role } = useApp();
  const [activePage,       setActivePage]       = useState("dashboard");
  const [collapsed,        setCollapsed]        = useState(false);
  const [profileOpen,      setProfileOpen]      = useState(false);
  const profileRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => { if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (bootstrapped && accessibleModules.length > 0) {
      const still = accessibleModules.find(m => m.id === activePage);
      if (!still) setActivePage(accessibleModules[0].id);
    }
  }, [accessibleModules, bootstrapped]);

  if (!bootstrapped) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: T.bg, flexDirection: "column", gap: 18 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%",
          border: `3px solid ${T.border}`, borderTopColor: T.accent,
          animation: "spin 0.9s linear infinite" }} />
        <div style={{ color: T.textMuted, fontSize: 14, letterSpacing: "0.08em", fontWeight: 600 }}>
          LOADING GymOS…
        </div>
      </div>
    );
  }

  const displayName = currentUser?.full_name || currentUser?.name || "Admin";
  const displayEmail = currentUser?.email || "";
  const displayRole  = (currentUser?.role || role || "admin").toUpperCase();
  const initials = displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "A";

  const ROLE_COLORS = {
    admin:   T.accent,
    manager: T.purple,
    staff:   T.blue,
    trainer: T.success,
    member:  T.warning,
  };
  const roleColor = ROLE_COLORS[(currentUser?.role || role || "admin").toLowerCase()] || T.accent;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg }}>
      <Sidebar activePage={activePage} onNavigate={id => setActivePage(id)}
        collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ height: 56, borderBottom: `1px solid ${T.border}`, display: "flex",
          alignItems: "center", padding: "0 24px", gap: 16, background: T.surface,
          flexShrink: 0, zIndex: 10, boxShadow: `0 1px 8px rgba(79,70,229,0.07)` }}>
          <div style={{ flex: 1 }}>
            <RoleBadge />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button style={{ padding: "6px 11px", borderRadius: 8, border: `1px solid ${T.border}`,
              color: T.textSecondary, fontSize: 15, cursor: "pointer", background: T.surface,
              transition: "all .15s" }}>🔔</button>

            {/* ── Dynamic User Profile Button + Dropdown ── */}
            <div ref={profileRef} style={{ position: "relative" }}>
              <div onClick={() => setProfileOpen(o => !o)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px",
                  borderRadius: 10, border: `1px solid ${profileOpen ? T.accent : T.border}`,
                  cursor: "pointer", background: profileOpen ? T.accentDim : T.bg,
                  transition: "all .15s", userSelect: "none" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%",
                  background: `linear-gradient(135deg, ${roleColor}30, ${roleColor}18)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: roleColor, fontWeight: 800, fontSize: 12,
                  border: `2px solid ${roleColor}40`, flexShrink: 0 }}>{initials}</div>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{displayName}</div>
                  {displayEmail && <div style={{ fontSize: 10, color: T.textMuted }}>{displayEmail}</div>}
                </div>
                <span style={{ fontSize: 10, color: T.textMuted, marginLeft: 2 }}>{profileOpen ? "▲" : "▼"}</span>
              </div>

              {/* ── Dropdown Panel ── */}
              {profileOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0,
                  width: 280, background: T.card, borderRadius: 14,
                  border: `1px solid ${T.border}`, boxShadow: T.shadowLg, zIndex: 999,
                  overflow: "hidden", animation: "fadeUp 0.15s ease both" }}>

                  {/* Profile header */}
                  <div style={{ padding: "18px 20px 14px",
                    background: `linear-gradient(135deg, ${roleColor}12, ${roleColor}06)`,
                    borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 44, height: 44, borderRadius: "50%",
                        background: `linear-gradient(135deg, ${roleColor}30, ${roleColor}18)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: roleColor, fontWeight: 800, fontSize: 18,
                        border: `2px solid ${roleColor}50`, flexShrink: 0 }}>{initials}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{displayName}</div>
                        {displayEmail && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{displayEmail}</div>}
                        <span style={{ display: "inline-block", marginTop: 5, padding: "2px 8px",
                          borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                          background: `${roleColor}18`, color: roleColor,
                          border: `1px solid ${roleColor}30` }}>{displayRole}</span>
                      </div>
                    </div>
                  </div>

                  {/* Sign out */}
                  <div style={{ padding: "10px 12px" }}>
                    <button onClick={() => { setProfileOpen(false); onLogout(); }}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 10,
                        border: `1px solid rgba(240,45,109,0.25)`, color: T.danger,
                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                        background: T.dangerDim, transition: "all .15s",
                        fontFamily: "inherit", display: "flex", alignItems: "center",
                        justifyContent: "center", gap: 6 }}>
                      🚪 Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px", background: T.bg }}>
          <div style={{ maxWidth: 1400 }}>
            <DynamicPageRouter activePage={activePage} modules={accessibleModules} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SECTION 19: LOGIN PAGE
// ═══════════════════════════════════════════════════════════════

const LoginPage = ({ onLogin, onSignup, onForgot }) => {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  useEffect(() => { injectStyles(); }, []);

  const handleLogin = async () => {
    setError(""); setLoading(true);
    try {
      const res = await api.post("/api/v1/auth/login", { email, password });
      const { access_token, refresh_token } = res.data;
      localStorage.setItem("token", access_token);
      localStorage.setItem("refresh_token", refresh_token);
      onLogin();
    } catch (err) {
      setError(err?.response?.data?.detail || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e) => { if (e.key === "Enter") handleLogin(); };

  return (
    <div style={{ display:"flex", height:"100vh", fontFamily:"'Plus Jakarta Sans',sans-serif", background: T.bg }}>
      <div style={{ flex:1, background:"linear-gradient(135deg,#1e1b4b 0%,#312e81 55%,#4F46E5 100%)",
        display:"flex", flexDirection:"column", justifyContent:"space-between", padding:"48px 52px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:42, height:42, borderRadius:10, background:"rgba(255,255,255,0.15)",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>⬡</div>
          <div>
            <div style={{ fontSize:20, fontWeight:800, color:"#fff", letterSpacing:"-0.5px", lineHeight:1.1 }}>GymOS</div>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.5)", letterSpacing:"2px", marginTop:2 }}>MANAGEMENT SYSTEM</div>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <h1 className="g-head" style={{ fontSize:58, color:"#fff", letterSpacing:"-2px", lineHeight:1.05, margin:0 }}>
            COMMAND<br />CENTER
          </h1>
          <p style={{ fontSize:15, color:"rgba(255,255,255,0.6)", lineHeight:1.7, maxWidth:320, margin:0 }}>
            Manage members, trainers, billing, and reports — all in one place.
          </p>
        </div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          {["Members","Trainers","Billing","Reports"].map(l => (
            <div key={l} style={{ background:"rgba(255,255,255,0.10)", border:"1px solid rgba(255,255,255,0.20)",
              color:"rgba(255,255,255,0.80)", borderRadius:20, padding:"6px 16px", fontSize:12 }}>{l}</div>
          ))}
        </div>
      </div>
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:40, background: T.bg }}>
        <div style={{ width:"100%", maxWidth:400, background: T.card, borderRadius:20, padding:40,
          boxShadow: T.shadowLg, display:"flex", flexDirection:"column", gap:20, border:`1px solid ${T.border}` }}>
          <div>
            <h2 className="g-head" style={{ fontSize:28, color: T.text, margin:0 }}>Welcome back</h2>
            <p style={{ fontSize:14, color: T.textMuted, marginTop:6 }}>Sign in to your admin account</p>
          </div>
          {error && (
            <div style={{ background:"rgba(240,45,109,0.07)", border:"1px solid rgba(240,45,109,0.25)",
              color: T.danger, padding:"12px 16px", borderRadius:10, fontSize:13 }}>{error}</div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <label style={{ fontSize:11, color: T.textMuted, letterSpacing:"1.5px", fontWeight:700 }}>EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={onKey}
              placeholder="admin@gym.com"
              style={{ background: T.surface, border:`1.5px solid ${T.border}`, borderRadius:10,
                padding:"13px 16px", fontSize:15, color: T.text, outline:"none", fontFamily:"inherit", transition:"border-color .2s" }}
              onFocus={e => e.target.style.borderColor = T.accent}
              onBlur={e  => e.target.style.borderColor = T.border} />
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <label style={{ fontSize:11, color: T.textMuted, letterSpacing:"1.5px", fontWeight:700 }}>PASSWORD</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKey}
              placeholder="••••••••"
              style={{ background: T.surface, border:`1.5px solid ${T.border}`, borderRadius:10,
                padding:"13px 16px", fontSize:15, color: T.text, outline:"none", fontFamily:"inherit", transition:"border-color .2s" }}
              onFocus={e => e.target.style.borderColor = T.accent}
              onBlur={e  => e.target.style.borderColor = T.border} />
          </div>
          <button onClick={handleLogin} disabled={loading} className="btn btn-primary"
            style={{ borderRadius:10, padding:"15px", fontSize:15, fontWeight:700,
              justifyContent:"center", opacity: loading ? 0.75 : 1,
              cursor: loading ? "not-allowed" : "pointer", marginTop:4 }}>
            {loading ? "Signing in…" : "Sign In →"}
          </button>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:4 }}>
            <button onClick={onForgot} style={{ background:"none", border:"none", color:T.accent,
              fontSize:13, cursor:"pointer", fontWeight:600, padding:0, fontFamily:"inherit" }}>
              Forgot password?
            </button>
            <button onClick={onSignup} style={{ background:"none", border:"none", color:T.textMuted,
              fontSize:13, cursor:"pointer", fontWeight:500, padding:0, fontFamily:"inherit" }}>
              Create account →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SECTION 20: SIGNUP PAGE
// ═══════════════════════════════════════════════════════════════

const SignupPage = ({ onBack, onSuccess }) => {
  const [form,    setForm]    = useState({ full_name: "", email: "", password: "", confirm: "" });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);

  useEffect(() => { injectStyles(); }, []);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSignup = async () => {
    setError("");
    if (!form.full_name || !form.email || !form.password) { setError("All fields are required."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (form.password !== form.confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      await api.post("/api/v1/auth/register", {
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        role: "admin",
      });
      setDone(true);
    } catch (err) {
      setError(err?.response?.data?.detail || "Registration failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    background: "#F8F9FF", border: `1.5px solid ${T.border}`, borderRadius: 10,
    padding: "13px 16px", fontSize: 15, color: T.text, outline: "none",
    fontFamily: "inherit", transition: "border-color .2s", width: "100%",
  };

  return (
    <div style={{ display:"flex", height:"100vh", background: T.bg, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ flex:1, background:"linear-gradient(135deg,#1e1b4b 0%,#312e81 55%,#4F46E5 100%)",
        display:"flex", flexDirection:"column", justifyContent:"center", padding:"48px 52px" }}>
        <div style={{ fontSize:48, fontWeight:800, color:"#fff", letterSpacing:"-2px", lineHeight:1.1, marginBottom:16 }}>
          JOIN<br />GymOS
        </div>
        <p style={{ fontSize:15, color:"rgba(255,255,255,0.6)", lineHeight:1.7, maxWidth:300 }}>
          Create your admin account to start managing your gym.
        </p>
      </div>
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:40 }}>
        <div style={{ width:"100%", maxWidth:420, background: T.card, borderRadius:20, padding:40,
          boxShadow: T.shadowLg, border:`1px solid ${T.border}` }}>
          {done ? (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
              <div className="g-head" style={{ fontSize:24, color:T.success, marginBottom:8 }}>Account Created!</div>
              <p style={{ color:T.textMuted, marginBottom:24 }}>You can now sign in with your credentials.</p>
              <Btn onClick={onSuccess} style={{ width:"100%", justifyContent:"center" }}>Go to Sign In →</Btn>
            </div>
          ) : (
            <>
              <div style={{ marginBottom:24 }}>
                <h2 className="g-head" style={{ fontSize:28, color:T.text, margin:0 }}>Create Account</h2>
                <p style={{ fontSize:14, color:T.textMuted, marginTop:6 }}>Register a new admin account</p>
              </div>
              {error && (
                <div style={{ background:"rgba(240,45,109,0.07)", border:"1px solid rgba(240,45,109,0.25)",
                  color:T.danger, padding:"12px 16px", borderRadius:10, fontSize:13, marginBottom:16 }}>{error}</div>
              )}
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {[
                  { key:"full_name", label:"FULL NAME",        type:"text",     placeholder:"Admin Name" },
                  { key:"email",     label:"EMAIL",            type:"email",    placeholder:"admin@gym.com" },
                  { key:"password",  label:"PASSWORD",         type:"password", placeholder:"Min 8 characters" },
                  { key:"confirm",   label:"CONFIRM PASSWORD", type:"password", placeholder:"Re-enter password" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize:11, color:T.textMuted, letterSpacing:"1.5px", fontWeight:700, display:"block", marginBottom:6 }}>{f.label}</label>
                    <input type={f.type} value={form[f.key]} placeholder={f.placeholder}
                      onChange={e => set(f.key, e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSignup()}
                      style={inputStyle}
                      onFocus={e => e.target.style.borderColor = T.accent}
                      onBlur={e  => e.target.style.borderColor = T.border} />
                  </div>
                ))}
                <button onClick={handleSignup} disabled={loading} className="btn btn-primary"
                  style={{ borderRadius:10, padding:"14px", fontSize:15, fontWeight:700,
                    justifyContent:"center", marginTop:4, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.75 : 1 }}>
                  {loading ? "Creating…" : "Create Account →"}
                </button>
                <button onClick={onBack} style={{ background:"none", border:"none", color:T.textMuted,
                  fontSize:13, cursor:"pointer", fontWeight:500, fontFamily:"inherit", textAlign:"center" }}>
                  ← Back to Sign In
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SECTION 21: FORGOT PASSWORD PAGE
// ═══════════════════════════════════════════════════════════════

const ForgotPasswordPage = ({ onBack }) => {
  const [step,    setStep]    = useState("email"); // "email" | "sent"
  const [email,   setEmail]   = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { injectStyles(); }, []);

  const handleSubmit = async () => {
    setError("");
    if (!email) { setError("Please enter your email."); return; }
    setLoading(true);
    try {
      await api.post("/api/v1/auth/forgot-password", { email });
      setStep("sent");
    } catch (err) {
      // Show sent screen even on error to avoid email enumeration
      setStep("sent");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display:"flex", height:"100vh", background: T.bg, fontFamily:"'Plus Jakarta Sans',sans-serif",
      alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:"100%", maxWidth:420, background: T.card, borderRadius:20, padding:40,
        boxShadow: T.shadowLg, border:`1px solid ${T.border}` }}>
        {step === "sent" ? (
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:48, marginBottom:16 }}>📧</div>
            <div className="g-head" style={{ fontSize:24, color:T.accent, marginBottom:8 }}>Check Your Email</div>
            <p style={{ color:T.textMuted, lineHeight:1.7, marginBottom:24 }}>
              If <strong style={{ color:T.text }}>{email}</strong> is registered, we've sent a password reset link.
            </p>
            <Btn onClick={onBack} style={{ width:"100%", justifyContent:"center" }}>← Back to Sign In</Btn>
          </div>
        ) : (
          <>
            <div style={{ marginBottom:24 }}>
              <h2 className="g-head" style={{ fontSize:28, color:T.text, margin:0 }}>Reset Password</h2>
              <p style={{ fontSize:14, color:T.textMuted, marginTop:6 }}>Enter your email to receive a reset link</p>
            </div>
            {error && (
              <div style={{ background:"rgba(240,45,109,0.07)", border:"1px solid rgba(240,45,109,0.25)",
                color:T.danger, padding:"12px 16px", borderRadius:10, fontSize:13, marginBottom:16 }}>{error}</div>
            )}
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div>
                <label style={{ fontSize:11, color:T.textMuted, letterSpacing:"1.5px", fontWeight:700, display:"block", marginBottom:6 }}>EMAIL ADDRESS</label>
                <input type="email" value={email} placeholder="admin@gym.com"
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  style={{ background:"#F8F9FF", border:`1.5px solid ${T.border}`, borderRadius:10,
                    padding:"13px 16px", fontSize:15, color:T.text, outline:"none",
                    fontFamily:"inherit", width:"100%", transition:"border-color .2s" }}
                  onFocus={e => e.target.style.borderColor = T.accent}
                  onBlur={e  => e.target.style.borderColor = T.border} />
              </div>
              <button onClick={handleSubmit} disabled={loading} className="btn btn-primary"
                style={{ borderRadius:10, padding:"14px", fontSize:15, fontWeight:700,
                  justifyContent:"center", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.75 : 1 }}>
                {loading ? "Sending…" : "Send Reset Link →"}
              </button>
              <button onClick={onBack} style={{ background:"none", border:"none", color:T.textMuted,
                fontSize:13, cursor:"pointer", fontWeight:500, fontFamily:"inherit", textAlign:"center" }}>
                ← Back to Sign In
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};


export default function GymOS() {
  const [authed,     setAuthed]     = useState(() => !!localStorage.getItem("token"));
  const [authPage,   setAuthPage]   = useState("login"); // "login" | "signup" | "forgot"
  const [sessionKey, setSessionKey] = useState(0);

  // Listen for token-expired logout event from interceptor
  useEffect(() => {
    const handleForceLogout = () => {
      setAuthed(false);
      setAuthPage("login");
      toast.warning("Session expired. Please sign in again.");
    };
    window.addEventListener("gymos:logout", handleForceLogout);
    return () => window.removeEventListener("gymos:logout", handleForceLogout);
  }, []);

  const handleLogin = () => {
    setSessionKey(k => k + 1); // new key = full remount of entire app tree
    setAuthed(true);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    setAuthed(false);
    setAuthPage("login");
  };

  if (!authed) {
    if (authPage === "signup")  return <SignupPage onBack={() => setAuthPage("login")} onSuccess={() => setAuthPage("login")} />;
    if (authPage === "forgot")  return <ForgotPasswordPage onBack={() => setAuthPage("login")} />;
    return <LoginPage onLogin={handleLogin} onSignup={() => setAuthPage("signup")} onForgot={() => setAuthPage("forgot")} />;
  }
  return (
    <AppProvider key={sessionKey}>
      <AppShell onLogout={handleLogout} />
    </AppProvider>
  );
}