window.saveToLocal = (key, data) => localStorage.setItem(key, JSON.stringify(data));
window.loadFromLocal = (key) => JSON.parse(localStorage.getItem(key));

const AUTH_STORAGE_KEY = 'expensio_auth';
const SETTINGS_STORAGE_KEY = 'expensio_settings';
const CURRENCY_STORAGE_KEY = 'user_currency';

const CURRENCY_CONFIG = {
    USD: { currency: 'USD', locale: 'en-US', minimumFractionDigits: 2, maximumFractionDigits: 2 },
    COP: { currency: 'COP', locale: 'es-CO', minimumFractionDigits: 0, maximumFractionDigits: 0 },
    EUR: { currency: 'EUR', locale: 'es-ES', minimumFractionDigits: 2, maximumFractionDigits: 2 }
};

window.normalizeCurrencyCode = function(value) {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'COP') return 'COP';
    if (normalized === 'EUR' || value === '€' || value === 'â‚¬') return 'EUR';
    if (normalized === 'USD' || value === '$') return 'USD';
    return 'USD';
};

window.getCurrentCurrency = function() {
    const storedCurrency = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (storedCurrency) return window.normalizeCurrencyCode(storedCurrency);

    try {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
        return window.normalizeCurrencyCode(settings.currency);
    } catch (error) {
        return 'USD';
    }
};

window.setCurrentCurrency = function(value) {
    const currency = window.normalizeCurrencyCode(value);
    localStorage.setItem(CURRENCY_STORAGE_KEY, currency);

    const settings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
        ...settings,
        currency
    }));

    return currency;
};

window.getCurrencySymbol = function() {
    const currency = window.getCurrentCurrency();
    const config = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.USD;
    const parts = new Intl.NumberFormat(config.locale, {
        style: 'currency',
        currency: config.currency,
        currencyDisplay: 'narrowSymbol'
    }).formatToParts(0);

    return parts.find(part => part.type === 'currency')?.value || config.currency;
};

window.formatMoney = function(value) {
    const amount = Number(value) || 0;
    const currency = window.getCurrentCurrency();
    const config = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.USD;

    return new Intl.NumberFormat(config.locale, {
        style: 'currency',
        currency: config.currency,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: config.minimumFractionDigits,
        maximumFractionDigits: config.maximumFractionDigits
    }).format(amount);
};

window.saveUserSettingsToBackend = async function(settings = {}) {
    const session = window.getAuthSession();
    if (!session?.token) return null;

    const response = await fetch('/api/users/me/settings', {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify({
            name: settings.name,
            currency: window.normalizeCurrencyCode(settings.currency),
            picture: settings.picture
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'No se pudo guardar la configuracion en MySQL');
    }

    const data = await response.json();
    const user = data.user || {};
    const currency = window.normalizeCurrencyCode(data.currency || user.currency);

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        token: session.token,
        user: {
            ...session.user,
            ...user,
            currency,
            picture: user.picture || settings.picture || session.user?.picture || null
        }
    }));
    window.setCurrentCurrency(currency);

    return data;
};

window.loadUserSettingsFromBackend = async function() {
    const session = window.getAuthSession();
    if (!session?.token) return null;

    const response = await fetch('/api/users/me/settings', {
        headers: {
            Authorization: `Bearer ${session.token}`
        }
    });

    if (!response.ok) return null;

    const data = await response.json();
    const user = data.user || {};
    const currency = window.normalizeCurrencyCode(data.currency || user.currency);
    const currentSettings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
    const mergedUser = {
        ...session.user,
        ...user,
        currency,
        picture: user.picture || currentSettings.picture || session.user?.picture || null
    };

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        token: session.token,
        user: mergedUser
    }));

    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
        ...currentSettings,
        name: user.name || currentSettings.name,
        email: user.email || currentSettings.email,
        role: user.role || currentSettings.role,
        picture: mergedUser.picture,
        currency
    }));
    window.setCurrentCurrency(currency);

    return {
        ...data,
        user: mergedUser,
        currency
    };
};

window.getAuthSession = function() {
    try {
        const rawSession = localStorage.getItem(AUTH_STORAGE_KEY);
        return rawSession ? JSON.parse(rawSession) : null;
    } catch (error) {
        console.warn('No se pudo leer la sesion auth:', error);
        return null;
    }
};

window.saveAuthSession = function(authSession, visualProfile = {}) {
    if (!authSession || !authSession.token || !authSession.user) return;

    const user = authSession.user;
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        token: authSession.token,
        user
    }));

    const currentSettings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
    const compatibleSettings = {
        ...currentSettings,
        ...visualProfile,
        name: user.name || visualProfile.name || currentSettings.name,
        email: user.email || visualProfile.email || currentSettings.email,
        role: user.role || currentSettings.role,
        picture: user.picture || visualProfile.picture || currentSettings.picture || null,
        currency: window.normalizeCurrencyCode(user.currency || currentSettings.currency || visualProfile.currency || 'USD')
    };

    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(compatibleSettings));
    window.setCurrentCurrency(compatibleSettings.currency);
};

window.clearAuthSession = function() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    localStorage.removeItem('expensio_google_user');
};

window.isAdmin = function() {
    return window.getAuthSession()?.user?.role === 'admin';
};

window.redirectFromAdmin = function(message = 'Acceso denegado') {
    const dashboardNav = document.querySelector('.nav-item[data-section="dashboard"]');
    const adminNav = document.getElementById('adminNav');
    const mainTitle = document.querySelector('.topbar h1');

    document.querySelectorAll('.view, .content-section').forEach(section => {
        section.style.display = 'none';
    });

    const dashboardView = document.getElementById('view-dashboard');
    if (dashboardView) dashboardView.style.display = 'block';

    document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
        btn.classList.remove('active');
    });
    if (dashboardNav) dashboardNav.classList.add('active');
    if (adminNav) adminNav.classList.remove('active');
    if (mainTitle) mainTitle.textContent = 'Inicio';
    if (message && typeof window.showToast === 'function') window.showToast(message, 'error');
};

window.syncAdminVisibility = function() {
    const adminNav = document.getElementById('adminNav');
    const canAccessAdmin = window.isAdmin();

    if (adminNav) {
        adminNav.hidden = !canAccessAdmin;
        adminNav.style.display = canAccessAdmin ? '' : 'none';
        adminNav.setAttribute('aria-hidden', String(!canAccessAdmin));
        adminNav.tabIndex = canAccessAdmin ? 0 : -1;
        if (!canAccessAdmin) adminNav.classList.remove('active');
    }

    const adminView = document.getElementById('view-admin');
    if (!canAccessAdmin && adminView && adminView.style.display !== 'none') {
        window.redirectFromAdmin();
    }
};

window.toggleView = (viewId) => {
    console.log("Navegando a vista:", viewId);
    const requestedView = String(viewId || '').replace(/^#/, '').replace(/^view-/, '');
    const normalizedViewId = requestedView === 'tareas' ? 'tasks' : requestedView;

    if (normalizedViewId === 'admin' && !window.isAdmin()) {
        window.syncAdminVisibility();
        window.redirectFromAdmin();
        console.groupEnd();
        return;
    }

    document.querySelectorAll('.view, .content-section').forEach(section =>{
        section.style.display = 'none';
    });

    const target = document.getElementById(normalizedViewId) || document.getElementById(`view-${normalizedViewId}`);

    if (target) {
        target.style.display = 'block';

        if(normalizedViewId.includes('task')) {
            if (typeof renderTasks === 'function') {
            renderTasks();
            }
        }

        if (normalizedViewId === 'admin' && typeof window.loadAdminPanel === 'function') {
            window.loadAdminPanel();
        }
    }else {
        console.error("Error: No se encontró la vista con ID:" + viewId + "ni view-" + viewId);
    }
};

window.getTaskToken = function() {
    return window.getAuthSession()?.token || '';
};

window.mapApiTaskToLocal = function(task) {
    return {
        id: String(task.id),
        backendId: task.id,
        taskKey: `backend-${task.id}`,
        userId: task.userId,
        title: task.title,
        priority: task.priority || 'media',
        status: task.status || 'pending',
        date: task.created_at || task.date || new Date().toISOString()
    };
};

window.saveTasksLocal = function(tasks) {
    localStorage.setItem('expensio_tasks', JSON.stringify(window.normalizeTaskList(tasks)));
};

window.getTaskKey = function(task, index = 0) {
    if (task?.taskKey) return String(task.taskKey);
    if (task?.backendId) return `backend-${task.backendId}`;
    if (task?.id && String(task.id).startsWith('local-')) return String(task.id);
    return `local-${task?.id || Date.now()}-${index}`;
};

window.normalizeTaskList = function(tasks = []) {
    const seen = new Set();

    return tasks.map((task, index) => {
        let taskKey = window.getTaskKey(task, index);
        if (seen.has(taskKey)) taskKey = `${taskKey}-${index}`;
        seen.add(taskKey);

        return {
            ...task,
            id: task.id ? String(task.id) : taskKey,
            taskKey
        };
    });
};

window.taskFetch = async function(path = '', options = {}) {
    const method = options.method || 'GET';
    const url = `/api/tasks${path}`;
    console.log('[tasks:taskFetch:request]', {
        method,
        url,
        hasToken: Boolean(window.getTaskToken())
    });
    const response = await fetch(`/api/tasks${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${window.getTaskToken()}`,
            ...(options.headers || {})
        }
    });
    console.log('[tasks:taskFetch:response]', {
        method,
        url,
        status: response.status,
        ok: response.ok
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'No se pudo sincronizar tareas');
    }

    return response.json();
};

window.loadTasks = async function() {
    const localTasks = window.normalizeTaskList(JSON.parse(localStorage.getItem('expensio_tasks')) || []);

    try {
        const apiTasks = await window.taskFetch();
        const tasks = window.normalizeTaskList(apiTasks.map(window.mapApiTaskToLocal));
        window.saveTasksLocal(tasks);
        if (typeof window.renderKanbanTasks === 'function') window.renderKanbanTasks();
    } catch (error) {
        console.warn('Usando tareas desde localStorage:', error);
        window.saveTasksLocal(localTasks);
        if (typeof window.renderKanbanTasks === 'function') window.renderKanbanTasks();
    }
};

window.createTaskInBackend = function(task) {
    return window.taskFetch('', {
        method: 'POST',
        body: JSON.stringify({
            title: task.title,
            priority: task.priority,
            status: task.status
        })
    });
};

window.updateTaskInBackend = function(task) {
    const backendId = task.backendId || task.id;
    return window.taskFetch(`/${backendId}`, {
        method: 'PUT',
        body: JSON.stringify({
            title: task.title,
            priority: task.priority,
            status: task.status
        })
    });
};

window.deleteTaskInBackend = function(task) {
    const backendId = task.backendId || task.id;
    console.log('[tasks:deleteTaskInBackend]', {
        backendId,
        hasToken: Boolean(window.getTaskToken()),
        task
    });
    return window.taskFetch(`/${backendId}`, { method: 'DELETE' });
};
        
window.legacyDeleteTaskEarly = (taskId) => {
    let tasks = loadFromLocal('expensio_tasks') || [];
    tasks = tasks.filter(t => t.id !== String(taskId));
    saveToLocal('expensio_tasks', tasks);
    renderTasks();
};

window.renderTasks = () => {
    const tasks = JSON.parse(localStorage.getItem('expensio_tasks')) || [];
    
    const pendingList = document.getElementById('pendingTasksList');

    tasks.forEach(task => { 
        const priorityClass = `badge-${(task.priority || 'media').toLowerCase()}`;
        
        const li = document.createElement('li');
        li.className = 'task-card';
        
        li.innerHTML = `
            <div class="task-info">
                <strong>${task.title}</strong>
                <span class="priority-badge ${priorityClass}">${task.priority}</span>
            </div>
            <div class="task-ctrl">
                <button class="task-btn" onclick="moveTask('${task.id}', 'progress')">▶️</button>
                <button class="task-btn delete" onclick="deleteTask('${task.id}')">🗑️</button>
            </div>
        `;

        if (task.status === 'pending' && pendingList) pendingList.appendChild(li);
    });
};

window.getCurrencySymbolLegacy = function() {
    const currency = localStorage.getItem('user_currency');

    switch(currency) {
        case 'COP': return 'COP $';
        case 'EUR': return '€';
        case 'USD': return 'USD $';
        default: return '$';
    }
};

//GESTIÓN DE TAREAS ADVANCED

const elementsTasks = {
    form: document.getElementById('formAddTask'),
    title: document.getElementById('task-title'),
    priority: document.getElementById('task-priority'),
        
};

// GESTION DE AJUSTES 
const elementsSettings = {
    inputNombre: document.getElementById('userNameInput'),
    btnGuardar: document.getElementById('saveSettingsBtn'),
    fotoPerfil: document.getElementById('profilePicInput')

};


