// Detroit Rock — the map and the show list.
// Data comes from data/venues.json and data/shows.json (see js/data.js).

import { loadData, startOfDay, addMonths, addDays, WINDOW_MONTHS } from './data.js';
import { h, plural } from './dom.js';

const HOME_REGION = 'Metro Detroit'; // the area the site opens on
const ALL = ''; // "no filter" value for the selects
// Shows and venues marked "label": "hidden" in the JSON stay off the site
// until a visitor types this into the search box (lower case, no accents).
const SECRET_PHRASE = 'stairway to heaven';
const MOBILE = window.matchMedia('(max-width: 820px)');
const CALM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const today = startOfDay(new Date());
const windowEnd = addMonths(today, WINDOW_MONTHS);

const state = { q: '', region: ALL, when: 'window', genre: ALL, venueId: null };

let venues = [];
let upcoming = []; // every show that has not happened yet, soonest first
let current = { base: [], listed: [], perVenue: new Map() };
let map = null;
let cluster = null;
const markers = new Map(); // venue id -> Leaflet marker

const $ = (id) => document.getElementById(id);
const ui = {
  app: $('app'),
  q: $('q'),
  region: $('region'),
  when: $('when'),
  genre: $('genre'),
  count: $('count'),
  clear: $('clear'),
  chip: $('venueChip'),
  chipName: $('venueChipName'),
  chipMeta: $('venueChipMeta'),
  chipClose: $('venueChipClose'),
  scroll: $('scroll'),
  shows: $('shows'),
  foot: $('foot'),
  hint: $('mapHint'),
  reset: $('resetView'),
};

/* ---------- small helpers ---------- */

const fmt = (options) => new Intl.DateTimeFormat('en-US', options);
const fmtDow = fmt({ weekday: 'short' });
const fmtMon = fmt({ month: 'short' });
const fmtMonthYear = fmt({ month: 'long', year: 'numeric' });
const fmtShort = fmt({ weekday: 'short', month: 'short', day: 'numeric' });
const fmtLong = fmt({ month: 'long', day: 'numeric', year: 'numeric' });

// Lower-case and strip accents so "voila" finds "VOILÀ".
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

const lastDay = (show) => show.endDate || show.date;

/* ---------- date ranges for the "When" filter ---------- */

function whenRange(key) {
  if (key === 'today') return { from: today, to: today };
  if (key === 'week') return { from: today, to: addDays(today, 6) };
  if (key === 'month') return { from: today, to: addDays(today, 29) };
  if (key === 'weekend') {
    const dow = today.getDay(); // 0 Sunday ... 6 Saturday
    if (dow === 0) return { from: today, to: today };
    const friday = addDays(today, dow === 6 ? -1 : 5 - dow);
    return { from: friday < today ? today : friday, to: addDays(friday, 2) };
  }
  if (key === 'later') return { from: addDays(windowEnd, 1), to: null };
  if (key.startsWith('m:')) {
    const [year, month] = key.slice(2).split('-').map(Number);
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);
    return { from: first < today ? today : first, to: last > windowEnd ? windowEnd : last };
  }
  return { from: today, to: windowEnd };
}

const inRange = (show, range) => lastDay(show) >= range.from && (!range.to || show.date <= range.to);

/* ---------- filtering ---------- */

// Typing the secret phrase swaps the site over to the hidden local shows.
const unlocked = () => fold(state.q).replace(/\s+/g, ' ').includes(SECRET_PHRASE);

function compute() {
  const range = whenRange(state.when);
  const secret = unlocked();
  const words = fold(state.q).replace(/\s+/g, ' ').replace(SECRET_PHRASE, ' ').split(/\s+/).filter(Boolean);
  const base = upcoming.filter(
    (s) =>
      s.hidden === secret &&
      inRange(s, range) &&
      (!state.genre || s.genres.includes(state.genre)) &&
      words.every((w) => s.hay.includes(w))
  );
  const perVenue = new Map();
  for (const s of base) perVenue.set(s.venue.id, (perVenue.get(s.venue.id) || 0) + 1);
  const listed = base.filter((s) =>
    // The secret list ignores the area filter: it is short and statewide.
    state.venueId ? s.venue.id === state.venueId : secret || !state.region || s.venue.region === state.region
  );
  return { base, listed, perVenue };
}

const narrowed = () => Boolean(state.q || state.genre || state.venueId || state.when !== 'window');

/* ---------- the list ---------- */

function statusClass(status) {
  if (/sold\s*out/i.test(status)) return 'tag tag--soldout';
  return 'tag tag--alert';
}

