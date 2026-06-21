// weather app script
// uses open-meteo API - free, no key needed
// I stored the last weather data so the unit toggle doesn't need to re-fetch

let lastWeatherData = null;
let lastCity = { name: '', country: '' };
let currentUnit = 'C';

// fetch lat/lon for a city name
async function getCoordinates(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error('Could not connect to location service, try again.');
  }

  const data = await res.json();

  if (!data.results || data.results.length === 0) {
    throw new Error(`Couldn't find "${city}". Check the spelling and try again.`);
  }

  const { name, country, latitude, longitude } = data.results[0];
  return { name, country, latitude, longitude };
}

// fetch current weather + 5 day forecast using coordinates
async function getWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code,uv_index_max&timezone=auto`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error('Failed to get weather data. Please try again.');
  }

  return res.json();
}

// update the hero + stats section with current weather
function displayCurrentWeather(data, cityName, country) {
  const { temperature_2m, relative_humidity_2m, wind_speed_10m, weather_code } = data.current;
  const { icon, description, animClass } = getWeatherInfo(weather_code);

  const tempC = Math.round(temperature_2m);
  const displayTemp = currentUnit === 'F' ? toFahrenheit(tempC) : tempC;
  const unit = currentUnit === 'F' ? '°F' : '°C';

  document.getElementById('weatherIcon').textContent = icon;
  document.getElementById('cityName').textContent = cityName;
  document.getElementById('countryName').textContent = country;
  document.getElementById('temperature').textContent = `${displayTemp}${unit}`;
  document.getElementById('weatherDesc').textContent = description;
  document.getElementById('humidity').textContent = `${relative_humidity_2m}%`;
  document.getElementById('windSpeed').textContent = `${Math.round(wind_speed_10m)} km/h`;

  // UV comes from daily index 0 (today)
  const uv = data.daily?.uv_index_max?.[0];
  document.getElementById('uvIndex').textContent = uv !== undefined ? uv.toFixed(1) : '—';

  // apply animation class to icon
  const iconEl = document.getElementById('weatherIcon');
  iconEl.className = 'hero__icon';
  if (animClass) iconEl.classList.add(animClass);

  show('heroSection');
  show('statsSection');
}

// build the 5-day forecast cards
function displayForecast(daily) {
  const grid = document.getElementById('forecastGrid');
  grid.innerHTML = '';

  for (let i = 0; i < 5; i++) {
    const { icon } = getWeatherInfo(daily.weather_code[i]);

    const highC = Math.round(daily.temperature_2m_max[i]);
    const lowC = Math.round(daily.temperature_2m_min[i]);
    const high = currentUnit === 'F' ? toFahrenheit(highC) : highC;
    const low = currentUnit === 'F' ? toFahrenheit(lowC) : lowC;
    const unit = currentUnit === 'F' ? '°F' : '°C';

    const dayLabel = i === 0 ? 'Today' : new Date(daily.time[i] + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' });

    const card = document.createElement('div');
    card.className = 'forecast__card';
    card.innerHTML = `
      <p class="forecast__day">${dayLabel}</p>
      <p class="forecast__icon">${icon}</p>
      <p class="forecast__high">${high}${unit}</p>
      <p class="forecast__low">${low}${unit}</p>
    `;
    grid.appendChild(card);
  }

  show('forecastSection');
}

// map WMO weather code to icon, description and animation class
function getWeatherInfo(code) {
  if (code === 0) return { icon: '☀️', description: 'Clear sky', animClass: 'spin' };
  if (code >= 1 && code <= 3) return { icon: '⛅', description: 'Partly cloudy', animClass: null };
  if (code === 45 || code === 48) return { icon: '🌫️', description: 'Foggy', animClass: null };
  if (code >= 51 && code <= 55) return { icon: '🌦️', description: 'Drizzle', animClass: 'bounce' };
  if (code >= 61 && code <= 65) return { icon: '🌧️', description: 'Rain', animClass: 'bounce' };
  if (code >= 71 && code <= 75) return { icon: '❄️', description: 'Snow', animClass: null };
  if (code >= 80 && code <= 82) return { icon: '🌦️', description: 'Rain showers', animClass: 'bounce' };
  if (code === 95) return { icon: '⛈️', description: 'Thunderstorm', animClass: null };
  return { icon: '🌡️', description: 'Unknown', animClass: null };
}

// show error and hide weather content
function showError(message) {
  const el = document.getElementById('errorMsg');
  el.textContent = message;
  el.removeAttribute('hidden');
  hide('heroSection');
  hide('statsSection');
  hide('forecastSection');
}

function toFahrenheit(c) {
  return Math.round((c * 9) / 5 + 32);
}

// shorthand show/hide helpers
function show(id) { document.getElementById(id).removeAttribute('hidden'); }
function hide(id) { document.getElementById(id).setAttribute('hidden', ''); }

// main function called by the search button
async function handleSearch(coordsOverride = null) {
  hide('errorMsg');

  let city;
  if (!coordsOverride) {
    city = document.getElementById('cityInput').value.trim();
    if (!city) {
      showError('Please enter a city name.');
      return;
    }
  }

  show('loadingMsg');
  hide('heroSection');
  hide('statsSection');
  hide('forecastSection');

  try {
    const coords = coordsOverride ?? await getCoordinates(city);
    const weatherData = await getWeather(coords.latitude, coords.longitude);

    lastWeatherData = weatherData;
    lastCity = { name: coords.name, country: coords.country };
    currentUnit = 'C';
    updateToggleLabel();

    displayCurrentWeather(weatherData, coords.name, coords.country);
    displayForecast(weatherData.daily);

    if (!coordsOverride) saveHistory(coords.name);

  } catch (err) {
    showError(err.message);
  } finally {
    hide('loadingMsg');
  }
}

// bonus: try to get user's location on page load
function initGeolocation() {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      try {
        const weatherData = await getWeather(latitude, longitude);
        lastWeatherData = weatherData;
        lastCity = { name: 'Your Location', country: '' };
        currentUnit = 'C';
        updateToggleLabel();
        displayCurrentWeather(weatherData, 'Your Location', '');
        displayForecast(weatherData.daily);
        hide('loadingMsg');
      } catch (err) {
        hide('loadingMsg');
      }
    },
    () => {} // user denied, just do nothing
  );
}

// bonus: switch between celsius and fahrenheit without re-fetching
function toggleUnit() {
  if (!lastWeatherData) return;
  currentUnit = currentUnit === 'C' ? 'F' : 'C';
  updateToggleLabel();
  displayCurrentWeather(lastWeatherData, lastCity.name, lastCity.country);
  displayForecast(lastWeatherData.daily);
}

function updateToggleLabel() {
  const btn = document.getElementById('unitToggleBtn');
  if (btn) btn.textContent = currentUnit === 'C' ? 'Switch to °F' : 'Switch to °C';
}

// adds the toggle button to the hero section (only once)
function buildToggleButton() {
  if (document.getElementById('unitToggleBtn')) return;
  const hero = document.getElementById('heroSection');
  const btn = document.createElement('button');
  btn.id = 'unitToggleBtn';
  btn.className = 'unit-toggle';
  btn.textContent = 'Switch to °F';
  btn.onclick = toggleUnit;
  hero.appendChild(btn);
}

// bonus: save last 5 searched cities to localStorage
function saveHistory(cityName) {
  let history = getHistory();
  history = history.filter(c => c.toLowerCase() !== cityName.toLowerCase());
  history.unshift(cityName);
  if (history.length > 5) history = history.slice(0, 5);
  localStorage.setItem('weatherHistory', JSON.stringify(history));
  renderHistory();
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem('weatherHistory')) ?? [];
  } catch {
    return [];
  }
}

// draw the history chips below the search bar
function renderHistory() {
  const history = getHistory();
  const chips = document.getElementById('historyChips');

  if (history.length === 0) {
    hide('historySection');
    return;
  }

  chips.innerHTML = '';
  history.forEach(city => {
    const chip = document.createElement('button');
    chip.className = 'history__chip';
    chip.textContent = city;
    chip.onclick = () => {
      document.getElementById('cityInput').value = city;
      handleSearch();
    };
    chips.appendChild(chip);
  });

  show('historySection');
}

// allow pressing Enter to search
document.getElementById('cityInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSearch();
});

// run on page load
buildToggleButton();
renderHistory();
initGeolocation();
