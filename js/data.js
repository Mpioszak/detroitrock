// Loads data/venues.json and data/shows.json, checks them, and hands back
// clean objects for the map (js/app.js) and the data check page (js/check.js).

export const FILES = { venues: 'data/venues.json', shows: 'data/shows.json' };

// How far ahead the site looks. Shows dated after this still live in the
// JSON file and roll into view automatically as the months go by.
export const WINDOW_MONTHS = 6;

export class DataError extends Error {}

/* ---------- dates and times ---------- */

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// "2026-11-21" -> local Date, or null if it is not a real calendar date.
// Built by hand because new Date("2026-11-21") means midnight UTC, which is
// the evening before in Michigan.
export function parseDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const real = d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
  return real ? d : null;
}

export function isoDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Same day-of-month n months later, clamped to the end of short months.
export function addMonths(d, n) {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return target;
}

export function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// "19:00", "7:00 PM", "7pm" -> minutes after midnight, or null.
export function parseTime(value) {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?$/i.exec(String(value ?? '').trim());
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const half = m[3] ? m[3].toLowerCase() : null;
  if (min > 59) return null;
  if (half) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (half === 'p' ? 12 : 0);
  } else if (h > 23) {
    return null;
  }
  return h * 60 + min;
}

export function formatTime(minutes) {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h = h24 % 12 || 12;
  return `${h}${m ? ':' + String(m).padStart(2, '0') : ''} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/* ---------- loading ---------- */

async function fetchJson(url) {
  let res;
  try {
    res = await fetch(url, { cache: 'no-cache' });
  } catch {
    throw new DataError(
      `Could not load ${url}. If you opened index.html straight from a folder, ` +
        'start the local preview instead (see the README).'
    );
  }
  if (!res.ok) throw new DataError(`Could not load ${url} (the server answered ${res.status}).`);
  const text = (await res.text()).replace(/^﻿/, '');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new DataError(`${url} has a typo, so it could not be read. ${describeJsonError(err, text)}`);
  }
}

// Turns the browser's JSON error into "line 42" plus the text of that line.
function describeJsonError(err, text) {
  const msg = String(err && err.message ? err.message : err);
  let line = null;
  const lineCol = /line (\d+) column (\d+)/i.exec(msg);
  const pos = /position (\d+)/i.exec(msg);
  if (lineCol) line = +lineCol[1];
  else if (pos) line = text.slice(0, +pos[1]).split('\n').length;
  const usual = 'The usual cause is a missing or extra comma, or a missing quote';
  if (!line) {
    // No position from the browser. Look for the classic slip ourselves: a
    // comma left behind after the last item in a list.
    const stray = /,\s*[\]}]/.exec(text);
    if (stray) {
      const strayLine = text.slice(0, stray.index).split('\n').length;
      return `Check line ${strayLine}: there is a comma right before a closing bracket. The last item in a list must not end with a comma.`;
    }
    return `The browser says: ${msg}. ${usual}.`;
  }
  const snippet = (text.split('\n')[line - 1] || '').trim().slice(0, 140);
  return `Look at line ${line}${snippet ? `: ${snippet}` : ''}. ${usual}, on that line or the one above it.`;
}

export async function loadData() {
  const [venuesRaw, showsRaw] = await Promise.all([fetchJson(FILES.venues), fetchJson(FILES.shows)]);
  return normalize(venuesRaw, showsRaw);
}

/* ---------- checking ---------- */

const text = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

function webLink(v) {
  const s = text(v);
  return /^https?:\/\/\S+$/i.test(s) ? s : '';
}

function list(v) {
  if (Array.isArray(v)) return v.map(text).filter(Boolean);
  const s = text(v);
  return s ? [s] : [];
}

// Returns { venues, shows, issues, updated }. Entries with an error are left
// out of venues/shows; entries with only a warning are kept.
export function normalize(venuesRaw, showsRaw) {
  const issues = [];
  const error = (where, message) => issues.push({ level: 'error', where, message });
  const warn = (where, message) => issues.push({ level: 'warning', where, message });

  const venueList = Array.isArray(venuesRaw) ? venuesRaw : venuesRaw && venuesRaw.venues;
  if (!Array.isArray(venueList)) throw new DataError(`${FILES.venues} needs a "venues" list.`);
  const showList = Array.isArray(showsRaw) ? showsRaw : showsRaw && showsRaw.shows;
  if (!Array.isArray(showList)) throw new DataError(`${FILES.shows} needs a "shows" list.`);

  const venues = [];
  const venueById = new Map();
  venueList.forEach((raw, i) => {
    const v = raw && typeof raw === 'object' ? raw : {};
    const name = text(v.name);
    const where = `venues.json, venue ${i + 1}${name ? ` (${name})` : ''}`;
    const id = text(v.id);
    const lat = typeof v.lat === 'number' ? v.lat : parseFloat(v.lat);
    const lng = typeof v.lng === 'number' ? v.lng : parseFloat(v.lng);
    if (!id) return error(where, 'Missing "id".');
    if (!name) return error(where, 'Missing "name".');
    if (venueById.has(id)) return error(where, `The id "${id}" is used by more than one venue.`);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return error(where, 'Missing "lat" / "lng", so it cannot be placed on the map.');
    }
    if (lat < 41 || lat > 48.6 || lng < -91 || lng > -82) {
      warn(where, `lat/lng (${lat}, ${lng}) is outside Michigan. Are the two numbers swapped?`);
    }
    const website = webLink(v.website);
    if (text(v.website) && !website) warn(where, '"website" should start with https://');
    const venue = {
      id,
      name,
      lat,
      lng,
      address: text(v.address),
      city: text(v.city),
      region: text(v.region) || 'Elsewhere in Michigan',
      website,
      note: text(v.note),
    };
    venues.push(venue);
    venueById.set(id, venue);
  });

  const shows = [];
  const seen = new Map();
  showList.forEach((raw, i) => {
    const s = raw && typeof raw === 'object' ? raw : {};
    const artist = text(s.artist);
    const where = `shows.json, show ${i + 1}${text(s.date) || artist ? ` (${[text(s.date), artist].filter(Boolean).join(' ')})` : ''}`;
    const date = parseDate(s.date);
    if (!date) {
      return error(
        where,
        /^\d{4}-\d{2}-\d{2}$/.test(text(s.date))
          ? `${text(s.date)} is not a real calendar date.`
          : `"date" must look like 2026-11-21. Found: ${JSON.stringify(s.date ?? null)}`
      );
    }
    if (!artist) return error(where, 'Missing "artist".');
    const venueId = text(s.venue);
    const venue = venueById.get(venueId);
    if (!venue) {
      return error(
        where,
        venueId
          ? `Venue "${venueId}" is not in venues.json. Check the spelling of the id, or add the venue.`
          : 'Missing "venue" (use a venue id from venues.json).'
      );
    }

    let endDate = null;
    if (text(s.endDate)) {
      endDate = parseDate(s.endDate);
      if (!endDate) warn(where, `"endDate" must look like 2026-11-22. Found: ${JSON.stringify(s.endDate)}`);
      else if (endDate < date) {
        warn(where, '"endDate" is earlier than "date"; ignoring it.');
        endDate = null;
      }
    }

    const clock = (key) => {
      const rawTime = text(s[key]);
      if (!rawTime) return null;
      const minutes = parseTime(rawTime);
      if (minutes === null) warn(where, `"${key}" should look like 19:00 or 7:00 PM. Found: "${rawTime}"`);
      return { minutes, label: minutes === null ? rawTime : formatTime(minutes) };
    };

    const tickets = webLink(s.tickets);
    if (text(s.tickets) && !tickets) warn(where, '"tickets" should be a full link starting with https://');

    const key = `${isoDate(date)}|${venueId}|${artist.toLowerCase()}`;
    if (seen.has(key)) warn(where, `Looks like a repeat of show ${seen.get(key)}.`);
    else seen.set(key, i + 1);

    const time = clock('time');
    const doors = clock('doors');
    shows.push({
      index: i + 1,
      date,
      endDate,
      dateKey: isoDate(date),
      time,
      doors,
      sortMinutes: (time && time.minutes) ?? (doors && doors.minutes) ?? 24 * 60,
      artist,
      support: list(s.support),
      venue,
      room: text(s.room),
      genres: list(s.genre),
      ages: text(s.ages),
      price: text(s.price),
      status: text(s.status),
      tickets,
      notes: text(s.notes),
    });
  });

  shows.sort((a, b) => a.date - b.date || a.sortMinutes - b.sortMinutes || a.artist.localeCompare(b.artist));

  const updated = parseDate(showsRaw && showsRaw.updated);
  if (showsRaw && !Array.isArray(showsRaw) && showsRaw.updated && !updated) {
    warn('shows.json', `"updated" must look like 2026-11-09. Found: ${JSON.stringify(showsRaw.updated)}`);
  }

  return { venues, shows, issues, updated };
}
