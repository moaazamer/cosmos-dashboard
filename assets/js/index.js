const NASA_API_KEY = "DEMO_KEY";
const PLANETS_URL = "https://solar-system-opendata-proxy.vercel.app/api/planets";
const LAUNCHES_URL = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=10";
const $ = (id) => document.getElementById(id);
const planetOrder = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"];
let planets = [];
let launches = [];
let planetsLoading = false;
let launchesLoading = false;
let apodRequest = 0;
let selectedPlanet = "earth";
let favorites = [];

try {
  const saved = JSON.parse(localStorage.getItem("cosmos-favorites") || "[]");
  if (Array.isArray(saved)) favorites = saved.filter((item) => typeof item === "string");
} catch { }

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function safeURL(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function number(value, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: digits }) : "N/A";
}

function unit(value, suffix, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? `${number(value, digits)} ${suffix}` : "N/A";
}

function dateText(value, withTime = false) {
  if (!value) return "To be confirmed";
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "To be confirmed";
  return withTime ? date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC" : date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function today() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function getJSON(url, cacheSeconds = 0) {
  const cacheKey = `cosmos-cache:${url}`;
  if (cacheSeconds) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(cacheKey));
      if (saved && Date.now() - saved.time < cacheSeconds * 1000) return saved.data;
    } catch { }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      if (response.status === 429) throw new Error("Request limit reached. Please wait a while before retrying.");
      if ([401, 403].includes(response.status)) throw new Error("Access denied. Check your API key.");
      throw new Error(`The service returned HTTP ${response.status}. Please try again later.`);
    }
    const data = await response.json();
    if (cacheSeconds) {
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ time: Date.now(), data })); } catch { }
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The request timed out. Check your connection and retry.");
    if (error instanceof TypeError) throw new Error("Could not connect to the service. Check your internet connection and try again.");
    throw error;
  } finally { clearTimeout(timer); }
}

function stateBox(container, message, retry) {
  container.replaceChildren();
  const box = document.createElement("div");
  box.className = `api-state${retry ? " error" : ""}`;
  box.setAttribute("role", retry ? "alert" : "status");
  const text = document.createElement("p");
  text.textContent = message;
  box.append(text);
  if (retry) {
    const button = document.createElement("button");
    button.textContent = "Try again";
    button.className = "action-button";
    button.addEventListener("click", retry);
    box.append(button);
  }
  container.append(box);
}

function showModal(title, html) {
  $("modal-content").innerHTML = `<h2 id="modal-title">${escapeHTML(title)}</h2>${html}`;
  $("detail-modal").showModal();
}

$("close-modal").addEventListener("click", () => $("detail-modal").close());
$("detail-modal").addEventListener("click", (event) => {
  if (event.target === $("detail-modal")) {
    const rect = event.target.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close();
  }
});

function updateFavorites() {
  document.querySelectorAll("[data-favorite]").forEach((button) => {
    const active = favorites.includes(button.dataset.favorite);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", active ? "Remove favorite" : "Add favorite");
    button.textContent = active ? "♥️" : "♡";
  });
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-favorite]");
  if (!button) return;
  const id = button.dataset.favorite;
  favorites = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id];
  try { localStorage.setItem("cosmos-favorites", JSON.stringify(favorites)); } catch { }
  updateFavorites();
});

document.addEventListener("error", (event) => {
  if (event.target.tagName === "IMG" && event.target.dataset.fallback) {
    const fallback = event.target.dataset.fallback;
    delete event.target.dataset.fallback;
    event.target.src = fallback;
  }
}, true);

const backdrop = document.createElement("button");
backdrop.className = "sidebar-backdrop";
backdrop.hidden = true;
backdrop.setAttribute("aria-label", "Close navigation");
document.body.append(backdrop);

function closeSidebar() {
  $("sidebar").classList.remove("is-open");
  backdrop.hidden = true;
  $("sidebar-toggle").setAttribute("aria-expanded", "false");
}

$("sidebar-toggle").setAttribute("aria-label", "Toggle navigation");
$("sidebar-toggle").setAttribute("aria-controls", "sidebar");
$("sidebar-toggle").addEventListener("click", () => {
  const opened = $("sidebar").classList.toggle("is-open");
  backdrop.hidden = !opened;
  $("sidebar-toggle").setAttribute("aria-expanded", String(opened));
});

backdrop.addEventListener("click", closeSidebar);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSidebar(); });

