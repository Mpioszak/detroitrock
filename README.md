# Detroit Rock

A map of rock venues across Metro Detroit and the rest of Michigan, with every rock and rock-adjacent show booked for the next six months.

The site opens on Metro Detroit. Use the Area menu to see all of Michigan or another part of the state. Tap a number on the map to see that venue's lineup, or tap a show in the list to find its venue.

Once GitHub Pages is switched on (see [Publishing](#publishing)), the site lives at <https://mpioszak.github.io/detroitrock/>.

## The monthly update

All listings live in one file: [`data/shows.json`](data/shows.json). Each show is one line.

1. Open `data/shows.json`. On GitHub, click the file and then the pencil icon.
2. Add a line for each new show. The easiest way is to copy a line that is already there and change it.
3. Change `"updated"` at the top of the file to today's date.
4. Save (on GitHub: **Commit changes**). The site picks up the change a minute or two later.
5. Open `check.html` on the site (for example <https://mpioszak.github.io/detroitrock/check.html>). It tells you if anything is misspelled or missing.

Things you do not have to do:

- **Delete old shows.** Once a show's date has passed, the site hides it on its own. Deleting old lines is optional tidying.
- **Hold back shows that are far away.** A show more than six months out can go in the file now. It stays hidden and appears by itself when it comes within six months.
- **Keep the lines in date order.** The site sorts them.

### What goes in a show

```json
{ "date": "2026-11-20", "doors": "17:30", "artist": "Trivium", "support": ["In Flames", "Orbit Culture"], "venue": "royal-oak-music-theatre", "genre": "Metal", "tickets": "https://www.axs.com/events/1525432/trivium-tickets", "notes": "Crown in the Grave World Tour" }
```

| Field | Needed? | Example | What it is |
| --- | --- | --- | --- |
| `date` | yes | `"2026-11-20"` | Year-month-day, with dashes. |
| `artist` | yes | `"Trivium"` | The headliner or the name of the event. |
| `venue` | yes | `"royal-oak-music-theatre"` | The venue's `id` from `data/venues.json`. |
| `time` | no | `"19:00"` | Show time. `"7:00 PM"` also works. |
| `doors` | no | `"18:00"` | Door time, if the venue lists one. |
| `support` | no | `["In Flames", "Orbit Culture"]` | Opening acts. |
| `room` | no | `"The Shelter"` | For venues with more than one room. |
| `genre` | no | `"Metal"` | Feeds the Genre menu. See the list below. |
| `ages` | no | `"All ages"` | `"18+"`, `"21+"` and so on. |
| `price` | no | `"$25"` | |
| `status` | no | `"Sold out"` | Shown as a badge. Also `"Cancelled"`, `"Postponed"`. |
| `tickets` | no | `"https://..."` | Link for the Tickets button. Without it, the button goes to the venue's site. |
| `notes` | no | `"20th Anniversary Tour"` | One short line: tour name, tribute to whom, and so on. |
| `endDate` | no | `"2026-11-22"` | Last day of a multi-day event. |

Genres in use, so the menu stays tidy: `Rock`, `Classic Rock`, `Hard Rock`, `Metal`, `Punk` (includes hardcore and ska), `Emo/Pop-Punk`, `Indie/Alternative`, `Post-Punk/Goth` (includes industrial), `Blues/Roots`, `Jam`, `Tribute`. A new spelling creates a new menu entry.

### The three mistakes that break the file

- **A missing comma between two shows**, or **a comma after the very last show**. Every line ends with a comma except the last one.
- **A missing quote mark.** Every piece of text needs `"` on both sides.
- **A venue id that does not match.** `"venue"` must be spelled exactly like an `id` in `data/venues.json`.

If the file has a typo, the site shows a message naming the line to look at, and `check.html` lists anything else it could not use.

## Adding a venue

Venues live in [`data/venues.json`](data/venues.json). Copy an existing block and change it:

```json
{
  "id": "el-club",
  "name": "El Club",
  "address": "4114 W Vernor Hwy",
  "city": "Detroit",
  "region": "Metro Detroit",
  "lat": 42.32133,
  "lng": -83.0934,
  "website": "https://elclubdetroit.com/shows/"
}
```

- `id` is a short name with no spaces. Shows point at it.
- `lat` and `lng` place the pin. In Google Maps, right-click the venue and click the two numbers at the top of the menu to copy them. The first is `lat` (about 42 to 47 in Michigan), the second is `lng` (negative, about -83 to -90).
- `region` decides which entry of the Area menu the venue falls under. Use one that exists (`Metro Detroit`, `Ann Arbor`, `Flint & Saginaw`, `Lansing & Mid-Michigan`, `Grand Rapids`, `Kalamazoo & Battle Creek`) or type a new one to create it.
- `website` is best pointed at the venue's calendar page. An optional `note` adds a line to the venue's pop-up.

A venue with no shows still appears on the map, as a small grey dot.

## Where the first listings came from

The starting data (283 shows, gathered November 9, 2026) was read from each venue's own calendar. The `website` of every venue in `venues.json` is the page to check each month. Small's was read from Songkick and Diesel Concert Lounge from its Eventbrite page, because their own sites list shows as images.

Five venues are on the map without shows because their calendars could not be read that day: The Sanctuary Detroit, Harpos, Soaring Eagle, and the two summer amphitheatres (Michigan Lottery Amphitheatre and Meadow Brook), which had not announced 2027 yet. Van Andel Arena is only covered into early January.

What counts as "rock-adjacent" is a judgement call. The list leans toward bands with guitars: metal, punk, emo, indie, blues rock, jam bands and tribute acts are in; country, hip-hop, pop, EDM and comedy are out.

## Preview on your computer

The site loads its data over the web, so double-clicking `index.html` shows an error. To look at changes before publishing them, run this from the project folder and open <http://localhost:8080/>:

```bash
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

## Publishing

The site is plain files with no build step, so GitHub Pages can serve the repository as it is:

1. On GitHub, open the repository's **Settings**, then **Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Pick the `main` branch and the `/ (root)` folder, then **Save**.

After that, every commit to `main` updates the site.

## How it is put together

| File | Job |
| --- | --- |
| `index.html`, `css/styles.css` | The page and its look. |
| `js/app.js` | The map, the list and the filters. |
| `js/data.js` | Reads and checks the two JSON files. |
| `check.html`, `js/check.js` | The data check page. |
| `data/shows.json`, `data/venues.json` | The listings and the venues. |
| `tools/serve.ps1` | The local preview. |

Two settings worth knowing: `WINDOW_MONTHS` in `js/data.js` is how far ahead the site looks (6), and `HOME_REGION` in `js/app.js` is the area it opens on (`Metro Detroit`).

The map is drawn with [Leaflet](https://leafletjs.com/) and [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster). Map images come from [OpenStreetMap](https://www.openstreetmap.org/copyright)'s free tile service, which suits a small site. If the site ever gets heavy traffic, switch to a tile provider with a free account by changing the address in the `L.tileLayer(...)` line of `js/app.js`.

Show dates, times and lineups change. The site tells visitors to confirm with the venue.
