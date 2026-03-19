import api from "../services/api";

export const gymService = {
    // Members
    getMembers:           (params)   => api.get('/api/v1/members', { params }),
    getMember:            (id)       => api.get(`/api/v1/members/${id}`),
    createMember:         (data)     => api.post('/api/v1/members', data),
    updateMember:         (id, data) => api.put(`/api/v1/members/${id}`, data),
    deleteMember:         (id)       => api.delete(`/api/v1/members/${id}`),

    // Trainers
    getTrainers:          (params)   => api.get('/api/v1/trainers', { params }),
    getActiveTrainers:    ()         => api.get('/api/v1/trainers/active'),
    createTrainer:        (data)     => api.post('/api/v1/trainers', data),
    updateTrainer:        (id, data) => api.put(`/api/v1/trainers/${id}`, data),
    deleteTrainer:        (id)       => api.delete(`/api/v1/trainers/${id}`),

    // Staff
    getStaff:             (params)   => api.get('/api/v1/staff', { params }),
    createStaff:          (data)     => api.post('/api/v1/staff', data),
    updateStaff:          (id, data) => api.put(`/api/v1/staff/${id}`, data),

    // Exercises
    getExercises:         (params)   => api.get('/api/v1/exercises', { params }),
    getActiveExercises:   ()         => api.get('/api/v1/exercises/active'),
    createExercise:       (data)     => api.post('/api/v1/exercises', data),
    updateExercise:       (id, data) => api.put(`/api/v1/exercises/${id}`, data),
    deleteExercise:       (id)       => api.delete(`/api/v1/exercises/${id}`),

    // Membership Tiers
    getTiers:             ()         => api.get('/api/v1/tiers'),
    getTier:              (id)       => api.get(`/api/v1/tiers/${id}`),
    updateTier:           (id, data) => api.put(`/api/v1/tiers/${id}`, data),

    // Expenses
    getExpenses:          (params)   => api.get('/api/v1/expenses', { params }),
    createExpense:        (data)     => api.post('/api/v1/expenses', data),
    updateExpense:        (id, data) => api.put(`/api/v1/expenses/${id}`, data),
    deleteExpense:        (id)       => api.delete(`/api/v1/expenses/${id}`),

    // Billing
    createInvoice:        (data)     => api.post('/api/v1/billing/invoices', data),
    getInvoices:          (params)   => api.get('/api/v1/billing/invoices', { params }),
    markInvoicePaid:      (id)       => api.put(`/api/v1/billing/invoices/${id}/mark-paid`),

    // Dashboard
    getDashboard:         ()         => api.get('/api/v1/dashboard/stats'),

    // Salaries
    getSalarySummary:     (month)    => api.get('/api/v1/salaries/summary', { params: { billing_month: month } }),

    // Reports
    getMonthlyReports:    (months)   => api.get('/api/v1/reports/monthly', { params: { months } }),

    // Month Close
    previewClose:         (month)    => api.get('/api/v1/month-close/preview', { params: { billing_month: month } }),
    executeClose:         (data)     => api.post('/api/v1/month-close', data),
    // Invoice create karo (bulk billing generate)
    async createInvoice(data) {
    return api.post('/api/v1/billing/invoices', data);
    },

    // Invoice paid mark karo
    async markInvoicePaid(invoiceId) {
    return api.patch(`/api/v1/billing/invoices/${invoiceId}`, { status: 'paid' });
    },
};