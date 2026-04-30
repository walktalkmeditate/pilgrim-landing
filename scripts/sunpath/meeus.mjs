// Meeus Astronomical Algorithms, Ch. 27 — solstice + equinox UTC instants.
// Port of js/turnings.js to ESM for use in Node CLIs. Same numerics, same
// accuracy band (~1 minute, years 1000–3000).

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

const TURNING_INDEX = {
  'spring-equinox': 0,
  'summer-solstice': 1,
  'autumn-equinox': 2,
  'winter-solstice': 3
};

function deg2rad(d) { return d * Math.PI / 180; }

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

function jdeToDate(JDE) {
  return new Date((JDE - 2440587.5) * 86400000);
}

export function turningInstant(year, key) {
  const idx = TURNING_INDEX[key];
  if (idx === undefined) throw new Error(`unknown turning key: ${key}`);
  const JDE0 = meanJDE(year, idx);
  return jdeToDate(JDE0 + periodicCorrection(JDE0));
}

export function turningsForYear(year) {
  return {
    'spring-equinox':  turningInstant(year, 'spring-equinox'),
    'summer-solstice': turningInstant(year, 'summer-solstice'),
    'autumn-equinox':  turningInstant(year, 'autumn-equinox'),
    'winter-solstice': turningInstant(year, 'winter-solstice')
  };
}
