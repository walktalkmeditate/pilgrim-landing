// Solstice and equinox instants in UT, to within a few seconds of JPL
// Horizons, for the build. Meeus, Astronomical Algorithms, ch. 27.
//
// The chapter's mean instant plus 24 periodic terms is Terrestrial Time
// and still up to half a minute off, so it is only the first guess. As the
// chapter describes, the guess is then corrected until the sun's apparent
// longitude is exactly 0°, 90°, 180° or 270°, with that longitude computed
// from VSOP87 (ch. 25, 32), and ΔT turns the result into UT.
//
// js/turnings.js, the browser countdown, keeps the first guess alone: it
// names a day, and a minute never moves one.

const TABLE = {
  pre1000: [
    [1721139.29189, 365242.13740,  0.06134,  0.00111, -0.00071],
    [1721233.25401, 365241.72562, -0.05323,  0.00907,  0.00025],
    [1721325.70455, 365242.49558, -0.11677, -0.00297,  0.00074],
    [1721414.39987, 365242.88257, -0.00769, -0.00933, -0.00006]
  ],
  post1000: [
    [2451623.80984, 365242.37404,  0.05169, -0.00411, -0.00057],
    [2451716.56767, 365241.62603,  0.00325,  0.00888, -0.00030],
    [2451810.21715, 365242.01767, -0.11575,  0.00337,  0.00078],
    [2451900.05952, 365242.74049, -0.06223, -0.00823,  0.00032]
  ]
};

const PERIODIC = [
  [485, 324.96,   1934.136], [203, 337.23,  32964.467],
  [199, 342.08,     20.186], [182,  27.85, 445267.112],
  [156,  73.14,  45036.886], [136, 171.52,  22518.443],
  [ 77, 222.54,  65928.934], [ 74, 296.72,   3034.906],
  [ 70, 243.58,   9037.513], [ 58, 119.81,  33718.147],
  [ 52, 297.17,    150.678], [ 50,  21.02,   2281.226],
  [ 45, 247.54,  29929.562], [ 44, 325.15,  31555.956],
  [ 29,  60.93,   4443.417], [ 18, 155.12,  67555.328],
  [ 17, 288.79,   4562.452], [ 16, 198.04,  62894.029],
  [ 14, 199.76,  31436.921], [ 12,  95.39,  14577.848],
  [ 12, 287.11,  31931.756], [ 12, 320.81,  34777.259],
  [  9, 227.73,   1222.114], [  8,  15.45,  16859.074]
];

