// Victoria TL3 Agentic Monitoring Dashboard
// Connects to n8n REST API + local checks. API keys entered in UI, stored in localStorage.

const state = {
    config: {
        n8nUrl: localStorage.getItem('n8nUrl') || 'http://localhost:5678',
        n8nApiKey: localStorage.getItem('n8nApiKey') || '',
    },
    workflows: [],
    executions: [],
    features: JSON.parse(localStorage.getItem('features') || '[]'),
    logs: JSON.parse(localStorage.getItem('healthLogs') || '[]'),
};

// ---------- Config ----------
document.getElementById('n8n-url').value = state.config.n8nUrl;
document.getElementById('n8n-api-key').value = state.config.n8nApiKey;

document.getElementById('save-config').addEventListener('click', () => {
    state.config.n8nUrl = document.getElementById('n8n-url').value.trim().replace(/\/$/, '');
    state.config.n8nApiKey = document.getElementById('n8n-api-key').value.trim();
    localStorage.setItem('n8nUrl', state.config.n8nUrl);
    localStorage.setItem('n8nApiKey', state.config.n8nApiKey);
    refreshAll();
});

// ---------- API helpers ----------
async function n8nFetch(path) {
    const res = await fetch(`${state.config.n8nUrl}/api/v1${path}`, {
        headers: { 'X-N8N-API-KEY': state.config.n8nApiKey },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function setIndicator(cardId, color, text) {
    const card = document.getElementById(cardId);
    const ind = card.querySelector('.health-indicator');
    ind.className = `health-indicator ${color}`;
    card.querySelector('.status-text').textContent = text;
}

// ---------- Health checks ----------
async function checkHealth() {
    // n8n
    try {
        const res = await fetch(`${state.config.n8nUrl}/healthz`);
        setIndicator('card-n8n', res.ok ? 'green' : 'red', res.ok ? 'Operating normally' : `HTTP error ${res.status}`);
    } catch {
        setIndicator('card-n8n', 'red', 'Cannot connect');
    }

    // Ollama
    try {
        const res = await fetch('http://localhost:11434/api/tags');
        if (res.ok) {
            const data = await res.json();
            const models = (data.models || []).map(m => m.name).join(', ') || 'no model pulled';
            setIndicator('card-ollama', 'green', `Running — ${models}`);
        } else {
            setIndicator('card-ollama', 'red', `HTTP error ${res.status}`);
        }
    } catch {
        setIndicator('card-ollama', 'red', 'Cannot connect (check Docker)');
    }

    // Google Sheets + WordPress: proxied through n8n workflow health, no direct browser access
    if (state.config.n8nApiKey) {
        try {
            const data = await n8nFetch('/workflows?active=true');
            const active = data.data || [];
            const sheetsWf = active.filter(w => /drafting|publish|reminder/i.test(w.name));
            setIndicator('card-sheets', sheetsWf.length ? 'green' : 'yellow',
                sheetsWf.length ? `${sheetsWf.length} workflows using Sheets are active` : 'No Sheets workflow is active');
            const wpWf = active.filter(w => /publish/i.test(w.name));
            setIndicator('card-wordpress', wpWf.length ? 'green' : 'yellow',
                wpWf.length ? 'Publish workflow is active' : 'Publish workflow is not active');
        } catch {
            setIndicator('card-sheets', 'gray', 'Valid API key required');
            setIndicator('card-wordpress', 'gray', 'Valid API key required');
        }
    } else {
        setIndicator('card-sheets', 'gray', 'Enter an API key to check');
        setIndicator('card-wordpress', 'gray', 'Enter an API key to check');
    }
}

// ---------- Workflows ----------
async function loadWorkflows() {
    const tbody = document.getElementById('workflows-tbody');
    if (!state.config.n8nApiKey) {
        tbody.innerHTML = '<tr><td colspan="5">Enter your n8n API key in settings to view workflows</td></tr>';
        return;
    }
    try {
        const data = await n8nFetch('/workflows');
        state.workflows = data.data || [];
        const filterSel = document.getElementById('filter-workflow');
        filterSel.innerHTML = '<option value="">All workflows</option>' +
            state.workflows.map(w => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');

        tbody.innerHTML = state.workflows.map(w => `
            <tr>
                <td>${escapeHtml(w.name)}</td>
                <td><span class="badge ${w.active ? 'badge-success' : 'badge-waiting'}">${w.active ? 'Active' : 'Inactive'}</span></td>
                <td>${w.updatedAt ? new Date(w.updatedAt).toLocaleString('en-GB') : '--'}</td>
                <td id="wf-errors-${w.id}">--</td>
                <td><a href="${state.config.n8nUrl}/workflow/${w.id}" target="_blank" class="btn btn-secondary btn-sm">Open in n8n</a></td>
            </tr>
        `).join('') || '<tr><td colspan="5">No workflows</td></tr>';
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5">Error: ${escapeHtml(e.message)} — check the URL and API key</td></tr>`;
    }
}

// ---------- Executions ----------
async function loadExecutions() {
    const tbody = document.getElementById('executions-tbody');
    if (!state.config.n8nApiKey) {
        tbody.innerHTML = '<tr><td colspan="7">Enter your n8n API key to view executions</td></tr>';
        return;
    }
    const status = document.getElementById('filter-status').value;
    const workflowId = document.getElementById('filter-workflow').value;
    const limit = document.getElementById('filter-limit').value || 20;

    let qs = `?limit=${limit}`;
    if (status) qs += `&status=${status}`;
    if (workflowId) qs += `&workflowId=${workflowId}`;

    try {
        const data = await n8nFetch(`/executions${qs}`);
        state.executions = data.data || [];

        // Count errors per workflow for the workflows table
        const errCounts = {};
        state.executions.filter(e => e.status === 'error').forEach(e => {
            errCounts[e.workflowId] = (errCounts[e.workflowId] || 0) + 1;
        });
        Object.entries(errCounts).forEach(([wfId, count]) => {
            const cell = document.getElementById(`wf-errors-${wfId}`);
            if (cell) cell.innerHTML = `<span class="badge badge-error">${count} recent errors</span>`;
        });

        tbody.innerHTML = state.executions.map(e => {
            const wf = state.workflows.find(w => w.id === e.workflowId);
            const started = e.startedAt ? new Date(e.startedAt) : null;
            const stopped = e.stoppedAt ? new Date(e.stoppedAt) : null;
            const duration = started && stopped ? `${((stopped - started) / 1000).toFixed(1)}s` : '--';
            const badgeClass = e.status === 'success' ? 'badge-success' : e.status === 'error' ? 'badge-error' : 'badge-running';
            return `
                <tr>
                    <td>${e.id}</td>
                    <td>${escapeHtml(wf ? wf.name : e.workflowId)}</td>
                    <td><span class="badge ${badgeClass}">${e.status}</span></td>
                    <td>${started ? started.toLocaleString('en-GB') : '--'}</td>
                    <td>${stopped ? stopped.toLocaleString('en-GB') : '--'}</td>
                    <td>${duration}</td>
                    <td><a href="${state.config.n8nUrl}/workflow/${e.workflowId}/executions/${e.id}" target="_blank" class="btn btn-secondary btn-sm">Xem</a></td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="7">No records</td></tr>';
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7">Error: ${escapeHtml(e.message)}</td></tr>`;
    }
}

document.getElementById('filter-apply').addEventListener('click', loadExecutions);

// ---------- Features ----------
function renderFeatures() {
    const tbody = document.getElementById('features-tbody');
    tbody.innerHTML = state.features.map((f, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(f.title)}</td>
            <td>${escapeHtml(f.desc)}</td>
            <td><span class="badge badge-${f.priority}">${f.priority === 'high' ? 'High' : f.priority === 'medium' ? 'Medium' : 'Low'}</span></td>
            <td>
                <select onchange="updateFeatureStatus(${i}, this.value)">
                    <option value="pending" ${f.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="in_progress" ${f.status === 'in_progress' ? 'selected' : ''}>In progress</option>
                    <option value="done" ${f.status === 'done' ? 'selected' : ''}>Done</option>
                </select>
            </td>
            <td>${new Date(f.created).toLocaleDateString('en-GB')}</td>
            <td><button class="btn btn-secondary btn-sm" onclick="deleteFeature(${i})">🗑️</button></td>
        </tr>
    `).join('') || '<tr><td colspan="7">No requests yet</td></tr>';
}

window.updateFeatureStatus = (i, status) => {
    state.features[i].status = status;
    localStorage.setItem('features', JSON.stringify(state.features));
    renderFeatures();
};

window.deleteFeature = (i) => {
    state.features.splice(i, 1);
    localStorage.setItem('features', JSON.stringify(state.features));
    renderFeatures();
};

document.getElementById('add-feature').addEventListener('click', () => {
    const title = document.getElementById('feature-title').value.trim();
    const desc = document.getElementById('feature-desc').value.trim();
    const priority = document.getElementById('feature-priority').value;
    if (!title) return alert('Enter a feature name');
    state.features.push({ title, desc, priority, status: 'pending', created: Date.now() });
    localStorage.setItem('features', JSON.stringify(state.features));
    document.getElementById('feature-title').value = '';
    document.getElementById('feature-desc').value = '';
    renderFeatures();
});

// ---------- Health log upload ----------
const uploadArea = document.getElementById('upload-area');
const logFileInput = document.getElementById('log-file');

document.getElementById('upload-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    logFileInput.click();
});
uploadArea.addEventListener('click', () => logFileInput.click());
uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});
logFileInput.addEventListener('change', () => handleFiles(logFileInput.files));

function handleFiles(files) {
    const status = document.getElementById('upload-status');
    [...files].forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
            state.logs.unshift({
                name: file.name,
                size: file.size,
                date: Date.now(),
                content: reader.result.slice(0, 50000),
            });
            state.logs = state.logs.slice(0, 20);
            localStorage.setItem('healthLogs', JSON.stringify(state.logs));
            renderLogs();
            status.textContent = `✓ Uploaded ${file.name}`;
        };
        reader.readAsText(file);
    });
}

function renderLogs() {
    const tbody = document.getElementById('logs-tbody');
    tbody.innerHTML = state.logs.map((l, i) => `
        <tr>
            <td>${escapeHtml(l.name)}</td>
            <td>${(l.size / 1024).toFixed(1)} KB</td>
            <td>${new Date(l.date).toLocaleString('en-GB')}</td>
            <td><button class="btn btn-secondary btn-sm" onclick="toggleLog(${i})">Xem</button></td>
        </tr>
        <tr id="log-row-${i}" style="display:none"><td colspan="4"><pre class="log-content">${escapeHtml(l.content)}</pre></td></tr>
    `).join('') || '<tr><td colspan="4">No logs yet</td></tr>';
}

window.toggleLog = (i) => {
    const row = document.getElementById(`log-row-${i}`);
    row.style.display = row.style.display === 'none' ? '' : 'none';
};

// ---------- Compliance (reads from n8n workflow or manual placeholder) ----------
function renderCompliance() {
    // Placeholder values — will be populated by compliance workflow via Google Sheets
    // When workflow-g runs, it writes compliance status; the dashboard reads via n8n executions
    const total = parseInt(localStorage.getItem('complianceTotal') || '43');
    const done = parseInt(localStorage.getItem('complianceDone') || '0');
    const pending = parseInt(localStorage.getItem('compliancePending') || '0');
    const missing = total - done - pending;

    document.getElementById('total-items').textContent = total;
    document.getElementById('done-items').textContent = done;
    document.getElementById('pending-items').textContent = pending;
    document.getElementById('missing-items').textContent = missing;

    const pct = total ? Math.round((done / total) * 100) : 0;
    const bar = document.getElementById('compliance-progress');
    bar.style.width = `${pct}%`;
    bar.textContent = `${pct}%`;
}

// ---------- Utils ----------
function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

// ---------- Refresh ----------
async function refreshAll() {
    document.getElementById('last-updated').textContent =
        `Updated: ${new Date().toLocaleTimeString('en-GB')}`;
    await checkHealth();
    await loadWorkflows();
    await loadExecutions();
    renderFeatures();
    renderLogs();
    renderCompliance();
}

document.getElementById('refresh-btn').addEventListener('click', refreshAll);

// Auto-refresh every 60s
setInterval(refreshAll, 60000);
refreshAll();
