/**
 * IPO Profit Splitter - Dynamic Name Mapping, Multi-IPO Master Sheet, Loss Sharing & Formatted Excel Table Engine
 * Formula:
 *  - Profit: Sell > Apply (e.g. 18,000 - 14,000 = 4,000)
 *      - Holder gets: 10% of Total Profit = 400
 *      - Middleman gets: 10% of Holder's cut = 40
 *      - Partner gets: 15% of (Profit - Holder - Middleman) = 534
 *      - You get: Rest Amount = 3,026
 *  - Loss: Sell < Apply (e.g. 14,000 - 10,000 = 4,000 Loss)
 *      - Holder gets: 0 (No cut on loss)
 *      - Middleman gets: 0
 *      - Partner pays You: 15% of Total Loss = 600 (Partner Contribution)
 *      - You absorb: Rest of Loss = -3,400 (Net Loss)
 */

const STORAGE_KEY = 'ipo_simple_splitter_v2';

const App = {
  cloud: {
    connected: false,
    db: null,
    room: 'main_workspace',
    deviceId: 'dev_' + Math.random().toString(36).substring(2, 9),
    isRemoteUpdating: false
  },

  state: {
    ipos: [],
    fixedPans: [], // Saved PAN Card Holders
    activeIpoId: null,
    currentView: 'ipos', // 'ipos' | 'master' | 'fixed-pans'
    masterFilter: 'pending', // 'pending' | 'all' | 'settled'
    editingEntryId: null,
    editingFixedPanId: null,
    settlingPersonName: null,
    editingDateEntryId: null,
    quickPanActiveIndex: -1,
  },

  // Date Helpers
  getTodayDateStr() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    try {
      const parts = String(dateStr).split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        }
      }
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    } catch (e) {}
    return String(dateStr);
  },

  init() {
    this.loadState();

    if (!this.state.activeIpoId && this.state.ipos.length > 0) {
      this.state.activeIpoId = this.state.ipos[0].id;
    }

    this.renderAll();
    this.initCloudSync();
  },

  loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.state.ipos = parsed.ipos || [];
        this.state.fixedPans = parsed.fixedPans || [];
        this.state.activeIpoId = parsed.activeIpoId || (this.state.ipos[0]?.id || null);

        // Auto-clean remnant dummy "Tata Technologies Ltd" if it has 0 entries so user has clean slate
        if (this.state.ipos.length === 1 && this.state.ipos[0].name === 'Tata Technologies Ltd' && (!this.state.ipos[0].entries || this.state.ipos[0].entries.length === 0)) {
          this.state.ipos = [];
          this.state.activeIpoId = null;
          this.saveState();
        }
      }
    } catch (e) {
      console.error('Error loading state:', e);
    }
  },

  saveState(skipCloud = false) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ipos: this.state.ipos,
        fixedPans: this.state.fixedPans,
        activeIpoId: this.state.activeIpoId
      }));

      if (!skipCloud && this.cloud && this.cloud.connected && !this.cloud.isRemoteUpdating) {
        this.pushStateToCloud();
      }
    } catch (e) {
      console.error('Error saving state:', e);
    }
  },

  clearAllData() {
    if (!confirm('Are you sure you want to delete ALL data (all IPOs, allotment splits, and saved PAN card holders)?\n\nThis will give you a completely blank slate to start your real work.')) {
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    this.state.ipos = [];
    this.state.fixedPans = [];
    this.state.activeIpoId = null;
    this.saveState();
    this.renderAll();
    this.showToast('All dummy and test data deleted! You now have a fresh clean slate.', 'success');
  },

  getActiveIpo() {
    if (!this.state.ipos || this.state.ipos.length === 0) return null;
    return this.state.ipos.find(i => i.id === this.state.activeIpoId) || this.state.ipos[0] || null;
  },

  getIpoFixedCost(ipo) {
    if (!ipo) return 14000;
    if (ipo.fixedCost !== undefined && ipo.fixedCost !== null && !isNaN(ipo.fixedCost)) {
      return Number(ipo.fixedCost);
    }
    if (ipo.entries && ipo.entries.length > 0) {
      const fixedEntry = ipo.entries.find(e => e.costType === 'fixed' || !e.costType);
      if (fixedEntry && fixedEntry.cost) return Number(fixedEntry.cost);
      return Number(ipo.entries[0].cost || 14000);
    }
    return 14000;
  },

  renderAll() {
    this.renderIpoTabs();
    this.renderIpoDashboard();
    this.renderMasterSheet();
    this.renderFixedPansTable();
    this.updateBadges();
  },

  // ==================== VIEW TOGGLE ====================
  switchView(viewName) {
    this.state.currentView = viewName;

    const btnIpos = document.getElementById('btn-view-ipos');
    const btnMaster = document.getElementById('btn-view-master');
    const btnFixed = document.getElementById('btn-view-fixed-pans');

    const secIpos = document.getElementById('view-ipos');
    const secMaster = document.getElementById('view-master');
    const secFixed = document.getElementById('view-fixed-pans');

    const activeClass = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition bg-indigo-600 text-white shadow-sm flex items-center gap-1.5';
    const inactiveClass = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition text-slate-400 hover:text-white flex items-center gap-1.5';

    if (btnIpos) btnIpos.className = viewName === 'ipos' ? activeClass : inactiveClass;
    if (btnMaster) btnMaster.className = viewName === 'master' ? activeClass : inactiveClass;
    if (btnFixed) btnFixed.className = viewName === 'fixed-pans' ? activeClass : inactiveClass;

    if (secIpos) secIpos.classList.toggle('hidden', viewName !== 'ipos');
    if (secMaster) secMaster.classList.toggle('hidden', viewName !== 'master');
    if (secFixed) secFixed.classList.toggle('hidden', viewName !== 'fixed-pans');

    if (viewName === 'ipos') {
      this.renderIpoDashboard();
    } else if (viewName === 'master') {
      this.renderMasterSheet();
    } else {
      this.renderFixedPansTable();
    }
  },

  updateBadges() {
    // 1. Badge for PAN Card Holders count
    const badgeCount = document.getElementById('badge-fixed-pan-count');
    if (badgeCount) badgeCount.textContent = this.state.fixedPans.length;

    // 2. Badge for Master Pending Payouts & Recoveries across all IPOs
    const badgeMaster = document.getElementById('badge-master-pending');
    if (badgeMaster) {
      const summary = this.getMasterPeopleSummary();
      const totalPendingPayout = summary.filter(p => p.totalPending > 0).reduce((sum, p) => sum + p.totalPending, 0);
      const totalPendingRecovery = summary.filter(p => p.totalPending < 0).reduce((sum, p) => sum + Math.abs(p.totalPending), 0);

      if (totalPendingPayout > 0 && totalPendingRecovery > 0) {
        badgeMaster.className = 'text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30';
        badgeMaster.textContent = `₹${totalPendingPayout.toLocaleString('en-IN')} Due | ₹${totalPendingRecovery.toLocaleString('en-IN')} Recoverable`;
      } else if (totalPendingPayout > 0) {
        badgeMaster.className = 'text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30';
        badgeMaster.textContent = `₹${totalPendingPayout.toLocaleString('en-IN')} Due`;
      } else if (totalPendingRecovery > 0) {
        badgeMaster.className = 'text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30';
        badgeMaster.textContent = `₹${totalPendingRecovery.toLocaleString('en-IN')} Recoverable`;
      } else {
        badgeMaster.className = 'text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        badgeMaster.textContent = 'All Settled';
      }
    }
  },

  // ==================== PAN CARD HOLDERS ====================
  renderFixedPansTable() {
    const tbody = document.getElementById('fixed-pans-table-body');
    const countLabel = document.getElementById('fixed-pans-count-label');
    const searchQuery = (document.getElementById('search-fixed-pan-input')?.value || '').toLowerCase().trim();

    if (!tbody) return;

    const filtered = this.state.fixedPans.filter(p => {
      return !searchQuery ||
        (p.code && p.code.toLowerCase().includes(searchQuery)) ||
        (p.name && p.name.toLowerCase().includes(searchQuery)) ||
        (p.middleman && p.middleman.toLowerCase().includes(searchQuery)) ||
        (p.partner && p.partner.toLowerCase().includes(searchQuery)) ||
        (p.phone && p.phone.includes(searchQuery));
    });

    if (countLabel) countLabel.textContent = `Showing ${filtered.length} of ${this.state.fixedPans.length} PAN card holders`;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-12 text-slate-500 text-xs">
            <i class="fa-solid fa-users text-3xl mb-2 block opacity-40"></i>
            No PAN card holders saved yet.<br>
            Click <strong class="text-indigo-400 cursor-pointer" onclick="App.openAddFixedPanModal()">"+ Add PAN Card Holder"</strong> to add names!
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(p => {
      return `
        <tr class="hover:bg-slate-800/40 transition">
          <td class="py-3 px-4 font-bold text-white text-xs">
            <div class="flex items-center gap-2">
              ${p.code ? `<span class="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[11px] border border-indigo-500/30 font-bold">${this.escapeHtml(p.code)}</span>` : ''}
              <span>${this.escapeHtml(p.name)}</span>
            </div>
          </td>

          <td class="py-3 px-4 text-xs text-slate-300">
            ${p.middleman ? `<span class="text-amber-300 font-medium">${this.escapeHtml(p.middleman)}</span>` : '<span class="text-slate-600">None</span>'}
          </td>

          <td class="py-3 px-4 text-xs text-slate-300">
            ${p.partner ? `<span class="text-purple-300 font-medium">${this.escapeHtml(p.partner)}</span>` : '<span class="text-slate-600">None</span>'}
          </td>

          <td class="py-3 px-4 text-xs font-mono text-slate-300">
            ${p.phone || '<span class="text-slate-600">-</span>'}
          </td>

          <td class="py-3 px-4 text-xs">
            ${p.splitType === 'amount' ? `
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Direct ₹</span>
                <span class="text-slate-300">Holder: <strong class="text-purple-300">₹${(p.amtX !== undefined ? p.amtX : 500).toLocaleString('en-IN')}</strong></span>
                ${p.middleman ? `<span class="text-slate-400">Middleman: <strong class="text-amber-300">₹${(p.amtY || 0).toLocaleString('en-IN')}</strong></span>` : ''}
                ${p.partner ? `<span class="text-slate-400">Partner: <strong class="text-purple-300">₹${(p.amtZ || 0).toLocaleString('en-IN')}</strong></span>` : ''}
              </div>
            ` : `
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">% Split</span>
                <span class="text-slate-400">Holder: <strong class="text-purple-300">${p.pctX !== undefined ? p.pctX : 10}%</strong></span>
                <span class="text-slate-400">Middleman: <strong class="text-amber-300">${p.pctY !== undefined ? p.pctY : 10}%</strong></span>
                <span class="text-slate-400">Partner: <strong class="text-amber-300">${p.pctZ !== undefined ? p.pctZ : 15}%</strong></span>
              </div>
            `}
          </td>

          <td class="py-3 px-4 text-right">
            <div class="flex items-center justify-end gap-1.5">
              <button onclick="App.openEditFixedPanModal('${p.id}')" class="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition" title="Edit">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button onclick="App.deleteFixedPan('${p.id}')" class="p-1.5 rounded bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 transition" title="Delete">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  setFixedPanSplitType(type) {
    const hidden = document.getElementById('fp-split-type');
    if (hidden) hidden.value = type;

    const btnPct = document.getElementById('fp-split-type-pct');
    const btnAmt = document.getElementById('fp-split-type-amt');
    const containerPct = document.getElementById('fp-split-pct-container');
    const containerAmt = document.getElementById('fp-split-amt-container');

    if (type === 'amount') {
      if (btnAmt) btnAmt.className = 'px-2 py-0.5 rounded-md font-semibold transition bg-emerald-600 text-white shadow-sm flex items-center gap-1';
      if (btnPct) btnPct.className = 'px-2 py-0.5 rounded-md font-medium text-slate-400 hover:text-white transition flex items-center gap-1';
      if (containerPct) containerPct.classList.add('hidden');
      if (containerAmt) containerAmt.classList.remove('hidden');
    } else {
      if (btnPct) btnPct.className = 'px-2 py-0.5 rounded-md font-semibold transition bg-indigo-600 text-white shadow-sm flex items-center gap-1';
      if (btnAmt) btnAmt.className = 'px-2 py-0.5 rounded-md font-medium text-slate-400 hover:text-white transition flex items-center gap-1';
      if (containerPct) containerPct.classList.remove('hidden');
      if (containerAmt) containerAmt.classList.add('hidden');
    }
  },

  openAddFixedPanModal() {
    this.state.editingFixedPanId = null;
    document.getElementById('modal-fixed-pan-title').innerHTML = '<i class="fa-solid fa-user-plus text-indigo-400"></i> Add PAN Card Holder';
    document.getElementById('form-fixed-pan').reset();
    document.getElementById('fixed-pan-id').value = '';

    const elCode = document.getElementById('fp-code');
    if (elCode) elCode.value = '';

    document.getElementById('fp-pct-x').value = 10;
    document.getElementById('fp-pct-y').value = 10;
    document.getElementById('fp-pct-z').value = 15;

    const elAmtX = document.getElementById('fp-amt-x');
    if (elAmtX) elAmtX.value = 500;
    const elAmtY = document.getElementById('fp-amt-y');
    if (elAmtY) elAmtY.value = 0;
    const elAmtZ = document.getElementById('fp-amt-z');
    if (elAmtZ) elAmtZ.value = 0;
    const elPayLoss = document.getElementById('fp-amt-pay-loss');
    if (elPayLoss) elPayLoss.checked = false;

    this.setFixedPanSplitType('percentage');
    this.updateFixedPanPctLabels();
    this.openModal('modal-fixed-pan');
  },

  openEditFixedPanModal(id) {
    const pan = this.state.fixedPans.find(p => p.id === id);
    if (!pan) return;

    this.state.editingFixedPanId = id;
    document.getElementById('modal-fixed-pan-title').innerHTML = '<i class="fa-solid fa-pen-to-square text-indigo-400"></i> Edit PAN Card Holder';

    document.getElementById('fixed-pan-id').value = pan.id;
    const elCode = document.getElementById('fp-code');
    if (elCode) elCode.value = pan.code || '';
    document.getElementById('fp-name').value = pan.name || '';
    document.getElementById('fp-middleman').value = pan.middleman || '';
    document.getElementById('fp-partner').value = pan.partner || '';
    document.getElementById('fp-phone').value = pan.phone || '';
    document.getElementById('fp-pct-x').value = pan.pctX !== undefined ? pan.pctX : 10;
    document.getElementById('fp-pct-y').value = pan.pctY !== undefined ? pan.pctY : 10;
    document.getElementById('fp-pct-z').value = pan.pctZ !== undefined ? pan.pctZ : 15;

    const elAmtX = document.getElementById('fp-amt-x');
    if (elAmtX) elAmtX.value = pan.amtX !== undefined ? pan.amtX : 500;
    const elAmtY = document.getElementById('fp-amt-y');
    if (elAmtY) elAmtY.value = pan.amtY !== undefined ? pan.amtY : 0;
    const elAmtZ = document.getElementById('fp-amt-z');
    if (elAmtZ) elAmtZ.value = pan.amtZ !== undefined ? pan.amtZ : 0;
    const elPayLoss = document.getElementById('fp-amt-pay-loss');
    if (elPayLoss) elPayLoss.checked = !!pan.payOnLoss;

    this.setFixedPanSplitType(pan.splitType === 'amount' ? 'amount' : 'percentage');
    this.updateFixedPanPctLabels();
    this.openModal('modal-fixed-pan');
  },

  updateFixedPanPctLabels() {
    const valX = document.getElementById('fp-pct-x')?.value;
    const valY = document.getElementById('fp-pct-y')?.value;
    const valZ = document.getElementById('fp-pct-z')?.value;

    const x = (valX !== undefined && valX !== '') ? valX : '0';
    const y = (valY !== undefined && valY !== '') ? valY : '0';
    const z = (valZ !== undefined && valZ !== '') ? valZ : '0';

    const lblX = document.getElementById('fp-pct-x-label');
    const lblY = document.getElementById('fp-pct-y-label');
    const lblZ = document.getElementById('fp-pct-z-label');

    if (lblX) lblX.textContent = `${x}% of profit`;
    if (lblY) lblY.textContent = `${y}% of holder`;
    if (lblZ) lblZ.textContent = `${z}% of remaining`;
  },

  saveFixedPan(e) {
    e.preventDefault();
    const id = document.getElementById('fixed-pan-id').value || 'fp_' + Date.now();
    const code = (document.getElementById('fp-code')?.value || '').trim();
    const name = document.getElementById('fp-name').value.trim();

    if (!name) {
      this.showToast('Please enter Holder Name', 'error');
      return;
    }

    const splitType = document.getElementById('fp-split-type')?.value || 'percentage';
    const valX = parseFloat(document.getElementById('fp-pct-x').value);
    const valY = parseFloat(document.getElementById('fp-pct-y').value);
    const valZ = parseFloat(document.getElementById('fp-pct-z').value);

    const valAmtX = parseFloat(document.getElementById('fp-amt-x')?.value);
    const valAmtY = parseFloat(document.getElementById('fp-amt-y')?.value);
    const valAmtZ = parseFloat(document.getElementById('fp-amt-z')?.value);
    const payOnLoss = document.getElementById('fp-amt-pay-loss')?.checked || false;

    const panObj = {
      id,
      code,
      name,
      middleman: document.getElementById('fp-middleman').value.trim(),
      partner: document.getElementById('fp-partner').value.trim(),
      phone: document.getElementById('fp-phone').value.trim(),
      splitType,
      pctX: !isNaN(valX) ? valX : 10,
      pctY: !isNaN(valY) ? valY : 10,
      pctZ: !isNaN(valZ) ? valZ : 15,
      amtX: !isNaN(valAmtX) ? valAmtX : 500,
      amtY: !isNaN(valAmtY) ? valAmtY : 0,
      amtZ: !isNaN(valAmtZ) ? valAmtZ : 0,
      payOnLoss,
      updatedAt: new Date().toISOString()
    };

    const existingIdx = this.state.fixedPans.findIndex(p => p.id === id);
    if (existingIdx >= 0) {
      this.state.fixedPans[existingIdx] = panObj;
      this.showToast(`PAN Card Holder "${panObj.name}" updated`, 'success');
    } else {
      this.state.fixedPans.push(panObj);
      this.showToast(`PAN Card Holder "${panObj.name}" saved`, 'success');
    }

    this.saveState();
    this.closeModal('modal-fixed-pan');
    this.renderFixedPansTable();
    this.updateBadges();
  },

  deleteFixedPan(id) {
    const pan = this.state.fixedPans.find(p => p.id === id);
    if (!pan) return;

    if (!confirm(`Remove ${pan.name} from your PAN card holders?`)) return;

    this.state.fixedPans = this.state.fixedPans.filter(p => p.id !== id);
    this.saveState();
    this.renderFixedPansTable();
    this.updateBadges();
    this.showToast('PAN card holder removed', 'info');
  },

  // ==================== IPO MANAGEMENT ====================
  renderIpoTabs() {
    const container = document.getElementById('ipo-tabs-container');
    if (!container) return;

    if (!this.state.ipos || this.state.ipos.length === 0) {
      container.innerHTML = '<span class="text-xs text-slate-500 italic">No IPOs yet. Click "+ New IPO" to start</span>';
      return;
    }

    container.innerHTML = this.state.ipos.map(ipo => {
      const isActive = ipo.id === this.state.activeIpoId;
      const count = (ipo.entries || []).length;

      return `
        <button onclick="App.selectIpo('${ipo.id}')" class="px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 flex-shrink-0 ${
          isActive 
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' 
            : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
        }">
          <i class="fa-solid fa-chart-simple"></i>
          <span>${this.escapeHtml(ipo.name)}</span>
          <span class="text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-indigo-800 text-white' : 'bg-slate-800 text-slate-400'}">${count}</span>
        </button>
      `;
    }).join('');
  },

  selectIpo(ipoId) {
    this.state.activeIpoId = ipoId;
    this.saveState();
    this.renderIpoTabs();
    this.renderIpoDashboard();
  },

  openAddIpoModal() {
    document.getElementById('new-ipo-name').value = '';
    const fixedInput = document.getElementById('new-ipo-fixed-cost');
    if (fixedInput) fixedInput.value = 14000;
    this.openModal('modal-ipo');
  },

  saveIpo(e) {
    e.preventDefault();
    const name = document.getElementById('new-ipo-name').value.trim();
    if (!name) return;

    const fixedInput = document.getElementById('new-ipo-fixed-cost');
    const fixedCost = fixedInput ? (parseFloat(fixedInput.value) || 14000) : 14000;

    const newIpo = {
      id: 'ipo_' + Date.now(),
      name,
      fixedCost,
      entries: []
    };

    this.state.ipos.push(newIpo);
    this.state.activeIpoId = newIpo.id;
    this.saveState();
    this.closeModal('modal-ipo');
    this.renderAll();
    this.showToast(`IPO "${name}" created (Fixed Cost: ₹${fixedCost.toLocaleString('en-IN')})`, 'success');
  },

  editIpoFixedCost() {
    const ipo = this.getActiveIpo();
    if (!ipo) return;
    const currentFixed = this.getIpoFixedCost(ipo);
    const newVal = prompt(`Set Standard / Fixed Applied Cost for "${ipo.name}" (₹):`, currentFixed);
    if (newVal === null) return;
    const parsed = parseFloat(newVal);
    if (isNaN(parsed) || parsed < 0) {
      this.showToast('Please enter a valid numeric amount', 'error');
      return;
    }
    ipo.fixedCost = parsed;
    this.saveState();
    this.renderIpoDashboard();
    this.showToast(`Fixed Applied Cost for "${ipo.name}" updated to ₹${parsed.toLocaleString('en-IN')}`, 'success');
  },

  deleteCurrentIpo() {
    const ipo = this.getActiveIpo();
    if (!ipo) return;

    if (!confirm(`Are you sure you want to delete IPO "${ipo.name}" and all its allotment splits?`)) return;

    this.state.ipos = this.state.ipos.filter(i => i.id !== ipo.id);
    this.state.activeIpoId = this.state.ipos[0]?.id || null;
    this.saveState();
    this.renderAll();
    this.showToast(`IPO "${ipo.name}" has been deleted.`, 'info');
  },

  // ==================== MASTER SETTLE BUTTON FOR ACTIVE IPO ====================
  masterToggleSettleCurrentIpo() {
    const ipo = this.getActiveIpo();
    if (!ipo || !ipo.entries || ipo.entries.length === 0) {
      this.showToast('No entries to settle in this IPO', 'error');
      return;
    }

    const hasPending = ipo.entries.some(e => !e.isPaidX || (e.middleman && !e.isPaidY) || (e.partner && !e.isPaidZ));
    const today = this.getTodayDateStr();

    if (hasPending) {
      if (!confirm(`Mark ALL payouts in "${ipo.name}" as SETTLED on today (${this.formatDateDisplay(today)})?`)) return;
      ipo.entries.forEach(e => {
        e.isPaidX = true;
        e.settledDateX = e.settledDateX || today;
        e.isPaidY = true;
        e.settledDateY = e.settledDateY || today;
        e.isPaidZ = true;
        e.settledDateZ = e.settledDateZ || today;
      });
      this.showToast(`All payouts for "${ipo.name}" marked as SETTLED on ${this.formatDateDisplay(today)}!`, 'success');
    } else {
      if (!confirm(`Reopen / Mark all payouts in "${ipo.name}" as PENDING?`)) return;
      ipo.entries.forEach(e => {
        e.isPaidX = false;
        e.settledDateX = null;
        e.isPaidY = false;
        e.settledDateY = null;
        e.isPaidZ = false;
        e.settledDateZ = null;
      });
      this.showToast(`Payouts for "${ipo.name}" marked as Pending.`, 'info');
    }

    this.saveState();
    this.renderAll();
  },

  // ==================== SELECTED IPO DASHBOARD & ENTRIES ====================
  renderIpoDashboard() {
    const ipo = this.getActiveIpo();
    const btnDel = document.getElementById('btn-delete-current-ipo');
    const btnMasterSettle = document.getElementById('btn-master-settle-ipo');

    if (!ipo) {
      document.getElementById('current-ipo-name').textContent = 'No IPO Created Yet';
      document.getElementById('current-ipo-badge').textContent = 'Empty';
      const badgeFixedCost = document.getElementById('current-ipo-fixed-cost-badge');
      if (badgeFixedCost) badgeFixedCost.classList.add('hidden');
      if (btnDel) btnDel.style.display = 'none';
      if (btnMasterSettle) btnMasterSettle.style.display = 'none';

      document.getElementById('stat-total-applied').textContent = '₹0';
      document.getElementById('stat-pan-count').textContent = '0 Lots';
      document.getElementById('stat-total-sold').textContent = '₹0';
      document.getElementById('stat-total-profit').textContent = '₹0';
      document.getElementById('stat-total-x').textContent = '₹0';
      document.getElementById('stat-total-yz').textContent = '₹0';
      document.getElementById('stat-total-you').textContent = '₹0';

      const tbody = document.getElementById('entries-table-body');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="9" class="text-center py-16 text-slate-500 text-xs">
              <i class="fa-solid fa-folder-plus text-4xl mb-3 block opacity-40 text-emerald-400"></i>
              <div class="text-sm font-semibold text-white mb-1">Welcome to IPO Profit Splitter!</div>
              No IPOs created yet.<br>
              Click <strong class="text-emerald-400 cursor-pointer underline underline-offset-4" onclick="App.openAddIpoModal()">"+ New IPO"</strong> to create your first real IPO.
            </td>
          </tr>
        `;
      }
      return;
    }

    if (btnDel) btnDel.style.display = 'inline-block';

    const entries = ipo.entries || [];

    document.getElementById('current-ipo-name').textContent = ipo.name;
    document.getElementById('current-ipo-badge').textContent = `${entries.length} Allotments`;

    const badgeFixedCost = document.getElementById('current-ipo-fixed-cost-badge');
    const valFixedCost = document.getElementById('current-ipo-fixed-cost-val');
    if (badgeFixedCost && valFixedCost) {
      const fixedCost = this.getIpoFixedCost(ipo);
      badgeFixedCost.classList.remove('hidden');
      valFixedCost.textContent = '₹' + fixedCost.toLocaleString('en-IN');
    }

    let totalApplied = 0;
    let totalSold = 0;
    let totalX = 0;
    let totalY = 0;
    let totalZ = 0;
    let totalYou = 0;

    entries.forEach(e => {
      totalApplied += (e.cost || 0);
      totalSold += (e.sell || 0);
      totalX += (e.cutX || 0);
      totalY += (e.cutY || 0);
      totalZ += (e.cutZ || 0); // negative on loss
      totalYou += (e.cutA || 0); // negative on loss
    });

    const netIpoProfit = totalSold - totalApplied;

    document.getElementById('stat-total-applied').textContent = '₹' + totalApplied.toLocaleString('en-IN');
    document.getElementById('stat-pan-count').textContent = `${entries.length} Lots`;
    document.getElementById('stat-total-sold').textContent = '₹' + totalSold.toLocaleString('en-IN');

    // Total Profit / Loss metric display
    const elProfitStat = document.getElementById('stat-total-profit');
    if (netIpoProfit >= 0) {
      elProfitStat.className = 'text-xl font-bold text-cyan-400 mt-1 font-mono';
      elProfitStat.textContent = '₹' + netIpoProfit.toLocaleString('en-IN');
    } else {
      elProfitStat.className = 'text-xl font-bold text-rose-400 mt-1 font-mono';
      elProfitStat.textContent = '-₹' + Math.abs(netIpoProfit).toLocaleString('en-IN') + ' (Loss)';
    }

    document.getElementById('stat-total-x').textContent = '₹' + totalX.toLocaleString('en-IN');
    
    // Middlemen & Partner net
    const netYZ = totalY + totalZ;
    document.getElementById('stat-total-yz').textContent = (netYZ >= 0 ? '₹' : '-₹') + Math.abs(netYZ).toLocaleString('en-IN');

    // Your Net Profit / Loss metric display
    const elYouStat = document.getElementById('stat-total-you');
    if (totalYou >= 0) {
      elYouStat.className = 'text-2xl font-black text-emerald-400 mt-0.5 font-mono';
      elYouStat.textContent = '₹' + totalYou.toLocaleString('en-IN');
    } else {
      elYouStat.className = 'text-2xl font-black text-rose-400 mt-0.5 font-mono';
      elYouStat.textContent = '-₹' + Math.abs(totalYou).toLocaleString('en-IN') + ' (Loss)';
    }

    // Update Master Settle Button for this specific IPO
    const hasPending = entries.some(e => !e.isPaidX || (e.middleman && !e.isPaidY) || (e.partner && !e.isPaidZ));
    const pendingCount = entries.filter(e => !e.isPaidX || (e.middleman && !e.isPaidY) || (e.partner && !e.isPaidZ)).length;
    if (btnMasterSettle) {
      if (entries.length === 0) {
        btnMasterSettle.style.display = 'none';
      } else {
        btnMasterSettle.style.display = 'flex';
        if (hasPending) {
          btnMasterSettle.className = 'text-xs px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-semibold transition flex items-center gap-1.5 shadow-sm';
          btnMasterSettle.innerHTML = `<i class="fa-solid fa-check-double text-amber-400"></i> <span>Master Settle IPO (${pendingCount} Pending)</span>`;
        } else {
          btnMasterSettle.className = 'text-xs px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-semibold transition flex items-center gap-1.5 shadow-sm';
          btnMasterSettle.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400"></i> <span>All Settled in IPO (Click to Reopen)</span>`;
        }
      }
    }

    const tbody = document.getElementById('entries-table-body');
    if (!tbody) return;

    if (entries.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center py-12 text-slate-500 text-xs">
            <i class="fa-solid fa-receipt text-3xl mb-2 block opacity-40"></i>
            No allotment splits recorded for ${this.escapeHtml(ipo.name)}.<br>
            Click <strong class="text-indigo-400 cursor-pointer" onclick="App.openBulkImportModal()">"Add PAN Card Holders in Bulk"</strong> or <strong class="text-indigo-400 cursor-pointer" onclick="App.openAddEntryModal()">"+ Add Single Split"</strong> to record!
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = entries.map(item => {
      const isLoss = (item.sell || 0) < (item.cost || 0);
      const diff = (item.sell || 0) - (item.cost || 0);

      return `
        <tr class="hover:bg-slate-800/40 transition ${isLoss ? 'bg-rose-950/10' : ''}">
          <!-- Holder -->
          <td class="py-3 px-3">
            <div class="font-bold text-white text-xs">${this.escapeHtml(item.panHolder)}</div>
          </td>

          <!-- Middleman -->
          <td class="py-3 px-3 text-xs text-slate-300">
            ${item.middleman ? `<span class="text-amber-300 font-semibold">${this.escapeHtml(item.middleman)}</span>` : '<span class="text-slate-600">-</span>'}
          </td>

          <!-- Partner -->
          <td class="py-3 px-3 text-xs text-slate-300">
            ${item.partner ? `<span class="text-purple-300 font-semibold">${this.escapeHtml(item.partner)}</span>` : '<span class="text-slate-600">-</span>'}
          </td>

          <!-- Cost & Sell -->
          <td class="py-3 px-3 text-right font-mono text-xs">
            <div class="flex items-center justify-end gap-1.5">
              ${item.costType === 'variable'
                ? '<span class="text-[9px] uppercase px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-sans border border-amber-500/30" title="Variable Allotment Amount">Variable</span>'
                : '<span class="text-[9px] uppercase px-1 py-0.2 rounded bg-indigo-500/15 text-indigo-300 font-sans border border-indigo-500/20" title="Fixed Standard Lot Cost">Fixed</span>'}
              <span class="text-slate-300 font-bold">₹${item.cost.toLocaleString('en-IN')}</span>
            </div>
            <div class="${isLoss ? 'text-rose-400' : 'text-emerald-400'} font-bold mt-0.5">&rarr; ₹${item.sell.toLocaleString('en-IN')}</div>
          </td>

          <!-- Net Profit / Loss -->
          <td class="py-3 px-3 text-right font-mono font-bold text-xs">
            ${!isLoss 
              ? `<span class="text-cyan-400">₹${item.profit.toLocaleString('en-IN')}</span>` 
              : `<div><span class="text-rose-400">-₹${Math.abs(diff).toLocaleString('en-IN')}</span></div><span class="text-[9px] uppercase px-1 rounded bg-rose-500/20 text-rose-300 font-sans">Loss</span>`}
          </td>

          <!-- Exact Breakdown with Real Names -->
          <td class="py-3 px-3 text-xs space-y-1">
            ${!isLoss ? `
              <!-- Profit Distribution -->
              <div class="flex items-center justify-between text-slate-300 gap-2">
                <span>
                  <strong>${this.escapeHtml(item.panHolder)}:</strong>
                  ${item.splitType === 'amount'
                    ? '<span class="text-[9px] uppercase px-1 rounded bg-emerald-500/20 text-emerald-300 font-sans ml-1 font-semibold">Direct ₹</span>'
                    : `<span class="text-[10px] text-slate-400 ml-1">(${item.pctX}%)</span>`}
                </span>
                <span class="font-mono font-bold text-purple-300">₹${item.cutX.toLocaleString('en-IN')}</span>
              </div>
              ${item.middleman ? `
              <div class="flex items-center justify-between text-slate-400 gap-2">
                <span>
                  <strong>${this.escapeHtml(item.middleman)}:</strong>
                  ${item.splitType === 'amount'
                    ? '<span class="text-[9px] uppercase px-1 rounded bg-amber-500/20 text-amber-300 font-sans ml-1 font-semibold">Direct ₹</span>'
                    : `<span class="text-[10px] text-slate-400 ml-1">(${item.pctY}%)</span>`}
                </span>
                <span class="font-mono text-amber-300 font-semibold">₹${item.cutY.toLocaleString('en-IN')}</span>
              </div>` : ''}
              ${item.partner ? `
              <div class="flex items-center justify-between text-slate-400 gap-2">
                <span>
                  <strong>${this.escapeHtml(item.partner)}:</strong>
                  ${item.splitType === 'amount'
                    ? '<span class="text-[9px] uppercase px-1 rounded bg-purple-500/20 text-purple-300 font-sans ml-1 font-semibold">Direct ₹</span>'
                    : `<span class="text-[10px] text-slate-400 ml-1">(${item.pctZ}%)</span>`}
                </span>
                <span class="font-mono text-amber-300 font-semibold">₹${item.cutZ.toLocaleString('en-IN')}</span>
              </div>` : ''}
            ` : `
              <!-- Loss Distribution -->
              <div class="flex items-center justify-between text-slate-400 gap-2">
                <span>${this.escapeHtml(item.panHolder)}:</span>
                <span class="font-mono">${item.cutX > 0 ? `₹${item.cutX.toLocaleString('en-IN')} (Direct Paid)` : '₹0 (No payout)'}</span>
              </div>
              ${item.middleman && item.cutY > 0 ? `
              <div class="flex items-center justify-between text-slate-400 gap-2">
                <span>${this.escapeHtml(item.middleman)}:</span>
                <span class="font-mono">₹${item.cutY.toLocaleString('en-IN')} (Direct Paid)</span>
              </div>` : ''}
              ${item.partner ? `
              <div class="flex items-center justify-between text-rose-300 gap-2 bg-rose-950/30 px-1.5 py-0.5 rounded border border-rose-500/30">
                <span><strong class="text-white">${this.escapeHtml(item.partner)}</strong> (PAYS YOU):</span>
                <span class="font-mono font-bold text-rose-400">₹${(item.partnerOwes || Math.abs(item.cutZ)).toLocaleString('en-IN')} ${item.splitType === 'amount' ? '' : `(${item.pctZ}%)`}</span>
              </div>` : '<div class="text-slate-500">No Partner linked to share loss</div>'}
            `}
          </td>

          <!-- YOUR PROFIT / LOSS -->
          <td class="py-3 px-3 text-right font-mono font-black text-sm">
            ${!isLoss 
              ? `<span class="text-emerald-400">₹${item.cutA.toLocaleString('en-IN')}</span>` 
              : `<div class="text-rose-400">-₹${Math.abs(item.cutA).toLocaleString('en-IN')}</div><span class="text-[10px] text-rose-400/80 font-normal">Net Loss</span>`}
          </td>

          <!-- Status & Settle Date -->
          <td class="py-3 px-3 text-center">
            ${!isLoss ? `
              <div class="inline-flex flex-col items-center">
                <button onclick="App.togglePaidStatus('${item.id}')" class="px-2.5 py-1 rounded text-[10px] font-bold uppercase transition ${
                  item.isPaidX 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30' 
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                }" title="${item.isPaidX ? 'Click to reopen as Pending' : 'Click to mark Settled today'}">
                  ${item.isPaidX ? '<i class="fa-solid fa-check mr-1"></i> Settled' : '<i class="fa-solid fa-clock mr-1"></i> Pending'}
                </button>
                ${item.isPaidX ? `
                  <button onclick="App.openEditDateModal('${item.id}')" class="text-[10px] text-emerald-400/90 hover:text-emerald-300 font-mono mt-0.5 flex items-center gap-1 hover:underline" title="Click to edit settlement date">
                    <i class="fa-regular fa-calendar-check text-[9px]"></i> ${this.formatDateDisplay(item.settledDateX) || 'Today'}
                  </button>
                ` : `
                  <span class="text-[10px] text-slate-500 mt-0.5">Unsettled</span>
                `}
              </div>
            ` : `
              <div class="inline-flex flex-col items-center">
                <button onclick="App.togglePaidStatus('${item.id}')" class="px-2.5 py-1 rounded text-[10px] font-bold uppercase transition ${
                  item.isPaidZ 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30' 
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                }" title="${item.isPaidZ ? 'Click to reopen' : 'Click to mark Collected today'}">
                  ${item.isPaidZ ? '<i class="fa-solid fa-check mr-1"></i> Collected' : '<i class="fa-solid fa-hand-holding-dollar mr-1"></i> Owes ₹' + (item.partnerOwes || Math.abs(item.cutZ))}
                </button>
                ${item.isPaidZ ? `
                  <button onclick="App.openEditDateModal('${item.id}')" class="text-[10px] text-emerald-400/90 hover:text-emerald-300 font-mono mt-0.5 flex items-center gap-1 hover:underline" title="Click to edit settlement date">
                    <i class="fa-regular fa-calendar-check text-[9px]"></i> ${this.formatDateDisplay(item.settledDateZ) || 'Today'}
                  </button>
                ` : `
                  <span class="text-[10px] text-rose-400/80 mt-0.5">Pending Recovery</span>
                `}
              </div>
            `}
          </td>

          <!-- Actions -->
          <td class="py-3 px-3 text-right">
            <div class="flex items-center justify-end gap-1.5">
              <button onclick="App.shareWhatsAppSlip('${item.id}')" class="p-1.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30" title="Send WhatsApp Slip">
                <i class="fa-brands fa-whatsapp"></i>
              </button>
              <button onclick="App.openEditEntryModal('${item.id}')" class="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300" title="Edit">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button onclick="App.deleteEntry('${item.id}')" class="p-1.5 rounded bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400" title="Delete">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  // Formula Calculation Core (Handles both Percentage vs Direct Amount, and Profit & Loss sharing)
  calculateSplit(
    cost,
    sell,
    pctX = 10,
    pctY = 10,
    pctZ = 15,
    hasY = true,
    hasZ = true,
    splitType = 'percentage',
    amtX = 0,
    amtY = 0,
    amtZ = 0,
    payOnLoss = false
  ) {
    const diff = sell - cost;
    const isLoss = diff < 0;

    // DIRECT FIXED AMOUNT SPLIT MODE
    if (splitType === 'amount') {
      const parsedAmtX = Math.max(0, parseFloat(amtX) || 0);
      const parsedAmtY = hasY ? Math.max(0, parseFloat(amtY) || 0) : 0;
      const parsedAmtZ = hasZ ? Math.max(0, parseFloat(amtZ) || 0) : 0;

      if (!isLoss) {
        const profit = diff;
        const cutX = parsedAmtX;
        const cutY = parsedAmtY;
        const cutZ = parsedAmtZ;
        const remainingAfterXY = Math.max(0, profit - cutX - cutY);
        const cutA = profit - cutX - cutY - cutZ;

        return {
          diff,
          isLoss: false,
          splitType: 'amount',
          profit,
          loss: 0,
          cutX,
          cutY,
          cutZ,
          cutA,
          remainingAfterXY,
          partnerOwes: 0,
          payOnLoss: !!payOnLoss
        };
      } else {
        const loss = Math.abs(diff);
        let cutX = 0;
        let cutY = 0;
        let cutZ = 0;

        if (payOnLoss) {
          cutX = parsedAmtX;
          cutY = parsedAmtY;
          cutZ = parsedAmtZ;
        }

        const cutA = -(loss + cutX + cutY + cutZ);

        return {
          diff,
          isLoss: true,
          splitType: 'amount',
          profit: 0,
          loss,
          cutX,
          cutY,
          cutZ,
          cutA,
          remainingAfterXY: 0,
          partnerOwes: 0,
          payOnLoss: !!payOnLoss
        };
      }
    }

    // PERCENTAGE SPLIT MODE
    if (!isLoss) {
      const profit = diff;

      // Holder gets pctX% of total profit (e.g. 10% of 4000 = 400)
      const cutX = Math.round((pctX / 100) * profit);

      // Middleman gets pctY% of Holder's cut (e.g. 10% of 400 = 40)
      const cutY = hasY ? Math.round((pctY / 100) * cutX) : 0;

      // Remaining profit after Holder and Middleman
      const remainingAfterXY = Math.max(0, profit - cutX - cutY);

      // Partner gets pctZ% of remaining (e.g. 15% of 3560 = 534)
      const cutZ = hasZ ? Math.round((pctZ / 100) * remainingAfterXY) : 0;

      // You get the rest amount (e.g. 4000 - 400 - 40 - 534 = 3026)
      const cutA = Math.max(0, profit - cutX - cutY - cutZ);

      return {
        diff,
        isLoss: false,
        splitType: 'percentage',
        profit,
        loss: 0,
        cutX,
        cutY,
        cutZ,
        cutA,
        remainingAfterXY,
        partnerOwes: 0,
        payOnLoss: false
      };
    } else {
      const loss = Math.abs(diff); // e.g. 14,000 - 10,000 = 4,000

      // In a loss: Holder and Middleman get 0
      const cutX = 0;
      const cutY = 0;

      // Partner pays YOU the same percentage (pctZ%) of total loss (e.g. 15% of 4000 = 600)
      const partnerLossShare = hasZ ? Math.round((pctZ / 100) * loss) : 0;
      
      // For accounting: Partner's net contribution is negative (they owe you 600)
      const cutZ = -partnerLossShare;

      // You absorb the remaining loss: (Loss - Partner Share) => e.g. -(4000 - 600) = -3400
      const cutA = -(loss - partnerLossShare);

      return {
        diff,
        isLoss: true,
        splitType: 'percentage',
        profit: 0,
        loss,
        cutX: 0,
        cutY: 0,
        cutZ, // -600
        cutA, // -3400
        remainingAfterXY: 0,
        partnerOwes: partnerLossShare, // 600
        payOnLoss: false
      };
    }
  },

  // ==================== MASTER IPO SHEET (CONSOLIDATED PER PERSON) ====================
  getMasterPeopleSummary() {
    const peopleMap = {};

    this.state.ipos.forEach(ipo => {
      (ipo.entries || []).forEach(entry => {
        // 1. Holder (only on profit)
        if (entry.panHolder && entry.cutX > 0) {
          const name = entry.panHolder.trim();
          if (!peopleMap[name]) {
            peopleMap[name] = {
              name,
              roles: new Set(),
              ipos: [],
              totalEarned: 0,
              totalPaid: 0,
              totalPending: 0,
              settledDates: []
            };
          }
          peopleMap[name].roles.add('Holder');
          const isPaid = !!entry.isPaidX;
          const sDate = entry.settledDateX || null;
          if (isPaid && sDate) peopleMap[name].settledDates.push(sDate);
          peopleMap[name].ipos.push({
            ipoId: ipo.id,
            ipoName: ipo.name,
            role: 'Holder',
            amount: entry.cutX,
            isLoss: false,
            isPaid,
            settledDate: sDate,
            entryId: entry.id,
            cutKey: 'isPaidX',
            dateKey: 'settledDateX'
          });
          peopleMap[name].totalEarned += entry.cutX;
          if (isPaid) peopleMap[name].totalPaid += entry.cutX;
          else peopleMap[name].totalPending += entry.cutX;
        }

        // 2. Middleman (only on profit)
        if (entry.middleman && entry.cutY > 0) {
          const name = entry.middleman.trim();
          if (!peopleMap[name]) {
            peopleMap[name] = {
              name,
              roles: new Set(),
              ipos: [],
              totalEarned: 0,
              totalPaid: 0,
              totalPending: 0,
              settledDates: []
            };
          }
          peopleMap[name].roles.add('Middleman');
          const isPaid = !!entry.isPaidY;
          const sDate = entry.settledDateY || null;
          if (isPaid && sDate) peopleMap[name].settledDates.push(sDate);
          peopleMap[name].ipos.push({
            ipoId: ipo.id,
            ipoName: ipo.name,
            role: 'Middleman',
            amount: entry.cutY,
            isLoss: false,
            isPaid,
            settledDate: sDate,
            entryId: entry.id,
            cutKey: 'isPaidY',
            dateKey: 'settledDateY'
          });
          peopleMap[name].totalEarned += entry.cutY;
          if (isPaid) peopleMap[name].totalPaid += entry.cutY;
          else peopleMap[name].totalPending += entry.cutY;
        }

        // 3. Partner (both profit > 0 and loss contribution < 0)
        if (entry.partner && entry.cutZ !== 0) {
          const name = entry.partner.trim();
          if (!peopleMap[name]) {
            peopleMap[name] = {
              name,
              roles: new Set(),
              ipos: [],
              totalEarned: 0,
              totalPaid: 0,
              totalPending: 0,
              settledDates: []
            };
          }
          peopleMap[name].roles.add('Partner');
          const isPaid = !!entry.isPaidZ;
          const sDate = entry.settledDateZ || null;
          if (isPaid && sDate) peopleMap[name].settledDates.push(sDate);
          peopleMap[name].ipos.push({
            ipoId: ipo.id,
            ipoName: ipo.name,
            role: 'Partner',
            amount: entry.cutZ, // positive for profit share, negative for loss share
            isLoss: entry.cutZ < 0,
            isPaid,
            settledDate: sDate,
            entryId: entry.id,
            cutKey: 'isPaidZ',
            dateKey: 'settledDateZ'
          });
          peopleMap[name].totalEarned += entry.cutZ;
          if (isPaid) peopleMap[name].totalPaid += entry.cutZ;
          else peopleMap[name].totalPending += entry.cutZ;
        }
      });
    });

    Object.values(peopleMap).forEach(p => {
      if (p.settledDates && p.settledDates.length > 0) {
        const sorted = [...p.settledDates].sort().reverse();
        p.lastSettledDate = sorted[0];
      } else {
        p.lastSettledDate = null;
      }
    });

    return Object.values(peopleMap).sort((a, b) => b.totalPending - a.totalPending);
  },

  setMasterFilter(filter) {
    this.state.masterFilter = filter;
    
    const btnPending = document.getElementById('master-filter-btn-pending');
    const btnAll = document.getElementById('master-filter-btn-all');
    const btnSettled = document.getElementById('master-filter-btn-settled');

    const activePill = 'px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 font-semibold transition';
    const inactivePill = 'px-2.5 py-1 rounded text-slate-400 hover:text-white font-medium transition';

    if (btnPending) btnPending.className = filter === 'pending' ? activePill : inactivePill;
    if (btnAll) btnAll.className = filter === 'all' ? activePill : inactivePill;
    if (btnSettled) btnSettled.className = filter === 'settled' ? activePill : inactivePill;

    this.renderMasterSheet();
  },

  renderMasterSheet() {
    const tbody = document.getElementById('master-table-body');
    const countLabel = document.getElementById('master-people-count-label');
    const searchQuery = (document.getElementById('search-master-input')?.value || '').toLowerCase().trim();

    const allPeople = this.getMasterPeopleSummary();

    // Global Stats across all IPOs
    let grandProfit = 0;
    let grandYou = 0;
    this.state.ipos.forEach(ipo => {
      (ipo.entries || []).forEach(e => {
        grandProfit += ((e.sell || 0) - (e.cost || 0));
        grandYou += (e.cutA || 0);
      });
    });

    const pendingPayouts = allPeople.filter(p => p.totalPending > 0).reduce((sum, p) => sum + p.totalPending, 0);
    const pendingRecoveries = allPeople.filter(p => p.totalPending < 0).reduce((sum, p) => sum + Math.abs(p.totalPending), 0);
    const grandSettled = allPeople.reduce((sum, p) => sum + p.totalPaid, 0);
    const unsettledPeopleCount = allPeople.filter(p => p.totalPending !== 0).length;

    // Update Top Stat Elements
    const elPending = document.getElementById('stat-master-pending');
    const elPendingCount = document.getElementById('stat-master-pending-count');
    const elSettled = document.getElementById('stat-master-settled');
    const elProfit = document.getElementById('stat-master-profit');
    const elYou = document.getElementById('stat-master-you');
    const elIpoCount = document.getElementById('stat-master-ipo-count');

    if (elPending) {
      if (pendingPayouts > 0 && pendingRecoveries > 0) {
        elPending.textContent = `₹${pendingPayouts.toLocaleString('en-IN')}`;
        if (elPendingCount) elPendingCount.textContent = `(Also ₹${pendingRecoveries.toLocaleString('en-IN')} to collect from partners)`;
      } else if (pendingPayouts > 0) {
        elPending.textContent = `₹${pendingPayouts.toLocaleString('en-IN')}`;
        if (elPendingCount) elPendingCount.textContent = `${unsettledPeopleCount} people to settle`;
      } else if (pendingRecoveries > 0) {
        elPending.textContent = `₹${pendingRecoveries.toLocaleString('en-IN')} (Recoverable)`;
        if (elPendingCount) elPendingCount.textContent = `From partners on losses`;
      } else {
        elPending.textContent = '₹0';
        if (elPendingCount) elPendingCount.textContent = 'All payouts & recoveries settled';
      }
    }

    if (elSettled) elSettled.textContent = '₹' + grandSettled.toLocaleString('en-IN');
    if (elProfit) elProfit.textContent = (grandProfit >= 0 ? '₹' : '-₹') + Math.abs(grandProfit).toLocaleString('en-IN');
    if (elYou) elYou.textContent = (grandYou >= 0 ? '₹' : '-₹') + Math.abs(grandYou).toLocaleString('en-IN');
    if (elIpoCount) elIpoCount.textContent = `${this.state.ipos.length} IPOs`;

    if (!tbody) return;

    // Filter people by search & filter
    const filter = this.state.masterFilter || 'pending';
    const filtered = allPeople.filter(p => {
      const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery);
      if (!matchSearch) return false;

      if (filter === 'pending') return p.totalPending !== 0;
      if (filter === 'settled') return p.totalPending === 0;
      return true; // 'all'
    });

    if (countLabel) {
      countLabel.textContent = `Showing ${filtered.length} of ${allPeople.length} people (${filter === 'pending' ? 'Pending Action' : filter === 'settled' ? 'Settled' : 'All'})`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-12 text-slate-500 text-xs">
            <i class="fa-solid fa-table-list text-3xl mb-2 block opacity-40"></i>
            ${allPeople.length === 0 
              ? 'No IPO allotments recorded yet. Add allotments in your IPOs to see them aggregated here!' 
              : filter === 'pending' 
                ? '<strong class="text-emerald-400">🎉 All payouts & loss contributions are settled!</strong> No pending amounts due.' 
                : 'No matching people found.'}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(p => {
      // Group items by IPO for clean visual pills
      const ipoMap = {};
      p.ipos.forEach(it => {
        if (!ipoMap[it.ipoId]) {
          ipoMap[it.ipoId] = {
            name: it.ipoName,
            total: 0,
            pending: 0,
            roles: new Set(),
            settledDate: null
          };
        }
        ipoMap[it.ipoId].total += it.amount;
        if (!it.isPaid) ipoMap[it.ipoId].pending += it.amount;
        else if (it.settledDate) ipoMap[it.ipoId].settledDate = it.settledDate;
        ipoMap[it.ipoId].roles.add(it.role);
      });

      const ipoPills = Object.values(ipoMap).map(info => {
        const isLoss = info.total < 0;
        const isPending = info.pending !== 0;
        const dateNote = (!isPending && info.settledDate) ? ` · ${this.formatDateDisplay(info.settledDate)}` : '';
        return `
          <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border ${
            isLoss 
              ? 'bg-rose-950/40 text-rose-300 border-rose-500/30' 
              : isPending 
                ? 'bg-amber-950/40 text-amber-300 border-amber-500/30' 
                : 'bg-slate-950 text-slate-400 border-slate-800'
          }" title="${!isPending && info.settledDate ? 'Settled on ' + this.formatDateDisplay(info.settledDate) : ''}">
            <span class="font-semibold text-slate-200">${this.escapeHtml(info.name)}:</span>
            <span class="${isLoss ? 'text-rose-300 font-bold' : isPending ? 'text-amber-300 font-bold' : 'text-slate-400'}">
              ${isLoss ? '-₹' + Math.abs(info.total).toLocaleString('en-IN') : '₹' + info.total.toLocaleString('en-IN')}
            </span>
            ${isLoss 
              ? (info.pending !== 0 ? '<span class="text-[9px] uppercase px-1 rounded bg-rose-500/30 text-rose-200 font-sans">Owes You</span>' : `<span class="text-[9px] text-emerald-400"><i class="fa-solid fa-check text-[9px]"></i>${dateNote}</span>`)
              : (info.pending !== 0 ? '<span class="text-[9px] uppercase px-1 rounded bg-amber-500/30 text-amber-200 font-sans">Due</span>' : `<span class="text-[9px] text-emerald-400"><i class="fa-solid fa-check text-[9px]"></i>${dateNote}</span>`)}
          </div>
        `;
      }).join(' ');

      const isOwed = p.totalPending > 0;
      const owesYou = p.totalPending < 0;
      const isFullySettled = p.totalPending === 0;

      let pendingHtml = '';
      if (isOwed) {
        pendingHtml = `<div class="font-bold font-mono text-sm text-amber-400">₹${p.totalPending.toLocaleString('en-IN')}</div><span class="text-[10px] text-amber-300/80">You pay ${this.escapeHtml(p.name)}</span>`;
      } else if (owesYou) {
        pendingHtml = `<div class="font-bold font-mono text-sm text-rose-400">OWES YOU: ₹${Math.abs(p.totalPending).toLocaleString('en-IN')}</div><span class="text-[10px] text-rose-300/80">Loss Contribution</span>`;
      } else {
        pendingHtml = `<span class="font-mono text-xs text-emerald-400 font-semibold">₹0 (Squared)</span>`;
      }

      let statusBadge = '';
      if (isOwed) {
        statusBadge = `
          <div class="flex flex-col items-center">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">Pending Payout</span>
            ${p.lastSettledDate ? `<span class="text-[9px] text-slate-400 font-mono mt-0.5">Last: ${this.formatDateDisplay(p.lastSettledDate)}</span>` : ''}
          </div>
        `;
      } else if (owesYou) {
        statusBadge = `
          <div class="flex flex-col items-center">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">Owes You</span>
            ${p.lastSettledDate ? `<span class="text-[9px] text-slate-400 font-mono mt-0.5">Last: ${this.formatDateDisplay(p.lastSettledDate)}</span>` : ''}
          </div>
        `;
      } else {
        statusBadge = `
          <div class="flex flex-col items-center">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center justify-center gap-1"><i class="fa-solid fa-check"></i> Settled</span>
            ${p.lastSettledDate ? `<span class="text-[10px] text-emerald-400 font-mono mt-0.5 flex items-center gap-1"><i class="fa-regular fa-calendar-check text-[9px]"></i> ${this.formatDateDisplay(p.lastSettledDate)}</span>` : ''}
          </div>
        `;
      }

      let actionBtn = '';
      if (isOwed) {
        actionBtn = `
          <button onclick="App.openSettlePersonModal('${this.escapeHtml(p.name)}')" class="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition" title="Settle payout with date">
            <i class="fa-solid fa-check mr-1"></i> Settle
          </button>
        `;
      } else if (owesYou) {
        actionBtn = `
          <button onclick="App.openSettlePersonModal('${this.escapeHtml(p.name)}')" class="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition" title="Mark ₹${Math.abs(p.totalPending)} as Received / Settled from ${this.escapeHtml(p.name)}">
            <i class="fa-solid fa-hand-holding-dollar mr-1"></i> Collect
          </button>
        `;
      } else {
        actionBtn = `
          <button onclick="App.reopenPersonAcrossAllIpos('${this.escapeHtml(p.name)}')" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-[11px] transition" title="Reopen payouts for this person">
            Reopen
          </button>
        `;
      }

      return `
        <tr class="hover:bg-slate-800/40 transition ${owesYou ? 'bg-rose-950/10' : ''}">
          <!-- Person Name -->
          <td class="py-3 px-3">
            <div class="font-bold text-white text-xs">${this.escapeHtml(p.name)}</div>
          </td>

          <!-- Role -->
          <td class="py-3 px-3">
            <span class="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold uppercase">
              ${Array.from(p.roles).join(', ')}
            </span>
          </td>

          <!-- IPOs Breakdown -->
          <td class="py-3 px-3">
            <div class="flex flex-wrap gap-1 max-w-lg">
              ${ipoPills}
            </div>
          </td>

          <!-- Total Earned -->
          <td class="py-3 px-3 text-right font-mono text-xs ${p.totalEarned < 0 ? 'text-rose-400' : 'text-slate-300'}">
            ${p.totalEarned < 0 ? '-₹' + Math.abs(p.totalEarned).toLocaleString('en-IN') : '₹' + p.totalEarned.toLocaleString('en-IN')}
          </td>

          <!-- Total Settled & Last Date -->
          <td class="py-3 px-3 text-right">
            <div class="font-mono text-xs text-emerald-400 font-bold">₹${p.totalPaid.toLocaleString('en-IN')}</div>
            ${p.lastSettledDate ? `
              <div class="text-[10px] text-emerald-400/80 font-mono mt-0.5 flex items-center justify-end gap-1" title="Last settled on ${this.formatDateDisplay(p.lastSettledDate)}">
                <i class="fa-regular fa-calendar-check text-[9px]"></i> ${this.formatDateDisplay(p.lastSettledDate)}
              </div>
            ` : ''}
          </td>

          <!-- Total Due (Pending) -->
          <td class="py-3 px-3 text-right">
            ${pendingHtml}
          </td>

          <!-- Status & Date -->
          <td class="py-3 px-3 text-center">
            ${statusBadge}
          </td>

          <!-- Actions -->
          <td class="py-3 px-3 text-right">
            <div class="flex items-center justify-end gap-1.5">
              <button onclick="App.shareConsolidatedWhatsAppSlip('${this.escapeHtml(p.name)}')" class="p-1.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30" title="Send Consolidated WhatsApp Slip">
                <i class="fa-brands fa-whatsapp"></i>
              </button>
              ${actionBtn}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  // ==================== SETTLE PERSON MODAL WITH DATE ====================
  openSettlePersonModal(personName) {
    const summary = this.getMasterPeopleSummary();
    const person = summary.find(p => p.name === personName);
    if (!person) return;

    this.state.settlingPersonName = personName;

    document.getElementById('settle-person-modal-name').textContent = personName;

    const isOwed = person.totalPending > 0;
    const owesYou = person.totalPending < 0;

    const lblType = document.getElementById('settle-person-modal-type-label');
    const elAmt = document.getElementById('settle-person-modal-amount');
    const elBtn = document.getElementById('btn-confirm-settle-person');

    if (isOwed) {
      if (lblType) lblType.textContent = 'Net Payout to Person:';
      if (elAmt) {
        elAmt.textContent = '₹' + person.totalPending.toLocaleString('en-IN');
        elAmt.className = 'text-xl font-bold font-mono text-emerald-400';
      }
      if (elBtn) {
        elBtn.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Confirm Payout & Settle';
        elBtn.className = 'px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-md shadow-emerald-600/30 flex items-center gap-1.5';
      }
    } else {
      if (lblType) lblType.textContent = 'Net Recovery from Partner:';
      if (elAmt) {
        elAmt.textContent = 'OWES YOU: ₹' + Math.abs(person.totalPending).toLocaleString('en-IN');
        elAmt.className = 'text-xl font-bold font-mono text-rose-400';
      }
      if (elBtn) {
        elBtn.innerHTML = '<i class="fa-solid fa-hand-holding-dollar mr-1"></i> Confirm Collection & Settle';
        elBtn.className = 'px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition shadow-md shadow-rose-600/30 flex items-center gap-1.5';
      }
    }

    // Pending IPO breakdown
    const pendingItems = person.ipos.filter(it => !it.isPaid);
    const breakdownEl = document.getElementById('settle-person-modal-breakdown');
    if (breakdownEl) {
      breakdownEl.innerHTML = `
        <div class="font-semibold text-slate-300 mb-1">Items being settled (${pendingItems.length}):</div>
        ${pendingItems.map(it => `
          <div class="flex justify-between items-center text-[11px] py-0.5 border-b border-slate-900/60">
            <span><strong class="text-white">${this.escapeHtml(it.ipoName)}</strong> (${it.role}):</span>
            <span class="font-mono font-bold ${it.amount < 0 ? 'text-rose-400' : 'text-emerald-400'}">
              ${it.amount < 0 ? '-₹' + Math.abs(it.amount).toLocaleString('en-IN') : '₹' + it.amount.toLocaleString('en-IN')}
            </span>
          </div>
        `).join('')}
      `;
    }

    // Default settlement date to today
    const dateInput = document.getElementById('settle-person-modal-date');
    if (dateInput) dateInput.value = this.getTodayDateStr();

    this.openModal('modal-settle-person');
  },

  setSettlePersonDateToday() {
    const dateInput = document.getElementById('settle-person-modal-date');
    if (dateInput) dateInput.value = this.getTodayDateStr();
  },

  confirmSettlePersonModal() {
    const personName = this.state.settlingPersonName;
    if (!personName) return;

    const dateInput = document.getElementById('settle-person-modal-date');
    const settleDate = (dateInput && dateInput.value.trim()) || this.getTodayDateStr();

    let count = 0;
    this.state.ipos.forEach(ipo => {
      (ipo.entries || []).forEach(entry => {
        if (entry.panHolder && entry.panHolder.trim() === personName && !entry.isPaidX) {
          entry.isPaidX = true;
          entry.settledDateX = settleDate;
          count++;
        }
        if (entry.middleman && entry.middleman.trim() === personName && !entry.isPaidY) {
          entry.isPaidY = true;
          entry.settledDateY = settleDate;
          count++;
        }
        if (entry.partner && entry.partner.trim() === personName && !entry.isPaidZ) {
          entry.isPaidZ = true;
          entry.settledDateZ = settleDate;
          count++;
        }
      });
    });

    this.saveState();
    this.closeModal('modal-settle-person');
    this.renderAll();
    this.showToast(`Settled ${count} items for "${personName}" on ${this.formatDateDisplay(settleDate)}!`, 'success');
  },

  settlePersonAcrossAllIpos(personName) {
    this.openSettlePersonModal(personName);
  },

  reopenPersonAcrossAllIpos(personName) {
    if (!confirm(`Reopen all payouts for "${personName}" across all IPOs as Pending?`)) return;

    this.state.ipos.forEach(ipo => {
      (ipo.entries || []).forEach(entry => {
        if (entry.panHolder && entry.panHolder.trim() === personName) {
          entry.isPaidX = false;
          entry.settledDateX = null;
        }
        if (entry.middleman && entry.middleman.trim() === personName) {
          entry.isPaidY = false;
          entry.settledDateY = null;
        }
        if (entry.partner && entry.partner.trim() === personName) {
          entry.isPaidZ = false;
          entry.settledDateZ = null;
        }
      });
    });

    this.saveState();
    this.renderAll();
    this.showToast(`Payouts for "${personName}" reopened as Pending`, 'info');
  },

  masterSettleAllGlobal() {
    const summary = this.getMasterPeopleSummary();
    const hasUnsettled = summary.some(p => p.totalPending !== 0);

    if (!hasUnsettled) {
      this.showToast('All payouts & recoveries across all IPOs are already settled!', 'info');
      return;
    }

    const today = this.getTodayDateStr();
    if (!confirm(`Are you sure you want to mark ALL pending payouts and loss recoveries across ALL IPOs as SETTLED today (${this.formatDateDisplay(today)})?`)) return;

    this.state.ipos.forEach(ipo => {
      (ipo.entries || []).forEach(entry => {
        if (!entry.isPaidX) { entry.isPaidX = true; entry.settledDateX = today; }
        if (!entry.isPaidY) { entry.isPaidY = true; entry.settledDateY = today; }
        if (!entry.isPaidZ) { entry.isPaidZ = true; entry.settledDateZ = today; }
      });
    });

    this.saveState();
    this.renderAll();
    this.showToast(`All pending payouts and loss collections marked as SETTLED on ${this.formatDateDisplay(today)}!`, 'success');
  },

  shareConsolidatedWhatsAppSlip(personName) {
    const people = this.getMasterPeopleSummary();
    const person = people.find(p => p.name === personName);
    if (!person) return;

    const ipoLines = [];
    const ipoMap = {};
    person.ipos.forEach(item => {
      if (!ipoMap[item.ipoName]) {
        ipoMap[item.ipoName] = { earned: 0, pending: 0, roles: new Set(), settledDate: null };
      }
      ipoMap[item.ipoName].earned += item.amount;
      if (!item.isPaid) ipoMap[item.ipoName].pending += item.amount;
      else if (item.settledDate) ipoMap[item.ipoName].settledDate = item.settledDate;
      ipoMap[item.ipoName].roles.add(item.role);
    });

    Object.entries(ipoMap).forEach(([ipoName, info]) => {
      const isLoss = info.earned < 0;
      let statusText = '';
      if (info.pending > 0) statusText = `DUE TO PAY ₹${info.pending.toLocaleString('en-IN')}`;
      else if (info.pending < 0) statusText = `OWES YOU ₹${Math.abs(info.pending).toLocaleString('en-IN')}`;
      else statusText = `SETTLED${info.settledDate ? ' on ' + this.formatDateDisplay(info.settledDate) : ''}`;

      const amtFormatted = isLoss 
        ? `-₹${Math.abs(info.earned).toLocaleString('en-IN')} (Loss Contribution)` 
        : `+₹${info.earned.toLocaleString('en-IN')} (Profit Share)`;
      
      ipoLines.push(`• *${ipoName}* (${Array.from(info.roles).join(', ')}): ${amtFormatted} [${statusText}]`);
    });

    let balanceLine = '';
    if (person.totalPending > 0) {
      balanceLine = `• *👉 Net Balance to Pay to ${person.name}:* ₹${person.totalPending.toLocaleString('en-IN')}`;
    } else if (person.totalPending < 0) {
      balanceLine = `• *👉 Net Balance ${person.name} OWES to You:* ₹${Math.abs(person.totalPending).toLocaleString('en-IN')}`;
    } else {
      balanceLine = `• *👉 Net Balance:* ₹0 (ALL SQUARED UP)`;
    }

    const overallStatus = person.totalPending !== 0 
      ? 'PENDING SETTLEMENT' 
      : `ALL SETTLED${person.lastSettledDate ? ' (Settled on ' + this.formatDateDisplay(person.lastSettledDate) + ')' : ''}`;

    const msg = 
      `*Consolidated IPO Settlement Statement*\n` +
      `*Name:* ${person.name}\n\n` +
      `*IPO Breakdown:*\n` +
      ipoLines.join('\n') + `\n\n` +
      `• *Total Net Outcome:* ${person.totalEarned >= 0 ? '+' : '-'}₹${Math.abs(person.totalEarned).toLocaleString('en-IN')}\n` +
      balanceLine + `\n\n` +
      `*Status:* ${overallStatus}`;

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  },

  // ==================== ADD / EDIT SINGLE ALLOTMENT ====================
  setEntryCostMode(mode) {
    const hidden = document.getElementById('entry-cost-mode');
    if (hidden) hidden.value = mode;

    const btnFixed = document.getElementById('entry-cost-mode-fixed');
    const btnVariable = document.getElementById('entry-cost-mode-variable');
    const badge = document.getElementById('entry-cost-mode-badge');
    const helperFixed = document.getElementById('entry-cost-fixed-helper');
    const helperVariable = document.getElementById('entry-cost-variable-helper');
    const costInput = document.getElementById('entry-cost');

    const ipo = this.getActiveIpo();
    const ipoFixedCost = this.getIpoFixedCost(ipo);

    if (mode === 'variable') {
      if (btnVariable) btnVariable.className = 'px-2 py-0.5 rounded font-semibold transition bg-amber-600 text-white shadow-sm flex items-center gap-1';
      if (btnFixed) btnFixed.className = 'px-2 py-0.5 rounded font-medium text-slate-400 hover:text-white transition flex items-center gap-1';
      if (badge) {
        badge.className = 'absolute right-2.5 top-2 text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold font-sans pointer-events-none';
        badge.textContent = 'Variable';
      }
      if (helperFixed) helperFixed.classList.add('hidden');
      if (helperVariable) helperVariable.classList.remove('hidden');
    } else {
      if (btnFixed) btnFixed.className = 'px-2 py-0.5 rounded font-semibold transition bg-indigo-600 text-white shadow-sm flex items-center gap-1';
      if (btnVariable) btnVariable.className = 'px-2 py-0.5 rounded font-medium text-slate-400 hover:text-white transition flex items-center gap-1';
      if (badge) {
        badge.className = 'absolute right-2.5 top-2 text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold font-sans pointer-events-none';
        badge.textContent = 'Fixed';
      }
      if (helperFixed) helperFixed.classList.remove('hidden');
      if (helperVariable) helperVariable.classList.add('hidden');

      if (costInput && (!costInput.value || costInput.value === '0')) {
        costInput.value = ipoFixedCost;
      }
    }

    this.updateEntryCostHint();
    this.recomputeModalPreview();
  },

  updateEntryCostHint() {
    const ipo = this.getActiveIpo();
    const ipoFixedCost = this.getIpoFixedCost(ipo);
    const costInput = document.getElementById('entry-cost');
    const currentVal = parseFloat(costInput?.value) || 0;
    const mode = document.getElementById('entry-cost-mode')?.value || 'fixed';
    const btnSync = document.getElementById('btn-sync-fixed-cost');
    const ipoNameEl = document.getElementById('entry-cost-ipo-name');
    const fixedHintEl = document.getElementById('entry-cost-fixed-hint');

    if (ipoNameEl && ipo) {
      ipoNameEl.textContent = ipo.name;
    }

    if (mode === 'fixed') {
      if (currentVal !== ipoFixedCost && btnSync) {
        btnSync.classList.remove('hidden');
        btnSync.textContent = `Reset to ₹${ipoFixedCost.toLocaleString('en-IN')}`;
      } else if (btnSync) {
        btnSync.classList.add('hidden');
      }

      if (fixedHintEl) {
        fixedHintEl.innerHTML = `<i class="fa-solid fa-circle-check text-[9px] text-indigo-400"></i> Fixed standard lot cost for ${ipo ? this.escapeHtml(ipo.name) : 'IPO'}`;
      }
    }
  },

  applyIpoFixedCostToInput() {
    const ipo = this.getActiveIpo();
    const fixedCost = this.getIpoFixedCost(ipo);
    const costInput = document.getElementById('entry-cost');
    if (costInput) {
      costInput.value = fixedCost;
      this.updateEntryCostHint();
      this.recomputeModalPreview();
      this.showToast(`Applied Fixed IPO cost: ₹${fixedCost.toLocaleString('en-IN')}`, 'info');
    }
  },

  applyVariableLotMultiplier(multiplier) {
    const ipo = this.getActiveIpo();
    const baseLotCost = this.getIpoFixedCost(ipo);
    const costInput = document.getElementById('entry-cost');
    if (costInput) {
      const calculated = Math.round(baseLotCost * multiplier);
      costInput.value = calculated;
      this.updateEntryCostHint();
      this.recomputeModalPreview();
      this.showToast(`Set to ${multiplier} lot${multiplier > 1 ? 's' : ''} (₹${calculated.toLocaleString('en-IN')})`, 'info');
    }
  },

  onEntryCostInput() {
    this.updateEntryCostHint();
    this.recomputeModalPreview();
  },

  setEntrySplitType(type) {
    const hidden = document.getElementById('entry-split-type');
    if (hidden) hidden.value = type;

    const btnPct = document.getElementById('entry-split-type-pct');
    const btnAmt = document.getElementById('entry-split-type-amt');
    const containerPct = document.getElementById('entry-split-pct-container');
    const containerAmt = document.getElementById('entry-split-amt-container');

    if (type === 'amount') {
      if (btnAmt) btnAmt.className = 'px-2.5 py-1 rounded-md font-semibold transition bg-emerald-600 text-white shadow-sm flex items-center gap-1';
      if (btnPct) btnPct.className = 'px-2.5 py-1 rounded-md font-medium text-slate-400 hover:text-white transition flex items-center gap-1';
      if (containerPct) containerPct.classList.add('hidden');
      if (containerAmt) containerAmt.classList.remove('hidden');
    } else {
      if (btnPct) btnPct.className = 'px-2.5 py-1 rounded-md font-semibold transition bg-indigo-600 text-white shadow-sm flex items-center gap-1';
      if (btnAmt) btnAmt.className = 'px-2.5 py-1 rounded-md font-medium text-slate-400 hover:text-white transition flex items-center gap-1';
      if (containerPct) containerPct.classList.remove('hidden');
      if (containerAmt) containerAmt.classList.add('hidden');
    }

    this.recomputeModalPreview();
  },

  openAddEntryModal() {
    this.state.editingEntryId = null;
    document.getElementById('modal-entry-title').innerHTML = '<i class="fa-solid fa-coins text-emerald-400"></i> Add Allotment Split';
    document.getElementById('form-entry').reset();
    document.getElementById('entry-id').value = '';

    this.populateFixedPanDropdown();

    const searchInput = document.getElementById('entry-pan-search-input');
    if (searchInput) searchInput.value = '';
    const searchClear = document.getElementById('entry-pan-search-clear');
    if (searchClear) searchClear.classList.add('hidden');
    this.closeQuickPanDropdown();

    const ipo = this.getActiveIpo();
    const ipoFixedCost = this.getIpoFixedCost(ipo);

    document.getElementById('entry-cost').value = ipoFixedCost;
    this.setEntryCostMode('fixed');

    const cbSaveDefault = document.getElementById('entry-cost-save-ipo-default');
    if (cbSaveDefault) cbSaveDefault.checked = true;

    document.getElementById('entry-sell').value = 18000;
    document.getElementById('entry-pct-x').value = 10;
    document.getElementById('entry-pct-y').value = 10;
    document.getElementById('entry-pct-z').value = 15;

    const elAmtX = document.getElementById('entry-amt-x');
    if (elAmtX) elAmtX.value = 500;
    const elAmtY = document.getElementById('entry-amt-y');
    if (elAmtY) elAmtY.value = 0;
    const elAmtZ = document.getElementById('entry-amt-z');
    if (elAmtZ) elAmtZ.value = 0;
    const elPayLoss = document.getElementById('entry-amt-pay-loss');
    if (elPayLoss) elPayLoss.checked = false;

    this.setEntrySplitType('percentage');

    const cb = document.getElementById('entry-is-settled');
    if (cb) cb.checked = false;
    const dateInput = document.getElementById('entry-settle-date');
    if (dateInput) dateInput.value = '';

    this.recomputeModalPreview();
    this.openModal('modal-entry');
  },

  populateFixedPanDropdown(filterText = '') {
    const select = document.getElementById('entry-select-fixed-pan');
    if (!select) return;

    if (this.state.fixedPans.length === 0) {
      select.innerHTML = '<option value="">-- No PAN Card Holders Saved (Go to "PAN Card Holders" tab to add) --</option>';
      return;
    }

    const q = (filterText || '').toLowerCase().trim();
    const list = !q ? this.state.fixedPans : this.state.fixedPans.filter(p => {
      return (p.code && p.code.toLowerCase().includes(q)) ||
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.middleman && p.middleman.toLowerCase().includes(q)) ||
        (p.partner && p.partner.toLowerCase().includes(q)) ||
        (p.phone && p.phone.includes(q));
    });

    if (list.length === 0) {
      select.innerHTML = '<option value="">-- No holders match your search --</option>';
      return;
    }

    select.innerHTML = '<option value="">-- Choose PAN Card Holder (Auto-fills) --</option>' +
      list.map(p => {
        const ruleTag = p.splitType === 'amount' ? `[Direct ₹${p.amtX !== undefined ? p.amtX : 500}]` : `[${p.pctX !== undefined ? p.pctX : 10}% Split]`;
        const codePrefix = p.code ? `[${p.code}] ` : '';
        return `<option value="${p.id}">${this.escapeHtml(codePrefix + p.name)} ${ruleTag} ${p.middleman ? 'via ' + p.middleman : ''} ${p.partner ? '• ' + p.partner : ''}</option>`;
      }).join('');
  },

  onSelectFixedPanDropdown(panId) {
    if (!panId) return;
    const pan = this.state.fixedPans.find(p => p.id === panId);
    if (!pan) return;

    // Sync search input and clear button
    const searchInput = document.getElementById('entry-pan-search-input');
    if (searchInput) searchInput.value = (pan.code ? `[${pan.code}] ` : '') + pan.name;
    const searchClear = document.getElementById('entry-pan-search-clear');
    if (searchClear) searchClear.classList.remove('hidden');
    this.closeQuickPanDropdown();

    document.getElementById('entry-name-x').value = pan.name || '';
    document.getElementById('entry-name-y').value = pan.middleman || '';
    document.getElementById('entry-name-z').value = pan.partner || '';

    if (pan.splitType === 'amount') {
      const elAmtX = document.getElementById('entry-amt-x');
      if (elAmtX) elAmtX.value = pan.amtX !== undefined ? pan.amtX : 500;
      const elAmtY = document.getElementById('entry-amt-y');
      if (elAmtY) elAmtY.value = pan.amtY !== undefined ? pan.amtY : 0;
      const elAmtZ = document.getElementById('entry-amt-z');
      if (elAmtZ) elAmtZ.value = pan.amtZ !== undefined ? pan.amtZ : 0;
      const elPayLoss = document.getElementById('entry-amt-pay-loss');
      if (elPayLoss) elPayLoss.checked = !!pan.payOnLoss;
      this.setEntrySplitType('amount');
    } else {
      document.getElementById('entry-pct-x').value = pan.pctX !== undefined ? pan.pctX : 10;
      document.getElementById('entry-pct-y').value = pan.pctY !== undefined ? pan.pctY : 10;
      document.getElementById('entry-pct-z').value = pan.pctZ !== undefined ? pan.pctZ : 15;
      this.setEntrySplitType('percentage');
    }

    this.recomputeModalPreview();
    this.showToast(`Auto-filled details for ${pan.name} (${pan.splitType === 'amount' ? 'Direct ₹' : '% Split'})`, 'info');
  },

  // ==================== QUICK PAN SEARCH (BY NAME OR BY CODE) ====================
  openQuickPanDropdown() {
    const listEl = document.getElementById('quick-pan-results-list');
    if (!listEl) return;
    listEl.classList.remove('hidden');
    const query = document.getElementById('entry-pan-search-input')?.value || '';
    this.renderQuickPanSearchResults(query);
  },

  closeQuickPanDropdown() {
    const listEl = document.getElementById('quick-pan-results-list');
    if (listEl) listEl.classList.add('hidden');
    this.state.quickPanActiveIndex = -1;
  },

  onSearchQuickSelectPan(query) {
    const clearBtn = document.getElementById('entry-pan-search-clear');
    if (clearBtn) {
      if (query && query.trim().length > 0) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
    }

    const listEl = document.getElementById('quick-pan-results-list');
    if (listEl) listEl.classList.remove('hidden');

    this.state.quickPanActiveIndex = -1;
    this.renderQuickPanSearchResults(query);
    this.populateFixedPanDropdown(query);
  },

  renderQuickPanSearchResults(query = '') {
    const listEl = document.getElementById('quick-pan-results-list');
    if (!listEl) return;

    if (this.state.fixedPans.length === 0) {
      listEl.innerHTML = `
        <div class="p-4 text-center text-slate-400 text-xs">
          <i class="fa-solid fa-users text-lg mb-1 block opacity-50"></i>
          No PAN card holders saved yet.<br>
          <span class="text-[10px] text-indigo-400 cursor-pointer" onclick="App.closeModal('modal-entry'); App.switchView('fixed-pans'); App.openAddFixedPanModal();">Click here to add PAN card holders</span>
        </div>
      `;
      return;
    }

    const q = (query || '').toLowerCase().trim();
    // Filter by name or code (also checks middleman, partner, phone, or numeric index)
    const matches = this.state.fixedPans.filter((p, index) => {
      if (!q) return true;
      const codeMatch = p.code && p.code.toLowerCase().includes(q);
      const nameMatch = p.name && p.name.toLowerCase().includes(q);
      const middleMatch = p.middleman && p.middleman.toLowerCase().includes(q);
      const partnerMatch = p.partner && p.partner.toLowerCase().includes(q);
      const phoneMatch = p.phone && p.phone.includes(q);
      const indexMatch = q === String(index + 1) || q === `#${index + 1}`;
      return codeMatch || nameMatch || middleMatch || partnerMatch || phoneMatch || indexMatch;
    });

    if (matches.length === 0) {
      listEl.innerHTML = `
        <div class="p-4 text-center text-slate-400 text-xs">
          <i class="fa-solid fa-magnifying-glass text-lg mb-1 block opacity-40"></i>
          No PAN card holders found matching <strong class="text-white font-mono">"${this.escapeHtml(query)}"</strong>.<br>
          <span class="text-[10px] text-slate-500">Search by holder name (e.g. Ramesh) or code (e.g. H01)</span>
        </div>
      `;
      return;
    }

    const currentSelectVal = document.getElementById('entry-select-fixed-pan')?.value;

    listEl.innerHTML = matches.map((p, idx) => {
      const isSelected = p.id === currentSelectVal || idx === this.state.quickPanActiveIndex;
      const ruleTag = p.splitType === 'amount'
        ? `<span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Direct ₹${(p.amtX !== undefined ? p.amtX : 500).toLocaleString('en-IN')}</span>`
        : `<span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">${p.pctX !== undefined ? p.pctX : 10}% Split</span>`;

      const codeBadge = p.code
        ? `<span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">${this.escapeHtml(p.code)}</span>`
        : `<span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">#${this.state.fixedPans.indexOf(p) + 1}</span>`;

      return `
        <div class="quick-pan-item p-2.5 hover:bg-slate-800/80 cursor-pointer transition flex items-center justify-between gap-2 ${isSelected ? 'bg-indigo-950/70 border-l-2 border-indigo-500' : ''}"
             data-id="${p.id}"
             data-index="${idx}"
             onmousedown="App.selectQuickPanHolder('${p.id}')">
          <div class="flex items-center gap-2.5 min-w-0">
            ${codeBadge}
            <div class="truncate">
              <div class="font-bold text-white text-xs truncate">${this.escapeHtml(p.name)}</div>
              <div class="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                ${p.middleman ? `<span class="text-amber-300">via ${this.escapeHtml(p.middleman)}</span>` : '<span class="text-slate-500">Direct</span>'}
                ${p.partner ? `<span class="text-purple-300">• ${this.escapeHtml(p.partner)}</span>` : ''}
                ${p.phone ? `<span class="text-slate-500">• ${this.escapeHtml(p.phone)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="shrink-0 text-right">
            ${ruleTag}
          </div>
        </div>
      `;
    }).join('');
  },

  onQuickPanKeydown(event) {
    const listEl = document.getElementById('quick-pan-results-list');
    const items = listEl ? listEl.querySelectorAll('.quick-pan-item') : [];

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!listEl || listEl.classList.contains('hidden')) {
        this.openQuickPanDropdown();
        return;
      }
      if (items.length > 0) {
        this.state.quickPanActiveIndex = Math.min(this.state.quickPanActiveIndex + 1, items.length - 1);
        this.updateQuickPanHighlight(items);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length > 0) {
        this.state.quickPanActiveIndex = Math.max(this.state.quickPanActiveIndex - 1, 0);
        this.updateQuickPanHighlight(items);
      }
    } else if (event.key === 'Enter') {
      event.preventDefault(); // Prevent modal form submission
      if (items.length > 0) {
        const targetIndex = this.state.quickPanActiveIndex >= 0 ? this.state.quickPanActiveIndex : 0;
        const targetItem = items[targetIndex];
        if (targetItem) {
          const panId = targetItem.getAttribute('data-id');
          if (panId) this.selectQuickPanHolder(panId);
        }
      }
    } else if (event.key === 'Escape') {
      this.closeQuickPanDropdown();
    }
  },

  updateQuickPanHighlight(items) {
    items.forEach((item, idx) => {
      if (idx === this.state.quickPanActiveIndex) {
        item.classList.add('bg-indigo-950/70', 'border-l-2', 'border-indigo-500');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('bg-indigo-950/70', 'border-l-2', 'border-indigo-500');
      }
    });
  },

  selectQuickPanHolder(panId) {
    const pan = this.state.fixedPans.find(p => p.id === panId);
    if (!pan) return;

    const select = document.getElementById('entry-select-fixed-pan');
    if (select) select.value = panId;

    const searchInput = document.getElementById('entry-pan-search-input');
    if (searchInput) searchInput.value = (pan.code ? `[${pan.code}] ` : '') + pan.name;

    const clearBtn = document.getElementById('entry-pan-search-clear');
    if (clearBtn) clearBtn.classList.remove('hidden');

    this.closeQuickPanDropdown();
    this.onSelectFixedPanDropdown(panId);
  },

  clearQuickPanSearch() {
    const searchInput = document.getElementById('entry-pan-search-input');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    const clearBtn = document.getElementById('entry-pan-search-clear');
    if (clearBtn) clearBtn.classList.add('hidden');

    this.populateFixedPanDropdown('');
    const select = document.getElementById('entry-select-fixed-pan');
    if (select) select.value = '';

    this.state.quickPanActiveIndex = -1;
    this.openQuickPanDropdown();
  },

  openEditEntryModal(entryId) {
    const ipo = this.getActiveIpo();
    if (!ipo) return;

    const entry = ipo.entries.find(e => e.id === entryId);
    if (!entry) return;

    this.state.editingEntryId = entryId;
    document.getElementById('modal-entry-title').innerHTML = '<i class="fa-solid fa-pen-to-square text-indigo-400"></i> Edit Allotment Split';

    this.populateFixedPanDropdown();

    // Sync Quick Pan search box if entry holder matches a saved PAN holder
    const searchInput = document.getElementById('entry-pan-search-input');
    const searchClear = document.getElementById('entry-pan-search-clear');
    const matchedPan = this.state.fixedPans.find(p => p.name && p.name.toLowerCase() === (entry.panHolder || '').toLowerCase());
    if (matchedPan) {
      if (searchInput) searchInput.value = (matchedPan.code ? `[${matchedPan.code}] ` : '') + matchedPan.name;
      if (searchClear) searchClear.classList.remove('hidden');
      const select = document.getElementById('entry-select-fixed-pan');
      if (select) select.value = matchedPan.id;
    } else {
      if (searchInput) searchInput.value = '';
      if (searchClear) searchClear.classList.add('hidden');
    }
    this.closeQuickPanDropdown();

    document.getElementById('entry-id').value = entry.id;
    document.getElementById('entry-name-x').value = entry.panHolder || '';
    document.getElementById('entry-name-y').value = entry.middleman || '';
    document.getElementById('entry-name-z').value = entry.partner || '';

    const ipoFixedCost = this.getIpoFixedCost(ipo);
    const entryCost = entry.cost !== undefined ? entry.cost : ipoFixedCost;
    document.getElementById('entry-cost').value = entryCost;
    const costType = entry.costType || (entryCost === ipoFixedCost ? 'fixed' : 'variable');
    this.setEntryCostMode(costType);

    const cbSaveDefault = document.getElementById('entry-cost-save-ipo-default');
    if (cbSaveDefault) cbSaveDefault.checked = false;

    document.getElementById('entry-sell').value = entry.sell !== undefined ? entry.sell : 18000;
    document.getElementById('entry-pct-x').value = entry.pctX !== undefined ? entry.pctX : 10;
    document.getElementById('entry-pct-y').value = entry.pctY !== undefined ? entry.pctY : 10;
    document.getElementById('entry-pct-z').value = entry.pctZ !== undefined ? entry.pctZ : 15;

    const elAmtX = document.getElementById('entry-amt-x');
    if (elAmtX) elAmtX.value = entry.amtX !== undefined ? entry.amtX : (entry.splitType === 'amount' ? entry.cutX : 500);
    const elAmtY = document.getElementById('entry-amt-y');
    if (elAmtY) elAmtY.value = entry.amtY !== undefined ? entry.amtY : (entry.splitType === 'amount' ? entry.cutY : 0);
    const elAmtZ = document.getElementById('entry-amt-z');
    if (elAmtZ) elAmtZ.value = entry.amtZ !== undefined ? entry.amtZ : (entry.splitType === 'amount' ? entry.cutZ : 0);
    const elPayLoss = document.getElementById('entry-amt-pay-loss');
    if (elPayLoss) elPayLoss.checked = !!entry.payOnLoss;

    this.setEntrySplitType(entry.splitType === 'amount' ? 'amount' : 'percentage');

    const isSettled = !entry.isLoss ? !!entry.isPaidX : !!entry.isPaidZ;
    const sDate = (!entry.isLoss ? entry.settledDateX : entry.settledDateZ) || '';
    const cb = document.getElementById('entry-is-settled');
    if (cb) cb.checked = isSettled;
    const dateInput = document.getElementById('entry-settle-date');
    if (dateInput) dateInput.value = sDate || (isSettled ? this.getTodayDateStr() : '');

    this.recomputeModalPreview();
    this.openModal('modal-entry');
  },

  onEntrySettleCheckboxChange() {
    const cb = document.getElementById('entry-is-settled');
    const dateInput = document.getElementById('entry-settle-date');
    if (cb && dateInput) {
      if (cb.checked && !dateInput.value) {
        dateInput.value = this.getTodayDateStr();
      } else if (!cb.checked) {
        dateInput.value = '';
      }
    }
  },

  // Auto Replaces Names in Live Preview as user types (Handles Profit & Loss, Percentage & Direct Amount)
  recomputeModalPreview() {
    const cost = parseFloat(document.getElementById('entry-cost')?.value) || 0;
    const sell = parseFloat(document.getElementById('entry-sell')?.value) || 0;
    const splitType = document.getElementById('entry-split-type')?.value || 'percentage';

    const pctX = parseFloat(document.getElementById('entry-pct-x')?.value) || 0;
    const pctY = parseFloat(document.getElementById('entry-pct-y')?.value) || 0;
    const pctZ = parseFloat(document.getElementById('entry-pct-z')?.value) || 0;

    const amtX = parseFloat(document.getElementById('entry-amt-x')?.value) || 0;
    const amtY = parseFloat(document.getElementById('entry-amt-y')?.value) || 0;
    const amtZ = parseFloat(document.getElementById('entry-amt-z')?.value) || 0;
    const payOnLoss = document.getElementById('entry-amt-pay-loss')?.checked || false;

    const nameX = document.getElementById('entry-name-x')?.value.trim() || 'Holder';
    const nameY = document.getElementById('entry-name-y')?.value.trim() || '';
    const nameZ = document.getElementById('entry-name-z')?.value.trim() || '';

    const hasY = !!nameY;
    const hasZ = !!nameZ;

    const elHintX = document.getElementById('entry-pct-x-hint');
    const elHintY = document.getElementById('entry-pct-y-hint');
    const elHintZ = document.getElementById('entry-pct-z-hint');
    if (elHintX) elHintX.textContent = `${pctX}% of profit`;
    if (elHintY) elHintY.textContent = `${pctY}% of holder`;
    if (elHintZ) elHintZ.textContent = `${pctZ}% of remaining`;

    const res = this.calculateSplit(cost, sell, pctX, pctY, pctZ, hasY, hasZ, splitType, amtX, amtY, amtZ, payOnLoss);

    const elProfitLabel = document.getElementById('modal-preview-profit-label');
    const elProfit = document.getElementById('modal-preview-profit');
    const elNameX = document.getElementById('modal-preview-name-x');
    const elLabelX = document.getElementById('modal-preview-label-x');
    const elCutX = document.getElementById('modal-preview-cut-x');

    const elRowY = document.getElementById('modal-preview-row-y');
    const elNameY = document.getElementById('modal-preview-name-y');
    const elLabelY = document.getElementById('modal-preview-label-y');
    const elCutY = document.getElementById('modal-preview-cut-y');

    const elRowZ = document.getElementById('modal-preview-row-z');
    const elNameZ = document.getElementById('modal-preview-name-z');
    const elLabelZ = document.getElementById('modal-preview-label-z');
    const elCutZ = document.getElementById('modal-preview-cut-z');

    const elRowA = document.getElementById('modal-preview-row-a');
    const elLabelA = document.getElementById('modal-preview-label-a');
    const elCutA = document.getElementById('modal-preview-cut-a');

    if (!res.isLoss) {
      if (elProfitLabel) elProfitLabel.textContent = 'Total Profit:';
      if (elProfit) {
        elProfit.className = 'text-base font-bold text-cyan-400 font-mono';
        elProfit.textContent = '₹' + res.profit.toLocaleString('en-IN');
      }

      if (elNameX) elNameX.textContent = nameX;
      if (elLabelX) {
        elLabelX.textContent = splitType === 'amount'
          ? `Direct Fixed Amount`
          : `${pctX}% of profit (₹${res.profit.toLocaleString('en-IN')})`;
      }
      if (elCutX) {
        elCutX.className = 'font-bold text-purple-300 font-mono';
        elCutX.textContent = '₹' + res.cutX.toLocaleString('en-IN');
      }

      if (hasY) {
        if (elRowY) elRowY.style.display = 'flex';
        if (elNameY) elNameY.textContent = nameY;
        if (elLabelY) {
          elLabelY.textContent = splitType === 'amount'
            ? `Direct Fixed Amount`
            : `${pctY}% of ${nameX} (₹${res.cutX})`;
        }
        if (elCutY) elCutY.textContent = '₹' + res.cutY.toLocaleString('en-IN');
      } else {
        if (elRowY) elRowY.style.display = 'none';
      }

      if (hasZ) {
        if (elRowZ) elRowZ.style.display = 'flex';
        if (elNameZ) elNameZ.textContent = nameZ;
        if (elLabelZ) {
          elLabelZ.textContent = splitType === 'amount'
            ? `Direct Fixed Amount`
            : `${pctZ}% of remaining (₹${res.remainingAfterXY.toLocaleString('en-IN')})`;
        }
        if (elCutZ) {
          elCutZ.className = 'font-bold text-amber-300 font-mono';
          elCutZ.textContent = '₹' + res.cutZ.toLocaleString('en-IN');
        }
      } else {
        if (elRowZ) elRowZ.style.display = 'none';
      }

      if (elRowA) elRowA.className = 'flex justify-between items-center text-emerald-400 font-bold pt-2 border-t border-slate-800';
      if (elLabelA) {
        elLabelA.innerHTML = splitType === 'amount'
          ? 'Your Net Profit: <span class="text-xs text-emerald-300/80 font-normal">Profit - Direct Payouts</span>'
          : 'Your Net Profit: <span class="text-xs text-emerald-300/80 font-normal">The Rest Amount</span>';
      }
      if (elCutA) {
        elCutA.className = 'text-base font-mono ' + (res.cutA >= 0 ? 'text-emerald-400' : 'text-rose-400 font-bold');
        elCutA.textContent = (res.cutA >= 0 ? '₹' : '-₹') + Math.abs(res.cutA).toLocaleString('en-IN');
      }
    } else {
      // LOSS PREVIEW
      if (elProfitLabel) elProfitLabel.textContent = 'Total Loss:';
      if (elProfit) {
        elProfit.className = 'text-base font-bold text-rose-400 font-mono';
        elProfit.textContent = '-₹' + res.loss.toLocaleString('en-IN') + ' (Loss)';
      }

      if (elNameX) elNameX.textContent = nameX;

      if (splitType === 'amount') {
        if (payOnLoss) {
          if (elLabelX) elLabelX.textContent = 'Fixed amount paid on loss';
          if (elCutX) {
            elCutX.className = 'font-mono text-purple-300 font-bold';
            elCutX.textContent = '₹' + res.cutX.toLocaleString('en-IN');
          }
        } else {
          if (elLabelX) elLabelX.textContent = 'No payout on loss (₹0)';
          if (elCutX) {
            elCutX.className = 'font-mono text-slate-500';
            elCutX.textContent = '₹0';
          }
        }

        if (hasY) {
          if (elRowY) elRowY.style.display = 'flex';
          if (elNameY) elNameY.textContent = nameY;
          if (payOnLoss) {
            if (elLabelY) elLabelY.textContent = 'Fixed amount paid on loss';
            if (elCutY) elCutY.textContent = '₹' + res.cutY.toLocaleString('en-IN');
          } else {
            if (elLabelY) elLabelY.textContent = 'No payout on loss';
            if (elCutY) elCutY.textContent = '₹0';
          }
        } else {
          if (elRowY) elRowY.style.display = 'none';
        }

        if (hasZ) {
          if (elRowZ) elRowZ.style.display = 'flex';
          if (elNameZ) elNameZ.textContent = nameZ;
          if (payOnLoss) {
            if (elLabelZ) elLabelZ.textContent = 'Fixed amount paid on loss';
            if (elCutZ) elCutZ.textContent = '₹' + res.cutZ.toLocaleString('en-IN');
          } else {
            if (elLabelZ) elLabelZ.textContent = 'No payout on loss';
            if (elCutZ) elCutZ.textContent = '₹0';
          }
        } else {
          if (elRowZ) elRowZ.style.display = 'none';
        }

        if (elRowA) elRowA.className = 'flex justify-between items-center text-rose-400 font-bold pt-2 border-t border-slate-800';
        if (elLabelA) elLabelA.innerHTML = 'Your Net Loss: <span class="text-xs text-rose-300/80 font-normal">' + (payOnLoss ? 'Loss + Fixed Fees' : 'Total Loss') + '</span>';
        if (elCutA) {
          elCutA.className = 'text-base font-mono text-rose-400 font-bold';
          elCutA.textContent = '-₹' + Math.abs(res.cutA).toLocaleString('en-IN');
        }
      } else {
        // Percentage loss mode
        if (elLabelX) elLabelX.textContent = 'No payout on loss';
        if (elCutX) {
          elCutX.className = 'font-mono text-slate-500';
          elCutX.textContent = '₹0';
        }

        if (elRowY) elRowY.style.display = 'none';

        if (hasZ) {
          if (elRowZ) elRowZ.style.display = 'flex';
          if (elNameZ) elNameZ.textContent = nameZ;
          if (elLabelZ) elLabelZ.textContent = `${pctZ}% of total loss (${nameZ} pays you)`;
          if (elCutZ) {
            elCutZ.className = 'font-bold text-rose-400 font-mono';
            elCutZ.textContent = `OWES YOU: ₹${res.partnerOwes.toLocaleString('en-IN')}`;
          }
        } else {
          if (elRowZ) elRowZ.style.display = 'none';
        }

        if (elRowA) elRowA.className = 'flex justify-between items-center text-rose-400 font-bold pt-2 border-t border-slate-800';
        if (elLabelA) elLabelA.innerHTML = 'Your Net Loss: <span class="text-xs text-rose-300/80 font-normal">Rest of Loss</span>';
        if (elCutA) {
          elCutA.className = 'text-base font-mono text-rose-400 font-bold';
          elCutA.textContent = '-₹' + Math.abs(res.cutA).toLocaleString('en-IN');
        }
      }
    }
  },

  saveEntry(e) {
    e.preventDefault();
    const ipo = this.getActiveIpo();
    if (!ipo) return;

    const id = document.getElementById('entry-id').value || 'entry_' + Date.now();
    const panHolder = document.getElementById('entry-name-x').value.trim();
    const middleman = document.getElementById('entry-name-y').value.trim();
    const partner = document.getElementById('entry-name-z').value.trim();

    const costInput = document.getElementById('entry-cost');
    const sellInput = document.getElementById('entry-sell');
    const cost = parseFloat(costInput?.value);
    const sell = parseFloat(sellInput?.value);

    if (isNaN(cost)) {
      this.showToast('Please enter a valid Applied / Bought At amount', 'error');
      costInput?.focus();
      return;
    }

    if (isNaN(sell)) {
      this.showToast('Please enter a valid Sold Lot At amount', 'error');
      sellInput?.focus();
      return;
    }

    const costType = document.getElementById('entry-cost-mode')?.value || 'fixed';
    const cbSaveDefault = document.getElementById('entry-cost-save-ipo-default');
    if (costType === 'fixed' && cbSaveDefault && cbSaveDefault.checked) {
      ipo.fixedCost = cost;
    }

    const splitType = document.getElementById('entry-split-type')?.value || 'percentage';

    const pctX = parseFloat(document.getElementById('entry-pct-x').value) || 0;
    const pctY = parseFloat(document.getElementById('entry-pct-y').value) || 0;
    const pctZ = parseFloat(document.getElementById('entry-pct-z').value) || 0;

    const amtX = parseFloat(document.getElementById('entry-amt-x')?.value) || 0;
    const amtY = parseFloat(document.getElementById('entry-amt-y')?.value) || 0;
    const amtZ = parseFloat(document.getElementById('entry-amt-z')?.value) || 0;
    const payOnLoss = document.getElementById('entry-amt-pay-loss')?.checked || false;

    const res = this.calculateSplit(cost, sell, pctX, pctY, pctZ, !!middleman, !!partner, splitType, amtX, amtY, amtZ, payOnLoss);

    const cbSettled = document.getElementById('entry-is-settled');
    const dateInput = document.getElementById('entry-settle-date');
    const isSettled = cbSettled ? cbSettled.checked : false;
    let settleDate = dateInput ? dateInput.value.trim() : '';
    if (isSettled && !settleDate) settleDate = this.getTodayDateStr();
    if (!isSettled) settleDate = null;

    const entryObj = {
      id,
      panHolder,
      middleman,
      partner,
      cost,
      costType,
      sell,
      splitType,
      pctX,
      pctY,
      pctZ,
      amtX,
      amtY,
      amtZ,
      payOnLoss,
      isLoss: res.isLoss,
      profit: res.profit,
      loss: res.loss,
      cutX: res.cutX,
      cutY: res.cutY,
      cutZ: res.cutZ,
      cutA: res.cutA,
      partnerOwes: res.partnerOwes,
      isPaidX: isSettled,
      isPaidY: isSettled,
      isPaidZ: isSettled,
      settledDateX: isSettled ? settleDate : null,
      settledDateY: isSettled ? settleDate : null,
      settledDateZ: isSettled ? settleDate : null,
      updatedAt: new Date().toISOString()
    };

    if (!ipo.entries) ipo.entries = [];

    const existingIdx = ipo.entries.findIndex(item => item.id === id);
    if (existingIdx >= 0) {
      ipo.entries[existingIdx] = entryObj;
      this.showToast('Allotment split updated', 'success');
    } else {
      ipo.entries.unshift(entryObj);
      if (!res.isLoss) {
        this.showToast(`Saved! Your share is ₹${res.cutA.toLocaleString('en-IN')}`, 'success');
      } else {
        this.showToast(`Recorded loss. Partner pays you ₹${res.partnerOwes.toLocaleString('en-IN')}`, 'info');
      }
    }

    this.saveState();
    this.closeModal('modal-entry');
    this.renderAll();
  },

  deleteEntry(entryId) {
    const ipo = this.getActiveIpo();
    if (!ipo) return;

    if (!confirm('Delete this split entry?')) return;
    ipo.entries = ipo.entries.filter(e => e.id !== entryId);
    this.saveState();
    this.renderAll();
    this.showToast('Entry removed', 'info');
  },

  togglePaidStatus(entryId) {
    const ipo = this.getActiveIpo();
    if (!ipo) return;

    const entry = ipo.entries.find(e => e.id === entryId);
    if (!entry) return;

    const newStatus = !entry.isPaidX;
    const today = this.getTodayDateStr();

    entry.isPaidX = newStatus;
    entry.settledDateX = newStatus ? (entry.settledDateX || today) : null;

    entry.isPaidY = newStatus;
    entry.settledDateY = newStatus ? (entry.settledDateY || today) : null;

    entry.isPaidZ = newStatus;
    entry.settledDateZ = newStatus ? (entry.settledDateZ || today) : null;

    this.saveState();
    this.renderAll();
    this.showToast(newStatus ? `Marked as Settled on ${this.formatDateDisplay(today)}` : 'Marked as Pending', 'info');
  },

  // Quick Edit Settlement Date Modal (Single Entry)
  openEditDateModal(entryId) {
    const ipo = this.getActiveIpo();
    if (!ipo) return;

    const entry = ipo.entries.find(e => e.id === entryId);
    if (!entry) return;

    this.state.editingDateEntryId = entryId;

    document.getElementById('edit-date-modal-name').textContent = entry.panHolder || 'Allotment';
    document.getElementById('edit-date-modal-ipo').textContent = ipo.name;

    const currentDate = (!entry.isLoss ? entry.settledDateX : entry.settledDateZ) || this.getTodayDateStr();
    document.getElementById('edit-date-modal-input').value = currentDate;

    this.openModal('modal-edit-date');
  },

  setEditDateModalToday() {
    document.getElementById('edit-date-modal-input').value = this.getTodayDateStr();
  },

  saveEditDateModal() {
    const ipo = this.getActiveIpo();
    if (!ipo) return;

    const entry = ipo.entries.find(e => e.id === this.state.editingDateEntryId);
    if (!entry) return;

    const newDate = document.getElementById('edit-date-modal-input').value.trim() || this.getTodayDateStr();

    entry.isPaidX = true;
    entry.settledDateX = newDate;

    if (entry.middleman) {
      entry.isPaidY = true;
      entry.settledDateY = newDate;
    }

    if (entry.partner) {
      entry.isPaidZ = true;
      entry.settledDateZ = newDate;
    }

    this.saveState();
    this.closeModal('modal-edit-date');
    this.renderAll();
    this.showToast(`Settlement date updated to ${this.formatDateDisplay(newDate)}!`, 'success');
  },

  markEntryPendingFromDateModal() {
    const ipo = this.getActiveIpo();
    if (!ipo) return;

    const entry = ipo.entries.find(e => e.id === this.state.editingDateEntryId);
    if (!entry) return;

    entry.isPaidX = false;
    entry.settledDateX = null;
    entry.isPaidY = false;
    entry.settledDateY = null;
    entry.isPaidZ = false;
    entry.settledDateZ = null;

    this.saveState();
    this.closeModal('modal-edit-date');
    this.renderAll();
    this.showToast('Marked as Pending', 'info');
  },

  shareWhatsAppSlip(entryId) {
    const ipo = this.getActiveIpo();
    if (!ipo) return;

    const e = ipo.entries.find(item => item.id === entryId);
    if (!e) return;

    const isLoss = (e.sell || 0) < (e.cost || 0);

    let msg = '';
    const costTag = e.costType === 'variable' ? ' (Variable)' : ' (Fixed)';
    if (!isLoss) {
      const sDateText = e.isPaidX ? `SETTLED (Date: ${this.formatDateDisplay(e.settledDateX) || 'Today'})` : 'PENDING PAYMENT';
      const holderTag = e.splitType === 'amount' ? 'Direct Amount' : `${e.pctX}%`;
      const middlemanTag = e.splitType === 'amount' ? 'Direct Amount' : `${e.pctY}% of ${e.panHolder}`;
      const partnerTag = e.splitType === 'amount' ? 'Direct Amount' : `${e.pctZ}% of remaining`;

      msg = 
        `*IPO Profit Settlement Summary*\n\n` +
        `• *IPO:* ${ipo.name}\n` +
        `• *Holder:* ${e.panHolder}\n` +
        `• *Applied:* ₹${e.cost.toLocaleString('en-IN')}${costTag} | *Sold:* ₹${e.sell.toLocaleString('en-IN')}\n` +
        `• *Total Profit:* ₹${e.profit.toLocaleString('en-IN')}\n\n` +
        `*Distribution Breakdown:*\n` +
        `1. *${e.panHolder}:* ₹${e.cutX.toLocaleString('en-IN')} (${holderTag})\n` +
        (e.middleman ? `2. *${e.middleman}:* ₹${e.cutY.toLocaleString('en-IN')} (${middlemanTag})\n` : '') +
        (e.partner ? `3. *${e.partner}:* ₹${e.cutZ.toLocaleString('en-IN')} (${partnerTag})\n` : '') +
        `4. *Your Net Profit:* ₹${e.cutA.toLocaleString('en-IN')}\n\n` +
        `*Status:* ${sDateText}`;
    } else {
      const lossAmt = Math.abs((e.sell || 0) - (e.cost || 0));
      const partnerLoss = e.partnerOwes || Math.abs(e.cutZ || 0);
      const sDateText = e.isPaidZ ? `SETTLED / COLLECTED (Date: ${this.formatDateDisplay(e.settledDateZ) || 'Today'})` : 'PENDING COLLECTION FROM PARTNER';
      msg = 
        `*IPO Settlement Statement (Loss Sharing)*\n\n` +
        `• *IPO:* ${ipo.name}\n` +
        `• *Holder:* ${e.panHolder}\n` +
        `• *Applied:* ₹${e.cost.toLocaleString('en-IN')}${costTag} | *Sold:* ₹${e.sell.toLocaleString('en-IN')}\n` +
        `• *Total Loss:* -₹${lossAmt.toLocaleString('en-IN')}\n\n` +
        `*Loss Distribution:*\n` +
        `1. *${e.panHolder}:* ${e.cutX > 0 ? `₹${e.cutX.toLocaleString('en-IN')} (Direct Paid)` : '₹0 (No payout on loss)'}\n` +
        (e.middleman && e.cutY > 0 ? `2. *${e.middleman}:* ₹${e.cutY.toLocaleString('en-IN')} (Direct Paid)\n` : '') +
        (e.partner ? `• *${e.partner}:* PAYS YOU ₹${partnerLoss.toLocaleString('en-IN')} ${e.splitType === 'amount' ? '' : `(${e.pctZ}% of loss)`}\n` : '') +
        `• *Your Net Loss:* -₹${Math.abs(e.cutA).toLocaleString('en-IN')} (Rest of loss)\n\n` +
        `*Status:* ${sDateText}`;
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  },

  // ==================== BULK IMPORT PAN CARD HOLDERS TO IPO ====================
  openBulkImportModal() {
    const ipo = this.getActiveIpo();
    if (!ipo) return;

    document.getElementById('bulk-modal-ipo-subtitle').textContent = `Adding PAN card holders to ${ipo.name}`;

    const bulkCostInput = document.getElementById('bulk-apply-cost');
    if (bulkCostInput) bulkCostInput.value = this.getIpoFixedCost(ipo);

    const searchInput = document.getElementById('bulk-pans-search');
    if (searchInput) searchInput.value = '';

    const container = document.getElementById('bulk-pans-checkboxes-container');
    if (!container) return;

    if (this.state.fixedPans.length === 0) {
      container.innerHTML = `
        <div class="p-6 text-center text-xs text-slate-500">
          No PAN card holders saved yet.<br>
          Switch to <strong class="text-indigo-400 cursor-pointer" onclick="App.closeModal('modal-bulk-import'); App.switchView('fixed-pans');">"PAN Card Holders"</strong> to add names!
        </div>
      `;
    } else {
      container.innerHTML = this.state.fixedPans.map(p => {
        const ruleTag = p.splitType === 'amount' ? `[Direct ₹${p.amtX !== undefined ? p.amtX : 500}]` : `[${p.pctX !== undefined ? p.pctX : 10}% Split]`;
        const codeBadge = p.code ? `<span class="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[10px] border border-indigo-500/30 font-bold mr-1.5">${this.escapeHtml(p.code)}</span>` : '';
        return `
        <label class="bulk-pan-item flex items-center justify-between p-2.5 hover:bg-slate-900 rounded-lg cursor-pointer transition" data-name="${(p.name || '').toLowerCase()}" data-code="${(p.code || '').toLowerCase()}">
          <div class="flex items-center gap-3">
            <input type="checkbox" class="bulk-pan-select-cb rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0" value="${p.id}" checked>
            <div>
              <div class="font-bold text-white text-xs">${codeBadge}${this.escapeHtml(p.name)} <span class="text-[10px] text-indigo-400 font-normal ml-1">${ruleTag}</span></div>
              ${p.phone ? `<div class="text-[11px] text-slate-400">${p.phone}</div>` : ''}
            </div>
          </div>
          <div class="text-right text-[11px]">
            ${p.middleman ? `<span class="text-amber-400 font-semibold">${this.escapeHtml(p.middleman)}</span>` : '<span class="text-slate-500">Direct</span>'}
            ${p.partner ? `<span class="text-purple-400 font-semibold ml-2">• ${this.escapeHtml(p.partner)}</span>` : ''}
          </div>
        </label>
      `;
      }).join('');
    }

    this.openModal('modal-bulk-import');
  },

  filterBulkPansCheckboxes(query) {
    const q = (query || '').toLowerCase().trim();
    const items = document.querySelectorAll('.bulk-pan-item');
    items.forEach(el => {
      const name = el.getAttribute('data-name') || '';
      const code = el.getAttribute('data-code') || '';
      if (!q || name.includes(q) || code.includes(q)) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });
  },

  toggleAllBulkCheckboxes(selectAll) {
    const checkboxes = document.querySelectorAll('.bulk-pan-select-cb');
    checkboxes.forEach(cb => cb.checked = selectAll);
  },

  confirmBulkAddPans() {
    const ipo = this.getActiveIpo();
    if (!ipo) return;

    const checkedBoxes = document.querySelectorAll('.bulk-pan-select-cb:checked');
    if (checkedBoxes.length === 0) {
      this.showToast('Please select at least one person', 'error');
      return;
    }

    const costInput = document.getElementById('bulk-apply-cost');
    const sellInput = document.getElementById('bulk-sell-price');
    const cost = parseFloat(costInput?.value);
    const sell = parseFloat(sellInput?.value);

    if (isNaN(cost)) {
      this.showToast('Please enter a valid Applied Cost per Person', 'error');
      costInput?.focus();
      return;
    }

    if (isNaN(sell)) {
      this.showToast('Please enter a valid Sold Lot Value per Person', 'error');
      sellInput?.focus();
      return;
    }

    let addedCount = 0;

    checkedBoxes.forEach(cb => {
      const panId = cb.value;
      const pan = this.state.fixedPans.find(p => p.id === panId);
      if (!pan) return;

      const splitType = pan.splitType || 'percentage';
      const pctX = pan.pctX !== undefined ? pan.pctX : 10;
      const pctY = pan.pctY !== undefined ? pan.pctY : 10;
      const pctZ = pan.pctZ !== undefined ? pan.pctZ : 15;
      const amtX = pan.amtX !== undefined ? pan.amtX : 500;
      const amtY = pan.amtY !== undefined ? pan.amtY : 0;
      const amtZ = pan.amtZ !== undefined ? pan.amtZ : 0;
      const payOnLoss = !!pan.payOnLoss;

      const res = this.calculateSplit(cost, sell, pctX, pctY, pctZ, !!pan.middleman, !!pan.partner, splitType, amtX, amtY, amtZ, payOnLoss);

      ipo.entries.unshift({
        id: 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        panHolder: pan.name,
        middleman: pan.middleman || '',
        partner: pan.partner || '',
        cost,
        costType: 'fixed',
        sell,
        splitType,
        pctX,
        pctY,
        pctZ,
        amtX,
        amtY,
        amtZ,
        payOnLoss,
        isLoss: res.isLoss,
        profit: res.profit,
        loss: res.loss,
        cutX: res.cutX,
        cutY: res.cutY,
        cutZ: res.cutZ,
        cutA: res.cutA,
        partnerOwes: res.partnerOwes,
        isPaidX: false,
        isPaidY: false,
        isPaidZ: false,
        createdAt: new Date().toISOString()
      });
      addedCount++;
    });

    this.saveState();
    this.closeModal('modal-bulk-import');
    this.renderAll();
    this.showToast(`Added ${addedCount} allotments to ${ipo.name}!`, 'success');
  },

  // ==================== LIVE CALCULATOR (HANDLES PROFIT & LOSS, PERCENTAGE & DIRECT AMOUNT) ====================
  openCalculatorModal() {
    this.setCalcSplitType('percentage');
    const ipo = this.getActiveIpo();
    const fixedCost = this.getIpoFixedCost(ipo);
    const buyInput = document.getElementById('calc-buy');
    if (buyInput) buyInput.value = fixedCost;

    const elAmtX = document.getElementById('calc-amt-x');
    if (elAmtX) elAmtX.value = 500;
    const elAmtY = document.getElementById('calc-amt-y');
    if (elAmtY) elAmtY.value = 100;
    const elAmtZ = document.getElementById('calc-amt-z');
    if (elAmtZ) elAmtZ.value = 300;

    this.recomputeLiveCalc();
    this.openModal('modal-calc');
  },

  setCalcSplitType(type) {
    const hidden = document.getElementById('calc-split-type');
    if (hidden) hidden.value = type;

    const btnPct = document.getElementById('calc-type-pct');
    const btnAmt = document.getElementById('calc-type-amt');
    const amtInputs = document.getElementById('calc-amt-inputs');

    if (type === 'amount') {
      if (btnAmt) btnAmt.className = 'px-2.5 py-1 rounded-md font-semibold bg-emerald-600 text-white text-[11px] transition shadow-sm';
      if (btnPct) btnPct.className = 'px-2.5 py-1 rounded-md font-medium text-slate-400 hover:text-white text-[11px] transition';
      if (amtInputs) amtInputs.classList.remove('hidden');
    } else {
      if (btnPct) btnPct.className = 'px-2.5 py-1 rounded-md font-semibold bg-indigo-600 text-white text-[11px] transition shadow-sm';
      if (btnAmt) btnAmt.className = 'px-2.5 py-1 rounded-md font-medium text-slate-400 hover:text-white text-[11px] transition';
      if (amtInputs) amtInputs.classList.add('hidden');
    }

    this.recomputeLiveCalc();
  },

  recomputeLiveCalc() {
    const buy = parseFloat(document.getElementById('calc-buy')?.value) || 0;
    const sell = parseFloat(document.getElementById('calc-sell')?.value) || 0;
    const splitType = document.getElementById('calc-split-type')?.value || 'percentage';

    const amtX = parseFloat(document.getElementById('calc-amt-x')?.value) || 0;
    const amtY = parseFloat(document.getElementById('calc-amt-y')?.value) || 0;
    const amtZ = parseFloat(document.getElementById('calc-amt-z')?.value) || 0;

    const res = this.calculateSplit(buy, sell, 10, 10, 15, amtY > 0, amtZ > 0, splitType, amtX, amtY, amtZ);

    const elProfit = document.getElementById('calc-profit');
    const elLabelProfit = document.getElementById('calc-label-profit');
    const elCutX = document.getElementById('calc-cut-x');
    const elLabelX = document.getElementById('calc-label-x');
    const elCutY = document.getElementById('calc-cut-y');
    const elRowY = document.getElementById('calc-row-y');
    const elCutZ = document.getElementById('calc-cut-z');
    const elLabelZ = document.getElementById('calc-label-z');
    const elCutA = document.getElementById('calc-cut-a');
    const elLabelA = document.getElementById('calc-label-a');

    if (!res.isLoss) {
      if (elLabelProfit) elLabelProfit.textContent = 'Total Profit (Sell - Buy):';
      if (elProfit) {
        elProfit.className = 'font-bold text-cyan-400 font-mono text-sm';
        elProfit.textContent = '₹' + res.profit.toLocaleString('en-IN');
      }

      if (splitType === 'amount') {
        if (elLabelX) elLabelX.textContent = 'Holder (Direct Amount):';
        if (elCutX) {
          elCutX.className = 'font-bold text-purple-300 font-mono';
          elCutX.textContent = '₹' + res.cutX.toLocaleString('en-IN');
        }

        if (amtY > 0) {
          if (elRowY) elRowY.style.display = 'flex';
          if (elLabelY) elLabelY.textContent = 'Middleman (Direct Amount):';
          if (elCutY) elCutY.textContent = '₹' + res.cutY.toLocaleString('en-IN');
        } else {
          if (elRowY) elRowY.style.display = 'none';
        }

        if (amtZ > 0) {
          if (elRowZ) elRowZ.style.display = 'flex';
          if (elLabelZ) elLabelZ.textContent = 'Partner (Direct Amount):';
          if (elCutZ) {
            elCutZ.className = 'font-bold text-amber-300 font-mono';
            elCutZ.textContent = '₹' + res.cutZ.toLocaleString('en-IN');
          }
        } else {
          if (elRowZ) elRowZ.style.display = 'none';
        }

        if (elLabelA) elLabelA.innerHTML = 'Your Net Profit (Profit - Payouts):';
        if (elCutA) {
          elCutA.className = 'font-mono text-base ' + (res.cutA >= 0 ? 'text-emerald-400' : 'text-rose-400 font-bold');
          elCutA.textContent = (res.cutA >= 0 ? '₹' : '-₹') + Math.abs(res.cutA).toLocaleString('en-IN');
        }
      } else {
        // Percentage Mode
        if (elLabelX) elLabelX.textContent = 'Holder Share (10%):';
        if (elCutX) {
          elCutX.className = 'font-bold text-purple-300 font-mono';
          elCutX.textContent = '₹' + res.cutX.toLocaleString('en-IN');
        }
        if (elRowY) elRowY.style.display = 'flex';
        if (elLabelY) elLabelY.textContent = 'Middleman Share (10% of Holder):';
        if (elCutY) elCutY.textContent = '₹' + res.cutY.toLocaleString('en-IN');

        if (elRowZ) elRowZ.style.display = 'flex';
        if (elLabelZ) elLabelZ.textContent = `Partner Share (15% of remaining ₹${res.remainingAfterXY.toLocaleString('en-IN')}):`;
        if (elCutZ) {
          elCutZ.className = 'font-bold text-amber-300 font-mono';
          elCutZ.textContent = '₹' + res.cutZ.toLocaleString('en-IN');
        }

        if (elLabelA) elLabelA.innerHTML = 'Your Net Profit (Rest Amount):';
        if (elCutA) {
          elCutA.className = 'font-mono text-base text-emerald-400';
          elCutA.textContent = '₹' + res.cutA.toLocaleString('en-IN');
        }
      }
    } else {
      // LOSS CALCULATION
      if (elLabelProfit) elLabelProfit.textContent = 'Total Loss (Buy - Sell):';
      if (elProfit) {
        elProfit.className = 'font-bold text-rose-400 font-mono text-sm';
        elProfit.textContent = '-₹' + res.loss.toLocaleString('en-IN') + ' (Loss)';
      }

      if (splitType === 'amount') {
        if (elLabelX) elLabelX.textContent = 'Holder Share:';
        if (elCutX) {
          elCutX.className = 'font-mono text-slate-500';
          elCutX.textContent = '₹0 (No payout on loss)';
        }
        if (elRowY) elRowY.style.display = 'none';
        if (elRowZ) elRowZ.style.display = 'none';

        if (elLabelA) elLabelA.innerHTML = '<span class="text-rose-300 font-semibold">Your Net Loss:</span>';
        if (elCutA) {
          elCutA.className = 'font-mono text-base text-rose-400 font-bold';
          elCutA.textContent = '-₹' + Math.abs(res.cutA).toLocaleString('en-IN');
        }
      } else {
        // Percentage Loss Mode
        if (elLabelX) elLabelX.textContent = 'Holder Share:';
        if (elCutX) {
          elCutX.className = 'font-mono text-slate-500';
          elCutX.textContent = '₹0 (No payout on loss)';
        }
        if (elRowY) elRowY.style.display = 'none';

        if (elRowZ) elRowZ.style.display = 'flex';
        if (elLabelZ) elLabelZ.innerHTML = '<span class="text-rose-300 font-semibold">Partner Pays You (15% of Loss):</span>';
        if (elCutZ) {
          elCutZ.className = 'font-bold text-rose-400 font-mono';
          elCutZ.textContent = `+₹${res.partnerOwes.toLocaleString('en-IN')} (Partner Owes)`;
        }

        if (elLabelA) elLabelA.innerHTML = '<span class="text-rose-300 font-semibold">Your Net Loss (Rest of Loss):</span>';
        if (elCutA) {
          elCutA.className = 'font-mono text-base text-rose-400 font-bold';
          elCutA.textContent = '-₹' + Math.abs(res.cutA).toLocaleString('en-IN');
        }
      }
    }
  },

  // ==================== PROFESSIONAL EXCEL TABLE FORMATTER ====================
  styleSheetAsExcelTable(ws, rows, hasSummaryRow = true) {
    if (!ws || !ws['!ref']) return;

    const range = XLSX.utils.decode_range(ws['!ref']);
    const colWidths = [];

    // 1. Calculate dynamic column widths & set real numeric cell types
    for (let C = range.s.c; C <= range.e.c; ++C) {
      let maxLen = 12;
      for (let R = range.s.r; R <= range.e.r; ++R) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellRef];
        if (cell && cell.v !== undefined && cell.v !== null) {
          const str = String(cell.v);
          if (str.length > maxLen) maxLen = str.length;

          // If numeric, assign real Excel numeric format
          if (typeof cell.v === 'number') {
            cell.t = 'n';
            if (C === 0 && R > 0) {
              cell.z = '0'; // Serial number
            } else {
              // Standard Excel financial format (positive, negative in red, zero as dash)
              cell.z = '#,##0;[Red]-#,##0;"-"';
            }
          }
        }
      }
      colWidths.push({ wch: Math.min(Math.max(maxLen + 4, 14), 48) });
    }
    ws['!cols'] = colWidths;

    // 2. Excel Table AutoFilter: turns range into official Excel Table with sort/filter controls on headers
    const lastDataRow = (hasSummaryRow && rows.length > 0 && rows[rows.length - 1]['S.No'] === 'TOTAL')
      ? range.e.r - 1
      : range.e.r;

    if (lastDataRow > 0) {
      const filterRange = {
        s: { r: 0, c: range.s.c },
        e: { r: lastDataRow, c: range.e.c }
      };
      ws['!autofilter'] = { ref: XLSX.utils.encode_range(filterRange) };
    }

    // 3. Row heights: 26pt for Header, 21pt for Data rows
    const rowHeights = [{ hpt: 26 }];
    for (let R = 1; R <= range.e.r; ++R) {
      rowHeights.push({ hpt: 21 });
    }
    ws['!rows'] = rowHeights;

    // 4. Freeze header row so scrolling keeps headers pinned at the top
    ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }];
  },

  // ==================== FORMATTED EXCEL TABLE EXPORT (INDIVIDUAL, FIXED & MASTER) ====================
  exportCurrentViewToExcel() {
    if (this.state.currentView === 'fixed-pans') {
      if (this.state.fixedPans.length === 0) {
        this.showToast('No PAN card holders to export', 'error');
        return;
      }
      const rows = this.state.fixedPans.map((p, idx) => ({
        'S.No': idx + 1,
        'Code': p.code || '-',
        'Holder Name': p.name,
        'Split Rule': p.splitType === 'amount' ? 'Direct Fixed Amount' : 'Percentage Split',
        'Middleman / Referrer': p.middleman || 'None',
        'Partner / Coordinator': p.partner || 'None',
        'Phone Number': p.phone || '',
        'Holder Share': p.splitType === 'amount' ? `₹${(p.amtX !== undefined ? p.amtX : 500)}` : `${p.pctX !== undefined ? p.pctX : 10}%`,
        'Middleman Share': p.splitType === 'amount' ? `₹${(p.amtY || 0)}` : `${p.pctY !== undefined ? p.pctY : 10}%`,
        'Partner Share': p.splitType === 'amount' ? `₹${(p.amtZ || 0)}` : `${p.pctZ !== undefined ? p.pctZ : 15}%`
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      this.styleSheetAsExcelTable(ws, rows, false);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PAN_Holders_Table');
      XLSX.writeFile(wb, `PAN_Card_Holders_Table_${new Date().toISOString().slice(0, 10)}.xlsx`);
      this.showToast('PAN Card Holders Table exported to Excel!', 'success');
    } else if (this.state.currentView === 'master') {
      // MASTER CONSOLIDATED EXCEL TABLE
      const summary = this.getMasterPeopleSummary();
      if (summary.length === 0) {
        this.showToast('No people or IPO earnings to export in Master Sheet', 'error');
        return;
      }

      const allIpos = this.state.ipos;
      let totalEarnedSum = 0;
      let totalSettledSum = 0;
      let totalPendingSum = 0;
      const ipoTotals = {};
      allIpos.forEach(i => { ipoTotals[i.name] = 0; });

      const rows = summary.map((p, idx) => {
        totalEarnedSum += p.totalEarned;
        totalSettledSum += p.totalPaid;
        totalPendingSum += p.totalPending;

        const row = {
          'S.No': idx + 1,
          'Person Name': p.name,
          'Role(s)': Array.from(p.roles).join(', '),
        };

        allIpos.forEach(ipo => {
          const matchingItems = p.ipos.filter(item => item.ipoId === ipo.id);
          const netInIpo = matchingItems.reduce((acc, it) => acc + it.amount, 0);
          row[`${ipo.name} (₹)`] = Number(netInIpo);
          ipoTotals[ipo.name] += netInIpo;
        });

        row['Total Earned / Net (₹)'] = Number(p.totalEarned);
        row['Settled Amount (₹)'] = Number(p.totalPaid);
        row['Balance Due (Pending ₹)'] = Number(p.totalPending);
        row['Overall Status'] = p.totalPending === 0 ? 'All Settled' : (p.totalPending > 0 ? 'Pending Payout' : 'Owes You');
        row['Last Settlement Date'] = p.lastSettledDate ? this.formatDateDisplay(p.lastSettledDate) : '-';

        return row;
      });

      // Total summary row
      const totalRow = {
        'S.No': 'TOTAL',
        'Person Name': `${summary.length} People`,
        'Role(s)': '',
      };
      allIpos.forEach(ipo => {
        totalRow[`${ipo.name} (₹)`] = Number(ipoTotals[ipo.name]);
      });
      totalRow['Total Earned / Net (₹)'] = Number(totalEarnedSum);
      totalRow['Settled Amount (₹)'] = Number(totalSettledSum);
      totalRow['Balance Due (Pending ₹)'] = Number(totalPendingSum);
      totalRow['Overall Status'] = totalPendingSum === 0 ? 'All Settled' : totalPendingSum > 0 ? 'Pending Payouts' : 'Net Recoverable';
      totalRow['Last Settlement Date'] = '';

      rows.push(totalRow);

      const ws = XLSX.utils.json_to_sheet(rows);
      this.styleSheetAsExcelTable(ws, rows, true);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Master_Consolidated_Table');
      XLSX.writeFile(wb, `Master_IPO_Consolidated_Table_${new Date().toISOString().slice(0, 10)}.xlsx`);
      this.showToast('Master Consolidated Excel Table exported!', 'success');
    } else {
      // SINGLE IPO PROFIT & LOSS EXCEL TABLE
      const ipo = this.getActiveIpo();
      if (!ipo || !ipo.entries || ipo.entries.length === 0) {
        this.showToast('No entries to export in this IPO', 'error');
        return;
      }

      let totalApplied = 0;
      let totalSold = 0;
      let totalProfit = 0;
      let totalX = 0;
      let totalY = 0;
      let totalZ = 0;
      let totalYou = 0;

      const rows = ipo.entries.map((e, idx) => {
        const netDiff = (e.sell || 0) - (e.cost || 0);
        totalApplied += (e.cost || 0);
        totalSold += (e.sell || 0);
        totalProfit += netDiff;
        totalX += (e.cutX || 0);
        totalY += (e.cutY || 0);
        totalZ += (e.cutZ || 0);
        totalYou += (e.cutA || 0);

        const isLoss = (e.sell || 0) < (e.cost || 0);
        const isSettled = isLoss ? !!e.isPaidZ : !!e.isPaidX;
        const sDate = isLoss ? (e.settledDateZ || '') : (e.settledDateX || '');

        return {
          'S.No': idx + 1,
          'IPO Name': ipo.name,
          'Holder Name': e.panHolder,
          'Split Mode': e.splitType === 'amount' ? 'Direct Amount (₹)' : 'Percentage (%)',
          'Holder Share (₹)': Number(e.cutX || 0),
          'Middleman Name': e.middleman || 'None',
          'Middleman Share (₹)': Number(e.cutY || 0),
          'Partner Name': e.partner || 'None',
          'Partner Share / Contrib (₹)': Number(e.cutZ || 0),
          'Cost Mode': e.costType === 'variable' ? 'Variable' : 'Fixed',
          'Applied Cost (₹)': Number(e.cost || 0),
          'Sold Value (₹)': Number(e.sell || 0),
          'Total Profit / Loss (₹)': Number(netDiff),
          'Your Net Outcome (₹)': Number(e.cutA || 0),
          'Settlement Status': isLoss 
            ? (e.isPaidZ ? 'Loss Collected' : 'Partner Owes')
            : (e.isPaidX ? 'Settled' : 'Pending'),
          'Settlement Date': isSettled ? (this.formatDateDisplay(sDate) || 'Settled') : '-'
        };
      });

      rows.push({
        'S.No': 'TOTAL',
        'IPO Name': ipo.name,
        'Holder Name': `${ipo.entries.length} Allotments`,
        'Split Mode': '',
        'Holder Share (₹)': Number(totalX),
        'Middleman Name': '',
        'Middleman Share (₹)': Number(totalY),
        'Partner Name': '',
        'Partner Share / Contrib (₹)': Number(totalZ),
        'Cost Mode': '',
        'Applied Cost (₹)': Number(totalApplied),
        'Sold Value (₹)': Number(totalSold),
        'Total Profit / Loss (₹)': Number(totalProfit),
        'Your Net Outcome (₹)': Number(totalYou),
        'Settlement Status': '',
        'Settlement Date': ''
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      this.styleSheetAsExcelTable(ws, rows, true);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Profit_Loss_Table');
      XLSX.writeFile(wb, `${ipo.name.replace(/\s+/g, '_')}_Table.xlsx`);
      this.showToast('Formatted Excel Table exported successfully!', 'success');
    }
  },

  // Modal helpers
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('hidden');
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
  },

  copyToClipboard(text, label = 'Text') {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      this.showToast(`${label} copied: ${text}`, 'info');
    }).catch(err => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      this.showToast(`${label} copied: ${text}`, 'info');
    });
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-xs text-white max-w-sm';

    if (type === 'success') {
      toast.classList.add('bg-slate-900', 'border-emerald-500/50', 'text-emerald-200');
      toast.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400 text-sm"></i> <span>${this.escapeHtml(message)}</span>`;
    } else if (type === 'error') {
      toast.classList.add('bg-slate-900', 'border-rose-500/50', 'text-rose-200');
      toast.innerHTML = `<i class="fa-solid fa-circle-exclamation text-rose-400 text-sm"></i> <span>${this.escapeHtml(message)}</span>`;
    } else {
      toast.classList.add('bg-slate-900', 'border-indigo-500/50', 'text-indigo-200');
      toast.innerHTML = `<i class="fa-solid fa-circle-info text-indigo-400 text-sm"></i> <span>${this.escapeHtml(message)}</span>`;
    }

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  // ==================== MULTI-LAPTOP CLOUD SYNC (FIREBASE REALTIME DB) ====================
  initCloudSync() {
    let config = null;

    // 1. Check window.FIREBASE_CONFIG from config.js
    if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && window.FIREBASE_CONFIG.apiKey.trim() !== '') {
      config = window.FIREBASE_CONFIG;
    }

    // 2. Check localStorage override
    const savedConfig = localStorage.getItem('ipo_firebase_config');
    if (savedConfig) {
      try {
        config = JSON.parse(savedConfig);
      } catch (e) {}
    }

    const room = localStorage.getItem('ipo_firebase_room') || window.FIREBASE_SYNC_ROOM || 'main_workspace';
    this.cloud.room = room;

    if (config && config.apiKey) {
      this.connectFirebase(config, room);
    } else {
      this.updateCloudSyncUI('disconnected');
    }
  },

  connectFirebase(config, room) {
    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK not loaded');
      this.updateCloudSyncUI('error');
      return;
    }

    try {
      if (!config.databaseURL && config.projectId) {
        config.databaseURL = `https://${config.projectId}-default-rtdb.firebaseio.com`;
      }

      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(config);
      }
      this.cloud.db = firebase.database();
      this.cloud.room = room || 'main_workspace';

      // 1. Monitor online/offline connection state
      const connectedRef = this.cloud.db.ref('.info/connected');
      connectedRef.on('value', (snap) => {
        if (snap.val() === true) {
          this.cloud.connected = true;
          this.updateCloudSyncUI('connected');
        } else {
          this.cloud.connected = false;
          this.updateCloudSyncUI('offline');
        }
      });

      // 2. Listen to real-time data changes across all laptops
      const syncRef = this.cloud.db.ref(`ipo_sync/${this.cloud.room}`);
      syncRef.on('value', (snap) => {
        const cloudData = snap.val();
        if (!cloudData) {
          // First time initialization: If cloud is empty, upload existing local data
          if (this.state.ipos.length > 0 || this.state.fixedPans.length > 0) {
            this.pushStateToCloud();
          }
          return;
        }

        // Ignore changes pushed by this laptop to prevent echo loops
        if (cloudData.updatedBy === this.cloud.deviceId) return;

        this.cloud.isRemoteUpdating = true;
        this.state.ipos = Array.isArray(cloudData.ipos) ? cloudData.ipos : [];
        this.state.fixedPans = Array.isArray(cloudData.fixedPans) ? cloudData.fixedPans : [];
        if (cloudData.activeIpoId && this.state.ipos.some(i => i.id === cloudData.activeIpoId)) {
          this.state.activeIpoId = cloudData.activeIpoId;
        } else if (!this.state.activeIpoId && this.state.ipos.length > 0) {
          this.state.activeIpoId = this.state.ipos[0].id;
        }

        this.saveState(true);
        this.renderAll();
        this.cloud.isRemoteUpdating = false;

        this.showToast('Data synced live from cloud!', 'info');
      });

      this.updateCloudSyncUI('connected');
    } catch (err) {
      console.error('Firebase connection error:', err);
      this.updateCloudSyncUI('error');
      this.showToast('Could not connect to Firebase: ' + err.message, 'error');
    }
  },

  pushStateToCloud() {
    if (!this.cloud.db || !this.cloud.connected) return;
    try {
      this.cloud.db.ref(`ipo_sync/${this.cloud.room}`).set({
        ipos: this.state.ipos,
        fixedPans: this.state.fixedPans,
        activeIpoId: this.state.activeIpoId,
        updatedBy: this.cloud.deviceId,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error pushing state to cloud:', err);
    }
  },

  pushLocalToCloudManual() {
    if (!this.cloud.db) {
      this.showToast('Please connect to Firebase first', 'error');
      return;
    }
    this.pushStateToCloud();
    this.showToast('Local data successfully pushed to cloud!', 'success');
  },

  openCloudSyncModal() {
    const txtArea = document.getElementById('cloud-config-textarea');
    const roomInput = document.getElementById('cloud-room-input');

    if (roomInput) {
      roomInput.value = this.cloud.room || 'main_workspace';
    }

    if (txtArea) {
      const saved = localStorage.getItem('ipo_firebase_config');
      if (saved) {
        txtArea.value = saved;
      } else if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey) {
        txtArea.value = JSON.stringify(window.FIREBASE_CONFIG, null, 2);
      } else {
        txtArea.value = '';
      }
    }

    this.updateCloudSyncModalStatus();
    this.openModal('modal-cloud-sync');
  },

  updateCloudSyncModalStatus() {
    const box = document.getElementById('cloud-status-box');
    const dot = document.getElementById('cloud-status-dot');
    const title = document.getElementById('cloud-status-title');
    const sub = document.getElementById('cloud-status-subtitle');
    const btnPush = document.getElementById('btn-cloud-push-now');

    if (!box || !dot || !title || !sub) return;

    if (this.cloud.connected) {
      box.className = 'p-4 rounded-xl border flex items-center justify-between bg-emerald-950/40 border-emerald-500/40';
      dot.className = 'w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-md shadow-emerald-400/50';
      title.className = 'text-xs font-bold text-emerald-300';
      title.textContent = '🟢 Connected & Live Syncing';
      sub.textContent = `Syncing across all laptops in room: "${this.cloud.room}"`;
      if (btnPush) btnPush.style.display = 'flex';
    } else if (this.cloud.db) {
      box.className = 'p-4 rounded-xl border flex items-center justify-between bg-amber-950/40 border-amber-500/40';
      dot.className = 'w-3.5 h-3.5 rounded-full bg-amber-400 animate-pulse';
      title.className = 'text-xs font-bold text-amber-300';
      title.textContent = '🟡 Reconnecting to Cloud...';
      sub.textContent = 'Check your internet or Firebase config.';
      if (btnPush) btnPush.style.display = 'none';
    } else {
      box.className = 'p-4 rounded-xl border flex items-center justify-between bg-slate-950/60 border-slate-800';
      dot.className = 'w-3.5 h-3.5 rounded-full bg-slate-500';
      title.className = 'text-xs font-bold text-slate-300';
      title.textContent = '⚪ Local Storage Mode Only';
      sub.textContent = 'Enter your Firebase config below to sync across 2-3 laptops.';
      if (btnPush) btnPush.style.display = 'none';
    }
  },

  updateCloudSyncUI(status) {
    const btn = document.getElementById('btn-cloud-sync');
    const icon = document.getElementById('cloud-sync-icon');
    const text = document.getElementById('cloud-sync-text');

    if (!btn || !icon || !text) return;

    if (status === 'connected') {
      btn.className = 'text-xs px-3 py-1.5 rounded-lg bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 transition flex items-center gap-1.5 font-semibold shadow-sm shadow-emerald-950/30';
      icon.className = 'fa-solid fa-circle-check text-emerald-400';
      text.textContent = 'Cloud Synced';
    } else if (status === 'offline') {
      btn.className = 'text-xs px-3 py-1.5 rounded-lg bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border border-amber-500/40 transition flex items-center gap-1.5 font-medium';
      icon.className = 'fa-solid fa-triangle-exclamation text-amber-400';
      text.textContent = 'Sync Offline';
    } else if (status === 'error') {
      btn.className = 'text-xs px-3 py-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-500/40 transition flex items-center gap-1.5 font-medium';
      icon.className = 'fa-solid fa-cloud text-rose-400';
      text.textContent = 'Sync Error';
    } else {
      btn.className = 'text-xs px-3 py-1.5 rounded-lg bg-sky-950/40 hover:bg-sky-900/50 text-sky-300 border border-sky-500/30 transition flex items-center gap-1.5 font-medium';
      icon.className = 'fa-solid fa-cloud text-sky-400';
      text.textContent = 'Cloud Sync';
    }

    this.updateCloudSyncModalStatus();
  },

  saveCloudSyncConfig() {
    const raw = document.getElementById('cloud-config-textarea')?.value.trim();
    const room = document.getElementById('cloud-room-input')?.value.trim() || 'main_workspace';

    if (!raw) {
      this.showToast('Please paste your Firebase configuration', 'error');
      return;
    }

    let parsed = null;
    try {
      let cleaned = raw;
      if (cleaned.includes('{')) {
        cleaned = cleaned.substring(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1);
      }
      try {
        parsed = JSON.parse(cleaned);
      } catch (jsonErr) {
        // Handle JS object literals: apiKey: "..." -> "apiKey": "..."
        const validJson = cleaned
          .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
          .replace(/'/g, '"')
          .replace(/,\s*}/g, '}');
        parsed = JSON.parse(validJson);
      }
    } catch (e) {
      this.showToast('Invalid Firebase configuration format. Please check the snippet.', 'error');
      return;
    }

    if (!parsed || !parsed.apiKey) {
      this.showToast('Config is missing "apiKey". Please check your Firebase snippet.', 'error');
      return;
    }

    localStorage.setItem('ipo_firebase_config', JSON.stringify(parsed, null, 2));
    localStorage.setItem('ipo_firebase_room', room);

    this.connectFirebase(parsed, room);
    this.closeModal('modal-cloud-sync');
    this.showToast('Cloud database connected successfully! Auto-sync is active.', 'success');
  },

  disconnectCloudSync() {
    if (!confirm('Are you sure you want to disconnect from Cloud Sync on this laptop? Data will stay saved in your local browser.')) {
      return;
    }

    localStorage.removeItem('ipo_firebase_config');
    localStorage.removeItem('ipo_firebase_room');
    this.cloud.connected = false;
    this.cloud.db = null;
    this.updateCloudSyncUI('disconnected');
    this.closeModal('modal-cloud-sync');
    this.showToast('Cloud sync disconnected. Operating in local mode.', 'info');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();

  // Close Quick Pan results popover when clicking outside
  document.addEventListener('click', (e) => {
    const container = document.getElementById('quick-pan-search-container');
    if (container && !container.contains(e.target)) {
      App.closeQuickPanDropdown();
    }
  });
});
