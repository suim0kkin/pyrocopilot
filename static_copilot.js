/* Static client-side Copilot & Telemetry engine for GitHub Pages (zero backend required). */
(function (global) {
  'use strict';

  const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
  const MODELS_CASCADE = ['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash'];

  const JA_CITY_ALIASES = {
    '東京': 'Tokyo', '大阪': 'Osaka', '名古屋': 'Nagoya', '札幌': 'Sapporo',
    '福岡': 'Fukuoka', '仙台': 'Sendai', '広島': 'Hiroshima', '那覇': 'Naha',
    '京都': 'Kyoto', '横浜': 'Yokohama', '神戸': 'Kobe', '新潟': 'Niigata',
    '金沢': 'Kanazawa', '鹿児島': 'Kagoshima', '高知': 'Kochi', '青森': 'Aomori',
    'ソウル': 'Seoul', '釜山': 'Busan', '仁川': 'Incheon', '北京': 'Beijing',
    '上海': 'Shanghai', '台北': 'Taipei', 'バンコク': 'Bangkok', 'チェンマイ': 'Chiang Mai',
    'ハノイ': 'Hanoi', 'ホーチミン': 'Ho Chi Minh City', 'ジャカルタ': 'Jakarta',
    'シドニー': 'Sydney', 'メルボルン': 'Melbourne', 'パース': 'Perth',
    'ブリスベン': 'Brisbane', 'ロサンゼルス': 'Los Angeles', 'サンフランシスコ': 'San Francisco',
    'シアトル': 'Seattle', 'ニューヨーク': 'New York', 'マナウス': 'Manaus',
    'サンパウロ': 'Sao Paulo', 'ロンドン': 'London', 'パリ': 'Paris',
    'マドリード': 'Madrid', 'ローマ': 'Rome', 'アテネ': 'Athens', 'カイロ': 'Cairo',
    'ナイロビ': 'Nairobi', 'ヨハネスブルグ': 'Johannesburg', 'デリー': 'Delhi',
  };

  const COUNTRY_ALIASES = {
    '日本': 'Japan', 'japan': 'Japan', 'にほん': 'Japan', 'にっぽん': 'Japan',
    '韓国': 'South Korea', '大韓民国': 'South Korea', 'korea': 'South Korea', 'south korea': 'South Korea',
    '中国': 'China', 'china': 'China', '台湾': 'Taiwan', 'taiwan': 'Taiwan',
    'オーストラリア': 'Australia', '豪州': 'Australia', 'australia': 'Australia',
    'ニュージーランド': 'New Zealand', 'new zealand': 'New Zealand',
    'インドネシア': 'Indonesia', 'indonesia': 'Indonesia', 'タイ': 'Thailand', 'thailand': 'Thailand',
    'ベトナム': 'Vietnam', 'vietnam': 'Vietnam', 'マレーシア': 'Malaysia', 'malaysia': 'Malaysia',
    'フィリピン': 'Philippines', 'philippines': 'Philippines', 'ミャンマー': 'Myanmar', 'myanmar': 'Myanmar',
    'カンボジア': 'Cambodia', 'cambodia': 'Cambodia', 'ラオス': 'Laos', 'laos': 'Laos',
    'インド': 'India', 'india': 'India', 'ブラジル': 'Brazil', 'brazil': 'Brazil',
    'アメリカ': 'United States', '米国': 'United States', 'usa': 'United States', 'united states': 'United States',
    'カナダ': 'Canada', 'canada': 'Canada', 'メキシコ': 'Mexico', 'mexico': 'Mexico',
    'ロシア': 'Russia', 'russia': 'Russia', 'スペイン': 'Spain', 'spain': 'Spain',
    'ポルトガル': 'Portugal', 'portugal': 'Portugal', 'ギリシャ': 'Greece', 'greece': 'Greece',
    'イタリア': 'Italy', 'italy': 'Italy', 'フランス': 'France', 'france': 'France',
    'ドイツ': 'Germany', 'germany': 'Germany', 'イギリス': 'United Kingdom', 'uk': 'United Kingdom',
    'トルコ': 'Turkey', 'turkey': 'Turkey', 'ケニア': 'Kenya', 'kenya': 'Kenya',
    'ナイジェリア': 'Nigeria', 'nigeria': 'Nigeria', '南アフリカ': 'South Africa', 'south africa': 'South Africa',
    'コンゴ': 'Democratic Republic of the Congo', 'アルゼンチン': 'Argentina', 'argentina': 'Argentina',
    'チリ': 'Chile', 'chile': 'Chile', 'ペルー': 'Peru', 'peru': 'Peru', 'コロンビア': 'Colombia', 'colombia': 'Colombia',
  };

  const HOTSPOTS = [
    { key: 'Amazon', label: 'Amazon Basin (Arc of Deforestation)', lat: -8.5, lon: -58.0, radius_deg: 9.0, zoom: 2.15, region_key: 'Amazon', country: 'Brazil', exact_country: false, aliases: ['amazon', 'アマゾン', 'rondonia', 'ロンドニア', 'para', 'パラ', 'mato grosso'] },
    { key: 'Borneo_Sumatra', label: 'Borneo & Sumatra (Peat / Swidden)', lat: -1.5, lon: 113.5, radius_deg: 7.5, zoom: 2.25, region_key: 'Southeast_Asia', country: 'Indonesia', exact_country: false, aliases: ['borneo', 'ボルネオ', 'kalimantan', 'カリマンタン', 'sumatra', 'スマトラ', 'peatland', '泥炭'] },
    { key: 'California_USWest', label: 'Western US & California', lat: 38.5, lon: -121.0, radius_deg: 7.0, zoom: 2.25, region_key: 'North_America_Boreal', country: 'United States', exact_country: false, aliases: ['california', 'カリフォルニア', 'maui', 'マウイ', 'ハワイ', 'hawaii', 'oregon'] },
    { key: 'Siberia_FarEast', label: 'Siberia & Russian Far East', lat: 60.5, lon: 118.0, radius_deg: 11.0, zoom: 2.05, region_key: 'Siberia', country: 'Russia', exact_country: false, aliases: ['siberia', 'シベリア', 'yakutia', 'ヤクーツク', 'boreal', '北方林'] },
  ];

  const MACRO_REGIONS = [
    { key: 'Sub_Saharan_Africa', label: 'Sub-Saharan Africa (Savanna Swidden)', lat: -6.5, lon: 22.5, radius_deg: 12.0, zoom: 2.05, region_key: 'Central_Africa', country: '', exact_country: false, aliases: ['africa', 'アフリカ', 'savanna', 'サバンナ', 'central africa'] },
    { key: 'Indochina', label: 'Indochina Peninsula (Seasonal Swidden)', lat: 17.5, lon: 101.5, radius_deg: 7.0, zoom: 2.28, region_key: 'Southeast_Asia', country: '', exact_country: false, aliases: ['東南アジア', 'southeast asia', 'indochina', 'インドシナ', 'mekong'] },
    { key: 'Mediterranean', label: 'Mediterranean Basin', lat: 39.5, lon: 16.0, radius_deg: 9.0, zoom: 2.15, region_key: 'Mediterranean', country: '', exact_country: false, aliases: ['mediterranean', '地中海', 'europe', 'ヨーロッパ', '欧州'] },
    { key: 'East_Asia', label: 'East Asia', lat: 34.5, lon: 116.0, radius_deg: 11.0, zoom: 2.05, region_key: 'Global', country: '', exact_country: false, aliases: ['東アジア', 'east asia', 'アジア', 'asia'] },
  ];

  let _telemetryPromise = null;
  let _regionalPromise = null;
  let _globalWeeklyPromise = null;

  function loadJsonOnce(url, refName) {
    if (refName === 'tel' && _telemetryPromise) return _telemetryPromise;
    if (refName === 'reg' && _regionalPromise) return _regionalPromise;
    if (refName === 'gw' && _globalWeeklyPromise) return _globalWeeklyPromise;
    const p = fetch(url, { cache: 'default' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (refName === 'tel') _telemetryPromise = p;
    if (refName === 'reg') _regionalPromise = p;
    if (refName === 'gw') _globalWeeklyPromise = p;
    return p;
  }

  function maskKey(k) {
    const s = String(k || '').trim();
    if (!s) return '';
    if (s.length <= 10) return '*'.repeat(s.length);
    return `${s.slice(0, 6)}...${s.slice(-4)}`;
  }

  function sanitizeGeoText(raw) {
    return String(raw || '')
      .replace(/日本語|日本時間|日本標準時|リアルタイム|ライブ/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matchAlias(cleaned, lower, alias) {
    const al = alias.toLowerCase();
    if (/^[a-z0-9\s\-_.]+$/.test(al)) {
      const esc = al.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(lower);
    }
    return cleaned.includes(alias) || lower.includes(al);
  }

  function inferRegionKey(country, lat, lon) {
    const c = String(country || '').toLowerCase();
    if (c === 'australia') return 'Australia';
    if (['brazil', 'peru', 'colombia', 'bolivia', 'venezuela'].includes(c) && lat >= -25 && lat <= 12 && lon <= -34) return 'Amazon';
    if (['thailand', 'vietnam', 'myanmar', 'cambodia', 'laos', 'indonesia', 'malaysia', 'philippines'].includes(c)) return 'Southeast_Asia';
    if (['spain', 'portugal', 'greece', 'italy', 'turkey', 'france'].includes(c) && lat >= 34 && lat <= 46) return 'Mediterranean';
    if (c === 'russia' && lon >= 60 && lat >= 50) return 'Siberia';
    if (['canada', 'united states'].includes(c) && lat >= 48) return 'North_America_Boreal';
    if (lat >= -15 && lat <= 15 && lon >= 8 && lon <= 38) return 'Central_Africa';
    return 'Global';
  }

  function computeCountryLocation(countryName, cities) {
    const rows = cities.filter((c) => c.country === countryName);
    if (!rows.length) return null;
    const lats = rows.map((r) => r.lat);
    const lons = rows.map((r) => r.lon);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const cLat = (minLat + maxLat) / 2;
    const cLon = (minLon + maxLon) / 2;
    const span = Math.max(maxLat - minLat, maxLon - minLon);
    const rdeg = Math.max(3.6, Math.min(18.0, span * 0.65 + 2.2));
    const zoom = span < 5 ? 2.45 : (span < 12 ? 2.28 : (span < 25 ? 2.12 : 1.96));
    return {
      key: countryName,
      label: countryName,
      lat: Number(cLat.toFixed(3)),
      lon: Number(cLon.toFixed(3)),
      radius_deg: Number(rdeg.toFixed(2)),
      zoom: Number(zoom.toFixed(2)),
      region_key: inferRegionKey(countryName, cLat, cLon),
      country: countryName,
      exact_country: true,
    };
  }

  function resolveLocation(prompt, cities) {
    const raw = String(prompt || '').trim();
    const cleaned = sanitizeGeoText(raw);
    const lower = cleaned.toLowerCase();

    const coord = raw.match(/(-?\d{1,2}(?:\.\d+)?)\s*[,°\s]+\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (coord && !/20\d{2}/.test(coord[1])) {
      const lat = Number(coord[1]), lon = Number(coord[2]);
      if (lat >= -85 && lat <= 85 && lon >= -180 && lon <= 180) {
        return { key: 'Custom_Coords', label: `Custom (${lat.toFixed(2)}, ${lon.toFixed(2)})`, lat, lon, radius_deg: 6.5, zoom: 2.3, region_key: 'Global', country: '', exact_country: false };
      }
    }

    for (const [ja, en] of Object.entries(JA_CITY_ALIASES).sort((a, b) => b[0].length - a[0].length)) {
      if (matchAlias(cleaned, lower, ja)) {
        const hit = cities.find((c) => c.name.toLowerCase() === en.toLowerCase());
        if (hit) {
          return { key: hit.name, label: `${hit.name}, ${hit.country}`, lat: hit.lat, lon: hit.lon, radius_deg: 4.8, zoom: 2.42, region_key: inferRegionKey(hit.country, hit.lat, hit.lon), country: hit.country, exact_country: true, exact_city: hit.name };
        }
      }
    }

    for (const hs of HOTSPOTS) {
      if (hs.aliases.some((a) => matchAlias(cleaned, lower, a))) return { ...hs };
    }

    for (const [alias, countryName] of Object.entries(COUNTRY_ALIASES).sort((a, b) => b[0].length - a[0].length)) {
      if (matchAlias(cleaned, lower, alias)) {
        const loc = computeCountryLocation(countryName, cities);
        if (loc) return loc;
      }
    }

    const uniqCountries = [...new Set(cities.map((c) => c.country).filter((c) => c && c.length >= 4))].sort((a, b) => b.length - a.length);
    for (const cname of uniqCountries) {
      if (matchAlias(cleaned, lower, cname)) {
        const loc = computeCountryLocation(cname, cities);
        if (loc) return loc;
      }
    }

    if (/世界|グローバル|地球全体|global|worldwide/i.test(cleaned)) {
      return { key: 'Global', label: 'Global Overview', lat: 12.0, lon: 15.0, radius_deg: 180.0, zoom: 1.8, region_key: 'Global', country: '', exact_country: false, is_global: true };
    }

    for (const mr of MACRO_REGIONS) {
      if (mr.aliases.some((a) => matchAlias(cleaned, lower, a))) return { ...mr };
    }

    return computeCountryLocation('Japan', cities) || { ...HOTSPOTS[0] };
  }

  function parseTemporalIntent(prompt) {
    const q = String(prompt || '').trim();
    const lower = q.toLowerCase();
    let targetDate = null, targetYear = null, targetMonth = null, explicitDay = false;

    const mYmd = q.match(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})日?/);
    if (mYmd) {
      targetYear = Number(mYmd[1]);
      targetMonth = Number(mYmd[2]);
      targetDate = `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(Number(mYmd[3])).padStart(2, '0')}`;
      explicitDay = true;
    } else {
      const mYm = q.match(/(20\d{2})[-/年](\d{1,2})月?/);
      if (mYm) {
        targetYear = Number(mYm[1]);
        targetMonth = Number(mYm[2]);
        targetDate = `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-15`;
      } else {
        const qNoRange = q.replace(/20\d{2}\s*[-〜~–]\s*20\d{2}/g, ' ');
        const mY = qNoRange.match(/(?<!\d)(20(?:0\d|1\d|2[0-5]))(?!\d)/);
        if (mY) {
          targetYear = Number(mY[1]);
          targetDate = `${String(targetYear).padStart(4, '0')}-01-27`;
        }
      }
    }

    const isHist = /スライダー|過去|履歴|当時|振り返|推移|slider|timeline|historical|archive|history/i.test(lower);
    const isForecast = /7day|7-day|7日|予測|予報|forecast|今後|リスク|risk|prediction|来週/i.test(lower);
    const isDetect = /最新検知|ライブ|リアルタイム|今燃え|live|nrt|detections|カレンダー/i.test(lower);
    const isSwidden = /焼畑|焼き畑|野焼き|swidden|slash|persistent/i.test(lower);
    const isWeather = /天気|気象|weather|気温|湿度|降水|乾燥|vpd/i.test(lower);

    let mode = 'auto';
    if (targetYear !== null || isHist) mode = 'historical_slider';
    else if (isForecast) mode = 'forecast_7d';
    else if (isDetect) mode = 'live_detect';
    else if (isSwidden) mode = 'swidden';
    else if (isWeather) mode = 'forecast_7d';

    return { mode, year: targetYear, month: targetMonth, date: targetDate, explicit_day: explicitDay };
  }

  async function callGeminiDirect(apiKey, model, payload) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 11000);
    const t0 = performance.now();
    try {
      const res = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.error?.message || `HTTP ${res.status}`, latency_ms: Math.round(performance.now() - t0) };
      return { ok: true, data: json, latency_ms: Math.round(performance.now() - t0) };
    } catch (err) {
      return { ok: false, error: err.message || 'Network error', latency_ms: Math.round(performance.now() - t0) };
    } finally {
      clearTimeout(timer);
    }
  }

  async function getConfig(localKey) {
    const tel = await loadJsonOnce('./data/static_telemetry.json', 'tel');
    const saved = String(localKey || localStorage.getItem('firms_gemini_api_key') || '').trim();
    return {
      ok: true,
      static_mode: true,
      has_key: Boolean(saved),
      masked_key: maskKey(saved),
      default_key: '',
      model: localStorage.getItem('firms_gemini_model') || MODELS_CASCADE[0],
      models: MODELS_CASCADE,
      parquets: tel?.parquet_meta || [],
    };
  }

  async function verifyKey(apiKey, model) {
    const key = String(apiKey || '').trim();
    if (!key) return { ok: false, error: 'API key is required.' };
    const order = [model, ...MODELS_CASCADE.filter((m) => m !== model)].slice(0, 2);
    let lastErr = '';
    for (const m of order) {
      const res = await callGeminiDirect(key, m, {
        contents: [{ role: 'user', parts: [{ text: 'Reply strictly with: OK' }] }],
        generationConfig: { maxOutputTokens: 12, temperature: 0 },
      });
      if (res.ok) return { ok: true, model: m, masked_key: maskKey(key), latency_ms: res.latency_ms };
      lastErr = res.error;
    }
    return { ok: false, error: lastErr || 'Verification failed' };
  }

  async function analyzeQuery({ prompt, apiKey, model }) {
    const q = String(prompt || '').trim();
    if (!q) return { ok: false, error: 'Prompt is required.' };
    const tel = await loadJsonOnce('./data/static_telemetry.json', 'tel');
    if (!tel) return { ok: false, error: 'Static telemetry JSON failed to load.' };

    const regSummary = await loadJsonOnce('./data/regional_yearly_summary.json', 'reg');
    const globalWeekly = await loadJsonOnce('./data/global_weekly_timeseries.json', 'gw');

    const cities = tel.cities || [];
    const loc = resolveLocation(q, cities);
    const temporal = parseTemporalIntent(q);

    const latMin = loc.is_global ? -85 : Number((loc.lat - loc.radius_deg).toFixed(2));
    const latMax = loc.is_global ? 85 : Number((loc.lat + loc.radius_deg).toFixed(2));
    const lonMin = loc.is_global ? -180 : Number((loc.lon - loc.radius_deg).toFixed(2));
    const lonMax = loc.is_global ? 180 : Number((loc.lon + loc.radius_deg).toFixed(2));

    let wsub = loc.is_global
      ? cities
      : (loc.exact_country && loc.country
          ? cities.filter((c) => c.country === loc.country)
          : cities.filter((c) => c.lat >= latMin && c.lat <= latMax && c.lon >= lonMin && c.lon <= lonMax));
    if (!wsub.length && !loc.is_global) {
      wsub = cities.filter((c) => c.lat >= latMin && c.lat <= latMax && c.lon >= lonMin && c.lon <= lonMax);
    }

    const avg = (arr, fn) => {
      const vals = arr.map(fn).filter((v) => typeof v === 'number' && !Number.isNaN(v));
      return vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null;
    };

    const topCities = [...wsub]
      .sort((a, b) => (loc.exact_city ? (b.name === loc.exact_city ? 1 : 0) - (a.name === loc.exact_city ? 1 : 0) : 0) || (b.risk_p - a.risk_p))
      .slice(0, 5);

    const weatherStats = {
      source: 'static_telemetry.json (NASA POWER 30d)',
      city_count: wsub.length,
      mean_risk_p: avg(wsub, (r) => r.risk_p),
      tmax_mean_7: avg(wsub, (r) => r.tmax_mean_7),
      rh_mean_7: avg(wsub, (r) => r.rh_mean_7),
      precip_sum_30: avg(wsub, (r) => r.precip_sum_30),
      days_since_rain: avg(wsub, (r) => r.days_since_rain),
      vpd_mean_7: avg(wsub, (r) => r.vpd_mean_7),
      top_cities: topCities,
    };

    const pGrid = (tel.persistent_cells_2deg || []).filter((g) => loc.is_global || (g.lat >= latMin - 1 && g.lat <= latMax + 1 && g.lon >= lonMin - 1 && g.lon <= lonMax + 1));
    const totCells = pGrid.reduce((s, g) => s + (g.total || 0), 0);
    const swidCells = pGrid.reduce((s, g) => s + (g.swidden || 0), 0);
    const episCells = pGrid.reduce((s, g) => s + (g.episodic || 0), 0);
    const indCells = pGrid.reduce((s, g) => s + (g.industrial || 0), 0);
    const swiddenStats = {
      total_persistent_cells: totCells,
      swidden_cells: swidCells,
      swidden_share_pct: totCells ? Number(((swidCells / totCells) * 100).toFixed(1)) : 0,
      episodic_wildfire_cells: episCells,
      industrial_static_cells: indCells,
    };

    const swiddenPoints = (tel.swidden_samples || [])
      .map((p) => (Array.isArray(p) ? { lat: p[0], lon: p[1], t: p[2], kind: 'swidden' } : p))
      .filter((p) => loc.is_global || (p.lat >= latMin && p.lat <= latMax && p.lon >= lonMin && p.lon <= lonMax))
      .slice(0, 120000);

    let peakDate = temporal.date || '2023-08-14';
    if (Array.isArray(globalWeekly) && temporal.year) {
      const yrPrefix = `${temporal.year}-`;
      const moPrefix = temporal.month ? `${temporal.year}-${String(temporal.month).padStart(2, '0')}` : null;
      const cand = globalWeekly
        .filter((w) => String(w.week_date || w.date || '').startsWith(moPrefix || yrPrefix))
        .sort((a, b) => (b.viirs_frp_gw || b.v_frp || 0) - (a.viirs_frp_gw || a.v_frp || 0));
      if (cand.length && !temporal.explicit_day) {
        peakDate = cand[0].week_date || cand[0].date || peakDate;
      }
    }

    let ratio = null;
    if (Array.isArray(regSummary)) {
      const m = regSummary.filter((r) => r.region === loc.region_key && r.viirs_to_modis_ratio);
      if (m.length) ratio = Number(Number(m[m.length - 1].viirs_to_modis_ratio).toFixed(2));
    }

    let mode = temporal.mode;
    if (mode === 'auto') {
      mode = (swiddenStats.swidden_share_pct >= 35 && swiddenStats.swidden_cells >= 500) ? 'swidden' : 'forecast_7d';
    }
    const tab = mode === 'forecast_7d' ? 'tab-risk' : (mode === 'historical_slider' ? 'tab-trend' : (mode === 'live_detect' ? 'tab-detect' : 'tab-risk'));
    const layer = mode === 'forecast_7d' ? 'risk' : (mode === 'historical_slider' ? 'viirs' : (mode === 'live_detect' ? 'detect' : 'swidden'));

    const telemetry = {
      bbox: { lat_min: latMin, lat_max: latMax, lon_min: lonMin, lon_max: lonMax },
      swidden: swiddenStats,
      weather: weatherStats,
      harmonization: { viirs_to_modis_ratio: ratio, peak_date: peakDate, target_date: peakDate },
      temporal,
    };

    let reply = `${loc.label}（中心 ${loc.lat}°, ${loc.lon}°）を対象に拡大表示しました。NASA POWER 気象は最高気温 ${weatherStats.tmax_mean_7 ?? '--'}°C・湿度 ${weatherStats.rh_mean_7 ?? '--'}%・30日降水 ${weatherStats.precip_sum_30 ?? '--'} mm・VPD ${weatherStats.vpd_mean_7 ?? '--'} kPa、7日間火災リスク平均 ${weatherStats.mean_risk_p ?? '--'} です。持続セルは計 ${totCells.toLocaleString()} 点（周期的焼畑/農地パターン ${swidCells.toLocaleString()} 点, ${swiddenStats.swidden_share_pct}%）です。`;
    let usedModel = 'static-telemetry-fallback';
    let latencyMs = 0;

    const cleanKey = String(apiKey || localStorage.getItem('firms_gemini_api_key') || '').trim();
    if (cleanKey) {
      const payload = {
        systemInstruction: { parts: [{ text: 'You are an expert NASA FIRMS wildfire, 7-day weather risk, and swidden agriculture analyst. Reply in JSON {"reply": "..."} in the same language as the user prompt (3-5 concise sentences citing only the provided telemetry numbers, no emojis).' }] },
        contents: [{ role: 'user', parts: [{ text: `Prompt: ${q}\nLocation: ${JSON.stringify(loc)}\nTelemetry: ${JSON.stringify(telemetry)}` }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 500 },
      };
      const order = [model || MODELS_CASCADE[0], ...MODELS_CASCADE.filter((m) => m !== model)].slice(0, 2);
      for (const m of order) {
        const res = await callGeminiDirect(cleanKey, m, payload);
        if (res.ok) {
          try {
            const parsed = JSON.parse(res.data.candidates[0].content.parts[0].text);
            if (parsed.reply) {
              reply = parsed.reply;
              usedModel = `${m} (browser-byok)`;
              latencyMs = res.latency_ms;
              break;
            }
          } catch (_) {}
        }
      }
    }

    const actions = {
      mode,
      flyTo: { lat: loc.lat, lon: loc.lon, zoom: loc.zoom },
      layer,
      highlightRange: {
        lat: loc.lat, lon: loc.lon, radiusDeg: loc.radius_deg,
        label: loc.label,
        sublabel: `Risk ${weatherStats.mean_risk_p ?? '--'} · Tmax ${weatherStats.tmax_mean_7 ?? '--'}°C · Swidden ${swidCells.toLocaleString()}`,
      },
      analytics: {
        open: true, tab, country: loc.country || '', strictCountry: Boolean(loc.exact_country),
        region: loc.region_key || 'Global', bbox: telemetry.bbox, year: temporal.year ? String(temporal.year) : null,
      },
    };
    if (mode === 'historical_slider') {
      actions.timeline = { action: 'jump', date: peakDate, year: peakDate.slice(0, 4), layer: 'viirs' };
    }

    return {
      ok: true, static_mode: true, model: usedModel, llm_latency_ms: latencyMs,
      location: loc, telemetry, swidden_points: swiddenPoints, reply, actions,
      tour_steps: [{ title: `${loc.label} Focus`, flyTo: actions.flyTo, layer, timeline: actions.timeline || null, analytics: actions.analytics }],
    };
  }

  global.StaticCopilot = { getConfig, verifyKey, analyzeQuery };
})(window);
