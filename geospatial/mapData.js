(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SensePathGeo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COMMUNITY_TTL_MS = 2 * 60 * 60 * 1000;
  const STALE_AFTER_MS = 15 * 60 * 1000;
  const CATEGORY_LABELS = Object.freeze({
    construction: 'Construction',
    loud: 'Loud events',
    roadworks: 'Roadworks',
    crowds: 'Crowds'
  });

  function asDate(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number' && Number.isFinite(value)) {
      const milliseconds = value < 1e12 ? value * 1000 : value;
      const date = new Date(milliseconds);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value !== 'string' || value.trim() === '') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function validCoordinates(latitude, longitude) {
    const lat = numberOrNull(latitude);
    const lng = numberOrNull(longitude);
    return lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeCommunityReport(input) {
    const report = input || {};
    if (!Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, report.type)) {
      return { valid: false, error: 'invalid_category' };
    }
    if (!validCoordinates(report.lat, report.lng)) {
      return { valid: false, error: 'invalid_location' };
    }

    const createdAt = asDate(report.createdAt);
    if (!createdAt) return { valid: false, error: 'invalid_created_time' };
    const expiresAt = asDate(report.expiresAt) || new Date(createdAt.getTime() + COMMUNITY_TTL_MS);
    if (expiresAt <= createdAt) return { valid: false, error: 'invalid_expiry_time' };

    return {
      valid: true,
      value: {
        id: String(report.id || report.submissionKey || ''),
        submissionKey: String(report.submissionKey || report.id || ''),
        type: report.type,
        categoryLabel: CATEGORY_LABELS[report.type],
        approximateLocation: String(report.approximateLocation || 'Approximate location unavailable'),
        lat: Number(report.lat),
        lng: Number(report.lng),
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        sourceKind: 'community'
      }
    };
  }

  function inBounds(report, bounds) {
    if (!bounds) return true;
    return report.lat >= bounds.south && report.lat <= bounds.north &&
      report.lng >= bounds.west && report.lng <= bounds.east;
  }

  function activeCommunityReports(reports, options) {
    const settings = options || {};
    const now = asDate(settings.now) || new Date();
    const seenSubmissionKeys = new Set();
    const active = [];

    (reports || []).forEach(function (input) {
      const normalized = normalizeCommunityReport(input);
      if (!normalized.valid) return;
      const report = normalized.value;
      if (!report.submissionKey || seenSubmissionKeys.has(report.submissionKey)) return;
      seenSubmissionKeys.add(report.submissionKey);
      if (new Date(report.expiresAt) <= now) return;
      if (!inBounds(report, settings.bounds)) return;
      active.push(report);
    });

    return active.sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  function filterCommunityReports(reports, filters) {
    const enabled = filters || {};
    return (reports || []).filter(function (report) { return enabled[report.type] === true; });
  }

  function formatAge(createdAt, now) {
    const created = asDate(createdAt);
    const reference = asDate(now) || new Date();
    if (!created) return 'Age unavailable';
    const minutes = Math.max(0, Math.floor((reference - created) / 60000));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return minutes + ' min ago';
    const hours = Math.floor(minutes / 60);
    return hours + (hours === 1 ? ' hour ago' : ' hours ago');
  }

  function dataState(lastUpdatedAt, options) {
    const settings = options || {};
    const now = asDate(settings.now) || new Date();
    const updated = asDate(lastUpdatedAt);
    if (settings.serviceAvailable === false) {
      return { status: 'unavailable', label: 'Community reports unavailable', lastUpdatedAt: updated };
    }
    if (!updated || now - updated > (settings.staleAfterMs || STALE_AFTER_MS)) {
      return { status: 'stale', label: 'Cached community reports', lastUpdatedAt: updated };
    }
    return { status: 'live', label: 'Community reports available', lastUpdatedAt: updated };
  }

  function translatedText(value) {
    if (typeof value === 'string') return value || null;
    const translations = value && (value.translation || value.translations);
    if (!Array.isArray(translations) || translations.length === 0) return null;
    return translations[0].text || null;
  }

  function normalizeGtfsAlerts(feed, options) {
    const settings = options || {};
    const now = asDate(settings.now) || new Date();
    const header = (feed && feed.header) || {};
    const observedAt = asDate(header.timestamp || feed.observedAt);
    const freshness = dataState(observedAt, {
      now: now,
      serviceAvailable: settings.serviceAvailable !== false,
      staleAfterMs: settings.staleAfterMs || 5 * 60 * 1000
    });
    const entities = (feed && (feed.entity || feed.entities)) || [];

    return entities.map(function (entity) {
      const alert = entity.alert || entity;
      const informed = (alert.informed_entity || alert.informedEntity || [])[0] || {};
      const period = (alert.active_period || alert.activePeriod || [])[0] || {};
      return {
        kind: 'transport_disruption',
        sourceCode: 'transport_vic_gtfs_realtime',
        sourceName: 'Transport Victoria GTFS-Realtime',
        sourceUrl: 'https://opendata.transport.vic.gov.au/dataset/gtfs-realtime',
        observedAt: observedAt ? observedAt.toISOString() : null,
        staleAt: observedAt ? new Date(observedAt.getTime() + 5 * 60 * 1000).toISOString() : null,
        qualityStatus: freshness.status,
        affectedService: {
          routeId: informed.route_id || informed.routeId || null,
          stopId: informed.stop_id || informed.stopId || null
        },
        activeFrom: asDate(period.start) ? asDate(period.start).toISOString() : null,
        activeUntil: asDate(period.end) ? asDate(period.end).toISOString() : null,
        cause: alert.cause || null,
        effect: alert.effect || null,
        headline: translatedText(alert.header_text || alert.headerText) || 'Transport disruption',
        description: translatedText(alert.description_text || alert.descriptionText)
      };
    });
  }

  function parseBomTimestamp(value) {
    if (typeof value === 'string' && /^\d{14}$/.test(value)) {
      return asDate(value.slice(0, 4) + '-' + value.slice(4, 6) + '-' + value.slice(6, 8) + 'T' +
        value.slice(8, 10) + ':' + value.slice(10, 12) + ':' + value.slice(12, 14) + 'Z');
    }
    return asDate(value);
  }

  function normalizeBomWeather(feed, options) {
    const settings = options || {};
    const now = asDate(settings.now) || new Date();
    const observations = (feed && feed.observations) || {};
    const header = (observations.header && observations.header[0]) || feed.header || {};
    const record = (observations.data && observations.data[0]) || feed.data || {};
    const observedAt = parseBomTimestamp(record.aifstime_utc || record.observedAt || feed.observedAt);
    const freshness = dataState(observedAt, {
      now: now,
      serviceAvailable: settings.serviceAvailable !== false,
      staleAfterMs: settings.staleAfterMs || 30 * 60 * 1000
    });

    return {
      kind: 'weather_context',
      sourceCode: 'bom_observations',
      sourceName: 'Bureau of Meteorology observations',
      sourceUrl: 'https://www.bom.gov.au/catalogue/data-feeds.shtml',
      observedAt: observedAt ? observedAt.toISOString() : null,
      staleAt: observedAt ? new Date(observedAt.getTime() + 30 * 60 * 1000).toISOString() : null,
      qualityStatus: freshness.status,
      location: {
        stationId: record.wmo || header.ID || null,
        name: record.name || header.name || null,
        latitude: numberOrNull(record.lat),
        longitude: numberOrNull(record.lon)
      },
      metrics: {
        airTemperatureC: numberOrNull(record.air_temp),
        apparentTemperatureC: numberOrNull(record.apparent_t),
        rainSince9amMm: numberOrNull(record.rain_trace),
        windGustKmh: numberOrNull(record.gust_kmh),
        weather: record.weather || null
      }
    };
  }

  return Object.freeze({
    COMMUNITY_TTL_MS: COMMUNITY_TTL_MS,
    CATEGORY_LABELS: CATEGORY_LABELS,
    activeCommunityReports: activeCommunityReports,
    dataState: dataState,
    escapeHtml: escapeHtml,
    filterCommunityReports: filterCommunityReports,
    formatAge: formatAge,
    normalizeBomWeather: normalizeBomWeather,
    normalizeCommunityReport: normalizeCommunityReport,
    normalizeGtfsAlerts: normalizeGtfsAlerts,
    validCoordinates: validCoordinates
  });
});
