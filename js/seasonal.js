const SEASONAL = {
  springPeakDay: 105,
  summerPeakDay: 196,
  autumnPeakDay: 288,
  winterPeakDay: 15,
  spread: 91,

  springHue: 0.02,
  summerHue: 0.01,
  autumnHue: 0.03,
  winterHue: -0.02,

  springSaturation: 0.10,
  summerSaturation: 0.15,
  autumnSaturation: 0.05,
  winterSaturation: -0.15,

  springBrightness: 0.05,
  summerBrightness: 0.03,
  autumnBrightness: -0.03,
  winterBrightness: -0.05
};

const TIME_OF_DAY = {
  dawn:       { hue: 0.01,  saturation: 0,     brightness: 0.05  },
  day:        { hue: 0,     saturation: 0,     brightness: 0     },
  goldenHour: { hue: 0.02,  saturation: 0.03,  brightness: 0     },
  dusk:       { hue: -0.01, saturation: 0,     brightness: -0.05 },
  night:      { hue: -0.02, saturation: -0.10, brightness: -0.08 }
};

const BASE_COLORS = {
  light: {
    parchment:          { h: 37, s: 38, l: 87 },
    'parchment-secondary': { h: 37, s: 33, l: 84 },
    'parchment-tertiary':  { h: 37, s: 30, l: 79 },
    ink:                { h: 27, s: 24, l: 15 },
    stone:              { h: 30, s: 25, l: 44 },
    moss:               { h: 100, s: 13, l: 49 },
    rust:               { h: 16, s: 38, l: 46 },
    dawn:               { h: 27, s: 42, l: 59 },
    fog:                { h: 33, s: 10, l: 68 }
  },
  dark: {
    parchment:          { h: 30, s: 21, l: 9 },
    'parchment-secondary': { h: 30, s: 24, l: 12 },
    'parchment-tertiary':  { h: 30, s: 24, l: 15 },
    ink:                { h: 37, s: 38, l: 91 },
    stone:              { h: 30, s: 33, l: 58 },
    moss:               { h: 120, s: 10, l: 62 },
    rust:               { h: 16, s: 38, l: 58 },
    dawn:               { h: 27, s: 42, l: 65 },
    fog:                { h: 30, s: 10, l: 38 }
  }
};

const SHIFT_INTENSITY = {
  parchment: 0.1,
  'parchment-secondary': 0.1,
  'parchment-tertiary': 0.1,
  ink: 0.1,
  stone: 1.0,
  moss: 1.0,
  rust: 1.0,
  dawn: 1.0,
  fog: 0.4
};

function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function seasonalWeight(dayOfYear, peakDay, spread) {
  const distance = Math.min(
    Math.abs(dayOfYear - peakDay),
    365 - Math.abs(dayOfYear - peakDay)
  );
  const normalized = distance / spread;
  const w = Math.max(0, Math.cos(normalized * Math.PI / 2));
  return w * w;
}

function getSeasonalTransform(date) {
  const day = getDayOfYear(date);

  const spring = seasonalWeight(day, SEASONAL.springPeakDay, SEASONAL.spread);
  const summer = seasonalWeight(day, SEASONAL.summerPeakDay, SEASONAL.spread);
  const autumn = seasonalWeight(day, SEASONAL.autumnPeakDay, SEASONAL.spread);
  const winter = seasonalWeight(day, SEASONAL.winterPeakDay, SEASONAL.spread);

  return {
    hueDelta:
      spring * SEASONAL.springHue +
      summer * SEASONAL.summerHue +
      autumn * SEASONAL.autumnHue +
      winter * SEASONAL.winterHue,
    saturationMultiplier: 1.0 + (
      spring * SEASONAL.springSaturation +
      summer * SEASONAL.summerSaturation +
      autumn * SEASONAL.autumnSaturation +
      winter * SEASONAL.winterSaturation
    ),
    brightnessMultiplier: 1.0 + (
      spring * SEASONAL.springBrightness +
      summer * SEASONAL.summerBrightness +
      autumn * SEASONAL.autumnBrightness +
      winter * SEASONAL.winterBrightness
    )
  };
}

function getTimeOfDayModifier(hour) {
  if (hour >= 6 && hour < 10) return TIME_OF_DAY.dawn;
  if (hour >= 10 && hour < 16) return TIME_OF_DAY.day;
  if (hour >= 16 && hour < 19) return TIME_OF_DAY.goldenHour;
  if (hour >= 19 && hour < 22) return TIME_OF_DAY.dusk;
  return TIME_OF_DAY.night;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;

  let r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function applySeasonalColors() {
  const now = new Date();
  const transform = getSeasonalTransform(now);
  const timeModifier = getTimeOfDayModifier(now.getHours());
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const palette = isDark ? BASE_COLORS.dark : BASE_COLORS.light;

  for (const [name, base] of Object.entries(palette)) {
    const scale = SHIFT_INTENSITY[name] || 0.1;

    const h = base.h + (transform.hueDelta * scale * 360) + (timeModifier.hue * scale * 360);
    const s = base.s * (1 + (transform.saturationMultiplier - 1) * scale) * (1 + timeModifier.saturation * scale);
    const l = base.l * (1 + (transform.brightnessMultiplier - 1) * scale) * (1 + timeModifier.brightness * scale);

    document.documentElement.style.setProperty('--' + name, hslToHex(h, s, l));
  }
}

function getCurrentSeason() {
  const day = getDayOfYear(new Date());
  const seasons = [
    { name: 'spring', peak: SEASONAL.springPeakDay },
    { name: 'summer', peak: SEASONAL.summerPeakDay },
    { name: 'autumn', peak: SEASONAL.autumnPeakDay },
    { name: 'winter', peak: SEASONAL.winterPeakDay }
  ];

  let closest = seasons[0];
  let minDist = Infinity;
  for (const s of seasons) {
    const dist = Math.min(Math.abs(day - s.peak), 365 - Math.abs(day - s.peak));
    if (dist < minDist) {
      minDist = dist;
      closest = s;
    }
  }
  return closest.name;
}

window.SeasonalEngine = { applySeasonalColors, getCurrentSeason };
