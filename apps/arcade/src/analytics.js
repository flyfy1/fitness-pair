const MEASUREMENT_ID = 'G-H8EMFYZLZZ';
const PRODUCTION_HOSTNAME = 'fitness.integ.life';

function reportPath(pathname) {
  if (/^\/clips\/[^/]+\/?$/.test(pathname)) return '/clips/:id';
  return pathname;
}

export function installGoogleAnalytics() {
  if (location.hostname !== PRODUCTION_HOSTNAME) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.append(script);

  const pageLocation = new URL(reportPath(location.pathname), location.origin).href;
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, { page_location: pageLocation });
}