function showRow(show) {
  const { venue } = show;
  const isToday = show.date <= today && lastDay(show) >= today;
  const cancelled = /cancel/i.test(show.status);

  const times = [];
  if (show.doors) times.push(`Doors ${show.doors.label}`);
  if (show.time) times.push(show.doors ? `Show ${show.time.label}` : show.time.label);
  const meta = [venue.city, ...times, show.ages, show.price].filter(Boolean);

  const link = show.tickets || venue.website;
  const dateLabel = show.endDate ? `${fmtShort.format(show.date)} to ${fmtShort.format(show.endDate)}` : null;

  return h(
    'li',
    { class: `show${isToday ? ' show--today' : ''}${cancelled ? ' show--cancelled' : ''}` },
    h(
      'button',
      { type: 'button', class: 'show__main', title: 'Show this venue on the map', onclick: () => focusVenue(venue.id) },
      h(
        'span',
        { class: 'show__date' },
        h('span', { class: 'show__dow', text: isToday ? 'Today' : fmtDow.format(show.date) }),
        h('span', { class: 'show__day', text: String(show.date.getDate()) }),
        h('span', { class: 'show__mon', text: fmtMon.format(show.date) })
      ),
      h(
        'span',
        { class: 'show__body' },
        h('span', { class: 'show__artist', text: show.artist }),
        show.support.length > 0 && h('span', { class: 'show__support', text: `with ${show.support.join(', ')}` }),
        h(
          'span',
          { class: 'show__meta' },
          h('span', { class: 'show__venue', text: show.room ? `${venue.name} (${show.room})` : venue.name }),
          meta.length > 0 && ` · ${meta.join(' · ')}`
        ),
        (show.notes || dateLabel) &&
          h('span', { class: 'show__notes', text: [dateLabel, show.notes].filter(Boolean).join(' · ') }),
        h(
          'span',
          { class: 'show__tags' },
          show.status && h('span', { class: statusClass(show.status), text: show.status }),
          show.genres.map((g) => h('span', { class: 'tag', text: g }))
        )
      )
    ),
    link &&
      h(
        'div',
        { class: 'show__side' },
        h('a', {
          class: `ticket${show.tickets ? '' : ' ticket--quiet'}`,
          href: link,
          target: '_blank',
          rel: 'noopener',
          'aria-label': `${show.tickets ? 'Tickets' : 'Venue site'} for ${show.artist} (opens in a new tab)`,
          text: show.tickets ? 'Tickets' : 'Venue site',
        })
      )
  );
}

function renderList() {
  const { listed, base } = current;
  const out = document.createDocumentFragment();

  if (listed.length === 0) {
    // How many shows would match if the area filter were lifted.
    const elsewhere = !state.venueId && state.region ? base.length : 0;
    let advice = 'Try a different search, date or genre.';
    if (elsewhere === 1) advice = `Nothing in ${state.region}, but there is 1 match elsewhere in Michigan.`;
    if (elsewhere > 1) advice = `Nothing in ${state.region}, but there are ${elsewhere} matches elsewhere in Michigan.`;
    out.append(
      h(
        'li',
        { class: 'empty' },
        h('strong', { text: upcoming.length ? 'No shows match.' : 'No upcoming shows in the data yet.' }),
        upcoming.length > 0 && advice,
        elsewhere > 0 &&
          h('div', null, h('button', { type: 'button', class: 'linkbtn', onclick: () => setRegion(ALL), text: 'Search all of Michigan' }))
      )
    );
  }

  let monthKey = '';
  let monthCount = null;
  for (const show of listed) {
    // A long-running event that began last month is filed under this month.
    const anchor = show.date < today ? today : show.date;
    const key = `${anchor.getFullYear()}-${anchor.getMonth()}`;
    if (key !== monthKey) {
      monthKey = key;
      monthCount = h('span', { class: 'month__count' });
      monthCount.n = 0;
      out.append(h('li', { class: 'month' }, h('h2', { class: 'month__name', text: fmtMonthYear.format(anchor) }), monthCount));
    }
    monthCount.n += 1;
    monthCount.textContent = plural(monthCount.n, 'show');
    out.append(showRow(show));
  }

  ui.shows.replaceChildren(out);
}