function showSection(id) {
  if (!["today-in-space", "launches", "planets"].includes(id)) id = "today-in-space";
  document.querySelectorAll(".app-section").forEach((section) => section.classList.toggle("hidden", section.id !== id));
  document.querySelectorAll(".nav-link").forEach((link) => {
    const active = link.dataset.section === id;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  closeSidebar();
  if (id === "launches" && !launches.length) loadLaunches();
  if (id === "planets" && !planets.length) loadPlanets();
}

document.querySelectorAll(".nav-link").forEach((link) => {
  link.href = `#${link.dataset.section}`;
  link.addEventListener("click", () => showSection(link.dataset.section));
});

window.addEventListener("hashchange", () => showSection(location.hash.slice(1)));

const dateInput = $("apod-date-input");
dateInput.min = "1995-06-16";
dateInput.max = today();
dateInput.value = today();

function updateDateLabel() {
  document.querySelector(".date-input-wrapper span").textContent = dateText(dateInput.value);
}

dateInput.addEventListener("change", updateDateLabel);
$("load-date-btn").addEventListener("click", () => loadAPOD(dateInput.value));
$("today-apod-btn").addEventListener("click", () => {
  dateInput.max = today();
  dateInput.value = today();
  updateDateLabel();
  loadAPOD(dateInput.value);
});

async function loadAPOD(date) {
  if (!date || date < "1995-06-16" || date > today() || !dateInput.checkValidity()) {
    dateInput.setCustomValidity("Choose a date between June 16, 1995 and today.");
    dateInput.reportValidity();
    dateInput.setCustomValidity("");
    return;
  }
  const request = ++apodRequest;
  updateDateLabel();
  $("load-date-btn").disabled = true;
  stateBox($("apod-image-container"), "Loading space imagery…");
  $("apod-title").textContent = "Loading…";
  $("apod-explanation").textContent = "";
  $("apod-copyright").textContent = "";
  $("apod-date").textContent = `Astronomy Picture of the Day - ${dateText(date)}`;
  ["apod-date-detail", "apod-date-info", "apod-media-type"].forEach((id) => $(id).textContent = "—");
  try {
    const data = await getJSON(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(NASA_API_KEY)}&date=${encodeURIComponent(date)}&thumbs=true`, 3600);
    if (request !== apodRequest) return;
    if (!data.title || !data.media_type) throw new Error("NASA returned an unexpected response. Please retry later.");
    $("apod-title").textContent = data.title;
    $("apod-explanation").textContent = data.explanation || "No description available.";
    $("apod-copyright").textContent = data.copyright ? `© ${data.copyright}` : "Source: NASA APOD";
    ["apod-date-detail", "apod-date-info"].forEach((id) => $(id).textContent = dateText(data.date)); $("apod-media-type").textContent = data.media_type;
    const url = safeURL(data.url);
    const full = safeURL(data.hdurl) || url;
    if (!url) throw new Error("No usable media URL is available for this date.");
    const media = $("apod-image-container");
    media.replaceChildren();
    if (data.media_type === "image") {
      const img = document.createElement("img");
      img.id = "apod-image";
      img.alt = data.title;
      img.src = url;
      img.addEventListener("error", () => {
        img.remove();
        const note = document.createElement("p");
        note.textContent = "Image could not load. Use the full resolution link to open it.";
        media.prepend(note);
      }, { once: true });
      media.append(img);
    } else {
      const host = new URL(url).hostname;
      if (["www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "player.vimeo.com"].includes(host)) {
        const frame = document.createElement("iframe");
        frame.src = url;
        frame.title = data.title;
        frame.className = "apod-video";
        frame.allowFullscreen = true;
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        media.append(frame);
      } else {
        const note = document.createElement("p");
        note.textContent = "Today's astronomy feature is a video. Open it using the link below.";
        media.append(note);
      }
    }
    const link = document.createElement("a");
    link.href = full;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "media-link";
    link.textContent = data.media_type === "image" ? "View Full Resolution ↗️" : "Watch Video ↗️";
    media.append(link);
  } catch (error) {
    if (request !== apodRequest) return;
    $("apod-title").textContent = "Image unavailable";
    stateBox($("apod-image-container"), error.message, () => loadAPOD(date));
  } finally {
    if (request === apodRequest) $("load-date-btn").disabled = false;
  }
}

function launchImage(launch) {
  return safeURL(typeof launch.image === "string" ? launch.image : launch.image?.image_url) || "./assets/images/launch-placeholder.png";
}

function launchDetails(index) {
  const launch = launches[index];
  if (!launch) return;
  const links = (launch.vid_urls || []).map((item) => safeURL(item.url)).filter(Boolean);
  showModal(launch.name, `<img src="${escapeHTML(launchImage(launch))}" alt="${escapeHTML(launch.name)}" data-fallback="./assets/images/launch-placeholder.png"><p><strong>Status:</strong> ${escapeHTML(launch.status?.name || "Unknown")}</p><p><strong>Launch:</strong> ${escapeHTML(dateText(launch.net))} · ${escapeHTML(dateText(launch.net, true))}</p><p><strong>Provider:</strong> ${escapeHTML(launch.launch_service_provider?.name || "Unknown")}</p><p><strong>Location:</strong> ${escapeHTML(launch.pad?.location?.name || launch.pad?.name || "Unknown")}</p><p>${escapeHTML(launch.mission?.description || "Mission description not available yet.")}</p>${links.length ? `<p><a href="${escapeHTML(links[0])}" target="_blank" rel="noopener noreferrer">Watch launch coverage ↗️</a></p>` : ""}`);
}

function launchActions(launch, index) {
  return `<div class="launch-actions"><button data-launch-details="${index}">Details</button><button data-favorite="launch:${escapeHTML(launch.id)}" aria-label="Add favorite">♡</button></div>`;
}

function renderLaunches() {
  $("launches-count").textContent = `${launches.length} Launches`;
  $("launches-count-mobile").textContent = launches.length;
  if (!launches.length) {
    stateBox($("featured-launch"), "No upcoming launches are currently available.");
    return;
  }
  $("header-launches-count").textContent = launches.length;
  const first = launches[0];
  const facts = [["Launch Date", dateText(first.net)], ["Launch Time", dateText(first.net, true)], ["Location", first.pad?.location?.name || first.pad?.name || "Unknown"], ["Country", first.pad?.location?.country?.name || first.pad?.location?.country_code || "Unknown"]];
  $("featured-launch").innerHTML = `<div class="launch-card-body"><span class="badge">★ Featured Launch · ${escapeHTML(first.status?.abbrev || "TBD")}</span><h3>${escapeHTML(first.name)}</h3><p>${escapeHTML(first.launch_service_provider?.name || "Unknown provider")} · ${escapeHTML(first.rocket?.configuration?.name || "Unknown rocket")}</p><p id="launch-countdown" class="desc"></p><div class="launch-facts">${facts.map(([label, value]) => `<div><small>${label}</small><p><strong>${escapeHTML(value)}</strong></p></div>`).join("")}</div><p>${escapeHTML(first.mission?.description || "Mission details will be announced soon.")}</p>${launchActions(first, 0)}</div><img class="featured-photo" src="${escapeHTML(launchImage(first))}" alt="${escapeHTML(first.name)}" data-fallback="./assets/images/launch-placeholder.png">`;
  $("launches-grid").innerHTML = launches.slice(1).map((launch, index) => `<article class="launch-card"><img class="launch-photo" loading="lazy" src="${escapeHTML(launchImage(launch))}" alt="${escapeHTML(launch.name)}" data-fallback="./assets/images/launch-placeholder.png"><div class="launch-card-body"><span class="badge">${escapeHTML(launch.status?.abbrev || "TBD")}</span><h4>${escapeHTML(launch.name)}</h4><p>${escapeHTML(launch.launch_service_provider?.name || "Unknown provider")}</p><p>▣ ${escapeHTML(dateText(launch.net))}<br>◷ ${escapeHTML(dateText(launch.net, true))}</p><p>${escapeHTML(launch.rocket?.configuration?.name || "Unknown rocket")}</p><p>${escapeHTML(launch.pad?.location?.name || "Unknown location")}</p>${launchActions(launch, index + 1)}</div></article>`).join("");
  updateFavorites();
  updateCountdown();
}

function updateCountdown() {
  const target = $("launch-countdown");
  if (!target || !launches[0]) return;
  const remaining = new Date(launches[0].net).getTime() - Date.now();
  if (!Number.isFinite(remaining)) { target.textContent = "Launch time to be confirmed"; return; }
  if (remaining <= 0) { target.textContent = "Scheduled time reached · awaiting updates"; return; }
  const seconds = Math.floor(remaining / 1000);
  target.textContent = `T− ${Math.floor(seconds / 86400)}d ${Math.floor(seconds / 3600) % 24}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s · Schedule may change`;
}

setInterval(updateCountdown, 1000);

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-launch-details]");
  if (button) launchDetails(Number(button.dataset.launchDetails));
});

async function loadLaunches() {
  if (launchesLoading) return;
  launchesLoading = true;
  $("launches-grid").replaceChildren();
  stateBox($("featured-launch"), "Loading upcoming launches…");
  try {
    const data = await getJSON(LAUNCHES_URL, 300);
    if (!Array.isArray(data.results)) throw new Error("Unexpected launches response. Please retry later.");
    launches = data.results;
    renderLaunches();
  } catch (error) {
    $("launches-count").textContent = "Launches unavailable";
    $("launches-count-mobile").textContent = "—";
    stateBox($("featured-launch"), error.message, loadLaunches);
  } finally { launchesLoading = false; }
}

const descriptions = {
  mercury: "Mercury is the closest planet to the Sun and the smallest of the eight planets. Its rocky surface is covered in impact craters.",
  venus: "Venus is a rocky world wrapped in a thick atmosphere. Its strong greenhouse effect makes it the hottest planet in our solar system.",
  earth: "Earth is our home world, with oceans of liquid water and an atmosphere that supports life. It is the third planet from the Sun.",
  mars: "Mars is a rocky planet with a thin atmosphere. Iron minerals in its surface give the Red Planet its distinctive color.",
  jupiter: "Jupiter is the largest planet in our solar system. This gas giant is known for its bands of clouds and enormous storms.",
  saturn: "Saturn is a gas giant surrounded by a spectacular ring system made largely of ice particles and rocky debris.",
  uranus: "Uranus is an ice giant that rotates on its side. Methane in its atmosphere contributes to its blue-green appearance.",
  neptune: "Neptune is the most distant of the eight planets. It is an ice giant with a deep blue atmosphere and powerful winds."
};

function scientific(data, prefix, suffix) {
  return data && Number.isFinite(data[`${prefix}Value`]) && Number.isFinite(data[`${prefix}Exponent`]) ? `${number(data[`${prefix}Value`])} × 10^${data[`${prefix}Exponent`]} ${suffix}` : "N/A";
}

function planetType(id) {
  return planetOrder.indexOf(id) < 4 ? "Terrestrial" : ["jupiter", "saturn"].includes(id) ? "Gas Giant" : "Ice Giant";
}

function showPlanet(id) {
  const planet = planets.find((item) => item.englishName.toLowerCase() === id);
  if (!planet) return;
  selectedPlanet = id;
  document.querySelectorAll(".planet-card").forEach((card) => card.setAttribute("aria-pressed", String(card.dataset.planetId === id)));
  $("planet-detail-image").src = `./assets/images/${id}.png`;
  $("planet-detail-image").alt = planet.englishName;
  $("planet-detail-name").textContent = planet.englishName;
  $("planet-detail-description").textContent = descriptions[id];
  const values = {
    "planet-distance": unit(planet.semimajorAxis, "km"),
    "planet-radius": unit(planet.meanRadius, "km"),
    "planet-mass": scientific(planet.mass, "mass", "kg"),
    "planet-density": unit(planet.density, "g/cm³"),
    "planet-orbital-period": unit(planet.sideralOrbit, "days"),
    "planet-rotation": unit(planet.sideralRotation, "hours"),
    "planet-moons": Array.isArray(planet.moons) ? planet.moons.length : 0,
    "planet-gravity": unit(planet.gravity, "m/s²"),
    "planet-discoverer": planet.discoveredBy || "Known since antiquity",
    "planet-discovery-date": planet.discoveryDate || "Ancient",
    "planet-body-type": planet.bodyType || "Planet",
    "planet-volume": scientific(planet.vol, "vol", "km³"),
    "planet-perihelion": unit(planet.perihelion, "km"),
    "planet-aphelion": unit(planet.aphelion, "km"),
    "planet-eccentricity": number(planet.eccentricity, 5),
    "planet-inclination": unit(planet.inclination, "°"),
    "planet-axial-tilt": unit(planet.axialTilt, "°"),
    "planet-temp": unit(typeof planet.avgTemp === "number" ? planet.avgTemp - 273.15 : null, "°C"),
    "planet-escape": unit(typeof planet.escape === "number" ? planet.escape / 1000 : null, "km/s")
  };
  Object.entries(values).forEach(([key, value]) => { if ($(key)) $(key).textContent = value; });
  const facts = [`Planet ${planetOrder.indexOf(id) + 1} from the Sun`, planetType(id), `Orbital period: ${values["planet-orbital-period"]}`, `Known moons: ${values["planet-moons"]}`];
  $("planet-facts").innerHTML = facts.map((fact) => `<li>✓ ${escapeHTML(fact)}</li>`).join("");
  const favorite = $("planet-detail-name").parentElement.querySelector("button");
  if (favorite) favorite.dataset.favorite = `planet:${id}`;
  updateFavorites();
}

const planetsContent = $("planets-grid").nextElementSibling;
const comparisonContent = planetsContent ? planetsContent.nextElementSibling : null;
if (planetsContent) planetsContent.hidden = true;
if (comparisonContent) comparisonContent.hidden = true;
const planetState = document.createElement("div");
$("planets-grid").before(planetState);

async function loadPlanets() {
  if (planetsLoading) return;
  planetsLoading = true;
  stateBox(planetState, "Loading solar system data…");
  try {
    const data = await getJSON(PLANETS_URL, 86400);
    const bodies = Array.isArray(data) ? data : data.bodies || data.planets || data.data?.bodies || data.data?.planets || data.data;
    if (!Array.isArray(bodies)) throw new Error("Unexpected planets response. Please retry later.");
    planets = bodies.filter((body) => typeof body.englishName === "string" && planetOrder.includes(body.englishName.toLowerCase())).sort((a, b) => planetOrder.indexOf(a.englishName.toLowerCase()) - planetOrder.indexOf(b.englishName.toLowerCase()));
    if (!planets.length) throw new Error("No planet data was returned.");
    planetState.replaceChildren();
    if (planetsContent) planetsContent.hidden = false;
    if (comparisonContent) comparisonContent.hidden = false;
    $("planets-grid").innerHTML = planets.map((planet) => {
      const id = planet.englishName.toLowerCase();
      return `<button class="planet-card" data-planet-id="${id}" aria-pressed="false"><img src="./assets/images/${id}.png" alt="" class="planet-icon"><span>${escapeHTML(planet.englishName)}</span><br><small>${unit(typeof planet.semimajorAxis === "number" ? planet.semimajorAxis / 149597870.7 : null, "AU")}</small></button>`;
    }).join("");
    const earth = planets.find((p) => p.englishName === "Earth");
    const earthMass = earth?.mass ? earth.mass.massValue * 10 ** earth.mass.massExponent : null;
    if ($("planet-comparison-tbody")) {
      $("planet-comparison-tbody").innerHTML = planets.map((planet) => {
        const id = planet.englishName.toLowerCase();
        const mass = planet.mass ? planet.mass.massValue * 10 ** planet.mass.massExponent : null;
        const cells = [unit(typeof planet.semimajorAxis === "number" ? planet.semimajorAxis / 149597870.7 : null, "AU"), unit(typeof planet.meanRadius === "number" ? planet.meanRadius * 2 : null, "km"), number(mass !== null && earthMass ? mass / earthMass : null, 3), unit(planet.sideralOrbit, "days"), planet.moons?.length || 0, planetType(id)];
        return `<tr>
  <td><div class="comparison-planet">
    <img src="./assets/images/${id}.png" alt="">
    <span>${escapeHTML(planet.englishName)}</span>
  </div></td>
        ${cells.map((value) => `<td>${escapeHTML(value)}</td>`).join("")}</tr>`;
      }).join("");
    }
    showPlanet(planets.some((p) => p.englishName.toLowerCase() === selectedPlanet) ? selectedPlanet : planets[0].englishName.toLowerCase());
  } catch (error) {
    stateBox(planetState, error.message, loadPlanets);
  } finally { planetsLoading = false; }
}

$("planets-grid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-planet-id]");
  if (button) showPlanet(button.dataset.planetId);
});

const learnMoreBtn = [...$("planets").querySelectorAll("button")].find((button) => button.textContent.includes("Learn More"));
if (learnMoreBtn) {
  learnMoreBtn.addEventListener("click", () => {
    const planet = planets.find((p) => p.englishName.toLowerCase() === selectedPlanet);
    if (!planet) return;
    const moons = (planet.moons || []).map((moon) => moon.moon).filter(Boolean);
    showModal(planet.englishName, `<p>${escapeHTML(descriptions[selectedPlanet])}</p><p><strong>Classification:</strong> ${planetType(selectedPlanet)}</p><p><strong>Moons listed by the API:</strong> ${escapeHTML(moons.length ? moons.join(", ") : "None listed")}</p>`);
  });
}

$("featured-launch").replaceChildren();
$("launches-grid").replaceChildren();
$("launches-count").textContent = "Launches";
$("launches-count-mobile").textContent = "—";
updateDateLabel();
showSection(location.hash.slice(1));
loadAPOD(dateInput.value);