// The Earth's heliocentric longitude and distance, VSOP87D (Bretagnon and
// Francou 1988; CDS VI/81, VSOP87D.ear), referred to the ecliptic and
// equinox of the date: [A in 1e-8 rad or AU, B rad, C rad per millennium].
// Longitude keeps every term worth 2e-8 rad (0.004″) at τ = 0.03: the
// series is long-tailed, and this cut stays within 1.8 s of the full one
// at every turning from 2000 to 2100. Distance only scales the aberration.
const EARTH_L = [
  // L0
  [
    [175347046, 0, 0],
    [3341656, 4.6692568, 6283.07584999],
    [34894, 4.626102, 12566.1517],
    [3418, 2.82887, 3.52312],
    [3497, 2.74412, 5753.38488],
    [3136, 3.62767, 77713.77147],
    [2676, 4.41808, 7860.41939],
    [2343, 6.13516, 3930.2097],
    [1273, 2.0371, 529.69097],
    [1324, 0.74246, 11506.76977],
    [902, 2.0451, 26.2983],
    [1199, 1.10963, 1577.34354],
    [857, 3.5085, 398.149],
    [780, 1.1788, 5223.6939],
    [990, 5.2327, 5884.9268],
    [753, 2.5334, 5507.5532],
    [505, 4.5829, 18849.2275],
    [492, 4.2051, 775.5226],
    [357, 2.9195, 0.0673],
    [284, 1.8987, 796.298],
    [243, 0.3448, 5486.7778],
    [317, 5.849, 11790.6291],
    [271, 0.3149, 10977.0788],
    [206, 4.8065, 2544.3144],
    [205, 1.8695, 5573.1428],
    [202, 2.4577, 6069.7768],
    [126, 1.083, 20.7754],
    [156, 0.8331, 213.2991],
    [115, 0.6454, 0.9803],
    [103, 0.636, 4694.003],
    [102, 4.2668, 7.1135],
    [99, 6.21, 2146.165],
    [132, 3.4112, 2942.4634],
    [98, 0.681, 155.42],
    [85, 1.299, 6275.962],
    [75, 1.755, 5088.629],
    [102, 0.9757, 15720.8388],
    [85, 3.671, 71430.696],
    [74, 4.679, 801.821],
    [74, 3.503, 3154.687],
    [79, 3.037, 12036.461],
    [80, 1.808, 17260.155],
    [86, 5.983, 161000.686],
    [57, 2.784, 6286.599],
    [61, 1.818, 7084.897],
    [70, 0.833, 9437.763],
    [56, 4.387, 14143.495],
    [62, 3.978, 8827.39],
    [51, 0.283, 5856.478],
    [56, 3.47, 6279.553],
    [41, 5.368, 8429.241],
    [52, 1.333, 1748.016],
    [52, 0.189, 12139.554],
    [49, 0.487, 1194.447],
    [39, 6.168, 10447.388],
    [36, 1.776, 6812.767],
    [37, 6.041, 10213.286],
    [37, 2.57, 1059.382],
    [33, 0.593, 17789.846],
    [36, 1.709, 2352.866],
    [41, 2.399, 19651.048],
    [30, 2.74, 1349.867],
    [30, 0.443, 83996.847],
    [24, 0.485, 8031.092],
    [24, 2.065, 3340.612],
    [21, 4.148, 951.718],
    [25, 0.215, 3.59],
    [25, 3.165, 4690.48],
    [23, 5.222, 4705.732],
    [21, 1.426, 16730.464],
    [22, 5.556, 553.569],
    [17, 4.561, 135.065],
    [20, 5.222, 12168.003],
    [20, 5.775, 6309.374],
    [20, 0.371, 283.859],
    [14, 4.193, 242.729],
    [16, 5.988, 11769.854],
    [15, 4.196, 6256.778],
    [19, 3.822, 23581.258],
    [19, 5.386, 149854.4],
    [14, 3.724, 38.028],
    [18, 2.215, 13367.973],
    [12, 2.622, 955.6],
    [11, 0.177, 4164.312],
    [14, 4.401, 6681.225],
    [14, 1.889, 7632.943],
    [13, 1.131, 5.523],
    [10, 5.359, 1592.596],
    [10, 0.999, 11371.705],
    [9, 4.571, 4292.331],
    [10, 6.2, 6438.496],
    [12, 1.004, 632.784],
    [11, 0.327, 103.093],
    [8, 4.539, 25132.303],
    [10, 6.029, 5746.271],
    [8, 3.299, 7234.794],
    [8, 5.821, 28.449],
    [11, 0.939, 11926.254],
    [8, 3.121, 7238.676],
    [9, 2.624, 5760.498],
    [8, 6.112, 4732.031],
    [9, 0.483, 522.577],
    [10, 5.244, 27511.468],
    [8, 0.996, 5643.179],
    [8, 6.271, 426.598],
    [9, 5.337, 6386.169],
    [9, 4.165, 7058.598],
    [6, 4.717, 6836.645],
    [8, 3.974, 11499.656],
    [8, 2.957, 23013.54],
    [7, 0.607, 11513.883],
    [6, 2.876, 6283.143],
    [7, 5.791, 18073.705],
    [7, 3.998, 74.782],
    [7, 4.386, 316.392],
    [5, 5.392, 419.485],
    [5, 2.361, 10973.556],
    [7, 0.323, 263.084],
    [7, 3.665, 17298.182],
    [7, 5.911, 90955.552],
    [5, 5.737, 9917.697],
    [6, 2.452, 12352.853],
    [6, 3.321, 6283.009],
    [4, 2.064, 7079.374],
    [6, 1.458, 233141.314],
    [4, 4.423, 5216.58],
    [6, 1.075, 19804.827],
    [4, 3.653, 206.186],
    [4, 0.84, 20.355],
    [5, 4.065, 6208.294],
    [5, 0.382, 31441.678],
    [4, 2.344, 3.881],
    [4, 3.272, 11015.106],
    [4, 0.921, 3738.761],
    [4, 5.978, 3894.182],
    [4, 1.906, 245.832],
    [4, 5.031, 536.805],
    [4, 1.826, 11856.219],
    [4, 1.018, 16200.773],
    [3, 0.978, 8635.942],
    [4, 2.954, 3128.389],
    [4, 3.713, 6290.189],
    [3, 3.646, 10.637],
    [3, 1.106, 14712.317],
    [3, 0.837, 6496.375],
    [3, 2.585, 14314.168],
    [4, 1.083, 88860.057],
    [3, 3.202, 5120.601],
    [3, 3.479, 6133.513],
    [3, 3.949, 1990.745],
    [4, 2.056, 244287.6],
    [3, 1.561, 23543.231],
    [3, 3.856, 266.607],
    [3, 3.397, 9225.539],
    [3, 6.026, 154717.61],
    [2, 1.161, 10984.192],
    [3, 1.328, 10873.986],
    [3, 5.089, 21228.392],
    [2, 4.272, 6040.347],
    [3, 1.802, 35371.887],
    [2, 3.577, 10969.965],
    [3, 2.579, 22483.849],
    [2, 3.714, 65147.62],
    [2, 0.814, 170.673],
    [2, 0.381, 6172.87],
    [3, 3.744, 10575.407],
    [2, 0.106, 7.046],
    [2, 4.228, 5650.292],
    [2, 0.754, 13521.751],
    [2, 4.629, 6037.244]
  ],
  // L1
  [
    [628331966747, 0, 0],
    [206059, 2.6782346, 6283.07585],
    [4303, 2.63513, 12566.1517],
    [425, 1.5905, 3.5231],
    [109, 2.9662, 1577.3435],
    [93, 2.592, 18849.228],
    [119, 5.7956, 26.2983],
    [72, 1.138, 529.691],
    [68, 1.875, 398.149],
    [67, 4.409, 5507.553]
  ],
  // L2
  [
    [52919, 0, 0],
    [8720, 1.0721, 6283.07585]
  ]
];
const EARTH_R = [
  [[100013989, 0, 0], [1670700, 3.09846351, 6283.07584999], [13956, 3.055246, 12566.1517]],
  [[103019, 1.1074897, 6283.07585]]
];

