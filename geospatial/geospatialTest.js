'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Geo = require('./mapData.js');

const fixture = function (name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
};

const NOW = new Date('2026-08-06T04:05:00Z');

function report(overrides) {
  return Object.assign({
    id: 'r1',
    submissionKey: 'submission-1',
    type: 'crowds',
    approximateLocation: 'Swanston Street, Melbourne',
    lat: -37.8142,
    lng: 144.9635,
    createdAt: '2026-08-06T03:55:00Z'
  }, overrides || {});
}

const tests = [
  ['valid report receives the documented two-hour expiry', function () {
    const normalized = Geo.normalizeCommunityReport(report());
    assert.equal(normalized.valid, true);
    assert.equal(normalized.value.expiresAt, '2026-08-06T05:55:00.000Z');
    assert.equal(normalized.value.sourceKind, 'community');
  }],
  ['expired report is excluded from the active set', function () {
    const expired = report({ createdAt: '2026-08-06T01:00:00Z' });
    assert.deepEqual(Geo.activeCommunityReports([expired], { now: NOW }), []);
  }],
  ['invalid category and missing location are rejected', function () {
    assert.equal(Geo.normalizeCommunityReport(report({ type: 'unknown' })).error, 'invalid_category');
    assert.equal(Geo.normalizeCommunityReport(report({ lat: null })).error, 'invalid_location');
  }],
  ['duplicate submission key creates only one active marker record', function () {
    const duplicate = report({ id: 'r2' });
    assert.equal(Geo.activeCommunityReports([report(), duplicate], { now: NOW }).length, 1);
  }],
  ['visible-area and category filters work without mutating the source', function () {
    const source = [report(), report({ id: 'r2', submissionKey: 'submission-2', type: 'roadworks', lng: 145.5 })];
    const visible = Geo.activeCommunityReports(source, {
      now: NOW,
      bounds: { south: -38, north: -37, west: 144, east: 145 }
    });
    assert.equal(visible.length, 1);
    assert.equal(Geo.filterCommunityReports(visible, { crowds: true }).length, 1);
    assert.equal(source.length, 2);
  }],
  ['stale and unavailable service states retain last-updated evidence', function () {
    const stale = Geo.dataState('2026-08-06T03:00:00Z', { now: NOW });
    const unavailable = Geo.dataState('2026-08-06T03:00:00Z', { now: NOW, serviceAvailable: false });
    assert.equal(stale.status, 'stale');
    assert.equal(unavailable.status, 'unavailable');
    assert.equal(unavailable.lastUpdatedAt.toISOString(), '2026-08-06T03:00:00.000Z');
  }],
  ['GTFS-Realtime fixture retains source, time and affected service', function () {
    const features = Geo.normalizeGtfsAlerts(fixture('gtfs-service-alert.fixture.json'), { now: NOW });
    assert.equal(features.length, 1);
    assert.equal(features[0].sourceCode, 'transport_vic_gtfs_realtime');
    assert.equal(features[0].observedAt, '2026-08-06T04:00:00.000Z');
    assert.equal(features[0].affectedService.routeId, '96');
    assert.equal(features[0].qualityStatus, 'live');
  }],
  ['BOM fixture retains station/time and uses null for unsupported fields', function () {
    const feed = fixture('bom-weather.fixture.json');
    delete feed.observations.data[0].gust_kmh;
    const feature = Geo.normalizeBomWeather(feed, { now: NOW });
    assert.equal(feature.sourceCode, 'bom_observations');
    assert.equal(feature.observedAt, '2026-08-06T04:00:00.000Z');
    assert.equal(feature.location.stationId, '95936');
    assert.equal(feature.metrics.windGustKmh, null);
    assert.notEqual(feature.metrics.rainSince9amMm, null);
  }]
];

let passed = 0;
tests.forEach(function (entry) {
  try {
    entry[1]();
    passed += 1;
    console.log('PASS:', entry[0]);
  } catch (error) {
    console.error('FAIL:', entry[0]);
    throw error;
  }
});

console.log('\n' + passed + '/' + tests.length + ' geospatial and data-quality tests passed.');