// The date filter as it reads in a sentence: "in the next 6 months".
function whenPhrase() {
  const key = state.when;
  if (key === 'today') return 'today';
  if (key === 'weekend') return 'this weekend';
  if (key === 'week') return 'in the next 7 days';
  if (key === 'month') return 'in the next 30 days';
  if (key === 'later') return `after ${fmtMon.format(windowEnd)} ${windowEnd.getDate()}`;
  if (key.startsWith('m:')) return `in ${ui.when.selectedOptions[0].text}`;
  return `in the next ${WINDOW_MONTHS} months`;
}

function renderSummary() {
  const { listed } = current;
  const venueCount = new Set(listed.map((s) => s.venue.id)).size;
  ui.count.replaceChildren(
    h('strong', { text: plural(listed.length, 'show') }),
    listed.length > 0 && !state.venueId ? ` at ${plural(venueCount, 'venue')}` : '',
    ` ${whenPhrase()}`
  );
  ui.clear.hidden = !narrowed();

  const venue = state.venueId && venues.find((v) => v.id === state.venueId);
  ui.chip.hidden = !venue;
  if (venue) {
    ui.chipName.textContent = venue.name;
    ui.chipMeta.textContent = [venue.address, venue.city].filter(Boolean).join(', ');
  }

  ui.when.classList.toggle('is-set', state.when !== 'window');
  ui.genre.classList.toggle('is-set', Boolean(state.genre));
}

/* ---------- the map ---------- */

function venueIcon(count, active) {
  const size = count === 0 ? 24 : count < 5 ? 28 : count < 15 ? 32 : 38;
  return L.divIcon({
    className: `vm${count ? '' : ' vm--empty'}${active ? ' vm--active' : ''}`,
    html: count ? `<span>${count}</span>` : '<span></span>',
    iconSize: [size, size],
  });
}

function clusterIcon(group) {
  const total = group.getAllChildMarkers().reduce((sum, m) => sum + (m.options.showCount || 0), 0);
  const size = total < 10 ? 40 : total < 100 ? 46 : 54;
  return L.divIcon({
    className: `vc${total ? '' : ' vc--empty'}`,
    html: `<span>${total}</span>`,
    iconSize: [size, size],
  });
}

function popupFor(venue) {
  const mine = current.base.filter((s) => s.venue.id === venue.id);
  const directions =
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent([venue.name, venue.address, venue.city, 'MI'].filter(Boolean).join(', '));

  return h(
    'div',
    { class: 'pop' },
    h('h3', { class: 'pop__name', text: venue.name }),
    h('p', { class: 'pop__addr', text: [venue.address, venue.city].filter(Boolean).join(', ') }),
    venue.note && h('p', { class: 'pop__note', text: venue.note }),
    mine.length > 0
      ? h(
          'ul',
          { class: 'pop__shows' },
          mine.slice(0, 3).map((s) =>
            h('li', null, h('span', { class: 'pop__when', text: fmtShort.format(s.date) }), h('span', { text: s.artist }))
          )
        )
      : h('p', {
          class: 'pop__none',
          text: narrowed() ? 'No shows here match your filters.' : 'No shows listed here for the next six months.',
        }),
    mine.length > 3 && h('p', { class: 'pop__more', text: `and ${mine.length - 3} more` }),
    h(
      'p',
      { class: 'pop__actions' },
      mine.length > 0 &&
        h('button', {
          type: 'button',
          class: 'pop__all',
          text: mine.length === 1 ? 'See it in the list' : `See all ${mine.length} in the list`,
          onclick: () => revealList(),
        }),
      venue.website && h('a', { href: venue.website, target: '_blank', rel: 'noopener', text: 'Venue site' }),
      h('a', { href: directions, target: '_blank', rel: 'noopener', text: 'Directions' })
    )
  );
}

function buildMap() {
  if (!window.L || !L.markerClusterGroup) {
    $('map').append(h('p', { class: 'mapfail', text: 'The map could not load. The show list still works.' }));
    ui.reset.hidden = true;
    ui.hint.hidden = true;
    return;
  }

  map = L.map('map', {
    center: [44.2, -85.4],
    zoom: 6,
    minZoom: 5,
    maxZoom: 18,
    maxBounds: [
      [39.5, -93.5],
      [50, -79],
    ],
    maxBoundsViscosity: 0.7,
    zoomControl: false,
    zoomAnimation: !CALM,
    fadeAnimation: !CALM,
    markerZoomAnimation: !CALM,
  });
  L.control.zoom({ position: 'topright' }).addTo(map);
  // OpenStreetMap's own tiles: free, no account or key. The dark look comes
  // from a colour filter in css/styles.css (.leaflet-tile-pane).
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  cluster = L.markerClusterGroup({
    maxClusterRadius: 42,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    spiderLegPolylineOptions: { weight: 1.5, color: '#ffffff', opacity: 0.55 },
    animate: !CALM,
    iconCreateFunction: clusterIcon,
  });

  for (const venue of venues) {
    const marker = L.marker([venue.lat, venue.lng], {
      icon: venueIcon(0, false),
      title: venue.name,
      showCount: 0,
      riseOnHover: true,
    });
    marker.bindPopup(() => popupFor(venue), { maxWidth: 300, minWidth: 210, autoPanPadding: [24, 24] });
    marker.on('click', () => selectVenue(venue.id));
    marker.shown = '';
    markers.set(venue.id, marker);
    cluster.addLayer(marker);
  }
  map.addLayer(cluster);
}

