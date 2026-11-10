// Data check page: open check.html after editing the JSON files to see
// whether anything is misspelled, missing or out of date.

import { loadData, startOfDay, addMonths, WINDOW_MONTHS } from './data.js';
import { h, plural } from './dom.js';

const report = document.getElementById('report');
const today = startOfDay(new Date());
const windowEnd = addMonths(today, WINDOW_MONTHS);
const fmtDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const stat = (value, label) => h('div', { class: 'stat' }, h('b', { text: String(value) }), h('span', { text: label }));

function countBy(items, keyOf) {
  const counts = new Map();
  for (const item of items) for (const key of [keyOf(item)].flat()) counts.set(key, (counts.get(key) || 0) + 1);
  return counts;
}

function build({ venues, shows, issues, updated }) {
  const past = shows.filter((s) => (s.endDate || s.date) < today);
  const current = shows.filter((s) => (s.endDate || s.date) >= today && s.date <= windowEnd);
  const live = current.filter((s) => !s.hidden);
  const secret = current.filter((s) => s.hidden);
  const later = shows.filter((s) => s.date > windowEnd);
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  const age = updated ? Math.round((today - updated) / 86400000) : null;
  let verdict = h('p', { class: 'verdict verdict--ok', text: 'All good. Both files read cleanly and every show has a venue.' });
  if (warnings.length) {
    verdict = h('p', {
      class: 'verdict verdict--warn',
      text: `The site works, but ${plural(warnings.length, 'thing')} below ${warnings.length === 1 ? 'looks' : 'look'} off.`,
    });
  }
  if (errors.length) {
    const one = errors.length === 1;
    verdict = h('p', {
      class: 'verdict verdict--bad',
      text: `${errors.length} ${one ? 'entry' : 'entries'} could not be used and ${one ? 'is' : 'are'} missing from the site. Fix the red items below.`,
    });
  }

  const liveByVenue = countBy(live, (s) => s.venue.id);
  const laterByVenue = countBy(later, (s) => s.venue.id);
  const genres = [...countBy([...live, ...later], (s) => (s.genres.length ? s.genres : ['(no genre)']))].sort((a, b) => b[1] - a[1]);

  // h() drops the "false" left behind by sections that do not apply.
  const page = h(
    'div',
    null,
    verdict,
    h(
      'div',
      { class: 'stats' },
      stat(venues.length, 'venues'),
      stat(live.length, `shows on the site now (next ${WINDOW_MONTHS} months)`),
      stat(secret.length, 'hidden shows (secret search phrase only)'),
      stat(later.length, 'shows waiting further out'),
      stat(past.length, 'shows already over')
    ),
    h('p', {
      text: updated
        ? `shows.json says it was last updated ${fmtDate.format(updated)}${age > 0 ? ` (${plural(age, 'day')} ago)` : ''}.${age > 40 ? ' Time for a refresh?' : ''}`
        : 'shows.json has no "updated" date. Add one at the top so visitors can see how fresh the listings are.',
    }),

    issues.length > 0 && h('h2', { text: 'Things to fix' }),
    issues.length > 0 &&
      h(
        'ul',
        { class: 'issues' },
        [...errors, ...warnings].map((issue) =>
          h('li', { class: `is-${issue.level}` }, h('small', { text: issue.where }), issue.message)
        )
      ),

    past.length > 0 && h('h2', { text: 'Housekeeping' }),
    past.length > 0 &&
      h(
        'p',
        null,
        `${plural(past.length, 'show')} in shows.json ${past.length === 1 ? 'has' : 'have'} already happened. The site hides them on its own, so deleting them is optional tidying.`
      ),
    past.length > 0 &&
      h(
        'details',
        null,
        h('summary', { text: 'List them' }),
        h('ul', null, past.map((s) => h('li', { text: `${s.dateKey}  ${s.artist}  (${s.venue.name})` })))
      ),

    h('h2', { text: 'Shows per venue' }),
    h(
      'table',
      { class: 'table' },
      h('thead', null, h('tr', null, h('th', { text: 'Venue' }), h('th', { text: 'Area' }), h('th', { class: 'num', text: 'On the site' }), h('th', { class: 'num', text: 'Further out' }))),
      h(
        'tbody',
        null,
        [...venues]
          .sort((a, b) => (liveByVenue.get(b.id) || 0) - (liveByVenue.get(a.id) || 0) || a.name.localeCompare(b.name))
          .map((v) => {
            const now = liveByVenue.get(v.id) || 0;
            const out = laterByVenue.get(v.id) || 0;
            return h(
              'tr',
              { class: now + out ? null : 'is-zero' },
              h('td', null, v.name, ' ', h('code', { text: v.id })),
              h('td', { text: v.region }),
              h('td', { class: 'num', text: String(now) }),
              h('td', { class: 'num', text: String(out) })
            );
          })
      )
    ),

    h('h2', { text: 'Genres in use' }),
    h('p', { text: 'A genre with only one or two shows is often a typo of another one.' }),
    h(
      'table',
      { class: 'table' },
      h('thead', null, h('tr', null, h('th', { text: 'Genre' }), h('th', { class: 'num', text: 'Shows' }))),
      h('tbody', null, genres.map(([name, n]) => h('tr', null, h('td', { text: name }), h('td', { class: 'num', text: String(n) }))))
    )
  );
  report.replaceChildren(page);
}

loadData()
  .then(build)
  .catch((error) => {
    console.error(error);
    report.replaceChildren(
      h('p', { class: 'verdict verdict--bad', text: 'The site cannot load its data right now.' }),
      h('p', { text: String(error.message || error) })
    );
  });
