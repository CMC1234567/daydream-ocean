
/* Daydream ☁️ Ocean Task Studio
   Local storage + Supabase Auth and task CRUD.
   Requires Supabase JS v2 in index.html before this script.
*/
(() => {
  'use strict';

  const SUPABASE_URL = 'https://ckvfhfqhjjldecmrtxjo.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ehlq8cW33J5aLP9jbMQXeg_1H47K1nG';
  const STORAGE_KEY = 'daydreamOceanTasks';
  const MIGRATION_KEY_PREFIX = 'daydreamOceanMigrated_';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  let supabaseClient = null;
  let currentUser = null;
  let tasks = readLocalTasks();
  let activeFilter = 'all';
  let activeSort = 'default';
  let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selectedDate = dateKey(new Date());
  let authLoadToken = 0;

  const els = {
    taskList: $('#task-list'),
    addTaskBtn: $('#add-task-btn'),
    dashboardAddBtn: $('#dashboard-add-task-btn'),
    taskSection: $('#task-section'),
    completedSection: $('#completed-section'),
    completedList: $('#completed-list'),
    taskPlaceholder: $('#task-placeholder'),
    completedPlaceholder: $('#completed-placeholder'),
    dashboardView: $('#dashboard-view'),
    calendarView: $('#calendar-view'),
    plannerView: $('#planner-view'),
    pageTitle: $('#page-title'),
    pageSubtitle: $('#page-subtitle'),
    navItems: $$('.nav-item'),
    quickLinks: $$('.quick-link'),
    priorityFilter: $('#priority-filter'),
    sortSelect: $('#sort-select'),
    calendarGrid: $('#calendar-grid'),
    calendarTitle: $('#calendar-month-title'),
    calendarMonthSelect: $('#calendar-month-select'),
    calendarYearSelect: $('#calendar-year-select'),
    calendarPrev: $('#calendar-prev'),
    calendarNext: $('#calendar-next'),
    calendarToday: $('#calendar-today'),
    calendarAgenda: $('#calendar-agenda'),
    plannerDate: $('#planner-date'),
    plannerTotal: $('#planner-total'),
    plannerCompleted: $('#planner-completed'),
    plannerRemaining: $('#planner-remaining'),
    plannerProgress: $('#planner-progress'),
    plannerList: $('#planner-list'),
    plannerEmpty: $('#planner-empty')
  };

  function dateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function parseDate(value) {
    return value ? new Date(`${value}T12:00:00`) : new Date();
  }

  function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
    if (!value) return 'No due date';
    return parseDate(value).toLocaleDateString(undefined, options);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function prettyTime(value) {
    if (!value) return '';
    const [h, m] = value.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return value;
    return new Date(2000, 0, 1, h, m).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function duration(start, end) {
    if (!start || !end) return '';
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) return '';
    return mins >= 60
      ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}`
      : `${mins}m`;
  }

  function readLocalTasks() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(data)) return [];

      return data
        .filter(t => t && t.name && typeof t.completed === 'boolean')
        .map(t => ({
          id: t.id ?? Date.now() + Math.random(),
          name: String(t.name),
          dueDate: t.dueDate || dateKey(new Date()),
          priority: t.priority || 'medium',
          startTime: t.startTime || '',
          endTime: t.endTime || '',
          completed: !!t.completed,
          completedAt: t.completedAt || null,
          createdAt: t.createdAt || new Date().toISOString()
        }));
    } catch {
      return [];
    }
  }

  function saveLocalTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (error) {
      console.error('Could not save local tasks:', error);
    }
  }

  function notify(message, isError = false) {
    let box = $('#daydream-toast');

    if (!box) {
      box = document.createElement('div');
      box.id = 'daydream-toast';
      Object.assign(box.style, {
        position: 'fixed',
        right: '18px',
        bottom: '18px',
        zIndex: '99999',
        maxWidth: 'min(420px, calc(100vw - 36px))',
        padding: '12px 16px',
        borderRadius: '12px',
        background: '#27272a',
        color: '#f4b8c8',
        border: '1px solid #555',
        boxShadow: '0 8px 30px #0005',
        font: '14px/1.45 Arial,sans-serif'
      });
      document.body.appendChild(box);
    }

    box.textContent = message;
    box.style.color = isError ? '#ff9c9c' : '#f4b8c8';
    box.hidden = false;
    clearTimeout(box._timer);
    box._timer = setTimeout(() => {
      box.hidden = true;
    }, 4500);
  }

  function injectAuthPanel() {
    if ($('#daydream-auth-panel')) return;

    const style = document.createElement('style');
    style.textContent = `
      #daydream-auth-panel {
        box-sizing:border-box;margin:12px auto 20px;padding:14px 16px;
        max-width:1200px;border:1px solid #45454b;border-radius:16px;
        background:#202024;color:#ededf0;font:14px/1.4 Arial,sans-serif
      }
      #daydream-auth-panel * {box-sizing:border-box}
      #daydream-auth-panel .dd-row {
        display:flex;gap:9px;align-items:center;flex-wrap:wrap
      }
      #daydream-auth-panel .dd-status {
        font-weight:600;color:#f4b8c8;margin-right:auto
      }
      #daydream-auth-panel input {
        min-width:150px;max-width:240px;padding:10px 11px;border-radius:9px;
        border:1px solid #555;background:#171719;color:#ededf0
      }
      #daydream-auth-panel button {
        padding:10px 13px;border:0;border-radius:9px;background:#f4b8c8;
        color:#27272a;font-weight:700;cursor:pointer
      }
      #daydream-auth-panel button.dd-secondary {
        background:#37373d;color:#ededf0
      }
      #daydream-auth-panel .dd-message {
        margin-top:9px;color:#cfcfd4;min-height:1em
      }
      #daydream-auth-panel .dd-note {
        margin:8px 0 0;color:#a9a9b2;font-size:12px
      }
      #daydream-modal-backdrop {
        position:fixed;inset:0;background:#0009;z-index:9998;
        display:grid;place-items:center;padding:18px
      }
      #daydream-task-modal {
        width:min(520px,100%);max-height:90vh;overflow:auto;
        background:#202024;color:#ededf0;border:1px solid #555;
        border-radius:18px;padding:22px;box-shadow:0 20px 70px #0008;
        font:14px/1.5 Arial,sans-serif
      }
      #daydream-task-modal h2 {margin:0 0 14px;color:#f4b8c8}
      #daydream-task-modal label {display:block;margin:12px 0 5px}
      #daydream-task-modal input,#daydream-task-modal select {
        width:100%;padding:11px;border-radius:9px;border:1px solid #555;
        background:#171719;color:#ededf0
      }
      #daydream-task-modal .dd-actions {
        display:flex;justify-content:flex-end;gap:9px;margin-top:18px
      }
      #daydream-task-modal button {
        padding:10px 14px;border:0;border-radius:9px;background:#f4b8c8;
        color:#27272a;font-weight:700;cursor:pointer
      }
      #daydream-task-modal button.dd-cancel {
        background:#39393f;color:#ededf0
      }
      .dd-task-card {
        background:#27272a;color:#ededf0;border:1px solid #414147;
        border-radius:14px;padding:15px;margin:10px 0
      }
      .dd-task-card.dd-done {opacity:.78}
      .dd-task-title {font-weight:700;overflow-wrap:anywhere}
      .dd-task-meta {font-size:12px;color:#b9b9c2;margin-top:7px}
      .dd-task-actions {display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}
      .dd-task-actions button {
        font-size:12px;padding:7px 10px;border:0;border-radius:8px;
        cursor:pointer;background:#f4b8c8;color:#27272a
      }
      .dd-task-actions button.dd-muted {background:#414148;color:#ededf0}
      .dd-task-actions button.dd-danger {background:#57363d;color:#ffd7df}
      .dd-empty {color:#a9a9b2;padding:14px 0}
      .dd-priority {
        display:inline-block;padding:3px 7px;border-radius:99px;
        background:#3b3540;color:#f4b8c8;font-size:11px;
        text-transform:capitalize;margin-left:6px
      }
    `;
    
    style.textContent += `
      /* Ocean blue theme for the login panel and task UI */
      #daydream-auth-panel {
        background: linear-gradient(145deg, #eaf7ff, #d9efff) !important;
        color: #173b58 !important;
        border: 1px solid #a9d8f2 !important;
        box-shadow: 0 10px 30px rgba(53, 137, 184, 0.12);
      }

      #daydream-auth-panel .dd-status {
        color: #176b9b !important;
      }

      #daydream-auth-panel input {
        background: #ffffff !important;
        color: #173b58 !important;
        border: 1px solid #acd6ed !important;
      }

      #daydream-auth-panel input:focus {
        outline: 2px solid #77c5ed;
        border-color: #368fbd !important;
      }

      #daydream-auth-panel button,
      #daydream-task-modal button,
      .dd-task-actions button {
        background: #368fbd !important;
        color: #ffffff !important;
        border: 1px solid #368fbd !important;
      }

      #daydream-auth-panel button:hover,
      #daydream-task-modal button:hover,
      .dd-task-actions button:hover {
        background: #2478a4 !important;
      }

      #daydream-auth-panel button.dd-secondary,
      #daydream-task-modal button.dd-cancel,
      .dd-task-actions button.dd-muted {
        background: #d8edf9 !important;
        color: #205777 !important;
        border-color: #b5dced !important;
      }

      #daydream-auth-panel .dd-message {
        color: #315b76 !important;
      }

      #daydream-auth-panel .dd-note {
        color: #50758d !important;
      }

      #daydream-modal-backdrop {
        background: rgba(18, 53, 78, 0.55) !important;
        backdrop-filter: blur(5px);
      }

      #daydream-task-modal {
        background: linear-gradient(145deg, #f1faff, #dcefff) !important;
        color: #173b58 !important;
        border: 1px solid #a9d8f2 !important;
      }

      #daydream-task-modal h2 {
        color: #176b9b !important;
      }

      #daydream-task-modal input,
      #daydream-task-modal select {
        background: #ffffff !important;
        color: #173b58 !important;
        border-color: #acd6ed !important;
      }

      .dd-task-card {
        background: linear-gradient(145deg, #f1faff, #e2f3ff) !important;
        color: #173b58 !important;
        border: 1px solid #b8def1 !important;
        box-shadow: 0 5px 16px rgba(53, 137, 184, 0.08);
      }

      .dd-task-meta {
        color: #52758d !important;
      }

      .dd-priority {
        background: #d2ebfa !important;
        color: #176b9b !important;
      }

      .dd-task-actions button.dd-danger {
        background: #ffe6e9 !important;
        color: #a33d55 !important;
        border-color: #f5c2cd !important;
      }

      .dd-empty {
        color: #52758d !important;
      }
    `;

    document.head.appendChild(style);

    const panel = document.createElement('section');
    panel.id = 'daydream-auth-panel';
    panel.innerHTML = `
      <div class="dd-row">
        <span id="dd-auth-status" class="dd-status">
          ☁️ Local mode · tasks save in this browser
        </span>
        <form id="dd-auth-form" class="dd-row">
          <input id="dd-email" type="email" placeholder="Email"
            autocomplete="email" required aria-label="Email">
          <input id="dd-password" type="password"
            placeholder="Password (6+ characters)" autocomplete="current-password"
            minlength="6" required aria-label="Password">
          <button type="submit" id="dd-login">Log in</button>
          <button type="button" id="dd-signup" class="dd-secondary">
            Create account
          </button>
        </form>
        <button type="button" id="dd-logout" class="dd-secondary" hidden>
          Log out
        </button>
      </div>
      <div id="dd-auth-message" class="dd-message" role="status"
        aria-live="polite"></div>
      <p class="dd-note">
        Sign in to sync tasks across devices. Your local tasks stay in this
        browser unless you choose to migrate them.
      </p>
    `;

    const anchor = $('main') || $('#app') || document.body;
    anchor.insertBefore(panel, anchor.firstChild);

    $('#dd-auth-form').addEventListener('submit', async event => {
      event.preventDefault();

      if (!supabaseClient) {
        return setAuthMessage('Cloud connection unavailable. Local mode still works.', true);
      }

      const email = $('#dd-email').value.trim();
      const password = $('#dd-password').value;
      setAuthMessage('Logging in…');

      const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) setAuthMessage(error.message, true);
      else setAuthMessage('Signed in. Loading your cloud tasks…');
    });

    $('#dd-signup').addEventListener('click', async () => {
      if (!supabaseClient) {
        return setAuthMessage('Cloud connection unavailable. Local mode still works.', true);
      }

      const email = $('#dd-email').value.trim();
      const password = $('#dd-password').value;

      if (!email || password.length < 6) {
        return setAuthMessage(
          'Enter a valid email and a password with at least 6 characters.',
          true
        );
      }

      setAuthMessage('Creating your account…');

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password
      });

      if (error) {
        setAuthMessage(error.message, true);
      } else if (data.session) {
        setAuthMessage('Account created. You are signed in.');
      } else {
        setAuthMessage(
          'Account created! Check your email for a confirmation link, then log in.'
        );
      }
    });

    $('#dd-logout').addEventListener('click', async () => {
      if (!supabaseClient) return;

      const { error } = await supabaseClient.auth.signOut();

      if (error) setAuthMessage(error.message, true);
      else setAuthMessage('Logged out. Showing this browser’s local tasks.');
    });
  }

  function setAuthMessage(message, error = false) {
    const node = $('#dd-auth-message');
    if (node) {
      node.textContent = message;
      node.style.color = error ? '#ff9c9c' : '#cfcfd4';
    }
  }

  function updateAuthUI() {
    const status = $('#dd-auth-status');
    const logout = $('#dd-logout');
    const form = $('#dd-auth-form');
    const signup = $('#dd-signup');

    if (!status) return;

    if (currentUser) {
      status.textContent = `☁️ Synced as ${currentUser.email || 'signed-in user'}`;
      if (logout) logout.hidden = false;
      if (form) form.hidden = true;
      if (signup) signup.hidden = true;
    } else {
      status.textContent = '☁️ Local mode · tasks save in this browser';
      if (logout) logout.hidden = true;
      if (form) form.hidden = false;
      if (signup) signup.hidden = false;
    }
  }

  function toDb(task) {
    return {
      user_id: currentUser.id,
      name: task.name,
      due_date: task.dueDate || null,
      priority: task.priority || 'medium',
      start_time: task.startTime || null,
      end_time: task.endTime || null,
      completed: !!task.completed,
      completed_at: task.completedAt || null
    };
  }

  function fromDb(row) {
    return {
      id: row.id,
      name: row.name || '',
      dueDate: row.due_date || todayKey(),
      priority: row.priority || 'medium',
      startTime: row.start_time || '',
      endTime: row.end_time || '',
      completed: !!row.completed,
      completedAt: row.completed_at || null,
      createdAt: row.created_at || new Date().toISOString()
    };
  }

  async function cloudInsert(task) {
    if (!currentUser) return task;

    const { data, error } = await supabaseClient
      .from('tasks')
      .insert(toDb(task))
      .select()
      .single();

    if (error) throw error;
    return fromDb(data);
  }

  async function cloudUpdate(task) {
    if (!currentUser) return;

    const { error } = await supabaseClient
      .from('tasks')
      .update(toDb(task))
      .eq('id', task.id)
      .eq('user_id', currentUser.id);

    if (error) throw error;
  }

  async function cloudDelete(id) {
    if (!currentUser) return;

    const { error } = await supabaseClient
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', currentUser.id);

    if (error) throw error;
  }

  async function loadCloudTasks(user) {
    const token = ++authLoadToken;
    currentUser = user;
    updateAuthUI();

    const { data, error } = await supabaseClient
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (token !== authLoadToken || !currentUser || currentUser.id !== user.id) return;

    if (error) {
      setAuthMessage(`Could not load cloud tasks: ${error.message}`, true);
      return;
    }

    const cloudTasks = (data || []).map(fromDb);
    const migrationKey = MIGRATION_KEY_PREFIX + user.id;
    let migrated = {};

    try {
      migrated = JSON.parse(localStorage.getItem(migrationKey) || '{}');
    } catch {
      migrated = {};
    }

    
    const localTasks = readLocalTasks().filter(t => !migrated[String(t.id)]);

    // Only offer migration when the cloud account has no tasks.
    // Once cloud tasks exist, don't re-upload the browser copy.
    if (localTasks.length && cloudTasks.length === 0) {
      const shouldMigrate = window.confirm(
        `You have ${localTasks.length} task(s) saved in this browser. ` +
        'Add them to your cloud account?'
      );

      if (shouldMigrate) {
        setAuthMessage('Syncing your saved browser tasks…');
        let failed = false;

        for (const localTask of localTasks) {
          if (migrated[String(localTask.id)]) continue;

          try {
            const inserted = await cloudInsert(localTask);
            migrated[String(localTask.id)] = inserted.id;
            localStorage.setItem(migrationKey, JSON.stringify(migrated));
            cloudTasks.push(inserted);
          } catch (error) {
            failed = true;
            console.error(error);
            break;
          }
        }

        setAuthMessage(
          failed
            ? 'Some local tasks could not be synced. Your browser backup is intact.'
            : 'Your browser tasks have been added to your cloud account.'
        );
      } else {
        setAuthMessage('Cloud tasks loaded. Browser-only tasks remain on this device.');
      }
    } else {
      setAuthMessage('Cloud tasks loaded.');
    }

    if (token !== authLoadToken) return;

    tasks = cloudTasks;
    saveLocalTasks();
    renderAll();
  }

  function showView(view) {
    const views = {
      dashboard: els.dashboardView,
      tasks: els.taskSection,
      calendar: els.calendarView,
      planner: els.plannerView
    };

    Object.entries(views).forEach(([key, node]) => {
      if (node) node.hidden = key !== view;
    });

    if (view === 'tasks' && els.completedSection) {
      els.completedSection.hidden = false;
    }

    const labels = {
      dashboard: ['Dashboard', 'Your life, slightly less chaotic.'],
      tasks: ['My Tasks', 'One thing at a time, bro.'],
      calendar: ['Calendar', 'Your plans, laid out.'],
      planner: ['Daily Planner', 'A little structure never hurt anyone.']
    };

    if (els.pageTitle && labels[view]) {
      els.pageTitle.textContent = labels[view][0];
    }

    if (els.pageSubtitle && labels[view]) {
      els.pageSubtitle.textContent = labels[view][1];
    }

    els.navItems.forEach(item => {
      item.classList.toggle(
        'active',
        (item.dataset.view || item.getAttribute('data-target')) === view
      );
    });

    if (view === 'calendar') renderCalendar();
    if (view === 'planner') renderPlanner();
  }

  function bindNavigation() {
    els.navItems.forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view ||
          item.getAttribute('data-target') ||
          (item.textContent.toLowerCase().includes('calendar') ? 'calendar' :
            item.textContent.toLowerCase().includes('planner') ? 'planner' :
              item.textContent.toLowerCase().includes('task') ? 'tasks' : 'dashboard');

        showView(view);
      });
    });

    els.quickLinks.forEach(item => {
      item.addEventListener('click', () => {
        showView(item.dataset.view || item.getAttribute('data-target') || 'tasks');
      });
    });
  }

  function modalForm(task = null) {
    if ($('#daydream-modal-backdrop')) {
      $('#daydream-modal-backdrop').remove();
    }

    const editing = !!task;
    const backdrop = document.createElement('div');
    backdrop.id = 'daydream-modal-backdrop';

    backdrop.innerHTML = `
      <form id="daydream-task-modal">
        <h2>${editing ? 'Edit task ✨' : 'Add a task ✨'}</h2>

        <label for="dd-task-name">Task name</label>
        <input id="dd-task-name" maxlength="180" required
          placeholder="What needs doing?"
          value="${escapeHtml(task?.name || '')}">

        <label for="dd-task-date">Due date</label>
        <input id="dd-task-date" type="date" required
          value="${escapeHtml(task?.dueDate || todayKey())}">

        <label for="dd-task-priority">Priority</label>
        <select id="dd-task-priority">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        <label for="dd-task-start">Start time (optional)</label>
        <input id="dd-task-start" type="time"
          value="${escapeHtml(task?.startTime || '')}">

        <label for="dd-task-end">End time (optional)</label>
        <input id="dd-task-end" type="time"
          value="${escapeHtml(task?.endTime || '')}">

        <div class="dd-actions">
          <button type="button" class="dd-cancel" id="dd-task-cancel">Cancel</button>
          <button type="submit">${editing ? 'Save changes' : 'Add task'}</button>
        </div>
      </form>
    `;

    document.body.appendChild(backdrop);
    $('#dd-task-priority').value = task?.priority || 'medium';

    $('#dd-task-cancel').addEventListener('click', () => backdrop.remove());

    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) backdrop.remove();
    });

    $('#daydream-task-modal').addEventListener('submit', async event => {
      event.preventDefault();

      const name = $('#dd-task-name').value.trim();
      const dueDate = $('#dd-task-date').value;
      const startTime = $('#dd-task-start').value;
      const endTime = $('#dd-task-end').value;

      if (!name || !dueDate) return;

      if ((startTime && !endTime) || (!startTime && endTime)) {
        return notify('Enter both start and end times, or leave both blank.', true);
      }

      if (startTime && endTime && endTime <= startTime) {
        return notify('End time must be later than start time.', true);
      }

      const button = $('button[type="submit"]', $('#daydream-task-modal'));
      button.disabled = true;
      button.textContent = 'Saving…';

      try {
        if (editing) {
          const updated = {
            ...task,
            name,
            dueDate,
            priority: $('#dd-task-priority').value,
            startTime,
            endTime
          };

          await cloudUpdate(updated);
          tasks = tasks.map(t =>
            String(t.id) === String(task.id) ? updated : t
          );
        } else {
          const draft = {
            id: Date.now(),
            name,
            dueDate,
            priority: $('#dd-task-priority').value,
            startTime,
            endTime,
            completed: false,
            completedAt: null,
            createdAt: new Date().toISOString()
          };

          const created = currentUser ? await cloudInsert(draft) : draft;
          tasks.push(created);
        }

        saveLocalTasks();
        backdrop.remove();
        renderAll();
        notify(editing ? 'Task updated. ✨' : 'Task added. ✨');
      } catch (error) {
        button.disabled = false;
        button.textContent = editing ? 'Save changes' : 'Add task';
        notify(`Could not save task: ${error.message}`, true);
      }
    });
  }

  function createTaskCard(task) {
    const card = document.createElement('article');
    card.className = `dd-task-card${task.completed ? ' dd-done' : ''}`;

    const taskDuration = duration(task.startTime, task.endTime);
    const timeText = task.startTime && task.endTime
      ? `${prettyTime(task.startTime)}–${prettyTime(task.endTime)}${taskDuration ? ` · ${taskDuration}` : ''}`
      : '';

    const completedText = task.completed && task.completedAt
      ? ` · Completed ${new Date(task.completedAt).toLocaleString()}`
      : '';

    card.innerHTML = `
      <div class="dd-task-title">
        ${task.completed ? '✓ ' : ''}${escapeHtml(task.name)}
        <span class="dd-priority">${escapeHtml(task.priority || 'medium')}</span>
      </div>
      <div class="dd-task-meta">
        📅 ${escapeHtml(formatDate(task.dueDate))}
        ${timeText ? ` · ⏰ ${escapeHtml(timeText)}` : ''}
        ${completedText ? escapeHtml(completedText) : ''}
      </div>
      <div class="dd-task-actions">
        <button data-action="toggle">${task.completed ? 'Undo' : 'Complete'}</button>
        <button data-action="edit" class="dd-muted">Edit</button>
        <button data-action="delete" class="dd-danger">Delete</button>
      </div>
    `;

    card.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', async () => {
        const action = button.dataset.action;

        try {
          if (action === 'toggle') {
            const updated = {
              ...task,
              completed: !task.completed,
              completedAt: !task.completed ? new Date().toISOString() : null
            };

            await cloudUpdate(updated);
            tasks = tasks.map(t =>
              String(t.id) === String(task.id) ? updated : t
            );
            saveLocalTasks();
            renderAll();
          } else if (action === 'edit') {
            modalForm(task);
          } else if (action === 'delete' && window.confirm(`Delete “${task.name}”?`)) {
            await cloudDelete(task.id);
            tasks = tasks.filter(t => String(t.id) !== String(task.id));
            saveLocalTasks();
            renderAll();
            notify('Task deleted.');
          }
        } catch (error) {
          notify(`Could not ${action} task: ${error.message}`, true);
        }
      });
    });

    return card;
  }

  function filteredTasks(list) {
    let result = [...list];

    if (activeFilter !== 'all') {
      result = result.filter(t => (t.priority || 'medium') === activeFilter);
    }

    if (activeSort === 'priority') {
      const rank = { high: 0, medium: 1, low: 2 };
      result.sort((a, b) => (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1));
    } else if (activeSort === 'due-date') {
      result.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    } else if (activeSort === 'start-time') {
      result.sort((a, b) =>
        (a.startTime || '99:99').localeCompare(b.startTime || '99:99')
      );
    } else if (activeSort === 'newest') {
      result.sort((a, b) =>
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );
    } else {
      result.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    }

    return result;
  }

  function renderTasks() {
    const active = tasks.filter(t => !t.completed);
    const completed = tasks
      .filter(t => t.completed)
      .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

    const list = els.taskList || $('#task-list');

    if (list) {
      list.innerHTML = '';
      const shown = filteredTasks(active);
      shown.forEach(task => list.appendChild(createTaskCard(task)));

      if (!shown.length) {
        list.innerHTML = `
          <div class="dd-empty">
            ${active.length
              ? 'No tasks match this filter.'
              : 'No active tasks yet. Add one and make future-you slightly less stressed.'}
          </div>
        `;
      }
    }

    if (els.completedList) {
      els.completedList.innerHTML = '';
      completed.forEach(task => els.completedList.appendChild(createTaskCard(task)));

      if (!completed.length) {
        els.completedList.innerHTML =
          '<div class="dd-empty">Completed tasks will live here.</div>';
      }
    }

    if (els.taskPlaceholder) els.taskPlaceholder.hidden = active.length > 0;
    if (els.completedPlaceholder) els.completedPlaceholder.hidden = completed.length > 0;

    setTextIfExists('#active-task-count', active.length);
    setTextIfExists('#completed-task-count', completed.length);
    setTextIfExists('#total-task-count', tasks.length);
  }

  function setTextIfExists(selector, value) {
    const node = $(selector);
    if (node) node.textContent = value;
  }

  function renderPlanner() {
    const date = els.plannerDate?.value || selectedDate || todayKey();

    const dayTasks = tasks
      .filter(task => task.dueDate === date)
      .sort((a, b) =>
        (a.startTime || '99:99').localeCompare(b.startTime || '99:99')
      );

    const done = dayTasks.filter(task => task.completed).length;
    const remaining = dayTasks.length - done;
    const percent = dayTasks.length ? Math.round(done / dayTasks.length * 100) : 0;

    if (els.plannerTotal) els.plannerTotal.textContent = dayTasks.length;
    if (els.plannerCompleted) els.plannerCompleted.textContent = done;
    if (els.plannerRemaining) els.plannerRemaining.textContent = remaining;

    if (els.plannerProgress) {
      els.plannerProgress.style.width = `${percent}%`;
      els.plannerProgress.setAttribute('aria-valuenow', String(percent));
    }

    if (els.plannerList) {
      els.plannerList.innerHTML = '';
      dayTasks.forEach(task => els.plannerList.appendChild(createTaskCard(task)));
    }

    if (els.plannerEmpty) els.plannerEmpty.hidden = dayTasks.length > 0;
  }

  function renderCalendar() {
    if (!els.calendarGrid) return;

    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();

    if (els.calendarTitle) {
      els.calendarTitle.textContent = calendarMonth.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric'
      });
    }

    if (els.calendarMonthSelect) {
      els.calendarMonthSelect.value = String(month);
    }

    if (els.calendarYearSelect) {
      els.calendarYearSelect.value = String(year);
    }

    els.calendarGrid.innerHTML = '';

    const firstDay = new Date(year, month, 1);
    const start = new Date(year, month, 1 - firstDay.getDay());

    for (let i = 0; i < 42; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = dateKey(day);

      const dayTasks = tasks.filter(task =>
        task.dueDate === key && !task.completed
      );

      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'dd-calendar-day';
      cell.style.cssText = `
        min-height:66px;border:1px solid #414147;border-radius:9px;
        background:${key === selectedDate ? '#493843' : day.getMonth() === month ? '#27272a' : '#1d1d20'};
        color:${day.getMonth() === month ? '#ededf0' : '#777'};
        padding:7px;text-align:left;cursor:pointer;
      `;

      cell.innerHTML = `
        <strong>${day.getDate()}</strong>
        ${key === todayKey()
          ? '<small style="display:block;color:#f4b8c8">Today</small>'
          : ''}
        ${dayTasks.length
          ? `<small style="display:block;margin-top:4px;color:#f4b8c8">${dayTasks.length} task${dayTasks.length === 1 ? '' : 's'}</small>`
          : ''}
      `;

      cell.addEventListener('click', () => {
        selectedDate = key;
        renderCalendar();
      });

      els.calendarGrid.appendChild(cell);
    }

    if (els.calendarAgenda) {
      const agenda = tasks
        .filter(task => task.dueDate === selectedDate)
        .sort((a, b) =>
          (a.startTime || '99:99').localeCompare(b.startTime || '99:99')
        );

      els.calendarAgenda.innerHTML = `<h3>${escapeHtml(formatDate(selectedDate))}</h3>`;

      if (!agenda.length) {
        els.calendarAgenda.innerHTML +=
          '<div class="dd-empty">Nothing scheduled for this day.</div>';
      }

      agenda.forEach(task => {
        els.calendarAgenda.appendChild(createTaskCard(task));
      });
    }
  }

  function renderAll() {
    renderTasks();
    renderCalendar();
    renderPlanner();
  }

  function bindCalendar() {
    if (els.calendarPrev) {
      els.calendarPrev.addEventListener('click', () => {
        calendarMonth = new Date(
          calendarMonth.getFullYear(),
          calendarMonth.getMonth() - 1,
          1
        );
        renderCalendar();
      });
    }

    if (els.calendarNext) {
      els.calendarNext.addEventListener('click', () => {
        calendarMonth = new Date(
          calendarMonth.getFullYear(),
          calendarMonth.getMonth() + 1,
          1
        );
        renderCalendar();
      });
    }

    if (els.calendarToday) {
      els.calendarToday.addEventListener('click', () => {
        calendarMonth = new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1
        );
        selectedDate = todayKey();
        renderCalendar();
      });
    }

    if (els.calendarMonthSelect) {
      els.calendarMonthSelect.addEventListener('change', () => {
        calendarMonth = new Date(
          calendarMonth.getFullYear(),
          Number(els.calendarMonthSelect.value),
          1
        );
        renderCalendar();
      });
    }

    if (els.calendarYearSelect) {
      els.calendarYearSelect.addEventListener('change', () => {
        calendarMonth = new Date(
          Number(els.calendarYearSelect.value),
          calendarMonth.getMonth(),
          1
        );
        renderCalendar();
      });
    }

    if (els.plannerDate) {
      els.plannerDate.value = todayKey();
      els.plannerDate.addEventListener('change', renderPlanner);
    }
  }

  function bindFilters() {
    if (els.priorityFilter) {
      els.priorityFilter.addEventListener('change', () => {
        activeFilter = els.priorityFilter.value || 'all';
        renderTasks();
      });
    }

    if (els.sortSelect) {
      els.sortSelect.addEventListener('change', () => {
        activeSort = els.sortSelect.value || 'default';
        renderTasks();
      });
    }
  }

  function bindAddButtons() {
    const buttons = [
      els.addTaskBtn,
      els.dashboardAddBtn,
      $('#add-task'),
      $('#add-task-button')
    ].filter(Boolean);

    buttons.forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        modalForm();
      });
    });

    if (!buttons.length) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '+ Add task';
      button.style.cssText = `
        position:fixed;right:22px;bottom:22px;z-index:1000;
        padding:13px 17px;border:0;border-radius:99px;
        background:#f4b8c8;color:#27272a;font-weight:700;
        box-shadow:0 8px 25px #0005;cursor:pointer
      `;
      button.addEventListener('click', () => modalForm());
      document.body.appendChild(button);
    }
  }

  async function initSupabase() {
    if (!window.supabase ||
        typeof window.supabase.createClient !== 'function') {
      setAuthMessage('Supabase library did not load. Local tasks still work.', true);
      return;
    }

    try {
      supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
      );

      supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session?.user) {
          authLoadToken++;
          currentUser = null;
          tasks = readLocalTasks();
          updateAuthUI();
          renderAll();

          if (event === 'SIGNED_OUT') {
            setAuthMessage('Logged out. Showing this browser’s local tasks.');
          }
        } else if (
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED'
        ) {
          // Defer the query so it doesn't run inside the auth callback.
          setTimeout(() => loadCloudTasks(session.user), 0);
        }
      });

      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;

      if (data.session?.user) {
        await loadCloudTasks(data.session.user);
      } else {
        currentUser = null;
        updateAuthUI();
        renderAll();
      }
    } catch (error) {
      setAuthMessage(`Supabase setup error: ${error.message}`, true);
      console.error(error);
    }
  }

  function init() {
    injectAuthPanel();
    bindNavigation();
    bindAddButtons();
    bindFilters();
    bindCalendar();
    renderAll();
    showView('dashboard');
    initSupabase();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