// The "numbers show upcoming shows" hint bows out once the map is in use.
function armHint() {
  if (!map) return;
  const dismiss = () => ui.hint.classList.add('is-gone');
  map.once('zoomstart dragstart popupopen', dismiss);
  setTimeout(dismiss, 15000);
}

function renderMarkers() {
  if (!cluster) return;
  let changed = false;
  const secret = unlocked();
  for (const venue of venues) {
    const marker = markers.get(venue.id);
    // Hidden venues only get a pin while the secret phrase is in the search box.
    const wanted = !venue.hidden || secret;
    if (wanted !== cluster.hasLayer(marker)) {
      if (wanted) cluster.addLayer(marker);
      else cluster.removeLayer(marker);
      changed = true;
    }
    const count = current.perVenue.get(venue.id) || 0;
    const active = venue.id === state.venueId;
    const shown = `${count}|${active}`;
    if (marker.shown === shown) continue;
    marker.shown = shown;
    marker.options.showCount = count;
    marker.options.title = count ? `${venue.name}: ${plural(count, 'show')}` : venue.name;
    marker.setIcon(venueIcon(count, active));
    marker.setZIndexOffset(active ? 1000 : count ? 100 : 0);
    changed = true;
  }
  if (changed) cluster.refreshClusters();
}

function fitRegion(region, animate = true) {
  if (!map) return;
  // If the map is not on screen yet (hidden on a phone's List view, or the
  // page is still laying out), wait until it has a size to fit into.
  map.invalidateSize();
  const size = map.getSize();
  if (!size.x || !size.y) {
    map.once('resize', () => fitRegion(region, false));
    return;
  }
  const points = venues.filter((v) => !v.hidden && (!region || v.region === region)).map((v) => [v.lat, v.lng]);
  if (points.length === 0) return;
  map.closePopup();
  // Padding keeps venues clear of the buttons in the map's corners.
  map.fitBounds(L.latLngBounds(points), {
    paddingTopLeft: [28, 56],
    paddingBottomRight: [28, 40],
    maxZoom: 13,
    animate: animate && !CALM,
  });
}

/* ---------- actions ---------- */

function render() {
  current = compute();
  renderSummary();
  renderList();
  renderMarkers();
  // Keep an open venue popup in step with the filters.
  const open = state.venueId && markers.get(state.venueId);
  if (open && open.isPopupOpen()) open.getPopup().update();
}

function setRegion(region) {
  state.region = region;
  state.venueId = null;
  ui.region.value = region;
  render();
  ui.scroll.scrollTop = 0;
  fitRegion(region);
}

// A venue was picked on the map: list just that venue.
function selectVenue(id) {
  state.venueId = id;
  render();
  ui.scroll.scrollTop = 0;
}

// A show was picked in the list: find its venue on the map.
function focusVenue(id) {
  const marker = markers.get(id);
  if (!map || !marker) return;
  if (MOBILE.matches && ui.app.dataset.view === 'list') setView('split');
  // Let the map take its new size before moving it.
  requestAnimationFrame(() => {
    map.invalidateSize();
    cluster.zoomToShowLayer(marker, () => marker.openPopup());
  });
}

// "See all in the list" inside a popup.
function revealList() {
  if (MOBILE.matches && ui.app.dataset.view === 'map') setView('split');
  ui.scroll.scrollTop = 0;
  ui.scroll.focus({ preventScroll: true });
}

function setView(view) {
  ui.app.dataset.view = view;
  for (const button of document.querySelectorAll('.viewswitch button')) {
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  }
  if (map) requestAnimationFrame(() => map.invalidateSize());
}

function clearFilters() {
  state.q = '';
  state.when = 'window';
  state.genre = ALL;
  state.venueId = null;
  ui.q.value = '';
  ui.when.value = 'window';
  ui.genre.value = ALL;
  if (map) map.closePopup();
  render();
  ui.scroll.scrollTop = 0;
}

