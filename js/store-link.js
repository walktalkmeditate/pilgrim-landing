// Route single-CTA "Walk with Pilgrim" links to the correct store per platform.
// HTML pattern:
//   <a href="<App Store URL>"
//      data-android-href="<Play Store URL>"
//      data-umami-event="click-app-store"
//      data-android-umami-event="click-google-play">…</a>
(function () {
  if (!/Android/i.test(navigator.userAgent)) return;
  document.querySelectorAll('a[data-android-href]').forEach(function (a) {
    a.href = a.dataset.androidHref;
    if (a.dataset.androidUmamiEvent) {
      a.dataset.umamiEvent = a.dataset.androidUmamiEvent;
    }
  });
})();