// Nutation in longitude, IAU 1980 (Meeus table 22.A), every term of
// 0.003″ or more: [D, M, M′, F, Ω, sine coefficient and its rate in 0.0001″].
const NUTATION = [
  [0, 0, 0, 0, 1, -171996, -174.2],
  [-2, 0, 0, 2, 2, -13187, -1.6],
  [0, 0, 0, 2, 2, -2274, -0.2],
  [0, 0, 0, 0, 2, 2062, 0.2],
  [0, 1, 0, 0, 0, 1426, -3.4],
  [0, 0, 1, 0, 0, 712, 0.1],
  [-2, 1, 0, 2, 2, -517, 1.2],
  [0, 0, 0, 2, 1, -386, -0.4],
  [0, 0, 1, 2, 2, -301, 0],
  [-2, -1, 0, 2, 2, 217, -0.5],
  [-2, 0, 1, 0, 0, -158, 0],
  [-2, 0, 0, 2, 1, 129, 0.1],
  [0, 0, -1, 2, 2, 123, 0],
  [2, 0, 0, 0, 0, 63, 0],
  [0, 0, 1, 0, 1, 63, 0.1],
  [2, 0, -1, 2, 2, -59, 0],
  [0, 0, -1, 0, 1, -58, -0.1],
  [0, 0, 1, 2, 1, -51, 0],
  [-2, 0, 2, 0, 0, 48, 0],
  [0, 0, -2, 2, 1, 46, 0],
  [2, 0, 0, 2, 2, -38, 0],
  [0, 0, 2, 2, 2, -31, 0]
];

// ΔT = TT − UT in seconds. JPL Horizons, the reference these instants are
// tested against, carries 69.18 s through 2029: TT − UTC with today's 37
// leap seconds, within a second of the measured ΔT since the Earth's
// rotation sped up after 2016. The Espenak–Meeus 2005–2050 parabola that
// NASA's eclipse tables use predicts 75.7 s for 2026, six seconds high, so
// only its growth after 2030 is added. Nothing here computes a turning
// before 2025.
const DELTA_T_NOW = 69.18;
function espenakMeeus(year) {
  const t = year - 2000;
  return 62.92 + 0.32217 * t + 0.005589 * t * t;
}
function deltaT(year) {
  return DELTA_T_NOW + Math.max(0, espenakMeeus(year) - espenakMeeus(2030));
}