/* ---------- setup ---------- */

function fillSelect(select, options, value) {
  select.replaceChildren(...options.map(([val, label]) => h('option', { value: val, text: label })));
  select.value = value;
}

function buildFilters() {
  // Areas: the home area first, then the rest in the order venues.json lists them.
  const regions = [...new Set(venues.map((v) => v.region))];
  regions.sort((a, b) => (b === HOME_REGION) - (a === HOME_REGION));
  state.region = regions.includes(HOME_REGION) ? HOME_REGION : ALL;
  fillSelect(ui.region, [[ALL, 'All Michigan'], ...regions.map((r) => [r, r])], state.region);

  const when = [
    ['window', `Next ${WINDOW_MONTHS} months`],
    ['today', 'Today'],
    ['weekend', 'This weekend'],
    ['week', 'Next 7 days'],
    ['month', 'Next 30 days'],
  ];
  for (let m = new Date(today.getFullYear(), today.getMonth(), 1); m <= windowEnd; m = addMonths(m, 1)) {
    when.push([`m:${m.getFullYear()}-${m.getMonth() + 1}`, fmtMonthYear.format(m)]);
  }
  const later = upcoming.filter((s) => !s.hidden && s.date > windowEnd).length;
  if (later) when.push(['later', `After ${fmtMon.format(windowEnd)} ${windowEnd.getDate()} (${later})`]);
  fillSelect(ui.when, when, state.when);

  const genres = [...new Set(upcoming.filter((s) => !s.hidden).flatMap((s) => s.genres))].sort((a, b) => a.localeCompare(b));
  fillSelect(ui.genre, [[ALL, 'All genres'], ...genres.map((g) => [g, g])], ALL);
}

function wire() {
  let typing = 0;
  ui.q.addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(() => {
      state.q = ui.q.value.trim();
      render();
      ui.scroll.scrollTop = 0;
    }, 120);
  });
  $('filters').addEventListener('submit', (event) => {
    event.preventDefault();
    ui.q.blur();
  });
  ui.region.addEventListener('change', () => setRegion(ui.region.value));
  ui.when.addEventListener('change', () => {
    state.when = ui.when.value;
    render();
    ui.scroll.scrollTop = 0;
  });
  ui.genre.addEventListener('change', () => {
    state.genre = ui.genre.value;
    render();
    ui.scroll.scrollTop = 0;
  });
  ui.clear.addEventListener('click', clearFilters);
  ui.chipClose.addEventListener('click', () => {
    state.venueId = null;
    if (map) map.closePopup();
    render();
  });
  ui.reset.addEventListener('click', () => fitRegion(state.region));
  for (const button of document.querySelectorAll('.viewswitch button')) {
    button.addEventListener('click', () => setView(button.dataset.view));
  }
  // The search box is narrow on phones, so its hint is shorter there.
  const fitToScreen = () => {
    ui.q.placeholder = MOBILE.matches ? 'Search' : 'Search bands, venues, cities';
    if (map) requestAnimationFrame(() => map.invalidateSize());
  };
  MOBILE.addEventListener('change', fitToScreen);
  fitToScreen();
}

function renderFoot(updated) {
  ui.foot.replaceChildren(
    h('p', { text: updated ? `Listings last updated ${fmtLong.format(updated)}.` : 'Listings are updated about once a month.' }),
    h('p', { text: 'Dates, times and lineups change. Check with the venue before you head out.' })
  );
}

function fail(error) {
  console.error(error);
  ui.count.textContent = 'The show list could not be loaded.';
  ui.shows.replaceChildren(
    h('li', { class: 'fatal' }, h('strong', { text: 'Something is wrong with the data files.' }), String(error.message || error))
  );
}

async function start() {
  wire();
  let data;
  try {
    data = await loadData();
  } catch (error) {
    fail(error);
    return;
  }

  venues = data.venues;
  upcoming = data.shows.filter((s) => lastDay(s) >= today);
  for (const s of upcoming) {
    s.hay = fold(
      [s.artist, ...s.support, s.venue.name, s.venue.city, s.room, ...s.genres, s.notes, s.status].filter(Boolean).join(' ')
    );
  }
  if (data.issues.length) {
    console.warn(`${data.issues.length} data problem(s). Open check.html for the full list.`, data.issues);
  }

  buildFilters();
  buildMap();
  render();
  renderFoot(data.updated);
  fitRegion(state.region, false);
  armHint();
}

start();
