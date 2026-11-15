/**
 * Fire Monitoring & Forecast Workspace for Design 4 (3D Earth Thermal Viewer).
 * Rebuilt cleanly from nasa-fire-monitoring (risk.js, detect.js, trend.js, regions.js)
 * without model evaluation / feature importance clutter.
 */
(function (global) {
  function fmtCompact(n) {
    if (n == null || Number.isNaN(n)) return '--';
    const abs = Math.abs(n);
    if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return Math.round(n).toLocaleString();
  }

  function fmtPct(n, d = 0) {
    return n == null || Number.isNaN(n) ? '--' : `${(n * 100).toFixed(d)}%`;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function heatColorForRatio(ratio) {
    if (ratio == null || Number.isNaN(ratio)) return { bg: 'transparent', fg: 'var(--ge-text-muted)' };
    const t = Math.max(0, Math.min(1, (Math.log2(Math.max(0.25, ratio)) + 1) / 3.5));
    const bg = global.FIRMSGlobe
      ? global.FIRMSGlobe.thermalBlueToRed(t, 0.85)
      : `rgba(234, 67, 53, ${0.25 + t * 0.65})`;
    return { bg, fg: t > 0.45 && t < 0.78 ? '#111315' : '#ffffff' };
  }

  function riskColor(p) {
    const t = Math.max(0, Math.min(1, p));
    return global.FIRMSGlobe
      ? global.FIRMSGlobe.thermalBlueToRed(t, 0.92)
      : '#ea4335';
  }

  function buildKpi(label, value, sub) {
    return `
      <div class="kpi-card">
        <div class="kpi-label">${escapeHtml(label)}</div>
        <div class="kpi-value">${escapeHtml(value)}</div>
        <div class="kpi-sub">${escapeHtml(sub || '')}</div>
      </div>`;
  }

  function renderHorizBars(container, items, valueFmt) {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = '<div class="empty-note">No data available.</div>';
      return;
    }
    const maxVal = Math.max(1e-9, ...items.map((d) => d.value));
    container.innerHTML = items
      .map((d) => {
        const pct = Math.max(2, (d.value / maxVal) * 100);
        return `
          <div class="hbar-row">
            <div class="hbar-label" title="${escapeHtml(d.label)}">${escapeHtml(d.label)}</div>
            <div class="hbar-track">
              <div class="hbar-fill" style="width:${pct.toFixed(1)}%;background:${d.color || 'var(--ge-accent)'}"></div>
            </div>
            <div class="hbar-val">${escapeHtml(valueFmt(d.value))}</div>
          </div>`;
      })
      .join('');
  }

  function renderWeeklySvg(container, rows, series) {
    if (!container) return;
    if (!rows.length) {
      container.innerHTML = '<div class="empty-note">No weekly data available.</div>';
      return;
    }
    const w = 640;
    const h = 210;
    const pad = { top: 14, right: 16, bottom: 26, left: 54 };
    const iw = w - pad.left - pad.right;
    const ih = h - pad.top - pad.bottom;

    const maxY = Math.max(1, ...rows.flatMap((r) => series.map((s) => Number(r[s.key]) || 0))) * 1.06;
    const xPos = (i) => pad.left + (rows.length > 1 ? (i / (rows.length - 1)) * iw : iw / 2);
    const yPos = (v) => pad.top + ih - (v / maxY) * ih;

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => maxY * f);
    const gridLines = yTicks
      .map(
        (v) =>
          `<line x1="${pad.left}" x2="${w - pad.right}" y1="${yPos(v).toFixed(1)}" y2="${yPos(v).toFixed(1)}" stroke="rgba(255,255,255,0.1)" />` +
          `<text x="${pad.left - 8}" y="${(yPos(v) + 4).toFixed(1)}" text-anchor="end" fill="#9aa0a6" font-size="11">${fmtCompact(v)}</text>`
      )
      .join('');

    const step = Math.max(1, Math.floor(rows.length / 5));
    const xLabels = rows
      .map((r, i) => (i % step === 0 || i === rows.length - 1 ? { i, label: String(r.dateStr || '').slice(0, 7) } : null))
      .filter(Boolean)
      .map(
        (t) =>
          `<text x="${xPos(t.i).toFixed(1)}" y="${h - 6}" text-anchor="middle" fill="#9aa0a6" font-size="11">${escapeHtml(t.label)}</text>`
      )
      .join('');

    const paths = series
      .map((s) => {
        const d = rows
          .map((r, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(Number(r[s.key]) || 0).toFixed(1)}`)
          .join(' ');
        return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" />`;
      })
      .join('');

    container.innerHTML = `<svg viewBox="0 0 ${w} ${h}" class="chart-svg" role="img" aria-label="Weekly trend chart">${gridLines}${xLabels}${paths}</svg>`;
  }

  async function fetchJsonSafe(url) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function createAnalytics(options) {
    const {
      data,
      onFlyTo,
      onProjectRiskPoints,
      onProjectDetectPoints,
    } = options;

    const drawer = document.getElementById('analyticsDrawer');
    const toggleBtn = document.getElementById('analyticsBtn');
    const closeBtn = document.getElementById('analyticsCloseBtn');
    const tablist = document.getElementById('analyticsTablist');
    if (!drawer || !toggleBtn || !tablist) return null;

    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const panels = [...drawer.querySelectorAll('[role="tabpanel"]')];

    let riskModelKey = 'p';
    let riskData = null;
    let detectData = null;
    let selectedDate = null;
    let selectedMonth = null;
    let trendYear = 'all';
    let selectedRegion = 'Global';
    let remoteRegional = null;
    let remoteWeekly = null;
    let statusPollTimer = null;
    let analyticsFilter = null;

    function normalizeCountryName(c) {
      const s = String(c || '').trim().toLowerCase();
      if (s === 'united states' || s === 'usa' || s === 'u.s.') return 'united states of america';
      if (s === 'democratic republic of the congo' || s === 'dr congo' || s === 'congo') return 'congo (kinshasa)';
      return s;
    }

    function matchesAnalyticsFilter(item) {
      if (!analyticsFilter || !item) return true;
      const countryNeedle = normalizeCountryName(analyticsFilter.country);
      const itemCountry = normalizeCountryName(item.country);
      const countryHit = Boolean(countryNeedle && itemCountry === countryNeedle);
      if (analyticsFilter.strictCountry && countryNeedle) {
        return countryHit;
      }
      const rawBbox = analyticsFilter.bbox;
      let bboxHit = false;
      const lat = Number(item.lat);
      const lon = Number(item.lon);
      if (rawBbox && Number.isFinite(lat) && Number.isFinite(lon)) {
        if (Array.isArray(rawBbox) && rawBbox.length === 4) {
          bboxHit = lat >= rawBbox[0] && lat <= rawBbox[1] && lon >= rawBbox[2] && lon <= rawBbox[3];
        } else if (typeof rawBbox === 'object' && rawBbox.lat_min != null && rawBbox.lat_max != null) {
          bboxHit = lat >= rawBbox.lat_min && lat <= rawBbox.lat_max && lon >= rawBbox.lon_min && lon <= rawBbox.lon_max;
        }
      }
      if (countryNeedle && rawBbox) return countryHit || bboxHit;
      if (countryNeedle) return countryHit;
      if (rawBbox) return bboxHit;
      return true;
    }

    function buildFilterPillHtml(matchedCount) {
      if (!analyticsFilter) return '';
      const label = analyticsFilter.label || analyticsFilter.country || 'AI Region';
      return `<button class="chip analytics-filter-pill" data-clear-filter="1" type="button" style="border-color:rgba(255,152,0,.55);color:#ffd54f;">Filter: ${escapeHtml(label)} (${matchedCount}) ×</button>`;
    }

    function bindFilterClear(container) {
      container?.querySelector('[data-clear-filter="1"]')?.addEventListener('click', () => {
        analyticsFilter = null;
        renderAll();
      });
    }

    function setDrawerOpen(open) {
      drawer.classList.toggle('open', open);
      toggleBtn.setAttribute('aria-pressed', String(open));
    }

    toggleBtn.addEventListener('click', () => setDrawerOpen(!drawer.classList.contains('open')));
    closeBtn?.addEventListener('click', () => setDrawerOpen(false));

    function activateTab(tabId, shouldFocus = false) {
      tabs.forEach((tab) => {
        const on = tab.id === tabId;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        if (on && shouldFocus) tab.focus();
      });
      panels.forEach((panel) => {
        const on = panel.getAttribute('aria-labelledby') === tabId;
        if (on) {
          panel.removeAttribute('hidden');
          panel.setAttribute('tabindex', '0');
        } else {
          panel.setAttribute('hidden', 'until-found');
          panel.removeAttribute('tabindex');
        }
      });
      const activeTab = tabs.find((t) => t.id === tabId);
      if (activeTab) {
        activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }

    tablist.addEventListener('click', (e) => {
      const btn = e.target.closest('[role="tab"]');
      if (btn) activateTab(btn.id);
    });

    tablist.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const idx = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      let nextIdx = idx;
      if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
      if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
      if (e.key === 'Home') nextIdx = 0;
      if (e.key === 'End') nextIdx = tabs.length - 1;
      activateTab(tabs[nextIdx].id, true);
      e.preventDefault();
    });

    panels.forEach((panel) => {
      panel.addEventListener('beforematch', () => {
        const tabId = panel.getAttribute('aria-labelledby');
        if (tabId) {
          setDrawerOpen(true);
          activateTab(tabId);
        }
      });
    });

    // ---- 1. 7-Day Fire Risk Forecast (from risk.js, without model eval)
    function renderRisk(apiStatus) {
      const statusEl = document.getElementById('riskLiveStatus');
      const kpiEl = document.getElementById('riskKpis');
      const tableBody = document.getElementById('riskCitiesBody');
      if (!statusEl || !kpiEl || !tableBody) return;

      if (!riskData || !riskData.cities) {
        const isUpdating = apiStatus && apiStatus.refreshing;
        statusEl.innerHTML = `
          <div class="live-banner">
            <div>
              <strong>${isUpdating ? 'Fetching NASA POWER & FIRMS live data...' : 'Live 7-Day Risk Forecast not generated yet.'}</strong><br/>
              ${isUpdating
                ? 'Downloading weather for 1,251 global cities in background. This panel will auto-update when ready.'
                : 'Click Refresh Live to run <code>update_live.py</code>.'}
            </div>
            <button id="triggerLiveRiskBtn" class="ai-send" type="button" ${isUpdating ? 'disabled' : ''}>
              <span class="material-symbols-outlined" style="font-size:18px;" aria-hidden="true">sync</span>
              <span>${isUpdating ? 'Updating...' : 'Refresh Live'}</span>
            </button>
          </div>`;
        document.getElementById('triggerLiveRiskBtn')?.addEventListener('click', triggerServerRefresh);
        kpiEl.innerHTML =
          buildKpi('Forecast Horizon', '7 Days', '50 km radius per city') +
          buildKpi('Coverage', '1,251 Cities', 'Global populated places') +
          buildKpi('Inputs', 'Weather + Fires', 'NASA POWER + VIIRS NRT');
        tableBody.innerHTML = '<tr><td colspan="4" class="empty-td">Waiting for live risk_latest.json...</td></tr>';
        return;
      }

      const allCities = riskData.cities;
      const filteredCities = analyticsFilter ? allCities.filter(matchesAnalyticsFilter) : allCities;
      const cities = analyticsFilter?.strictCountry ? filteredCities : (filteredCities.length ? filteredCities : allCities);
      const highCount = cities.filter((c) => c[riskModelKey] >= 0.5).length;
      const topCity = cities.reduce((best, c) => (c[riskModelKey] > (best?.[riskModelKey] ?? -1) ? c : best), null);

      statusEl.innerHTML = `
        <div class="live-meta">
          <span>Generated: <strong>${escapeHtml((riskData.generated_at || '').slice(0, 16).replace('T', ' '))} UTC</strong></span>
          <span>Weather: NASA POWER (to ${escapeHtml(riskData.weather_last_date)})</span>
          ${buildFilterPillHtml(filteredCities.length)}
          <button id="projectRiskGlobeBtn" class="chip" type="button">
            <span class="material-symbols-outlined" style="font-size:16px;" aria-hidden="true">public</span>
            <span>Plot on 3D Globe</span>
          </button>
        </div>`;
      bindFilterClear(statusEl);

      document.getElementById('projectRiskGlobeBtn')?.addEventListener('click', () => {
        if (onProjectRiskPoints) {
          onProjectRiskPoints(cities.map((c) => ({ lat: c.lat, lon: c.lon, t: c[riskModelKey] })));
        }
      });

      kpiEl.innerHTML =
        buildKpi('Forecast Window', `${(riskData.target_start || '').slice(5)} → ${(riskData.target_end || '').slice(5)}`, 'Next 7 days (UTC)') +
        buildKpi('High Risk (≥50%)', `${highCount}`, `of ${cities.length} ${filteredCities.length && analyticsFilter ? 'region' : 'global'} cities`) +
        buildKpi('Peak Risk City', topCity ? fmtPct(topCity[riskModelKey], 0) : '--', topCity ? topCity.name : '');

      const sorted = [...cities].sort((a, b) => b[riskModelKey] - a[riskModelKey]).slice(0, 50);
      tableBody.innerHTML = sorted
        .map((c) => {
          const prob = c[riskModelKey];
          const badgeColor = riskColor(prob);
          const drv = c.drivers || c;
          const reasons = [];
          if (drv.fire_days_prev7 >= 3) reasons.push(`${Math.round(drv.fire_days_prev7)}d recent fire`);
          if (drv.precip_sum_30 != null && drv.precip_sum_30 < 10) reasons.push(`${drv.precip_sum_30.toFixed(0)}mm 30d rain`);
          if (drv.days_since_rain >= 14) reasons.push(`${Math.round(drv.days_since_rain)}d dry`);
          if (drv.tmax_mean_7 != null && drv.tmax_mean_7 >= 32) reasons.push(`${drv.tmax_mean_7.toFixed(0)}°C max`);
          if (drv.rh_mean_7 != null && drv.rh_mean_7 < 40) reasons.push(`${drv.rh_mean_7.toFixed(0)}% RH`);
          if (reasons.length < 2 && drv.vpd_mean_7 != null && drv.vpd_mean_7 >= 2.0) reasons.push(`${drv.vpd_mean_7.toFixed(1)} kPa VPD`);
          return `
            <tr class="clickable-row" data-lat="${c.lat}" data-lon="${c.lon}">
              <th scope="row">${escapeHtml(c.name)}</th>
              <td>${escapeHtml(c.country || '')}</td>
              <td><span class="prob-pill" style="background:${badgeColor}">${fmtPct(prob, 0)}</span></td>
              <td>${escapeHtml(reasons.slice(0, 2).join(' · ') || 'Baseline seasonal')}</td>
            </tr>`;
        })
        .join('');

      tableBody.querySelectorAll('tr[data-lat]').forEach((tr) => {
        tr.addEventListener('click', () => {
          if (onFlyTo) onFlyTo(Number(tr.dataset.lat), Number(tr.dataset.lon), 2.2);
        });
      });
    }

    document.querySelectorAll('input[name="riskModelRadio"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        riskModelKey = e.target.value;
        renderRisk();
      });
    });

    // ---- 2. Live Detections & Wildfire Calendar (from detect.js)
    function renderDetect() {
      const statusEl = document.getElementById('detectLiveStatus');
      const kpiEl = document.getElementById('detectKpis');
      const calEl = document.getElementById('detectCalendar');
      const calTitle = document.getElementById('calMonthTitle');
      const eventsBody = document.getElementById('detectEventsBody');
      const countryBars = document.getElementById('detectCountryBars');
      if (!statusEl || !kpiEl || !calEl || !eventsBody) return;

      if (!detectData || !detectData.days || !Object.keys(detectData.days).length) {
        statusEl.innerHTML = `
          <div class="live-banner">
            <div>
              <strong>Live Detections not generated yet.</strong><br/>
              Click Refresh Live to fetch NOAA-20 / NOAA-21 VIIRS events.
            </div>
            <button id="triggerLiveDetectBtn" class="ai-send" type="button">
              <span class="material-symbols-outlined" style="font-size:18px;" aria-hidden="true">sync</span>
              <span>Refresh Live</span>
            </button>
          </div>`;
        document.getElementById('triggerLiveDetectBtn')?.addEventListener('click', triggerServerRefresh);
        kpiEl.innerHTML =
          buildKpi('Satellites', 'NOAA-20 / 21', 'VIIRS 375m NRT') +
          buildKpi('Filtering', 'Vegetation Fires', 'Static/volcano excluded');
        calEl.innerHTML = '';
        eventsBody.innerHTML = '<tr><td colspan="4" class="empty-td">Waiting for live detections.json...</td></tr>';
        if (countryBars) countryBars.innerHTML = '';
        return;
      }

      const days = detectData.days;
      const dates = Object.keys(days).sort();
      if (!selectedDate || !days[selectedDate]) selectedDate = dates[dates.length - 1];
      if (!selectedMonth) selectedMonth = selectedDate.slice(0, 7);

      const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
      const dayObj = days[selectedDate];

      const allEvents = dayObj.events || [];
      const filteredEvents = analyticsFilter ? allEvents.filter(matchesAnalyticsFilter) : allEvents;
      const activeEvents = analyticsFilter?.strictCountry ? filteredEvents : (filteredEvents.length ? filteredEvents : allEvents);

      statusEl.innerHTML = `
        <div class="live-meta">
          <span>Updated: <strong>${escapeHtml((detectData.updated_at || '').slice(0, 16).replace('T', ' '))} UTC</strong></span>
          <span>Sources: ${escapeHtml((detectData.sources || []).join(' / '))}</span>
          ${buildFilterPillHtml(filteredEvents.length)}
          <button id="projectDetectGlobeBtn" class="chip" type="button">
            <span class="material-symbols-outlined" style="font-size:16px;" aria-hidden="true">public</span>
            <span>Plot Day on 3D Globe</span>
          </button>
        </div>`;
      bindFilterClear(statusEl);

      document.getElementById('projectDetectGlobeBtn')?.addEventListener('click', () => {
        if (onProjectDetectPoints && activeEvents.length) {
          onProjectDetectPoints(
            activeEvents.map((ev) => ({
              lat: ev.lat,
              lon: ev.lon,
              t: Math.min(1, Math.log10(Math.max(1, ev.frp ?? ev.frp_sum ?? 1) / 40 + 1) / 3.1),
            }))
          );
        }
      });

      kpiEl.innerHTML =
        buildKpi('Selected Day', selectedDate, 'UTC calendar date') +
        buildKpi('Fire Events', fmtCompact(dayObj.n_events), `${fmtCompact(dayObj.n_fire_detections)} pixels`) +
        buildKpi('Static Filtered', fmtCompact(dayObj.n_static_filtered), 'Non-vegetation excluded') +
        buildKpi('Total FRP', `${fmtCompact(dayObj.frp_total)} MW`, `${dates.length} days archived`);

      const [y, m] = selectedMonth.split('-').map(Number);
      calTitle.textContent = `${y}-${String(m).padStart(2, '0')}`;
      document.getElementById('calPrevBtn').disabled = months.indexOf(selectedMonth) <= 0;
      document.getElementById('calNextBtn').disabled = months.indexOf(selectedMonth) >= months.length - 1;

      const first = new Date(Date.UTC(y, m - 1, 1));
      const nDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const offset = (first.getUTCDay() + 6) % 7;
      const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        .map((d) => `<div class="cal-dow">${d}</div>`)
        .join('');
      const blanks = Array.from({ length: offset }, () => '<div class="cal-day blank"></div>').join('');
      let cells = '';
      for (let d = 1; d <= nDays; d++) {
        const key = `${selectedMonth}-${String(d).padStart(2, '0')}`;
        const s = days[key];
        if (!s) {
          cells += `<button class="cal-day" type="button" disabled><span class="cd-num">${d}</span><span class="cd-val">--</span></button>`;
        } else {
          const t = Math.min(1, s.n_events / 20000);
          const bg = riskColor(t);
          cells += `<button class="cal-day" type="button" data-date="${key}" aria-pressed="${key === selectedDate}" style="background:${bg}"><span class="cd-num">${d}</span><span class="cd-val">${fmtCompact(s.n_events)}</span></button>`;
        }
      }
      calEl.innerHTML = dows + blanks + cells;
      calEl.querySelectorAll('button[data-date]').forEach((b) => {
        b.addEventListener('click', () => {
          selectedDate = b.dataset.date;
          renderDetect();
        });
      });

      const events = activeEvents.slice(0, 50);
      eventsBody.innerHTML = events.length
        ? events
            .map((ev) => {
              const frpVal = Number(ev.frp ?? ev.frp_sum ?? 0);
              const nDet = Number(ev.n ?? ev.n_det ?? 1);
              const lastTime = ev.t_last ?? ev.last_time ?? ev.t_first ?? '';
              return `
          <tr class="clickable-row" data-lat="${ev.lat}" data-lon="${ev.lon}">
            <th scope="row">${escapeHtml(ev.country || 'Ocean / Remote')}</th>
            <td>${ev.lat.toFixed(2)}, ${ev.lon.toFixed(2)}</td>
            <td><strong>${fmtCompact(frpVal)} MW</strong></td>
            <td>${nDet} px · ${escapeHtml(lastTime)}</td>
          </tr>`;
            })
            .join('')
        : `<tr><td colspan="4" class="empty-td">No NRT fire events matched in ${escapeHtml(analyticsFilter?.label || 'selection')} on ${escapeHtml(selectedDate)}.</td></tr>`;

      eventsBody.querySelectorAll('tr[data-lat]').forEach((tr) => {
        tr.addEventListener('click', () => {
          if (onFlyTo) onFlyTo(Number(tr.dataset.lat), Number(tr.dataset.lon), 2.3);
        });
      });

      const countries = (dayObj.countries || []).slice(0, 10).map((c) => ({
        label: c.country,
        value: c.events ?? c.n_events ?? 0,
        color: '#ef5350',
      }));
      renderHorizBars(countryBars, countries, (v) => fmtCompact(v));
    }

    document.getElementById('calPrevBtn')?.addEventListener('click', () => {
      if (!detectData?.days) return;
      const months = [...new Set(Object.keys(detectData.days).sort().map((d) => d.slice(0, 7)))];
      const idx = months.indexOf(selectedMonth);
      if (idx > 0) {
        selectedMonth = months[idx - 1];
        renderDetect();
      }
    });

    document.getElementById('calNextBtn')?.addEventListener('click', () => {
      if (!detectData?.days) return;
      const months = [...new Set(Object.keys(detectData.days).sort().map((d) => d.slice(0, 7)))];
      const idx = months.indexOf(selectedMonth);
      if (idx >= 0 && idx < months.length - 1) {
        selectedMonth = months[idx + 1];
        renderDetect();
      }
    });

    // ---- 3. Weekly Trends (from trend.js)
    function renderTrend() {
      const kpiEl = document.getElementById('trendKpis');
      const yearSelect = document.getElementById('trendYearSelect');
      if (!kpiEl || !yearSelect) return;

      const rows = (remoteWeekly || data.weekly || []).map((r) => ({
        ...r,
        dateStr: r.d || String(r.week_start || '').slice(0, 10),
        year: r.year || Number(String(r.d || r.week_start || '').slice(0, 4)),
        m_frp: r.m != null ? r.m : r.m_frp_sum,
        v_frp: r.v != null ? r.v : r.v_frp_sum,
        m_cnt: r.mc != null ? r.mc : r.m_count,
        v_cnt: r.vc != null ? r.vc : r.v_count,
      }));
      const years = [...new Set(rows.map((r) => r.year).filter(Boolean))].sort();
      if (yearSelect.options.length <= 1) {
        years.forEach((y) => {
          const opt = document.createElement('option');
          opt.value = String(y);
          opt.textContent = String(y);
          yearSelect.appendChild(opt);
        });
      }

      const filtered = trendYear === 'all' ? rows : rows.filter((r) => String(r.year) === String(trendYear));
      const mSum = filtered.reduce((acc, r) => acc + (r.m_frp || 0), 0);
      const vSum = filtered.reduce((acc, r) => acc + (r.v_frp || 0), 0);
      const peak = filtered.reduce((best, r) => ((r.v_frp || 0) > (best?.v_frp || -1) ? r : best), null);

      kpiEl.innerHTML =
        buildKpi('MODIS Total FRP', `${fmtCompact(mSum)} MW`, `${filtered.length} weeks`) +
        buildKpi('VIIRS Total FRP', `${fmtCompact(vSum)} MW`, `${filtered[0]?.dateStr || ''} → ${filtered[filtered.length - 1]?.dateStr || ''}`) +
        buildKpi('VIIRS / MODIS Ratio', mSum > 0 ? `${(vSum / mSum).toFixed(2)}x` : '--', '>1.0x means VIIRS captures more') +
        buildKpi('Peak VIIRS Week', peak ? `${fmtCompact(peak.v_frp)} MW` : '--', peak ? `Week of ${peak.dateStr}` : '');

      renderWeeklySvg(document.getElementById('trendFrpSvg'), filtered, [
        { key: 'm_frp', color: '#42a5f5' },
        { key: 'v_frp', color: '#ef5350' },
      ]);
      renderWeeklySvg(document.getElementById('trendCountSvg'), filtered, [
        { key: 'm_cnt', color: '#42a5f5' },
        { key: 'v_cnt', color: '#ef5350' },
      ]);
    }

    document.getElementById('trendYearSelect')?.addEventListener('change', (e) => {
      trendYear = e.target.value;
      renderTrend();
    });

    // ---- 4. Regional Matrix (from regions.js)
    function renderRegions() {
      const regionSelect = document.getElementById('regionCompareSelect');
      const barsEl = document.getElementById('regionBars');
      const thead = document.getElementById('ratioMatrixHead');
      const tbody = document.getElementById('ratioMatrixBody');
      if (!regionSelect || !barsEl || !thead || !tbody) return;

      const list = Array.isArray(remoteRegional) ? remoteRegional : [];
      const fallbackRegional = data.regional || {};

      let rows = list;
      if (!rows.length) {
        Object.entries(fallbackRegional).forEach(([k, v]) => {
          const [region, period] = k.split('__');
          rows.push({
            region,
            year: period === 'overlap' ? '2018-2021' : '2022-2025',
            m_frp_sum: (v.modis_gw || 0) * 1000,
            v_frp_sum: (v.viirs_gw || 0) * 1000,
            viirs_to_modis_ratio: v.ratio,
          });
        });
      }

      const regionNames = [...new Set(rows.map((r) => r.region))];
      const years = [...new Set(rows.map((r) => r.year))].sort();
      if (regionSelect.options.length === 0) {
        regionNames.forEach((reg) => {
          const opt = document.createElement('option');
          opt.value = reg;
          opt.textContent = reg.replace(/_/g, ' ');
          regionSelect.appendChild(opt);
        });
      }
      selectedRegion = regionNames.includes(selectedRegion) ? selectedRegion : regionNames[0];
      if (selectedRegion) regionSelect.value = selectedRegion;

      const selRows = rows.filter((r) => r.region === selectedRegion).sort((a, b) => String(a.year).localeCompare(String(b.year)));
      const maxFrp = Math.max(1, ...selRows.flatMap((r) => [r.m_frp_sum || 0, r.v_frp_sum || 0]));
      barsEl.innerHTML = selRows
        .map((r) => {
          const mw = ((r.m_frp_sum || 0) / maxFrp) * 100;
          const vw = ((r.v_frp_sum || 0) / maxFrp) * 100;
          return `
            <div class="dual-bar-row">
              <div class="dual-bar-yr">${escapeHtml(r.year)}</div>
              <div class="dual-bars">
                <div class="hbar-track"><div class="hbar-fill" style="width:${mw.toFixed(1)}%;background:#42a5f5"></div></div>
                <div class="hbar-track"><div class="hbar-fill" style="width:${vw.toFixed(1)}%;background:#ef5350"></div></div>
              </div>
              <div class="dual-bar-val">${r.viirs_to_modis_ratio ? `${r.viirs_to_modis_ratio.toFixed(2)}x` : '--'}</div>
            </div>`;
        })
        .join('');

      const byKey = new Map(rows.map((r) => [`${r.region}|${r.year}`, r]));
      thead.innerHTML = `<tr><th scope="col">Region</th>${years.map((y) => `<th scope="col">${escapeHtml(y)}</th>`).join('')}</tr>`;
      tbody.innerHTML = regionNames
        .map((reg) => {
          const cells = years
            .map((y) => {
              const r = byKey.get(`${reg}|${y}`);
              const ratio = r?.viirs_to_modis_ratio;
              const { bg, fg } = heatColorForRatio(ratio);
              return `<td style="background:${bg};color:${fg}">${ratio != null ? ratio.toFixed(2) : '--'}</td>`;
            })
            .join('');
          return `<tr${reg === selectedRegion ? ' style="outline:2px solid rgba(255,152,0,.75);outline-offset:-2px;"' : ''}><th scope="row">${escapeHtml(reg.replace(/_/g, ' '))}</th>${cells}</tr>`;
        })
        .join('');
    }

    document.getElementById('regionCompareSelect')?.addEventListener('change', (e) => {
      selectedRegion = e.target.value;
      renderRegions();
    });

    let lastApiStatus = null;

    function renderAll() {
      renderRisk(lastApiStatus);
      renderDetect();
      renderTrend();
      renderRegions();
    }

    async function triggerServerRefresh() {
      try {
        await fetch('/api/refresh', { method: 'POST' });
        loadAllLive();
      } catch {}
    }

    async function loadAllLive() {
      const [risk, detect, regional, weekly, apiStatus] = await Promise.all([
        fetchJsonSafe('./live/risk_latest.json'),
        fetchJsonSafe('./live/detections.json'),
        fetchJsonSafe('./data/regional_yearly_summary.json'),
        fetchJsonSafe('./data/global_weekly_timeseries.json'),
        fetchJsonSafe('/api/status'),
      ]);
      riskData = risk;
      detectData = detect;
      lastApiStatus = apiStatus;
      if (regional) remoteRegional = regional;
      if (weekly) remoteWeekly = weekly;

      renderAll();

      if (apiStatus && apiStatus.refreshing && (!risk || !detect)) {
        if (!statusPollTimer) {
          statusPollTimer = setTimeout(() => {
            statusPollTimer = null;
            loadAllLive();
          }, 5000);
        }
      }
    }

    loadAllLive();

    return {
      openTab(tabId) {
        setDrawerOpen(true);
        activateTab(tabId);
      },
      focusAnalytics(opts = {}) {
        const {
          open = true,
          tab = 'tab-risk',
          country = null,
          strictCountry = false,
          bbox = null,
          label = null,
          region = null,
          year = null,
        } = opts || {};
        analyticsFilter = (country || bbox)
          ? {
              country: country || null,
              strictCountry: Boolean(strictCountry && country),
              bbox: bbox || null,
              label: label || country || 'AI Region',
            }
          : null;
        if (region) selectedRegion = region;
        if (year) {
          trendYear = String(year);
          const trendSel = document.getElementById('trendYearSelect');
          if (trendSel && [...trendSel.options].some((o) => o.value === trendYear)) {
            trendSel.value = trendYear;
          }
        }
        renderAll();
        if (open) setDrawerOpen(true);
        if (tab) activateTab(tab);
        const body = drawer.querySelector('.analytics-body');
        if (body) body.scrollTop = 0;
      },
      clearFilter() {
        analyticsFilter = null;
        renderAll();
      },
      getRiskPoints() {
        if (!riskData?.cities) return [];
        return riskData.cities.map((c) => ({ lat: c.lat, lon: c.lon, t: c[riskModelKey] }));
      },
      getDetectPoints() {
        if (!detectData?.days || !selectedDate || !detectData.days[selectedDate]) return [];
        return (detectData.days[selectedDate].events || []).map((ev) => ({
          lat: ev.lat,
          lon: ev.lon,
          t: Math.min(1, Math.log10(Math.max(1, ev.frp ?? ev.frp_sum ?? 1) / 40 + 1) / 3.1),
        }));
      },
      reloadLive: loadAllLive,
    };
  }

  global.FIRMSAnalytics = { createAnalytics };
})(window);