const TURNING_INDEX = {
  'spring-equinox': 0,
  'summer-solstice': 1,
  'autumn-equinox': 2,
  'winter-solstice': 3
};

const DEG = Math.PI / 180;
function deg2rad(d) { return d * DEG; }

function meanJDE(year, idx) {
  let coeffs, Y;
  if (year < 1000) {
    Y = year / 1000;
    coeffs = TABLE.pre1000[idx];
  } else {
    Y = (year - 2000) / 1000;
    coeffs = TABLE.post1000[idx];
  }
  const Y2 = Y * Y;
  return coeffs[0] + coeffs[1] * Y + coeffs[2] * Y2 + coeffs[3] * Y2 * Y + coeffs[4] * Y2 * Y2;
}

function periodicCorrection(JDE0) {
  const T = (JDE0 - 2451545.0) / 36525;
  const W = deg2rad(35999.373 * T - 2.47);
  const dLambda = 1 + 0.0334 * Math.cos(W) + 0.0007 * Math.cos(2 * W);
  let S = 0;
  for (const [A, B, C] of PERIODIC) {
    S += A * Math.cos(deg2rad(B + C * T));
  }
  return 0.00001 * S / dLambda;
}

function vsop(series, tau) {
  let sum = 0, power = 1;
  for (const terms of series) {
    let s = 0;
    for (const [A, B, C] of terms) s += A * Math.cos(B + C * tau);
    sum += s * power;
    power *= tau;
  }
  return sum * 1e-8;
}

// Degrees; T in Julian centuries from J2000.
function nutationInLongitude(T) {
  const D = 297.85036 + T * (445267.111480 + T * (-0.0019142 + T / 189474));
  const M = 357.52772 + T * (35999.050340 + T * (-0.0001603 - T / 300000));
  const Mp = 134.96298 + T * (477198.867398 + T * (0.0086972 + T / 56250));
  const F = 93.27191 + T * (483202.017538 + T * (-0.0036825 + T / 327270));
  const O = 125.04452 + T * (-1934.136261 + T * (0.0020708 + T / 450000));
  let s = 0;
  for (const [d, m, mp, f, o, a, b] of NUTATION) {
    s += (a + b * T) * Math.sin(deg2rad(d * D + m * M + mp * Mp + f * F + o * O));
  }
  return s * 1e-4 / 3600;
}

// The sun's apparent geocentric longitude in degrees (Meeus 25.9–25.10):
// the Earth's longitude turned round, shifted to the FK5 system, then
// nutation and aberration. Against JPL Horizons the full VSOP87 series
// done this way lands every turning 2.5 s early, about 0.1″, which is the
// size of the IERS's measured correction to the 1980 nutation that
// Horizons applies and this does not.
function apparentLongitude(jde) {
  const tau = (jde - 2451545) / 365250;
  const geometric = vsop(EARTH_L, tau) / DEG + 180;
  const fk5 = -0.09033 / 3600;
  const aberration = -20.4898 / 3600 / vsop(EARTH_R, tau);
  return geometric + fk5 + nutationInLongitude(tau * 10) + aberration;
}

function jdeToDate(JDE) {
  return new Date((JDE - 2440587.5) * 86400000);
}

export function turningInstant(year, key) {
  const idx = TURNING_INDEX[key];
  if (idx === undefined) throw new Error(`unknown turning key: ${key}`);
  const JDE0 = meanJDE(year, idx);
  let jde = JDE0 + periodicCorrection(JDE0);
  // Meeus 27: the sun covers 360° in about 365.24 days, so a longitude
  // short of its mark by x is 58·sin(x) days early.
  for (let i = 0; i < 10; i++) {
    const step = 58 * Math.sin(deg2rad(idx * 90 - apparentLongitude(jde)));
    jde += step;
    if (Math.abs(step) < 1e-8) break;
  }
  const decimalYear = 2000 + (jde - 2451545) / 365.25;
  return new Date(jdeToDate(jde).getTime() - deltaT(decimalYear) * 1000);
}

export function turningsForYear(year) {
  return {
    'spring-equinox':  turningInstant(year, 'spring-equinox'),
    'summer-solstice': turningInstant(year, 'summer-solstice'),
    'autumn-equinox':  turningInstant(year, 'autumn-equinox'),
    'winter-solstice': turningInstant(year, 'winter-solstice')
  };
}