document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Sistema Expensio Pro v2.0 listo.");

    // VARIABLES GLOBALES Y ELEMENTOS
    let categoryChart;
    let flowChart;
    let cardSpendChart;
    let weeklyTrendChart;
    let monthlyTrendChart;
    let dailyBarChart;

    const elements = {
        settingsForm: document.getElementById('formSettings'),
        navButtons: document.querySelectorAll('.nav-item[data-section]'),
        views: document.querySelectorAll('.view'),
        mainTitle: document.querySelector('.topbar h1'),
        displayUserName: document.getElementById('displayUserName'),
        userAvatar: document.getElementById('userAvatar'),
        
        cardsContainer: document.getElementById('cardsContainerMain'),
        expensesTable: document.getElementById('expensesTableBody'),
        fullExpensesTable: document.getElementById('fullExpensesTableBody'),
        expenseCardSelect: document.getElementById('expenseCardSelect'),

        cardForm: document.getElementById('formAddCard'),
        cardBalanceForm: document.getElementById('formCardBalance'),
        expenseForm: document.getElementById('formAddExpense'),
        taskInput: document.getElementById('inputTaskName'),
        taskForm: document.getElementById('formAddTask'),
        loginForm: document.getElementById('formLogin'),
    };

    // MOTOR DE PERSISTENCIA 
    const saveToLocal = (key, data) => localStorage.setItem(key, JSON.stringify(data));
    const getFromLocal = (key) => {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    };

    // NOTIFICACIONES Y MODALES
    window.showToast = (message, type = 'success') => {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const normalizedType = {
            success: 'success',
            error: 'error',
            warning: 'warning',
            info: 'info'
        }[type] || 'info';

        const toast = document.createElement('div');
        toast.className = `toast ${normalizedType}`;
        toast.setAttribute('role', normalizedType === 'error' ? 'alert' : 'status');

        const icon = document.createElement('span');
        icon.className = 'toast-icon';
        icon.textContent = {
            success: 'OK',
            error: 'ERR',
            warning: 'AVISO',
            info: 'INFO'
        }[normalizedType];

        const text = document.createElement('span');
        text.className = 'toast-message';
        text.textContent = String(message || '');

        toast.append(icon, text);
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    };

    window.toggleModal = (id, show) => {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = show ? 'flex' : 'none';
    };

    const formatAdminMoney = (value) => {
        return window.formatMoney(value);
    };

    const getAuthToken = () => window.getAuthSession()?.token || '';

    const adminFetch = async (path) => {
        const response = await fetch(`/api/admin${path}`, {
            headers: {
                Authorization: `Bearer ${getAuthToken()}`
            }
        });

        if (response.status === 401 || response.status === 403) {
            window.syncAdminVisibility();
            window.redirectFromAdmin('Acceso denegado');
            throw new Error('Acceso denegado');
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudo cargar el panel admin');
        }

        return response.json();
    };

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    let adminTickets = [];
    let selectedAdminTicketId = null;
    let userTickets = [];
    let selectedUserTicketId = null;
    const LOCAL_TICKETS_STORAGE_KEY = 'expensio_support_tickets';
    const NOTIFICATIONS_READ_STORAGE_KEY = 'expensio_notifications_read';

    const escapeHtml = (value) => {
        const div = document.createElement('div');
        div.textContent = String(value ?? '');
        return div.innerHTML;
    };

    const ticketStatusLabel = (status) => ({
        pending: 'Pendiente',
        in_progress: 'En proceso',
        responded: 'Respondido',
        resolved: 'Resuelto'
    }[status] || 'Pendiente');

    const getLocalTickets = () => {
        try {
            const tickets = JSON.parse(localStorage.getItem(LOCAL_TICKETS_STORAGE_KEY) || '[]');
            return Array.isArray(tickets) ? tickets : [];
        } catch (error) {
            return [];
        }
    };

    const saveLocalTickets = (tickets) => {
        localStorage.setItem(LOCAL_TICKETS_STORAGE_KEY, JSON.stringify(tickets));
    };

    const normalizeLocalTicket = (ticket, session = window.getAuthSession()) => {
        const now = new Date().toISOString();
        const userId = ticket.userId || session?.user?.id || session?.user?.email || 'local-user';
        const id = ticket.id || `local-${Date.now()}`;
        const initialMessage = ticket.message || '';

        return {
            id,
            userId,
            subject: ticket.subject || 'Sin asunto',
            message: initialMessage,
            status: ticket.status || 'pending',
            response: ticket.response || '',
            created_at: ticket.created_at || now,
            updated_at: ticket.updated_at || now,
            responded_at: ticket.responded_at || null,
            messages: ticket.messages?.length ? ticket.messages : [{
                id: `${id}-msg-1`,
                ticketId: id,
                senderRole: 'user',
                senderId: userId,
                message: initialMessage,
                created_at: ticket.created_at || now
            }]
        };
    };

    const createLocalTicket = ({ subject, message }) => {
        const session = window.getAuthSession();
        const ticket = normalizeLocalTicket({ subject, message }, session);
        const tickets = [ticket, ...getLocalTickets()];
        saveLocalTickets(tickets);
        return ticket;
    };

    const updateLocalTicket = (ticketId, updater) => {
        const tickets = getLocalTickets();
        let updatedTicket = null;
        const updatedTickets = tickets.map(ticket => {
            if (String(ticket.id) !== String(ticketId)) return ticket;
            updatedTicket = normalizeLocalTicket(updater(normalizeLocalTicket(ticket)));
            return updatedTicket;
        });

        saveLocalTickets(updatedTickets);
        return updatedTicket;
    };

    const renderTicketMessages = (messages = []) => {
        if (!messages.length) return '<div class="admin-empty">Sin mensajes</div>';

        return messages.map(message => `
            <div class="ticket-message ${escapeHtml(message.senderRole || 'user')}">
                <span>${message.senderRole === 'admin' ? 'Soporte' : 'Usuario'} · ${escapeHtml(new Date(message.created_at || Date.now()).toLocaleString())}</span>
                <div>${escapeHtml(message.message || '')}</div>
            </div>
        `).join('');
    };

    const ticketFetch = async (path = '', options = {}) => {
        const response = await fetch(`/api/support-tickets${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getAuthToken()}`,
                ...(options.headers || {})
            }
        });

        if (response.status === 401 || response.status === 403) {
            window.syncAdminVisibility();
            window.redirectFromAdmin('Acceso denegado');
            throw new Error('Acceso denegado');
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudieron cargar tickets');
        }

        return response.json();
    };

    const renderAdminTickets = () => {
        const list = document.getElementById('adminTicketList');
        if (!list) return;

        if (!adminTickets.length) {
            list.innerHTML = '<div class="admin-empty">No hay tickets de soporte</div>';
            selectedAdminTicketId = null;
            renderSelectedTicket();
            return;
        }

        if (!selectedAdminTicketId || !adminTickets.some(ticket => String(ticket.id) === String(selectedAdminTicketId))) {
            selectedAdminTicketId = adminTickets[0].id;
        }

        list.innerHTML = adminTickets.map(ticket => `
            <button class="admin-ticket-item ${String(ticket.id) === String(selectedAdminTicketId) ? 'active' : ''}" type="button" data-ticket-id="${escapeHtml(ticket.id)}">
                <strong>${escapeHtml(ticket.subject || 'Sin asunto')}</strong>
                <span>${escapeHtml(new Date(ticket.created_at || Date.now()).toLocaleString())}</span>
                <em class="admin-ticket-status ${escapeHtml(ticket.status || 'pending')}">${ticketStatusLabel(ticket.status)}</em>
            </button>
        `).join('');

        renderSelectedTicket();
    };

    const renderSelectedTicket = () => {
        const ticket = adminTickets.find(item => String(item.id) === String(selectedAdminTicketId));
        const empty = document.getElementById('adminTicketEmpty');
        const content = document.getElementById('adminTicketContent');
        const idInput = document.getElementById('adminTicketId');
        const meta = document.getElementById('adminTicketMeta');
        const subject = document.getElementById('adminTicketSubject');
        const message = document.getElementById('adminTicketMessage');
        const status = document.getElementById('adminTicketStatus');
        const response = document.getElementById('adminTicketResponse');

        if (!ticket) {
            if (empty) empty.hidden = false;
            if (content) content.hidden = true;
            return;
        }

        if (empty) empty.hidden = true;
        if (content) content.hidden = false;
        if (idInput) idInput.value = ticket.id;
        if (meta) meta.textContent = `Ticket #${ticket.id} · ${new Date(ticket.created_at || Date.now()).toLocaleString()}`;
        if (subject) subject.textContent = ticket.subject || 'Sin asunto';
        if (message) message.innerHTML = renderTicketMessages(ticket.messages?.length ? ticket.messages : [
            { senderRole: 'user', message: ticket.message, created_at: ticket.created_at }
        ]);
        if (status) status.value = ticket.status || 'pending';
        if (response) response.value = ticket.response || '';
    };

    const loadAdminTickets = async () => {
        try {
            adminTickets = await ticketFetch();
        } catch (error) {
            const localTickets = getLocalTickets();
            if (!localTickets.length) throw error;
            console.warn('Usando tickets locales para admin:', error);
            adminTickets = localTickets.map(ticket => normalizeLocalTicket(ticket));
        }
        renderAdminTickets();
    };

    const userTicketFetch = async (path = '', options = {}) => {
        const session = window.getAuthSession();
        if (!session?.token) throw new Error('Inicia sesion para ver tus tickets');

        const response = await fetch(`/api/support-tickets${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.token}`,
                ...(options.headers || {})
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudieron cargar tus tickets');
        }

        return response.json();
    };

    const getSeenTicketResponses = () => {
        try {
            return JSON.parse(localStorage.getItem('support_ticket_seen_responses') || '{}');
        } catch (error) {
            return {};
        }
    };

    const saveSeenTicketResponses = (seen) => {
        localStorage.setItem('support_ticket_seen_responses', JSON.stringify(seen));
    };

    const getReadNotifications = () => {
        try {
            return JSON.parse(localStorage.getItem(NOTIFICATIONS_READ_STORAGE_KEY) || '{}');
        } catch (error) {
            return {};
        }
    };

    const saveReadNotifications = (readMap) => {
        localStorage.setItem(NOTIFICATIONS_READ_STORAGE_KEY, JSON.stringify(readMap));
    };

    const getTicketNotificationVersion = (ticket) => {
        return String(ticket.responded_at || ticket.updated_at || ticket.created_at || '');
    };

    const buildNotifications = () => {
        const readMap = getReadNotifications();
        const ticketNotifications = userTickets
            .filter(ticket => ['responded', 'in_progress', 'resolved'].includes(ticket.status))
            .map(ticket => {
                const version = getTicketNotificationVersion(ticket);
                const id = `ticket-${ticket.id}-${version || ticket.status}`;
                const isResponse = ticket.status === 'responded';
                const isResolved = ticket.status === 'resolved';

                return {
                    id,
                    source: 'ticket',
                    sourceId: ticket.id,
                    version,
                    type: isResponse ? 'success' : isResolved ? 'info' : 'warning',
                    title: isResponse ? 'Soporte respondio tu ticket' : isResolved ? 'Ticket resuelto' : 'Ticket en proceso',
                    message: ticket.subject || 'Sin asunto',
                    createdAt: ticket.updated_at || ticket.responded_at || ticket.created_at || new Date().toISOString(),
                    read: readMap[id] === version
                };
            });

        return ticketNotifications
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 12);
    };

    const markNotificationRead = (notificationId) => {
        const notification = buildNotifications().find(item => item.id === notificationId);
        if (!notification) return;

        const readMap = getReadNotifications();
        readMap[notification.id] = notification.version;
        saveReadNotifications(readMap);

        if (notification.source === 'ticket') {
            const seen = getSeenTicketResponses();
            seen[notification.sourceId] = notification.version;
            saveSeenTicketResponses(seen);
        }

        renderNotifications();
    };

    const markAllNotificationsRead = () => {
        const readMap = getReadNotifications();
        const seen = getSeenTicketResponses();

        buildNotifications().forEach(notification => {
            readMap[notification.id] = notification.version;
            if (notification.source === 'ticket') {
                seen[notification.sourceId] = notification.version;
            }
        });

        saveReadNotifications(readMap);
        saveSeenTicketResponses(seen);
        renderNotifications();
    };

    const renderNotifications = () => {
        const dot = document.querySelector('.notification-dot');
        const count = document.getElementById('notificationCount');
        const list = document.getElementById('notificationList');
        const markAllButton = document.getElementById('markAllNotificationsRead');
        const notifications = buildNotifications();
        const unreadCount = notifications.filter(item => !item.read).length;

        if (dot) dot.style.display = unreadCount > 0 ? '' : 'none';

        if (count) {
            count.hidden = unreadCount === 0;
            count.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
            count.setAttribute('aria-label', `${unreadCount} notificaciones sin leer`);
        }

        if (markAllButton) markAllButton.disabled = unreadCount === 0;

        if (!list) return;

        if (!notifications.length) {
            list.innerHTML = '<div class="notification-empty">No hay notificaciones recientes</div>';
            return;
        }

        list.innerHTML = notifications.map(notification => `
            <button class="notification-item ${notification.read ? 'is-read' : 'is-unread'} ${escapeHtml(notification.type)}" type="button" data-notification-id="${escapeHtml(notification.id)}" data-source-id="${escapeHtml(notification.sourceId)}">
                <span class="notification-status" aria-hidden="true"></span>
                <span class="notification-copy">
                    <strong>${escapeHtml(notification.title)}</strong>
                    <span>${escapeHtml(notification.message)}</span>
                    <small>${escapeHtml(new Date(notification.createdAt || Date.now()).toLocaleString())}</small>
                </span>
            </button>
        `).join('');
    };

    const renderUserTickets = () => {
        const list = document.getElementById('userTicketList');
        if (!list) return;

        if (!userTickets.length) {
            list.innerHTML = '<div class="admin-empty">No tienes tickets abiertos</div>';
            selectedUserTicketId = null;
            renderSelectedUserTicket();
            renderNotifications();
            return;
        }

        if (!selectedUserTicketId || !userTickets.some(ticket => String(ticket.id) === String(selectedUserTicketId))) {
            selectedUserTicketId = userTickets[0].id;
        }

        list.innerHTML = userTickets.map(ticket => `
            <button class="admin-ticket-item ${String(ticket.id) === String(selectedUserTicketId) ? 'active' : ''}" type="button" data-user-ticket-id="${escapeHtml(ticket.id)}">
                <strong>${escapeHtml(ticket.subject || 'Sin asunto')}</strong>
                <span>${escapeHtml(new Date(ticket.updated_at || ticket.created_at || Date.now()).toLocaleString())}</span>
                <em class="admin-ticket-status ${escapeHtml(ticket.status || 'pending')}">${ticketStatusLabel(ticket.status)}</em>
            </button>
        `).join('');

        renderSelectedUserTicket();
        renderNotifications();
    };

    const renderSelectedUserTicket = () => {
        const ticket = userTickets.find(item => String(item.id) === String(selectedUserTicketId));
        const empty = document.getElementById('userTicketEmpty');
        const content = document.getElementById('userTicketContent');
        const idInput = document.getElementById('userTicketId');
        const meta = document.getElementById('userTicketMeta');
        const subject = document.getElementById('userTicketSubject');
        const status = document.getElementById('userTicketStatus');
        const conversation = document.getElementById('userTicketConversation');

        if (!ticket) {
            if (empty) empty.hidden = false;
            if (content) content.hidden = true;
            return;
        }

        if (empty) empty.hidden = true;
        if (content) content.hidden = false;
        if (idInput) idInput.value = ticket.id;
        if (meta) meta.textContent = `Ticket #${ticket.id} · ${new Date(ticket.created_at || Date.now()).toLocaleString()}`;
        if (subject) subject.textContent = ticket.subject || 'Sin asunto';
        if (status) {
            status.textContent = ticketStatusLabel(ticket.status);
            status.className = `admin-ticket-status ${ticket.status || 'pending'}`;
        }
        if (conversation) conversation.innerHTML = renderTicketMessages(ticket.messages?.length ? ticket.messages : [
            { senderRole: 'user', message: ticket.message, created_at: ticket.created_at }
        ]);

        renderNotifications();
    };

    const loadUserTickets = async () => {
        const session = window.getAuthSession();
        try {
            userTickets = await userTicketFetch('/mine');
        } catch (error) {
            const localTickets = getLocalTickets()
                .map(ticket => normalizeLocalTicket(ticket, session))
                .filter(ticket => String(ticket.userId) === String(session?.user?.id || session?.user?.email || 'local-user'));

            if (!localTickets.length && !session?.token) throw error;
            if (!localTickets.length) {
                userTickets = [];
            } else {
                console.warn('Usando tickets locales del usuario:', error);
                userTickets = localTickets;
            }
        }
        renderUserTickets();
    };

    const renderAdminList = (id, items, renderItem, emptyText) => {
        const container = document.getElementById(id);
        if (!container) return;

        if (!items || items.length === 0) {
            container.innerHTML = `<div class="admin-empty">${emptyText}</div>`;
            return;
        }

        container.innerHTML = items.map(renderItem).join('');
    };

    const auditEventLabel = (event) => ({
        support_ticket_created: 'Ticket creado',
        support_ticket_updated: 'Ticket actualizado',
        support_ticket_user_reply: 'Respuesta de usuario en ticket',
        card_created: 'Tarjeta vinculada',
        card_balance_updated: 'Balance de tarjeta actualizado',
        transaction_created: 'Transaccion registrada',
        task_created: 'Tarea creada',
        task_updated: 'Tarea actualizada',
        task_deleted: 'Tarea eliminada'
    }[event] || 'Evento del sistema');

    const renderAuditLogs = (logs = []) => {
        renderAdminList('adminAuditLogs', logs, log => {
            const metadata = log.metadata || {};
            const metadataText = Object.entries(metadata)
                .filter(([, value]) => value !== null && value !== undefined && value !== '')
                .map(([key, value]) => `${key}: ${value}`)
                .join(' · ');

            return `
                <div class="admin-list-item admin-audit-item">
                    <strong>${escapeHtml(auditEventLabel(log.event))}</strong>
                    <span>${escapeHtml(log.type || 'system')} · ${escapeHtml(new Date(log.created_at || Date.now()).toLocaleString())}</span>
                    ${metadataText ? `<small>${escapeHtml(metadataText)}</small>` : ''}
                </div>
            `;
        }, 'No hay eventos registrados');
    };

    const loadAdminPanel = async () => {
        if (!window.isAdmin()) {
            window.redirectFromAdmin('Acceso denegado');
            return;
        }

        try {
            const [metrics, activity, system] = await Promise.all([
                adminFetch('/metrics'),
                adminFetch('/activity'),
                adminFetch('/system')
            ]);

            setText('adminMetricUsers', metrics.users ?? 0);
            try {
                await loadAdminTickets();
            } catch (ticketError) {
                console.warn('No se pudieron cargar tickets:', ticketError);
                const list = document.getElementById('adminTicketList');
                if (list) list.innerHTML = '<div class="admin-empty">No se pudieron cargar tickets</div>';
            }

            const openTickets = adminTickets.filter(ticket => ticket.status !== 'resolved').length;
            setText('adminMetricOpenTickets', openTickets);
            setText('adminMetricEvents', activity.logs?.length ?? 0);
            setText('adminMetricBackend', system.api === 'online' && system.db === 'connected' ? 'Operativo' : 'Revisar');

            renderAuditLogs(activity.logs || []);

            /*
            renderAdminList('adminRecentUsers', activity.users, user => `
                <div class="admin-list-item">
                    <strong>${escapeHtml(user.name || 'Sin nombre')}</strong>
                    <span>${escapeHtml(user.email || 'Sin email')} · ${escapeHtml(user.role || 'user')}</span>
                </div>
            `, 'No hay usuarios recientes');

            renderAdminList('adminRecentCards', activity.cards, card => `
                <div class="admin-list-item">
                    <strong>${escapeHtml(card.holder || 'Sin titular')}</strong>
                    <span>${escapeHtml(card.type || 'Sin tipo')} · **** ${escapeHtml(card.last4 || '----')}</span>
                </div>
            `, 'No hay tarjetas recientes');

            renderAdminList('adminRecentTransactions', activity.transactions, tx => `
                <div class="admin-list-item">
                    <strong>${escapeHtml(tx.description || tx.category || 'Transaccion')}</strong>
                    <span>${escapeHtml(tx.date || 'Sin fecha')} · ${formatAdminMoney(tx.amount)}</span>
                </div>
            `, 'No hay transacciones recientes');
            */

            setText('adminSystemApi', system.api || '-');
            setText('adminSystemDb', system.db || '-');
            setText('adminSystemTime', system.serverTime ? new Date(system.serverTime).toLocaleString() : '-');
            setText('adminLastSync', `Actualizado ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        } catch (error) {
            console.error('Error cargando panel admin:', error);
            if (typeof window.showToast === 'function' && error.message !== 'Acceso denegado') {
                window.showToast(error.message, 'error');
            }
        }
    };

    window.loadAdminPanel = loadAdminPanel;
    window.loadUserTickets = loadUserTickets;
    window.renderNotifications = renderNotifications;

    document.getElementById('openAddCard')?.addEventListener('click', () => toggleModal('modalAddCard', true));
    document.getElementById('openAddExpense')?.addEventListener('click', () => toggleModal('modalAddExpense', true));
    document.getElementById('openTicketModal')?.addEventListener('click', () => toggleModal('modalTicket', true));
    document.getElementById('refreshAdminPanel')?.addEventListener('click', () => loadAdminPanel());
    document.getElementById('refreshAdminTickets')?.addEventListener('click', () => loadAdminTickets().catch(error => showToast(error.message, 'error')));
    document.getElementById('openTasksView')?.addEventListener('click', () => {
        document.querySelector('.nav-item[data-section="tasks"]')?.click();
    });

    document.getElementById('adminTicketList')?.addEventListener('click', (event) => {
        const item = event.target.closest('[data-ticket-id]');
        if (!item) return;
        selectedAdminTicketId = item.dataset.ticketId;
        renderAdminTickets();
    });

    document.getElementById('adminTicketForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const ticketId = document.getElementById('adminTicketId')?.value;
        if (!ticketId) return;

        try {
            const statusValue = document.getElementById('adminTicketStatus')?.value || 'pending';
            const responseValue = document.getElementById('adminTicketResponse')?.value || '';
            let updatedTicket;

            if (String(ticketId).startsWith('local-')) {
                updatedTicket = updateLocalTicket(ticketId, ticket => {
                    const now = new Date().toISOString();
                    const messages = responseValue
                        ? [
                            ...(ticket.messages || []),
                            {
                                id: `${ticketId}-admin-${Date.now()}`,
                                ticketId,
                                senderRole: 'admin',
                                senderId: window.getAuthSession()?.user?.id || 'admin',
                                message: responseValue,
                                created_at: now
                            }
                        ]
                        : (ticket.messages || []);

                    return {
                        ...ticket,
                        status: responseValue && statusValue !== 'resolved' ? 'responded' : statusValue,
                        response: responseValue,
                        responded_at: responseValue ? now : ticket.responded_at,
                        updated_at: now,
                        messages
                    };
                });
            } else {
                updatedTicket = await ticketFetch(`/${ticketId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        status: statusValue,
                        response: responseValue
                    })
                });
            }

            adminTickets = adminTickets.map(ticket => String(ticket.id) === String(updatedTicket.id) ? updatedTicket : ticket);
            selectedAdminTicketId = updatedTicket.id;
            renderAdminTickets();
            showToast('Ticket actualizado');
        } catch (error) {
            showToast(error.message || 'No se pudo actualizar el ticket', 'error');
        }
    });

    document.getElementById('refreshUserTickets')?.addEventListener('click', () => {
        loadUserTickets().catch(error => showToast(error.message, 'error'));
    });

    document.getElementById('userTicketList')?.addEventListener('click', (event) => {
        const item = event.target.closest('[data-user-ticket-id]');
        if (!item) return;
        selectedUserTicketId = item.dataset.userTicketId;
        renderUserTickets();
    });

    document.getElementById('userTicketReplyForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const ticketId = document.getElementById('userTicketId')?.value;
        const messageInput = document.getElementById('userTicketReply');
        const message = messageInput?.value || '';
        if (!ticketId || !message.trim()) return;

        try {
            let updatedTicket;

            if (String(ticketId).startsWith('local-')) {
                updatedTicket = updateLocalTicket(ticketId, ticket => {
                    const now = new Date().toISOString();
                    return {
                        ...ticket,
                        status: ticket.status === 'resolved' ? 'pending' : 'in_progress',
                        updated_at: now,
                        messages: [
                            ...(ticket.messages || []),
                            {
                                id: `${ticketId}-user-${Date.now()}`,
                                ticketId,
                                senderRole: 'user',
                                senderId: window.getAuthSession()?.user?.id || 'local-user',
                                message,
                                created_at: now
                            }
                        ]
                    };
                });
            } else {
                updatedTicket = await userTicketFetch(`/${ticketId}/messages`, {
                    method: 'POST',
                    body: JSON.stringify({ message })
                });
            }

            userTickets = userTickets.map(ticket => String(ticket.id) === String(updatedTicket.id) ? updatedTicket : ticket);
            selectedUserTicketId = updatedTicket.id;
            if (messageInput) messageInput.value = '';
            renderUserTickets();
            showToast('Respuesta enviada');
        } catch (error) {
            showToast(error.message || 'No se pudo enviar la respuesta', 'error');
        }
    });

    document.querySelector('.sidebar-notification')?.addEventListener('click', (event) => {
        event.stopPropagation();
        const dropdown = document.getElementById('notificationDropdown');
        const button = event.currentTarget;
        if (!dropdown) return;

        const willOpen = dropdown.hidden;
        dropdown.hidden = !willOpen;
        button.setAttribute('aria-expanded', String(willOpen));
        renderNotifications();
        if (willOpen) loadUserTickets().catch(error => console.warn('No se pudieron cargar tickets:', error));
    });

    document.getElementById('notificationList')?.addEventListener('click', async (event) => {
        const item = event.target.closest('[data-notification-id]');
        if (!item) return;

        markNotificationRead(item.dataset.notificationId);
        selectedUserTicketId = item.dataset.sourceId;
        document.querySelector('.nav-item[data-section="config"]')?.click();
        await loadUserTickets().catch(error => console.warn('No se pudieron cargar tickets:', error));
        selectedUserTicketId = item.dataset.sourceId;
        renderUserTickets();
    });

    document.getElementById('markAllNotificationsRead')?.addEventListener('click', (event) => {
        event.stopPropagation();
        markAllNotificationsRead();
    });

    document.getElementById('openNotificationsTickets')?.addEventListener('click', (event) => {
        event.stopPropagation();
        document.getElementById('notificationDropdown')?.setAttribute('hidden', '');
        document.querySelector('.sidebar-notification')?.setAttribute('aria-expanded', 'false');
        document.querySelector('.nav-item[data-section="config"]')?.click();
    });

    document.addEventListener('click', (event) => {
        const shell = event.target.closest('.notification-shell');
        if (shell) return;

        const dropdown = document.getElementById('notificationDropdown');
        if (dropdown && !dropdown.hidden) {
            dropdown.hidden = true;
            document.querySelector('.sidebar-notification')?.setAttribute('aria-expanded', 'false');
        }
    });

    document.getElementById('formTicket')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const session = window.getAuthSession();
        const subjectValue = String(data.get('subject') || '').trim();
        const messageValue = String(data.get('message') || '').trim();

        if (!session?.token) {
            showToast('Inicia sesion para enviar tickets', 'warning');
            return;
        }

        if (!subjectValue || !messageValue) {
            showToast('Asunto y mensaje son requeridos', 'warning');
            return;
        }

        try {
            let createdTicket = null;

            try {
                const response = await fetch('/api/support-tickets', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.token}`
                    },
                    body: JSON.stringify({
                        subject: subjectValue,
                        message: messageValue
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || 'No se pudo enviar el ticket');
                }

                createdTicket = await response.json();
            } catch (error) {
                console.warn('Ticket guardado localmente:', error);
                createdTicket = createLocalTicket({
                    subject: subjectValue,
                    message: messageValue
                });
            }

            form.reset();
            toggleModal('modalTicket', false);
            showToast(String(createdTicket.id).startsWith('local-') ? 'Ticket guardado localmente. Sincronizacion pendiente.' : 'Ticket enviado a soporte');
            loadUserTickets().catch(error => console.warn('No se pudieron refrescar tus tickets:', error));

            const adminView = document.getElementById('view-admin');
            if (adminView && adminView.style.display !== 'none' && window.isAdmin()) {
                loadAdminTickets().catch(error => console.warn('No se pudo refrescar tickets:', error));
            }
        } catch (error) {
            showToast(error.message || 'No se pudo enviar el ticket', 'error');
        }
    });
    

    elements.navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.getAttribute('data-section');
            const targetSection = section === 'tareas' ? 'tasks' : section;

            if (targetSection === 'admin' && !window.isAdmin()) {
                window.syncAdminVisibility();
                window.redirectFromAdmin();
                return;
            }

            elements.navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            elements.views.forEach(v => v.style.display = v.id === `view-${targetSection}` ? 'block' : 'none');
            if (targetSection === 'tasks' && typeof renderTasks === 'function') renderTasks();
            if (targetSection === 'admin') loadAdminPanel();
            if (targetSection === 'config') loadUserTickets().catch(error => console.warn('No se pudieron cargar tickets:', error));
            if(elements.mainTitle) elements.mainTitle.textContent = btn.textContent.trim().replace(/[^\w\sáéíóú]/gi, '');
        });
    });

    // LÓGICA DE TARJETAS
    const cleanCardDigits = (value, maxLength = 4) => {
        return String(value || '').replace(/\D/g, '').slice(0, maxLength);
    };

    const cleanCardLast4 = (value) => {
        return String(value || '').replace(/\D/g, '').slice(-4);
    };

    const isMastercardPrefix = (first4) => {
        const prefix = Number(first4);
        return first4.length === 4 && ((prefix >= 5100 && prefix <= 5599) || (prefix >= 2221 && prefix <= 2720));
    };

    const getCardVisualData = (first4, type, fallbackCard = {}) => {
        const prefix = cleanCardDigits(first4);
        const fallbackBrand = String(fallbackCard.brand || '').toLowerCase();
        const fallbackClass = String(fallbackCard.cardClass || '').toLowerCase();
        let brand = "CARD", cardClass = "card-generic-dark";

        if (prefix.startsWith('4')) {
            brand = "VISA";
            cardClass = "card-visa-blue";
        } else if (isMastercardPrefix(prefix)) {
            brand = "Mastercard";
            cardClass = "card-master-orange";
        } else if (fallbackBrand.includes('master') || fallbackClass.includes('master')) {
            brand = "Mastercard";
            cardClass = "card-master-orange";
        } else if (fallbackBrand.includes('visa') || (!fallbackBrand && fallbackClass.includes('visa'))) {
            brand = "VISA";
            cardClass = "card-visa-blue";
        }

        return { brand, cardClass, type };
    };

    const normalizeCardType = (type) => {
        const normalizedType = String(type || '').toLowerCase();
        if (normalizedType.startsWith('d') || normalizedType.includes('deb')) return 'Débito';
        if (normalizedType.startsWith('c') || normalizedType.includes('cred')) return 'Crédito';
        return type || 'Crédito';
    };

    const mapApiCardToLocal = (card) => {
        const legacyNumber = String(card.num || '');
        const first4 = cleanCardDigits(card.first4 || (legacyNumber.length > 4 ? legacyNumber : ''));
        const last4 = cleanCardLast4(card.last4 || legacyNumber);
        const type = normalizeCardType(card.type);
        const visualData = getCardVisualData(first4, type, card);

        return {
            id: card.id,
            first4,
            last4,
            num: last4,
            holder: card.holder,
            brand: visualData.brand,
            cardClass: visualData.cardClass,
            type,
            balance: card.balance || 0
        };
    };

    const getCardKey = (card) => {
        return [
            String(card.holder || '').trim().toLowerCase(),
            String(card.first4 || '').slice(0, 4),
            cleanCardLast4(card.last4 || card.num),
            String(card.type || '').trim().toLowerCase()
        ].join('|');
    };

    const mergeCards = (primaryCards, fallbackCards) => {
        const merged = [];
        const seen = new Set();

        [...primaryCards, ...fallbackCards].forEach(card => {
            const normalizedCard = mapApiCardToLocal(card);
            const key = getCardKey(normalizedCard);
            if (!key || seen.has(key)) return;
            seen.add(key);
            merged.push(normalizedCard);
        });

        return merged;
    };

    const resetCardsUI = () => {
        if (elements.cardsContainer) elements.cardsContainer.innerHTML = '';
        if (elements.expenseCardSelect) {
            elements.expenseCardSelect.innerHTML = '<option value="">Selecciona una tarjeta...</option>';
        }
    };

    const renderCards = (cards) => {
        resetCardsUI();
        cards.forEach(c => renderCard(c));
    };

    const saveLocalCards = (cards) => {
        saveToLocal('my_cards', cards.map(mapApiCardToLocal));
    };

    const loadCards = async () => {
        const localCards = getFromLocal('my_cards').map(mapApiCardToLocal);
        saveLocalCards(localCards);

        try {
            const response = await fetch('/api/cards');
            if (!response.ok) throw new Error('No se pudieron cargar tarjetas desde MySQL');

            const apiCards = await response.json();
            const unsyncedLocalCards = localCards.filter(card => !card.id);
            const cards = mergeCards(apiCards, unsyncedLocalCards);
            saveLocalCards(cards);
            renderCards(cards);
            refreshDashboardOverview();
        } catch (error) {
            console.warn('Usando tarjetas desde localStorage:', error);
            renderCards(localCards);
            refreshDashboardOverview();
        }
    };

    const createCardInBackend = async (card) => {
        const response = await fetch('/api/cards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                holder: card.holder,
                first4: card.first4,
                last4: card.last4,
                type: card.type,
                balance: card.balance || 0
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudo guardar la tarjeta en MySQL');
        }

        return response.json();
    };

    const updateCardBalanceInBackend = async (cardId, balance) => {
        const response = await fetch(`/api/cards/${cardId}/balance`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ balance })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudo actualizar el balance en MySQL');
        }

        return response.json();
    };

    const findCardByKey = (cards, key) => {
        return cards.find(card => {
            const normalizedCard = mapApiCardToLocal(card);
            return String(normalizedCard.id || '') === String(key)
                || getCardKey(normalizedCard) === String(key);
        });
    };

    const openCardBalanceModal = (cardKey) => {
        const cards = getFromLocal('my_cards').map(mapApiCardToLocal);
        const card = findCardByKey(cards, cardKey);
        if (!card) {
            showToast("No se encontro la tarjeta", "warning");
            return;
        }

        const label = document.getElementById('cardBalanceLabel');
        const keyInput = document.getElementById('cardBalanceKey');
        const balanceInput = document.getElementById('cardBalanceInput');

        if (label) label.textContent = `${card.brand || 'Tarjeta'} •••• ${card.last4 || card.num || '----'}`;
        if (keyInput) keyInput.value = card.id || getCardKey(card);
        if (balanceInput) balanceInput.value = Number(card.balance || 0);

        toggleModal('modalCardBalance', true);
    };

    const getTransactionToken = () => window.getAuthSession()?.token || '';

    const createTransactionInBackend = async (expense, selectedCard) => {
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getTransactionToken()}`
            },
            body: JSON.stringify({
                date: expense.date,
                description: expense.description,
                desc: expense.description,
                category: expense.category,
                userId: window.getAuthSession()?.user?.id || null,
                cardId: selectedCard?.id || null,
                amount: expense.amount
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudo guardar el gasto en MySQL');
        }

        return response.json();
    };

    const saveExpenseLocally = (expense) => {
        const allExpenses = getFromLocal('my_expenses');
        allExpenses.push(expense);
        saveToLocal('my_expenses', allExpenses);
        return allExpenses;
    };

    const mapApiTransactionToExpense = (transaction, cards = getFromLocal('my_cards')) => {
        const matchedCard = cards.find(card => {
            return String(card.id || '') === String(transaction.cardId || '');
        });

        return {
            backendId: transaction.id,
            date: transaction.date,
            description: transaction.description || transaction.category || 'General',
            category: transaction.category || transaction.description || 'General',
            amount: transaction.amount,
            card: matchedCard?.num || matchedCard?.last4 || transaction.cardId || 'N/A',
            cardId: transaction.cardId,
            userId: transaction.userId
        };
    };

    const resetExpensesUI = () => {
        if (elements.expensesTable) elements.expensesTable.innerHTML = '';
        if (elements.fullExpensesTable) elements.fullExpensesTable.innerHTML = '';
    };

    const renderExpensesEmptyState = () => {
        if (elements.expensesTable) {
            elements.expensesTable.innerHTML = `
                <tr>
                    <td class="dashboard-table-empty" colspan="2">
                        <strong>Sin gastos recientes</strong>
                        <span>Agrega tu primer gasto desde acciones rapidas.</span>
                    </td>
                </tr>`;
        }

        if (elements.fullExpensesTable) {
            elements.fullExpensesTable.innerHTML = `
                <tr>
                    <td class="dashboard-table-empty" colspan="4">
                        <strong>Sin movimientos registrados</strong>
                        <span>Los gastos apareceran aqui cuando empieces a registrarlos.</span>
                    </td>
                </tr>`;
        }
    };

    const resetExpenseCharts = () => {
        if (categoryChart) {
            categoryChart.data.datasets[0].data = [0, 0, 0, 0, 0, 0];
            categoryChart.update();
        }

        if (flowChart) {
            flowChart.data.datasets[0].data = [0, 0, 0, 0, 0, 0, 0];
            flowChart.update();
        }
    };

    const renderExpenses = (expenses) => {
        resetExpensesUI();
        resetExpenseCharts();
        if (!expenses.length) {
            renderExpensesEmptyState();
        }
        expenses.forEach(exp => {
            renderExpenseRow(exp);
            updateCharts(exp.category, exp.amount);
        });
        refreshAnalysisDashboard(expenses);
        refreshExpensesDashboard(expenses);
        refreshDashboardOverview();
    };

    const loadExpenses = async () => {
        const localExpenses = getFromLocal('my_expenses');

        try {
            const response = await fetch('/api/transactions', {
                headers: {
                    Authorization: `Bearer ${getTransactionToken()}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'No se pudieron cargar gastos desde MySQL');
            }

            const transactions = await response.json();
            const expenses = transactions.map(tx => mapApiTransactionToExpense(tx));
            saveToLocal('my_expenses', expenses);
            renderExpenses(expenses);
        } catch (error) {
            console.warn('Usando gastos desde localStorage:', error);
            renderExpenses(localExpenses);
        }
    };

    const renderCard = (cardOrNum, holderArg, brandArg, cardClassArg, typeArg) => {
        const card = typeof cardOrNum === 'object'
            ? cardOrNum
            : { num: cardOrNum, last4: cardOrNum, holder: holderArg, brand: brandArg, cardClass: cardClassArg, type: typeArg };
        const first4 = cleanCardDigits(card.first4);
        const last4 = cleanCardLast4(card.last4 || card.num);
        const holder = card.holder || '';
        const type = card.type || 'Crédito';
        const visualData = getCardVisualData(first4, type, card);
        const brand = visualData.brand;
        const cardClass = visualData.cardClass;
        const normalizedType = (type || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const typeClass = normalizedType.startsWith('d') || normalizedType.includes('deb') ? 'debito' : 'credito';
        const normalizedBrand = `${brand || ''} ${cardClass || ''}`.toLowerCase();
        const brandClass = normalizedBrand.includes('master') ? 'mastercard' : normalizedBrand.includes('visa') ? 'visa' : 'generic';
        const cardKey = card.id || getCardKey(card);
        const balance = Number(card.balance || 0);
        const cardHTML = `
        <div class="physical-card card-item ${cardClass || ''} ${brandClass} ${typeClass}" data-card-key="${escapeHtml(cardKey)}">
            <div class="card-top"><span>Bank Pro</span><span class="card-logo">${brand}</span></div>
            <div class="card-chip"></div>
            <div class="card-number-display">•••• •••• •••• ${last4}</div>
            <div class="card-details">
                <div class="detail-group"><small>TITULAR</small><div class="detail-val">${holder}</div></div>
                <div class="detail-group" style="text-align: right;"><small>TIPO</small><div class="detail-val">${type}</div></div>
            </div>
            <div class="card-balance-row">
                <div class="card-balance"><small>BALANCE</small><strong>${formatMoney(balance)}</strong></div>
                <button class="card-balance-btn" type="button" data-card-balance="${escapeHtml(cardKey)}">Gestionar</button>
            </div>
        </div>`;
        elements.cardsContainer?.insertAdjacentHTML('beforeend', cardHTML);
        
        const opt = document.createElement('option');
        opt.value = last4;
        opt.textContent = `${brand} •••• ${last4}`;
        elements.expenseCardSelect?.appendChild(opt);
    }; 

    elements.cardForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(elements.cardForm);
        const first4 = cleanCardDigits(data.get('first4'));
        const last4 = cleanCardLast4(data.get('last4'));
        const holder = data.get('holder');
        const type = normalizeCardType(data.get('type'));
        if (first4.length !== 4 || last4.length !== 4) {
            showToast("Ingresa los primeros 4 y últimos 4 dígitos", "warning");
            return;
        }
        
        const { brand, cardClass } = getCardVisualData(first4, type);
        const newCard = { first4, last4, num: last4, holder, brand, cardClass, type, balance: 0 };
        const allCards = getFromLocal('my_cards');

        try {
            const savedCard = await createCardInBackend(newCard);
            const compatibleCard = mapApiCardToLocal({ ...newCard, ...savedCard, first4: newCard.first4, last4: newCard.last4 });
            const cards = mergeCards([compatibleCard], allCards.filter(card => !card.id));
            saveLocalCards(cards);
            renderCards(cards);
            showToast("Tarjeta vinculada correctamente");
        } catch (error) {
            console.error('Error guardando tarjeta en MySQL:', error);
            const cards = mergeCards([newCard], allCards);
            saveLocalCards(cards);
            renderCards(cards);
            showToast("Tarjeta guardada localmente. Sincronizacion pendiente.", "warning");
        }

        refreshDashboardOverview();
        elements.cardForm.reset();
        toggleModal('modalAddCard', false);
    });

    //LÓGICA DE GASTOS
    elements.cardsContainer?.addEventListener('click', (event) => {
        const balanceButton = event.target.closest('[data-card-balance]');
        if (!balanceButton) return;
        openCardBalanceModal(balanceButton.dataset.cardBalance);
    });

    elements.cardBalanceForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(elements.cardBalanceForm);
        const cardKey = data.get('card_key');
        const balance = Number(data.get('balance'));

        if (!Number.isFinite(balance)) {
            showToast("Ingresa un balance valido", "warning");
            return;
        }

        const allCards = getFromLocal('my_cards').map(mapApiCardToLocal);
        const targetCard = findCardByKey(allCards, cardKey);

        if (!targetCard) {
            showToast("No se encontro la tarjeta", "warning");
            return;
        }

        let savedCard = { ...targetCard, balance };
        let toastMessage = "Balance actualizado";
        let toastType = "success";

        if (targetCard.id) {
            try {
                const apiCard = await updateCardBalanceInBackend(targetCard.id, balance);
                savedCard = mapApiCardToLocal(apiCard);
            } catch (error) {
                console.error('Error actualizando balance en MySQL:', error);
                toastMessage = "Balance actualizado localmente. Sincronizacion pendiente.";
                toastType = "warning";
            }
        } else {
            toastMessage = "Balance actualizado localmente";
        }

        const updatedCards = allCards.map(card => {
            const isTargetCard = targetCard.id
                ? String(card.id || '') === String(targetCard.id)
                : getCardKey(card) === getCardKey(targetCard);

            return isTargetCard
                ? { ...card, ...savedCard, balance }
                : card;
        });

        saveLocalCards(updatedCards);
        renderCards(updatedCards);
        refreshDashboardOverview();
        toggleModal('modalCardBalance', false);
        elements.cardBalanceForm.reset();
        showToast(toastMessage, toastType);
    });

    const renderExpenseRow = (exp) => {
        const symbol = getCurrencySymbol();
        const row = `
            <tr>
                <td><strong>${exp.category}</strong></td>
                <td style="color: #8b949e;">Tarj. ••• ${exp.card}</td>
                <td class="amount-neg">-${symbol}${parseFloat(exp.amount).toLocaleString()}</td>
            </tr>`;
        const amount = parseFloat(exp.amount);
        const formattedAmount = formatMoney(isNaN(amount) ? 0 : amount);
        const fullRow = `
            <tr>
                <td><span class="expense-date">${exp.date || 'Hoy'}</span></td>
                <td><span class="expense-badge expense-badge--category">${exp.category || 'General'}</span></td>
                <td><span class="expense-badge expense-badge--card">Tarj. &bull;&bull;&bull; ${exp.card || 'N/A'}</span></td>
                <td class="amount-neg">-${formattedAmount}</td>
            </tr>`;
        const recentRow = `
            <tr>
                <td><strong>${exp.category}</strong></td>
                <td class="amount-neg">-${formattedAmount}</td>
            </tr>`;
        elements.expensesTable?.insertAdjacentHTML('afterbegin', recentRow);
        elements.fullExpensesTable?.insertAdjacentHTML('afterbegin', fullRow);
    };

    elements.expenseForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const allCards = getFromLocal('my_cards');
        if (allCards.length === 0) {
            showToast("Debes vincular una tarjeta primero", "warning");
            toggleModal('modalAddExpense', false);
            toggleModal('modalAddCard', true); 
            return;
        }

        const data = new FormData(elements.expenseForm);
        const selectedCardLast4 = data.get('card_selected');
        const selectedCard = allCards.find(card => {
            return String(card.id || '') === String(selectedCardLast4)
                || String(card.num || '').slice(-4) === String(selectedCardLast4)
                || String(card.last4 || '').slice(-4) === String(selectedCardLast4);
        });
        const formDate = data.get('date');
        const newExpense = {
            category: data.get('category'),
            amount: data.get('amount'),
            card: selectedCardLast4,
            date: formDate || new Date().toISOString().slice(0, 10),
            description: data.get('category')
        };

        let savedExpenses;
        let toastMessage = "Gasto registrado";
        let toastType = "success";

        try {
            const savedTransaction = await createTransactionInBackend(newExpense, selectedCard);
            savedExpenses = saveExpenseLocally({
                ...newExpense,
                backendId: savedTransaction.id
            });
        } catch (error) {
            console.error('Error guardando gasto en MySQL:', error);
            savedExpenses = saveExpenseLocally(newExpense);
            toastMessage = "Gasto guardado localmente. Sincronizacion pendiente.";
            toastType = "warning";
        }

        renderExpenseRow(newExpense);
        updateCharts(newExpense.category, newExpense.amount);
        refreshAnalysisDashboard(savedExpenses);
        refreshExpensesDashboard(savedExpenses);
        refreshDashboardOverview();

        elements.expenseForm.reset();
        toggleModal('modalAddExpense', false);
        showToast(toastMessage, toastType);
    });

    const getCurrencySymbol = () => window.getCurrencySymbol();
    const getCurrencySymbolLegacyScoped = () => {
        const currency = localStorage.getItem('user_currency');
        if (currency === 'COP') return 'COP $';
        if (currency === 'EUR') return '€';
        if (currency === 'USD') return 'USD $';
        return '$';
    };

    // GRÁFICAS 
    const initCharts = () => {
        const ctxCategory = document.getElementById('categoryChart')?.getContext('2d');
        if (ctxCategory) {
            categoryChart = new Chart(ctxCategory, {
                type: 'doughnut',
                data: {
                    labels: ['Comida', 'Transporte', 'Ocio', 'Servicios', 'General', 'Otros'],
                    datasets: [{
                        data: [0, 0, 0, 0, 0, 0],
                        backgroundColor: ['#238636','#da3633', '#1f6feb', '#f1e05a','#a371f7', '#8b949e'],
                        borderColor: '#0d1117',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { position: 'bottom', labels: { color: '#8b949e' } } }
                }
            });
        }

        const ctxFlow = document.getElementById('flowChart')?.getContext('2d');
        if (ctxFlow) {
            flowChart = new Chart(ctxFlow, {
                type: 'line',
                data: {
                    labels: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'],
                    datasets: [{
                        label: `Gastos (${window.getCurrencySymbol()})`,
                        data: [0, 0, 0, 0, 0, 0, 0],
                        borderColor: 'rgba(88, 166, 255, 0.72)',
                        backgroundColor: 'rgba(168, 85, 247, 0.12)',
                        fill: true,
                        tension: 0.16,
                        borderWidth: 2,
                        pointRadius: 2,
                        pointHoverRadius: 4,
                        pointBackgroundColor: '#58a6ff',
                        pointBorderColor: 'rgba(168, 85, 247, 0.55)',
                        pointBorderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(139, 148, 158, 0.10)' }, ticks: { color: '#8b949e' } },
                        x: { grid: { display: false }, ticks: { color: '#8b949e' } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        const ctxCardSpend = document.getElementById('cardSpendChart')?.getContext('2d');
        if (ctxCardSpend) {
            cardSpendChart = new Chart(ctxCardSpend, {
                type: 'bar',
                data: {
                    labels: ['Sin gastos'],
                    datasets: [{
                        label: 'Gastos por tarjeta',
                        data: [0],
                        backgroundColor: 'rgba(168, 85, 247, 0.42)',
                        borderColor: '#a855f7',
                        borderWidth: 1,
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(48, 54, 61, 0.5)' }, ticks: { color: '#8b949e' } },
                        x: { grid: { display: false }, ticks: { color: '#8b949e' } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        const ctxWeeklyTrend = document.getElementById('weeklyTrendChart')?.getContext('2d');
        if (ctxWeeklyTrend) {
            weeklyTrendChart = new Chart(ctxWeeklyTrend, {
                type: 'line',
                data: {
                    labels: ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'],
                    datasets: [{
                        label: 'Gastos semanales',
                        data: [0, 0, 0, 0],
                        borderColor: '#a855f7',
                        backgroundColor: 'rgba(168, 85, 247, 0.12)',
                        fill: true,
                        tension: 0.35,
                        borderWidth: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(48, 54, 61, 0.5)' }, ticks: { color: '#8b949e' } },
                        x: { grid: { display: false }, ticks: { color: '#8b949e' } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        const ctxMonthlyTrend = document.getElementById('monthlyTrendChart')?.getContext('2d');
        if (ctxMonthlyTrend) {
            monthlyTrendChart = new Chart(ctxMonthlyTrend, {
                type: 'line',
                data: {
                    labels: ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'],
                    datasets: [{
                        label: 'Informe mensual',
                        data: [0, 0, 0, 0],
                        borderColor: 'rgba(196, 181, 253, 0.86)',
                        backgroundColor: 'rgba(168, 85, 247, 0.14)',
                        fill: true,
                        tension: 0.35,
                        borderWidth: 2,
                        pointRadius: 2,
                        pointHoverRadius: 4,
                        pointBackgroundColor: '#c4b5fd'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(48, 54, 61, 0.48)' }, ticks: { color: '#8b949e' } },
                        x: { grid: { display: false }, ticks: { color: '#8b949e' } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        const ctxDailyBar = document.getElementById('dailyBarChart')?.getContext('2d');
        if (ctxDailyBar) {
            dailyBarChart = new Chart(ctxDailyBar, {
                type: 'bar',
                data: {
                    labels: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'],
                    datasets: [{
                        label: 'Gastos diarios',
                        data: [0, 0, 0, 0, 0, 0, 0],
                        backgroundColor: 'rgba(168, 85, 247, 0.38)',
                        borderColor: 'rgba(196, 181, 253, 0.74)',
                        borderWidth: 1,
                        borderRadius: 8,
                        maxBarThickness: 34
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(48, 54, 61, 0.48)' }, ticks: { color: '#8b949e' } },
                        x: { grid: { display: false }, ticks: { color: '#8b949e' } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }
    };

    const formatMoney = (value) => {
        return window.formatMoney(value);
    };

    const parseExpenseDate = (dateValue) => {
        if (!dateValue) return new Date();
        const parsed = new Date(dateValue);
        if (!isNaN(parsed.getTime())) return parsed;

        const parts = String(dateValue).split(/[\/\-\.]/).map(part => parseInt(part, 10));
        if (parts.length === 3 && parts.every(part => !isNaN(part))) {
            const [first, second, third] = parts;
            const year = third < 100 ? 2000 + third : third;
            return new Date(year, second - 1, first);
        }

        return new Date();
    };

    const getMonthlyExpenses = (expenses) => {
        const now = new Date();
        return expenses.filter(exp => {
            const expDate = parseExpenseDate(exp.date);
            return expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear();
        });
    };

    const getCardSpendData = (expenses) => {
        const totals = expenses.reduce((acc, exp) => {
            const cardLabel = exp.card ? `•••• ${exp.card}` : 'Sin tarjeta';
            const amount = parseFloat(exp.amount);
            acc[cardLabel] = (acc[cardLabel] || 0) + (isNaN(amount) ? 0 : amount);
            return acc;
        }, {});

        const labels = Object.keys(totals);
        return {
            labels: labels.length ? labels : ['Sin gastos'],
            data: labels.length ? labels.map(label => totals[label]) : [0]
        };
    };

    const getWeeklyTrendData = (expenses) => {
        const now = new Date();
        const weeklyTotals = [0, 0, 0, 0];

        expenses.forEach(exp => {
            const expDate = parseExpenseDate(exp.date);
            if (expDate.getMonth() !== now.getMonth() || expDate.getFullYear() !== now.getFullYear()) return;

            const weekIndex = Math.min(Math.floor((expDate.getDate() - 1) / 7), 3);
            const amount = parseFloat(exp.amount);
            weeklyTotals[weekIndex] += isNaN(amount) ? 0 : amount;
        });

        return {
            labels: ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'],
            data: weeklyTotals
        };
    };

    const getRecentDailySpendData = (expenses) => {
        const formatter = new Intl.DateTimeFormat('es-CO', { weekday: 'short' });
        const today = new Date();
        const days = Array.from({ length: 7 }, (_, index) => {
            const date = new Date(today);
            date.setDate(today.getDate() - (6 - index));
            date.setHours(0, 0, 0, 0);
            return date;
        });
        const totals = days.map(() => 0);

        expenses.forEach(exp => {
            const expDate = parseExpenseDate(exp.date);
            expDate.setHours(0, 0, 0, 0);
            const index = days.findIndex(day => day.getTime() === expDate.getTime());
            if (index === -1) return;

            const amount = parseFloat(exp.amount);
            totals[index] += isNaN(amount) ? 0 : amount;
        });

        return {
            labels: days.map(day => formatter.format(day).replace('.', '')),
            data: totals
        };
    };

    const setDashboardChartState = (canvasId, emptyId, hasData) => {
        const canvas = document.getElementById(canvasId);
        const empty = document.getElementById(emptyId);

        if (canvas) canvas.hidden = !hasData;
        if (empty) empty.hidden = hasData;
    };

    const refreshDashboardCharts = (expenses = getFromLocal('my_expenses')) => {
        const weeklyTrendData = getWeeklyTrendData(expenses);
        const hasMonthlyData = weeklyTrendData.data.some(value => Number(value) > 0);

        setDashboardChartState('monthlyTrendChart', 'monthlyTrendEmpty', hasMonthlyData);
        if (monthlyTrendChart && hasMonthlyData) {
            monthlyTrendChart.data.labels = weeklyTrendData.labels;
            monthlyTrendChart.data.datasets[0].data = weeklyTrendData.data;
            monthlyTrendChart.update();
        }

        const dailySpendData = getRecentDailySpendData(expenses);
        const hasDailyData = dailySpendData.data.some(value => Number(value) > 0);

        setDashboardChartState('dailyBarChart', 'dailyBarEmpty', hasDailyData);
        if (dailyBarChart && hasDailyData) {
            dailyBarChart.data.labels = dailySpendData.labels;
            dailyBarChart.data.datasets[0].data = dailySpendData.data;
            dailyBarChart.update();
        }
    };

    const updateAnalysisKpis = (expenses) => {
        const monthlyExpenses = getMonthlyExpenses(expenses);
        const total = monthlyExpenses.reduce((sum, exp) => {
            const amount = parseFloat(exp.amount);
            return sum + (isNaN(amount) ? 0 : amount);
        }, 0);
        const average = monthlyExpenses.length ? total / monthlyExpenses.length : 0;

        const totalEl = document.getElementById('analysisMonthlyTotal');
        const averageEl = document.getElementById('analysisExpenseAverage');
        const countEl = document.getElementById('analysisTransactionCount');

        if (totalEl) totalEl.textContent = formatMoney(total);
        if (averageEl) averageEl.textContent = formatMoney(average);
        if (countEl) countEl.textContent = `${monthlyExpenses.length} gastos`;
    };

    const refreshAnalysisDashboard = (expenses = getFromLocal('my_expenses')) => {
        updateAnalysisKpis(expenses);

        if (cardSpendChart) {
            const cardSpendData = getCardSpendData(expenses);
            cardSpendChart.data.labels = cardSpendData.labels;
            cardSpendChart.data.datasets[0].data = cardSpendData.data;
            cardSpendChart.update();
        }

        if (weeklyTrendChart) {
            const weeklyTrendData = getWeeklyTrendData(expenses);
            weeklyTrendChart.data.labels = weeklyTrendData.labels;
            weeklyTrendChart.data.datasets[0].data = weeklyTrendData.data;
            weeklyTrendChart.update();
        }
    };

    const getTopExpenseCategory = (expenses) => {
        const counts = expenses.reduce((acc, exp) => {
            const category = exp.category || 'General';
            acc[category] = (acc[category] || 0) + 1;
            return acc;
        }, {});

        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Sin datos';
    };

    const getExpenseStats = (expenses) => {
        const monthlyExpenses = getMonthlyExpenses(expenses);
        const total = monthlyExpenses.reduce((sum, exp) => {
            const amount = parseFloat(exp.amount);
            return sum + (isNaN(amount) ? 0 : amount);
        }, 0);

        return {
            total,
            count: monthlyExpenses.length,
            average: monthlyExpenses.length ? total / monthlyExpenses.length : 0,
            topCategory: getTopExpenseCategory(monthlyExpenses)
        };
    };

    const refreshExpensesDashboard = (expenses = getFromLocal('my_expenses')) => {
        const stats = getExpenseStats(expenses);
        const totalEl = document.getElementById('expensesMonthlyTotal');
        const countEl = document.getElementById('expensesCount');
        const averageEl = document.getElementById('expensesAverage');
        const topCategoryEl = document.getElementById('expensesTopCategory');

        if (totalEl) totalEl.textContent = formatMoney(stats.total);
        if (countEl) countEl.textContent = stats.count.toString();
        if (averageEl) averageEl.textContent = formatMoney(stats.average);
        if (topCategoryEl) topCategoryEl.textContent = stats.topCategory;
    };

    const refreshDashboardTasks = (tasks = getFromLocal('expensio_tasks')) => {
        const container = document.getElementById('tasksContainer');
        if (!container) return;

        const pendingTasks = tasks.filter(task => (task.status || 'pending') === 'pending');
        if (pendingTasks.length === 0) {
            container.innerHTML = '<p class="dashboard-empty">No hay tareas pendientes</p>';
            return;
        }

        container.innerHTML = pendingTasks.slice(0, 4).map(task => `
            <div class="task-item">
                <span>${task.title || task.nombre || 'Tarea sin título'}</span>
                <strong>${task.priority || task.prioridad || 'Media'}</strong>
            </div>
        `).join('');
    };

    const refreshDashboardOverview = () => {
        const expenses = getFromLocal('my_expenses');
        const cards = getFromLocal('my_cards');
        const tasks = getFromLocal('expensio_tasks');
        const monthlyExpenses = getMonthlyExpenses(expenses);
        const monthlyTotal = monthlyExpenses.reduce((sum, exp) => {
            const amount = parseFloat(exp.amount);
            return sum + (isNaN(amount) ? 0 : amount);
        }, 0);
        const pendingTasks = tasks.filter(task => (task.status || 'pending') === 'pending');

        const totalEl = document.getElementById('dashboardMonthlyTotal');
        const expensesCountEl = document.getElementById('dashboardExpensesCount');
        const pendingTasksEl = document.getElementById('dashboardPendingTasks');
        const cardsCountEl = document.getElementById('dashboardCardsCount');

        if (totalEl) totalEl.textContent = formatMoney(monthlyTotal);
        if (expensesCountEl) expensesCountEl.textContent = monthlyExpenses.length.toString();
        if (pendingTasksEl) pendingTasksEl.textContent = pendingTasks.length.toString();
        if (cardsCountEl) cardsCountEl.textContent = cards.length.toString();

        refreshDashboardTasks(tasks);
        refreshDashboardCharts(expenses);
    };
    window.refreshDashboardOverview = refreshDashboardOverview;

    const refreshCurrencyViews = () => {
        const expenses = getFromLocal('my_expenses');

        renderExpenses(expenses);

        if (flowChart) {
            flowChart.data.datasets[0].label = `Gastos (${window.getCurrencySymbol()})`;
            flowChart.update();
        }

        const adminView = document.getElementById('view-admin');
        if (adminView && adminView.style.display !== 'none' && typeof window.loadAdminPanel === 'function') {
            window.loadAdminPanel();
        }
    };
    window.refreshCurrencyViews = refreshCurrencyViews;

    const inputAvatar = document.getElementById('inputAvatar');
    const fileNameDisplay = document.getElementById('fileNameDisplay');

    inputAvatar?.addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
            fileNameDisplay.textContent = file.name;

            const reader = new FileReader();
            reader.onload = function(e) {
                const base64Image = e.target.result;

                const sessionUser = window.getAuthSession()?.user || {};
                let currentSettings = {
                    ...sessionUser,
                    ...(JSON.parse(localStorage.getItem('expensio_settings') || '{}') || {})
                };
                currentSettings.picture = base64Image;
                localStorage.setItem('expensio_settings', JSON.stringify(currentSettings));

                if (typeof applySettings === 'function') {
                    applySettings(currentSettings);
                }

                window.saveUserSettingsToBackend(currentSettings).catch(error => {
                    console.warn('No se pudo sincronizar foto de perfil:', error);
                    showToast("Foto guardada localmente. Sincronizacion pendiente.", "warning");
                });
                showToast("Foto de perfil actualizada");

            };
            reader.readAsDataURL(file);
        }
    });

    const settingsForm = document.getElementById('settings-form');
    const currencySelect = document.getElementById('currency-select');
    if (currencySelect) currencySelect.value = window.getCurrentCurrency();

    if(settingsForm) {
        settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const nameValue = document.getElementById('setUserName').value;
            const selectMoneda = document.getElementById('currency-select');

            if (nameValue && nameValue.trim() !== '') {
                localStorage.setItem('user_profile_name', nameValue);
                console.log("Nombre guardado:", nameValue);

                const sidebarName = document.getElementById('displayUserName');
                if (sidebarName) {
                    sidebarName.textContent = nameValue;
                }
            } else {
                console.warn("Nombre no válido, no se guardará.");
            }
            
            let selectedCurrency = window.getCurrentCurrency();
            if (selectMoneda) {
                const currency = window.setCurrentCurrency(selectMoneda.value);
                selectMoneda.value = currency;
                selectedCurrency = currency;
                console.log("Moneda guardada:", currency);
            }

            const sessionUser = window.getAuthSession()?.user || {};
            const currentSettings = {
                ...sessionUser,
                ...(JSON.parse(localStorage.getItem('expensio_settings') || '{}') || {})
            };
            const updatedSettings = {
                ...currentSettings,
                name: nameValue && nameValue.trim() ? nameValue.trim() : currentSettings.name,
                currency: selectedCurrency,
                picture: currentSettings.picture || null
            };

            localStorage.setItem('expensio_settings', JSON.stringify(updatedSettings));
            applySettings(updatedSettings);

            window.saveUserSettingsToBackend(updatedSettings).catch(error => {
                console.warn('No se pudo sincronizar ajustes con MySQL:', error);
                showToast("Ajustes guardados localmente. Sincronizacion pendiente.", "warning");
            });

            if (typeof window.refreshCurrencyViews === 'function') {
                window.refreshCurrencyViews();
            }

            showToast("Configuracion actualizada");
            const nombreEnPantalla = document.getElementById('user-name-display');
            if (nombreEnPantalla) {
                nombreEnPantalla.textContent = nameValue;
            }
            if (typeof toggleSettings === 'function') toggleSettings();
          /* window.location.reload();*/
        });
    } else {
        console.error("No se encontró el formulario de configuración");
    };


    const updateCharts = (category, amount) => {
        const val = parseFloat(amount);
        if (isNaN(val)) return;
        if (categoryChart) {
            let index = categoryChart.data.labels.indexOf(category);
            if (index === -1) index = 5; 
            categoryChart.data.datasets[0].data[index] += val;
            categoryChart.update();
        }
        if (flowChart) {
            const hoy = new Date().getDay(); 
            const indexDia = hoy === 0 ? 6 : hoy - 1; 
            flowChart.data.datasets[0].data[indexDia] += val;
            flowChart.update();
        }
    };

    //  CONFIGURACIÓN Y PERFIL 
    const applySettings = (settings) => {
        if (!settings) return;

        const userName = String(settings.name || 'Usuario Expensio');

        if (elements.displayUserName) {
            elements.displayUserName.textContent = userName;
        }
    

        const inputName = document.getElementById('setUserName');
        const selectCurrency = document.getElementById('currency-select');
    
        if (inputName) inputName.value = userName;
        if (selectCurrency) selectCurrency.value = window.normalizeCurrencyCode(settings.currency);

        if (elements.userAvatar) {
            if (settings.picture) {
                elements.userAvatar.textContent = ""; 
                elements.userAvatar.style.backgroundImage = `url('${settings.picture}')`;
                elements.userAvatar.style.backgroundSize = "cover";
                elements.userAvatar.style.backgroundPosition = "center";
                elements.userAvatar.style.backgroundColor = "transparent";
            
                elements.userAvatar.style.borderRadius = "50%"; 
                elements.userAvatar.style.display = "block";
            } else {
                elements.userAvatar.style.backgroundImage = "none";
                elements.userAvatar.style.backgroundColor = "var(--accent-color)";
                elements.userAvatar.textContent = userName.substring(0, 2).toUpperCase();
            }
        }
    
    };
    window.applySettings = applySettings;
    
    window.renderTasks = () => {
        const tasks = JSON.parse(localStorage.getItem('expensio_tasks')) || [];

        const pendingList = document.getElementById('pendingTasksList');
        if (pendingList) pendingList.innerHTML = '';


        tasks.forEach(task => {
    
            const priorityClass = `badge-${(task.priority || 'media').toLowerCase()}`;
            const li = document.createElement('li');
            li.className = 'task-card';
    
            li.innerHTML = `
                <div class="task-info">
                    <strong>${task.title}</strong>
                    <span class="priority-badge ${priorityClass}">${task.priority}</span>
                </div>
                <div class="task-ctrl">
                    <button class="task-btn" onclick="moveTask('${task.id}', 'progress')">▶️</button>
                    <button class="task-btn delete" onclick="deleteTask('${task.id}')">🗑️</button>
                </div>
            `;

            if (task.status === 'pending') document.getElementById('pendingTasksList').appendChild(li);

        });

    };
    
    elements.settingsForm?.addEventListener('submit', (e) => {
        e.preventDefault();

        const currentSettings = JSON.parse(localStorage.getItem('expensio_settings')) || {};
        const formData = new FormData(elements.settingsForm);

        const updatedSettings = {
            ...currentSettings,
            name: formData.get('userName') || currentSettings.name,
            currency: window.normalizeCurrencyCode(formData.get('currency') || currentSettings.currency)
        };

        saveToLocal('expensio_settings', updatedSettings);
        window.setCurrentCurrency(updatedSettings.currency);
        window.saveUserSettingsToBackend(updatedSettings).catch(error => {
            console.warn('No se pudo sincronizar ajustes con MySQL:', error);
            showToast("Ajustes guardados localmente. Sincronizacion pendiente.", "warning");
        });
        applySettings(updatedSettings);
        if (typeof window.refreshCurrencyViews === 'function') {
            window.refreshCurrencyViews();
        }

        showToast("Configuración actualizada");
    });


    window.updateDashboardTasks = () => {
        const tasks = loadFromLocal('expensio_tasks') || [];
        const container = document.getElementById('dashboard-tasks-list'); 
    
        if (!container) return; 

        if (tasks.length === 0) {
            container.innerHTML = '<p style="color: #8b949e; font-size: 0.8rem;">No hay tareas pendientes</p>';
            return;
        }

        container.innerHTML = '';
        const pendingTasks = tasks.filter(t => t.status === 'pending');

        pendingTasks.slice(0, 4).forEach(task => { 
            container.innerHTML += `
                <div style="background: #1c2128; padding: 8px; margin-bottom: 5px; border-radius: 4px; border-left: 3px solid #f85149;">
                    <span style="color: #c9d1d9; font-size: 0.85rem; display: block;">${task.title}</span>
                    <small style="color: #8b949e; font-size: 0.7rem;">Prioridad: ${task.priority}</small>
                 </div>
            `;
        });
    };



    //  LOGIN Y TAREAS
    elements.loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('loginEmail')?.value?.trim();
        const password = document.getElementById('loginPassword')?.value || '';

        if (!email || !password) {
            showToast("Correo y contrasena son requeridos", "warning");
            return;
        }

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || errorData.error || 'No se pudo iniciar sesion');
            }

            const authData = await response.json();
            window.saveAuthSession(authData, {
                name: authData.user?.name,
                email: authData.user?.email,
                picture: authData.user?.picture,
                currency: authData.user?.currency || 'USD'
            });

            applySettings(authData.user);
            window.syncAdminVisibility();
            toggleModal('loginOverlay', false);
            showToast(`Bienvenido, ${authData.user?.name || 'Usuario'}`);
            initApp();
        } catch (error) {
            showToast(error.message || 'No se pudo iniciar sesion', 'error');
        }
    });

    const initApp = () => {
        console.log("🛠️ Sincronizando Interfaz...");
        const authSession = window.getAuthSession();
        const savedSettings = localStorage.getItem('expensio_settings');
        const loginBtn = document.getElementById('sidebarLogin');

        if (!loginBtn) return;

        if (authSession) { 
            console.log("✅ Sesión activa");
            const settingsObj = savedSettings
                ? JSON.parse(savedSettings)
                : { name: authSession.user?.name, email: authSession.user?.email, role: authSession.user?.role, picture: authSession.user?.picture, currency: authSession.user?.currency };
            applySettings(settingsObj);
            window.loadUserSettingsFromBackend().then(data => {
                if (!data?.user || typeof applySettings !== 'function') return;
                applySettings(data.user);
                if (typeof window.refreshCurrencyViews === 'function') window.refreshCurrencyViews();
            }).catch(error => console.warn('No se pudo cargar moneda desde MySQL:', error));
            loadUserTickets().catch(error => console.warn('No se pudieron cargar tickets:', error));
            window.syncAdminVisibility();
            
            loginBtn.innerHTML = '<i class="bx bx-log-out"></i> <span>Cerrar Sesión</span>';
            loginBtn.classList.add('logout-active');
            loginBtn.onclick = window.logout;

            const overlay = document.getElementById('loginOverlay');
            if (overlay) overlay.style.display = 'none';
        } else {
            console.log("👤 Modo Invitado");
            window.syncAdminVisibility();
            loginBtn.innerHTML = '<i class="bx bx-key"></i> <span>Entrar</span>';
            loginBtn.classList.remove('logout-active');
            loginBtn.onclick = () => {
                toggleModal('loginOverlay', true);
                setTimeout(() => {
                    if (window.google) {
                        google.accounts.id.renderButton(
                            document.getElementById("googleBtn"),
                            { theme: "outline", size: "large", text: "signin_with", width: "250" }
                        );
                    }
                }, 350);
            };
        }
    };

    window.renderTasks = function() {
        if (typeof window.renderKanbanTasks === 'function') {
            window.renderKanbanTasks();
            return;
        }
        const container = document.getElementById('tasksContainer');
        if (!container) return;
        const tareas = JSON.parse(localStorage.getItem('expensio_tasks')) || [];
        container.innerHTML = ""; 
        tareas.forEach(tarea => {
            let colorClass = tarea.prioridad === "Alta" ? "p-rojo" : (tarea.prioridad === "Media" ? "p-naranja" : "p-verde");
            container.innerHTML += `
            <div class="task-item">
                <div class="task-info">
                    <span>📝</span>
                    <span class="task-text">${tarea.nombre}</span>
                    <span class="priority-tag ${colorClass}">${tarea.prioridad}</span>
                </div>
                <button onclick="deleteTask(${tarea.id})" class="delete-btn" title="Eliminar Tarea">
                    <span class="icon-x">✕</span>
                </button>
            </div>`;
        });
    };

    //ESTEEEE
    const renderTasks = () => {
        const columns = {
            pending: document.getElementById('pendingTasksList'),
            progress: document.getElementById('progressTasksList'),
            completed: document.getElementById('completedTasksList')
        };

        Object.values(columns).forEach(col => { if(col) col.innerHTML = ''; });

        const tasks = window.normalizeTaskList(JSON.parse(localStorage.getItem('expensio_tasks')) || []);
        window.saveTasksLocal(tasks);

        tasks.forEach((task, index) => {
            const taskKey = window.getTaskKey(task, index);
            console.log('[tasks:renderDeleteButton:inner]', {
                title: task.title,
                taskKey,
                id: task.id,
                backendId: task.backendId
            });
            const li = document.createElement('li');
            li.id = `task-${taskKey}`;
            li.dataset.taskKey = taskKey;
            li.className = `task-item priority-${(task.priority || 'media').toLowerCase()}`;
            li.setAttribute('draggable', 'true');
        
            li.ondragstart = (ev) => {
                const taskItem = ev.target.closest('.task-item');
                ev.dataTransfer.setData("text", taskItem?.dataset?.taskKey || taskKey);
            };

            li.innerHTML = `
                <div class="task-content">
                    <strong>${task.title}</strong>
                    <span class="badge">${task.priority}</span>
                </div>
                <div class="task-actions">
                    <button onclick="deleteTask('${task.id}')" style="cursor:pointer">🗑️</button>
                </div>
            `;

            const deleteButton = li.querySelector('.task-actions button');
            if (deleteButton) {
                deleteButton.type = 'button';
                deleteButton.removeAttribute('onclick');
                deleteButton.onclick = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    console.log('[tasks:deleteButtonClick:inner]', {
                        clicked: true,
                        taskKey,
                        id: task.id,
                        backendId: task.backendId,
                        title: task.title
                    });
                    console.log('[tasks:deleteButtonClick:inner] calling window.deleteTask', taskKey);
                    console.log("[tasks:click typeof window.deleteTask]", typeof window.deleteTask);
                    console.log("[tasks:click code]", window.deleteTask?.toString().slice(0, 180));
                    const deleteFn = window.deleteTask;
                    console.log("[tasks:click deleteFn captured]", typeof deleteFn);
                    deleteFn(taskKey);
                };
            }

            const target = columns[task.status] || columns.pending;
            if (target) target.appendChild(li);
        });
    };

   const taskForm = document.getElementById('formAddTask');

   if (taskForm) {
        taskForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const inputTitulo = document.getElementById('task-title');
            const inputPrioridad = document.getElementById('task-priority');

            const campoTitulo = inputTitulo || document.querySelector('input[name="task-title"]');
            const campoPrioridad = inputPrioridad  || document.querySelector('select');

            if (!campoTitulo) { 
                console.error("No se encontró el campo de título de tarea.");
                return;
            }

            const titleValue = campoTitulo.value.trim();
            if (!titleValue) {
                if (window.showToast) window.showToast("El titulo de la tarea no puede estar vacio.", "warning");
                return;
            }

            const tasks = JSON.parse(localStorage.getItem('expensio_tasks')) || [];
            const newTask = {
                id: `local-${Date.now()}`,
                taskKey: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                title: titleValue,
                priority: campoPrioridad ? campoPrioridad.value : 'Media',
                status: 'pending',
                date: new Date().toISOString()
            };

            let savedTask = newTask;
            let toastMessage = "Tarea agregada";
            let toastType = "success";

            try {
                const apiTask = await window.createTaskInBackend(newTask);
                savedTask = window.mapApiTaskToLocal(apiTask);
            } catch (error) {
                console.error('Error guardando tarea en MySQL:', error);
                toastMessage = "Tarea guardada localmente. Sincronizacion pendiente.";
                toastType = "warning";
            }

            savedTask = window.normalizeTaskList([savedTask])[0];
            tasks.push(savedTask);
            window.saveTasksLocal(tasks);

            e.target.reset();
            if(typeof renderTasks === 'function') renderTasks();
            if(typeof showToast === 'function') showToast(toastMessage, toastType);
        });
    }

    window.showView = function(viewId){
        if (viewId === 'tasks') {
            document.querySelector('.nav-item[data-section="tasks"]')?.click();
        } else  if (viewId === 'expenses') {
            window.location.href = 'gastos.html';
        } else {
            window.location.href = 'index.html';
        }
    };

    const legacyDeleteTaskScoped = (taskId) => {
        if(!confirm("¿Eliminar esta tarea?")) return;
        let tasks = loadFromLocal('expensio_tasks') || [];
        tasks = tasks.filter(task => task.id !== taskId);
        saveToLocal('expensio_tasks', tasks);
        renderTasks();
    };

   /* const taskForm = document.getElementById('task-form'); */
    
    /*if (taskForm) {
        taskForm.addEventListener('submit', (e) => {
            e.preventDefault(); 

            const title = document.getElementById('task-title').value;
            const priority = document.getElementById('task-priority').value;


            const newTask = {
                id: Date.now().toString(), 
                title: data.get('title'),
                priority: priority,
                status: 'pending'
            };

            const tasks = JSON.parse(localStorage.getItem('expensio_tasks')) || [];
            tasks.push(newTask);
            localStorage.setItem('expensio_tasks', JSON.stringify(tasks));

            taskForm.reset();
            renderTasks(); 
        });
    } */

    initCharts();
    
    loadCards();
    loadExpenses();

    window.loadTasks();
    initApp();
    setUpDragAndDrop();

}); 

window.handleGoogleLoginLegacy = function(response) {
    console.log("Sesión de google recibida", response);
    showToast("Sesión iniciada con Google");

    const payload = response.credential;
    localStorage.setItem('expensio_google_user', payload);

    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'none'; 

    if(window.showToast) window.showToast("Bienvenido a Expensio");

    renderTasks();

};

//  GOOGLE LOGIN 
window.renderizarBotonGoogle = function() {
    const container = document.getElementById("googleBtnContainer");
    
    if (!container) {
        console.warn("⚠️ Contenedor de Google no encontrado en el HTML.");
        return;
    }

    if (typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.initialize({
            client_id: "234964892760-bjunb6p0drjr9ftpmm1brv552pl6raoo.apps.googleusercontent.com",
            callback: handleGoogleLogin,
            auto_select: false,
            itp_support: true
        });

        google.accounts.id.renderButton(
            container,
            { theme: "outline", size: "large", width: "320", shape: "rectangular" }
        );
        console.log("🎯 Google inyectado correctamente.");
    } else {
        console.log("⏳ Reintentando carga de librería Google...");
        setTimeout(window.renderizarBotonGoogle, 500);
    }
};

window.handleCredentialResponse = (response) => { 
    const responsePayload = decodeJwtResponse(response.credential);

    const userData = {
        name: responsePayload.name,
        email: responsePayload.email,
        picture: responsePayload.picture,
        currency: "USD"
    };

    localStorage.setItem('expensio_settings', JSON.stringify(userData));

    if (typeof window.applySettings === 'function') {
        window.applySettings(userData);
    }
    showToast(`¡Bienvenido, ${userData.name}!`);
    setTimeout(() => location.reload(), 1500);
};

function parseJwt(token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

window.resetApp = () => {
    if (confirm("¿Borrar todos los datos?")) {
        localStorage.clear();
        location.reload();
    }
};

const initApp = () => {
    console.log("🚀 Iniciando cerebro de Expensio...");

    elementsTasks.form = document.getElementById('formAddTask');
    elementsTasks.title = document.getElementById('task-title');
    elementsTasks.priority = document.getElementById('task-priority');

    const savedName = localStorage.getItem('user_profile_name');
    if (savedName) { 
        const sidebarName = document.getElementById('displayUserName');
        if (sidebarName) sidebarName.textContent = savedName;

        const inputAjustes = document.getElementById('setUserName');
        if (inputAjustes) inputAjustes.value = savedName;
    }
 
    const authSession = window.getAuthSession();
    const savedSettings = localStorage.getItem('expensio_settings');
    const hasSession = Boolean(authSession);
    if (savedSettings && typeof window.applySettings === 'function') {
        window.applySettings(JSON.parse(savedSettings));
    } else if (authSession && typeof window.applySettings === 'function') {
        window.applySettings({
            name: authSession.user?.name,
            email: authSession.user?.email,
            role: authSession.user?.role,
            currency: authSession.user?.currency,
            picture: authSession.user?.picture
        });
    }
    if (hasSession) {
        window.loadUserSettingsFromBackend().then(data => {
            if (!data?.user || typeof window.applySettings !== 'function') return;
            window.applySettings(data.user);
            if (typeof window.refreshCurrencyViews === 'function') window.refreshCurrencyViews();
        }).catch(error => console.warn('No se pudo cargar moneda desde MySQL:', error));
        if (typeof window.loadUserTickets === 'function') {
            window.loadUserTickets().catch(error => console.warn('No se pudieron cargar tickets:', error));
        }
    }
    window.syncAdminVisibility();
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = hasSession ? 'none' : 'flex';
    console.log("✅ Sesión detectada.");
    
    console.log("⚠️ Sin sesión. Preparando Login...");

    if(elementsTasks.form) { 
        console.log("Formulario listo")
    }

    if (typeof setUpDragAndDrop === 'function') {
        setUpDragAndDrop();
    }

    if (typeof renderTasks === 'function') {
        renderTasks();
    }

    setTimeout(() => {
        if (!hasSession && typeof renderizarBotonGoogle === 'function') {
            renderizarBotonGoogle();
        }

    }, 1000); 

};

initApp();

window.logout = () => { 
    window.clearAuthSession();
    console.log("Cerrando Sesión...");
    location.reload();

};

window.toggleModal = function(modalId, show) { 
    const modal = document.getElementById(modalId);
    if (modal) { 
        modal.style.display = show ? 'flex' : 'none'; 
    }
};


function decodeJwtResponse(token) {
    let base64Url = token.split('.')[1];
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    let jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

window.handleGoogleLoginLegacy = (response) => {
    const responsePayload = decodeJwtResponse(response.credential);

    const userData = {
        name: responsePayload.name,
        email: responsePayload.email,
        picture: responsePayload.picture,
        currency: "USD"
    };

    localStorage.setItem('expensio_settings', JSON.stringify(userData));
    showToast(`¡Bienvenido, ${responsePayload.name}!`);

    setTimeout(() => location.reload(), 1500);

};

window.handleGoogleLogin = async (response) => {
    try {
        const googleProfile = decodeJwtResponse(response.credential);

        const backendResponse = await fetch('/api/auth/google-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: response.credential })
        });

        if (!backendResponse.ok) {
            const errorData = await backendResponse.json().catch(() => ({}));
            throw new Error(errorData.message || 'No se pudo iniciar sesion');
        }

        const authData = await backendResponse.json();
        window.saveAuthSession(authData, {
            name: googleProfile.name,
            email: googleProfile.email,
            picture: googleProfile.picture,
            currency: authData.user?.currency || 'USD'
        });

        window.syncAdminVisibility();
        showToast(`Bienvenido, ${authData.user?.name || googleProfile.name}`);

        setTimeout(() => location.reload(), 800);
    } catch (error) {
        console.error('Error en Google login:', error);
        if (window.showToast) window.showToast(error.message || 'No se pudo iniciar sesion', 'error');
    }
};

window.legacyDeleteTaskPreKanban = (id) => {
    if (confirm("¿Eliminar esta tarea?")) {
        let tasks = loadFromLocal('expensio_tasks') || [];

        const updatedTasks = tasks.filter(t => t.id.toString() !== id.toString());

        saveToLocal('expensio_tasks', updatedTasks);

        renderTasks();
        showToast("Tarea eliminada", "success");
    }

};

window.moveTask = function(taskId, newStatus) {
    console.log("Moviendo tarea:", taskId, "a", newStatus);
    
    let tasks = JSON.parse(localStorage.getItem('expensio_tasks')) || [];
    
    let taskfound = false;

    tasks = tasks.map(task => {
        if (String(task.id) === String(taskId)) {
            task.status = newStatus;
            taskfound = true;
            console.log("Tarea actualizada:");
        }
        return task;
    });

    if (!taskfound) {
        console.error("Tarea no encontrada con ID:", taskId);
        return;
    }
    
    localStorage.setItem('expensio_tasks', JSON.stringify(tasks));
    
    
    if (typeof window.renderKanbanTasks === 'function') {
        window.renderKanbanTasks();
        console.log("Vista actualizada después de mover tarea.");
    }
}; 

window.legacyDeleteTaskInstrumented = async (id) => {
    console.group('[tasks:deleteTask]');
    console.log('taskKey/id recibido:', id);
    console.log('typeof window.deleteTask:', typeof window.deleteTask);
    console.log('cantidad tareas antes de borrar:', (loadFromLocal('expensio_tasks') || []).length);
    if (!confirm("Eliminar esta tarea?")) {
        console.log('borrado cancelado por confirm');
        console.groupEnd();
        return;
    }

    const tasks = window.normalizeTaskList(loadFromLocal('expensio_tasks') || []);
    const idValue = String(id);
    console.log('[tasks:deleteTask:afterConfirm] taskKey recibido:', idValue);
    console.log('lista actual expensio_tasks:', tasks);
    const matchesTask = (task, index) => {
        return window.getTaskKey(task, index) === idValue
            || String(task.id) === idValue
            || String(task.backendId || '') === idValue
            || `backend-${task.backendId}` === idValue;
    };
    const taskIndex = tasks.findIndex(matchesTask);
    const taskToDelete = taskIndex >= 0 ? tasks[taskIndex] : null;
    const updatedTasks = taskIndex >= 0 ? tasks.filter((task, index) => index !== taskIndex) : tasks;
    console.log('[tasks:deleteTask:match]', {
        taskIndex,
        taskToDelete,
        backendId: taskToDelete?.backendId,
        deleteUrl: taskToDelete?.backendId ? `/api/tasks/${taskToDelete.backendId}` : null
    });
    console.log('tarea encontrada:', taskToDelete);
    console.log('backendId detectado:', taskToDelete?.backendId);
    console.log('lista final despues de filtrar:', updatedTasks);

    if (!taskToDelete) {
        console.error("Tarea no encontrada para eliminar:", id);
        if (window.showToast) window.showToast("No se encontró la tarea para eliminar.", "warning");
        return;
    }

    saveToLocal('expensio_tasks', updatedTasks);
    console.log('[tasks:deleteTask:localSaved]', {
        countAfter: updatedTasks.length,
        tasksAfter: updatedTasks
    });
    console.log('[tasks:deleteTask:render] llamando renderTasks() despues de filtrar local');
    renderTasks();

    if (taskToDelete?.backendId) {
        try {
            console.log('[tasks:deleteTask:backend] URL DELETE exacta:', `/api/tasks/${taskToDelete.backendId}`);
            const backendResponse = await window.deleteTaskInBackend(taskToDelete);
            console.log('[tasks:deleteTask:backend] respuesta backend DELETE:', backendResponse);
            showToast("Tarea eliminada", "success");
        } catch (error) {
            console.error('[tasks:deleteTask:backend] error DELETE:', error);
            showToast("Tarea eliminada localmente. Sincronizacion pendiente.", "warning");
        }
        console.groupEnd();
        return;
    }

    console.log('tarea local sin backendId: borrada solo de expensio_tasks');
    showToast("Tarea eliminada", "success");
    console.groupEnd();
};

window.moveTask = async function(taskId, newStatus) {
    let tasks = window.normalizeTaskList(JSON.parse(localStorage.getItem('expensio_tasks')) || []);
    let movedTask = null;

    tasks = tasks.map((task, index) => {
        if (window.getTaskKey(task, index) === String(taskId)) {
            movedTask = { ...task, status: newStatus };
            return movedTask;
        }
        return task;
    });

    if (!movedTask) {
        console.error("Tarea no encontrada con ID:", taskId);
        return;
    }

    localStorage.setItem('expensio_tasks', JSON.stringify(tasks));

    if (typeof window.renderKanbanTasks === 'function') {
        window.renderKanbanTasks();
    }

    if (movedTask.backendId) {
        try {
            await window.updateTaskInBackend(movedTask);
        } catch (error) {
            console.error('Error actualizando tarea en MySQL:', error);
            if (window.showToast) window.showToast("Tarea movida localmente. Sincronizacion pendiente.", "warning");
        }
    }
};

// 1. Funciones Globales (Para que el HTML las vea y no lance errores rojos)
window.allowDrop = (ev) => ev.preventDefault();

window.drag = (ev) => {
    const taskItem = ev.target.closest('.task-item');
    const taskKey = taskItem?.dataset?.taskKey || taskItem?.id || ev.target.id;
    ev.dataTransfer.setData("text", taskKey);
};

window.drop = (ev) => {
    ev.preventDefault();
    const taskId = ev.dataTransfer.getData("text");
    const col = ev.target.closest('.task-list');
    
    if (col && taskId) {
        let newStatus = 'pending';
        if (col.id === 'progressTasksList') newStatus = 'progress';
        if (col.id === 'completedTasksList') newStatus = 'completed';
        moveTask(taskId, newStatus);
    }
};

function setupTaskForm() {
    if (!elementsTasks.form || !elementsTasks.title){
        console.warn("Formulario de tareas no encontrado. Asegúrate de que el HTML tenga los elementos con IDs 'formAddTask' y 'task-title'.");
        return;
    }

    elementsTasks.form.addEventListener('submit', (e) => {
        e.preventDefault();

        const tasks = JSON.parse(localStorage.getItem('expensio_tasks')) || [];
        const newTask = {
            id: String(Date.now()),
            title: elementsTasks.title.value.trim(),
            priority: elementsTasks.priority.value || 'Media',
            status: 'pending',
        };

        if (!newTask.title) return;
        tasks.push(newTask);
        localStorage.setItem('expensio_tasks', JSON.stringify(tasks));

        elementsTasks.form.reset();
        renderTasks();

        if (window.showToast) window.showToast("Tarea creada");
    });
}


function renderKanbanTasks () {
    const columns = {
        pending: document.getElementById('pendingTasksList'),
        progress: document.getElementById('progressTasksList'),
        completed: document.getElementById('completedTasksList')
    };

    if (columns.pending) columns.pending.innerHTML = '';
    if (columns.progress) columns.progress.innerHTML = '';
    if (columns.completed) columns.completed.innerHTML = '';
    
    const tasks = window.normalizeTaskList(JSON.parse(localStorage.getItem('expensio_tasks')) || []);
    window.saveTasksLocal(tasks);

    tasks.forEach((task, index) => {
        const taskKey = window.getTaskKey(task, index);
        console.log('[tasks:renderDeleteButton]', {
            title: task.title,
            taskKey,
            id: task.id,
            backendId: task.backendId
        });
        const li = document.createElement('li');
        li.id = `task-${taskKey}`;
        li.dataset.taskKey = taskKey;
        li.className = `task-item priority-${(task.priority || 'media').toLowerCase()}`;
        li.setAttribute('draggable', 'true');
        li.setAttribute('ondragstart', 'drag(event)'); 

        li.innerHTML = `
            <div class="task-content">
                <strong>${task.title}</strong>
                <span class="badge">${task.priority}</span>
            </div>
            <div class="task-actions">
                <button onclick="deleteTask('${task.id}')">🗑️</button>
            </div>
        `;

        const deleteButton = li.querySelector('.task-actions button');
        if (deleteButton) {
            deleteButton.type = 'button';
            deleteButton.removeAttribute('onclick');
            deleteButton.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                console.log('[tasks:deleteButtonClick]', {
                    clicked: true,
                    taskKey,
                    id: task.id,
                    backendId: task.backendId,
                    title: task.title
                });
                console.log('[tasks:deleteButtonClick] calling window.deleteTask', taskKey);
                console.log("[tasks:click typeof window.deleteTask]", typeof window.deleteTask);
                console.log("[tasks:click code]", window.deleteTask?.toString().slice(0, 180));
                const deleteFn = window.deleteTask;
                console.log("[tasks:click deleteFn captured]", typeof deleteFn);
                deleteFn(taskKey);
            };
        }

        console.log("Dibujando tarea:", task.title);
        const target = columns[task.status] || columns.pending;
        if (target) target.appendChild(li);
    });
    if (typeof window.refreshDashboardOverview === 'function') {
        window.refreshDashboardOverview();
    }
    console.log(
        '[tasks:renderKanbanTasks deleteTask active]',
        window.deleteTask?.toString().includes('ACTIVE_DELETE_TASK_V3')
    );
    
};

window.renderKanbanTasks = renderKanbanTasks;
window.renderTasks = renderKanbanTasks;

function setUpDragAndDrop() {
    console.log("Configurando Drag & Drop para tareas...");
}

function allowDrop(ev) {
    ev.preventDefault();
}

function drag(ev) {
    const taskItem = ev.target.closest('.task-item');
    const taskKey = taskItem?.dataset?.taskKey || taskItem?.id || ev.target.id;
    ev.dataTransfer.setData("text", taskKey);
}

window.deleteTask = async function(taskKey) {
    console.log("[tasks:ACTIVE_DELETE_TASK_V3]", taskKey);
    console.log('typeof window.deleteTask:', typeof window.deleteTask);

    if (!confirm("Eliminar esta tarea?")) {
        console.log('[tasks:ACTIVE_DELETE_TASK_V3] cancelado por confirm');
        return;
    }

    const tasks = window.normalizeTaskList(loadFromLocal('expensio_tasks') || []);
    console.log('[tasks:ACTIVE_DELETE_TASK_V3] tareas antes:', tasks);

    const keyValue = String(taskKey);
    const taskIndex = tasks.findIndex((task, index) => {
        return window.getTaskKey(task, index) === keyValue
            || String(task.id) === keyValue
            || String(task.backendId || '') === keyValue
            || `backend-${task.backendId}` === keyValue;
    });

    const taskToDelete = taskIndex >= 0 ? tasks[taskIndex] : null;
    console.log('[tasks:ACTIVE_DELETE_TASK_V3] match:', {
        taskIndex,
        taskToDelete,
        backendId: taskToDelete?.backendId,
        deleteUrl: taskToDelete?.backendId ? `/api/tasks/${taskToDelete.backendId}` : null
    });

    if (!taskToDelete) {
        if (window.showToast) window.showToast("No se encontro la tarea para eliminar.", "warning");
        return;
    }

    const updatedTasks = tasks.filter((task, index) => index !== taskIndex);
    window.saveTasksLocal(updatedTasks);
    console.log('[tasks:ACTIVE_DELETE_TASK_V3] tareas despues filtro:', updatedTasks);

    if (typeof window.renderKanbanTasks === 'function') {
        console.log('[tasks:ACTIVE_DELETE_TASK_V3] renderKanbanTasks()');
        window.renderKanbanTasks();
    } else if (typeof window.renderTasks === 'function') {
        console.log('[tasks:ACTIVE_DELETE_TASK_V3] renderTasks()');
        window.renderTasks();
    }

    if (typeof window.refreshDashboardOverview === 'function') {
        window.refreshDashboardOverview();
    }

    if (taskToDelete.backendId) {
        try {
            console.log('[tasks:ACTIVE_DELETE_TASK_V3] DELETE exacto:', `/api/tasks/${taskToDelete.backendId}`);
            const backendResponse = await window.deleteTaskInBackend(taskToDelete);
            console.log('[tasks:ACTIVE_DELETE_TASK_V3] respuesta DELETE:', backendResponse);
            if (window.showToast) window.showToast("Tarea eliminada", "success");
        } catch (error) {
            console.error('[tasks:ACTIVE_DELETE_TASK_V3] error DELETE:', error);
            if (window.showToast) window.showToast("Tarea eliminada localmente. Sincronizacion pendiente.", "warning");
        }
        return;
    }

    console.log('[tasks:ACTIVE_DELETE_TASK_V3] tarea local eliminada sin backend');
    if (window.showToast) window.showToast("Tarea eliminada", "success");
};

console.log("[tasks:window.deleteTask assigned]", window.deleteTask.toString().slice(0, 120));

document.addEventListener('DOMContentLoaded', initApp);
document.addEventListener('DOMContentLoaded', setUpDragAndDrop);
